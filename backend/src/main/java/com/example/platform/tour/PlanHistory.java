package com.example.platform.tour;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Every plan a floor has had, oldest first (tour_area_plans). The floor's current plan is one of them,
 * or none after "Remove plan". Undo moves to the one before the current, redo to the one after.
 * Like an editor: a new plan uploaded after an undo drops the versions that came after.
 */
@Component
class PlanHistory {
    private final JdbcTemplate db;
    PlanHistory(JdbcTemplate db) { this.db = db; }

    private List<String> keys(long areaId) {
        return db.queryForList("SELECT object_key FROM tour_area_plans WHERE area_id = ? ORDER BY id", String.class, areaId);
    }

    /** Where the current plan sits: its index, or the end (size) when the floor has no plan now. */
    private int position(List<String> keys, String current) {
        if (current == null) return keys.size();
        var index = keys.indexOf(current);
        return index < 0 ? keys.size() : index;
    }

    /** Records a new current plan. Returns the files of dropped redo versions, to delete from storage. */
    List<String> add(long areaId, String current, String added) {
        var keys = keys(areaId);
        // After "Remove plan" the removed one is still the newest version, so nothing is dropped.
        var dropped = current == null ? List.<String>of() : keys.subList(position(keys, current) + 1, keys.size());
        for (var key : dropped) db.update("DELETE FROM tour_area_plans WHERE area_id = ? AND object_key = ?", areaId, key);
        db.update("INSERT INTO tour_area_plans (area_id, object_key) VALUES (?, ?)", areaId, added);
        return List.copyOf(dropped);
    }

    /** The plan before the current one; after "Remove plan", the removed one. Null when there is none. */
    String previous(long areaId, String current) {
        var keys = keys(areaId);
        var at = position(keys, current);
        return at > 0 ? keys.get(at - 1) : null;
    }

    /** The plan after the current one. Null when the current is the newest. */
    String next(long areaId, String current) {
        if (current == null) return null;
        var keys = keys(areaId);
        var at = position(keys, current);
        return at + 1 < keys.size() ? keys.get(at + 1) : null;
    }

    /** All files of the floor's plans, for when the floor itself is deleted. */
    List<String> all(long areaId) {
        return keys(areaId);
    }
}
