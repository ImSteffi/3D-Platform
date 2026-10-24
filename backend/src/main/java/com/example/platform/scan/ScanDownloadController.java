package com.example.platform.scan;

import java.nio.charset.StandardCharsets;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import software.amazon.awssdk.core.exception.SdkException;

@RestController
@RequestMapping("/api/scans/{scanId}/download")
public class ScanDownloadController {
    private final ScanDownloadService downloads;
    public ScanDownloadController(ScanDownloadService downloads) { this.downloads = downloads; }

    @RequestMapping(method = RequestMethod.HEAD)
    public ResponseEntity<Void> check(@PathVariable Long scanId, Authentication authentication) {
        downloads.prepare(scanId, authentication);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).build();
    }

    @GetMapping
    public ResponseEntity<StreamingResponseBody> download(@PathVariable Long scanId, Authentication authentication) {
        var export = downloads.prepare(scanId, authentication);
        StreamingResponseBody body = output -> downloads.write(export, output);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .contentType(MediaType.parseMediaType("application/zip"))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(export.name() + ".zip", StandardCharsets.UTF_8).build().toString())
                .body(body);
    }

    @ExceptionHandler(SdkException.class)
    public ResponseEntity<Void> storageFailure() {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).cacheControl(CacheControl.noStore()).build();
    }
}
