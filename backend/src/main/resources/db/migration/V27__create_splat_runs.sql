-- A floor's 3DGS (3D Gaussian splat): made by World Labs Atlas posedImages2Splats from the floor's spatial
-- context, then converted on our server into what the tour viewer loads (scene.sog and the walking collision).
-- public_id is the address the viewer loads the files from, so they can be shown without signing in.
CREATE TABLE public.splat_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    area_id BIGINT NOT NULL REFERENCES public.tour_areas(id) ON DELETE CASCADE,
    spatial_run_id BIGINT REFERENCES public.spatial_context_runs(id) ON DELETE SET NULL,
    public_id UUID NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    -- While running: UPLOADING (our files going to Atlas), PROCESSING (Atlas is making it), CONVERTING (on our server).
    phase VARCHAR(20),
    operation_id VARCHAR(200),
    -- Atlas's own output, kept so a failed conversion can be tried again without paying Atlas twice.
    source_object_key VARCHAR(1000),
    -- Where the converted files are: <folder>/scene.sog, scene.voxel.json, scene.voxel.bin, settings.json.
    folder_key VARCHAR(1000),
    splat_count INTEGER,
    error VARCHAR(2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    CONSTRAINT splat_runs_status_valid CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED'))
);
CREATE INDEX splat_runs_area_idx ON public.splat_runs (area_id, id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.splat_runs TO backend_db_user;
