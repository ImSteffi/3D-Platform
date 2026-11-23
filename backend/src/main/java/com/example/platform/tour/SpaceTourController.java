package com.example.platform.tour;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/**
 * A space's combined 3D tour: the floors' 3DGS joined by teleports the team places by hand.
 * The team edits it (SecurityConfig limits /api/admin/** to administrators); anyone with its public id can view it.
 */
@RestController
public class SpaceTourController {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final int MAX_TELEPORTS = 100;
    /** Same rule as the viewer: a folder on this site. Real 3DGS storage replaces this once generation is connected. */
    private static final Pattern SCENE = Pattern.compile("^/(?!/)[A-Za-z0-9_\\-./]{1,300}$");
    private static final double LIMIT = 100_000;

    private final JdbcTemplate db;

    public SpaceTourController(JdbcTemplate db) { this.db = db; }

    /** Where people stand and look: eye position and heading (degrees). */
    public record Pose(Long areaId, List<Double> position, Double yaw) {}
    /**
     * A portal between two spots: a ring at `position` on floor `from` takes people to `arrive` on floor `to`, and a ring
     * there takes them back to `back` (at the first ring). Older teleports have no `back`: the viewer then lands people on `position`.
     * Each ring has its own name (`label` on the first, `backLabel` on the second); empty means the name of the floor it leads to.
     */
    public record Teleport(String id, Long from, List<Double> position, Long to, Pose arrive, Pose back, String label, String backLabel) {}
    public record Definition(Pose start, Map<String, String> scenes, List<Teleport> teleports) {}
    public record Saved(String publicId, Definition definition, String updatedAt) {}

    public record Floor(Long areaId, String name, String scene) {}
    public record PublicTour(String name, Long spaceId, Pose start, List<Floor> floors, List<Teleport> teleports) {}

    @GetMapping("/api/admin/tour-requests/{id}/space-tour")
    public ResponseEntity<Saved> get(@PathVariable Long id) {
        requireSpace(id);
        var rows = db.query("SELECT public_id, definition::text, updated_at FROM space_tours WHERE tour_request_id = ?",
                (rs, i) -> new Saved(rs.getString(1), JSON.readValue(rs.getString(2), Definition.class),
                        rs.getTimestamp(3).toInstant().toString()), id);
        if (rows.isEmpty()) return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(rows.getFirst());
    }

    @PutMapping("/api/admin/tour-requests/{id}/space-tour")
    public Saved save(@PathVariable Long id, @RequestBody Definition body) {
        requireSpace(id);
        var definition = clean(body, areaIds(id));
        var json = JSON.writeValueAsString(definition);
        var now = Instant.now();
        var publicId = db.queryForObject("""
                INSERT INTO space_tours (tour_request_id, public_id, definition, updated_at) VALUES (?, ?, ?::jsonb, ?)
                ON CONFLICT (tour_request_id) DO UPDATE SET definition = EXCLUDED.definition, updated_at = EXCLUDED.updated_at
                RETURNING public_id""", String.class, id, UUID.randomUUID(), json, java.sql.Timestamp.from(now));
        return new Saved(publicId, definition, now.toString());
    }

    /** Public: what the tour page needs to show the tour. No names of people, no emails. */
    @GetMapping("/api/public/space-tours/{publicId}")
    public ResponseEntity<PublicTour> view(@PathVariable String publicId) {
        UUID key;
        try { key = UUID.fromString(publicId); } catch (IllegalArgumentException e) { throw new ResponseStatusException(HttpStatus.NOT_FOUND); }
        var rows = db.query("""
                SELECT s.tour_request_id, s.definition::text, t.name FROM space_tours s
                JOIN tour_requests t ON t.id = s.tour_request_id WHERE s.public_id = ?""",
                (rs, i) -> new Object[] { rs.getLong(1), JSON.readValue(rs.getString(2), Definition.class), rs.getString(3) }, key);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        var spaceId = (Long) rows.getFirst()[0];
        var definition = (Definition) rows.getFirst()[1];
        var floors = db.query("SELECT id, name FROM tour_areas WHERE tour_request_id = ? ORDER BY id",
                (rs, i) -> new Floor(rs.getLong(1), rs.getString(2), definition.scenes().get(String.valueOf(rs.getLong(1)))), spaceId)
                .stream().filter(floor -> floor.scene() != null).toList();
        // Floors removed since (or without a 3DGS) drop out, and so do the teleports and start point on them.
        var shown = floors.stream().map(Floor::areaId).collect(java.util.stream.Collectors.toSet());
        var teleports = definition.teleports().stream().filter(t -> shown.contains(t.from()) && shown.contains(t.to())).toList();
        var start = definition.start() != null && shown.contains(definition.start().areaId()) ? definition.start() : null;
        return ResponseEntity.ok().cacheControl(CacheControl.noCache())
                .body(new PublicTour((String) rows.getFirst()[2], spaceId, start, floors, teleports));
    }

    /** The reason a save was refused, as the editor shows it. */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> failure(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode())
                .body(Map.of("message", error.getReason() == null ? "Request failed." : error.getReason()));
    }

    private void requireSpace(Long id) {
        var found = db.queryForObject("SELECT count(*) FROM tour_requests WHERE id = ?", Integer.class, id);
        if (found == null || found == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such space.");
    }

    private HashSet<Long> areaIds(Long id) {
        return new HashSet<>(db.queryForList("SELECT id FROM tour_areas WHERE tour_request_id = ?", Long.class, id));
    }

    private static ResponseStatusException bad(String reason) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason); }

    private static List<Double> point(List<Double> value, String what) {
        if (value == null || value.size() != 3) throw bad(what + " needs three coordinates.");
        for (var n : value) if (n == null || !Double.isFinite(n) || Math.abs(n) > LIMIT) throw bad(what + " is out of range.");
        return List.copyOf(value);
    }

    private static Double yaw(Double value) {
        if (value == null) return 0d;
        if (!Double.isFinite(value)) throw bad("A heading is out of range.");
        return ((value % 360) + 360) % 360;
    }

    private static Pose pose(Pose value, HashSet<Long> areas, String what) {
        if (value == null) return null;
        if (value.areaId() == null || !areas.contains(value.areaId())) throw bad(what + " is on a floor of another space.");
        return new Pose(value.areaId(), point(value.position(), what), yaw(value.yaw()));
    }

    /** Checks every floor id against the space and every number against sane bounds. */
    private static Definition clean(Definition body, HashSet<Long> areas) {
        if (body == null) throw bad("Nothing to save.");
        var scenes = new LinkedHashMap<String, String>();
        if (body.scenes() != null) body.scenes().forEach((key, scene) -> {
            long areaId;
            try { areaId = Long.parseLong(key); } catch (NumberFormatException e) { throw bad("A scene belongs to an unknown floor."); }
            if (!areas.contains(areaId)) throw bad("A scene belongs to a floor of another space.");
            if (scene == null || !SCENE.matcher(scene).matches() || scene.contains("..")) throw bad("A scene address is not valid.");
            scenes.put(key, scene);
        });
        var teleports = new ArrayList<Teleport>();
        var ids = new HashSet<String>();
        for (var t : body.teleports() == null ? List.<Teleport>of() : body.teleports()) {
            if (teleports.size() >= MAX_TELEPORTS) throw bad("A tour can have at most " + MAX_TELEPORTS + " teleports.");
            if (t == null || t.id() == null || !t.id().matches("[A-Za-z0-9_-]{1,40}") || !ids.add(t.id())) throw bad("A teleport has no valid id.");
            if (t.from() == null || !areas.contains(t.from()) || t.to() == null || !areas.contains(t.to())) throw bad("A teleport links floors of another space.");
            var arrive = pose(t.arrive(), areas, "A teleport's arrival");
            if (arrive == null || !arrive.areaId().equals(t.to())) throw bad("A teleport needs an arrival on the floor it leads to.");
            var label = t.label() == null ? "" : t.label().strip();
            var backLabel = t.backLabel() == null ? "" : t.backLabel().strip();
            if (label.length() > 60 || backLabel.length() > 60) throw bad("A teleport name can be at most 60 characters.");
            var back = pose(t.back(), areas, "A teleport's way back");
            if (back != null && !back.areaId().equals(t.from())) throw bad("A teleport's way back must be on the floor it starts on.");
            teleports.add(new Teleport(t.id(), t.from(), point(t.position(), "A teleport"), t.to(), arrive, back, label, backLabel));
        }
        return new Definition(pose(body.start(), areas, "The start point"), scenes, teleports);
    }
}
