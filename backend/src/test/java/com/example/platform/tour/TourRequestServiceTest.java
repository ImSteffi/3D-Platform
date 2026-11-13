package com.example.platform.tour;

import com.example.platform.user.User;
import com.example.platform.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.mockito.ArgumentCaptor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;

import static com.example.platform.tour.TourRequest.Status.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class TourRequestServiceTest {
    static final byte[] JPEG = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xe0, 0, 0};
    static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0};
    static final byte[] WEBP = {'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P', 'V', 'P'};

    final TourRequestRepository tours = mock(TourRequestRepository.class);
    final TourAreaRepository areas = mock(TourAreaRepository.class);
    final CapturePointRepository points = mock(CapturePointRepository.class);
    final UserRepository users = mock(UserRepository.class);
    final S3Client r2 = mock(S3Client.class);
    final TourRequestService service = new TourRequestService(tours, areas, points, users, r2,
            mock(S3Presigner.class), "test");

    final User owner = user(1L, "owner@example.com", false);
    final User stranger = user(2L, "stranger@example.com", false);
    final User admin = user(3L, "admin@example.com", true);

    User user(long id, String email, boolean platformAdmin) {
        var user = mock(User.class);
        when(user.getId()).thenReturn(id);
        when(user.getEmail()).thenReturn(email);
        when(user.getDisplayName()).thenReturn(email);
        when(user.isPlatformAdmin()).thenReturn(platformAdmin);
        when(users.findByEmailIgnoreCase(email)).thenReturn(Optional.of(user));
        return user;
    }

    static Authentication as(User user) {
        return new UsernamePasswordAuthenticationToken(user.getEmail(), "password");
    }

    static void setId(Object entity, long id) {
        try {
            var field = entity.getClass().getDeclaredField("id");
            field.setAccessible(true);
            field.set(entity, id);
        } catch (ReflectiveOperationException error) {
            throw new AssertionError(error);
        }
    }

    TourRequest tour(long id, TourRequest.Status status) {
        var tour = new TourRequest(owner, "Tour " + id, null);
        setId(tour, id);
        tour.setStatus(status);
        when(tours.findById(id)).thenReturn(Optional.of(tour));
        when(areas.findByTourRequest_IdOrderByIdAsc(id)).thenReturn(List.of());
        return tour;
    }

    TourArea area(long id, TourRequest tour, int group, String planKey) {
        var area = new TourArea(tour, "Area " + id, TourArea.Kind.FLOOR, group);
        setId(area, id);
        area.setPlanObjectKey(planKey);
        when(areas.findById(id)).thenReturn(Optional.of(area));
        when(points.findByArea_IdOrderBySeqAsc(id)).thenReturn(List.of());
        return area;
    }

    CapturePoint point(long id, TourArea area, int seq) {
        var point = new CapturePoint(area, seq, .5, .5, 90, null);
        setId(point, id);
        when(points.findById(id)).thenReturn(Optional.of(point));
        return point;
    }

    void areasOf(TourRequest tour, TourArea... entries) {
        when(areas.findByTourRequest_IdOrderByIdAsc(tour.getId())).thenReturn(List.of(entries));
    }

    List<CapturePoint> manyPoints(TourArea area, int count) {
        var list = new ArrayList<CapturePoint>();
        for (int i = 1; i <= count; i++) list.add(new CapturePoint(area, i, .1, .1, 0, null));
        when(points.findByArea_IdOrderBySeqAsc(area.getId())).thenReturn(list);
        return list;
    }

    static void assertStatus(int expected, Executable action) {
        assertEquals(expected, assertThrows(ResponseStatusException.class, action).getStatusCode().value());
    }

    static TourRequestService.PointInput input(double x, double y, double direction) {
        return new TourRequestService.PointInput(x, y, direction, null);
    }

    // ---- Ownership and visibility ----

    @Test void anotherUsersRequestIsReportedAsMissing() {
        tour(10L, DRAFT);
        assertStatus(404, () -> service.get(10L, as(stranger)));
        assertStatus(404, () -> service.submit(10L, as(stranger)));
        assertStatus(404, () -> service.delete(10L, as(stranger)));
        assertStatus(404, () -> service.planUrl(10L, 1L, as(stranger)));
    }

    @Test void administratorCanReadAnyRequestButNotActAsTheOwner() {
        tour(10L, DRAFT);
        assertEquals(10L, service.get(10L, as(admin)).id());
        assertStatus(404, () -> service.submit(10L, as(admin)));
    }

    @Test void missingRequestIsNotFound() {
        when(tours.findById(99L)).thenReturn(Optional.empty());
        assertStatus(404, () -> service.get(99L, as(owner)));
    }

    @Test void pointsStayHiddenFromTheClientUntilThePlanIsSent() {
        for (var status : List.of(DRAFT, SUBMITTED)) {
            var tour = tour(10L, status);
            var area = area(20L, tour, 1, "plan");
            areasOf(tour, area);
            var hidden = List.of(point(30L, area, 1));
            when(points.findByArea_IdOrderBySeqAsc(20L)).thenReturn(hidden);
            assertTrue(service.get(10L, as(owner)).areas().getFirst().points().isEmpty(), status.name());
            assertEquals(1, service.get(10L, as(admin)).areas().getFirst().points().size(), status.name());
        }
        var tour = tour(10L, PLAN_READY);
        var area = area(20L, tour, 1, "plan");
        areasOf(tour, area);
        var sent = List.of(point(30L, area, 1));
        when(points.findByArea_IdOrderBySeqAsc(20L)).thenReturn(sent);
        var visible = service.get(10L, as(owner)).areas().getFirst();
        assertTrue(visible.hasPlan());
        assertEquals(1, visible.points().size());
        assertFalse(visible.points().getFirst().hasPhoto());
    }

    @Test void onlyAdministratorsUseAdministratorOperations() {
        tour(10L, SUBMITTED);
        assertStatus(403, () -> service.listSubmitted(as(owner)));
        assertStatus(403, () -> service.savePoints(10L, 20L, 1, List.of(), as(owner)));
        assertStatus(403, () -> service.sendPlan(10L, as(owner)));
        assertStatus(403, () -> service.review(10L, true, List.of(), as(owner)));
    }

    // ---- Status gates ----

    @Test void everyMutationIsRejectedOutsideItsStep() {
        record Gate(TourRequest.Status required, Executable action) {}
        var gates = List.of(
                new Gate(DRAFT, () -> service.delete(10L, as(owner))),
                new Gate(DRAFT, () -> service.addArea(10L, "Floor", TourArea.Kind.FLOOR, as(owner))),
                new Gate(DRAFT, () -> service.removeArea(10L, 20L, as(owner))),
                new Gate(DRAFT, () -> service.savePlan(10L, 20L, JPEG, as(owner))),
                new Gate(DRAFT, () -> service.submit(10L, as(owner))),
                new Gate(PLAN_READY, () -> service.savePhoto(10L, 30L, JPEG, as(owner))),
                new Gate(PLAN_READY, () -> service.submitPhotos(10L, as(owner))),
                new Gate(SUBMITTED, () -> service.savePoints(10L, 20L, 1, List.of(), as(admin))),
                new Gate(SUBMITTED, () -> service.sendPlan(10L, as(admin))),
                new Gate(PHOTOS_SUBMITTED, () -> service.review(10L, true, List.of(), as(admin))));
        for (var gate : gates) {
            for (var status : EnumSet.complementOf(EnumSet.of(gate.required()))) {
                tour(10L, status);
                assertStatus(409, gate.action());
            }
        }
        verifyNoInteractions(r2);
        verify(tours, never()).delete(any());
    }

    // ---- Floor plans ----

    @Test void submitNeedsAnAreaAndAPlanOnEachArea() {
        var tour = tour(10L, DRAFT);
        assertStatus(409, () -> service.submit(10L, as(owner)));
        areasOf(tour, area(20L, tour, 1, "plan"), area(21L, tour, 2, null));
        assertStatus(409, () -> service.submit(10L, as(owner)));
        assertEquals(DRAFT, tour.getStatus());
        areasOf(tour, area(20L, tour, 1, "plan"), area(21L, tour, 2, "plan-2"));
        assertEquals("SUBMITTED", service.submit(10L, as(owner)).status());
        assertEquals(SUBMITTED, tour.getStatus());
    }

    @Test void newAreasStartInTheirOwnCaptureGroupAndAreCapped() {
        var tour = tour(10L, DRAFT);
        areasOf(tour, area(20L, tour, 1, null), area(21L, tour, 4, null));
        when(areas.countByTourRequest_Id(10L)).thenReturn(2L);
        service.addArea(10L, "  Shed ", TourArea.Kind.BUILDING, as(owner));
        var saved = ArgumentCaptor.forClass(TourArea.class);
        verify(areas).save(saved.capture());
        assertEquals("Shed", saved.getValue().getName());
        assertEquals(5, saved.getValue().getCaptureGroup());

        when(areas.countByTourRequest_Id(10L)).thenReturn((long) TourRequestService.MAX_AREAS);
        assertStatus(409, () -> service.addArea(10L, "One more", TourArea.Kind.FLOOR, as(owner)));
    }

    @Test void imageTypeIsJudgedByContent() {
        assertEquals("image/jpeg", TourRequestService.imageType(JPEG));
        assertEquals("image/png", TourRequestService.imageType(PNG));
        assertEquals("image/webp", TourRequestService.imageType(WEBP));
        assertNull(TourRequestService.imageType("<svg onload=alert(1)>".getBytes()));
        assertNull(TourRequestService.imageType("%PDF-1.7 padding".getBytes()));
        assertNull(TourRequestService.imageType(new byte[0]));
        assertNull(TourRequestService.imageType(new byte[]{'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'A', 'V', 'E', 0}));
    }

    @Test void planUploadStoresImagesAndRejectsEverythingElse() {
        var tour = tour(10L, DRAFT);
        var area = area(20L, tour, 1, "old-plan");
        areasOf(tour, area);

        assertStatus(400, () -> service.savePlan(10L, 20L, "not an image".getBytes(), as(owner)));
        assertStatus(413, () -> service.savePlan(10L, 20L,
                new byte[TourRequestService.MAX_PLAN_BYTES + 1], as(owner)));
        assertEquals("old-plan", area.getPlanObjectKey());
        verifyNoInteractions(r2);

        var detail = service.savePlan(10L, 20L, PNG, as(owner));
        var request = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(r2).putObject(request.capture(), any(RequestBody.class));
        assertEquals("image/png", request.getValue().contentType());
        assertEquals(request.getValue().key(), area.getPlanObjectKey());
        assertTrue(area.getPlanObjectKey().startsWith("users/1/tours/10/areas/20/floorplan_client/plan-"));
        assertTrue(detail.areas().getFirst().hasPlan());
    }

    @Test void areaOfAnotherTourIsNotFound() {
        tour(10L, DRAFT);
        var other = tour(11L, DRAFT);
        area(20L, other, 1, "plan");
        assertStatus(404, () -> service.savePlan(10L, 20L, JPEG, as(owner)));
        assertStatus(404, () -> service.removeArea(10L, 20L, as(owner)));
        assertStatus(404, () -> service.planUrl(10L, 20L, as(owner)));
    }

    // ---- Capture plan ----

    @Test void savePointsValidatesAndNumbersPointsInOrder() {
        var tour = tour(10L, SUBMITTED);
        var area = area(20L, tour, 1, "plan");
        areasOf(tour, area);

        for (var bad : List.of(input(-.01, .5, 0), input(1.01, .5, 0), input(.5, -.01, 0), input(.5, 1.01, 0),
                input(.5, .5, -1), input(.5, .5, 360), input(Double.NaN, .5, 0), input(.5, .5, Double.NaN))) {
            assertStatus(400, () -> service.savePoints(10L, 20L, 1, List.of(bad), as(admin)));
        }
        assertStatus(400, () -> service.savePoints(10L, 20L, 0, List.of(), as(admin)));
        assertStatus(400, () -> service.savePoints(10L, 20L, 51, List.of(), as(admin)));
        var tooMany = new ArrayList<TourRequestService.PointInput>();
        for (int i = 0; i <= TourRequestService.MAX_POINTS_PER_GROUP; i++) tooMany.add(input(.5, .5, 0));
        assertStatus(400, () -> service.savePoints(10L, 20L, 1, tooMany, as(admin)));
        verify(points, never()).save(any());
        assertEquals(1, area.getCaptureGroup());

        service.savePoints(10L, 20L, 3, List.of(input(0, 0, 0), input(1, 1, 359.9),
                new TourRequestService.PointInput(.25, .75, 180, "  face the window  ")), as(admin));
        var saved = ArgumentCaptor.forClass(CapturePoint.class);
        verify(points, times(3)).save(saved.capture());
        assertEquals(List.of(1, 2, 3), saved.getAllValues().stream().map(CapturePoint::getSeq).toList());
        assertEquals("face the window", saved.getAllValues().get(2).getNote());
        assertNull(saved.getAllValues().get(0).getNote());
        assertEquals(3, area.getCaptureGroup());
        assertEquals(SUBMITTED, tour.getStatus());
    }

    @Test void sendPlanNeedsPointsOnEveryArea() {
        var tour = tour(10L, SUBMITTED);
        var first = area(20L, tour, 1, "plan");
        var second = area(21L, tour, 2, "plan");
        areasOf(tour, first, second);
        manyPoints(first, 3);
        assertStatus(409, () -> service.sendPlan(10L, as(admin)));
        assertEquals(SUBMITTED, tour.getStatus());
        manyPoints(second, 1);
        assertEquals("PLAN_READY", service.sendPlan(10L, as(admin)).status());
    }

    @Test void sendPlanEnforcesThePhotoLimitPerCaptureGroup() {
        var tour = tour(10L, SUBMITTED);
        var first = area(20L, tour, 1, "plan");
        var second = area(21L, tour, 1, "plan");
        areasOf(tour, first, second);
        manyPoints(first, 40);
        manyPoints(second, 25);
        assertStatus(409, () -> service.sendPlan(10L, as(admin)));
        assertEquals(SUBMITTED, tour.getStatus());

        manyPoints(second, 24); // exactly 64 in the merged group
        assertEquals("PLAN_READY", service.sendPlan(10L, as(admin)).status());

        tour.setStatus(SUBMITTED);
        second.setCaptureGroup(2); // separate generations may each use the full limit
        manyPoints(first, 64);
        manyPoints(second, 64);
        assertEquals("PLAN_READY", service.sendPlan(10L, as(admin)).status());
    }

    // ---- Photos ----

    @Test void photoUploadReplacesThePhotoAndClearsTheRetakeNote() {
        var tour = tour(10L, PLAN_READY);
        var area = area(20L, tour, 1, "plan");
        var point = point(30L, area, 1);
        point.setPhotoObjectKey("old-photo");
        point.setRetakeNote("too dark");

        assertStatus(400, () -> service.savePhoto(10L, 30L, "nope".getBytes(), as(owner)));
        assertStatus(413, () -> service.savePhoto(10L, 30L,
                new byte[TourRequestService.MAX_PHOTO_BYTES + 1], as(owner)));
        assertEquals("too dark", point.getRetakeNote());
        assertEquals("old-photo", point.getPhotoObjectKey());

        service.savePhoto(10L, 30L, JPEG, as(owner));
        assertNull(point.getRetakeNote());
        assertTrue(point.getPhotoObjectKey().startsWith("users/1/tours/10/areas/20/photos/point-01-"));
    }

    @Test void pointOfAnotherTourIsNotFound() {
        tour(10L, PLAN_READY);
        var other = tour(11L, PLAN_READY);
        point(30L, area(20L, other, 1, "plan"), 1);
        assertStatus(404, () -> service.savePhoto(10L, 30L, JPEG, as(owner)));
        assertStatus(404, () -> service.photoUrl(10L, 30L, as(owner)));
        when(points.findById(31L)).thenReturn(Optional.empty());
        assertStatus(404, () -> service.savePhoto(10L, 31L, JPEG, as(owner)));
    }

    @Test void submitPhotosNeedsEveryPhotoAndNoOutstandingRetakes() {
        var tour = tour(10L, PLAN_READY);
        var area = area(20L, tour, 1, "plan");
        var first = point(30L, area, 1);
        var second = point(31L, area, 2);
        when(points.findByArea_TourRequest_IdOrderBySeqAsc(10L)).thenReturn(List.of(first, second));

        first.setPhotoObjectKey("a");
        assertStatus(409, () -> service.submitPhotos(10L, as(owner)));
        second.setPhotoObjectKey("b");
        second.setRetakeNote("blurry");
        assertStatus(409, () -> service.submitPhotos(10L, as(owner)));
        assertEquals(PLAN_READY, tour.getStatus());
        second.setRetakeNote(null);
        assertEquals("PHOTOS_SUBMITTED", service.submitPhotos(10L, as(owner)).status());
    }

    // ---- Review ----

    @Test void reviewApprovesOrSendsPhotosBackWithNotes() {
        var tour = tour(10L, PHOTOS_SUBMITTED);
        var point = point(30L, area(20L, tour, 1, "plan"), 1);
        var foreign = point(40L, area(21L, tour(11L, PHOTOS_SUBMITTED), 1, "plan"), 1);

        assertStatus(400, () -> service.review(10L, false, List.of(), as(admin)));
        assertStatus(400, () -> service.review(10L, false, null, as(admin)));
        assertStatus(400, () -> service.review(10L, false,
                List.of(new TourRequestService.Retake(30L, "   ")), as(admin)));
        assertStatus(404, () -> service.review(10L, false,
                List.of(new TourRequestService.Retake(40L, "retake")), as(admin)));
        assertStatus(404, () -> service.review(10L, false,
                List.of(new TourRequestService.Retake(null, "retake")), as(admin)));
        assertEquals(PHOTOS_SUBMITTED, tour.getStatus());
        assertNull(foreign.getRetakeNote());

        assertEquals("PLAN_READY", service.review(10L, false,
                List.of(new TourRequestService.Retake(30L, " too dark ")), as(admin)).status());
        assertEquals("too dark", point.getRetakeNote());

        tour.setStatus(PHOTOS_SUBMITTED);
        assertEquals("APPROVED", service.review(10L, true, List.of(), as(admin)).status());
        assertEquals(APPROVED, tour.getStatus());
    }
}
