package com.example.platform.scan;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

@Service
public class ScanExportService {
    private final ScanViewerService viewer;
    private final ScanDownloadService downloads;
    private final S3Client r2;
    private final S3Presigner signer;
    private final String bucket;
    private final Map<String, Job> jobs = new HashMap<>();
    private final Map<Long, Job> active = new HashMap<>();
    // One running export and two queued: bound memory, R2 requests and backend load.
    private final ExecutorService worker = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(2), runnable -> {
                var thread = new Thread(runnable, "scan-export");
                thread.setDaemon(true);
                return thread;
            });

    public ScanExportService(ScanViewerService viewer, ScanDownloadService downloads, S3Client r2,
            S3Presigner signer, @Value("${storage.r2.bucket-name}") String bucket) {
        this.viewer = viewer; this.downloads = downloads; this.r2 = r2; this.signer = signer; this.bucket = bucket;
    }

    public record ExportStatus(String id, String status, String url) {}
    private static final class Job {
        final String id = UUID.randomUUID().toString();
        final Long scanId;
        final Instant created = Instant.now();
        String key;
        volatile String status = "PREPARING";
        Job(Long scanId) {
            this.scanId = scanId;
        }
    }

    public synchronized ExportStatus start(Long scanId, Authentication authentication) {
        viewer.accessibleScan(scanId, authentication);
        prune();
        var existing = active.get(scanId);
        if (existing != null) return new ExportStatus(existing.id, existing.status, null);
        if (jobs.size() >= 100) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "Too many recent exports. Please try again later.");
        var job = new Job(scanId);
        jobs.put(job.id, job);
        active.put(scanId, job);
        var principal = authentication.getName();
        try { worker.execute(() -> build(job, principal)); }
        catch (RejectedExecutionException error) {
            jobs.remove(job.id);
            active.remove(scanId, job);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Export service is busy. Please try again shortly.");
        }
        return new ExportStatus(job.id, job.status, null);
    }

    public synchronized ExportStatus status(Long scanId, String id, Authentication authentication) {
        viewer.accessibleScan(scanId, authentication);
        prune();
        var job = jobs.get(id);
        if (job == null || !job.scanId.equals(scanId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        String url = null;
        if (job.status.equals("READY")) {
            url = signer.presignGetObject(GetObjectPresignRequest.builder()
                    .signatureDuration(Duration.ofMinutes(15))
                    .getObjectRequest(GetObjectRequest.builder().bucket(bucket).key(job.key)
                            .responseContentDisposition("attachment; filename=\"3D-viewer.zip\"").build())
                    .build()).url().toString();
        }
        return new ExportStatus(job.id, job.status, url);
    }

    private void build(Job job, String principal) {
        String result = "FAILED";
        try {
            var auth = new UsernamePasswordAuthenticationToken(principal, null);
            var export = downloads.prepare(job.scanId, auth);
            job.key = "temporary-exports/scans/" + job.scanId + "/"
                    + downloads.fingerprint(export) + "/3D-viewer.zip";
            if (reusable(job.key)) {
                viewer.accessibleScan(job.scanId, auth);
                result = "READY";
                return;
            }
            try (var output = new R2MultipartOutputStream(r2, bucket, job.key)) {
                downloads.write(export, output);
                // Recheck access/status after reading all files, before publishing the ZIP.
                viewer.accessibleScan(job.scanId, auth);
                output.complete();
            }
            result = "READY";
        } catch (Exception error) {
            // The stream aborts unfinished multipart uploads. Do not delete a completed,
            // content-addressed object: it may be a valid ZIP from a lost completion response
            // or another instance. A later request can discover it through HEAD.
            org.slf4j.LoggerFactory.getLogger(ScanExportService.class).warn(
                    "Could not prepare export for scan {}", job.scanId, error);
        } finally {
            synchronized (this) { job.status = result; active.remove(job.scanId, job); }
        }
    }

    private boolean reusable(String key) {
        try {
            var object = r2.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());
            // Keep room for one-hour job polling + 15-minute signed links before
            // the configured one-day lifecycle may expire the cached object.
            return object.contentLength() > 0 && object.lastModified() != null
                    && object.lastModified().isAfter(Instant.now().minus(Duration.ofHours(22)));
        } catch (S3Exception error) {
            if (error.statusCode() == 404) return false;
            throw error;
        }
    }

    private void prune() {
        var cutoff = Instant.now().minus(Duration.ofHours(1));
        jobs.values().removeIf(job -> !job.status.equals("PREPARING") && job.created.isBefore(cutoff));
    }

    @PreDestroy public void shutdown() { worker.shutdownNow(); }
}