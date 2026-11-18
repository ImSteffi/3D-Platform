-- Which photos came in through a gallery link: the link may delete only those, not the owner's own uploads.
ALTER TABLE floor_photos ADD COLUMN via_link BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE capture_points ADD COLUMN photo_via_link BOOLEAN NOT NULL DEFAULT FALSE;
