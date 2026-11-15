package com.example.platform.scan;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ScanRepository extends JpaRepository<Scan, Long> {

    List<Scan> findByProject_IdOrderByIdAsc(Long projectId);

    List<Scan> findByProject_IdAndStatusOrderByIdAsc(Long projectId, Scan.Status status);

    java.util.Optional<Scan> findByShareToken(String token);

    // Scans in projects of the organizations a user belongs to, newest first.
    @org.springframework.data.jpa.repository.Query("""
            select s from Scan s join fetch s.project p join fetch p.organization o
            where s.status = :status
            and exists (select m.id from OrganizationMembership m
                where m.organization.id = o.id and m.user.id = :userId)
            order by s.id desc
            """)
    List<Scan> findForMember(@org.springframework.data.repository.query.Param("userId") Long userId,
            @org.springframework.data.repository.query.Param("status") Scan.Status status);

    long countByProject_IdAndStatus(Long projectId, Scan.Status status);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select s from Scan s where s.id = :id")
    java.util.Optional<Scan> findForUpdate(@org.springframework.data.repository.query.Param("id") Long id);
}