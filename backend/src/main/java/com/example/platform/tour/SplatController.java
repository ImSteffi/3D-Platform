package com.example.platform.tour;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

/** Floors' 3DGS: the team starts and follows them (SecurityConfig limits /api/admin/** to administrators); the tour viewer loads them. */
@RestController
public class SplatController {
    private final SplatService splats;

    public SplatController(SplatService splats) { this.splats = splats; }

    @GetMapping("/api/admin/tour-requests/{id}/splats")
    public ResponseEntity<List<SplatService.Status>> list(@PathVariable long id, Authentication authentication) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(splats.list(id, authentication));
    }

    /** Spends Atlas credits, unless it only converts a kept Atlas result again. */
    @PostMapping("/api/admin/tour-requests/{id}/areas/{areaId}/splats")
    public SplatService.Status start(@PathVariable long id, @PathVariable long areaId, Authentication authentication) {
        return splats.start(id, areaId, authentication);
    }

    /** Public: a finished 3DGS's files never change, so browsers keep them. */
    @GetMapping("/api/public/splats/{publicId}/{file:.+}")
    public ResponseEntity<InputStreamResource> file(@PathVariable String publicId, @PathVariable String file) {
        try {
            var object = splats.file(publicId, file);
            var length = object.response().contentLength();
            var response = ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                    .contentType(MediaType.parseMediaType(SplatService.contentType(file)));
            if (length != null) response.contentLength(length);
            return response.body(new InputStreamResource(object));
        } catch (NoSuchKeyException missing) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Not found.");
        }
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> failure(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode())
                .body(Map.of("message", error.getReason() == null ? "Request failed." : error.getReason()));
    }
}
