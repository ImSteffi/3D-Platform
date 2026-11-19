package com.example.platform.tour;

import java.util.Map;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class TourViewController {
    private final TourViewService views;
    private final TourRequestService tours;
    public TourViewController(TourViewService views, TourRequestService tours) { this.views = views; this.tours = tours; }

    public record StartRequest(Long space, Long floor, String source, String referrer, String timeZone) {}
    public record TimeRequest(int seconds) {}

    /** Public: the tour page reports that it was opened. The address and browser are only hashed, never kept. */
    @PostMapping("/api/public/tour-views")
    public Map<String, UUID> start(@RequestBody StartRequest request, HttpServletRequest http) {
        if (request.space() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        return Map.of("id", views.start(request.space(), request.floor(), request.source(), request.referrer(),
                request.timeZone(), http.getRemoteAddr(), http.getHeader("User-Agent")));
    }

    /** Public: the tour page reports how long it has been watched. The view's random id is the permission. */
    @PostMapping("/api/public/tour-views/{id}/time")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void time(@PathVariable UUID id, @RequestBody TimeRequest request) {
        views.time(id, request.seconds());
    }

    /** For people who can open the space: get() answers 404 to everyone else. */
    @GetMapping("/api/tour-requests/{id}/analytics")
    public TourViewService.Stats stats(@PathVariable Long id, Authentication authentication) {
        tours.get(id, authentication);
        return views.stats(id);
    }

    @GetMapping("/api/tour-requests/{id}/analytics.csv")
    public ResponseEntity<String> csv(@PathVariable Long id, Authentication authentication) {
        tours.get(id, authentication);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", java.nio.charset.StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"tour-analytics-" + id + ".csv\"")
                .body(views.csv(id));
    }
}
