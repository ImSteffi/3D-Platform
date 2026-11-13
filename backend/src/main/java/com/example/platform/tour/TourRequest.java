package com.example.platform.tour;

import java.time.Instant;

import com.example.platform.user.User;

import jakarta.persistence.*;

@Entity
@Table(name = "tour_requests", schema = "public")
public class TourRequest {

    public enum Status { DRAFT, SUBMITTED, PLAN_READY, PHOTOS_SUBMITTED, APPROVED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "notes", length = 2000)
    private String notes;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private Status status = Status.DRAFT;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected TourRequest() {
    }

    public TourRequest(User user, String name, String notes) {
        this.user = user;
        this.name = name;
        this.notes = notes;
    }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public String getName() { return name; }
    public String getNotes() { return notes; }
    public Status getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
    public void setStatus(Status status) { this.status = status; }
}
