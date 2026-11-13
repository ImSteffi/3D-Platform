package com.example.platform.tour;

import jakarta.persistence.*;

@Entity
@Table(name = "capture_points", schema = "public")
public class CapturePoint {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "area_id", nullable = false)
    private TourArea area;

    @Column(name = "seq", nullable = false)
    private int seq;

    @Column(name = "x", nullable = false)
    private double x;

    @Column(name = "y", nullable = false)
    private double y;

    @Column(name = "direction", nullable = false)
    private double direction;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "photo_object_key", length = 1000)
    private String photoObjectKey;

    @Column(name = "retake_note", length = 500)
    private String retakeNote;

    protected CapturePoint() {
    }

    public CapturePoint(TourArea area, int seq, double x, double y, double direction, String note) {
        this.area = area;
        this.seq = seq;
        this.x = x;
        this.y = y;
        this.direction = direction;
        this.note = note;
    }

    public Long getId() { return id; }
    public TourArea getArea() { return area; }
    public int getSeq() { return seq; }
    public double getX() { return x; }
    public double getY() { return y; }
    public double getDirection() { return direction; }
    public String getNote() { return note; }
    public String getPhotoObjectKey() { return photoObjectKey; }
    public String getRetakeNote() { return retakeNote; }
    public void setPhotoObjectKey(String photoObjectKey) { this.photoObjectKey = photoObjectKey; }
    public void setRetakeNote(String retakeNote) { this.retakeNote = retakeNote; }
}
