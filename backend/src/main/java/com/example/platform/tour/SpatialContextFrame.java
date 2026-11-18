package com.example.platform.tour;

import jakarta.persistence.*;

/** One photo of a spatial-context run, with the camera and depth Atlas returned for it. */
@Entity
@Table(name = "spatial_context_frames", schema = "public")
public class SpatialContextFrame {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private SpatialContextRun run;

    @Column(name = "frame_index", nullable = false)
    private int frameIndex;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "capture_point_id")
    private CapturePoint point;

    @Column(name = "point_seq", nullable = false)
    private int pointSeq;

    @Column(name = "camera_json", columnDefinition = "TEXT")
    private String cameraJson;

    @Column(name = "image_object_key", length = 1000)
    private String imageObjectKey;

    @Column(name = "depth_object_key", length = 1000)
    private String depthObjectKey;

    @Column(name = "confidence_object_key", length = 1000)
    private String confidenceObjectKey;

    protected SpatialContextFrame() {
    }

    public SpatialContextFrame(SpatialContextRun run, int frameIndex, CapturePoint point) {
        this.run = run;
        this.frameIndex = frameIndex;
        this.point = point;
        this.pointSeq = point == null ? 0 : point.getSeq();
    }

    public Long getId() { return id; }
    public SpatialContextRun getRun() { return run; }
    public int getFrameIndex() { return frameIndex; }
    public CapturePoint getPoint() { return point; }
    public int getPointSeq() { return pointSeq; }
    public String getCameraJson() { return cameraJson; }
    public String getImageObjectKey() { return imageObjectKey; }
    public String getDepthObjectKey() { return depthObjectKey; }
    public String getConfidenceObjectKey() { return confidenceObjectKey; }

    public void setResult(String cameraJson, String imageKey, String depthKey, String confidenceKey) {
        this.cameraJson = cameraJson;
        this.imageObjectKey = imageKey;
        this.depthObjectKey = depthKey;
        this.confidenceObjectKey = confidenceKey;
    }
}
