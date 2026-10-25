package com.example.platform.scan;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@org.hibernate.annotations.DynamicUpdate
@Entity
@Table(name = "scan_files", schema = "public")
public class ScanFile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "scan_id", nullable = false)
    private Scan scan;

    @Column(name = "relative_path", nullable = false, length = 1000)
    private String relativePath;

    @Column(name = "object_key", nullable = false, length = 1000)
    private String objectKey;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "upload_id")
    private String uploadId;

    public String getUploadId() { return uploadId; }
    public void setUploadId(String uploadId) { this.uploadId = uploadId; }

    protected ScanFile() {
    }

    public ScanFile(
            Scan scan,
            String relativePath,
            String objectKey,
            long sizeBytes) {

        this.scan = scan;
        this.relativePath = relativePath;
        this.objectKey = objectKey;
        this.sizeBytes = sizeBytes;
    }

    public Long getId() {
        return id;
    }

    public Scan getScan() {
        return scan;
    }

    public String getRelativePath() {
        return relativePath;
    }

    public String getObjectKey() {
        return objectKey;
    }

    public void setSizeBytes(long sizeBytes) { this.sizeBytes = sizeBytes; }

    public long getSizeBytes() {
        return sizeBytes;
    }
}