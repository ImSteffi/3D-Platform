package com.example.platform.scan;

import java.io.IOException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import software.amazon.awssdk.core.exception.SdkException;

@RestController
@RequestMapping("/api/scans/{scanId}/preview")
public class ScanPreviewController {
    private final ScanPreviewService service;
    public ScanPreviewController(ScanPreviewService service) { this.service = service; }

    @GetMapping
    public ResponseEntity<byte[]> get(@PathVariable Long scanId, Authentication authentication) {
        var bytes = service.get(scanId, authentication);
        if (bytes == null) return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.IMAGE_PNG).body(bytes);
    }

    @PutMapping(consumes = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<Void> save(@PathVariable Long scanId, HttpServletRequest request,
            Authentication authentication) throws IOException {
        service.save(scanId, request.getInputStream(), authentication);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @ExceptionHandler(SdkException.class)
    public ResponseEntity<Void> storageFailure() {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).cacheControl(CacheControl.noStore()).build();
    }
}