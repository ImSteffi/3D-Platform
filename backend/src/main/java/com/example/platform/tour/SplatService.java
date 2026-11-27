package com.example.platform.tour;

import java.io.IOException;
import java.io.InputStream;
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
 * A floor's 3DGS (operator only). The server only moves data, so it runs on a small server and the page can be closed:
 * 1. the finished spatial context (each photo with its camera, depth and confidence) is uploaded to Atlas and
 *    posedImages2Splats is submitted; 2. a timer follows Atlas (15 to 30 minutes); 3. Atlas's .spz is kept in our storage,
 *    with the viewer's settings (starting where the first photo was taken).
 * The team's browser then converts the .spz with splat-transform and uploads the viewer's files: scene.sog makes the
 * 3DGS visible (fly mode), scene.voxel.json/.bin add walking and teleports.
 */
@Service
public class SplatService {
    private static final Logger log = LoggerFactory.getLogger(SplatService.class);
    private static final long POLL_SECONDS = 30;
    /** Atlas makes splats of several sizes; the viewer runs well up to this many. */
    private static final long MAX_SPLATS = 2_000_000;
    /** Largest file the browser may upload (a 2M-splat scene.sog is about 25 MB). */
    static final long MAX_UPLOAD_BYTES = 300L * 1024 * 1024;
    /** What the browser uploads after converting, and what the viewer loads. */
    static final List<String> UPLOADS = List.of("scene.sog", "scene.voxel.json", "scene.voxel.bin");

    private final JdbcTemplate db;
    private final AtlasClient atlas;
    private final S3Client r2;
    private final String bucket;
    private final UserRepository users;

    /** Uploads to Atlas: a few files at a time. */
    private final ExecutorService uploads = Executors.newFixedThreadPool(4, daemon("splat-upload"));
    private final ExecutorService jobs = Executors.newFixedThreadPool(2, daemon("splat-job"));
    private final ScheduledExecutorService poller = Executors.newSingleThreadScheduledExecutor(daemon("splat-poll"));
    /** Runs uploading right now: files done and in all. */
    private final Map<Long, int[]> uploading = new ConcurrentHashMap<>();
    /** Runs whose Atlas result is being stored right now. */
    private final Set<Long> storing = ConcurrentHashMap.newKeySet();

    public SplatService(JdbcTemplate db, AtlasClient atlas, S3Client r2, @Value("${storage.r2.bucket-name}") String bucket, UserRepository users) {
        this.db = db;
        this.atlas = atlas;
        this.r2 = r2;
        this.bucket = bucket;
        this.users = users;
    }

    /** After a restart: an upload that was cut off is marked failed; Atlas runs and storing are picked up again. */
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
        poller.shutdownNow();
    }

    private record Run(long id, long areaId, Long spatialRunId, String publicId, String status, String phase, String operationId,
            String sourceKey, String folderKey, Integer splatCount, String error, Instant createdAt, Instant finishedAt,
            boolean sogReady, boolean voxelsReady) {}

    private List<Run> runs(String where, Object... args) {
        return db.query("""
                SELECT id, area_id, spatial_run_id, public_id, status, phase, operation_id, source_object_key, folder_key,
                splat_count, error, created_at, finished_at, sog_ready, voxels_ready FROM splat_runs WHERE\s""" + where, (rs, i) -> new Run(
                rs.getLong(1), rs.getLong(2), (Long) rs.getObject(3), rs.getString(4), rs.getString(5), rs.getString(6),
                rs.getString(7), rs.getString(8), rs.getString(9), (Integer) rs.getObject(10), rs.getString(11),
                rs.getTimestamp(12).toInstant(), rs.getTimestamp(13) == null ? null : rs.getTimestamp(13).toInstant(),
                rs.getBoolean(14), rs.getBoolean(15)), args);
    }

    private Run latest(long areaId) {
        var found = runs("area_id = ? ORDER BY id DESC LIMIT 1", areaId);
        return found.isEmpty() ? null : found.getFirst();
    }

    /**
     * Starts the floor's 3DGS: sends the floor's newest finished spatial context to Atlas (spends Atlas credits).
     * After Atlas finished but storing its result failed, it only fetches the result again (free).
     */
    public Status start(long tourId, long areaId, Authentication authentication) {
        admin(authentication);
        folder(tourId, areaId);
        if (!atlas.configured()) throw error(503, "3DGS is not set up on this server: WLT_API_KEY is missing.");
        long runId;
        boolean refetch;
        synchronized (this) {
            var latest = latest(areaId);
            if (latest != null && "RUNNING".equals(latest.status())) throw error(409, "The 3DGS is already being made for this floor.");
            refetch = latest != null && retryFree(latest);
            if (refetch) {
                runId = latest.id();
                db.update("UPDATE splat_runs SET status = 'RUNNING', phase = 'STORING', error = NULL, finished_at = NULL WHERE id = ?", runId);
            } else {
                var spatial = db.queryForList("SELECT id FROM spatial_context_runs WHERE area_id = ? AND status = 'SUCCEEDED' ORDER BY id DESC LIMIT 1",
                        Long.class, areaId);
                if (spatial.isEmpty()) throw error(409, "Generate the floor's spatial context first.");
                var frames = db.queryForObject("SELECT count(*) FROM spatial_context_frames WHERE run_id = ? AND camera_json IS NOT NULL "
                        + "AND image_object_key IS NOT NULL AND depth_object_key IS NOT NULL", Integer.class, spatial.getFirst());
                if (frames == null || frames < 2) throw error(409, "The spatial context needs at least two placed photos.");
                if (frames > 512) throw error(409, "Atlas makes a 3DGS from at most 512 photos.");
                runId = db.queryForObject("INSERT INTO splat_runs (area_id, spatial_run_id, public_id, phase) VALUES (?, ?, ?, 'UPLOADING') RETURNING id",
                        Long.class, areaId, spatial.getFirst(), UUID.randomUUID());
                uploading.put(runId, new int[] { 0, frames * 3 });
            }
        }
        long id = runId;
        if (refetch) queueStore(id);
        else jobs.submit(() -> upload(id));
        return status(areaId);
    }

    /** Atlas finished, but storing its result failed: fetching it again costs nothing. */
    private static boolean retryFree(Run run) {
        return "FAILED".equals(run.status()) && "STORING".equals(run.phase()) && run.operationId() != null;
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
            int total = frames.stream().mapToInt(f -> f.confidence() == null ? 2 : 3).sum();
            uploading.put(runId, new int[] { 0, total });
            var done = new AtomicInteger();
            var posed = AtlasClient.JSON.createArrayNode();
            var pending = new ArrayList<Future<ObjectNode>>();
            for (var frame : frames) {
                pending.add(uploads.submit(() -> {
                    var entry = AtlasClient.JSON.createObjectNode();
                    entry.putObject("imageAsset").put("assetId", asset(runId, frame.index(), "image", frame.image(), null, done));
                    entry.set("camera", camera(frame.camera()));
                    var depth = entry.putObject("depth");
                    depth.putObject("depthAsset").put("assetId", asset(runId, frame.index(), "depth", frame.depth(), "image/x-exr", done));
                    if (frame.confidence() != null)
                        depth.putObject("confidenceAsset").put("assetId", asset(runId, frame.index(), "confidence", frame.confidence(), "image/png", done));
                    return entry;
                }));
            }
            for (var future : pending) posed.add(future.get());
            // One key per run: the same run is never paid twice, and a new run never reuses a key.
            var operation = atlas.submitSplats(posed, "splats-" + run.publicId());
            db.update("UPDATE splat_runs SET operation_id = ?, phase = 'PROCESSING' WHERE id = ?", operation, runId);
        } catch (java.util.concurrent.ExecutionException failure) {
            fail(runId, message(failure.getCause()), null);
        } catch (Exception failure) {
            if (failure instanceof InterruptedException) Thread.currentThread().interrupt();
            fail(runId, message(failure), null);
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

    /** Timer: follows every run at Atlas, and picks up storing that a restart cut off. */
    private void pollAll() {
        try {
            for (var run : runs("status = 'RUNNING' AND operation_id IS NOT NULL")) {
                if ("STORING".equals(run.phase())) queueStore(run.id());
                else check(run);
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
            fail(run.id(), "Atlas could not make the 3DGS: " + (text != null ? text : failure.toString()), null);
            return;
        }
        db.update("UPDATE splat_runs SET phase = 'STORING' WHERE id = ? AND status = 'RUNNING'", run.id());
        queueStore(run.id());
    }

    /** The largest splat Atlas made that the viewer handles well, with its size. */
    private static Map.Entry<Long, JsonNode> pick(JsonNode response) {
        var sizes = new ArrayList<Map.Entry<Long, JsonNode>>();
        for (var entry : response.path("refinedSplats").properties()) {
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

    private void queueStore(long runId) {
        if (!storing.add(runId)) return;
        jobs.submit(() -> {
            try { store(runId); } finally { storing.remove(runId); }
        });
    }

    /** Keeps Atlas's .spz and the viewer's settings in our storage; the browser converts it from there. */
    private void store(long runId) {
        Path dir = null;
        try {
            var run = runs("id = ?", runId).getFirst();
            if (!"RUNNING".equals(run.status())) return;
            dir = Files.createTempDirectory("splat-" + runId + "-");
            var source = dir.resolve("source.spz");
            var folder = folderOfArea(run.areaId()) + "splats/run-" + runId + "/";
            var chosen = pick(atlas.operation(run.operationId()).path("response"));
            // Straight to a file and on to storage: a 3DGS never sits in the server's memory.
            atlas.downloadTo(chosen.getValue(), source);
            r2.putObject(PutObjectRequest.builder().bucket(bucket).key(folder + "source.spz").contentType("application/octet-stream").build(),
                    RequestBody.fromFile(source));
            put(folder + "settings.json", settings(run.spatialRunId()).getBytes(StandardCharsets.UTF_8), "application/json");
            db.update("""
                    UPDATE splat_runs SET status = 'SUCCEEDED', phase = NULL, source_object_key = ?, folder_key = ?, splat_count = ?,
                    error = NULL, finished_at = now() WHERE id = ? AND status = 'RUNNING'""",
                    folder + "source.spz", folder, chosen.getKey() > 0 ? chosen.getKey().intValue() : null, runId);
        } catch (Exception failure) {
            if (failure instanceof InterruptedException) Thread.currentThread().interrupt();
            log.warn("Storing the 3DGS of run {} failed", runId, failure);
            fail(runId, "Atlas made the 3DGS, but storing it failed: " + message(failure) + " Try again: Atlas is not paid again.", "STORING");
        } finally {
            if (dir != null) deleteQuietly(dir);
        }
    }

    /**
     * The viewer's settings, starting where the first photo was taken, looking the same way.
     * Atlas's world is right-up-back; after the viewer conversion's rotation (180° about z) x and z are turned around.
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
                double lx = -fx, lz = -fz, len = Math.hypot(lx, lz);
                if (len < 1e-6) { lx = 0; lz = -1; len = 1; }
                var initial = ((ObjectNode) settings.path("cameras").path(0)).putObject("initial");
                initial.putArray("position").add(eye[0]).add(eye[1]).add(eye[2]);
                initial.putArray("target").add(eye[0] + lx / len).add(eye[1]).add(eye[2] + lz / len);
                initial.put("fov", 75);
            }
        }
        return AtlasClient.JSON.writerWithDefaultPrettyPrinter().writeValueAsString(settings);
    }

    /** The newest made 3DGS of a floor, after checking the floor belongs to the space. */
    private Run made(long tourId, long areaId) {
        folder(tourId, areaId);
        var found = runs("area_id = ? AND status = 'SUCCEEDED' ORDER BY id DESC LIMIT 1", areaId);
        if (found.isEmpty() || found.getFirst().sourceKey() == null) throw error(404, "This floor has no 3DGS yet.");
        return found.getFirst();
    }

    /** Atlas's .spz, for the team's browser to convert. */
    public ResponseInputStream<GetObjectResponse> source(long tourId, long areaId, Authentication authentication) {
        admin(authentication);
        return r2.getObject(b -> b.bucket(bucket).key(made(tourId, areaId).sourceKey()));
    }

    /** A floor's 3DGS for the team to keep: one file as it is, or several in a ZIP. Never offered to customers. */
    public record Download(String fileName, List<String> keys) {
        boolean zip() { return keys.size() > 1; }
    }

    /**
     * "raw" is Atlas's .spz. "collisions" is what the viewer walks in: scene.sog with the voxel files (and the
     * start view), so it needs the floor converted first.
     */
    public Download download(long tourId, long areaId, String kind, Authentication authentication) {
        admin(authentication);
        var run = made(tourId, areaId);
        var names = db.queryForObject("SELECT t.name || ' - ' || a.name FROM tour_areas a JOIN tour_requests t ON t.id = a.tour_request_id WHERE a.id = ?",
                String.class, areaId);
        var base = TourRequestService.safeName(names) + " - 3DGS";
        return switch (kind) {
            case "raw" -> new Download(base + " raw.spz", List.of(run.sourceKey()));
            case "collisions" -> {
                if (!run.sogReady() || !run.voxelsReady()) throw error(409, "This floor's 3DGS has no collisions yet. Convert it first.");
                yield new Download(base + " with collisions.zip",
                        List.of("scene.sog", "scene.voxel.json", "scene.voxel.bin", "settings.json").stream().map(file -> run.folderKey() + file).toList());
            }
            default -> throw error(404, "Unknown download.");
        };
    }

    /** Streams the download: nothing is held in memory or stored. */
    public void writeDownload(Download download, java.io.OutputStream output) throws IOException {
        if (!download.zip()) {
            try (var object = r2.getObject(b -> b.bucket(bucket).key(download.keys().getFirst()))) { object.transferTo(output); }
            return;
        }
        try (var zip = new java.util.zip.ZipOutputStream(output)) {
            for (var key : download.keys()) {
                try (var object = r2.getObject(b -> b.bucket(bucket).key(key))) {
                    // Files at the top of the ZIP, as with the photos.
                    zip.putNextEntry(new java.util.zip.ZipEntry(key.substring(key.lastIndexOf('/') + 1)));
                    object.transferTo(zip);
                    zip.closeEntry();
                } catch (software.amazon.awssdk.services.s3.model.NoSuchKeyException missing) {
                    // The start view is optional: older floors may not have one.
                    if (!key.endsWith("settings.json")) throw missing;
                }
            }
        }
    }

    /**
     * A converted file from the team's browser. scene.sog makes the 3DGS visible; the voxel files are uploaded
     * .bin first, then .json, and the .json completes walking.
     */
    public Status upload(long tourId, long areaId, String name, InputStream body, long length, Authentication authentication) throws IOException {
        admin(authentication);
        if (!UPLOADS.contains(name)) throw error(404, "Unknown file.");
        if (length > MAX_UPLOAD_BYTES) throw error(413, "That file is too large.");
        var run = made(tourId, areaId);
        var temp = Files.createTempFile("splat-upload-", "-" + name);
        try {
            long copied;
            try (var out = Files.newOutputStream(temp)) { copied = body.transferTo(out); }
            if (copied == 0) throw error(400, "The file is empty.");
            if (copied > MAX_UPLOAD_BYTES) throw error(413, "That file is too large.");
            r2.putObject(PutObjectRequest.builder().bucket(bucket).key(run.folderKey() + name).contentType(contentType(name)).build(),
                    RequestBody.fromFile(temp));
        } finally {
            Files.deleteIfExists(temp);
        }
        if (name.equals("scene.sog")) db.update("UPDATE splat_runs SET sog_ready = true WHERE id = ?", run.id());
        if (name.equals("scene.voxel.json")) {
            try {
                r2.headObject(b -> b.bucket(bucket).key(run.folderKey() + "scene.voxel.bin"));
            } catch (SdkException missing) {
                throw error(409, "Upload scene.voxel.bin before scene.voxel.json.");
            }
            db.update("UPDATE splat_runs SET voxels_ready = true WHERE id = ?", run.id());
        }
        return status(areaId);
    }

    /** Where each floor stands, for the 3D panel. */
    public List<Status> list(long tourId, Authentication authentication) {
        admin(authentication);
        var areas = db.queryForList("SELECT id FROM tour_areas WHERE tour_request_id = ? ORDER BY id", Long.class, tourId);
        return areas.stream().map(this::status).toList();
    }

    private Status status(long areaId) {
        var run = latest(areaId);
        if (run == null) return new Status(areaId, "NONE", null, null, 0, 0, null, false, false, null, null, null, atlas.configured(), false);
        var progress = uploading.get(run.id());
        boolean made = "SUCCEEDED".equals(run.status());
        return new Status(areaId, run.status(), run.phase(), run.error(), progress == null ? 0 : progress[0], progress == null ? 0 : progress[1],
                made && run.sogReady() ? "/api/public/splats/" + run.publicId() : null, made && run.sogReady(), made && run.voxelsReady(),
                run.splatCount(), run.createdAt(), run.finishedAt(), atlas.configured(), retryFree(run));
    }

    /** A made 3DGS's viewer file (public: its address is a random id). Voxels only once they are complete. */
    public ResponseInputStream<GetObjectResponse> file(String publicId, String name) {
        UUID key;
        try { key = UUID.fromString(publicId); } catch (IllegalArgumentException e) { throw error(404, "Not found."); }
        var found = runs("public_id = ? AND status = 'SUCCEEDED'", key);
        if (found.isEmpty() || found.getFirst().folderKey() == null) throw error(404, "Not found.");
        var run = found.getFirst();
        boolean ready = switch (name) {
            case "settings.json" -> true;
            case "scene.sog" -> run.sogReady();
            case "scene.voxel.json", "scene.voxel.bin" -> run.voxelsReady();
            default -> false;
        };
        if (!ready) throw error(404, "Not found.");
        return r2.getObject(b -> b.bucket(bucket).key(run.folderKey() + name));
    }

    static String contentType(String file) {
        return file.endsWith(".json") ? "application/json" : "application/octet-stream";
    }

    private void put(String key, byte[] bytes, String type) {
        r2.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType(type).build(), RequestBody.fromBytes(bytes));
    }

    private void fail(long runId, String message, String phase) {
        var text = message == null || message.isBlank() ? "Making the 3DGS failed." : message;
        db.update("UPDATE splat_runs SET status = 'FAILED', phase = ?, error = ?, finished_at = now() WHERE id = ? AND status = 'RUNNING'",
                phase, text.length() > 1900 ? text.substring(0, 1900) : text, runId);
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
     * PROCESSING (Atlas is making it) or STORING (our server keeps Atlas's result). Once SUCCEEDED the browser converts:
     * sogReady (visible, scene = the folder the viewer loads) and voxelsReady (walking and teleports).
     */
    public record Status(long areaId, String status, String phase, String error, int uploaded, int total, String scene,
            boolean sogReady, boolean voxelsReady, Integer splatCount, Instant createdAt, Instant finishedAt, boolean configured,
            /** Atlas finished but storing failed: trying again only fetches the result, without paying Atlas. */
            boolean retryFree) {}
}
