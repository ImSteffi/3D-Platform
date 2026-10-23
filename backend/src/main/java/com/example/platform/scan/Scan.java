package com.example.platform.scan;

import com.example.platform.project.Project;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@org.hibernate.annotations.DynamicUpdate
@Entity
@Table(name = "scans", schema = "public")
public class Scan {

    public enum Status {
        UPLOADING,
        READY,
        FAILED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status;

    protected Scan() {
    }

    public Scan(Project project, String name) {
        this.project = project;
        this.name = name;
        this.status = Status.UPLOADING;
    }

    public Long getId() {
        return id;
    }

    public Project getProject() {
        return project;
    }

    public String getName() {
        return name;
    }

    public Status getStatus() {
        return status;
    }

    public void markReady() {
        this.status = Status.READY;
    }

    public void markFailed() {
        this.status = Status.FAILED;
    }
}