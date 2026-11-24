package com.example.platform.tour;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import com.example.platform.user.UserRepository;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * A floor's 3DGS (operator only). Made in three steps, all on the server, so the page can be closed at any time:
 * 1. the finished spatial context (each photo with its camera, depth and confidence) is uploaded to Atlas and
 *    posedImages2Splats is submitted; 2. a timer follows Atlas (15 to 30 minutes); 3. Atlas's .spz is kept in our
 *    storage and converted with splat-transform into what the tour viewer loads: scene.sog for the picture and
 *    scene.voxel.json/.bin for walking. A failed conversion can be tried again from the kept .spz without paying Atlas twice.
 */
@Service
public class SplatService {
    private static final Logger log = LoggerFactory.getLogger(SplatService.class);
    private static final long POLL_SECONDS = 30;
    /** Atlas makes splats of several sizes; the viewer runs well up to this many. */
    private static final long MAX_SPLATS = 2_000_000;
    private static final long STEP_MINUTES = 45;

    private final JdbcTemplate db;
    private final AtlasClient atlas;
    private final S3Client r2;
    private final String bucket;
    private final UserRepository users;
    private final String node;
    private final String cli;

    /** Uploads to Atlas: a few files at a time. */
    private final ExecutorService uploads = Executors.newFixedThreadPool(4, daemon("splat-upload"));
    private final ExecutorService jobs = Executors.newFixedThreadPool(2, daemon("splat-job"));
    /** Conversions use a lot of memory: one at a time. */
    private final ExecutorService converter = Executors.newSingleThreadExecutor(daemon("splat-convert"));
    private final ScheduledExecutorService poller = Executors.newSingleThreadScheduledExecutor(daemon("splat-poll"));
    /** Runs uploading right now: files done and in all. */
    private final Map<Long, int[]> uploading = new ConcurrentHashMap<>();
    /** Runs being converted (or waiting to be) in this process. */
    private final Set<Long> converting = ConcurrentHashMap.newKeySet();

    public SplatService(JdbcTemplate db, AtlasClient atlas, S3Client r2, @Value("${storage.r2.bucket-name}") String bucket,
            UserRepository users, @Value("${SPLAT_NODE:node}") String node,
            @Value("${SPLAT_TRANSFORM_CLI:splat-tools/node_modules/@playcanvas/splat-transform/bin/cli.mjs}") String cli) {
        this.db = db;
        this.atlas = atlas;
        this.r2 = r2;
        this.bucket = bucket;
        this.users = users;
        this.node = node;
        this.cli = cli;
    }

    /** After a restart: an upload that was cut off is marked failed; Atlas runs and conversions are picked up again. */
    @EventListener(ApplicationReadyEvent.class)
    public void resume() {
        db.update("""
                UPDATE splat_runs SET status = 'FAILED', phase = NULL, finished_at = now(),
                error = 'The upload to Atlas was interrupted by a server restart. Please try again.'
                WHERE status = 'RUNNING' AND operation_id IS NULL""");
        poller.scheduleWithFixedDelay(this::pollAll, 5, POLL_SECONDS, TimeUnit.SECONDS);
    }

    @PreDestroy
    void stop() {
        uploads.shutdownNow();
        jobs.shutdownNow();
        converter.shutdownNow();
        poller.shutdownNow();
    }

    private record Run(long id, long areaId, Long spatialRunId, String publicId, String status, String phase, String operationId,
            String sourceKey, String folderKey, Integer splatCount, String error, Instant createdAt, Instant finishedAt) {}

    private List<Run> runs(String where, Object... args) {
        return db.query("""
                SELECT id, area_id, spatial_run_id, public_id, status, phase, operation_id, source_object_key, folder_key,
                splat_count, error, created_at, finished_at FROM splat_runs WHERE\s""" + where, (rs, i) -> new Run(
                rs.getLong(1), rs.getLong(2), (Long) rs.getObject(3), rs.getString(4), rs.getString(5), rs.getString(6),
                rs.getString(7), rs.getString(8), rs.getString(9), (Integer) rs.getObject(10), rs.getString(11),
                rs.getTimestamp(12).toInstant(), rs.getTimestamp(13) == null ? null : rs.getTimestamp(13).toInstant()), args);
    }

    private Run latest(long areaId) {
        var found = runs("area_id = ? ORDER BY id DESC LIMIT 1", areaId);
        return found.isEmpty() ? null : found.getFirst();
    }

    /**
     * Starts the floor's 3DGS. After a failed conversion it converts Atlas's kept output again (free);
     * otherwise it sends the floor's newest finished spatial context to Atlas (spends Atlas credits).
     */
    public Status start(long tourId, long areaId, Authentication authentication) {
        admin(authentication);
        folder(tourId, areaId);
        if (!atlas.configured()) throw error(503, "3DGS is not set up on this server: WLT_API_KEY is missing.");
        long runId;
        boolean reconvert;
        synchronized (this) {
            var latest = latest(areaId);
            if (latest != null && "RUNNING".equals(latest.status())) throw error(409, "The 3DGS is already being made for this floor.");
            var spatial = db.queryForList("SELECT id FROM spatial_context_runs WHERE area_id = ? AND status = 'SUCCEEDED' ORDER BY id DESC LIMIT 1",
                    Long.class, areaId);
            if (spatial.isEmpty()) throw error(409, "Generate the floor's spatial context first.");
            long spatialRunId = spatial.getFirst();
            reconvert = latest != null && "FAILED".equals(latest.status()) && latest.sourceKey() != null
                    && Long.valueOf(spatialRunId).equals(latest.spatialRunId());
            if (reconvert) {
                runId = latest.id();
                db.update("UPDATE splat_runs SET status = 'RUNNING', phase = 'CONVERTING', error = NULL, finished_at = NULL WHERE id = ?", runId);
            } else {
                var frames = db.queryForObject("SELECT count(*) FROM spatial_context_frames WHERE run_id = ? AND camera_json IS NOT NULL "
                        + "AND image_object_key IS NOT NULL AND depth_object_key IS NOT NULL", Integer.class, spatialRunId);
                if (frames == null || frames < 2) throw error(409, "The spatial context needs at least two placed photos.");
                if (frames > 512) throw error(409, "Atlas makes a 3DGS from at most 512 photos.");
                runId = db.queryForObject("INSERT INTO splat_runs (area_id, spatial_run_id, public_id, phase) VALUES (?, ?, ?, 'UPLOADING') RETURNING id",
                        Long.class, areaId, spatialRunId, UUID.randomUUID());
                uploading.put(runId, new int[] { 0, frames * 3 });
            }
        }
        if (reconvert) queueConversion(runId);
        else {
            long id = runId;
            jobs.submit(() -> upload(id));
        }
        return status(areaId);
    }

    /** Background job: the spatial context's files go to Atlas, then posedImages2Splats is submitted. */
    private void upload(long runId) {
        try {
            var run = runs("id = ?", runId).getFirst();
            record Frame(int index, String camera, String image, String depth, String confidence) {}
            var frames = db.query("""
                    SELECT frame_index, camera_json, image_object_key, depth_object_key, confidence_object_key FROM spatial_context_frames
                    WHERE run_id = ? AND camera_json IS NOT NULL AND image_object_key IS NOT NULL AND depth_object_key IS NOT NULL
                    ORDER BY frame_index""", (rs, i) -> new Frame(rs.getInt(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5)),
                    run.spatialRunId());
            uploading.put(runId, new int[] { 0, frames.size() * 3 });
            var done = new AtomicInteger();
            var posed = AtlasClient.JSON.createArrayNode();
            var pending = new ArrayList<Future<ObjectNode>>();
            for (var frame : frames) {
                pending.add(uploads.submit(() -> {
                    var entry = AtlasClient.JSON.createObjectNode();
                    var image = asset(runId, frame.index(), "image", frame.image(), null, done);
                    entry.putObject("imageAsset").put("assetId", image);
                    entry.set("camera", camera(frame.camera()));
                    var depth = entry.putObject("depth");
                    depth.putObject("depthAsset").put("assetId", asset(runId, frame.index(), "depth", frame.depth(), "image/x-exr", done));
                    if (frame.confidence() != null)
                        depth.putObject("confidenceAsset").put("assetId", asset(runId, frame.index(), "confidence", frame.confidence(), "image/png", done));
                    return entry;
                }));
            }
            for (var future : pending) posed.add(future.get());
            // A new key per run, so a retry never reuses one; one key per run, so the same run is never paid twice.
            var operation = atlas.submitSplats(posed, "splats-" + run.publicId());
            db.update("UPDATE splat_runs SET operation_id = ?, phase = 'PROCESSING' WHERE id = ?", operation, runId);
        } catch (java.util.concurrent.ExecutionException failure) {
            fail(runId, message(failure.getCause()));
        } catch (Exception failure) {
            if (failure instanceof InterruptedException) Thread.currentThread().interrupt();
            fail(runId, message(failure));
        } finally {
            uploading.remove(runId);
        }
    }

    private String asset(long runId, int index, String kind, String key, String type, AtomicInteger done) {
        var bytes = r2.getObjectAsBytes(b -> b.bucket(bucket).key(key)).asByteArray();
        var contentType = type != null ? type : TourRequestService.imageType(bytes);
        if (contentType == null) throw new AtlasClient.AtlasException("Photo " + (index + 1) + " is not a JPG, PNG or WebP image.");
        var extension = switch (contentType) { case "image/x-exr" -> "exr"; case "image/png" -> "png"; case "image/webp" -> "webp"; default -> "jpg"; };
        var id = atlas.uploadAsset(String.format("splat-run-%d-frame-%02d-%s.%s", runId, index, kind, extension), contentType, bytes);
        var progress = uploading.get(runId);
        if (progress != null) progress[0] = done.incrementAndGet();
        return id;
    }

    /** Only the fields posedImages2Splats takes (it refuses unknown ones). */
    private static ObjectNode camera(String json) {
        var stored = AtlasClient.JSON.readTree(json);
        var camera = AtlasClient.JSON.createObjectNode();
        var extrinsics = camera.putObject("extrinsics");
        extrinsics.set("position", stored.path("extrinsics").path("position"));
        extrinsics.set("quaternion", stored.path("extrinsics").path("quaternion"));
        extrinsics.put("coordinateSystem", stored.path("extrinsics").path("coordinateSystem").asString("rub"));
        var intrinsics = camera.putObject("intrinsics");
        for (var field : List.of("fx", "fy", "cx", "cy")) intrinsics.put(field, stored.path("intrinsics").path(field).asDouble());
        intrinsics.put("width", stored.path("intrinsics").path("width").asInt());
        intrinsics.put("height", stored.path("intrinsics").path("height").asInt());
        return camera;
    }

    /** Timer: follows every run at Atlas, and picks up conversions a restart cut off. */
    private void pollAll() {
        try {
            for (var run : runs("status = 'RUNNING' AND operation_id IS NOT NULL")) {
                if ("CONVERTING".equals(run.phase())) {
                    if (!converting.contains(run.id())) queueConversion(run.id());
                    continue;
                }
                check(run);
            }
        } catch (RuntimeException failure) {
            log.warn("Polling 3DGS runs failed", failure);
        }
    }

    private void check(Run run) {
        JsonNode operation;
        try {
            operation = atlas.operation(run.operationId());
        } catch (AtlasClient.AtlasException hiccup) {
            return; // The next check tries again.
        }
        if (!operation.path("done").asBoolean(false)) return;
        var failure = operation.get("error");
        if (failure != null && !failure.isNull()) {
            var text = AtlasClient.text(failure, "message");
            fail(run.id(), "Atlas could not make the 3DGS: " + (text != null ? text : failure.toString()));
            return;
        }
        db.update("UPDATE splat_runs SET phase = 'CONVERTING' WHERE id = ? AND status = 'RUNNING'", run.id());
        queueConversion(run.id());
    }

    /** The largest splat Atlas made that the viewer handles well, with its size. */
    private static Map.Entry<Long, JsonNode> pick(JsonNode response) {
        var refined = response.path("refinedSplats");
        var sizes = new ArrayList<Map.Entry<Long, JsonNode>>();
        for (var entry : refined.properties()) {
            try { sizes.add(Map.entry(Long.parseLong(entry.getKey()), entry.getValue())); } catch (NumberFormatException ignored) {}
        }
        sizes.sort(Comparator.comparingLong(Map.Entry::getKey));
        var fitting = sizes.stream().filter(e -> e.getKey() <= MAX_SPLATS).reduce((a, b) -> b);
        if (fitting.isPresent()) return fitting.get();
        if (!sizes.isEmpty()) return sizes.getFirst();
        var draft = response.path("draftSplat");
        if (!draft.isMissingNode() && !draft.isNull()) return Map.entry(0L, draft);
        throw new AtlasClient.AtlasException("Atlas finished without a 3DGS file.");
    }

    private void queueConversion(long runId) {
        if (!converting.add(runId)) return;
        converter.submit(() -> {
            try { convert(runId); } finally { converting.remove(runId); }
        });
    }

    /** Keeps Atlas's .spz, converts it for the viewer and stores the result. */
    private void convert(long runId) {
        Path dir = null;
        try {
            var run = runs("id = ?", runId).getFirst();
            if (!"RUNNING".equals(run.status())) return;
            dir = Files.createTempDirectory("splat-" + runId + "-");
            var source = dir.resolve("source.spz");
            var folder = folderOfArea(run.areaId()) + "splats/run-" + runId + "/";
            Integer count = run.splatCount();
            if (run.sourceKey() != null) {
                try (ResponseInputStream<GetObjectResponse> in = r2.getObject(b -> b.bucket(bucket).key(run.sourceKey()))) {
                    Files.copy(in, source);
                }
            } else {
                var chosen = pick(atlas.operation(run.operationId()).path("response"));
                atlas.downloadTo(chosen.getValue(), source);
                var key = folder + "source.spz";
                r2.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType("application/octet-stream").build(), RequestBody.fromFile(source));
                count = chosen.getKey() > 0 ? chosen.getKey().intValue() : null;
                db.update("UPDATE splat_runs SET source_object_key = ?, splat_count = ? WHERE id = ?", key, count, runId);
            }
            // The same steps the first test tours were made with (see dev-scenes/fred/collision-build.json).
            transform(dir, "source.spz", "--rotate", "0,0,180", "scene.sog", "-g", "cpu");
            transform(dir, "source.spz", "--rotate", "0,0,180", "--filter-value", "opacity,gte,0.5", "--decimate", "250000", "proxy.ply");
            transform(dir, "proxy.ply", "scene.voxel.json", "--voxel-size", "0.05", "--voxel-opacity", "0.1");
            Files.writeString(dir.resolve("settings.json"), settings(run.spatialRunId()), StandardCharsets.UTF_8);
            for (var file : List.of("scene.sog", "scene.voxel.json", "scene.voxel.bin", "settings.json")) {
                var path = dir.resolve(file);
                if (!Files.exists(path)) throw new IllegalStateException("The conversion did not make " + file + ".");
                r2.putObject(PutObjectRequest.builder().bucket(bucket).key(folder + file).contentType(contentType(file)).build(), RequestBody.fromFile(path));
            }
            db.update("""
                    UPDATE splat_runs SET status = 'SUCCEEDED', phase = NULL, folder_key = ?, error = NULL, finished_at = now()
                    WHERE id = ? AND status = 'RUNNING'""", folder, runId);
        } catch (Exception failure) {
            if (failure instanceof InterruptedException) Thread.currentThread().interrupt();
            log.warn("3DGS conversion for run {} failed", runId, failure);
            fail(runId, "Converting the 3DGS for the viewer failed: " + message(failure) + " Try again: Atlas is not paid again.");
        } finally {
            if (dir != null) deleteQuietly(dir);
        }
    }

    private void transform(Path dir, String... args) throws IOException, InterruptedException {
        var command = new ArrayList<String>(List.of(node, Path.of(cli).toAbsolutePath().toString(), "--no-tty", "-w"));
        command.addAll(List.of(args));
        var process = new ProcessBuilder(command).directory(dir.toFile()).redirectErrorStream(true)
                .redirectOutput(dir.resolve("transform.log").toFile()).start();
        if (!process.waitFor(STEP_MINUTES, TimeUnit.MINUTES)) {
            process.destroyForcibly();
            throw new IOException("splat-transform took longer than " + STEP_MINUTES + " minutes.");
        }
        if (process.exitValue() != 0) {
            var output = Files.readAllLines(dir.resolve("transform.log"));
            var tail = String.join(" ", output.subList(Math.max(0, output.size() - 4), output.size())).strip();
            throw new IOException("splat-transform stopped (" + process.exitValue() + "): " + (tail.length() > 600 ? tail.substring(tail.length() - 600) : tail));
        }
    }

    /**
     * The viewer's settings, starting where the first photo was taken, looking the same way.
     * Atlas's world is right-up-back; after the conversion's rotation the viewer's world has x and z turned around.
     */
    private String settings(Long spatialRunId) throws IOException {
        var settings = (ObjectNode) AtlasClient.JSON.readTree(new String(
                getClass().getResourceAsStream("/splat-settings.json").readAllBytes(), StandardCharsets.UTF_8));
        if (spatialRunId != null) {
            var first = db.queryForList("SELECT camera_json FROM spatial_context_frames WHERE run_id = ? AND camera_json IS NOT NULL ORDER BY frame_index LIMIT 1",
                    String.class, spatialRunId);
            if (!first.isEmpty()) {
                var camera = AtlasClient.JSON.readTree(first.getFirst()).path("extrinsics");
                var p = camera.path("position");
                var q = camera.path("quaternion");
                double qx = q.path(0).asDouble(), qy = q.path(1).asDouble(), qz = q.path(2).asDouble(), qw = q.path(3).asDouble(1);
                // Forward is the camera's -Z (right-up-back), turned by the camera's rotation.
                double fx = -(2 * (qx * qz + qw * qy)), fz = -(1 - 2 * (qx * qx + qy * qy));
                double[] eye = { -p.path(0).asDouble(), p.path(1).asDouble(), -p.path(2).asDouble() };
                double[] look = { -fx, 0, -fz };
                double len = Math.hypot(look[0], look[2]);
                if (len < 1e-6) { look[0] = 0; look[2] = -1; len = 1; }
                var initial = ((ObjectNode) settings.path("cameras").path(0)).putObject("initial");
                initial.putArray("position").add(eye[0]).add(eye[1]).add(eye[2]);
                initial.putArray("target").add(eye[0] + look[0] / len).add(eye[1]).add(eye[2] + look[2] / len);
                initial.put("fov", 75);
            }
        }
        return AtlasClient.JSON.writerWithDefaultPrettyPrinter().writeValueAsString(settings);
    }

    /** Where each floor stands, for the 3D panel. */
    public List<Status> list(long tourId, Authentication authentication) {
        admin(authentication);
        var areas = db.queryForList("SELECT id FROM tour_areas WHERE tour_request_id = ? ORDER BY id", Long.class, tourId);
        return areas.stream().map(this::status).toList();
    }

    private Status status(long areaId) {
        var run = latest(areaId);
        if (run == null) return new Status(areaId, "NONE", null, null, 0, 0, null, null, null, null, atlas.configured(), false);
        var progress = uploading.get(run.id());
        var scene = "SUCCEEDED".equals(run.status()) ? "/api/public/splats/" + run.publicId() : null;
        return new Status(areaId, run.status(), run.phase(), run.error(), progress == null ? 0 : progress[0], progress == null ? 0 : progress[1],
                scene, run.splatCount(), run.createdAt(), run.finishedAt(), atlas.configured(),
                "FAILED".equals(run.status()) && run.sourceKey() != null);
    }

    /** A finished 3DGS's file, for the tour viewer (public: its address is a random id). */
    public ResponseInputStream<GetObjectResponse> file(String publicId, String name) {
        if (!List.of("scene.sog", "scene.voxel.json", "scene.voxel.bin", "settings.json").contains(name)) throw error(404, "Not found.");
        UUID key;
        try { key = UUID.fromString(publicId); } catch (IllegalArgumentException e) { throw error(404, "Not found."); }
        var found = runs("public_id = ? AND status = 'SUCCEEDED'", key);
        if (found.isEmpty() || found.getFirst().folderKey() == null) throw error(404, "Not found.");
        return r2.getObject(b -> b.bucket(bucket).key(found.getFirst().folderKey() + name));
    }

    static String contentType(String file) {
        return file.endsWith(".json") ? "application/json" : "application/octet-stream";
    }

    private void fail(long runId, String message) {
        var text = message == null || message.isBlank() ? "Making the 3DGS failed." : message;
        db.update("UPDATE splat_runs SET status = 'FAILED', phase = NULL, error = ?, finished_at = now() WHERE id = ? AND status = 'RUNNING'",
                text.length() > 1900 ? text.substring(0, 1900) : text, runId);
    }

    private static String message(Throwable failure) {
        if (failure instanceof AtlasClient.AtlasException || failure instanceof IOException || failure instanceof IllegalStateException)
            return failure.getMessage();
        if (failure instanceof SdkException) return "Storage failed: " + failure.getMessage();
        return failure == null ? null : failure.getClass().getSimpleName() + ": " + failure.getMessage();
    }

    /** The floor's storage folder, after checking it belongs to the space. */
    private String folder(long tourId, long areaId) {
        var owner = db.queryForList("SELECT t.user_id FROM tour_areas a JOIN tour_requests t ON t.id = a.tour_request_id WHERE a.id = ? AND t.id = ?",
                Long.class, areaId, tourId);
        if (owner.isEmpty()) throw error(404, "Floor not found.");
        return "users/" + owner.getFirst() + "/tours/" + tourId + "/areas/" + areaId + "/";
    }

    private String folderOfArea(long areaId) {
        var tourId = db.queryForObject("SELECT tour_request_id FROM tour_areas WHERE id = ?", Long.class, areaId);
        return folder(tourId, areaId);
    }

    private void admin(Authentication authentication) {
        var user = users.findByEmailIgnoreCase(authentication.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!user.isPlatformAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }

    private static void deleteQuietly(Path dir) {
        try (var walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> { try { Files.deleteIfExists(path); } catch (IOException ignored) {} });
        } catch (IOException ignored) {}
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

    /**
     * status: NONE, RUNNING, SUCCEEDED or FAILED. phase while RUNNING: UPLOADING (uploaded of total files done),
     * PROCESSING (Atlas is making it) or CONVERTING (our server prepares it for the viewer). scene: the folder the tour
     * viewer loads (?scene=), once it is made.
     */
    public record Status(long areaId, String status, String phase, String error, int uploaded, int total, String scene,
            Integer splatCount, Instant createdAt, Instant finishedAt, boolean configured,
            /** Failed after Atlas finished: trying again only converts the kept result, without paying Atlas. */
            boolean retryFree) {}

}
