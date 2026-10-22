CREATE TABLE public.organizations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    CONSTRAINT organizations_name_not_blank
        CHECK (LENGTH(TRIM(name)) > 0)
);

GRANT SELECT, INSERT
ON TABLE public.organizations
TO backend_db_user;

GRANT USAGE
ON SEQUENCE public.organizations_id_seq
TO backend_db_user;