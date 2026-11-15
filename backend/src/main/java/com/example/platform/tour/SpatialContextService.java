package com.example.platform.tour;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.example.platform.user.User;
import com.example.platform.user.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import tools.jackson.databind.JsonNode;

/**
 * Spatial context for one floor (operator only): the floor's photos go to Atlas images2PosedRGBD,
 * which returns a camera and a depth map per photo. Status is refreshed whenever it is read; once
 * the operation is done the cameras, depth and confidence maps are copied into our own storage.
 */
@Service
public class SpatialContextService {
    static final int MAX_FRAMES = TourRequestService.MAX_POINTS_PER_GROUP;

    private final TourRequestRepository tours;
    private final TourAreaRepository areas;
    private final CapturePointRepository points;
    private final SpatialContextRunRepository runs;
    private final SpatialContextFrameRepository frames;
    private final UserRepository users;
    private final AtlasClient atlas;
    private final S3Client r2;
    private final String bucket;

    public SpatialContextService(TourRequestRepository tours, TourAreaRepository areas, CapturePointRepository points,
            SpatialContextRunRepository runs, SpatialContextFrameRepository frames, UserRepository users,
            AtlasClient atlas, S3Client r2, @Value("${storage.r2.bucket-name}") String bucket) {
        this.tours = tours;
        this.areas = areas;
        this.points = points;
        this.runs = runs;
        this.frames = frames;
        this.users = users;
        this.atlas = atlas;
        this.r2 = r2;
        this.bucket = bucket;
    }

    /** Uploads the floor's photos to Atlas and submits the task. Atlas failures are recorded on the run. */
    @Transactional
    public synchronized Result start(Long tourId, Long areaId, Authentication authentication) {
        admin(authentication);
        var area = area(tourId, areaId);
        if (!atlas.configured())
            throw error(503, "Spatial context is not set up on this server: WLT_API_KEY is missing.");
        var latest = runs.findByArea_IdOrderByIdDesc(areaId).stream().findFirst().orElse(null);
        if (latest != null && latest.getStatus() == SpatialContextRun.Status.RUNNING)
            throw error(409, "Spatial context is already running for this floor.");
        var photos = points.findByArea_IdOrderBySeqAsc(areaId).stream()
                .filter(point -> point.getPhotoObjectKey() != null).toList();
        if (photos.isEmpty()) throw error(409, "This floor has no photos yet.");
        if (photos.size() > MAX_FRAMES) throw error(409, "Spatial context takes at most " + MAX_FRAMES + " photos.");

        var run = runs.save(new SpatialContextRun(area));
        var entries = new ArrayList<SpatialContextFrame>();
        for (int i = 0; i < photos.size(); i++) entries.add(frames.save(new SpatialContextFrame(run, i, photos.get(i))));
        try {
            var assetIds = new ArrayList<String>();
            for (var point : photos) {
                var bytes = r2.getObjectAsBytes(b -> b.bucket(bucket).key(point.getPhotoObjectKey())).asByteArray();
                var type = TourRequestService.imageType(bytes);
                if (type == null) throw new AtlasClient.AtlasException("Photo " + point.getSeq() + " is not a JPG, PNG or WebP image.");
                var name = String.format("area-%d-point-%02d.%s", areaId, point.getSeq(), type.substring(6));
                assetIds.add(atlas.uploadAsset(name, type, bytes));
            }
            run.setOperationId(atlas.submitPosedRgbd(assetIds, "spatial-context-run-" + run.getId()));
        } catch (AtlasClient.AtlasException | SdkException failure) {
            run.fail(failure.getMessage());
        }
        return result(area, run, entries);
    }

    /** The floor's newest run, refreshed from Atlas while it is running. */
    @Transactional
    public synchronized Result status(Long tourId, Long areaId, Authentication authentication) {
        admin(authentication);
        var area = area(tourId, areaId);
        var run = runs.findByArea_IdOrderByIdDesc(areaId).stream().findFirst().orElse(null);
        if (run == null) return result(area, null, List.of());
        var entries = frames.findByRun_IdOrderByFrameIndexAsc(run.getId());
        if (run.getStatus() == SpatialContextRun.Status.RUNNING) refresh(area, run, entries);
        return result(area, run, entries);
    }

    /** One stored output file of a finished run: image, depth or confidence. */
    @Transactional(readOnly = true)
    public File file(Long tourId, Long areaId, Long runId, int frameIndex, String kind, Authentication authentication) {
        admin(authentication);
        area(tourId, areaId);
        var run = runs.findById(runId).orElseThrow(() -> error(404, "Spatial context not found."));
        if (!run.getArea().getId().equals(areaId)) throw error(404, "Spatial context not found.");
        var frame = frames.findByRun_IdOrderByFrameIndexAsc(runId).stream()
                .filter(entry -> entry.getFrameIndex() == frameIndex).findFirst()
                .orElseThrow(() -> error(404, "Frame not found."));
        var key = switch (kind) {
            case "image" -> frame.getImageObjectKey();
            case "depth" -> frame.getDepthObjectKey();
            case "confidence" -> frame.getConfidenceObjectKey();
            default -> throw error(404, "Unknown file.");
        };
        if (key == null) throw error(404, "This file is not available.");
        var object = r2.getObjectAsBytes(b -> b.bucket(bucket).key(key));
        var type = object.response().contentType();
        return new File(object.asByteArray(), type == null ? "application/octet-stream" : type);
    }

    private void refresh(TourArea area, SpatialContextRun run, List<SpatialContextFrame> entries) {
        if (run.getOperationId() == null) {
            run.fail("The task was never submitted.");
            return;
        }
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
            // A network hiccup while polling must not end the run; the next read tries again.
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
        int photos = (int) points.findByArea_IdOrderBySeqAsc(area.getId()).stream()
                .filter(point -> point.getPhotoObjectKey() != null).count();
        if (run == null) return new Result(null, "NONE", null, null, null, photos, atlas.configured(), List.of());
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
        return new Result(run.getId(), run.getStatus().name(), run.getError(), run.getCreatedAt(), run.getFinishedAt(),
                photos, atlas.configured(), list);
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

    public record File(byte[] bytes, String contentType) {}
    /** camera is the Atlas camera object: extrinsics {position, quaternion (xyzw), coordinateSystem}, intrinsics {width, height, fx, fy, cx, cy}. */
    public record FrameResult(int index, Long pointId, int pointSeq, JsonNode camera, String imageUrl, String depthUrl,
            String confidenceUrl) {}
    /** status: NONE, RUNNING, SUCCEEDED or FAILED. */
    public record Result(Long runId, String status, String error, Instant createdAt, Instant finishedAt, int photoCount,
            boolean configured, List<FrameResult> frames) {}
}
