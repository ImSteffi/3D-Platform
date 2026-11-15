package com.example.platform.tour;

import com.example.platform.organization.Organization;
import com.example.platform.organization.OrganizationMembershipRepository;
import com.example.platform.project.Project;
import com.example.platform.scan.Scan;
import com.example.platform.scan.ScanRepository;
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
    final ScanRepository scans = mock(ScanRepository.class);
    final OrganizationMembershipRepository memberships = mock(OrganizationMembershipRepository.class);
    final S3Client r2 = mock(S3Client.class);
    final TourRequestService service = new TourRequestService(tours, areas, points, users, scans,
            memberships, r2,
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

    /** A scan in project 60 of organization 70, of which the owner is a member unless stated otherwise. */
    Scan scan(long id, Scan.Status status) {
        var organization = mock(Organization.class);
        when(organization.getId()).thenReturn(70L);
        when(organization.getName()).thenReturn("Organization 70");
        var project = mock(Project.class);
        when(project.getId()).thenReturn(60L);
        when(project.getName()).thenReturn("Project 60");
        when(project.getOrganization()).thenReturn(organization);
        var scan = mock(Scan.class);
        when(scan.getId()).thenReturn(id);
        when(scan.getName()).thenReturn("Scan " + id);
        when(scan.getStatus()).thenReturn(status);
        when(scan.getProject()).thenReturn(project);
        when(scans.findById(id)).thenReturn(Optional.of(scan));
        when(memberships.existsByOrganization_IdAndUser_Id(70L, 1L)).thenReturn(true);
        return scan;
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

    static void assertRefused(String message, Executable action) {
        var error = assertThrows(ResponseStatusException.class, action);
        assertEquals(409, error.getStatusCode().value());
        assertEquals(message, error.getReason());
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
        assertStatus(403, () -> service.deliver(10L, 50L, as(owner)));
        assertStatus(403, () -> service.deliverableScans(10L, as(owner)));
        assertStatus(403, () -> service.adminAddArea(10L, "Attic", TourArea.Kind.FLOOR, as(owner)));
        assertStatus(403, () -> service.adminSavePlan(10L, 20L, PNG, as(owner)));
        assertStatus(403, () -> service.adminRemoveArea(10L, 20L, as(owner)));
        assertStatus(403, () -> service.adminUpdateArea(10L, 20L, "x", null, as(owner)));
        assertStatus(403, () -> service.listForUser(1L, as(owner)));
        assertStatus(403, () -> service.customer(1L, as(owner)));
    }

    // ---- Status gates ----

    @Test void everyMutationIsRejectedOutsideItsStep() {
        record Gate(TourRequest.Status required, Executable action) {}
        var gates = List.of(
                new Gate(DRAFT, () -> service.delete(10L, as(owner))),
                new Gate(DRAFT, () -> service.submit(10L, as(owner))),
                new Gate(PLAN_READY, () -> service.savePhoto(10L, 30L, JPEG, as(owner))),
                new Gate(PLAN_READY, () -> service.submitPhotos(10L, as(owner))),
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

    // ---- Delivery ----

    @Test void deliverLinksAReadyScanAndFinishesTheRequest() {
        var tour = tour(10L, APPROVED);
        scan(50L, Scan.Status.READY);
        var before = service.get(10L, as(owner));
        assertNull(before.scanId());
        assertNull(before.scanName());
        assertNull(before.projectId());

        var detail = service.deliver(10L, 50L, as(admin));
        assertEquals("DELIVERED", detail.status());
        assertEquals(50L, detail.scanId());
        assertEquals("Scan 50", detail.scanName());
        assertEquals(60L, detail.projectId());
        assertEquals(DELIVERED, tour.getStatus());

        var seen = service.get(10L, as(owner));
        assertEquals("DELIVERED", seen.status());
        assertEquals(50L, seen.scanId());
        when(tours.findByUser_IdOrderByIdDesc(1L)).thenReturn(List.of(tour));
        var summary = service.listOwn(as(owner)).getFirst();
        assertEquals("DELIVERED", summary.status());
        assertEquals(50L, summary.scanId());
        assertEquals("Scan 50", summary.scanName());
        assertEquals(60L, summary.projectId());
    }

    @Test void deliverNeedsAnApprovedRequest() {
        scan(50L, Scan.Status.READY);
        for (var status : EnumSet.complementOf(EnumSet.of(APPROVED, DELIVERED))) {
            var tour = tour(10L, status);
            assertStatus(409, () -> service.deliver(10L, 50L, as(admin)));
            assertEquals(status, tour.getStatus());
            assertNull(tour.getScan());
        }
        when(tours.findById(99L)).thenReturn(Optional.empty());
        assertStatus(404, () -> service.deliver(99L, 50L, as(admin)));
    }

    @Test void deliverNeedsAnExistingReadyScan() {
        var tour = tour(10L, APPROVED);
        when(scans.findById(51L)).thenReturn(Optional.empty());
        assertStatus(404, () -> service.deliver(10L, 51L, as(admin)));
        assertStatus(404, () -> service.deliver(10L, null, as(admin)));
        for (var status : List.of(Scan.Status.UPLOADING, Scan.Status.FAILED)) {
            scan(50L, status);
            assertStatus(409, () -> service.deliver(10L, 50L, as(admin)));
        }
        assertEquals(APPROVED, tour.getStatus());
        assertNull(tour.getScan());
    }

    @Test void deliverNeedsTheOwnerToBelongToTheScansOrganization() {
        var tour = tour(10L, APPROVED);
        scan(50L, Scan.Status.READY);
        when(memberships.existsByOrganization_IdAndUser_Id(70L, 1L)).thenReturn(false);
        // The administrator's own membership does not count.
        when(memberships.existsByOrganization_IdAndUser_Id(70L, 3L)).thenReturn(true);
        var error = assertThrows(ResponseStatusException.class, () -> service.deliver(10L, 50L, as(admin)));
        assertEquals(409, error.getStatusCode().value());
        assertEquals("The customer is not a member of the organization that owns this tour.", error.getReason());
        assertEquals(APPROVED, tour.getStatus());
        assertNull(tour.getScan());
    }

    @Test void deliveringAgainReplacesTheScan() {
        var tour = tour(10L, APPROVED);
        scan(50L, Scan.Status.READY);
        var replacement = scan(51L, Scan.Status.READY);
        service.deliver(10L, 50L, as(admin));
        var detail = service.deliver(10L, 51L, as(admin));
        assertEquals("DELIVERED", detail.status());
        assertEquals(51L, detail.scanId());
        assertSame(replacement, tour.getScan());
    }

    @Test void aDeliveredRequestWhoseScanIsGoneIsReportedAsApproved() {
        var tour = tour(10L, DELIVERED); // the database cleared scan_id when the scan was deleted
        when(tours.findByUser_IdOrderByIdDesc(1L)).thenReturn(List.of(tour));
        var detail = service.get(10L, as(owner));
        assertEquals("APPROVED", detail.status());
        assertNull(detail.scanId());
        assertEquals("APPROVED", service.listOwn(as(owner)).getFirst().status());

        // A scan that is being deleted is no longer viewable either.
        tour.setScan(scan(50L, Scan.Status.FAILED));
        assertEquals("APPROVED", service.get(10L, as(owner)).status());
        assertNull(service.get(10L, as(owner)).scanId());

        scan(51L, Scan.Status.READY);
        assertEquals("DELIVERED", service.deliver(10L, 51L, as(admin)).status());
    }

    @Test void deliverableScansAreTheReadyScansOfTheOwnersOrganizations() {
        tour(10L, APPROVED);
        var newer = scan(51L, Scan.Status.READY);
        var older = scan(50L, Scan.Status.READY);
        when(scans.findForMember(1L, Scan.Status.READY)).thenReturn(List.of(newer, older));
        assertEquals(List.of(
                new TourRequestService.DeliverableScan(51L, "Scan 51", 60L, "Project 60", "Organization 70"),
                new TourRequestService.DeliverableScan(50L, "Scan 50", 60L, "Project 60", "Organization 70")),
                service.deliverableScans(10L, as(admin)));
    }

    @Test void aDeliveredRequestKeepsItsPhotos() {
        var tour = tour(10L, APPROVED);
        var point = point(30L, area(20L, tour, 1, "plan"), 1);
        point.setPhotoObjectKey("photo");
        scan(50L, Scan.Status.READY);
        service.deliver(10L, 50L, as(admin));
        assertStatus(409, () -> service.deletePhoto(10L, 30L, as(admin)));
        assertEquals("photo", point.getPhotoObjectKey());
        assertEquals(DELIVERED, tour.getStatus());
    }

    // ---- Floors added after sending ----

    @Test void areasCanBeAddedUntilTheTourIsDelivered() {
        for (var status : List.of(DRAFT, SUBMITTED, PLAN_READY)) {
            tour(10L, status);
            assertEquals(status.name(), service.addArea(10L, "Attic", TourArea.Kind.FLOOR, as(owner)).status());
        }
        // A reviewed or approved set is no longer complete, so it goes back to the client.
        for (var status : List.of(PHOTOS_SUBMITTED, APPROVED)) {
            var tour = tour(10L, status);
            var point = point(30L, area(20L, tour, 1, "plan"), 1);
            point.setPhotoObjectKey("photo");
            assertEquals("PLAN_READY", service.addArea(10L, "Attic", TourArea.Kind.FLOOR, as(owner)).status());
            assertEquals(PLAN_READY, tour.getStatus());
            assertEquals("photo", point.getPhotoObjectKey());
        }
        verify(areas, times(5)).save(any());
        verifyNoInteractions(r2);
        assertStatus(404, () -> service.addArea(10L, "Attic", TourArea.Kind.FLOOR, as(stranger)));
        assertStatus(404, () -> service.addArea(10L, "Attic", TourArea.Kind.FLOOR, as(admin)));
    }

    @Test void areasCannotBeAddedToADeliveredTour() {
        var tour = tour(10L, DELIVERED);
        tour.setScan(scan(50L, Scan.Status.READY));
        assertRefused("This tour is already delivered. Start a new space to capture more.",
                () -> service.addArea(10L, "Attic", TourArea.Kind.FLOOR, as(owner)));
        verify(areas, never()).save(any());
        assertEquals(DELIVERED, tour.getStatus());

        // Once the delivered scan is gone the request counts as approved again.
        tour.setScan(null);
        assertEquals("PLAN_READY", service.addArea(10L, "Attic", TourArea.Kind.FLOOR, as(owner)).status());
    }

    @Test void aLateAreaGetsAFreeCaptureGroupWhenTheHighestIsTaken() {
        var tour = tour(10L, SUBMITTED);
        areasOf(tour, area(20L, tour, 1, "plan"), area(21L, tour, TourRequestService.MAX_CAPTURE_GROUP, "plan"));
        service.addArea(10L, "Attic", TourArea.Kind.FLOOR, as(owner));
        var saved = ArgumentCaptor.forClass(TourArea.class);
        verify(areas).save(saved.capture());
        assertEquals(2, saved.getValue().getCaptureGroup());
    }

    @Test void aSentFloorCanChangeOnlyUntilItHasCapturePoints() {
        var locked = "This floor already has capture points. Ask us if it needs to change.";
        for (var status : List.of(SUBMITTED, PLAN_READY)) {
            var tour = tour(10L, status);
            var marked = area(20L, tour, 1, "plan");
            var fresh = area(21L, tour, 2, null);
            areasOf(tour, marked, fresh);
            var existing = List.of(point(30L, marked, 1));
            when(points.findByArea_IdOrderBySeqAsc(20L)).thenReturn(existing);
            when(areas.countByTourRequest_Id(10L)).thenReturn(2L);

            assertRefused(locked, () -> service.savePlan(10L, 20L, PNG, as(owner)));
            assertRefused(locked, () -> service.removeArea(10L, 20L, as(owner)));
            assertEquals("plan", marked.getPlanObjectKey());
            verify(areas, never()).delete(marked);

            service.savePlan(10L, 21L, PNG, as(owner));
            assertTrue(fresh.getPlanObjectKey().startsWith("users/1/tours/10/areas/21/floorplan_client/plan-"));
            assertEquals(status.name(), service.removeArea(10L, 21L, as(owner)).status());
            verify(areas).delete(fresh);

            // A sent tour keeps at least one floor.
            when(areas.countByTourRequest_Id(10L)).thenReturn(1L);
            assertStatus(409, () -> service.removeArea(10L, 21L, as(owner)));
            verify(areas).delete(fresh);
        }
        for (var status : List.of(PHOTOS_SUBMITTED, APPROVED, DELIVERED)) {
            var tour = tour(10L, status);
            var fresh = area(21L, tour, 2, null);
            when(areas.countByTourRequest_Id(10L)).thenReturn(2L);
            assertStatus(409, () -> service.savePlan(10L, 21L, PNG, as(owner)));
            assertStatus(409, () -> service.removeArea(10L, 21L, as(owner)));
            assertNull(fresh.getPlanObjectKey());
            verify(areas, never()).delete(fresh);
        }
    }

    @Test void aDraftKeepsItsFreedomToChangeAndEmpty() {
        var tour = tour(10L, DRAFT);
        var only = area(20L, tour, 1, "plan");
        when(areas.countByTourRequest_Id(10L)).thenReturn(1L);
        service.savePlan(10L, 20L, PNG, as(owner));
        service.removeArea(10L, 20L, as(owner));
        verify(areas).delete(only);
    }

    @Test void capturePointsCanBeSavedOnASentPlanOnlyForFloorsWithoutPhotos() {
        var tour = tour(10L, PLAN_READY);
        var done = area(20L, tour, 1, "plan");
        var fresh = area(21L, tour, 2, "plan");
        var unplanned = area(22L, tour, 3, null);
        areasOf(tour, done, fresh, unplanned);
        var photographed = point(30L, done, 1);
        photographed.setPhotoObjectKey("photo");
        when(points.findByArea_IdOrderBySeqAsc(20L)).thenReturn(List.of(photographed));

        assertStatus(409, () -> service.savePoints(10L, 20L, 1, List.of(input(.1, .1, 0)), as(admin)));
        assertStatus(409, () -> service.savePoints(10L, 22L, 3, List.of(input(.1, .1, 0)), as(admin)));
        verify(points, never()).save(any());
        verify(points, never()).deleteAll(any());

        assertEquals("PLAN_READY", service.savePoints(10L, 21L, 2,
                List.of(input(.1, .1, 0), input(.2, .2, 90)), as(admin)).status());
        verify(points, times(2)).save(any());
        assertEquals(PLAN_READY, tour.getStatus());
        assertEquals("photo", photographed.getPhotoObjectKey());

        // Points saved on the new floor may be corrected until its first photo arrives.
        var marked = point(31L, fresh, 1);
        when(points.findByArea_IdOrderBySeqAsc(21L)).thenReturn(List.of(marked));
        service.savePoints(10L, 21L, 2, List.of(input(.3, .3, 0)), as(admin));
        marked.setPhotoObjectKey("first");
        assertStatus(409, () -> service.savePoints(10L, 21L, 2, List.of(input(.3, .3, 0)), as(admin)));
        verifyNoInteractions(r2);
    }

    @Test void capturePointsOnASentPlanRespectTheLimitPerCaptureGroup() {
        var tour = tour(10L, PLAN_READY);
        var done = area(20L, tour, 1, "plan");
        var fresh = area(21L, tour, 2, "plan");
        areasOf(tour, done, fresh);
        manyPoints(done, 60);
        var five = List.of(input(.1, .1, 0), input(.2, .2, 0), input(.3, .3, 0), input(.4, .4, 0), input(.5, .5, 0));

        assertStatus(409, () -> service.savePoints(10L, 21L, 1, five, as(admin)));
        assertEquals(2, fresh.getCaptureGroup());
        verify(points, never()).save(any());

        service.savePoints(10L, 21L, 1, five.subList(0, 4), as(admin)); // exactly 64 in the merged group
        assertEquals(1, fresh.getCaptureGroup());
        service.savePoints(10L, 21L, 2, five, as(admin)); // its own generation
        assertEquals(2, fresh.getCaptureGroup());
    }

    @Test void capturePointsCannotBeSavedOutsidePlanning() {
        for (var status : List.of(DRAFT, PHOTOS_SUBMITTED, APPROVED, DELIVERED)) {
            var tour = tour(10L, status);
            areasOf(tour, area(20L, tour, 1, "plan"));
            assertStatus(409, () -> service.savePoints(10L, 20L, 1, List.of(input(.1, .1, 0)), as(admin)));
        }
        var tour = tour(10L, SUBMITTED);
        areasOf(tour, area(20L, tour, 1, null));
        assertStatus(409, () -> service.savePoints(10L, 20L, 1, List.of(input(.1, .1, 0)), as(admin)));
        verify(points, never()).save(any());
    }

    @Test void sendPlanNeedsAPlanOnEveryArea() {
        var tour = tour(10L, SUBMITTED);
        var first = area(20L, tour, 1, "plan");
        var late = area(21L, tour, 2, null);
        areasOf(tour, first, late);
        manyPoints(first, 3);
        assertStatus(409, () -> service.sendPlan(10L, as(admin)));
        assertEquals(SUBMITTED, tour.getStatus());
    }

    @Test void submitPhotosWaitsForEveryFloorToBePlannedAndMarked() {
        var tour = tour(10L, PLAN_READY);
        var first = area(20L, tour, 1, "plan");
        var late = area(21L, tour, 2, null);
        areasOf(tour, first, late);
        var taken = point(30L, first, 1);
        taken.setPhotoObjectKey("a");
        when(points.findByArea_IdOrderBySeqAsc(20L)).thenReturn(List.of(taken));
        when(points.findByArea_TourRequest_IdOrderBySeqAsc(10L)).thenReturn(List.of(taken));

        assertRefused("Add a plan for Area 21 first.", () -> service.submitPhotos(10L, as(owner)));
        late.setPlanObjectKey("plan-2");
        assertRefused("We're still marking where to stand on Area 21.", () -> service.submitPhotos(10L, as(owner)));
        assertEquals(PLAN_READY, tour.getStatus());

        var added = point(31L, late, 1);
        when(points.findByArea_IdOrderBySeqAsc(21L)).thenReturn(List.of(added));
        when(points.findByArea_TourRequest_IdOrderBySeqAsc(10L)).thenReturn(List.of(taken, added));
        assertStatus(409, () -> service.submitPhotos(10L, as(owner))); // its photo is still missing
        added.setPhotoObjectKey("b");
        assertEquals("PHOTOS_SUBMITTED", service.submitPhotos(10L, as(owner)).status());
    }

    @Test void areasToPlanCountsPlannedFloorsWithoutCapturePoints() {
        var tour = tour(10L, PLAN_READY);
        assertEquals(0, service.get(10L, as(owner)).areasToPlan());
        var marked = area(20L, tour, 1, "plan");
        areasOf(tour, marked, area(21L, tour, 2, "plan-2"), area(22L, tour, 3, null));
        var existing = List.of(point(30L, marked, 1));
        when(points.findByArea_IdOrderBySeqAsc(20L)).thenReturn(existing);
        when(tours.findByUser_IdOrderByIdDesc(1L)).thenReturn(List.of(tour));
        when(tours.findByStatusNotOrderByIdDesc(DRAFT)).thenReturn(List.of(tour));

        assertEquals(1, service.get(10L, as(owner)).areasToPlan());
        assertEquals(1, service.get(10L, as(admin)).areasToPlan());
        assertEquals(1, service.listOwn(as(owner)).getFirst().areasToPlan());
        assertEquals(1, service.listSubmitted(as(admin)).getFirst().areasToPlan());

        // The count does not depend on whether the client may already see the points.
        tour.setStatus(SUBMITTED);
        assertEquals(1, service.get(10L, as(owner)).areasToPlan());
    }

    // ---- Administrator's page per customer ----

    @Test void administratorSeesOneCustomerWithDraftsAndOrganizations() {
        when(users.findById(1L)).thenReturn(Optional.of(owner));
        var draft = tour(11L, DRAFT);
        var sent = tour(10L, SUBMITTED);
        when(tours.findByUser_IdOrderByIdDesc(1L)).thenReturn(List.of(draft, sent));
        assertEquals(List.of(11L, 10L), service.listForUser(1L, as(admin)).stream()
                .map(TourRequestService.Summary::id).toList());

        var organization = mock(Organization.class);
        when(organization.getId()).thenReturn(70L);
        when(organization.getName()).thenReturn("Organization 70");
        when(memberships.findOrganizationsByUserId(1L)).thenReturn(List.of(organization));
        assertEquals(new TourRequestService.Customer(1L, "owner@example.com", "owner@example.com",
                List.of(new TourRequestService.OrganizationRef(70L, "Organization 70"))),
                service.customer(1L, as(admin)));

        when(users.findById(99L)).thenReturn(Optional.empty());
        assertStatus(404, () -> service.listForUser(99L, as(admin)));
        assertStatus(404, () -> service.customer(99L, as(admin)));
    }

    @Test void administratorAddsFloorsAtAnyStepBeforeDelivery() {
        for (var status : List.of(DRAFT, SUBMITTED, PLAN_READY)) {
            tour(10L, status);
            assertEquals(status.name(), service.adminAddArea(10L, "Attic", TourArea.Kind.FLOOR, as(admin)).status());
        }
        for (var status : List.of(PHOTOS_SUBMITTED, APPROVED)) {
            tour(10L, status);
            assertEquals("PLAN_READY", service.adminAddArea(10L, "Attic", TourArea.Kind.FLOOR, as(admin)).status());
        }
        when(areas.countByTourRequest_Id(10L)).thenReturn((long) TourRequestService.MAX_AREAS);
        assertStatus(409, () -> service.adminAddArea(10L, "One more", TourArea.Kind.FLOOR, as(admin)));
        verify(areas, times(5)).save(any());
    }

    @Test void administratorCannotEditADeliveredTour() {
        var tour = tour(10L, DELIVERED);
        tour.setScan(scan(50L, Scan.Status.READY));
        var area = area(20L, tour, 1, "plan");
        when(areas.countByTourRequest_Id(10L)).thenReturn(2L);
        var message = "This tour is already delivered. Start a new space to capture more.";
        assertRefused(message, () -> service.adminAddArea(10L, "Attic", TourArea.Kind.FLOOR, as(admin)));
        assertRefused(message, () -> service.adminSavePlan(10L, 20L, PNG, as(admin)));
        assertRefused(message, () -> service.adminRemoveArea(10L, 20L, as(admin)));
        assertRefused(message, () -> service.adminUpdateArea(10L, 20L, "New", null, as(admin)));
        assertEquals("plan", area.getPlanObjectKey());
        assertEquals("Area 20", area.getName());
        verifyNoInteractions(r2);
    }

    @Test void administratorReplacesAMarkedPlanAndKeepsItsPoints() {
        for (var status : List.of(SUBMITTED, PLAN_READY, PHOTOS_SUBMITTED, APPROVED)) {
            var tour = tour(10L, status);
            var area = area(20L, tour, 1, "old-plan");
            var marked = List.of(point(30L, area, 1));
            when(points.findByArea_IdOrderBySeqAsc(20L)).thenReturn(marked);
            assertEquals(status.name(), service.adminSavePlan(10L, 20L, PNG, as(admin)).status());
            assertTrue(area.getPlanObjectKey().startsWith("users/1/tours/10/areas/20/floorplan_client/plan-"));
        }
        verify(points, never()).deleteAll(any());
        verify(points, never()).delete(any());
        assertStatus(400, () -> service.adminSavePlan(10L, 20L, "nope".getBytes(), as(admin)));
    }

    @SuppressWarnings("unchecked")
    @Test void administratorRemovesAFloorWithItsPointsAndPhotos() {
        var tour = tour(10L, APPROVED);
        var area = area(20L, tour, 1, "plan");
        var first = point(30L, area, 1);
        first.setPhotoObjectKey("photo-1");
        var second = point(31L, area, 2);
        var entries = List.of(first, second);
        when(points.findByArea_IdOrderBySeqAsc(20L)).thenReturn(entries);
        when(areas.countByTourRequest_Id(10L)).thenReturn(1L);
        assertStatus(409, () -> service.adminRemoveArea(10L, 20L, as(admin)));
        verify(areas, never()).delete(any());

        when(areas.countByTourRequest_Id(10L)).thenReturn(2L);
        service.adminRemoveArea(10L, 20L, as(admin));
        verify(points).deleteAll(entries);
        verify(areas).delete(area);
        // The plan and the one photo; the point without a photo has nothing to remove.
        verify(r2, times(2)).deleteObject(any(java.util.function.Consumer.class));

        // A draft may still be emptied.
        tour.setStatus(DRAFT);
        when(areas.countByTourRequest_Id(10L)).thenReturn(1L);
        service.adminRemoveArea(10L, 20L, as(admin));
        verify(areas, times(2)).delete(area);
    }

    @Test void administratorRenamesAndChangesTheKindOfAFloor() {
        var tour = tour(10L, PLAN_READY);
        var area = area(20L, tour, 1, "plan");
        areasOf(tour, area);
        service.adminUpdateArea(10L, 20L, "  Ground floor ", null, as(admin));
        assertEquals("Ground floor", area.getName());
        assertEquals(TourArea.Kind.FLOOR, area.getKind());
        var detail = service.adminUpdateArea(10L, 20L, null, TourArea.Kind.OUTDOOR, as(admin));
        assertEquals("Ground floor", area.getName());
        assertEquals("OUTDOOR", detail.areas().getFirst().kind());
        assertStatus(400, () -> service.adminUpdateArea(10L, 20L, "  ", null, as(admin)));
        assertEquals(PLAN_READY, tour.getStatus());

        tour(11L, PLAN_READY);
        assertStatus(404, () -> service.adminUpdateArea(11L, 20L, "x", null, as(admin)));
    }
}
