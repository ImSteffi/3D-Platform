-- Spatial context for one floor: its photos are sent to World Labs Atlas (images2PosedRGBD),
-- which returns a camera pose plus a depth map per photo. The operator uses the result to see
-- where each photo was taken. A floor keeps every run; the newest one is shown.
CREATE TABLE public.spatial_context_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    area_id BIGINT NOT NULL REFERENCES public.tour_areas(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    operation_id VARCHAR(200),
    error VARCHAR(2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,

    CONSTRAINT spatial_context_runs_status_valid CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED'))
);

CREATE INDEX spatial_context_runs_area_id_idx ON public.spatial_context_runs(area_id);

-- One row per submitted photo, in submission order. The point link is cleared if the point goes;
-- the stored files stay usable on their own.
CREATE TABLE public.spatial_context_frames (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES public.spatial_context_runs(id) ON DELETE CASCADE,
    frame_index INTEGER NOT NULL,
    capture_point_id BIGINT REFERENCES public.capture_points(id) ON DELETE SET NULL,
    point_seq INTEGER NOT NULL,
    -- The Atlas camera object as returned (extrinsics + intrinsics), JSON text.
    camera_json TEXT,
    image_object_key VARCHAR(1000),
    depth_object_key VARCHAR(1000),
    confidence_object_key VARCHAR(1000),

    CONSTRAINT spatial_context_frames_index_unique UNIQUE (run_id, frame_index)
);

CREATE INDEX spatial_context_frames_point_idx ON public.spatial_context_frames(capture_point_id);

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.spatial_context_runs, public.spatial_context_frames
TO backend_db_user;

GRANT USAGE
ON SEQUENCE public.spatial_context_runs_id_seq, public.spatial_context_frames_id_seq
TO backend_db_user;
