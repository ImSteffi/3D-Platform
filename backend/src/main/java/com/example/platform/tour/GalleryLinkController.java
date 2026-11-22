package com.example.platform.tour;

import java.io.IOException;
import java.net.URI;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.exception.SdkException;

/**
 * Gallery links. The admin part creates and turns off a space's link. The public part lets whoever
 * holds the link work on that one space without signing in: see it, add floors, upload plans and
 * photos, and send them to us. Nothing else: no other spaces, no account, no deleting floors or the space.
 */
@RestController
public class GalleryLinkController {
    private final GalleryLinkService links;
    private final TourRequestService tours;
    private final String publicOrigin;

    public GalleryLinkController(GalleryLinkService links, TourRequestService tours,
            @Value("${app.public-origin:}") String publicOrigin) {
        this.links = links;
        this.tours = tours;
        this.publicOrigin = publicOrigin.replaceAll("/+$", "");
    }

    public record LinkResponse(String path, String url, String expiresAt) {}

    private LinkResponse response(GalleryLinkService.Link link) {
        if (link == null) return null;
        var path = "/g/" + link.token();
        return new LinkResponse(path, publicOrigin.isEmpty() ? null : publicOrigin + path, link.expiresAt().toString());
    }

    // ---- Admin (SecurityConfig limits /api/admin/** to administrators; the service checks again) ----

    @GetMapping("/api/admin/tour-requests/{id}/gallery-link")
    public ResponseEntity<LinkResponse> current(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(response(links.current(id, authentication)));
    }

    @PostMapping("/api/admin/tour-requests/{id}/gallery-link")
    public ResponseEntity<LinkResponse> create(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(response(links.create(id, authentication)));
    }

    @DeleteMapping("/api/admin/tour-requests/{id}/gallery-link")
    public ResponseEntity<Void> revoke(@PathVariable Long id, Authentication authentication) {
        links.revoke(id, authentication);
        return ResponseEntity.noContent().build();
    }

    // ---- Public: work on one space through its link ----

    /** The link's space, acted on as its owner for this one request only. No session is created. */
    private record Scope(Long spaceId, Authentication owner) {}

    private Scope scope(String token) {
        var redeemed = links.redeem(token);
        var owner = UsernamePasswordAuthenticationToken.authenticated(redeemed.email(), null, java.util.List.of());
        // Lets the service tell link requests apart: a link may delete only the photos it added.
        owner.setDetails(TourRequestService.GALLERY_LINK);
        return new Scope(redeemed.tourRequestId(), owner);
    }

    /** The owner's email is not shown to whoever holds the link. */
    private static TourRequestService.Detail visible(TourRequestService.Detail detail) {
        return new TourRequestService.Detail(detail.id(), detail.name(), detail.notes(), detail.status(), detail.createdAt(),
                detail.ownerName(), null, detail.areas(), detail.scanId(), detail.scanName(), detail.projectId(),
                detail.areasToPlan());
    }

    @GetMapping("/api/gallery/{token}")
    public ResponseEntity<TourRequestService.Detail> get(@PathVariable String token) {
        var s = scope(token);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(visible(tours.get(s.spaceId(), s.owner())));
    }

    @PostMapping("/api/gallery/{token}/areas")
    public TourRequestService.Detail addArea(@PathVariable String token,
            @Valid @RequestBody TourRequestController.AreaRequest request) {
        var s = scope(token);
        return visible(tours.addArea(s.spaceId(), request.name(), request.kind(), s.owner()));
    }

    @PutMapping("/api/gallery/{token}/areas/{areaId}/plan")
    public TourRequestService.Detail savePlan(@PathVariable String token, @PathVariable Long areaId,
            HttpServletRequest request) throws IOException {
        var s = scope(token);
        return visible(tours.savePlan(s.spaceId(), areaId,
                TourRequestController.body(request, TourRequestService.MAX_PLAN_BYTES), s.owner()));
    }

    @PostMapping("/api/gallery/{token}/areas/{areaId}/plan/{direction:back|forward}")
    public TourRequestService.Detail stepPlan(@PathVariable String token, @PathVariable Long areaId, @PathVariable String direction) {
        var s = scope(token);
        return visible(tours.stepPlan(s.spaceId(), areaId, "forward".equals(direction), s.owner()));
    }

    @DeleteMapping("/api/gallery/{token}/areas/{areaId}/plan")
    public TourRequestService.Detail removePlan(@PathVariable String token, @PathVariable Long areaId) {
        var s = scope(token);
        return visible(tours.removePlan(s.spaceId(), areaId, s.owner()));
    }

    @GetMapping("/api/gallery/{token}/areas/{areaId}/plan")
    public ResponseEntity<Void> plan(@PathVariable String token, @PathVariable Long areaId) {
        var s = scope(token);
        return redirect(tours.planUrl(s.spaceId(), areaId, s.owner()));
    }

    @PostMapping("/api/gallery/{token}/submit")
    public TourRequestService.Detail submit(@PathVariable String token) {
        var s = scope(token);
        return visible(tours.submit(s.spaceId(), s.owner()));
    }

    @PutMapping("/api/gallery/{token}/points/{pointId}/photo")
    public TourRequestService.Detail savePhoto(@PathVariable String token, @PathVariable Long pointId,
            HttpServletRequest request) throws IOException {
        var s = scope(token);
        return visible(tours.savePhoto(s.spaceId(), pointId,
                TourRequestController.body(request, TourRequestService.MAX_PHOTO_BYTES), s.owner()));
    }

    @GetMapping("/api/gallery/{token}/points/{pointId}/photo")
    public ResponseEntity<Void> photo(@PathVariable String token, @PathVariable Long pointId) {
        var s = scope(token);
        return redirect(tours.photoUrl(s.spaceId(), pointId, s.owner()));
    }

    @DeleteMapping("/api/gallery/{token}/points/{pointId}/photo")
    public TourRequestService.Detail deletePhoto(@PathVariable String token, @PathVariable Long pointId) {
        var s = scope(token);
        return visible(tours.deletePhoto(s.spaceId(), pointId, s.owner()));
    }

    @PostMapping("/api/gallery/{token}/areas/{areaId}/photos")
    public TourRequestService.Detail addFloorPhoto(@PathVariable String token, @PathVariable Long areaId,
            HttpServletRequest request) throws IOException {
        var s = scope(token);
        return visible(tours.addFloorPhoto(s.spaceId(), areaId,
                TourRequestController.body(request, TourRequestService.MAX_PHOTO_BYTES), s.owner()));
    }

    @GetMapping("/api/gallery/{token}/floor-photos/{photoId}")
    public ResponseEntity<Void> floorPhoto(@PathVariable String token, @PathVariable Long photoId) {
        var s = scope(token);
        return redirect(tours.floorPhotoUrl(s.spaceId(), photoId, s.owner()));
    }

    @DeleteMapping("/api/gallery/{token}/floor-photos/{photoId}")
    public TourRequestService.Detail deleteFloorPhoto(@PathVariable String token, @PathVariable Long photoId) {
        var s = scope(token);
        return visible(tours.deleteFloorPhoto(s.spaceId(), photoId, s.owner()));
    }

    @PostMapping("/api/gallery/{token}/photos/submit")
    public TourRequestService.Detail submitPhotos(@PathVariable String token) {
        var s = scope(token);
        return visible(tours.submitPhotos(s.spaceId(), s.owner()));
    }

    private static ResponseEntity<Void> redirect(String url) {
        return ResponseEntity.status(HttpStatus.TEMPORARY_REDIRECT).cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").location(URI.create(url)).build();
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> failure(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode())
                .body(Map.of("message", error.getReason() == null ? "Request failed." : error.getReason()));
    }

    @ExceptionHandler(SdkException.class)
    public ResponseEntity<Map<String, String>> storageFailure() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("message", "Storage is unavailable right now. Please try again."));
    }
}
