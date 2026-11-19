package com.example.platform.tour;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface TourRequestRepository extends JpaRepository<TourRequest, Long> {
    List<TourRequest> findByUser_IdOrderByIdDesc(Long userId);

    /** The user's own spaces and those of everyone in the user's organizations. */
    @org.springframework.data.jpa.repository.Query("""
            select t from TourRequest t
            where t.user.id = :userId
               or t.user.id in (select theirs.user.id from com.example.platform.organization.OrganizationMembership mine,
                                com.example.platform.organization.OrganizationMembership theirs
                                where mine.user.id = :userId and theirs.organization.id = mine.organization.id)
            order by t.id desc
            """)
    List<TourRequest> findVisibleTo(@org.springframework.data.repository.query.Param("userId") Long userId);
    List<TourRequest> findByStatusNotOrderByIdDesc(TourRequest.Status status);
}

interface TourAreaRepository extends JpaRepository<TourArea, Long> {
    List<TourArea> findByTourRequest_IdOrderByIdAsc(Long tourRequestId);
    long countByTourRequest_Id(Long tourRequestId);
}

interface FloorPhotoRepository extends JpaRepository<FloorPhoto, Long> {
    List<FloorPhoto> findByArea_IdOrderByIdAsc(Long areaId);
    long countByArea_Id(Long areaId);
    boolean existsByArea_IdAndContentHash(Long areaId, String contentHash);
    List<FloorPhoto> findByContentHashIsNull();
}

interface GalleryLinkRepository extends JpaRepository<GalleryLink, Long> {
    java.util.Optional<GalleryLink> findByTourRequest_Id(Long tourRequestId);
    java.util.Optional<GalleryLink> findByToken(String token);
}

interface CapturePointRepository extends JpaRepository<CapturePoint, Long> {
    List<CapturePoint> findByArea_IdOrderBySeqAsc(Long areaId);
    List<CapturePoint> findByArea_TourRequest_IdOrderBySeqAsc(Long tourRequestId);
}
