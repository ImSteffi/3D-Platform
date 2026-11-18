package com.example.platform.tour;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.exception.SdkException;

@RestController
@RequestMapping("/api/tour-requests")
public class TourRequestController {
    private final TourRequestService service;
    public TourRequestController(TourRequestService service) { this.service = service; }

    @GetMapping
    public List<TourRequestService.Summary> list(Authentication authentication) {
        return service.listOwn(authentication);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TourRequestService.Detail create(@Valid @RequestBody CreateRequest request, Authentication authentication) {
        return service.create(request.name(), request.notes(), authentication);
    }

    @GetMapping("/{id}")
    public TourRequestService.Detail get(@PathVariable Long id, Authentication authentication) {
        return service.get(id, authentication);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id, Authentication authentication) {
        service.delete(id, authentication);
    }

    @PostMapping("/{id}/areas")
    public TourRequestService.Detail addArea(@PathVariable Long id, @Valid @RequestBody AreaRequest request,
            Authentication authentication) {
        return service.addArea(id, request.name(), request.kind(), authentication);
    }

    @DeleteMapping("/{id}/areas/{areaId}")
    public TourRequestService.Detail removeArea(@PathVariable Long id, @PathVariable Long areaId,
            Authentication authentication) {
        return service.removeArea(id, areaId, authentication);
    }

    @PutMapping("/{id}/areas/{areaId}/plan")
    public TourRequestService.Detail savePlan(@PathVariable Long id, @PathVariable Long areaId,
            HttpServletRequest request, Authentication authentication) throws IOException {
        return service.savePlan(id, areaId, body(request, TourRequestService.MAX_PLAN_BYTES), authentication);
    }

    @DeleteMapping("/{id}/areas/{areaId}/plan")
    public TourRequestService.Detail removePlan(@PathVariable Long id, @PathVariable Long areaId, Authentication authentication) {
        return service.removePlan(id, areaId, authentication);
    }

    @GetMapping("/{id}/areas/{areaId}/plan")
    public ResponseEntity<Void> plan(@PathVariable Long id, @PathVariable Long areaId, Authentication authentication) {
        return redirect(service.planUrl(id, areaId, authentication));
    }

    @PostMapping("/{id}/submit")
    public TourRequestService.Detail submit(@PathVariable Long id, Authentication authentication) {
        return service.submit(id, authentication);
    }

    @PutMapping("/{id}/points/{pointId}/photo")
    public TourRequestService.Detail savePhoto(@PathVariable Long id, @PathVariable Long pointId,
            HttpServletRequest request, Authentication authentication) throws IOException {
        return service.savePhoto(id, pointId, body(request, TourRequestService.MAX_PHOTO_BYTES), authentication);
    }

    @GetMapping("/{id}/points/{pointId}/photo")
    public ResponseEntity<Void> photo(@PathVariable Long id, @PathVariable Long pointId, Authentication authentication) {
        return redirect(service.photoUrl(id, pointId, authentication));
    }

    @DeleteMapping("/{id}/points/{pointId}/photo")
    public TourRequestService.Detail deletePhoto(@PathVariable Long id, @PathVariable Long pointId,
            Authentication authentication) {
        return service.deletePhoto(id, pointId, authentication);
    }

    // Photos added to a floor directly, before or without a plan.
    @PostMapping("/{id}/areas/{areaId}/photos")
    public TourRequestService.Detail addFloorPhoto(@PathVariable Long id, @PathVariable Long areaId,
            HttpServletRequest request, Authentication authentication) throws IOException {
        return service.addFloorPhoto(id, areaId, body(request, TourRequestService.MAX_PHOTO_BYTES), authentication);
    }

    @GetMapping("/{id}/floor-photos/{photoId}")
    public ResponseEntity<Void> floorPhoto(@PathVariable Long id, @PathVariable Long photoId, Authentication authentication) {
        return redirect(service.floorPhotoUrl(id, photoId, authentication));
    }

    @DeleteMapping("/{id}/floor-photos/{photoId}")
    public TourRequestService.Detail deleteFloorPhoto(@PathVariable Long id, @PathVariable Long photoId,
            Authentication authentication) {
        return service.deleteFloorPhoto(id, photoId, authentication);
    }

    @PostMapping("/{id}/photos/submit")
    public TourRequestService.Detail submitPhotos(@PathVariable Long id, Authentication authentication) {
        return service.submitPhotos(id, authentication);
    }

    // One byte past the limit is enough for the service to reject an oversized upload.
    static byte[] body(HttpServletRequest request, int maxBytes) throws IOException {
        return request.getInputStream().readNBytes(maxBytes + 1);
    }

    private static ResponseEntity<Void> redirect(String url) {
        return ResponseEntity.status(HttpStatus.TEMPORARY_REDIRECT).cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").location(URI.create(url)).build();
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> failure(ResponseStatusException error) {
        return message(error);
    }

    @ExceptionHandler(SdkException.class)
    public ResponseEntity<Map<String, String>> storageFailure() {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(Map.of("message", "File storage is unavailable. Please try again."));
    }

    static ResponseEntity<Map<String, String>> message(ResponseStatusException error) {
        var reason = error.getReason();
        return ResponseEntity.status(error.getStatusCode())
                .body(Map.of("message", reason == null ? "Request failed." : reason));
    }

    public record CreateRequest(@NotBlank @Size(max = 100) String name, @Size(max = 2000) String notes) {}
    public record AreaRequest(@NotBlank @Size(max = 100) String name, @NotNull TourArea.Kind kind) {}
}
