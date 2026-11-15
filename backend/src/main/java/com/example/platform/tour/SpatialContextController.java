package com.example.platform.tour;

import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

// Under /api/admin/**, which SecurityConfig restricts to platform administrators; the service checks again.
@RestController
@RequestMapping("/api/admin/tour-requests/{id}/areas/{areaId}/spatial-context")
public class SpatialContextController {
    private final SpatialContextService service;
    public SpatialContextController(SpatialContextService service) { this.service = service; }

    /** Starts a run for this floor's photos. Spends Atlas credits. */
    @PostMapping
    public SpatialContextService.Result start(@PathVariable Long id, @PathVariable Long areaId, Authentication authentication) {
        return service.start(id, areaId, authentication);
    }

    /** The newest run (status NONE when there is none), refreshed from Atlas while it runs. */
    @GetMapping
    public SpatialContextService.Result status(@PathVariable Long id, @PathVariable Long areaId, Authentication authentication) {
        return service.status(id, areaId, authentication);
    }

    /** kind = image | depth | confidence. Served from our storage, same origin, so WebGL can use it. */
    @GetMapping("/runs/{runId}/frames/{index}/{kind}")
    public ResponseEntity<byte[]> file(@PathVariable Long id, @PathVariable Long areaId, @PathVariable Long runId,
            @PathVariable int index, @PathVariable String kind, Authentication authentication) {
        var file = service.file(id, areaId, runId, index, kind, authentication);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate())
                .contentType(MediaType.parseMediaType(file.contentType())).body(file.bytes());
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> failure(ResponseStatusException error) {
        return TourRequestController.message(error);
    }
}
