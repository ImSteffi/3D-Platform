package com.example.platform.tour;

import java.time.Instant;

import jakarta.persistence.*;

/** A photo added to a floor directly, not tied to a capture point. See V17. */
@Entity
@Table(name = "floor_photos", schema = "public")
public class FloorPhoto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "area_id", nullable = false)
    private TourArea area;

    @Column(name = "object_key", nullable = false, length = 1000)
    private String objectKey;

    // SHA-256 of the image bytes, so the same photo is not stored twice on one floor.
    @Column(name = "content_hash", length = 64)
    private String contentHash;

    // True when it came in through a gallery link: only such photos can be deleted through the link.
    @Column(name = "via_link", nullable = false)
    private boolean viaLink;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected FloorPhoto() {
    }

    FloorPhoto(TourArea area, String objectKey, String contentHash, boolean viaLink) {
        this.viaLink = viaLink;
        this.area = area;
        this.objectKey = objectKey;
        this.contentHash = contentHash;
    }

    void setContentHash(String contentHash) { this.contentHash = contentHash; }

    public Long getId() { return id; }
    public TourArea getArea() { return area; }
    public String getObjectKey() { return objectKey; }
    public String getContentHash() { return contentHash; }
    public boolean isViaLink() { return viaLink; }
    public java.time.Instant getCreatedAt() { return createdAt; }
}
