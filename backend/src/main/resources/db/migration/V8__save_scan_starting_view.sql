ALTER TABLE public.scans
    ADD COLUMN start_position_x DOUBLE PRECISION,
    ADD COLUMN start_position_y DOUBLE PRECISION,
    ADD COLUMN start_position_z DOUBLE PRECISION,
    ADD COLUMN start_target_x DOUBLE PRECISION,
    ADD COLUMN start_target_y DOUBLE PRECISION,
    ADD COLUMN start_target_z DOUBLE PRECISION,
    ADD COLUMN start_fov DOUBLE PRECISION,
    ADD CONSTRAINT scans_starting_view_complete CHECK (
        num_nonnulls(start_position_x, start_position_y, start_position_z,
            start_target_x, start_target_y, start_target_z, start_fov) IN (0, 7)
    ),
    ADD CONSTRAINT scans_starting_view_valid CHECK (
        start_fov IS NULL OR (
            start_fov BETWEEN 10 AND 120
            AND abs(start_position_x) < 1000000000 AND abs(start_position_y) < 1000000000
            AND abs(start_position_z) < 1000000000 AND abs(start_target_x) < 1000000000
            AND abs(start_target_y) < 1000000000 AND abs(start_target_z) < 1000000000
            AND (start_position_x <> start_target_x OR start_position_y <> start_target_y
                OR start_position_z <> start_target_z)
        )
    );

GRANT UPDATE (start_position_x, start_position_y, start_position_z,
    start_target_x, start_target_y, start_target_z, start_fov)
ON public.scans TO backend_db_user;
