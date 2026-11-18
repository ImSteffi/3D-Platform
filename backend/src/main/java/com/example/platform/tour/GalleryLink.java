package com.example.platform.tour;

import java.time.Instant;

import jakarta.persistence.*;

/** A link that signs a space's owner in and opens that space. See V16. */
@Entity
@Table(name = "gallery_links", schema = "public")
public class GalleryLink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "tour_request_id", nullable = false, unique = true)
    private TourRequest tourRequest;

    @Column(name = "token", nullable = false, length = 64, unique = true)
    private String token;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    protected GalleryLink() {
    }

    GalleryLink(TourRequest tourRequest, String token, Instant expiresAt) {
        this.tourRequest = tourRequest;
        this.token = token;
        this.expiresAt = expiresAt;
    }

    void renew(String token, Instant expiresAt) {
        this.token = token;
        this.expiresAt = expiresAt;
        this.createdAt = Instant.now();
    }

    public TourRequest getTourRequest() { return tourRequest; }
    public String getToken() { return token; }
    public Instant getExpiresAt() { return expiresAt; }
    boolean isExpired() { return !Instant.now().isBefore(expiresAt); }
}
