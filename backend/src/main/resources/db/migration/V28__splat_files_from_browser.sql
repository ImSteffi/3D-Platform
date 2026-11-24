-- The server no longer converts a 3DGS: it keeps Atlas's .spz, and the team's browser converts it and uploads the
-- viewer's files. scene.sog makes it visible (fly mode); scene.voxel.json/.bin add walking and teleports.
ALTER TABLE public.splat_runs
    ADD COLUMN sog_ready BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN voxels_ready BOOLEAN NOT NULL DEFAULT false;
