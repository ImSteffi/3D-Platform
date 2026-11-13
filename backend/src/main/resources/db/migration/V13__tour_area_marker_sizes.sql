-- How large the capture markers are drawn on a floor plan, in pixels at a plan width of
-- 800 pixels. Stored with the plan so the client sees it exactly as the administrator set it.
ALTER TABLE public.tour_areas
    ADD COLUMN marker_dot_size INTEGER NOT NULL DEFAULT 22,
    ADD COLUMN marker_line_length INTEGER NOT NULL DEFAULT 26,
    ADD CONSTRAINT tour_areas_marker_dot_size_valid CHECK (marker_dot_size BETWEEN 8 AND 40),
    ADD CONSTRAINT tour_areas_marker_line_length_valid CHECK (marker_line_length BETWEEN 10 AND 80);
