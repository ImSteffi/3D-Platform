package com.example.platform.tour;

import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

// SecurityConfig restricts /api/admin/** to platform administrators; the service checks again.
@RestController
@RequestMapping("/api/admin/tour-requests")
public class AdminTourRequestController {
    private final TourRequestService service;
    public AdminTourRequestController(TourRequestService service) { this.service = service; }

    @GetMapping
    public List<TourRequestService.Summary> list(Authentication authentication) {
        return service.listSubmitted(authentication);
    }

    @PutMapping("/{id}/areas/{areaId}/points")
    public TourRequestService.Detail savePoints(@PathVariable Long id, @PathVariable Long areaId,
            @Valid @RequestBody PointsRequest request, Authentication authentication) {
        var inputs = request.points().stream().map(point -> new TourRequestService.PointInput(
                point.x(), point.y(), point.direction(), point.note())).toList();
        return service.savePoints(id, areaId, request.captureGroup(), inputs, authentication);
    }

    @PostMapping("/{id}/plan/send")
    public TourRequestService.Detail sendPlan(@PathVariable Long id, Authentication authentication) {
        return service.sendPlan(id, authentication);
    }

    @PutMapping("/{id}/areas/{areaId}/markers")
    public TourRequestService.Detail saveMarkerSizes(@PathVariable Long id, @PathVariable Long areaId,
            @Valid @RequestBody MarkerSizesRequest request, Authentication authentication) {
        return service.saveMarkerSizes(id, areaId, request.dotSize(), request.lineLength(), authentication);
    }

    @PostMapping("/{id}/plan/reopen")
    public TourRequestService.Detail reopenPlan(@PathVariable Long id, Authentication authentication) {
        return service.reopenPlan(id, authentication);
    }

    @PostMapping("/{id}/review")
    public TourRequestService.Detail review(@PathVariable Long id, @Valid @RequestBody ReviewRequest request,
            Authentication authentication) {
        var retakes = request.retakes() == null ? List.<TourRequestService.Retake>of()
                : request.retakes().stream().map(retake ->
                        new TourRequestService.Retake(retake.pointId(), retake.note())).toList();
        return service.review(id, request.approve(), retakes, authentication);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> failure(ResponseStatusException error) {
        return TourRequestController.message(error);
    }

    public record PointRequest(@NotNull Double x, @NotNull Double y, @NotNull Double direction,
            @Size(max = 500) String note) {}
    public record PointsRequest(@NotNull Integer captureGroup, @NotNull List<@NotNull @Valid PointRequest> points) {}
    public record MarkerSizesRequest(@NotNull Integer dotSize, @NotNull Integer lineLength) {}
    public record RetakeRequest(@NotNull Long pointId, @Size(max = 500) String note) {}
    public record ReviewRequest(boolean approve, List<@NotNull @Valid RetakeRequest> retakes) {}
}
