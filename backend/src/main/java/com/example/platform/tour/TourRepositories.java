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

interface CapturePointRepository extends JpaRepository<CapturePoint, Long> {
    List<CapturePoint> findByArea_IdOrderBySeqAsc(Long areaId);
    List<CapturePoint> findByArea_TourRequest_IdOrderBySeqAsc(Long tourRequestId);
}
