package com.example.platform.tour;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The team's overview of the whole platform: customers, spaces, uploads and how the tours are viewed. Under /api/admin, so platform admins only.
 * Tour views inside the platform itself are left out, as on a space's own Analytics.
 */
@RestController
public class AdminAnalyticsController {
    private final JdbcTemplate db;
    public AdminAnalyticsController(JdbcTemplate db) { this.db = db; }

    public record Totals(long customers, long organizations, long spaces, long floors,
            long views, long visitors, long averageSeconds, long embeds) {}
    public record Day(String day, long spaces, long photos, long views, long visitors, long averageSeconds, long embeds) {}
    /** What happened in one period: new spaces and photos, and how the tours were viewed. */
    public record Period(long spaces, long photos, long views, long visitors, long averageSeconds, long embeds) {}
    public record Count(String label, long count) {}
    public record Space(long id, String name, String customer, long views, long averageSeconds) {}
    public record Overview(Totals totals, Period recent, Period previous, long photos, List<Day> days, List<Space> topSpaces,
            List<Count> sources, List<Count> devices, List<Count> regions) {}

    private static final String TZ = "'Europe/Tallinn'";

    @GetMapping("/api/admin/analytics")
    public Overview overview() {
        var totals = db.queryForObject("""
                SELECT (SELECT count(*) FROM users WHERE NOT is_platform_admin),
                       (SELECT count(*) FROM organizations),
                       (SELECT count(*) FROM tour_requests),
                       (SELECT count(*) FROM tour_areas),
                       count(*), count(DISTINCT visitor), COALESCE(round(avg(seconds)), 0), count(*) FILTER (WHERE source = 'embed')
                FROM tour_views WHERE source <> 'app'""",
                (row, n) -> new Totals(row.getLong(1), row.getLong(2), row.getLong(3), row.getLong(4),
                        row.getLong(5), row.getLong(6), row.getLong(7), row.getLong(8)));

        // Last 30 days, one row per day even when nothing happened.
        var days = db.query("""
                SELECT d::date,
                       (SELECT count(*) FROM tour_requests t WHERE (t.created_at AT TIME ZONE %1$s)::date = d::date),
                       (SELECT count(*) FROM floor_photos p WHERE (p.created_at AT TIME ZONE %1$s)::date = d::date),
                       v.views, v.visitors, v.seconds, v.embeds
                FROM generate_series((now() AT TIME ZONE %1$s)::date - 29, (now() AT TIME ZONE %1$s)::date, interval '1 day') d
                CROSS JOIN LATERAL (SELECT count(*) views, count(DISTINCT visitor) visitors, COALESCE(round(avg(seconds)), 0) seconds,
                        count(*) FILTER (WHERE source = 'embed') embeds
                    FROM tour_views WHERE source <> 'app' AND (started_at AT TIME ZONE %1$s)::date = d::date) v
                ORDER BY d""".formatted(TZ),
                (row, n) -> new Day(row.getString(1), row.getLong(2), row.getLong(3), row.getLong(4),
                        row.getLong(5), row.getLong(6), row.getLong(7)));
        var recent = period("now() - interval '30 days'", "now()");
        var previous = period("now() - interval '60 days'", "now() - interval '30 days'");
        var photos = db.queryForObject("SELECT count(*) FROM floor_photos", Long.class);

        var topSpaces = db.query("""
                SELECT t.id, t.name, u.display_name, count(*), COALESCE(round(avg(v.seconds)), 0)
                FROM tour_views v JOIN tour_requests t ON t.id = v.tour_request_id JOIN users u ON u.id = t.user_id
                WHERE v.source <> 'app' GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 10""",
                (row, n) -> new Space(row.getLong(1), row.getString(2), row.getString(3), row.getLong(4), row.getLong(5)));

        var sources = counts("""
                CASE WHEN referrer_host IS NOT NULL THEN referrer_host
                     WHEN source = 'embed' THEN 'Embedded (site unknown)' ELSE 'Direct link' END""");
        var devices = counts("COALESCE(device, 'unknown')");
        var regions = counts("COALESCE(split_part(time_zone, '/', 1) || CASE WHEN time_zone LIKE '%/%' THEN ' · ' || replace(split_part(time_zone, '/', 2), '_', ' ') ELSE '' END, 'Unknown')");

        return new Overview(totals, recent, previous, photos, days, topSpaces, sources, devices, regions);
    }

    /** Totals for [from, to). Both are fixed SQL expressions from this class, never user input. */
    private Period period(String from, String to) {
        var spaces = "created_at >= " + from + " AND created_at < " + to;
        var views = "started_at >= " + from + " AND started_at < " + to;
        return db.queryForObject("""
                SELECT (SELECT count(*) FROM tour_requests WHERE %1$s),
                       (SELECT count(*) FROM floor_photos WHERE %1$s),
                       count(*), count(DISTINCT visitor), COALESCE(round(avg(seconds)), 0), count(*) FILTER (WHERE source = 'embed')
                FROM tour_views WHERE source <> 'app' AND %2$s""".formatted(spaces, views),
                (row, n) -> new Period(row.getLong(1), row.getLong(2), row.getLong(3), row.getLong(4), row.getLong(5), row.getLong(6)));
    }

    private List<Count> counts(String label) {
        return db.query("SELECT " + label + ", count(*) FROM tour_views WHERE source <> 'app' GROUP BY 1 ORDER BY 2 DESC LIMIT 10",
                (row, n) -> new Count(row.getString(1), row.getLong(2)));
    }
}
