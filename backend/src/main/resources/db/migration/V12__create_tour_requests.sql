-- A client describes a property with floor plans, an administrator marks where to
-- take photos, and the client uploads one photo per capture point.
CREATE TABLE public.tour_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES public.users(id),
    name VARCHAR(100) NOT NULL,
    notes VARCHAR(2000),
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT tour_requests_name_not_blank CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT tour_requests_status_valid CHECK (status IN
        ('DRAFT', 'SUBMITTED', 'PLAN_READY', 'PHOTOS_SUBMITTED', 'APPROVED'))
);

CREATE INDEX tour_requests_user_id_idx ON public.tour_requests(user_id);

CREATE TABLE public.tour_areas (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tour_request_id BIGINT NOT NULL REFERENCES public.tour_requests(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    kind VARCHAR(20) NOT NULL,
    -- Areas sharing a group are generated together; one generation takes at most 64 photos.
    capture_group INTEGER NOT NULL DEFAULT 1,
    plan_object_key VARCHAR(1000),

    CONSTRAINT tour_areas_name_not_blank CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT tour_areas_kind_valid CHECK (kind IN ('FLOOR', 'BUILDING', 'OUTDOOR')),
    CONSTRAINT tour_areas_capture_group_valid CHECK (capture_group BETWEEN 1 AND 50)
);

CREATE INDEX tour_areas_tour_request_id_idx ON public.tour_areas(tour_request_id);

CREATE TABLE public.capture_points (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    area_id BIGINT NOT NULL REFERENCES public.tour_areas(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    -- Position as a fraction of the plan image; direction in degrees, 0 = up, clockwise.
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    direction DOUBLE PRECISION NOT NULL,
    note VARCHAR(500),
    photo_object_key VARCHAR(1000),
    retake_note VARCHAR(500),

    CONSTRAINT capture_points_position_valid CHECK (x BETWEEN 0 AND 1 AND y BETWEEN 0 AND 1),
    CONSTRAINT capture_points_direction_valid CHECK (direction >= 0 AND direction < 360),
    CONSTRAINT capture_points_seq_unique UNIQUE (area_id, seq)
);

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.tour_requests, public.tour_areas, public.capture_points
TO backend_db_user;

GRANT USAGE
ON SEQUENCE public.tour_requests_id_seq, public.tour_areas_id_seq, public.capture_points_id_seq
TO backend_db_user;
