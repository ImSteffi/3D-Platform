package com.example.platform.tour;

import java.time.Instant;
import java.util.List;

import jakarta.persistence.*;
import org.springframework.data.jpa.repository.JpaRepository;

/** One Atlas images2PosedRGBD run for a floor's photos. */
@Entity
@Table(name = "spatial_context_runs", schema = "public")
public class SpatialContextRun {

    public enum Status { RUNNING, SUCCEEDED, FAILED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "area_id", nullable = false)
    private TourArea area;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status = Status.RUNNING;

    @Column(name = "operation_id", length = 200)
    private String operationId;

    @Column(name = "error", length = 2000)
    private String error;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "finished_at")
    private Instant finishedAt;

    protected SpatialContextRun() {
    }

    public SpatialContextRun(TourArea area) {
        this.area = area;
    }

    public Long getId() { return id; }
    public TourArea getArea() { return area; }
    public Status getStatus() { return status; }
    public String getOperationId() { return operationId; }
    public String getError() { return error; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getFinishedAt() { return finishedAt; }
    public void setOperationId(String operationId) { this.operationId = operationId; }

    public void succeed() {
        this.status = Status.SUCCEEDED;
        this.finishedAt = Instant.now();
    }

    public void fail(String error) {
        this.status = Status.FAILED;
        this.error = error == null ? "Unknown error." : error.length() > 2000 ? error.substring(0, 2000) : error;
        this.finishedAt = Instant.now();
    }
}

interface SpatialContextRunRepository extends JpaRepository<SpatialContextRun, Long> {
    List<SpatialContextRun> findByArea_IdOrderByIdDesc(Long areaId);
    boolean existsByArea_IdAndStatus(Long areaId, SpatialContextRun.Status status);
    List<SpatialContextRun> findByStatus(SpatialContextRun.Status status);
}

interface SpatialContextFrameRepository extends JpaRepository<SpatialContextFrame, Long> {
    List<SpatialContextFrame> findByRun_IdOrderByFrameIndexAsc(Long runId);
}
