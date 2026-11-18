-- Photos a customer adds to a floor straight away, before (or without) a floor plan and capture points.
CREATE TABLE public.floor_photos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    area_id BIGINT NOT NULL REFERENCES public.tour_areas(id) ON DELETE CASCADE,
    object_key VARCHAR(1000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX floor_photos_area_id_idx ON public.floor_photos(area_id);

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.floor_photos
TO backend_db_user;

GRANT USAGE
ON SEQUENCE public.floor_photos_id_seq
TO backend_db_user;
