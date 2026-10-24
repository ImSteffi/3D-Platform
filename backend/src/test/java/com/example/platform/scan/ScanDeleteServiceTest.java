package com.example.platform.scan;

import com.example.platform.user.User;
import com.example.platform.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ScanDeleteServiceTest {
    final ScanRepository scans = mock(ScanRepository.class);
    final ScanFileRepository files = mock(ScanFileRepository.class);
    final UserRepository users = mock(UserRepository.class);
    final S3Client r2 = mock(S3Client.class);
    final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
    final ScanDeleteService service = new ScanDeleteService(scans, files, users, r2, "bucket", transactions);
    final UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken("admin", null);
    final Scan scan = new Scan(null, "test");
    final ScanFile file = new ScanFile(scan, "scene.sog", "private/scan/scene.sog", 3);

    @BeforeEach void setup() {
        var admin = mock(User.class);
        when(admin.isPlatformAdmin()).thenReturn(true);
        when(users.findByEmailIgnoreCase("admin")).thenReturn(Optional.of(admin));
        when(transactions.getTransaction(any())).thenAnswer(call -> new SimpleTransactionStatus());
        when(scans.findForUpdate(12L)).thenReturn(Optional.of(scan));
        when(files.findByScan_IdOrderByIdAsc(12L)).thenReturn(List.of(file));
        scan.markReady();
        scan.enableSharing("a".repeat(43));
    }

    @Test void revokesThenDeletesOnlyRecordedObjectsAndManagedSettingsBeforeDatabaseRows() {
        service.delete(12L, auth);
        assertFalse(scan.isShareEnabled());
        assertEquals(Scan.Status.FAILED, scan.getStatus());
        var order = inOrder(transactions, r2, files, scans);
        order.verify(transactions).commit(any());
        order.verify(r2).deleteObject(DeleteObjectRequest.builder().bucket("bucket").key(file.getObjectKey()).build());
        order.verify(r2).deleteObject(DeleteObjectRequest.builder().bucket("bucket")
                .key("viewer-settings/scans/12/settings.json").build());
        order.verify(files).deleteAll(List.of(file));
        order.verify(scans).delete(scan);
        order.verify(transactions).commit(any());
    }

    @Test void storageFailureKeepsKeysAndCommittedRevocationSoDeletionCanBeRetried() {
        when(r2.deleteObject(any(DeleteObjectRequest.class)))
                .thenThrow(S3Exception.builder().statusCode(503).build())
                .thenReturn(DeleteObjectResponse.builder().build());
        assertThrows(S3Exception.class, () -> service.delete(12L, auth));
        assertFalse(scan.isShareEnabled());
        assertEquals(Scan.Status.FAILED, scan.getStatus());
        verify(transactions).commit(any());
        verify(transactions).rollback(any());
        verify(files, never()).deleteAll(any());
        verify(scans, never()).delete(any());
        service.delete(12L, auth);
        verify(scans).delete(scan);
    }

    @Test void cleansInterruptedMultipartUploadsAndAcceptsAlreadyCompletedUploads() {
        file.setUploadId("upload");
        when(r2.abortMultipartUpload(any(AbortMultipartUploadRequest.class))).thenThrow(
                S3Exception.builder().statusCode(404).awsErrorDetails(
                        software.amazon.awssdk.awscore.exception.AwsErrorDetails.builder()
                                .errorCode("NoSuchUpload").build()).build());
        service.delete(12L, auth);
        verify(r2).abortMultipartUpload(AbortMultipartUploadRequest.builder().bucket("bucket")
                .key(file.getObjectKey()).uploadId("upload").build());
        verify(scans).delete(scan);
    }

    @Test void memberCannotDeleteEvenWhenTheyCanViewTheScan() {
        var member = mock(User.class);
        when(users.findByEmailIgnoreCase("admin")).thenReturn(Optional.of(member));
        assertEquals(403, assertThrows(ResponseStatusException.class,
                () -> service.delete(12L, auth)).getStatusCode().value());
        verifyNoInteractions(scans, files, r2, transactions);
    }

    @Test void deletingAnAlreadyDeletedScanSucceedsWithoutStorageAccess() {
        when(scans.findForUpdate(12L)).thenReturn(Optional.empty());
        service.delete(12L, auth);
        verifyNoInteractions(files, r2);
    }
}