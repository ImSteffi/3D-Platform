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
    private final UserRepository users;
    private final ScanRepository scans;
    private final OrganizationMembershipRepository memberships;
    private final S3Client r2;
    private final S3Presigner signer;
    private final String bucket;

    public TourRequestService(TourRequestRepository tours, TourAreaRepository areas,
            CapturePointRepository points, UserRepository users, ScanRepository scans,
            OrganizationMembershipRepository memberships, S3Client r2, S3Presigner signer,
            @Value("${storage.r2.bucket-name}") String bucket) {
        this.tours = tours;
        this.areas = areas;
        this.points = points;
        this.users = users;
        this.scans = scans;
        this.memberships = memberships;
        this.r2 = r2;
        this.signer = signer;
        this.bucket = bucket;
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

    // Capture points stay where they are: an administrator replacing a marked plan keeps them.
    private Detail storePlan(TourRequest tour, TourArea area, byte[] image, User user) {
        var old = area.getPlanObjectKey();
        area.setPlanObjectKey(store(folder(area) + "floorplan_client/plan-", image, MAX_PLAN_BYTES));
        discard(old);
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
        if (entries.stream().anyMatch(area -> area.getPlanObjectKey() == null))
            throw error(409, "Every area needs a floor plan before sending.");
        tour.setStatus(SUBMITTED);
        return detail(tour, user);
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
        discard(old);
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
        point.setPhotoObjectKey(null);
        if (reviewing) tour.setStatus(PLAN_READY);
        discard(key);
        return detail(tour, user);
    }

    @Transactional
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
            }
            points.save(point);
        }
        points.flush();
        previous.forEach(old -> discard(old.getPhotoObjectKey()));
        return detail(tour, user);
    }

    /** One customer's requests, drafts included, for the administrator's page per customer. */
    @Transactional(readOnly = true)
    public List<Summary> listForUser(Long userId, Authentication authentication) {
        admin(authentication);
        var customer = users.findById(userId).orElseThrow(() -> error(404, "User not found."));
        return tours.findByUser_IdOrderByIdDesc(customer.getId()).stream().map(this::summary).toList();
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
    private TourArea changeableArea(TourRequest tour, Long areaId) {
        var status = tour.getStatus();
        if (status != SUBMITTED && status != PLAN_READY) requireStatus(tour, DRAFT);
        var area = area(tour, areaId);
        if (status != DRAFT && !points.findByArea_IdOrderBySeqAsc(areaId).isEmpty())
            throw error(409, "This floor already has capture points. Ask us if it needs to change.");
        return area;
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
                                        point.getPhotoObjectKey() != null, point.getRetakeNote()))
                                .toList()))
                .toList();
        var scan = deliveredScan(tour);
        return new Detail(tour.getId(), tour.getName(), tour.getNotes(), effectiveStatus(tour).name(),
                tour.getCreatedAt(), tour.getUser().getDisplayName(), tour.getUser().getEmail(), entries,
                scan == null ? null : scan.getId(), scan == null ? null : scan.getName(),
                scan == null ? null : scan.getProject().getId(), areasToPlan(all));
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
    public record Retake(Long pointId, String note) {}
    public record Summary(Long id, String name, String status, Instant createdAt, long areaCount, String ownerName,
            Long scanId, String scanName, Long projectId, int areasToPlan) {}
    public record DeliverableScan(Long scanId, String scanName, Long projectId, String projectName,
            String organizationName) {}
    public record PointResponse(Long id, int seq, double x, double y, double direction, String note,
            boolean hasPhoto, String retakeNote) {}
    public record AreaResponse(Long id, String name, String kind, int captureGroup, boolean hasPlan,
            int dotSize, int lineLength,
            List<PointResponse> points) {}
    public record Detail(Long id, String name, String notes, String status, Instant createdAt,
            String ownerName, String ownerEmail, List<AreaResponse> areas,
            Long scanId, String scanName, Long projectId, int areasToPlan) {}
}
