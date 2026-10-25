package com.example.platform.scan;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/scans/{scanId}/download")
public class ScanDownloadController {
    private final ScanExportService exports;
    public ScanDownloadController(ScanExportService exports) { this.exports = exports; }

    @PostMapping
    public ResponseEntity<ScanExportService.ExportStatus> prepare(
            @PathVariable Long scanId, Authentication authentication) {
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore())
                .body(exports.start(scanId, authentication));
    }

    @GetMapping("/{exportId}")
    public ResponseEntity<ScanExportService.ExportStatus> status(@PathVariable Long scanId,
            @PathVariable String exportId, Authentication authentication) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(exports.status(scanId, exportId, authentication));
    }
}