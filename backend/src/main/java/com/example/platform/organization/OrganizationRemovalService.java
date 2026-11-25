package com.example.platform.organization;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.Delete;
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ObjectIdentifier;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Deletes an organization for good: its people (unless they also belong to another organization), their spaces
 * with every floor, plan, photo, spatial context and 3D tour, and all of those files in storage.
 * Platform admins who are members only lose the membership. Nothing can be restored afterwards.
 */
@Service
public class OrganizationRemovalService {

    private static final Logger log = LoggerFactory.getLogger(OrganizationRemovalService.class);
    /** A space's storage folder: users/{owner}/tours/{space}/. A space handed to a colleague keeps files in the first owner's folder. */
    private static final Pattern SPACE_FOLDER = Pattern.compile("^(users/\\d+/tours/\\d+/)");

    private final JdbcTemplate db;
    private final S3Client r2;
    private final String bucket;
    private final TransactionTemplate transaction;

    public OrganizationRemovalService(JdbcTemplate db, S3Client r2, @Value("${storage.r2.bucket-name}") String bucket,
            PlatformTransactionManager transactions) {
        this.db = db;
        this.r2 = r2;
        this.bucket = bucket;
        this.transaction = new TransactionTemplate(transactions);
    }

    /** What deleting would remove: shown before the team confirms. */
    public record Removal(String name, int people, int spaces, int floors, int photos, int tours) {}

    public Removal preview(long organizationId) {
        var name = name(organizationId);
        var people = leaving(organizationId);
        var spaces = spaces(people);
        return new Removal(name, people.size(), spaces.size(),
                count("SELECT count(*) FROM tour_areas WHERE tour_request_id = ANY(?)", spaces),
                count("""
                        SELECT (SELECT count(*) FROM floor_photos p JOIN tour_areas a ON a.id = p.area_id WHERE a.tour_request_id = ANY(?))
                             + (SELECT count(*) FROM capture_points c JOIN tour_areas a ON a.id = c.area_id
                                WHERE a.tour_request_id = ANY(?) AND c.photo_object_key IS NOT NULL)""", spaces, spaces),
                count("""
                        SELECT count(*) FROM splat_runs s JOIN tour_areas a ON a.id = s.area_id
                        WHERE a.tour_request_id = ANY(?) AND s.status = 'SUCCEEDED'""", spaces));
    }

    public void delete(long organizationId) {
        name(organizationId);
        var people = leaving(organizationId);
        var spaces = spaces(people);

        // Files first: if storage fails, everything is still on record and deleting again finishes the job.
        var folders = new LinkedHashSet<String>();
        var loose = new LinkedHashSet<String>();
        for (var key : keys(spaces)) {
            var folder = SPACE_FOLDER.matcher(key);
            if (folder.find()) folders.add(folder.group(1));
            else loose.add(key);
        }
        db.query("SELECT user_id, id FROM tour_requests WHERE id = ANY(?)",
                row -> { folders.add("users/" + row.getLong(1) + "/tours/" + row.getLong(2) + "/"); }, array(spaces));
        for (var folder : folders) loose.addAll(list(folder));
        loose.addAll(keysOfScans(legacyScans(organizationId)));
        remove(new ArrayList<>(loose));

        transaction.executeWithoutResult(status -> {
            // Floors, photos, runs, links, views and 3D tours go with their space (ON DELETE CASCADE).
            db.update("DELETE FROM tour_requests WHERE id = ANY(?)", array(spaces));
            var scans = legacyScans(organizationId);
            db.update("DELETE FROM scan_files WHERE scan_id = ANY(?)", array(scans));
            db.update("UPDATE tour_requests SET scan_id = NULL WHERE scan_id = ANY(?)", array(scans));
            db.update("DELETE FROM scans WHERE id = ANY(?)", array(scans));
            db.update("DELETE FROM projects WHERE organization_id = ?", organizationId);
            db.update("DELETE FROM organization_memberships WHERE organization_id = ?", organizationId);
            db.update("DELETE FROM organization_memberships WHERE user_id = ANY(?)", array(people));
            db.update("DELETE FROM users WHERE id = ANY(?)", array(people));
            db.update("DELETE FROM organizations WHERE id = ?", organizationId);
        });
        log.info("Deleted organization {} with {} people, {} spaces and {} files", organizationId, people.size(), spaces.size(), loose.size());
    }

    private String name(long organizationId) {
        var found = db.queryForList("SELECT name FROM organizations WHERE id = ?", String.class, organizationId);
        if (found.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Organization not found.");
        return found.getFirst();
    }

    /** The organization's people who go with it: not admins, and not in another organization too. */
    private List<Long> leaving(long organizationId) {
        return db.queryForList("""
                SELECT u.id FROM users u JOIN organization_memberships m ON m.user_id = u.id
                WHERE m.organization_id = ? AND NOT u.is_platform_admin
                  AND NOT EXISTS (SELECT 1 FROM organization_memberships o WHERE o.user_id = u.id AND o.organization_id <> ?)""",
                Long.class, organizationId, organizationId);
    }

    private List<Long> spaces(List<Long> people) {
        return db.queryForList("SELECT id FROM tour_requests WHERE user_id = ANY(?)", Long.class, array(people));
    }

    private List<Long> legacyScans(long organizationId) {
        return db.queryForList("SELECT s.id FROM scans s JOIN projects p ON p.id = s.project_id WHERE p.organization_id = ?",
                Long.class, organizationId);
    }

    /** Every stored file the spaces (or legacy scans) point at. */
    private Set<String> keys(List<Long> ids) {
        var keys = new LinkedHashSet<String>();
        if (ids.isEmpty()) return keys;
        var a = array(ids);
        var queries = List.of(
                "SELECT a.plan_object_key FROM tour_areas a WHERE a.tour_request_id = ANY(?)",
                "SELECT p.object_key FROM tour_area_plans p JOIN tour_areas a ON a.id = p.area_id WHERE a.tour_request_id = ANY(?)",
                "SELECT c.photo_object_key FROM capture_points c JOIN tour_areas a ON a.id = c.area_id WHERE a.tour_request_id = ANY(?)",
                "SELECT p.object_key FROM floor_photos p JOIN tour_areas a ON a.id = p.area_id WHERE a.tour_request_id = ANY(?)",
                """
                SELECT unnest(ARRAY[f.image_object_key, f.depth_object_key, f.confidence_object_key]) FROM spatial_context_frames f
                JOIN spatial_context_runs r ON r.id = f.run_id JOIN tour_areas a ON a.id = r.area_id WHERE a.tour_request_id = ANY(?)""",
                "SELECT unnest(ARRAY[s.source_object_key, s.folder_key]) FROM splat_runs s JOIN tour_areas a ON a.id = s.area_id WHERE a.tour_request_id = ANY(?)");
        for (var sql : queries) keys.addAll(db.queryForList(sql, String.class, a));
        keys.remove(null);
        return keys;
    }

    private Set<String> keysOfScans(List<Long> scans) {
        return new LinkedHashSet<>(db.queryForList("SELECT object_key FROM scan_files WHERE scan_id = ANY(?)", String.class, array(scans)));
    }

    private List<String> list(String prefix) {
        var found = new ArrayList<String>();
        r2.listObjectsV2Paginator(ListObjectsV2Request.builder().bucket(bucket).prefix(prefix).build())
                .contents().forEach(object -> found.add(object.key()));
        return found;
    }

    private void remove(List<String> keys) {
        for (int i = 0; i < keys.size(); i += 1000) {
            var batch = keys.subList(i, Math.min(keys.size(), i + 1000)).stream()
                    .map(key -> ObjectIdentifier.builder().key(key).build()).toList();
            var result = r2.deleteObjects(DeleteObjectsRequest.builder().bucket(bucket)
                    .delete(Delete.builder().objects(batch).quiet(true).build()).build());
            if (result.hasErrors() && !result.errors().isEmpty())
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "Some files could not be deleted from storage. Nothing else was removed; try again.");
        }
    }

    private int count(String sql, List<Long> ids) {
        return ids.isEmpty() ? 0 : db.queryForObject(sql, Integer.class, array(ids));
    }

    private int count(String sql, List<Long> a, List<Long> b) {
        return a.isEmpty() ? 0 : db.queryForObject(sql, Integer.class, array(a), array(b));
    }

    /** One SQL array parameter (typed as Object, so JdbcTemplate does not spread it into many parameters). */
    private static Object array(List<Long> ids) {
        return ids.toArray(Long[]::new);
    }
}
