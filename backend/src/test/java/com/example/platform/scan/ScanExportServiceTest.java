package com.example.platform.scan;

import java.io.OutputStream;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.*;
import software.amazon.awssdk.core.sync.RequestBody;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ScanExportServiceTest {
    @org.junit.jupiter.api.BeforeEach void missingCacheByDefault() {
        when(r2.headObject(any(HeadObjectRequest.class)))
                .thenThrow(S3Exception.builder().statusCode(404).build());
    }
    final ScanViewerService viewer = mock(ScanViewerService.class);
    final ScanDownloadService downloads = mock(ScanDownloadService.class);
    final S3Client r2 = mock(S3Client.class);
    final S3Presigner signer = mock(S3Presigner.class);
    final UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken("member", null);

    @Test void duplicateClicksShareOnePendingJobAndFailuresAreRetryable() throws Exception {
        var service = new ScanExportService(viewer, downloads, r2, signer, "bucket");
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        when(downloads.prepare(eq(12L), any())).thenAnswer(call -> {
            entered.countDown();
            assertTrue(release.await(3, TimeUnit.SECONDS));
            throw new IllegalStateException("Storage failed");
        });
        try {
            var first = service.start(12L, auth);
            assertTrue(entered.await(3, TimeUnit.SECONDS));
            assertEquals(first.id(), service.start(12L, auth).id());
            release.countDown();
            assertEquals("FAILED", await(service, first.id()).status());
            var retry = service.start(12L, auth);
            assertNotEquals(first.id(), retry.id());
            assertEquals("FAILED", await(service, retry.id()).status());
            verify(signer, never()).presignGetObject(any(GetObjectPresignRequest.class));
        } finally { release.countDown(); service.shutdown(); }
    }

    @Test void returnsSignedDownloadOnlyAfterMultipartIsCompleteAndAccessIsCheckedAgain() throws Exception {
        var service = new ScanExportService(viewer, downloads, r2, signer, "bucket");
        var export = new ScanDownloadService.Export("3D-viewer", List.of(), new byte[0], new byte[0], List.of());
        when(downloads.prepare(eq(12L), any())).thenReturn(export);
        when(downloads.fingerprint(export)).thenReturn("fingerprint");
        doAnswer(call -> { call.getArgument(1, OutputStream.class).write(new byte[]{1,2,3}); return null; })
                .when(downloads).write(eq(export), any());
        when(r2.createMultipartUpload(any(CreateMultipartUploadRequest.class)))
                .thenReturn(CreateMultipartUploadResponse.builder().uploadId("upload").build());
        when(r2.uploadPart(any(UploadPartRequest.class), any(RequestBody.class)))
                .thenReturn(UploadPartResponse.builder().eTag("etag").build());
        var signed = mock(PresignedGetObjectRequest.class);
        when(signed.url()).thenReturn(java.net.URI.create("https://example.test/temporary-exports/test.zip").toURL());
        when(signer.presignGetObject(any(GetObjectPresignRequest.class))).thenReturn(signed);
        try {
            var first = service.start(12L, auth);
            var result = await(service, first.id());
            assertEquals("READY", result.status());
            assertEquals(signed.url().toString(), result.url());
            var presign = org.mockito.ArgumentCaptor.forClass(GetObjectPresignRequest.class);
            verify(signer).presignGetObject(presign.capture());
            assertEquals(Duration.ofMinutes(15), presign.getValue().signatureDuration());
            assertTrue(presign.getValue().getObjectRequest().key().startsWith("temporary-exports/scans/12/"));
            verify(r2).completeMultipartUpload(any(CompleteMultipartUploadRequest.class));
            assertThrows(ResponseStatusException.class, () -> service.status(13L, first.id(), auth));
            when(viewer.accessibleScan(12L, auth)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
            assertThrows(ResponseStatusException.class, () -> service.status(12L, first.id(), auth));
        } finally { service.shutdown(); }
    }

    @Test void existingZipIsReusedAcrossBackendRestartsWithoutWritingAnotherObject() throws Exception {
        var export = new ScanDownloadService.Export("3D-viewer", List.of(), new byte[0], new byte[0], List.of());
        when(downloads.prepare(eq(12L), any())).thenReturn(export);
        when(downloads.fingerprint(export)).thenReturn("same-content-hash");
        when(r2.headObject(any(HeadObjectRequest.class))).thenReturn(HeadObjectResponse.builder()
                .contentLength(100L).lastModified(java.time.Instant.now()).build());
        var signed = mock(PresignedGetObjectRequest.class);
        when(signed.url()).thenReturn(java.net.URI.create("https://example.test/cached.zip").toURL());
        when(signer.presignGetObject(any(GetObjectPresignRequest.class))).thenReturn(signed);

        for (int restart = 0; restart < 2; restart++) {
            var service = new ScanExportService(viewer, downloads, r2, signer, "bucket");
            try {
                var first = service.start(12L, auth);
                assertEquals("READY", await(service, first.id()).status());
            } finally { service.shutdown(); }
        }
        verify(r2, times(2)).headObject(HeadObjectRequest.builder().bucket("bucket")
                .key("temporary-exports/scans/12/same-content-hash/3D-viewer.zip").build());
        verify(downloads, never()).write(any(), any());
        verify(r2, never()).createMultipartUpload(any(CreateMultipartUploadRequest.class));
    }

    @Test void storagePermissionErrorDoesNotPretendTheCachedZipIsMissing() throws Exception {
        var service = new ScanExportService(viewer, downloads, r2, signer, "bucket");
        var export = new ScanDownloadService.Export("3D-viewer", List.of(), new byte[0], new byte[0], List.of());
        when(downloads.prepare(eq(12L), any())).thenReturn(export);
        when(downloads.fingerprint(export)).thenReturn("fingerprint");
        when(r2.headObject(any(HeadObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(403).build());
        try {
            var job = service.start(12L, auth);
            assertEquals("FAILED", await(service, job.id()).status());
            verify(r2, never()).createMultipartUpload(any(CreateMultipartUploadRequest.class));
            verify(r2, never()).deleteObject(any(DeleteObjectRequest.class));
        } finally { service.shutdown(); }
    }
    @Test void unauthorizedStartDoesNotReadFilesOrWriteToR2() {
        var service = new ScanExportService(viewer, downloads, r2, signer, "bucket");
        when(viewer.accessibleScan(12L, auth)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
        try {
            assertThrows(ResponseStatusException.class, () -> service.start(12L, auth));
            verifyNoInteractions(downloads, r2, signer);
        } finally { service.shutdown(); }
    }

    ScanExportService.ExportStatus await(ScanExportService service, String id) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        ScanExportService.ExportStatus result;
        do {
            result = service.status(12L, id, auth);
            if (!result.status().equals("PREPARING")) return result;
            Thread.sleep(5);
        } while (System.nanoTime() < deadline);
        fail("Export did not finish");
        return result;
    }
}