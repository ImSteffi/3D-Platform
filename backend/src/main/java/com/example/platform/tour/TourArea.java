package com.example.platform.tour;

import jakarta.persistence.*;

@Entity
@Table(name = "tour_areas", schema = "public")
public class TourArea {

    public enum Kind { FLOOR, BUILDING, OUTDOOR }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "tour_request_id", nullable = false)
    private TourRequest tourRequest;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 20)
    private Kind kind;

    @Column(name = "capture_group", nullable = false)
    private int captureGroup;

    @Column(name = "plan_object_key", length = 1000)
    private String planObjectKey;

    @Column(name = "marker_dot_size", nullable = false)
    private int markerDotSize = 22;

    @Column(name = "marker_line_length", nullable = false)
    private int markerLineLength = 26;

    protected TourArea() {
    }

    public TourArea(TourRequest tourRequest, String name, Kind kind, int captureGroup) {
        this.tourRequest = tourRequest;
        this.name = name;
        this.kind = kind;
        this.captureGroup = captureGroup;
    }

    public Long getId() { return id; }
    public TourRequest getTourRequest() { return tourRequest; }
    public String getName() { return name; }
    public Kind getKind() { return kind; }
    public int getCaptureGroup() { return captureGroup; }
    public String getPlanObjectKey() { return planObjectKey; }
    public int getMarkerDotSize() { return markerDotSize; }
    public int getMarkerLineLength() { return markerLineLength; }
    public void setMarkerSizes(int dotSize, int lineLength) {
        this.markerDotSize = dotSize;
        this.markerLineLength = lineLength;
    }
    public void setName(String name) { this.name = name; }
    public void setKind(Kind kind) { this.kind = kind; }
    public void setCaptureGroup(int captureGroup) { this.captureGroup = captureGroup; }
    public void setPlanObjectKey(String planObjectKey) { this.planObjectKey = planObjectKey; }
}
