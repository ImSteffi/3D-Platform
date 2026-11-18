package com.example.platform.tour;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.UUID;

import com.example.platform.organization.OrganizationMembershipRepository;
import com.example.platform.scan.Scan;
import com.example.platform.scan.ScanRepository;
import com.example.platform.user.User;
import com.example.platform.user.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import static com.example.platform.tour.TourRequest.Status.*;

@Service
public class TourRequestService {
    // One generation accepts at most this many photos.
    static final int MAX_POINTS_PER_GROUP = 64;
    static final int MAX_AREAS = 20;
    static final int MAX_CAPTURE_GROUP = 50;
    public static final int MAX_PLAN_BYTES = 20 * 1024 * 1024;
    public static final int MAX_PHOTO_BYTES = 30 * 1024 * 1024;

    private final TourRequestRepository tours;
    private final TourAreaRepository areas;
    private final CapturePointRepository points;
    private final FloorPhotoRepository floorPhotos;
    private final UserRepository users;
    private final ScanRepository scans;
    private final OrganizationMembershipRepository memberships;
    private final S3Client r2;
    private final S3Presigner signer;
    private final String bucket;

    public TourRequestService(TourRequestRepository tours, TourAreaRepository areas,
            CapturePointRepository points, FloorPhotoRepository floorPhotos, UserRepository users, ScanRepository scans,
            OrganizationMembershipRepository memberships, S3Client r2, S3Presigner signer,
            @Value("${storage.r2.bucket-name}") String bucket) {
        this.tours = tours;
        this.areas = areas;
        this.points = points;
        this.floorPhotos = floorPhotos;
        this.users = users;
        this.scans = scans;
        this.memberships = memberships;
        this.r2 = r2;
        this.signer = signer;
        this.bucket = bucket;
    }

    // Set by Spring; absent in unit tests, where no floor has a spatial context.
    private SpatialContextRunRepository spatialRuns;

    @org.springframework.beans.factory.annotation.Autowired
    void setSpatialRuns(SpatialContextRunRepository spatialRuns) { this.spatialRuns = spatialRuns; }

    private boolean spatialReady(TourArea area) {
        return spatialRuns != null && spatialRuns.existsByArea_IdAndStatus(area.getId(), SpatialContextRun.Status.SUCCEEDED);
    }

    // ---- Client ----

    @Transactional(readOnly = true)
    public List<Summary> listOwn(Authentication authentication) {
        return tours.findByUser_IdOrderByIdDesc(user(authentication).getId()).stream().map(this::summary).toList();
    }

    @Transactional
    public Detail create(String name, String notes, Authentication authentication) {
        var user = user(authentication);
        var tour = tours.save(new TourRequest(user, name.strip(), blankToNull(notes)));
        return detail(tour, user);
    }

    @Transactional(readOnly = true)
    public Detail get(Long id, Authentication authentication) {
        var user = user(authentication);
        return detail(accessible(id, user), user);
    }

    @Transactional
    public void delete(Long id, Authentication authentication) {
        var tour = owned(id, user(authentication), DRAFT);
        var entries = areas.findByTourRequest_IdOrderByIdAsc(id);
        var keys = entries.stream().map(TourArea::getPlanObjectKey).toList();
        // Remove the loaded areas first: Hibernate refuses to flush managed rows that
        // still point at a deleted request, even though the database would cascade.
        areas.deleteAll(entries);
        areas.flush();
        tours.delete(tour);
        tours.flush();
        keys.forEach(this::discard);
    }

    @Transactional
    public Detail addArea(Long id, String name, TourArea.Kind kind, Authentication authentication) {
        var user = user(authentication);
        return addAreaTo(owned(id, user), name, kind, user);
    }

    // Floors can be added until the tour is delivered; each one then goes through
    // plan, capture points and photos on its own.
    private Detail addAreaTo(TourRequest tour, String name, TourArea.Kind kind, User user) {
        var id = tour.getId();
        var status = effectiveStatus(tour);
        requireNotDelivered(tour);
        long count = areas.countByTourRequest_Id(id);
        if (count >= MAX_AREAS) throw error(409, "A tour can have at most " + MAX_AREAS + " areas.");
        // Each area starts as its own generation; an administrator may merge small ones.
        var groups = areas.findByTourRequest_IdOrderByIdAsc(id).stream().map(TourArea::getCaptureGroup).toList();
        int group = groups.stream().mapToInt(Integer::intValue).max().orElse(0) + 1;
        // An administrator may already have used the highest group number.
        if (group > MAX_CAPTURE_GROUP) {
            group = 1;
            while (groups.contains(group)) group++;
        }
        areas.save(new TourArea(tour, name.strip(), kind, group));
        // The photo set is no longer complete. Existing photos and plans stay as they are.
        if (status == PHOTOS_SUBMITTED || status == APPROVED) {
            tour.setScan(null);
            tour.setStatus(PLAN_READY);
        }
        return detail(tour, user);
    }

    @Transactional
    public Detail removeArea(Long id, Long areaId, Authentication authentication) {
        var user = user(authentication);
        var tour = owned(id, user);
        return removeAreaFrom(tour, changeableArea(tour, areaId), user);
    }

    // Also removes the area's capture points and their photos (only an administrator can
    // reach this for an area that has any).
    private Detail removeAreaFrom(TourRequest tour, TourArea area, User user) {
        if (tour.getStatus() != DRAFT && areas.countByTourRequest_Id(tour.getId()) <= 1)
            throw error(409, "A tour that has been sent needs at least one floor.");
        var entries = points.findByArea_IdOrderBySeqAsc(area.getId());
        var keys = new java.util.ArrayList<String>();
        keys.add(area.getPlanObjectKey());
        entries.forEach(point -> keys.add(point.getPhotoObjectKey()));
        var loose = floorPhotos.findByArea_IdOrderByIdAsc(area.getId());
        loose.forEach(photo -> keys.add(photo.getObjectKey()));
        floorPhotos.deleteAll(loose);
        floorPhotos.flush();
        // As in delete(): remove loaded children first so Hibernate can flush.
        points.deleteAll(entries);
        points.flush();
        areas.delete(area);
        areas.flush();
        keys.forEach(this::discard);
        return detail(tour, user);
    }

    @Transactional
    public Detail savePlan(Long id, Long areaId, byte[] image, Authentication authentication) {
        var user = user(authentication);
        var tour = owned(id, user);
        return storePlan(tour, changeableArea(tour, areaId), image, user);
    }

    /** Takes the plan off a floor but keeps the floor and its photos. Spots sat on that plan, so they go too. */
    @Transactional
    public Detail removePlan(Long id, Long areaId, Authentication authentication) {
        var user = user(authentication);
        var tour = owned(id, user);
        return dropPlan(tour, changeableArea(tour, areaId), user);
    }

    @Transactional
    public Detail adminRemovePlan(Long id, Long areaId, Authentication authentication) {
        var user = admin(authentication);
        var tour = editable(id);
        return dropPlan(tour, area(tour, areaId), user);
    }

    private Detail dropPlan(TourRequest tour, TourArea area, User user) {
        var old = area.getPlanObjectKey();
        if (old == null) throw error(404, "This floor has no plan.");
        clearSpots(tour, area);
        area.setPlanObjectKey(null);
        areas.flush();
        discard(old);
        return detail(tour, user);
    }

    // Capture points stay where they are: an administrator replacing a marked plan keeps them.
    private Detail storePlan(TourRequest tour, TourArea area, byte[] image, User user) {
        var old = area.getPlanObjectKey();
        area.setPlanObjectKey(store(folder(area) + "floorplan_client/plan-", image, MAX_PLAN_BYTES));
        discard(old);
        if (!user.isPlatformAdmin()) clearSpots(tour, area);
        if (!user.isPlatformAdmin()) arrived(tour);
        return detail(tour, user);
    }

    @Transactional(readOnly = true)
    public String planUrl(Long id, Long areaId, Authentication authentication) {
        var key = area(accessible(id, user(authentication)), areaId).getPlanObjectKey();
        if (key == null) throw error(404, "This area has no floor plan yet.");
        return signedUrl(key);
    }

    @Transactional
    public Detail submit(Long id, Authentication authentication) {
        var user = user(authentication);
        var tour = owned(id, user, DRAFT);
        var entries = areas.findByTourRequest_IdOrderByIdAsc(id);
        if (entries.isEmpty()) throw error(409, "Add at least one area before sending.");
        // A floor may be sent with a plan, with photos, or both.
        if (entries.stream().anyMatch(area -> area.getPlanObjectKey() == null && floorPhotos.countByArea_Id(area.getId()) == 0))
            throw error(409, "Every floor needs a floor plan or photos before sending.");
        tour.setStatus(SUBMITTED);
        return detail(tour, user);
    }

    // ---- Floor photos: added to a floor straight away, without a plan or capture points ----

    @Transactional
    public Detail addFloorPhoto(Long id, Long areaId, byte[] image, Authentication authentication) {
        var user = user(authentication);
        var tour = user.isPlatformAdmin() ? found(id) : owned(id, user);
        requireNotDelivered(tour);
        var area = area(tour, areaId);
        // The same image again is skipped quietly: the floor already has it.
        var hash = sha256(image);
        fingerprintOlder(areaId);
        if (floorPhotos.existsByArea_IdAndContentHash(areaId, hash)) return detail(tour, user);
        if (floorPhotos.countByArea_Id(areaId) >= MAX_POINTS_PER_GROUP)
            throw error(409, "A floor can have at most " + MAX_POINTS_PER_GROUP + " photos.");
        floorPhotos.save(new FloorPhoto(area, store(folder(area) + "photos/floor-", image, MAX_PHOTO_BYTES), hash, viaLink(authentication)));
        if (!user.isPlatformAdmin()) arrived(tour);
        return detail(tour, user);
    }

    @Transactional(readOnly = true)
    public String floorPhotoUrl(Long id, Long photoId, Authentication authentication) {
        return signedUrl(floorPhoto(accessible(id, user(authentication)), photoId).getObjectKey());
    }

    @Transactional
    public Detail deleteFloorPhoto(Long id, Long photoId, Authentication authentication) {
        var user = user(authentication);
        var tour = accessible(id, user);
        requireNotDelivered(tour);
        var photo = floorPhoto(tour, photoId);
        if (viaLink(authentication) && !photo.isViaLink())
            throw error(403, "Only photos added through this link can be deleted here.");
        var key = photo.getObjectKey();
        floorPhotos.delete(photo);
        floorPhotos.flush();
        discard(key);
        return detail(tour, user);
    }

    // Once at start-up, so copies stored before duplicates were checked disappear without waiting for an upload.
    @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    @Transactional
    public void fingerprintOlderPhotos() {
        floorPhotos.findByContentHashIsNull().stream().map(photo -> photo.getArea().getId()).distinct().forEach(this::fingerprintOlder);
    }

    // Photos stored before duplicates were checked have no fingerprint yet: read them once and give them one,
    // dropping a copy the floor already has.
    private void fingerprintOlder(Long areaId) {
        var all = floorPhotos.findByArea_IdOrderByIdAsc(areaId);
        var seen = new java.util.HashSet<String>();
        all.forEach(photo -> { if (photo.getContentHash() != null) seen.add(photo.getContentHash()); });
        for (var photo : all) {
            var hash = photo.getContentHash();
            if (hash == null) {
                try {
                    hash = sha256(r2.getObjectAsBytes(b -> b.bucket(bucket).key(photo.getObjectKey())).asByteArray());
                } catch (SdkException unreadable) {
                    continue;
                }
                if (seen.contains(hash)) {
                    floorPhotos.delete(photo);
                    floorPhotos.flush();
                    discard(photo.getObjectKey());
                    continue;
                }
                photo.setContentHash(hash);
                floorPhotos.saveAndFlush(photo);
                seen.add(hash);
            }
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private FloorPhoto floorPhoto(TourRequest tour, Long photoId) {
        var photo = floorPhotos.findById(photoId).orElseThrow(() -> error(404, "Photo not found."));
        if (!photo.getArea().getTourRequest().getId().equals(tour.getId())) throw error(404, "Photo not found.");
        return photo;
    }

    @Transactional
    public Detail savePhoto(Long id, Long pointId, byte[] image, Authentication authentication) {
        var user = user(authentication);
        var tour = owned(id, user, PLAN_READY);
        var point = point(tour, pointId);
        var old = point.getPhotoObjectKey();
        // Photos stay with their own floor plan so one area's set can be generated on its own.
        point.setPhotoObjectKey(store(folder(point.getArea()) + "photos/point-"
                + String.format("%02d", point.getSeq()) + "-", image, MAX_PHOTO_BYTES));
        point.setRetakeNote(null);
        point.setPhotoViaLink(viaLink(authentication));
        discard(old);
        // Once every spot has its photo, the set goes to the team on its own: there is no send button.
        if (photosComplete(tour)) tour.setStatus(PHOTOS_SUBMITTED);
        return detail(tour, user);
    }

    @Transactional(readOnly = true)
    public String photoUrl(Long id, Long pointId, Authentication authentication) {
        var key = point(accessible(id, user(authentication)), pointId).getPhotoObjectKey();
        if (key == null) throw error(404, "This point has no photo yet.");
        return signedUrl(key);
    }

    /**
     * Removes one photo. The owner and an administrator may both do so while photos are being
     * collected, during review and after approval; after the photos were sent this hands the request
     * back to the client because the set is no longer complete. Not once the tour is delivered.
     */
    @Transactional
    public Detail deletePhoto(Long id, Long pointId, Authentication authentication) {
        var user = user(authentication);
        var tour = accessible(id, user);
        // A delivered request is finished; one whose scan was deleted counts as approved again.
        var status = effectiveStatus(tour);
        // The customer and the team may both delete a photo after the photos were sent; the set is then
        // incomplete, so the request goes back to taking photos.
        boolean reviewing = status == PHOTOS_SUBMITTED || status == APPROVED;
        if (!reviewing) requireStatus(tour, PLAN_READY);
        var point = point(tour, pointId);
        var key = point.getPhotoObjectKey();
        if (key == null) throw error(404, "This point has no photo.");
        if (viaLink(authentication) && !point.isPhotoViaLink())
            throw error(403, "Only photos added through this link can be deleted here.");
        point.setPhotoObjectKey(null);
        if (reviewing) tour.setStatus(PLAN_READY);
        discard(key);
        return detail(tour, user);
    }

    @Transactional
    // Uploads reach the team as they happen: a draft becomes a request with its first plan or photo.
    private static void arrived(TourRequest tour) {
        if (tour.getStatus() == DRAFT) tour.setStatus(SUBMITTED);
    }

    // Every floor is planned and marked, every spot has a photo and no retake is pending.
    private boolean photosComplete(TourRequest tour) {
        for (var area : areas.findByTourRequest_IdOrderByIdAsc(tour.getId()))
            if (area.getPlanObjectKey() == null || points.findByArea_IdOrderBySeqAsc(area.getId()).isEmpty()) return false;
        var all = points.findByArea_TourRequest_IdOrderBySeqAsc(tour.getId());
        return !all.isEmpty() && all.stream().allMatch(point -> point.getPhotoObjectKey() != null && point.getRetakeNote() == null);
    }

    public Detail submitPhotos(Long id, Authentication authentication) {
        var user = user(authentication);
        var tour = owned(id, user, PLAN_READY);
        // A floor added after the plan was sent must be planned and marked first.
        for (var area : areas.findByTourRequest_IdOrderByIdAsc(id)) {
            if (area.getPlanObjectKey() == null) throw error(409, "Add a plan for " + area.getName() + " first.");
            if (points.findByArea_IdOrderBySeqAsc(area.getId()).isEmpty())
                throw error(409, "We're still marking where to stand on " + area.getName() + ".");
        }
        var all = points.findByArea_TourRequest_IdOrderBySeqAsc(id);
        if (all.stream().anyMatch(point -> point.getPhotoObjectKey() == null))
            throw error(409, "Every capture point needs a photo before submitting.");
        if (all.stream().anyMatch(point -> point.getRetakeNote() != null))
            throw error(409, "Retake the requested photos before submitting.");
        tour.setStatus(PHOTOS_SUBMITTED);
        return detail(tour, user);
    }

    // ---- Administrator ----

    @Transactional(readOnly = true)
    public List<Summary> listSubmitted(Authentication authentication) {
        admin(authentication);
        return tours.findByStatusNotOrderByIdDesc(DRAFT).stream().map(this::summary).toList();
    }

    @Transactional
    public Detail savePoints(Long id, Long areaId, int captureGroup, List<PointInput> inputs,
            Authentication authentication) {
        var user = admin(authentication);
        var tour = tours.findById(id).orElseThrow(() -> error(404, "Tour request not found."));
        // The team may start marking a space the customer is still setting up: nothing is locked.
        if (tour.getStatus() == DRAFT) tour.setStatus(SUBMITTED);
        // A floor added after the plan was sent is marked without reopening the whole plan.
        boolean late = tour.getStatus() == PLAN_READY;
        if (!late) requireStatus(tour, SUBMITTED);
        var area = area(tour, areaId);
        if (captureGroup < 1 || captureGroup > MAX_CAPTURE_GROUP)
            throw error(400, "Capture group must be between 1 and " + MAX_CAPTURE_GROUP + ".");
        if (inputs.size() > MAX_POINTS_PER_GROUP)
            throw error(400, "An area can have at most " + MAX_POINTS_PER_GROUP + " capture points.");
        for (var input : inputs) {
            if (!(input.x() >= 0 && input.x() <= 1 && input.y() >= 0 && input.y() <= 1
                    && input.direction() >= 0 && input.direction() < 360))
                throw error(400, "A capture point is outside the plan or has an invalid direction.");
        }
        if (area.getPlanObjectKey() == null) throw error(409, "This floor has no plan yet.");
        if (late) {
            if (points.findByArea_IdOrderBySeqAsc(areaId).stream().anyMatch(point -> point.getPhotoObjectKey() != null))
                throw error(409, "This floor already has photos. Reopen the plan to change it.");
            // The plan is not sent again, so the limit per generation is checked here.
            int total = inputs.size();
            for (var other : areas.findByTourRequest_IdOrderByIdAsc(id)) {
                if (!other.getId().equals(areaId) && other.getCaptureGroup() == captureGroup)
                    total += points.findByArea_IdOrderBySeqAsc(other.getId()).size();
            }
            if (total > MAX_POINTS_PER_GROUP) throw error(409, "Group " + captureGroup + " would have "
                    + total + " capture points; the limit is " + MAX_POINTS_PER_GROUP + ".");
        }
        area.setCaptureGroup(captureGroup);
        // After a plan is reopened some points already have photos. A point that comes back
        // unchanged keeps its photo; a moved, turned or removed point loses it.
        var previous = new java.util.ArrayList<>(points.findByArea_IdOrderBySeqAsc(areaId));
        // Flush the deletes first so the (area, seq) uniqueness holds for the replacements.
        points.deleteAll(previous);
        points.flush();
        int seq = 1;
        for (var input : inputs) {
            var point = new CapturePoint(area, seq++, input.x(), input.y(), input.direction(), blankToNull(input.note()));
            var same = previous.stream().filter(old -> old.getX() == input.x() && old.getY() == input.y()
                    && old.getDirection() == input.direction()).findFirst().orElse(null);
            if (same != null) {
                previous.remove(same);
                point.setPhotoObjectKey(same.getPhotoObjectKey());
                point.setRetakeNote(same.getRetakeNote());
                point.setPhotoViaLink(same.isPhotoViaLink());
            }
            points.save(point);
        }
        points.flush();
        previous.forEach(old -> discard(old.getPhotoObjectKey()));
        sendWhenMarked(tour);
        return detail(tour, user);
    }

    // ---- Single capture points ----
    // The administrator edits the plan point by point in every status, so the customer always sees
    // the current plan and can keep uploading photos meanwhile. A moved or turned point keeps its photo.

    @Transactional
    public Detail createPoint(Long id, Long areaId, PointInput input, Authentication authentication) {
        var user = admin(authentication);
        var tour = tours.findById(id).orElseThrow(() -> error(404, "Tour request not found."));
        var area = area(tour, areaId);
        if (area.getPlanObjectKey() == null) throw error(409, "This floor has no plan yet.");
        validatePoint(input);
        var existing = points.findByArea_IdOrderBySeqAsc(areaId);
        int total = existing.size() + 1;
        for (var other : areas.findByTourRequest_IdOrderByIdAsc(id)) {
            if (!other.getId().equals(areaId) && other.getCaptureGroup() == area.getCaptureGroup())
                total += points.findByArea_IdOrderBySeqAsc(other.getId()).size();
        }
        if (total > MAX_POINTS_PER_GROUP) throw error(409, "Group " + area.getCaptureGroup()
                + " would have " + total + " capture points; the limit is " + MAX_POINTS_PER_GROUP + ".");
        int seq = existing.stream().mapToInt(CapturePoint::getSeq).max().orElse(0) + 1;
        points.save(new CapturePoint(area, seq, input.x(), input.y(), input.direction(), blankToNull(input.note())));
        points.flush();
        if (tour.getStatus() == DRAFT) tour.setStatus(SUBMITTED);
        sendWhenMarked(tour);
        // The new point needs a photo, so a finished photo set is incomplete again.
        var status = effectiveStatus(tour);
        if (status == PHOTOS_SUBMITTED || status == APPROVED) {
            tour.setScan(null);
            tour.setStatus(PLAN_READY);
        }
        return detail(tour, user);
    }

    @Transactional
    public Detail updatePoint(Long id, Long pointId, PointPatch patch, Authentication authentication) {
        var user = admin(authentication);
        var tour = tours.findById(id).orElseThrow(() -> error(404, "Tour request not found."));
        var point = point(tour, pointId);
        double x = patch.x() == null ? point.getX() : patch.x();
        double y = patch.y() == null ? point.getY() : patch.y();
        double direction = patch.direction() == null ? point.getDirection() : patch.direction();
        validatePoint(new PointInput(x, y, direction, null));
        point.setPosition(x, y);
        point.setDirection(direction);
        if (patch.note() != null) point.setNote(blankToNull(patch.note()));
        return detail(tour, user);
    }

    @Transactional
    public Detail deletePoint(Long id, Long pointId, Authentication authentication) {
        var user = admin(authentication);
        var tour = tours.findById(id).orElseThrow(() -> error(404, "Tour request not found."));
        var point = point(tour, pointId);
        var areaId = point.getArea().getId();
        var key = point.getPhotoObjectKey();
        points.delete(point);
        points.flush();
        // Keep the numbers the customer sees contiguous. Ascending order means each target seq is free.
        int seq = 1;
        for (var rest : points.findByArea_IdOrderBySeqAsc(areaId)) {
            if (rest.getSeq() != seq) {
                rest.setSeq(seq);
                points.flush();
            }
            seq++;
        }
        discard(key);
        return detail(tour, user);
    }

    private static void validatePoint(PointInput input) {
        if (!(input.x() >= 0 && input.x() <= 1 && input.y() >= 0 && input.y() <= 1
                && input.direction() >= 0 && input.direction() < 360))
            throw error(400, "A capture point is outside the plan or has an invalid direction.");
    }

    /** One customer's requests, drafts included, for the administrator's page per customer. */
    @Transactional(readOnly = true)
    public List<Summary> listForUser(Long userId, Authentication authentication) {
        admin(authentication);
        var customer = users.findById(userId).orElseThrow(() -> error(404, "User not found."));
        return tours.findByUser_IdOrderByIdDesc(customer.getId()).stream().map(this::summary).toList();
    }

    /** The team starts a space for a customer, named after the property's address. */
    @Transactional
    public Detail adminCreateForUser(Long userId, String name, Authentication authentication) {
        var admin = admin(authentication);
        var customer = users.findById(userId).orElseThrow(() -> error(404, "User not found."));
        if (customer.isPlatformAdmin()) throw error(409, "Spaces belong to customers, not administrators.");
        var tour = tours.save(new TourRequest(customer, name.strip(), null));
        return detail(tour, admin);
    }

    @Transactional(readOnly = true)
    public Customer customer(Long userId, Authentication authentication) {
        admin(authentication);
        var customer = users.findById(userId).orElseThrow(() -> error(404, "User not found."));
        return new Customer(customer.getId(), customer.getDisplayName(), customer.getEmail(),
                memberships.findOrganizationsByUserId(customer.getId()).stream()
                        .map(organization -> new OrganizationRef(organization.getId(), organization.getName()))
                        .toList());
    }

    // The administrator edits floors at any step before delivery, including marked ones.

    @Transactional
    public Detail adminAddArea(Long id, String name, TourArea.Kind kind, Authentication authentication) {
        var user = admin(authentication);
        return addAreaTo(found(id), name, kind, user);
    }

    @Transactional
    public Detail adminSavePlan(Long id, Long areaId, byte[] image, Authentication authentication) {
        var user = admin(authentication);
        var tour = editable(id);
        return storePlan(tour, area(tour, areaId), image, user);
    }

    @Transactional
    public Detail adminRemoveArea(Long id, Long areaId, Authentication authentication) {
        var user = admin(authentication);
        var tour = editable(id);
        return removeAreaFrom(tour, area(tour, areaId), user);
    }

    @Transactional
    public Detail adminUpdateArea(Long id, Long areaId, String name, TourArea.Kind kind,
            Authentication authentication) {
        var user = admin(authentication);
        var tour = editable(id);
        var area = area(tour, areaId);
        if (name != null) {
            if (name.isBlank()) throw error(400, "A floor needs a name.");
            area.setName(name.strip());
        }
        if (kind != null) area.setKind(kind);
        return detail(tour, user);
    }

    /** Marker sizes only change how the plan is drawn, so they can be adjusted at any step. */
    @Transactional
    public Detail saveMarkerSizes(Long id, Long areaId, int dotSize, int lineLength, Authentication authentication) {
        var user = admin(authentication);
        var tour = tours.findById(id).orElseThrow(() -> error(404, "Tour request not found."));
        if (dotSize < 8 || dotSize > 40 || lineLength < 10 || lineLength > 80)
            throw error(400, "Marker sizes are out of range.");
        area(tour, areaId).setMarkerSizes(dotSize, lineLength);
        return detail(tour, user);
    }

    /** Takes a sent plan back for editing; the client cannot upload photos until it is sent again. */
    @Transactional
    public Detail reopenPlan(Long id, Authentication authentication) {
        var user = admin(authentication);
        var tour = inStatus(id, PLAN_READY);
        tour.setStatus(SUBMITTED);
        return detail(tour, user);
    }

    @Transactional
    public Detail sendPlan(Long id, Authentication authentication) {
        var user = admin(authentication);
        var tour = inStatus(id, SUBMITTED);
        var perGroup = new HashMap<Integer, Integer>();
        for (var area : areas.findByTourRequest_IdOrderByIdAsc(id)) {
            if (area.getPlanObjectKey() == null)
                throw error(409, "\"" + area.getName() + "\" has no floor plan yet.");
            int count = points.findByArea_IdOrderBySeqAsc(area.getId()).size();
            if (count == 0) throw error(409, "\"" + area.getName() + "\" has no capture points yet.");
            perGroup.merge(area.getCaptureGroup(), count, Integer::sum);
        }
        for (var entry : perGroup.entrySet()) {
            if (entry.getValue() > MAX_POINTS_PER_GROUP) throw error(409, "Group " + entry.getKey() + " has "
                    + entry.getValue() + " capture points; the limit is " + MAX_POINTS_PER_GROUP + ".");
        }
        tour.setStatus(PLAN_READY);
        return detail(tour, user);
    }

    /**
     * There is no "send plan" step: once every floor that has a plan also has its spots, the customer
     * sees them and can take the photos. Floors without a plan use their own photo gallery instead.
     */
    private void sendWhenMarked(TourRequest tour) {
        if (tour.getStatus() != SUBMITTED) return;
        var perGroup = new HashMap<Integer, Integer>();
        boolean any = false;
        for (var area : areas.findByTourRequest_IdOrderByIdAsc(tour.getId())) {
            if (area.getPlanObjectKey() == null) continue;
            int count = points.findByArea_IdOrderBySeqAsc(area.getId()).size();
            if (count == 0) return;
            any = true;
            perGroup.merge(area.getCaptureGroup(), count, Integer::sum);
        }
        if (!any || perGroup.values().stream().anyMatch(count -> count > MAX_POINTS_PER_GROUP)) return;
        tour.setStatus(PLAN_READY);
    }

    @Transactional
    public Detail review(Long id, boolean approve, List<Retake> retakes, Authentication authentication) {
        var user = admin(authentication);
        var tour = inStatus(id, PHOTOS_SUBMITTED);
        if (approve) {
            tour.setStatus(APPROVED);
            return detail(tour, user);
        }
        if (retakes == null || retakes.isEmpty()) throw error(400, "Choose at least one photo to retake.");
        for (var retake : retakes) {
            var note = blankToNull(retake.note());
            if (note == null) throw error(400, "Every retake needs a note for the client.");
            point(tour, retake.pointId()).setRetakeNote(note);
        }
        tour.setStatus(PLAN_READY);
        return detail(tour, user);
    }

    /** Finished scans the client can already open: those of the organizations they belong to. */
    @Transactional(readOnly = true)
    public List<DeliverableScan> deliverableScans(Long id, Authentication authentication) {
        admin(authentication);
        var tour = tours.findById(id).orElseThrow(() -> error(404, "Tour request not found."));
        return scans.findForMember(tour.getUser().getId(), Scan.Status.READY).stream()
                .map(scan -> new DeliverableScan(scan.getId(), scan.getName(), scan.getProject().getId(),
                        scan.getProject().getName(), scan.getProject().getOrganization().getName()))
                .toList();
    }

    /**
     * Hands a finished scan to the client as the result of an approved request. Delivering
     * again replaces the scan. Access to the scan itself still comes from organization
     * membership, so the client must already belong to the organization that owns it.
     */
    @Transactional
    public Detail deliver(Long id, Long scanId, Authentication authentication) {
        var user = admin(authentication);
        var tour = tours.findById(id).orElseThrow(() -> error(404, "Tour request not found."));
        if (tour.getStatus() != APPROVED && tour.getStatus() != DELIVERED)
            throw error(409, "Approve the photos before delivering the tour.");
        var scan = scanId == null ? null : scans.findById(scanId).orElse(null);
        if (scan == null) throw error(404, "Tour not found.");
        if (scan.getStatus() != Scan.Status.READY) throw error(409, "This tour is not ready to be viewed yet.");
        if (!memberships.existsByOrganization_IdAndUser_Id(
                scan.getProject().getOrganization().getId(), tour.getUser().getId()))
            throw error(409, "The customer is not a member of the organization that owns this tour.");
        tour.setScan(scan);
        tour.setStatus(DELIVERED);
        return detail(tour, user);
    }

    // ---- Shared ----

    private User user(Authentication authentication) {
        return users.findByEmailIgnoreCase(authentication.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    private User admin(Authentication authentication) {
        var user = user(authentication);
        if (!user.isPlatformAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return user;
    }

    // Another user's request is reported as missing rather than forbidden.
    private TourRequest accessible(Long id, User user) {
        var tour = tours.findById(id).orElseThrow(() -> error(404, "Tour request not found."));
        if (!user.isPlatformAdmin() && !tour.getUser().getId().equals(user.getId()))
            throw error(404, "Tour request not found.");
        return tour;
    }

    private TourRequest found(Long id) {
        return tours.findById(id).orElseThrow(() -> error(404, "Tour request not found."));
    }

    private TourRequest editable(Long id) {
        var tour = found(id);
        requireNotDelivered(tour);
        return tour;
    }

    private static void requireNotDelivered(TourRequest tour) {
        if (effectiveStatus(tour) == DELIVERED)
            throw error(409, "This tour is already delivered. Start a new space to capture more.");
    }

    private TourRequest owned(Long id, User user) {
        var tour = tours.findById(id).orElseThrow(() -> error(404, "Tour request not found."));
        if (!tour.getUser().getId().equals(user.getId())) throw error(404, "Tour request not found.");
        return tour;
    }

    private TourRequest owned(Long id, User user, TourRequest.Status required) {
        var tour = owned(id, user);
        requireStatus(tour, required);
        return tour;
    }

    // The client may replace or remove a floor freely in a draft, and after sending only
    // until the administrator has marked capture points on it.
    // The client may replace, redraw or remove a floor's plan at any time before delivery.
    private TourArea changeableArea(TourRequest tour, Long areaId) {
        requireNotDelivered(tour);
        return area(tour, areaId);
    }

    // A new plan makes the team's spots on that floor meaningless: drop them (and their photos)
    // and, if the plan had already been sent back, return the request to the team for marking.
    private void clearSpots(TourRequest tour, TourArea area) {
        var entries = points.findByArea_IdOrderBySeqAsc(area.getId());
        if (entries.isEmpty()) return;
        var keys = entries.stream().map(CapturePoint::getPhotoObjectKey).toList();
        points.deleteAll(entries);
        points.flush();
        keys.forEach(this::discard);
        var status = tour.getStatus();
        if (status == PLAN_READY || status == PHOTOS_SUBMITTED || status == APPROVED) tour.setStatus(SUBMITTED);
    }

    private TourRequest inStatus(Long id, TourRequest.Status required) {
        var tour = tours.findById(id).orElseThrow(() -> error(404, "Tour request not found."));
        requireStatus(tour, required);
        return tour;
    }

    private static void requireStatus(TourRequest tour, TourRequest.Status required) {
        if (tour.getStatus() != required)
            throw error(409, "This tour request can no longer be changed at this step.");
    }

    private TourArea area(TourRequest tour, Long areaId) {
        var area = areas.findById(areaId).orElseThrow(() -> error(404, "Area not found."));
        if (!area.getTourRequest().getId().equals(tour.getId())) throw error(404, "Area not found.");
        return area;
    }

    private CapturePoint point(TourRequest tour, Long pointId) {
        var point = pointId == null ? null : points.findById(pointId).orElse(null);
        if (point == null || !point.getArea().getTourRequest().getId().equals(tour.getId()))
            throw error(404, "Capture point not found.");
        return point;
    }

    /** Returns the media type of a JPEG, PNG or WebP image, judged by its content. */
    static String imageType(byte[] b) {
        if (b.length > 3 && (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8 && (b[2] & 0xff) == 0xff) return "image/jpeg";
        if (b.length > 8 && (b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') return "image/png";
        if (b.length > 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "image/webp";
        return null;
    }

    // Identifiers rather than names, so renaming a tour or area never moves its files.
    private static String folder(TourArea area) {
        var tour = area.getTourRequest();
        return "users/" + tour.getUser().getId() + "/tours/" + tour.getId() + "/areas/" + area.getId() + "/";
    }

    private String store(String prefix, byte[] image, int maxBytes) {
        if (image.length > maxBytes)
            throw error(413, "The image is too large. The limit is " + maxBytes / 1024 / 1024 + " MB.");
        var type = imageType(image);
        if (type == null) throw error(400, "Upload a JPG, PNG or WebP image.");
        var key = prefix + UUID.randomUUID();
        r2.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType(type).build(),
                RequestBody.fromBytes(image));
        return key;
    }

    // A leftover object only costs storage, so a failed cleanup must not fail the request.
    private void discard(String key) {
        if (key == null) return;
        try {
            r2.deleteObject(b -> b.bucket(bucket).key(key));
        } catch (SdkException ignored) {
        }
    }

    private String signedUrl(String key) {
        return signer.presignGetObject(GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofHours(1))
                .getObjectRequest(GetObjectRequest.builder().bucket(bucket).key(key)
                        .responseCacheControl("private, no-store").build())
                .build()).url().toString();
    }

    // The scan a delivered request points at, or null once it is gone or no longer viewable.
    private static Scan deliveredScan(TourRequest tour) {
        var scan = tour.getStatus() == DELIVERED ? tour.getScan() : null;
        return scan != null && scan.getStatus() == Scan.Status.READY ? scan : null;
    }

    // Deleting the delivered scan clears the link but not the status, so such a request
    // is reported as approved and can be delivered again.
    private static TourRequest.Status effectiveStatus(TourRequest tour) {
        return tour.getStatus() == DELIVERED && deliveredScan(tour) == null ? APPROVED : tour.getStatus();
    }

    // Floors that have a plan but are still waiting for the administrator's capture points.
    private int areasToPlan(List<TourArea> entries) {
        return (int) entries.stream().filter(area -> area.getPlanObjectKey() != null
                && points.findByArea_IdOrderBySeqAsc(area.getId()).isEmpty()).count();
    }

    private Summary summary(TourRequest tour) {
        var scan = deliveredScan(tour);
        return new Summary(tour.getId(), tour.getName(), effectiveStatus(tour).name(), tour.getCreatedAt(),
                areas.countByTourRequest_Id(tour.getId()), tour.getUser().getDisplayName(),
                scan == null ? null : scan.getId(), scan == null ? null : scan.getName(),
                scan == null ? null : scan.getProject().getId(),
                areasToPlan(areas.findByTourRequest_IdOrderByIdAsc(tour.getId())));
    }

    private Detail detail(TourRequest tour, User viewer) {
        // The plan stays hidden from the client while the administrator is still drafting it.
        boolean showPoints = viewer.isPlatformAdmin()
                || (tour.getStatus() != DRAFT && tour.getStatus() != SUBMITTED);
        var all = areas.findByTourRequest_IdOrderByIdAsc(tour.getId());
        var entries = all.stream().map(area ->
                new AreaResponse(area.getId(), area.getName(), area.getKind().name(), area.getCaptureGroup(),
                        area.getPlanObjectKey() != null, area.getMarkerDotSize(), area.getMarkerLineLength(),
                        !showPoints ? List.of() : points.findByArea_IdOrderBySeqAsc(area.getId()).stream()
                                .map(point -> new PointResponse(point.getId(), point.getSeq(), point.getX(),
                                        point.getY(), point.getDirection(), point.getNote(),
                                        point.getPhotoObjectKey() != null, point.getRetakeNote(), point.isPhotoViaLink()))
                                .toList(),
                        tour.getStatus() != DRAFT && !points.findByArea_IdOrderBySeqAsc(area.getId()).isEmpty(),
                        floorPhotos.findByArea_IdOrderByIdAsc(area.getId()).stream().map(FloorPhoto::getId).toList(),
                        floorPhotos.findByArea_IdOrderByIdAsc(area.getId()).stream().filter(FloorPhoto::isViaLink).map(FloorPhoto::getId).toList(),
                        spatialReady(area)))
                .toList();
        var scan = deliveredScan(tour);
        return new Detail(tour.getId(), tour.getName(), tour.getNotes(), effectiveStatus(tour).name(),
                tour.getCreatedAt(), tour.getUser().getDisplayName(), tour.getUser().getEmail(), entries,
                scan == null ? null : scan.getId(), scan == null ? null : scan.getName(),
                scan == null ? null : scan.getProject().getId(), areasToPlan(all));
    }

    /** Marks the requests a gallery link makes (GalleryLinkController), as opposed to a signed-in account. */
    public static final String GALLERY_LINK = "gallery-link";

    private static boolean viaLink(Authentication authentication) {
        return GALLERY_LINK.equals(authentication.getDetails());
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static ResponseStatusException error(int status, String message) {
        return new ResponseStatusException(HttpStatus.valueOf(status), message);
    }

    public record Customer(Long id, String displayName, String email, List<OrganizationRef> organizations) {}
    public record OrganizationRef(Long id, String name) {}
    public record PointInput(double x, double y, double direction, String note) {}
    public record PointPatch(Double x, Double y, Double direction, String note) {}
    public record Retake(Long pointId, String note) {}
    public record Summary(Long id, String name, String status, Instant createdAt, long areaCount, String ownerName,
            Long scanId, String scanName, Long projectId, int areasToPlan) {}
    public record DeliverableScan(Long scanId, String scanName, Long projectId, String projectName,
            String organizationName) {}
    public record PointResponse(Long id, int seq, double x, double y, double direction, String note,
            boolean hasPhoto, String retakeNote,
            // Came in through a gallery link: the link may delete it.
            boolean photoViaLink) {}
    public record AreaResponse(Long id, String name, String kind, int captureGroup, boolean hasPlan,
            int dotSize, int lineLength,
            List<PointResponse> points,
            // True once the team has placed spots on this floor, even while the client cannot see them yet.
            boolean locked,
            // Photos added to the floor directly (ids, oldest first).
            List<Long> photos,
            // The ones that came in through a gallery link: the link may delete only these.
            List<Long> linkPhotos,
            // The team has the floor's spatial context: the customer sees that the tour is being made.
            boolean spatialReady) {}
    public record Detail(Long id, String name, String notes, String status, Instant createdAt,
            String ownerName, String ownerEmail, List<AreaResponse> areas,
            Long scanId, String scanName, Long projectId, int areasToPlan) {}
}
