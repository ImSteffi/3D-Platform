package com.example.platform.scan;

import java.util.List;
import java.util.Optional;
import com.example.platform.project.Project;
import com.example.platform.project.ProjectRepository;
import com.example.platform.user.User;
import com.example.platform.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.S3Client;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ScanViewerServiceTest {
    final ScanRepository scans = mock(ScanRepository.class);
    final ScanFileRepository files = mock(ScanFileRepository.class);
    final ProjectRepository projects = mock(ProjectRepository.class);
    final UserRepository users = mock(UserRepository.class);
    final S3Client r2 = mock(S3Client.class);
    final ScanViewerService service = new ScanViewerService(scans, files, projects, users, r2, "test");
    final User user = new User("Test", "test@example.test", "unused");
    final Project project = new Project(null, "Project");
    final Scan scan = new Scan(project, "Scene");
    final UsernamePasswordAuthenticationToken auth =
            new UsernamePasswordAuthenticationToken("test@example.test", null, List.of());

    final java.util.Map<String, byte[]> objects = new java.util.HashMap<>();
    final tools.jackson.databind.json.JsonMapper json = tools.jackson.databind.json.JsonMapper.builder().build();

    @BeforeEach void setup() {
        when(r2.getObject(any(software.amazon.awssdk.services.s3.model.GetObjectRequest.class))).thenAnswer(call -> {
            var request = call.getArgument(0, software.amazon.awssdk.services.s3.model.GetObjectRequest.class);
            var bytes = objects.get(request.key());
            if (bytes == null) throw software.amazon.awssdk.services.s3.model.NoSuchKeyException.builder()
                    .statusCode(404).build();
            return new software.amazon.awssdk.core.ResponseInputStream<>(
                    software.amazon.awssdk.services.s3.model.GetObjectResponse.builder().contentLength((long) bytes.length).build(),
                    new java.io.ByteArrayInputStream(bytes));
        });
        when(r2.putObject(any(software.amazon.awssdk.services.s3.model.PutObjectRequest.class),
                any(software.amazon.awssdk.core.sync.RequestBody.class))).thenAnswer(call -> {
            var request = call.getArgument(0, software.amazon.awssdk.services.s3.model.PutObjectRequest.class);
            var body = call.getArgument(1, software.amazon.awssdk.core.sync.RequestBody.class);
            try (var stream = body.contentStreamProvider().newStream()) { objects.put(request.key(), stream.readAllBytes()); }
            return software.amazon.awssdk.services.s3.model.PutObjectResponse.builder().build();
        });
        ReflectionTestUtils.setField(user, "id", 2L);
        ReflectionTestUtils.setField(project, "id", 10L);
        ReflectionTestUtils.setField(scan, "id", 1L);
        scan.markReady();
        when(scans.findForUpdate(1L)).thenReturn(Optional.of(scan));
        when(scans.findById(1L)).thenReturn(Optional.of(scan));
        when(users.findByEmailIgnoreCase(auth.getName())).thenReturn(Optional.of(user));
    }

    ScanFile file(String path) { return new ScanFile(scan, path, "private/" + path, 100); }
    void admin() { ReflectionTestUtils.setField(user, "platformAdmin", true); }
    void denied(Runnable action) {
        assertEquals(404, assertThrows(ResponseStatusException.class, action::run).getStatusCode().value());
        verifyNoInteractions(r2);
    }

    @Test void adminOpensPublishedSceneAndVoxelPair() {
        admin();
        when(files.findByScan_IdOrderByIdAsc(1L)).thenReturn(
                List.of(file("room.sog"), file("scene.voxel.json"), file("scene.voxel.bin")));
        var result = service.manifest(1L, auth);
        assertEquals("room.sog", result.contentFilename());
        assertEquals("/api/scans/1/viewer/file?path=scene.voxel.json", result.collisionUrl());
    }

    @Test void memberCanOpenTheirProject() {
        when(projects.findAccessibleProject(2L, 10L)).thenReturn(Optional.of(project));
        when(files.findByScan_IdOrderByIdAsc(1L)).thenReturn(List.of(file("room.sog")));
        assertEquals("room.sog", service.manifest(1L, auth).contentFilename());
    }

    @Test void nonMemberCannotReadManifestOrFiles() {
        when(projects.findAccessibleProject(2L, 10L)).thenReturn(Optional.empty());
        denied(() -> service.manifest(1L, auth));
        denied(() -> service.download(1L, auth));
        denied(() -> service.file(1L, "room.sog", auth));
        verifyNoInteractions(files);
    }

    @Test void unpublishedScanIsUnavailableEvenToAdmin() {
        admin();
        when(scans.findById(1L)).thenReturn(Optional.of(new Scan(project, "Uploading")));
        denied(() -> service.manifest(1L, auth));
        denied(() -> service.download(1L, auth));
        denied(() -> service.file(1L, "room.sog", auth));
        verifyNoInteractions(files);
    }

    @Test void filePathMustMatchThisScanExactly() {
        admin();
        when(files.findByScan_IdOrderByIdAsc(1L)).thenReturn(List.of(file("room.sog")));
        denied(() -> service.file(1L, "../other/room.sog", auth));
    }

    @Test void incompleteVoxelPairIsNotPassedToViewer() {
        admin();
        when(files.findByScan_IdOrderByIdAsc(1L)).thenReturn(
                List.of(file("folder/room.sog"), file("folder/scene.voxel.json")));
        assertNull(service.manifest(1L, auth).collisionUrl());
    }

    @Test void encodesSpecialCharactersInRelativePaths() {
        admin();
        var scene = file("A & B/room #1.sog");
        when(files.findByScan_IdOrderByIdAsc(1L)).thenReturn(List.of(scene));
        var result = service.manifest(1L, auth);
        assertTrue(result.contentUrl().contains("%26"));
        assertTrue(result.contentUrl().contains("%23"));
        assertSame(scene, service.file(1L, "A & B/room #1.sog", auth));
    }

    private ScanViewerService.StartingView pose() {
        return new ScanViewerService.StartingView(List.of(1.0, 2.0, 3.0), List.of(2.0, 2.0, 3.0), 90.0);
    }

    @Test void adminOverwritesSettingsFileAndMembersReadItInManifest() {
        admin();
        service.setStartingView(1L, pose(), auth);
        ReflectionTestUtils.setField(user, "platformAdmin", false);
        when(projects.findAccessibleProject(2L, 10L)).thenReturn(Optional.of(project));
        when(files.findByScan_IdOrderByIdAsc(1L)).thenReturn(List.of(file("room.sog")));
        var result = service.manifest(1L, auth).settings().path("cameras").get(0).path("initial");
        assertEquals(pose(), json.treeToValue(result, ScanViewerService.StartingView.class));
        assertNull(scan.getStartingView());
        assertTrue(objects.containsKey("viewer-settings/scans/1/settings.json"));
    }

    @Test void memberCannotChangeViewEvenWithProjectAccess() {
        var failure = assertThrows(ResponseStatusException.class,
                () -> service.setStartingView(1L, pose(), auth));
        assertEquals(403, failure.getStatusCode().value());
        assertNull(scan.getStartingView());
        verifyNoInteractions(scans, r2);
    }

    @Test void cannotSetViewOnUnpublishedScan() {
        admin();
        when(scans.findById(1L)).thenReturn(Optional.of(new Scan(project, "Uploading")));
        denied(() -> service.setStartingView(1L, pose(), auth));
    }

    @Test void rejectsInvalidCameraDataBeforeWriting() {
        admin();
        var p = List.of(1.0, 2.0, 3.0);
        var invalid = List.of(
                new ScanViewerService.StartingView(null, p, 90.0),
                new ScanViewerService.StartingView(List.of(1.0), p, 90.0),
                new ScanViewerService.StartingView(List.of(Double.NaN, 2.0, 3.0), p, 90.0),
                new ScanViewerService.StartingView(p, List.of(Double.POSITIVE_INFINITY, 2.0, 3.0), 90.0),
                new ScanViewerService.StartingView(p, p, 90.0),
                new ScanViewerService.StartingView(p, List.of(2.0, 2.0, 3.0), 180.0));
        for (var view : invalid) {
            assertEquals(400, assertThrows(ResponseStatusException.class,
                    () -> service.setStartingView(1L, view, auth)).getStatusCode().value());
        }
        assertNull(scan.getStartingView());
        verifyNoInteractions(scans, r2);
    }

    @Test void preservesOtherSettingsAndRepeatedSavesUseSameFile() {
        admin();
        objects.put("viewer-settings/scans/1/settings.json", """
                {"version":2,"background":{"color":[1,0,0]},"annotations":[{"title":"Keep"}],
                 "cameras":[{"initial":{},"extras":"keep"},{"initial":{"fov":75}}],"custom":"keep"}
                """.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        service.setStartingView(1L, pose(), auth);
        service.setStartingView(1L, new ScanViewerService.StartingView(
                List.of(5.0,6.0,7.0), List.of(6.0,6.0,7.0), 80.0), auth);
        var saved = json.readTree(objects.get("viewer-settings/scans/1/settings.json"));
        assertEquals("Keep", saved.path("annotations").get(0).path("title").asString());
        assertEquals("keep", saved.path("custom").asString());
        assertEquals("keep", saved.path("cameras").get(0).path("extras").asString());
        assertEquals(2, saved.path("cameras").size());
        assertEquals(5.0, saved.path("cameras").get(0).path("initial").path("position").get(0).asDouble());
        assertEquals(1, objects.size());
    }

    @Test void importsAnUploadedSettingsFileWithoutChangingItsOriginalObject() {
        admin();
        var bytes = """
                {"version":2,"background":{"color":[1,0,0]},"cameras":[],"annotations":[],"custom":"keep"}
                """.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        objects.put("private/settings.json", bytes);
        when(files.findByScan_IdOrderByIdAsc(1L)).thenReturn(List.of(file("settings.json")));
        service.setStartingView(1L, pose(), auth);
        assertArrayEquals(bytes, objects.get("private/settings.json"));
        var saved = json.readTree(objects.get("viewer-settings/scans/1/settings.json"));
        assertEquals("keep", saved.path("custom").asString());
    }

    @Test void malformedSettingsAreNotOverwritten() {
        admin();
        var bytes = "not JSON".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        objects.put("viewer-settings/scans/1/settings.json", bytes);
        assertEquals(422, assertThrows(ResponseStatusException.class,
                () -> service.setStartingView(1L, pose(), auth)).getStatusCode().value());
        assertArrayEquals(bytes, objects.get("viewer-settings/scans/1/settings.json"));
        verify(r2, never()).putObject(any(software.amazon.awssdk.services.s3.model.PutObjectRequest.class),
                any(software.amazon.awssdk.core.sync.RequestBody.class));
    }}