package com.example.platform.scan;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import software.amazon.awssdk.core.exception.SdkException;

@RestController
@RequestMapping("/api/scans/{scanId}/viewer")
public class ScanViewerController {
    private final ScanViewerService viewer;
    public ScanViewerController(ScanViewerService viewer) { this.viewer = viewer; }

    @GetMapping
    public ResponseEntity<ScanViewerService.Manifest> manifest(
            @PathVariable Long scanId, Authentication authentication) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(viewer.manifest(scanId, authentication));
    }

    @PutMapping("/starting-view")
    public ResponseEntity<Void> setStartingView(@PathVariable Long scanId,
            @RequestBody ScanViewerService.StartingView startingView, Authentication authentication) {
        viewer.setStartingView(scanId, startingView, authentication);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @GetMapping("/file")
    public ResponseEntity<StreamingResponseBody> file(@PathVariable Long scanId,
            @RequestParam String path, Authentication authentication) {
        var file = viewer.file(scanId, path, authentication);
        StreamingResponseBody body = output -> {
            try (var input = viewer.openFile(file)) { input.transferTo(output); }
        };
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(file.getSizeBytes()).body(body);
    }

    @ExceptionHandler(SdkException.class)
    public ResponseEntity<Void> storageFailure() {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).cacheControl(CacheControl.noStore()).build();
    }
}
