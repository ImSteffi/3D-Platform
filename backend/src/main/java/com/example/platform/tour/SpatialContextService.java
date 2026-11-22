package com.example.platform.tour;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import com.example.platform.user.User;
import com.example.platform.user.UserRepository;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import tools.jackson.databind.JsonNode;

/**
 * Spatial context for one floor (operator only): the floor's photos go to Atlas images2PosedRGBD,
 * which returns a camera and a depth map per photo.
 *
 * Everything runs on the server, so the browser can be closed at any time: starting only records the run;
 * a background job uploads the photos and submits the task, and a timer follows Atlas until it is done and
 * copies the cameras, depth and confidence maps into our own storage.
 */
@Service
public class SpatialContextService {
    static final int MAX_FRAMES = TourRequestService.MAX_POINTS_PER_GROUP;
    private static final Logger log = LoggerFactory.getLogger(SpatialContextService.class);
    private static final Duration POLL = Duration.ofSeconds(20);

    private final TourRequestRepository tours;
    private final TourAreaRepository areas;
    private final CapturePointRepository points;
    private final FloorPhotoRepository floorPhotos;
    private final SpatialContextRunRepository runs;
    private final SpatialContextFrameRepository frames;
    private final UserRepository users;
    private final AtlasClient atlas;
    private final S3Client r2;
    private final String bucket;
    private final TransactionTemplate transaction;

    /** Uploads to Atlas, a few at a time across all floors. */
    private final ExecutorService uploads = Executors.newFixedThreadPool(2, daemon("spatial-upload"));
    private final ScheduledExecutorService poller = Executors.newSingleThreadScheduledExecutor(daemon("spatial-poll"));
    /** Runs whose photos are being uploaded right now, with how many are done. */
    private final Map<Long, Integer> uploading = new ConcurrentHashMap<>();
    /** Runs being refreshed right now, so two readers never store the same result twice. */
    private final Set<Long> refreshing = ConcurrentHashMap.newKeySet();

    public SpatialContextService(TourRequestRepository tours, TourAreaRepository areas, CapturePointRepository points,
            FloorPhotoRepository floorPhotos, SpatialContextRunRepository runs, SpatialContextFrameRepository frames, UserRepository users,
            AtlasClient atlas, S3Client r2, @Value("${storage.r2.bucket-name}") String bucket, PlatformTransactionManager transactions) {
        this.tours = tours;
        this.areas = areas;
        this.points = points;
        this.floorPhotos = floorPhotos;
        this.runs = runs;
        this.frames = frames;
        this.users = users;
        this.atlas = atlas;
        this.r2 = r2;
        this.bucket = bucket;
        this.transaction = new TransactionTemplate(transactions);
    }

    /**
     * After a restart: a run that was still uploading lost its upload (it lived in this process), so it is
     * marked failed and can be tried again. Runs already at Atlas are followed by the timer as usual.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void resume() {
        transaction.executeWithoutResult(status -> runs.findByStatus(SpatialContextRun.Status.RUNNING).stream()
                .filter(run -> run.getOperationId() == null)
                .forEach(run -> run.fail("The upload to Atlas was interrupted by a server restart. Please try again.")));
        poller.scheduleWithFixedDelay(this::pollAll, POLL.toSeconds(), POLL.toSeconds(), TimeUnit.SECONDS);
    }

    @PreDestroy
    void stop() {
        uploads.shutdownNow();
        poller.shutdownNow();
    }

    /** Records the run and hands the upload to a background job; returns at once. */
    public Result start(Long tourId, Long areaId, Authentication authentication) {
        admin(authentication);
        if (!atlas.configured())
            throw error(503, "Spatial context is not set up on this server: WLT_API_KEY is missing.");
        Long runId;
        List<String> keys;
        // One start at a time, so two clicks (or two people) cannot start the same floor twice.
        synchronized (this) {
            runId = transaction.execute(status -> {
                var area = area(tourId, areaId);
                var latest = runs.findByArea_IdOrderByIdDesc(areaId).stream().findFirst().orElse(null);
                if (latest != null && latest.getStatus() == SpatialContextRun.Status.RUNNING)
                    throw error(409, "Spatial context is already running for this floor.");
                var photos = sources(areaId);
                if (photos.isEmpty()) throw error(409, "This floor has no photos yet.");
                if (photos.size() > MAX_FRAMES) throw error(409, "Spatial context takes at most " + MAX_FRAMES + " photos.");
                var run = runs.save(new SpatialContextRun(area));
                for (int i = 0; i < photos.size(); i++) frames.save(new SpatialContextFrame(run, i, photos.get(i).point()));
                return run.getId();
            });
            keys = transaction.execute(status -> sources(areaId).stream().map(Source::key).toList());
            uploading.put(runId, 0);
        }
        uploads.submit(() -> upload(runId, areaId, keys));
        return transaction.execute(status -> {
            var run = runs.findById(runId).orElseThrow();
            return result(run.getArea(), run, frames.findByRun_IdOrderByFrameIndexAsc(runId));
        });
    }

    /** Background job: copies each photo from our storage to Atlas, then submits the task. */
    private void upload(Long runId, Long area, List<String> keys) {
        try {
            var assetIds = new ArrayList<String>();
            for (int i = 0; i < keys.size(); i++) {
                var key = keys.get(i);
                var bytes = r2.getObjectAsBytes(b -> b.bucket(bucket).key(key)).asByteArray();
                var type = TourRequestService.imageType(bytes);
                if (type == null) throw new AtlasClient.AtlasException("Photo " + (i + 1) + " is not a JPG, PNG or WebP image.");
                var name = String.format("area-%d-photo-%02d.%s", area, i + 1, type.substring(6));
                assetIds.add(atlas.uploadAsset(name, type, bytes));
                uploading.put(runId, i + 1);
            }
            // A new key for every run: run numbers repeat between servers that share the Atlas account.
            var operation = atlas.submitPosedRgbd(assetIds, "spatial-context-" + UUID.randomUUID());
            transaction.executeWithoutResult(status -> runs.findById(runId).ifPresent(run -> run.setOperationId(operation)));
        } catch (AtlasClient.AtlasException | SdkException failure) {
            failRun(runId, failure.getMessage());
        } catch (RuntimeException failure) {
            log.error("Spatial context upload for run {} failed", runId, failure);
            failRun(runId, "The upload failed: " + failure.getMessage());
        } finally {
            uploading.remove(runId);
        }
    }

    private void failRun(Long runId, String message) {
        transaction.executeWithoutResult(status -> runs.findById(runId).ifPresent(run -> run.fail(message)));
    }

    /** Timer: follows every run at Atlas, so results arrive with nobody on the page. */
    private void pollAll() {
        try {
            var waiting = transaction.execute(status -> runs.findByStatus(SpatialContextRun.Status.RUNNING).stream()
                    .filter(run -> run.getOperationId() != null).map(SpatialContextRun::getId).toList());
            for (var runId : waiting) refresh(runId);
        } catch (RuntimeException failure) {
            log.warn("Polling spatial context runs failed", failure);
        }
    }

    /** The floor's newest run, refreshed from Atlas while it is running. */
    public Result status(Long tourId, Long areaId, Authentication authentication) {
        admin(authentication);
        var latest = transaction.execute(status -> {
            area(tourId, areaId);
            return runs.findByArea_IdOrderByIdDesc(areaId).stream().findFirst().map(SpatialContextRun::getId).orElse(null);
        });
        if (latest != null) refresh(latest);
        return transaction.execute(status -> {
            var area = area(tourId, areaId);
            if (latest == null) return result(area, null, List.of());
            var run = runs.findById(latest).orElseThrow();
            return result(area, run, frames.findByRun_IdOrderByFrameIndexAsc(run.getId()));
        });
    }

    /** One stored output file of a finished run: image, depth or confidence. */
    public File file(Long tourId, Long areaId, Long runId, int frameIndex, String kind, Authentication authentication) {
        admin(authentication);
        var key = transaction.execute(status -> {
            area(tourId, areaId);
            var run = runs.findById(runId).orElseThrow(() -> error(404, "Spatial context not found."));
            if (!run.getArea().getId().equals(areaId)) throw error(404, "Spatial context not found.");
            var frame = frames.findByRun_IdOrderByFrameIndexAsc(runId).stream()
                    .filter(entry -> entry.getFrameIndex() == frameIndex).findFirst()
                    .orElseThrow(() -> error(404, "Frame not found."));
            return switch (kind) {
                case "image" -> frame.getImageObjectKey();
                case "depth" -> frame.getDepthObjectKey();
                case "confidence" -> frame.getConfidenceObjectKey();
                default -> throw error(404, "Unknown file.");
            };
        });
        if (key == null) throw error(404, "This file is not available.");
        var object = r2.getObjectAsBytes(b -> b.bucket(bucket).key(key));
        var type = object.response().contentType();
        return new File(object.asByteArray(), type == null ? "application/octet-stream" : type);
    }

    /** Asks Atlas once about a running run; when it is done, stores the result. Never two at once for one run. */
    private void refresh(Long runId) {
        if (!refreshing.add(runId)) return;
        try {
            transaction.executeWithoutResult(status -> {
                var run = runs.findById(runId).orElse(null);
                if (run == null || run.getStatus() != SpatialContextRun.Status.RUNNING) return;
                // Still uploading in the background: nothing to ask Atlas yet.
                if (run.getOperationId() == null) {
                    if (!uploading.containsKey(runId)) run.fail("The upload to Atlas was interrupted. Please try again.");
                    return;
                }
                fetch(run.getArea(), run, frames.findByRun_IdOrderByFrameIndexAsc(runId));
            });
        } finally {
            refreshing.remove(runId);
        }
    }

    private void fetch(TourArea area, SpatialContextRun run, List<SpatialContextFrame> entries) {
        try {
            var operation = atlas.operation(run.getOperationId());
            if (!operation.path("done").asBoolean(false)) return;
            var failure = operation.get("error");
            if (failure != null && !failure.isNull()) {
                var message = AtlasClient.text(failure, "message");
                run.fail("Atlas could not place these photos: " + (message != null ? message : failure.toString()));
                return;
            }
            var outputs = operation.path("response").path("frames");
            if (!outputs.isArray() || outputs.size() != entries.size()) {
                run.fail("Atlas returned " + outputs.size() + " frames for " + entries.size() + " photos.");
                return;
            }
            var prefix = folder(area) + "spatial-context/run-" + run.getId() + "/";
            for (var entry : entries) {
                var output = outputs.get(entry.getFrameIndex());
                var name = prefix + String.format("frame-%02d-", entry.getFrameIndex());
                var image = store(name + "image", output.path("imageAsset"), null);
                var depth = store(name + "depth.exr", output.path("depth").path("depthAsset"), "image/x-exr");
                var confidence = store(name + "confidence.png", output.path("depth").path("confidenceAsset"), "image/png");
                entry.setResult(AtlasClient.JSON.writeValueAsString(output.path("camera")), image, depth, confidence);
            }
            run.succeed();
        } catch (AtlasClient.AtlasException | SdkException failure) {
            // A network hiccup while polling must not end the run; the next check tries again.
            if (failure instanceof SdkException) run.fail("Storing the result failed: " + failure.getMessage());
        }
    }

    private String store(String key, JsonNode assetRef, String fallbackType) {
        if (assetRef.isMissingNode() || assetRef.isNull()) return null;
        var bytes = atlas.download(assetRef);
        var type = fallbackType != null ? fallbackType : TourRequestService.imageType(bytes);
        r2.putObject(PutObjectRequest.builder().bucket(bucket).key(key)
                .contentType(type == null ? "application/octet-stream" : type).build(), RequestBody.fromBytes(bytes));
        return key;
    }

    private Result result(TourArea area, SpatialContextRun run, List<SpatialContextFrame> entries) {
        int photos = sources(area.getId()).size();
        if (run == null) return new Result(null, "NONE", null, null, null, null, 0, 0, photos, atlas.configured(), List.of(), List.of());
        // Gallery photos added after this run started: the spatial context does not include them yet.
        var fresh = floorPhotos.findByArea_IdOrderByIdAsc(area.getId()).stream()
                .filter(photo -> photo.getCreatedAt().isAfter(run.getCreatedAt())).map(FloorPhoto::getId).toList();
        var base = "/api/admin/tour-requests/" + area.getTourRequest().getId() + "/areas/" + area.getId()
                + "/spatial-context/runs/" + run.getId() + "/frames/";
        var done = run.getStatus() == SpatialContextRun.Status.SUCCEEDED;
        var list = entries.stream().map(entry -> new FrameResult(entry.getFrameIndex(),
                entry.getPoint() == null ? null : entry.getPoint().getId(), entry.getPointSeq(),
                done && entry.getCameraJson() != null ? AtlasClient.JSON.readTree(entry.getCameraJson()) : null,
                done && entry.getImageObjectKey() != null ? base + entry.getFrameIndex() + "/image" : null,
                done && entry.getDepthObjectKey() != null ? base + entry.getFrameIndex() + "/depth" : null,
                done && entry.getConfidenceObjectKey() != null ? base + entry.getFrameIndex() + "/confidence" : null))
                .toList();
        // While running: still uploading our photos, or Atlas is working on them.
        String phase = run.getStatus() != SpatialContextRun.Status.RUNNING ? null
                : run.getOperationId() == null ? "UPLOADING" : "PROCESSING";
        return new Result(run.getId(), run.getStatus().name(), phase, run.getError(), run.getCreatedAt(), run.getFinishedAt(),
                uploading.getOrDefault(run.getId(), 0), entries.size(), photos, atlas.configured(), list, fresh);
    }

    /** One photo going to Atlas: a spot photo (with its point) or a floor gallery photo (no point). */
    private record Source(CapturePoint point, String key) {}

    // Spot photos in spot order, then the floor's own gallery photos in upload order.
    private List<Source> sources(Long areaId) {
        var list = new ArrayList<Source>();
        points.findByArea_IdOrderBySeqAsc(areaId).stream().filter(point -> point.getPhotoObjectKey() != null)
                .forEach(point -> list.add(new Source(point, point.getPhotoObjectKey())));
        floorPhotos.findByArea_IdOrderByIdAsc(areaId).forEach(photo -> list.add(new Source(null, photo.getObjectKey())));
        return list;
    }

    private TourArea area(Long tourId, Long areaId) {
        var tour = tours.findById(tourId).orElseThrow(() -> error(404, "Tour request not found."));
        var area = areas.findById(areaId).orElseThrow(() -> error(404, "Area not found."));
        if (!area.getTourRequest().getId().equals(tour.getId())) throw error(404, "Area not found.");
        return area;
    }

    private User admin(Authentication authentication) {
        var user = users.findByEmailIgnoreCase(authentication.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!user.isPlatformAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return user;
    }

    // Same layout as TourRequestService: files stay with their floor.
    private static String folder(TourArea area) {
        var tour = area.getTourRequest();
        return "users/" + tour.getUser().getId() + "/tours/" + tour.getId() + "/areas/" + area.getId() + "/";
    }

    private static ResponseStatusException error(int status, String message) {
        return new ResponseStatusException(HttpStatus.valueOf(status), message);
    }

    private static java.util.concurrent.ThreadFactory daemon(String name) {
        return task -> {
            var thread = new Thread(task, name);
            thread.setDaemon(true);
            return thread;
        };
    }

    public record File(byte[] bytes, String contentType) {}
    /** camera is the Atlas camera object: extrinsics {position, quaternion (xyzw), coordinateSystem}, intrinsics {width, height, fx, fy, cx, cy}. */
    public record FrameResult(int index, Long pointId, int pointSeq, JsonNode camera, String imageUrl, String depthUrl,
            String confidenceUrl) {}
    /**
     * status: NONE, RUNNING, SUCCEEDED or FAILED. phase while RUNNING: UPLOADING (our photos going to Atlas,
     * uploaded of total done) or PROCESSING (Atlas is working on them).
     */
    public record Result(Long runId, String status, String phase, String error, Instant createdAt, Instant finishedAt,
            int uploaded, int total, int photoCount, boolean configured, List<FrameResult> frames,
            // Gallery photos newer than this run, so the team knows to update it.
            List<Long> newPhotoIds) {}
}
