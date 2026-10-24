package com.example.platform.scan;

import com.example.platform.project.ProjectRepository;
import com.example.platform.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.S3Client;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ScanSharingTest {
    final ScanRepository scans = mock(ScanRepository.class);
    final ScanFileRepository files = mock(ScanFileRepository.class);
    final ProjectRepository projects = mock(ProjectRepository.class);
    final UserRepository users = mock(UserRepository.class);
    final ScanViewerService service = new ScanViewerService(scans, files, projects, users, mock(S3Client.class), "test");
    final String token = "a".repeat(43);

    Scan shared(boolean enabled, boolean entitled, Scan.Status status) {
        var scan = mock(Scan.class);
        when(scan.getId()).thenReturn(12L);
        when(scan.getStatus()).thenReturn(status);
        when(scan.isShareEnabled()).thenReturn(enabled);
        when(scan.isHostingEnabled()).thenReturn(entitled);
        when(scans.findByShareToken(token)).thenReturn(Optional.of(scan));
        return scan;
    }

    @Test void publicFileRequiresBothSharingAndHostingAndReady() {
        for (var state : List.of(
                new Object[]{false, true, Scan.Status.READY},
                new Object[]{true, false, Scan.Status.READY},
                new Object[]{true, true, Scan.Status.UPLOADING},
                new Object[]{true, true, Scan.Status.FAILED})) {
            shared((boolean) state[0], (boolean) state[1], (Scan.Status) state[2]);
            assertEquals(404, assertThrows(ResponseStatusException.class,
                    () -> service.sharedFile(token, "scene.sog")).getStatusCode().value());
        }
        verifyNoInteractions(files);
    }

    @Test void publicFilesAreRestrictedToExactPathsOfTheSharedScan() {
        shared(true, true, Scan.Status.READY);
        var file = new ScanFile(null, "scene.sog", "private/object", 3);
        when(files.findByScan_IdOrderByIdAsc(12L)).thenReturn(List.of(file));
        assertSame(file, service.sharedFile(token, "scene.sog"));
        assertThrows(ResponseStatusException.class, () -> service.sharedFile(token, "../other/scene.sog"));
        assertThrows(ResponseStatusException.class, () -> service.sharedFile(token, "private/object"));
    }

    @Test void invalidTokensNeverQueryTheDatabase() {
        assertThrows(ResponseStatusException.class, () -> service.sharedFile("12", "scene.sog"));
        verifyNoInteractions(scans, files);
    }

    @Test void disablingAndReenablingPreservesTheOriginalLink() {
        var scan = new Scan(null, "test");
        scan.enableSharing(token);
        scan.disableSharing();
        assertFalse(scan.isShareEnabled());
        assertEquals(token, scan.getShareToken());
        scan.enableSharing("b".repeat(43));
        assertTrue(scan.isShareEnabled());
        assertEquals(token, scan.getShareToken());
    }

    @Test void readingSharingStatusDoesNotActivateSharing() {
        var scan = new Scan(null, "test");
        scan.markReady();
        var user = mock(com.example.platform.user.User.class);
        when(user.isPlatformAdmin()).thenReturn(true);
        when(users.findByEmailIgnoreCase("admin")).thenReturn(Optional.of(user));
        when(scans.findById(12L)).thenReturn(Optional.of(scan));
        var state = service.sharingState(12L,
                new UsernamePasswordAuthenticationToken("admin", null));
        assertFalse(state.enabled());
        assertNull(state.token());
        assertFalse(scan.isShareEnabled());
        verify(scans, never()).findForUpdate(any());
    }

    @Test void enablingSharingRequiresExistingProjectAccess() {
        var scan = mock(Scan.class);
        when(scans.findForUpdate(12L)).thenReturn(Optional.of(scan));
        when(scans.findById(12L)).thenReturn(Optional.of(scan));
        when(users.findByEmailIgnoreCase("outsider")).thenReturn(Optional.empty());
        assertThrows(ResponseStatusException.class, () -> service.enableSharing(12L,
                new UsernamePasswordAuthenticationToken("outsider", null)));
        verify(scan, never()).enableSharing(any());
    }
}