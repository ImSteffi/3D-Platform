package com.example.platform.scan;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import software.amazon.awssdk.core.exception.SdkException;

@RestController
@RequestMapping("/api/organizations/{organizationId}/projects/{projectId}/scans")
public class ScanUploadController {
    private final ScanUploadService uploads;
    public ScanUploadController(ScanUploadService uploads) { this.uploads = uploads; }

    @GetMapping
    public List<ScanService.ScanResponse> list(@PathVariable Long organizationId, @PathVariable Long projectId) {
        return uploads.list(organizationId, projectId);
    }

    @PostMapping("/{scanId}/files/{fileId}/upload")
    public ScanUploadService.UploadPlan start(@PathVariable Long organizationId, @PathVariable Long projectId,
            @PathVariable Long scanId, @PathVariable Long fileId) {
        return uploads.start(organizationId, projectId, scanId, fileId);
    }

    @PostMapping("/{scanId}/files/{fileId}/parts/{partNumber}")
    public ScanUploadService.PartUrl part(@PathVariable Long organizationId, @PathVariable Long projectId,
            @PathVariable Long scanId, @PathVariable Long fileId, @PathVariable int partNumber) {
        return uploads.part(organizationId, projectId, scanId, fileId, partNumber);
    }

    @PostMapping("/{scanId}/files/{fileId}/complete")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void finishFile(@PathVariable Long organizationId, @PathVariable Long projectId,
            @PathVariable Long scanId, @PathVariable Long fileId) {
        uploads.finishFile(organizationId, projectId, scanId, fileId);
    }

    @PostMapping("/{scanId}/complete")
    public ScanService.ScanResponse finish(@PathVariable Long organizationId, @PathVariable Long projectId,
            @PathVariable Long scanId) {
        return uploads.finish(organizationId, projectId, scanId);
    }

    @ExceptionHandler(SdkException.class)
    @ResponseStatus(HttpStatus.BAD_GATEWAY)
    public java.util.Map<String, String> storageError() {
        return java.util.Map.of("message", "R2 request failed. Check the backend R2 configuration and retry.");
    }
}
