package com.example.platform.scan;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import com.example.platform.project.ProjectRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.UploadPartPresignRequest;

@Service
public class ScanUploadService {
    private final ScanRepository scans;
    private final ScanFileRepository files;
    private final ProjectRepository projects;
    private final S3Client r2;
    private final S3Presigner signer;
    private final String bucket;

    public ScanUploadService(ScanRepository scans, ScanFileRepository files,
            ProjectRepository projects, S3Client r2, S3Presigner signer,
            @Value("${storage.r2.bucket-name}") String bucket) {
        this.scans = scans;
        this.files = files;
        this.projects = projects;
        this.r2 = r2;
        this.signer = signer;
        this.bucket = bucket;
    }

    // One scan lock serializes upload mutations, including publishing the final status.
    private Scan scan(Long orgId, Long projectId, Long scanId) {
        var scan = scans.findForUpdate(scanId).orElseThrow(() -> error(404, "Scan not found"));
        if (!scan.getProject().getId().equals(projectId)
                || !scan.getProject().getOrganization().getId().equals(orgId)) {
            throw error(404, "Scan not found");
        }
        return scan;
    }

    private ScanFile file(Scan scan, Long fileId) {
        var file = files.findById(fileId).orElseThrow(() -> error(404, "File not found"));
        if (!file.getScan().getId().equals(scan.getId())) throw error(404, "File not found");
        return file;
    }

    private void uploading(Scan scan) {
        if (scan.getStatus() != Scan.Status.UPLOADING) throw error(409, "Scan is not uploading");
    }

    static long partSize(long size) {
        // At most 10,000 parts, rounded to whole MiB; normal files use 16 MiB parts.
        long mib = 1024L * 1024;
        return Math.max(16 * mib, ((size + 9999) / 10000 + mib - 1) / mib * mib);
    }

    private boolean uploaded(ScanFile file) {
        try {
            var head = r2.headObject(b -> b.bucket(bucket).key(file.getObjectKey()));
            return head.contentLength() == file.getSizeBytes();
        } catch (S3Exception ex) {
            if (ex.statusCode() == 404) return false;
            throw ex;
        }
    }

    @Transactional
    public UploadPlan start(Long orgId, Long projectId, Long scanId, Long fileId) {
        var scan = scan(orgId, projectId, scanId);
        var file = file(scan, fileId);
        if (scan.getStatus() == Scan.Status.READY) return new UploadPlan(true, 0, 0);
        uploading(scan);
        if (uploaded(file)) return new UploadPlan(true, 0, 0);
        if (file.getSizeBytes() == 0) {
            r2.putObject(b -> b.bucket(bucket).key(file.getObjectKey()), RequestBody.empty());
            return new UploadPlan(true, 0, 0);
        }
        if (file.getUploadId() == null) {
            var result = r2.createMultipartUpload(b -> b.bucket(bucket)
                    .key(file.getObjectKey()).contentType("application/octet-stream"));
            file.setUploadId(result.uploadId());
        }
        long size = partSize(file.getSizeBytes());
        return new UploadPlan(false, size, (int) ((file.getSizeBytes() + size - 1) / size));
    }

    @Transactional
    public PartUrl part(Long orgId, Long projectId, Long scanId, Long fileId, int number) {
        var scan = scan(orgId, projectId, scanId);
        uploading(scan);
        var file = file(scan, fileId);
        long size = partSize(file.getSizeBytes());
        long count = (file.getSizeBytes() + size - 1) / size;
        if (file.getUploadId() == null || number < 1 || number > count) {
            throw error(400, "Invalid upload part");
        }
        var request = UploadPartRequest.builder().bucket(bucket).key(file.getObjectKey())
                .uploadId(file.getUploadId()).partNumber(number).build();
        var signed = signer.presignUploadPart(UploadPartPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(30)).uploadPartRequest(request).build());
        return new PartUrl(signed.url().toString());
    }

    @Transactional
    public void finishFile(Long orgId, Long projectId, Long scanId, Long fileId) {
        var scan = scan(orgId, projectId, scanId);
        var file = file(scan, fileId);
        if (uploaded(file)) return; // Safe retry after a lost completion response.
        uploading(scan);
        if (file.getUploadId() == null) throw error(409, "File upload has not started");
        var parts = new ArrayList<Part>();
        Integer marker = null;
        do {
            var response = r2.listParts(ListPartsRequest.builder().bucket(bucket)
                    .key(file.getObjectKey()).uploadId(file.getUploadId())
                    .partNumberMarker(marker).build());
            parts.addAll(response.parts());
            marker = Boolean.TRUE.equals(response.isTruncated()) ? response.nextPartNumberMarker() : null;
        } while (marker != null);
        long size = partSize(file.getSizeBytes());
        int count = (int) ((file.getSizeBytes() + size - 1) / size);
        if (parts.size() != count) throw error(409, "Some upload parts are missing");
        for (int i = 0; i < count; i++) {
            long expected = Math.min(size, file.getSizeBytes() - i * size);
            if (parts.get(i).partNumber() != i + 1 || parts.get(i).size() != expected) {
                throw error(409, "Uploaded part size does not match");
            }
        }
        var completed = parts.stream().map(p -> CompletedPart.builder()
                .partNumber(p.partNumber()).eTag(p.eTag()).build()).toList();
        r2.completeMultipartUpload(b -> b.bucket(bucket).key(file.getObjectKey())
                .uploadId(file.getUploadId()).multipartUpload(m -> m.parts(completed)));
        if (!uploaded(file)) throw error(409, "Uploaded file size does not match");
    }

    @Transactional
    public ScanService.ScanResponse finish(Long orgId, Long projectId, Long scanId) {
        var scan = scan(orgId, projectId, scanId);
        if (scan.getStatus() != Scan.Status.READY) {
            uploading(scan);
            var entries = files.findByScan_IdOrderByIdAsc(scanId);
            if (entries.isEmpty()) throw error(409, "Scan has no files");
            for (var file : entries) {
                if (!uploaded(file)) throw error(409, "Some files have not finished uploading");
            }
            scan.markReady();
        }
        return response(scan);
    }

    @Transactional(readOnly = true)
    public List<ScanService.ScanResponse> list(Long orgId, Long projectId) {
        var project = projects.findById(projectId).orElseThrow(() -> error(404, "Project not found"));
        if (!project.getOrganization().getId().equals(orgId)) throw error(404, "Project not found");
        return scans.findByProject_IdOrderByIdAsc(projectId).stream().map(this::response).toList();
    }

    private ScanService.ScanResponse response(Scan scan) {
        var entries = files.findByScan_IdOrderByIdAsc(scan.getId()).stream()
                .map(f -> new ScanService.FileResponse(f.getId(), f.getRelativePath(), f.getSizeBytes())).toList();
        return new ScanService.ScanResponse(scan.getId(), scan.getProject().getId(),
                scan.getName(), scan.getStatus().name(), entries);
    }

    private static ResponseStatusException error(int status, String message) {
        return new ResponseStatusException(HttpStatus.valueOf(status), message);
    }
    public record UploadPlan(boolean complete, long partSize, int partCount) {}
    public record PartUrl(String url) {}
}
