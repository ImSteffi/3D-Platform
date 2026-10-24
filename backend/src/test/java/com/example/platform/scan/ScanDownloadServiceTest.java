package com.example.platform.scan;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ScanDownloadServiceTest {
    final ScanViewerService viewer = mock(ScanViewerService.class);
    final ScanDownloadService downloads = new ScanDownloadService(viewer);
    final JsonMapper json = JsonMapper.builder().build();
    final UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken("test", null);
    final ScanFile sog = new ScanFile(null, "folder/A & B.sog", "private/sog", 3);
    final ScanFile collision = new ScanFile(null, "folder/scene.voxel.json", "private/json", 2);
    final ScanFile binary = new ScanFile(null, "folder/scene.voxel.bin", "private/bin", 4);

    void setup(List<ScanFile> files, String settings) throws Exception {
        var manifest = new ScanViewerService.Manifest("/api/secret", sog.getRelativePath(),
                "/api/scans/1/viewer/file?path=folder%2Fscene.voxel.json", json.readTree(settings));
        when(viewer.download(1L, auth)).thenReturn(new ScanViewerService.Download(1L, "A project", files, manifest));
        when(viewer.openFile(sog)).thenReturn(new ByteArrayInputStream(new byte[]{1,2,3}));
        when(viewer.openFile(collision)).thenReturn(new ByteArrayInputStream("{}".getBytes(StandardCharsets.UTF_8)));
        when(viewer.openFile(binary)).thenReturn(new ByteArrayInputStream(new byte[]{4,5,6,7}));
    }

    @Test void bundlesViewerSettingsInstructionsAndExactSceneBytes() throws Exception {
        setup(List.of(sog, collision, binary), """
                {"version":2,"cameras":[{"initial":{"position":[1,2,3],"target":[2,2,3],"fov":90}}]}
                """);
        var export = downloads.prepare(1L, auth);
        var out = new ByteArrayOutputStream();
        downloads.write(export, out);
        var entries = new HashMap<String, byte[]>();
        try (var zip = new ZipInputStream(new ByteArrayInputStream(out.toByteArray()))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) entries.put(entry.getName(), zip.readAllBytes());
        }
        String root = export.name() + "/";
        assertEquals("3D-viewer/", root);
        assertTrue(entries.containsKey(root + "README.html"));
        assertFalse(entries.containsKey(root + "README_EST.txt"));
        assertFalse(entries.containsKey(root + "README_ENG.txt"));
        assertFalse(entries.containsKey(root + "embed.html"));
        var readme = new String(entries.get(root + "README.html"), StandardCharsets.UTF_8);
        assertFalse(readme.contains("localhost"));
        assertFalse(readme.contains("<iframe"));
        assertFalse(readme.contains("<img"));
        assertTrue(readme.contains("Copy to your page"));
        assertTrue(readme.contains("EST"));
        assertTrue(readme.contains("ENG"));
        assertTrue(readme.contains("&lt;iframe"));
        assertTrue(entries.containsKey(root + "viewer/index.html"));
        assertTrue(entries.containsKey(root + "viewer/index.js"));
        assertTrue(entries.containsKey(root + "viewer/theme.css"));
        assertTrue(new String(entries.get(root + "viewer/index.html"), StandardCharsets.UTF_8).contains("./theme.css"));
        assertTrue(entries.containsKey(root + "viewer/licenses/supersplat-viewer-LICENSE.txt"));
        assertArrayEquals(new byte[]{1,2,3}, entries.get(root + "viewer/data/folder/A & B.sog"));
        assertArrayEquals(new byte[]{4,5,6,7}, entries.get(root + "viewer/data/folder/scene.voxel.bin"));
        var scene = json.readTree(entries.get(root + "viewer/scene.json"));
        assertEquals("./data/folder/A%20&%20B.sog", scene.path("contentUrl").asString());
        assertEquals("./data/folder/scene.voxel.json", scene.path("collisionUrl").asString());
        assertFalse(scene.toString().contains("/api/"));
        assertEquals(90, json.readTree(entries.get(root + "viewer/settings.json"))
                .path("cameras").get(0).path("initial").path("fov").asInt());
    }

    @Test void accessIsCheckedBeforeBuildingOrReadingObjects() {
        when(viewer.download(1L, auth)).thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND));
        assertThrows(ResponseStatusException.class, () -> downloads.prepare(1L, auth));
        verify(viewer, never()).openFile(any());
    }

    @Test void rejectsUnsafeAndConflictingFilePaths() {
        for (var path : List.of("../outside", "/absolute", "a/../b", "a\\b", "a//b", "C:/file", "file.")) {
            assertThrows(ResponseStatusException.class, () -> ScanDownloadService.validatePaths(
                    List.of(new ScanFile(null, path, "test", 0))), path);
        }
        assertThrows(ResponseStatusException.class, () -> ScanDownloadService.validatePaths(
                List.of(new ScanFile(null, "a", "a", 0), new ScanFile(null, "a/b", "b", 0))));
        assertThrows(ResponseStatusException.class, () -> ScanDownloadService.validatePaths(
                List.of(new ScanFile(null, "a.sog", "a", 0), new ScanFile(null, "A.sog", "b", 0))));
    }

    @Test void incompleteStorageReadDoesNotProduceAValidArchive(@TempDir java.nio.file.Path directory) throws Exception {
        setup(List.of(sog), "{}");
        when(viewer.openFile(sog)).thenReturn(new ByteArrayInputStream(new byte[]{1}));
        var export = downloads.prepare(1L, auth);
        var out = new ByteArrayOutputStream();
        assertThrows(IOException.class, () -> downloads.write(export, out));
        var file = directory.resolve("broken.zip");
        java.nio.file.Files.write(file, out.toByteArray());
        assertThrows(ZipException.class, () -> new ZipFile(file.toFile()));
    }

    @Test void rewritesBundledMediaPathsAndRejectsExternalDependencies() throws Exception {
        var skybox = new ScanFile(null, "folder/skybox.jpg", "private/skybox", 0);
        var originalSettings = new ScanFile(null, "folder/settings.json", "private/settings", 0);
        setup(List.of(sog, skybox, originalSettings), """
                {"version":2,"background":{"skyboxUrl":"skybox.jpg"}}
                """);
        var export = downloads.prepare(1L, auth);
        assertEquals("./data/folder/skybox.jpg", json.readTree(export.settings()).path("background").path("skyboxUrl").asString());
        setup(List.of(sog), """
                {"version":2,"soundUrl":"https://example.com/private/audio.mp3"}
                """);
        assertThrows(ResponseStatusException.class, () -> downloads.prepare(1L, auth));
    }
    @Test void excludesWindowsZoneMetadataBeforeValidatingOrReadingFiles() throws Exception {
        var paths = List.of("scene.sog:Zone.Identifier", "scene.sog\uF03AZone.Identifier",
                "folder/Zone.Identifier", "scene.sog:ZONE.IDENTIFIER:$DATA");
        var files = new ArrayList<ScanFile>();
        files.add(sog);
        for (var path : paths) {
            assertTrue(ScanDownloadService.isZoneIdentifier(path), path);
            files.add(new ScanFile(null, path, "metadata", 99));
        }
        assertFalse(ScanDownloadService.isZoneIdentifier("zone.identifier.sog"));
        setup(files, "{}");
        var export = downloads.prepare(1L, auth);
        assertEquals(List.of(sog), export.files());
        var output = new ByteArrayOutputStream();
        downloads.write(export, output);
        try (var zip = new ZipInputStream(new ByteArrayInputStream(output.toByteArray()))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                assertFalse(entry.getName().toLowerCase(Locale.ROOT).contains("zone.identifier"));
            }
        }
        for (var file : files.subList(1, files.size())) verify(viewer, never()).openFile(file);
    }}
