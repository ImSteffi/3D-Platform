CREATE TABLE public.projects (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,

    CONSTRAINT projects_organization_id_fkey
        FOREIGN KEY (organization_id)
        REFERENCES public.organizations(id),

    CONSTRAINT projects_name_not_blank
        CHECK (LENGTH(TRIM(name)) > 0)
);

CREATE INDEX projects_organization_id_idx
    ON public.projects(organization_id);

GRANT SELECT, INSERT
ON TABLE public.projects
TO backend_db_user;

GRANT USAGE
ON SEQUENCE public.projects_id_seq
TO backend_db_user;