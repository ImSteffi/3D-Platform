package com.example.platform.tour;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Records who opens a tour and for how long, and sums it up for the space's Analytics.
 * Nothing personal is kept: no IP address and no id stored in the browser. A visitor is a hash
 * of the address and browser with a random salt that is replaced every day and never saved,
 * so the same person cannot be followed from one day to the next (as cookie-free analytics do).
 */
@Service
public class TourViewService {
    /** A view longer than this is a tab left open, not someone watching. */
    private static final int MAX_SECONDS = 2 * 60 * 60;
    private static final Pattern TIME_ZONE = Pattern.compile("[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}");
    private static final ZoneId LOCAL = ZoneId.of("Europe/Tallinn");

    private final JdbcTemplate db;
    private final SecureRandom random = new SecureRandom();
    private LocalDate saltDay;
    private byte[] salt;

    public TourViewService(JdbcTemplate db) { this.db = db; }

    // ----- Recording

    /** Starts a view. The endpoint is public, so everything is checked and trimmed. */
    public UUID start(long tourId, Long areaId, String source, String referrer, String timeZone, String ip, String userAgent) {
        if (!"direct".equals(source) && !"embed".equals(source) && !"app".equals(source))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        var exists = db.queryForObject("SELECT count(*) FROM tour_requests WHERE id = ?", Long.class, tourId);
        if (exists == null || exists == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (areaId != null) {
            var floor = db.queryForObject("SELECT count(*) FROM tour_areas WHERE id = ? AND tour_request_id = ?",
                    Long.class, areaId, tourId);
            if (floor == null || floor == 0) areaId = null;
        }
        var zone = timeZone != null && timeZone.length() <= 64 && TIME_ZONE.matcher(timeZone).matches() ? timeZone : null;
        return db.queryForObject("""
                INSERT INTO tour_views (tour_request_id, area_id, visitor, source, referrer_host, device, time_zone)
                VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id""", UUID.class,
                tourId, areaId, visitor(tourId, ip, userAgent), source, hostOf(referrer), device(userAgent), zone);
    }

    /** The time can only grow, only for a recent view, and is capped. */
    public void time(UUID id, int seconds) {
        db.update("""
                UPDATE tour_views SET seconds = GREATEST(seconds, LEAST(?, ?))
                WHERE id = ? AND started_at > now() - interval '3 hours'""",
                Math.max(0, seconds), MAX_SECONDS, id);
    }

    // ----- Reading

    public record Totals(long views, long visitors, long averageSeconds, long embeds) {}
    public record Day(String day, long views, long visitors) {}
    public record Count(String label, long views) {}
    public record Stats(Totals totals, List<Day> days, List<Count> sources, List<Count> devices, List<Count> regions,
            long[] hours, long[] weekdays) {}

    /** Views by the platform's own people (the tour inside the app) are left out. */
    private static final String COUNTED = "tour_request_id = ? AND source <> 'app'";

    public Stats stats(long tourId) {
        var totals = db.queryForObject("""
                SELECT count(*), count(DISTINCT visitor), COALESCE(round(avg(seconds)), 0),
                       count(*) FILTER (WHERE source = 'embed')
                FROM tour_views WHERE %s""".formatted(COUNTED),
                (row, n) -> new Totals(row.getLong(1), row.getLong(2), row.getLong(3), row.getLong(4)), tourId);

        var days = db.query("""
                SELECT d::date, count(v.id), count(DISTINCT v.visitor)
                FROM generate_series((now() AT TIME ZONE 'Europe/Tallinn')::date - 29, (now() AT TIME ZONE 'Europe/Tallinn')::date, interval '1 day') d
                LEFT JOIN tour_views v ON (v.started_at AT TIME ZONE 'Europe/Tallinn')::date = d::date AND v.tour_request_id = ? AND v.source <> 'app'
                GROUP BY d ORDER BY d""",
                (row, n) -> new Day(row.getString(1), row.getLong(2), row.getLong(3)), tourId);

        var sources = counts("""
                CASE WHEN referrer_host IS NOT NULL THEN referrer_host
                     WHEN source = 'embed' THEN 'Embedded (site unknown)' ELSE 'Direct link' END""", tourId);
        var devices = counts("COALESCE(device, 'unknown')", tourId);
        var regions = counts("COALESCE(split_part(time_zone, '/', 1) || CASE WHEN time_zone LIKE '%/%' THEN ' · ' || replace(split_part(time_zone, '/', 2), '_', ' ') ELSE '' END, 'Unknown')", tourId);

        var hours = new long[24];
        var weekdays = new long[7];
        db.query("""
                SELECT extract(hour FROM started_at AT TIME ZONE 'Europe/Tallinn')::int,
                       extract(isodow FROM started_at AT TIME ZONE 'Europe/Tallinn')::int, count(*)
                FROM tour_views WHERE %s GROUP BY 1, 2""".formatted(COUNTED), row -> {
            hours[row.getInt(1)] += row.getLong(3);
            weekdays[row.getInt(2) - 1] += row.getLong(3);
        }, tourId);

        return new Stats(totals, days, sources, devices, regions, hours, weekdays);
    }

    /** Daily numbers as CSV, for a report the customer can pass on. */
    public String csv(long tourId) {
        var out = new StringBuilder("date,views,visitors,average_seconds,embeds\n");
        db.query("""
                SELECT (started_at AT TIME ZONE 'Europe/Tallinn')::date, count(*), count(DISTINCT visitor),
                       round(avg(seconds)), count(*) FILTER (WHERE source = 'embed')
                FROM tour_views WHERE %s GROUP BY 1 ORDER BY 1""".formatted(COUNTED), row -> {
            out.append(row.getString(1)).append(',').append(row.getLong(2)).append(',').append(row.getLong(3))
                    .append(',').append(row.getLong(4)).append(',').append(row.getLong(5)).append('\n');
        }, tourId);
        return out.toString();
    }

    private List<Count> counts(String label, long tourId) {
        return db.query("SELECT " + label + ", count(*) FROM tour_views WHERE " + COUNTED + " GROUP BY 1 ORDER BY 2 DESC LIMIT 10",
                (row, n) -> new Count(row.getString(1), row.getLong(2)), tourId);
    }

    // ----- Without personal data

    private synchronized String visitor(long tourId, String ip, String userAgent) {
        var today = LocalDate.now(LOCAL);
        if (!today.equals(saltDay)) {
            salt = new byte[32];
            random.nextBytes(salt);
            saltDay = today;
        }
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            digest.update(salt);
            digest.update((tourId + "|" + ip + "|" + userAgent).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest.digest(), 0, 16);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static String device(String userAgent) {
        if (userAgent == null) return null;
        var agent = userAgent.toLowerCase();
        if (agent.contains("ipad") || agent.contains("tablet") || (agent.contains("android") && !agent.contains("mobile"))) return "tablet";
        if (agent.contains("mobi") || agent.contains("iphone") || agent.contains("android")) return "phone";
        if (agent.contains("oculus") || agent.contains("quest")) return "headset";
        return "computer";
    }

    private static String hostOf(String referrer) {
        if (referrer == null || referrer.isBlank()) return null;
        try {
            var host = URI.create(referrer.trim()).getHost();
            if (host == null) return null;
            host = host.toLowerCase();
            if (host.startsWith("www.")) host = host.substring(4);
            return host.length() > 255 ? host.substring(0, 255) : host;
        } catch (IllegalArgumentException invalid) {
            return null;
        }
    }
}
