package com.example.platform.scan;

import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import software.amazon.awssdk.core.exception.SdkException;

@RestController
@RequestMapping("/api/scans/{scanId}")
public class ScanDeleteController {
    private final ScanDeleteService service;
    public ScanDeleteController(ScanDeleteService service) { this.service = service; }

    @DeleteMapping
    public ResponseEntity<Void> delete(@PathVariable Long scanId, Authentication authentication) {
        service.delete(scanId, authentication);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @ExceptionHandler(SdkException.class)
    public ResponseEntity<Void> storageFailure() {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).cacheControl(CacheControl.noStore()).build();
    }
}