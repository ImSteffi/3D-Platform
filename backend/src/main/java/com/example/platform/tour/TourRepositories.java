package com.example.platform.tour;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface TourRequestRepository extends JpaRepository<TourRequest, Long> {
    List<TourRequest> findByUser_IdOrderByIdDesc(Long userId);
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
