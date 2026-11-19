-- One row per time someone opens a 3D tour, without personal data: no IP and no id stored in the browser.
-- The visitor is a hash that changes every day, the device a coarse kind, the region the browser's time zone.
CREATE TABLE public.tour_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tour_request_id BIGINT NOT NULL REFERENCES public.tour_requests(id) ON DELETE CASCADE,
    area_id BIGINT REFERENCES public.tour_areas(id) ON DELETE SET NULL,
    visitor VARCHAR(64) NOT NULL,
    source VARCHAR(10) NOT NULL CHECK (source IN ('app', 'direct', 'embed')),
    referrer_host VARCHAR(255),
    device VARCHAR(10),
    time_zone VARCHAR(64),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    seconds INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX tour_views_tour_idx ON public.tour_views (tour_request_id, started_at);

GRANT SELECT, INSERT, UPDATE ON TABLE public.tour_views TO backend_db_user;
