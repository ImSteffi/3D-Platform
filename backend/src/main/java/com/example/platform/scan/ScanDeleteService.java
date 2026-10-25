package com.example.platform.scan;

import com.example.platform.user.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

@Service
public class ScanDeleteService {
    private final ScanRepository scans;
    private final ScanFileRepository files;
    private final UserRepository users;
    private final S3Client r2;
    private final String bucket;
    private final TransactionTemplate transaction;

    public ScanDeleteService(ScanRepository scans, ScanFileRepository files, UserRepository users,
            S3Client r2, @Value("${storage.r2.bucket-name}") String bucket,
            PlatformTransactionManager transactions) {
        this.scans = scans;
        this.files = files;
        this.users = users;
        this.r2 = r2;
        this.bucket = bucket;
        this.transaction = new TransactionTemplate(transactions);
    }

    public void delete(Long scanId, Authentication authentication) {
        if (authentication == null || users.findByEmailIgnoreCase(authentication.getName())
                .filter(user -> user.isPlatformAdmin()).isEmpty())
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);

        // Commit revocation before touching storage. A failed cleanup must not
        // restore public access or allow uploads to finish against deleted objects.
        transaction.executeWithoutResult(status -> scans.findForUpdate(scanId).ifPresent(scan -> {
            scan.disableSharing();
            scan.markFailed();
            scans.flush();
        }));

        transaction.executeWithoutResult(status -> {
            var scan = scans.findForUpdate(scanId).orElse(null);
            if (scan == null) return; // Safe retry after a lost successful response.
            var entries = files.findByScan_IdOrderByIdAsc(scanId);
            for (var file : entries) {
                if (file.getUploadId() != null) {
                    try {
                        r2.abortMultipartUpload(AbortMultipartUploadRequest.builder().bucket(bucket)
                                .key(file.getObjectKey()).uploadId(file.getUploadId()).build());
                    } catch (S3Exception error) {
                        if (error.awsErrorDetails() == null
                                || !"NoSuchUpload".equals(error.awsErrorDetails().errorCode())) throw error;
                    }
                }
                r2.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(file.getObjectKey()).build());
            }
            r2.deleteObject(DeleteObjectRequest.builder().bucket(bucket)
                    .key("viewer-settings/scans/" + scanId + "/settings.json").build());
            r2.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(ScanPreviewService.key(scanId)).build());
            // Keep every key recorded until all storage cleanup has succeeded.
            files.deleteAll(entries);
            files.flush();
            scans.delete(scan);
            scans.flush();
        });
    }
}