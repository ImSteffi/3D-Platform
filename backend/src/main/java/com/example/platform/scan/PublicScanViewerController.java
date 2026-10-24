package com.example.platform.scan;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
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
    public ResponseEntity<StreamingResponseBody> file(@PathVariable String token, @RequestParam String path) {
        var file = viewer.sharedFile(token, path);
        StreamingResponseBody body = output -> {
            try (var input = viewer.openFile(file)) { input.transferTo(output); }
        };
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(file.getSizeBytes()).body(body);
    }

    @ExceptionHandler(SdkException.class)
    public ResponseEntity<Void> storageFailure() {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).cacheControl(CacheControl.noStore()).build();
    }
}