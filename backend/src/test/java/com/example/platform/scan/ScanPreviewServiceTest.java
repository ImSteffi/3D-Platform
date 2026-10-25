package com.example.platform.scan;

import java.io.*;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import com.example.platform.user.User;
import com.example.platform.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.core.sync.RequestBody;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ScanPreviewServiceTest {
    final ScanViewerService viewer = mock(ScanViewerService.class);
    final ScanRepository scans = mock(ScanRepository.class);
    final UserRepository users = mock(UserRepository.class);
    final S3Client r2 = mock(S3Client.class);
    final ScanPreviewService service = new ScanPreviewService(viewer, scans, users, r2, "bucket");
    final UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken("admin", null);

    static byte[] png(int width, int height) throws IOException {
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", bytes);
        return bytes.toByteArray();
    }

    void admin() {
        var admin = mock(User.class);
        when(admin.isPlatformAdmin()).thenReturn(true);
        when(users.findByEmailIgnoreCase("admin")).thenReturn(Optional.of(admin));
        when(scans.findForUpdate(12L)).thenReturn(Optional.of(new Scan(null, "test")));
    }

    @Test void storesNormalizedPngAtFixedScanKey() throws Exception {
        admin();
        service.save(12L, new ByteArrayInputStream(png(800, 600)), auth);
        var request = org.mockito.ArgumentCaptor.forClass(PutObjectRequest.class);
        var body = org.mockito.ArgumentCaptor.forClass(RequestBody.class);
        verify(r2).putObject(request.capture(), body.capture());
        assertEquals("viewer-previews/scans/12/preview.png", request.getValue().key());
        assertEquals("image/png", request.getValue().contentType());
        try (var input = body.getValue().contentStreamProvider().newStream()) {
            var image = ImageIO.read(input);
            assertEquals(800, image.getWidth());
            assertEquals(600, image.getHeight());
        }
        verify(viewer).accessibleScan(12L, auth);
        verify(scans).findForUpdate(12L);
    }

    @Test void membersCannotSetPreview() {
        when(users.findByEmailIgnoreCase("admin")).thenReturn(Optional.of(mock(User.class)));
        assertEquals(403, assertThrows(ResponseStatusException.class,
                () -> service.save(12L, new ByteArrayInputStream(new byte[0]), auth)).getStatusCode().value());
        verifyNoInteractions(r2, scans);
    }

    @Test void rejectsInvalidAndOversizedImages() throws Exception {
        assertThrows(ResponseStatusException.class, () -> ScanPreviewService.normalize(new byte[]{1,2,3}));
        assertThrows(ResponseStatusException.class, () -> ScanPreviewService.normalize(png(2049, 1)));
        admin();
        assertEquals(413, assertThrows(ResponseStatusException.class, () -> service.save(12L,
                new ByteArrayInputStream(new byte[ScanPreviewService.MAX_BYTES + 1]), auth)).getStatusCode().value());
        verifyNoInteractions(r2);
    }

    @Test void missingPreviewLeavesAnEmptyPlaceholder() {
        when(r2.getObject(any(GetObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(404).build());
        assertNull(service.get(12L, auth));
        verify(viewer).accessibleScan(12L, auth);
    }
}