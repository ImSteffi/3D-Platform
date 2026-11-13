package com.example.platform.tour;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.UUID;

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
    public static final int MAX_PLAN_BYTES = 20 * 1024 * 1024;
    public static final int MAX_PHOTO_BYTES = 30 * 1024 * 1024;

    private final TourRequestRepository tours;
    private final TourAreaRepository areas;
    private final CapturePointRepository points;
    private final UserRepository users;
    private final S3Client r2;
    private final S3Presigner signer;
    private final String bucket;

    public TourRequestService(TourRequestRepository tours, TourAreaRepository areas,
            CapturePointRepository points, UserRepository users, S3Client r2, S3Presigner signer,
            @Value("${storage.r2.bucket-name}") String bucket) {
        this.tours = tours;
        this.areas = areas;
        this.points = points;
        this.users = users;
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
        var tour = owned(id, user, DRAFT);
        long count = areas.countByTourRequest_Id(id);
        if (count >= MAX_AREAS) throw error(409, "A tour can have at most " + MAX_AREAS + " areas.");
        // Each area starts as its own generation; an administrator may merge small ones.
        int group = areas.findByTourRequest_IdOrderByIdAsc(id).stream()
                .mapToInt(TourArea::getCaptureGroup).max().orElse(0) + 1;
        areas.save(new TourArea(tour, name.strip(), kind, group));
        return detail(tour, user);
    }

    @Transactional
    public Detail removeArea(Long id, Long areaId, Authentication authentication) {
        var user = user(authentication);
        var tour = owned(id, user, DRAFT);
        var area = area(tour, areaId);
        var key = area.getPlanObjectKey();
        areas.delete(area);
        areas.flush();
        discard(key);
        return detail(tour, user);
    }

    @Transactional
    public Detail savePlan(Long id, Long areaId, byte[] image, Authentication authentication) {
        var user = user(authentication);
        var tour = owned(id, user, DRAFT);
        var area = area(tour, areaId);
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
     * Removes one photo. The owner may do so while photos are being collected; an
     * administrator also during review, which hands the request back to the client
     * because the set is no longer complete.
     */
    @Transactional
    public Detail deletePhoto(Long id, Long pointId, Authentication authentication) {
        var user = user(authentication);
        var tour = accessible(id, user);
        boolean reviewing = user.isPlatformAdmin() && tour.getStatus() == PHOTOS_SUBMITTED;
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
        var tour = inStatus(id, SUBMITTED);
        var area = area(tour, areaId);
        if (captureGroup < 1 || captureGroup > 50) throw error(400, "Capture group must be between 1 and 50.");
        if (inputs.size() > MAX_POINTS_PER_GROUP)
            throw error(400, "An area can have at most " + MAX_POINTS_PER_GROUP + " capture points.");
        for (var input : inputs) {
            if (!(input.x() >= 0 && input.x() <= 1 && input.y() >= 0 && input.y() <= 1
                    && input.direction() >= 0 && input.direction() < 360))
                throw error(400, "A capture point is outside the plan or has an invalid direction.");
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

    private TourRequest owned(Long id, User user, TourRequest.Status required) {
        var tour = tours.findById(id).orElseThrow(() -> error(404, "Tour request not found."));
        if (!tour.getUser().getId().equals(user.getId())) throw error(404, "Tour request not found.");
        requireStatus(tour, required);
        return tour;
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

    private Summary summary(TourRequest tour) {
        return new Summary(tour.getId(), tour.getName(), tour.getStatus().name(), tour.getCreatedAt(),
                areas.countByTourRequest_Id(tour.getId()), tour.getUser().getDisplayName());
    }

    private Detail detail(TourRequest tour, User viewer) {
        // The plan stays hidden from the client while the administrator is still drafting it.
        boolean showPoints = viewer.isPlatformAdmin()
                || (tour.getStatus() != DRAFT && tour.getStatus() != SUBMITTED);
        var entries = areas.findByTourRequest_IdOrderByIdAsc(tour.getId()).stream().map(area ->
                new AreaResponse(area.getId(), area.getName(), area.getKind().name(), area.getCaptureGroup(),
                        area.getPlanObjectKey() != null, area.getMarkerDotSize(), area.getMarkerLineLength(),
                        !showPoints ? List.of() : points.findByArea_IdOrderBySeqAsc(area.getId()).stream()
                                .map(point -> new PointResponse(point.getId(), point.getSeq(), point.getX(),
                                        point.getY(), point.getDirection(), point.getNote(),
                                        point.getPhotoObjectKey() != null, point.getRetakeNote()))
                                .toList()))
                .toList();
        return new Detail(tour.getId(), tour.getName(), tour.getNotes(), tour.getStatus().name(),
                tour.getCreatedAt(), tour.getUser().getDisplayName(), tour.getUser().getEmail(), entries);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static ResponseStatusException error(int status, String message) {
        return new ResponseStatusException(HttpStatus.valueOf(status), message);
    }

    public record PointInput(double x, double y, double direction, String note) {}
    public record Retake(Long pointId, String note) {}
    public record Summary(Long id, String name, String status, Instant createdAt, long areaCount, String ownerName) {}
    public record PointResponse(Long id, int seq, double x, double y, double direction, String note,
            boolean hasPhoto, String retakeNote) {}
    public record AreaResponse(Long id, String name, String kind, int captureGroup, boolean hasPlan,
            int dotSize, int lineLength,
            List<PointResponse> points) {}
    public record Detail(Long id, String name, String notes, String status, Instant createdAt,
            String ownerName, String ownerEmail, List<AreaResponse> areas) {}
}
