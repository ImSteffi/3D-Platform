package com.example.platform.tour;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

import com.example.platform.user.User;
import com.example.platform.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Gallery links: the team creates a customer's account and space, then sends one link.
 * Opening it signs that customer in (no password) and opens the space to add photos.
 */
@Service
public class GalleryLinkService {
    static final Duration LIFETIME = Duration.ofDays(7);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final GalleryLinkRepository links;
    private final TourRequestRepository tours;
    private final UserRepository users;

    public GalleryLinkService(GalleryLinkRepository links, TourRequestRepository tours, UserRepository users) {
        this.links = links;
        this.tours = tours;
        this.users = users;
    }

    public record Link(String token, Instant expiresAt) {}
    /** Who the link signs in, and which space it opens. */
    public record Redeemed(String email, Long tourRequestId) {}

    @Transactional(readOnly = true)
    public Link current(Long tourRequestId, Authentication authentication) {
        admin(authentication);
        return links.findByTourRequest_Id(tourRequestId)
                .filter(link -> !link.isExpired())
                .map(link -> new Link(link.getToken(), link.getExpiresAt()))
                .orElse(null);
    }

    /** Creates the space's link, or replaces it with a fresh one valid for another 7 days. */
    @Transactional
    public Link create(Long tourRequestId, Authentication authentication) {
        admin(authentication);
        var tour = tours.findById(tourRequestId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Space not found."));
        if (tour.getUser().isPlatformAdmin())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A link cannot sign in an administrator.");
        var token = newToken();
        var expiresAt = Instant.now().plus(LIFETIME);
        var link = links.findByTourRequest_Id(tourRequestId).orElse(null);
        if (link == null) link = links.save(new GalleryLink(tour, token, expiresAt));
        else link.renew(token, expiresAt);
        return new Link(link.getToken(), link.getExpiresAt());
    }

    @Transactional
    public void revoke(Long tourRequestId, Authentication authentication) {
        admin(authentication);
        links.findByTourRequest_Id(tourRequestId).ifPresent(links::delete);
    }

    /** Checks a link. Unknown and expired links look the same to the visitor. */
    @Transactional(readOnly = true)
    public Redeemed redeem(String token) {
        if (token == null || token.length() < 20 || token.length() > 64) throw gone();
        var link = links.findByToken(token).orElseThrow(GalleryLinkService::gone);
        if (link.isExpired()) throw gone();
        var owner = link.getTourRequest().getUser();
        if (owner.isPlatformAdmin()) throw gone();
        return new Redeemed(owner.getEmail(), link.getTourRequest().getId());
    }

    private static ResponseStatusException gone() {
        return new ResponseStatusException(HttpStatus.GONE, "This link has expired or is no longer valid. Ask us for a new one.");
    }

    private User admin(Authentication authentication) {
        var user = users.findByEmailIgnoreCase(authentication.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!user.isPlatformAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return user;
    }

    private static String newToken() {
        var bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
