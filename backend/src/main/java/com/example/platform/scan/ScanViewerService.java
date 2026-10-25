package com.example.platform.scan;

import java.io.InputStream;
import java.io.IOException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.node.ArrayNode;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.core.sync.RequestBody;

import java.util.Locale;
import com.example.platform.project.ProjectRepository;
import com.example.platform.user.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriUtils;
import java.nio.charset.StandardCharsets;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.S3Client;

@Service
@Transactional(readOnly = true)
public class ScanViewerService {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final ScanRepository scans;
    private final ScanFileRepository files;
    private final ProjectRepository projects;
    private final UserRepository users;
    private final S3Client r2;
    private final String bucket;
    private final software.amazon.awssdk.services.s3.presigner.S3Presigner signer;

    public ScanViewerService(ScanRepository scans, ScanFileRepository files,
            ProjectRepository projects, UserRepository users, S3Client r2,
            software.amazon.awssdk.services.s3.presigner.S3Presigner signer,
            @Value("${storage.r2.bucket-name}") String bucket) {
        this.scans = scans;
        this.files = files;
        this.projects = projects;
        this.users = users;
        this.r2 = r2;
        this.signer = signer;
        this.bucket = bucket;
    }

    Scan accessibleScan(Long scanId, Authentication authentication) {
        var scan = scans.findById(scanId).orElseThrow(ScanViewerService::notFound);
        var user = users.findByEmailIgnoreCase(authentication.getName())
                .orElseThrow(ScanViewerService::notFound);
        if (scan.getStatus() != Scan.Status.READY
                || (!user.isPlatformAdmin() && projects.findAccessibleProject(
                        user.getId(), scan.getProject().getId()).isEmpty())) {
            throw notFound();
        }
        return scan;
    }

    public Manifest manifest(Long scanId, Authentication authentication) {
        return manifest(accessibleScan(scanId, authentication), "/api/scans/" + scanId + "/viewer");
    }

    private Manifest manifest(Scan scan, String base) {
        var scanId = scan.getId();
        var entries = files.findByScan_IdOrderByIdAsc(scanId);
        var scenes = entries.stream().filter(file -> {
            var path = file.getRelativePath().toLowerCase(Locale.ROOT);
            return path.endsWith(".sog") || path.endsWith(".ply");
        }).toList();
        if (scenes.isEmpty()) throw new ResponseStatusException(
                HttpStatus.UNPROCESSABLE_ENTITY, "This scan has no supported SOG or PLY scene.");
        if (scenes.size() > 1) throw new ResponseStatusException(
                HttpStatus.CONFLICT, "This scan contains more than one scene.");
        var scene = scenes.getFirst();
        var path = scene.getRelativePath();
        var folder = path.contains("/") ? path.substring(0, path.lastIndexOf('/') + 1) : "";
        var collisions = entries.stream().filter(file ->
                file.getRelativePath().startsWith(folder)
                && file.getRelativePath().endsWith(".voxel.json")
                && entries.stream().anyMatch(binary -> binary.getRelativePath().equals(
                        file.getRelativePath().replace(".voxel.json", ".voxel.bin")))).toList();
        return new Manifest(signedUrl(scene), path,
                collisions.size() == 1 ? fileUrl(base, collisions.getFirst().getRelativePath()) : null, settings(scan, entries));
    }

    private Scan sharedScan(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) throw notFound();
        var scan = scans.findByShareToken(token).orElseThrow(ScanViewerService::notFound);
        if (!scan.isShareEnabled() || !scan.isHostingEnabled() || scan.getStatus() != Scan.Status.READY)
            throw notFound();
        return scan;
    }

    public record SharingState(boolean enabled, boolean hostingEnabled, String token) {}

    public SharingState sharingState(Long scanId, Authentication authentication) {
        var scan = accessibleScan(scanId, authentication);
        return new SharingState(scan.isShareEnabled(), scan.isHostingEnabled(), scan.getShareToken());
    }

    @Transactional
    public String enableSharing(Long scanId, Authentication authentication) {
        var scan = scans.findForUpdate(scanId).orElseThrow(ScanViewerService::notFound);
        accessibleScan(scanId, authentication);
        if (!scan.isHostingEnabled()) throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Hosted sharing is unavailable for this scan.");
        var bytes = new byte[32];
        new java.security.SecureRandom().nextBytes(bytes);
        scan.enableSharing(java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
        return scan.getShareToken();
    }

    @Transactional
    public void disableSharing(Long scanId, Authentication authentication) {
        var scan = scans.findForUpdate(scanId).orElseThrow(ScanViewerService::notFound);
        accessibleScan(scanId, authentication);
        scan.disableSharing();
    }

    public Manifest sharedManifest(String token) {
        return manifest(sharedScan(token), "/api/public/views/" + token);
    }

    public ScanFile sharedFile(String token, String path) {
        var scan = sharedScan(token);
        return files.findByScan_IdOrderByIdAsc(scan.getId()).stream()
                .filter(file -> file.getRelativePath().equals(path))
                .findFirst().orElseThrow(ScanViewerService::notFound);
    }
    public Download download(Long scanId, Authentication authentication) {
        var scan = accessibleScan(scanId, authentication);
        var entries = files.findByScan_IdOrderByIdAsc(scanId);
        return new Download(scan.getId(), scan.getName(), java.util.List.copyOf(entries), manifest(scanId, authentication));
    }

    public record Download(Long id, String name, java.util.List<ScanFile> files, Manifest viewer) {}

    public ScanFile file(Long scanId, String path, Authentication authentication) {
        var scan = accessibleScan(scanId, authentication);
        // Exact database match only: the request never chooses a bucket or object key.
        var file = files.findByScan_IdOrderByIdAsc(scanId).stream()
                .filter(entry -> entry.getRelativePath().equals(path))
                .findFirst().orElseThrow(ScanViewerService::notFound);
        return file;
    }

    public InputStream openFile(ScanFile file) {
        return r2.getObject(GetObjectRequest.builder().bucket(bucket).key(file.getObjectKey()).build());
    }
    public String signedUrl(ScanFile file) {
        return signer.presignGetObject(
                software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest.builder()
                        .signatureDuration(java.time.Duration.ofHours(1))
                        .getObjectRequest(GetObjectRequest.builder().bucket(bucket).key(file.getObjectKey())
                                .responseCacheControl("private, no-store").build())
                        .build()).url().toString();
    }

    private static String fileUrl(String base, String path) {
        // SuperSplat swaps .voxel.json for .voxel.bin. Keep this same-origin resolver
        // so each object gets its own signature; its response redirects directly to R2.
        return base + "/file?path="
                + UriUtils.encodeQueryParam(path, StandardCharsets.UTF_8);
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Scan not found.");
    }

    @Transactional
    public void setStartingView(Long scanId, StartingView view, Authentication authentication) {
        var user = users.findByEmailIgnoreCase(authentication.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!user.isPlatformAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        validate(view);
        var scan = accessibleScan(scanId, authentication);
        // Serialize edits to this scan, including when multiple application instances run.
        scans.findForUpdate(scanId).orElseThrow(ScanViewerService::notFound);
        var settings = settings(scan, files.findByScan_IdOrderByIdAsc(scanId));
        applyView(settings, view);
        var bytes = JSON.writeValueAsBytes(settings);
        if (bytes.length > 1024 * 1024) throw new ResponseStatusException(
                HttpStatus.UNPROCESSABLE_ENTITY, "Viewer settings are too large.");
        r2.putObject(PutObjectRequest.builder().bucket(bucket).key(settingsKey(scan))
                .contentType("application/json").cacheControl("no-store").build(),
                RequestBody.fromBytes(bytes));
    }

    private static String settingsKey(Scan scan) {
        // Kept outside uploaded files so their recorded sizes and file checks remain valid.
        return "viewer-settings/scans/" + scan.getId() + "/settings.json";
    }

    private ObjectNode readSettings(String key, boolean optional) {
        try (var stream = r2.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build())) {
            var bytes = stream.readNBytes(1024 * 1024 + 1);
            if (bytes.length > 1024 * 1024) throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY, "Viewer settings are too large.");
            var node = JSON.readTree(bytes);
            if (!(node instanceof ObjectNode object)) throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY, "Invalid viewer settings.");
            if (object.has("version") && (!object.get("version").isIntegralNumber()
                    || object.get("version").asInt() != 2)) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Unsupported viewer settings version.");
            }
            return object;
        } catch (S3Exception error) {
            if (optional && error.statusCode() == 404) return null;
            throw error;
        } catch (tools.jackson.core.JacksonException error) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid viewer settings JSON.");
        } catch (IOException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Could not read viewer settings.");
        }
    }

    private ObjectNode settings(Scan scan, java.util.List<ScanFile> entries) {
        var managed = readSettings(settingsKey(scan), true);
        if (managed != null) return managed;
        var uploaded = entries.stream().filter(file -> file.getRelativePath().equals("settings.json")
                || file.getRelativePath().endsWith("/settings.json")).toList();
        if (uploaded.size() == 1) return readSettings(uploaded.getFirst().getObjectKey(), false);
        try (var stream = getClass().getResourceAsStream("/viewer-default-settings.json")) {
            var defaults = (ObjectNode) JSON.readTree(stream);
            // Preserve viewpoints saved by the earlier database-based implementation.
            var previous = StartingView.from(scan.getStartingView());
            if (previous != null) applyView(defaults, previous);
            return defaults;
        } catch (tools.jackson.core.JacksonException error) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid viewer settings JSON.");
        } catch (IOException error) {
            throw new IllegalStateException("Default viewer settings are unavailable.", error);
        }
    }

    private static void applyView(ObjectNode settings, StartingView view) {
        // Never discard backgrounds, annotations, other cameras or unknown settings.
        if (!settings.has("version")) {
            var camera = settings.get("camera") instanceof ObjectNode object ? object : JSON.createObjectNode();
            camera.set("position", JSON.valueToTree(view.position()));
            camera.set("target", JSON.valueToTree(view.target()));
            camera.put("fov", view.fov());
            settings.set("camera", camera);
        } else {
            var cameras = settings.get("cameras") instanceof ArrayNode array ? array : JSON.createArrayNode();
            var camera = cameras.size() > 0 && cameras.get(0) instanceof ObjectNode object
                    ? object : JSON.createObjectNode();
            camera.set("initial", JSON.valueToTree(view));
            if (cameras.isEmpty()) cameras.add(camera); else cameras.set(0, camera);
            settings.set("cameras", cameras);
        }
    }
    private static void validate(StartingView view) {
        if (view == null || !validVector(view.position()) || !validVector(view.target())
                || view.fov() == null || !Double.isFinite(view.fov())
                || view.fov() < 10 || view.fov() > 120) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid starting view.");
        }
        double distanceSquared = 0;
        for (int i = 0; i < 3; i++) {
            double delta = view.position().get(i) - view.target().get(i);
            distanceSquared += delta * delta;
        }
        if (distanceSquared < 0.00000001) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Starting view direction is missing.");
        }
    }

    private static boolean validVector(java.util.List<Double> vector) {
        return vector != null && vector.size() == 3
                && vector.stream().allMatch(value -> value != null && Double.isFinite(value)
                        && Math.abs(value) < 1000000000);
    }

    public record StartingView(java.util.List<Double> position, java.util.List<Double> target, Double fov) {
        static StartingView from(ScanStartingView view) {
            return view == null ? null : new StartingView(view.getPosition(), view.getTarget(), view.getFov());
        }
    }

    public record Manifest(String contentUrl, String contentFilename, String collisionUrl,
            JsonNode settings) {}
}
