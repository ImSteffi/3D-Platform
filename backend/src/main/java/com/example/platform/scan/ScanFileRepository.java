package com.example.platform.scan;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ScanFileRepository
        extends JpaRepository<ScanFile, Long> {

    List<ScanFile> findByScan_IdOrderByIdAsc(Long scanId);
}