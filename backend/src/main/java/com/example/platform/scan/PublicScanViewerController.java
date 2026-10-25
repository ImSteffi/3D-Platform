package com.example.platform.scan;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import software.amazon.awssdk.core.exception.SdkException;

@RestController
@RequestMapping("/api/public/views/{token}")
public class PublicScanViewerController {
    private final ScanViewerService viewer;
    public PublicScanViewerController(ScanViewerService viewer) { this.viewer = viewer; }

    @GetMapping
    public ResponseEntity<ScanViewerService.Manifest> manifest(@PathVariable String token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("X-Robots-Tag", "noindex, nofollow, noarchive")
                .header("Referrer-Policy", "no-referrer")
                .body(viewer.sharedManifest(token));
    }

    @GetMapping("/file")
    public ResponseEntity<Void> file(@PathVariable String token, @RequestParam String path) {
        var file = viewer.sharedFile(token, path);
        return ResponseEntity.status(HttpStatus.TEMPORARY_REDIRECT).cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer")
                .location(java.net.URI.create(viewer.signedUrl(file))).build();
    }

    @ExceptionHandler(SdkException.class)
    public ResponseEntity<Void> storageFailure() {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).cacheControl(CacheControl.noStore()).build();
    }
}