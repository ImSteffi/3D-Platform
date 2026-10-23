CREATE TABLE public.scans (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    project_id BIGINT NOT NULL
        REFERENCES public.projects(id),

    name VARCHAR(200) NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'UPLOADING',

    CONSTRAINT scans_name_not_blank
        CHECK (LENGTH(TRIM(name)) > 0),

    CONSTRAINT scans_status_valid
        CHECK (status IN ('UPLOADING', 'READY', 'FAILED'))
);

CREATE INDEX scans_project_id_idx
    ON public.scans(project_id);


CREATE TABLE public.scan_files (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    scan_id BIGINT NOT NULL
        REFERENCES public.scans(id),

    relative_path VARCHAR(1000) NOT NULL,

    object_key VARCHAR(1000) NOT NULL,

    size_bytes BIGINT NOT NULL,

    CONSTRAINT scan_files_relative_path_not_blank
        CHECK (LENGTH(TRIM(relative_path)) > 0),

    CONSTRAINT scan_files_object_key_not_blank
        CHECK (LENGTH(TRIM(object_key)) > 0),

    CONSTRAINT scan_files_size_non_negative
        CHECK (size_bytes >= 0),

    CONSTRAINT scan_files_path_unique
        UNIQUE (scan_id, relative_path),

    CONSTRAINT scan_files_object_key_unique
        UNIQUE (object_key)
);


GRANT SELECT, INSERT
ON TABLE public.scans, public.scan_files
TO backend_db_user;

GRANT UPDATE (status)
ON TABLE public.scans
TO backend_db_user;

GRANT USAGE
ON SEQUENCE public.scans_id_seq, public.scan_files_id_seq
TO backend_db_user;