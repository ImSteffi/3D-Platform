package com.example.platform.scan;

import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Value;

@RestController
@RequestMapping("/api/scans/{scanId}/share")
public class ScanShareController {
    private final ScanViewerService viewer;
    private final String publicOrigin;
    public ScanShareController(ScanViewerService viewer,
            @Value("${app.public-origin:}") String publicOrigin) {
        this.viewer = viewer;
        this.publicOrigin = publicOrigin.replaceAll("/+$", "");
        if (!this.publicOrigin.isEmpty()) {
            var uri = java.net.URI.create(this.publicOrigin);
            if (!java.util.Set.of("http", "https").contains(uri.getScheme()) || uri.getHost() == null
                    || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                    || (uri.getPath() != null && !uri.getPath().isEmpty()))
                throw new IllegalArgumentException("app.public-origin must be an HTTP(S) origin.");
        }
    }
    public record Share(String path, String url) {}
    public record SharingStatus(boolean enabled, boolean hostingEnabled, String path, String url) {}

    @GetMapping
    public ResponseEntity<SharingStatus> status(@PathVariable Long scanId, Authentication authentication) {
        var state = viewer.sharingState(scanId, authentication);
        var path = state.token() == null ? null : "/view/" + state.token();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
                new SharingStatus(state.enabled(), state.hostingEnabled(), path,
                        path == null || publicOrigin.isEmpty() ? null : publicOrigin + path));
    }
    @PostMapping
    public ResponseEntity<Share> enable(@PathVariable Long scanId, Authentication authentication) {
        var token = viewer.enableSharing(scanId, authentication);
        var path = "/view/" + token;
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(new Share(path, publicOrigin.isEmpty() ? null : publicOrigin + path));
    }
    @DeleteMapping
    public ResponseEntity<Void> disable(@PathVariable Long scanId, Authentication authentication) {
        viewer.disableSharing(scanId, authentication);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}