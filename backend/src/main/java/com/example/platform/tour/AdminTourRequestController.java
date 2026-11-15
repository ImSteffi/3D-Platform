package com.example.platform.tour;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

// SecurityConfig restricts /api/admin/** to platform administrators; the service checks again.
@RestController
@RequestMapping("/api/admin")
public class AdminTourRequestController {
    private final TourRequestService service;
    public AdminTourRequestController(TourRequestService service) { this.service = service; }

    @GetMapping("/users/{userId}")
    public TourRequestService.Customer customer(@PathVariable Long userId, Authentication authentication) {
        return service.customer(userId, authentication);
    }

    @GetMapping("/users/{userId}/tour-requests")
    public List<TourRequestService.Summary> listForUser(@PathVariable Long userId, Authentication authentication) {
        return service.listForUser(userId, authentication);
    }

    @PostMapping("/tour-requests/{id}/areas")
    public TourRequestService.Detail addArea(@PathVariable Long id,
            @Valid @RequestBody TourRequestController.AreaRequest request, Authentication authentication) {
        return service.adminAddArea(id, request.name(), request.kind(), authentication);
    }

    @PutMapping("/tour-requests/{id}/areas/{areaId}/plan")
    public TourRequestService.Detail savePlan(@PathVariable Long id, @PathVariable Long areaId,
            HttpServletRequest request, Authentication authentication) throws IOException {
        return service.adminSavePlan(id, areaId,
                TourRequestController.body(request, TourRequestService.MAX_PLAN_BYTES), authentication);
    }

    @DeleteMapping("/tour-requests/{id}/areas/{areaId}")
    public TourRequestService.Detail removeArea(@PathVariable Long id, @PathVariable Long areaId,
            Authentication authentication) {
        return service.adminRemoveArea(id, areaId, authentication);
    }

    @PatchMapping("/tour-requests/{id}/areas/{areaId}")
    public TourRequestService.Detail updateArea(@PathVariable Long id, @PathVariable Long areaId,
            @Valid @RequestBody AreaUpdateRequest request, Authentication authentication) {
        return service.adminUpdateArea(id, areaId, request.name(), request.kind(), authentication);
    }

    @GetMapping("/tour-requests")
    public List<TourRequestService.Summary> list(Authentication authentication) {
        return service.listSubmitted(authentication);
    }

    @PutMapping("/tour-requests/{id}/areas/{areaId}/points")
    public TourRequestService.Detail savePoints(@PathVariable Long id, @PathVariable Long areaId,
            @Valid @RequestBody PointsRequest request, Authentication authentication) {
        var inputs = request.points().stream().map(point -> new TourRequestService.PointInput(
                point.x(), point.y(), point.direction(), point.note())).toList();
        return service.savePoints(id, areaId, request.captureGroup(), inputs, authentication);
    }

    @PostMapping("/tour-requests/{id}/areas/{areaId}/points")
    public TourRequestService.Detail createPoint(@PathVariable Long id, @PathVariable Long areaId,
            @Valid @RequestBody PointRequest request, Authentication authentication) {
        return service.createPoint(id, areaId, new TourRequestService.PointInput(
                request.x(), request.y(), request.direction(), request.note()), authentication);
    }

    @PatchMapping("/tour-requests/{id}/points/{pointId}")
    public TourRequestService.Detail updatePoint(@PathVariable Long id, @PathVariable Long pointId,
            @Valid @RequestBody PointPatchRequest request, Authentication authentication) {
        return service.updatePoint(id, pointId, new TourRequestService.PointPatch(
                request.x(), request.y(), request.direction(), request.note()), authentication);
    }

    @DeleteMapping("/tour-requests/{id}/points/{pointId}")
    public TourRequestService.Detail deletePoint(@PathVariable Long id, @PathVariable Long pointId,
            Authentication authentication) {
        return service.deletePoint(id, pointId, authentication);
    }

    @PostMapping("/tour-requests/{id}/plan/send")
    public TourRequestService.Detail sendPlan(@PathVariable Long id, Authentication authentication) {
        return service.sendPlan(id, authentication);
    }

    @PutMapping("/tour-requests/{id}/areas/{areaId}/markers")
    public TourRequestService.Detail saveMarkerSizes(@PathVariable Long id, @PathVariable Long areaId,
            @Valid @RequestBody MarkerSizesRequest request, Authentication authentication) {
        return service.saveMarkerSizes(id, areaId, request.dotSize(), request.lineLength(), authentication);
    }

    @PostMapping("/tour-requests/{id}/plan/reopen")
    public TourRequestService.Detail reopenPlan(@PathVariable Long id, Authentication authentication) {
        return service.reopenPlan(id, authentication);
    }

    @PostMapping("/tour-requests/{id}/review")
    public TourRequestService.Detail review(@PathVariable Long id, @Valid @RequestBody ReviewRequest request,
            Authentication authentication) {
        var retakes = request.retakes() == null ? List.<TourRequestService.Retake>of()
                : request.retakes().stream().map(retake ->
                        new TourRequestService.Retake(retake.pointId(), retake.note())).toList();
        return service.review(id, request.approve(), retakes, authentication);
    }

    @GetMapping("/tour-requests/{id}/deliverable-scans")
    public List<TourRequestService.DeliverableScan> deliverableScans(@PathVariable Long id,
            Authentication authentication) {
        return service.deliverableScans(id, authentication);
    }

    @PostMapping("/tour-requests/{id}/deliver")
    public TourRequestService.Detail deliver(@PathVariable Long id, @Valid @RequestBody DeliverRequest request,
            Authentication authentication) {
        return service.deliver(id, request.scanId(), authentication);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> failure(ResponseStatusException error) {
        return TourRequestController.message(error);
    }

    public record PointRequest(@NotNull Double x, @NotNull Double y, @NotNull Double direction,
            @Size(max = 500) String note) {}
    public record PointPatchRequest(Double x, Double y, Double direction, @Size(max = 500) String note) {}
    public record PointsRequest(@NotNull Integer captureGroup, @NotNull List<@NotNull @Valid PointRequest> points) {}
    public record MarkerSizesRequest(@NotNull Integer dotSize, @NotNull Integer lineLength) {}
    public record RetakeRequest(@NotNull Long pointId, @Size(max = 500) String note) {}
    public record AreaUpdateRequest(@Size(max = 100) String name, TourArea.Kind kind) {}
    public record DeliverRequest(@NotNull Long scanId) {}
    public record ReviewRequest(boolean approve, List<@NotNull @Valid RetakeRequest> retakes) {}
}
