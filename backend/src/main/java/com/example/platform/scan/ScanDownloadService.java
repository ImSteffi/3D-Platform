package com.example.platform.scan;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

@Service
public class ScanDownloadService {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final ScanViewerService viewer;

    public ScanDownloadService(ScanViewerService viewer) { this.viewer = viewer; }

    public Export prepare(Long scanId, Authentication authentication) {
        var scan = viewer.download(scanId, authentication);
        var files = scan.files().stream().filter(file -> !isZoneIdentifier(file.getRelativePath())).toList();
        validatePaths(files);
        var bundle = bundleFiles();
        var settings = scan.viewer().settings().deepCopy();
        rewriteAssets(settings, files);
        var metadata = JSON.createObjectNode();
        metadata.put("contentUrl", dataUrl(scan.viewer().contentFilename()));
        metadata.put("contentFilename", scan.viewer().contentFilename());
        if (scan.viewer().collisionUrl() != null) {
            var query = scan.viewer().collisionUrl();
            var path = java.net.URLDecoder.decode(query.substring(query.indexOf("?path=") + 6), StandardCharsets.UTF_8);
            metadata.put("collisionUrl", dataUrl(path));
        }
        var name = "3D-viewer";
        return new Export(name, files, JSON.writeValueAsBytes(settings),
                JSON.writeValueAsBytes(metadata), bundle);
    }

    public String fingerprint(Export export) throws IOException {
        try {
            var digest = java.security.MessageDigest.getInstance("SHA-256");
            var output = new java.io.DataOutputStream(new java.security.DigestOutputStream(
                    OutputStream.nullOutputStream(), digest));
            // Bump when changing ZIP layout/encoding outside the packaged resource files.
            output.writeUTF("viewer-export-format-v1");
            output.writeUTF(export.name());
            output.writeInt(export.settings().length);
            output.write(export.settings());
            output.writeInt(export.metadata().length);
            output.write(export.metadata());
            var entries = export.files().stream().sorted(
                    java.util.Comparator.comparing(ScanFile::getRelativePath)).toList();
            output.writeInt(entries.size());
            for (var file : entries) {
                // READY scan objects are immutable; replacement uploads receive new object keys.
                output.writeUTF(file.getRelativePath());
                output.writeUTF(file.getObjectKey());
                output.writeLong(file.getSizeBytes());
            }
            fingerprintResource(output, "viewer-export/README.html");
            for (var file : export.bundle().stream().sorted().toList())
                fingerprintResource(output, "viewer-export/bundle/" + file);
            output.flush();
            return java.util.HexFormat.of().formatHex(digest.digest());
        } catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }

    private static void fingerprintResource(java.io.DataOutputStream output, String path) throws IOException {
        var resource = new ClassPathResource(path);
        output.writeUTF(path);
        output.writeLong(resource.contentLength());
        try (var input = resource.getInputStream()) { input.transferTo(output); }
    }

    public void write(Export export, OutputStream output) throws IOException {
        var zip = new ExportZip(output);
        var root = export.name() + "/";
        try {
            zip.setLevel(Deflater.BEST_SPEED);
            resource(zip, root + "README.html", "viewer-export/README.html");
            for (var file : export.bundle()) resource(zip, root + "viewer/" + file, "viewer-export/bundle/" + file);
            bytes(zip, root + "viewer/settings.json", export.settings());
            bytes(zip, root + "viewer/scene.json", export.metadata());
            // Scene formats are already compressed; stream without holding them in memory.
            zip.setLevel(Deflater.NO_COMPRESSION);
            for (var file : export.files()) {
                zip.putNextEntry(new ZipEntry(root + "viewer/data/" + file.getRelativePath()));
                try (var input = viewer.openFile(file)) {
                    if (input.transferTo(zip) != file.getSizeBytes())
                        throw new IOException("Scene file size changed during export.");
                }
                zip.closeEntry();
            }
            zip.finish();
            zip.flush();
        } finally {
            // On a storage/client failure do not finish a misleading, incomplete ZIP.
            zip.release();
        }
    }

    private static List<String> bundleFiles() {
        try (var stream = new ClassPathResource("viewer-export/bundle/bundle-files.json").getInputStream()) {
            var paths = java.util.Arrays.stream(JSON.readValue(stream, String[].class))
                    .filter(path -> !isZoneIdentifier(path)).toList();
            if (!paths.contains("index.html") || !paths.contains("index.js") || !paths.contains("theme.css"))
                throw new IOException("Incomplete viewer bundle.");
            for (var path : paths) {
                safePath(path);
                if (!new ClassPathResource("viewer-export/bundle/" + path).exists())
                    throw new IOException("Missing viewer bundle file.");
            }
            return paths;
        } catch (IOException error) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Viewer export files are missing. Build the viewer bundle before starting the backend.");
        }
    }

    static boolean isZoneIdentifier(String path) {
        return path != null && path.replace('\\', '/')
                .matches("(?i).*(?:^|[/:\\uF03A\\uFF1A])zone\\.identifier(?::\\$data)?$");
    }

    static void validatePaths(List<ScanFile> files) {
        Set<String> paths = new HashSet<>();
        for (var file : files) {
            var path = file.getRelativePath();
            safePath(path);
            if (!paths.add(path.toLowerCase(Locale.ROOT))) throw invalidPaths();
        }
        for (var path : paths) {
            int slash = path.indexOf('/');
            while (slash >= 0) {
                if (paths.contains(path.substring(0, slash))) throw invalidPaths();
                slash = path.indexOf('/', slash + 1);
            }
        }
    }

    private static void safePath(String path) {
        if (path == null || path.isBlank() || path.chars().anyMatch(character -> character < 32) || path.startsWith("/") || path.contains("\\")
                || path.matches(".*[\\x00-\\x1f<>:\"|?*].*")) throw invalidPaths();
        for (var segment : path.split("/", -1)) {
            if (segment.isEmpty() || segment.equals(".") || segment.equals("..")
                    || segment.endsWith(" ") || segment.endsWith(".")) throw invalidPaths();
        }
    }

    private static ResponseStatusException invalidPaths() {
        return new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                "Some scene file paths cannot be safely included in a downloadable ZIP.");
    }

    private static String dataUrl(String path) {
        return "./data/" + UriUtils.encodePath(path, StandardCharsets.UTF_8);
    }

    private static void rewriteAssets(JsonNode settings, List<ScanFile> files) {
        String folder = "";
        var originals = files.stream().filter(file -> file.getRelativePath().equals("settings.json")
                || file.getRelativePath().endsWith("/settings.json")).toList();
        if (originals.size() == 1) {
            var path = originals.getFirst().getRelativePath();
            if (path.contains("/")) folder = path.substring(0, path.lastIndexOf('/') + 1);
        }
        rewriteNode(settings, files, folder);
    }

    private static void rewriteNode(JsonNode node, List<ScanFile> files, String folder) {
        if (node instanceof ObjectNode object) {
            for (var key : List.of("soundUrl", "skyboxUrl", "posterUrl")) {
                var value = object.get(key);
                if (value != null && value.isString() && !value.asString().isBlank()) {
                    var path = folder + value.asString();
                    if (files.stream().noneMatch(file -> file.getRelativePath().equals(path)))
                        throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                                "A viewer asset is external or missing. Upload it with the scan before downloading.");
                    object.put(key, dataUrl(path));
                }
            }
        }
        if (node.isContainer()) for (var child : node) rewriteNode(child, files, folder);
    }

    private static void resource(ZipOutputStream zip, String name, String resource) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        try (var input = new ClassPathResource(resource).getInputStream()) { input.transferTo(zip); }
        zip.closeEntry();
    }

    private static void bytes(ZipOutputStream zip, String name, byte[] bytes) throws IOException {
        zip.putNextEntry(new ZipEntry(name)); zip.write(bytes); zip.closeEntry();
    }

    private static class ExportZip extends ZipOutputStream {
        ExportZip(OutputStream output) { super(output, StandardCharsets.UTF_8); }
        void release() { def.end(); }
    }

    public record Export(String name, List<ScanFile> files, byte[] settings, byte[] metadata, List<String> bundle) {}
}
