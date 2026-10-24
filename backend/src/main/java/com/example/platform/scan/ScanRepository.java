package com.example.platform.scan;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ScanRepository extends JpaRepository<Scan, Long> {

    List<Scan> findByProject_IdOrderByIdAsc(Long projectId);

    List<Scan> findByProject_IdAndStatusOrderByIdAsc(Long projectId, Scan.Status status);

    java.util.Optional<Scan> findByShareToken(String token);

    long countByProject_IdAndStatus(Long projectId, Scan.Status status);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select s from Scan s where s.id = :id")
    java.util.Optional<Scan> findForUpdate(@org.springframework.data.repository.query.Param("id") Long id);
}