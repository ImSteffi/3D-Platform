CREATE TABLE public.organization_memberships (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    organization_id BIGINT NOT NULL
        REFERENCES public.organizations(id),

    user_id BIGINT NOT NULL
        REFERENCES public.users(id),

    role VARCHAR(30) NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT organization_memberships_role_check
        CHECK (role IN ('MEMBER', 'ADMIN')),

    CONSTRAINT organization_memberships_unique
        UNIQUE (organization_id, user_id)
);

GRANT SELECT, INSERT
ON TABLE public.organization_memberships
TO backend_db_user;

GRANT USAGE
ON SEQUENCE public.organization_memberships_id_seq
TO backend_db_user;

GRANT INSERT
ON TABLE public.users
TO backend_db_user;

GRANT USAGE
ON SEQUENCE public.users_id_seq
TO backend_db_user;

ALTER TABLE public.users
    ADD COLUMN display_name VARCHAR(200),
    ADD COLUMN email VARCHAR(254);

UPDATE public.users
SET display_name = username;

ALTER TABLE public.users
    ALTER COLUMN display_name SET NOT NULL;

ALTER TABLE public.users
    ADD CONSTRAINT users_display_name_not_blank
        CHECK (LENGTH(TRIM(display_name)) > 0);

CREATE UNIQUE INDEX users_email_unique
    ON public.users (LOWER(email));