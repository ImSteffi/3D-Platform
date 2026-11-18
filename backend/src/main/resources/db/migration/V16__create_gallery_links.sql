-- A gallery link signs the space's owner in without a password and opens that space,
-- so a customer the team created an account for can add photos. One link per space;
-- creating a new one replaces the old one.
CREATE TABLE public.gallery_links (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tour_request_id BIGINT NOT NULL UNIQUE REFERENCES public.tour_requests(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.gallery_links
TO backend_db_user;

GRANT USAGE
ON SEQUENCE public.gallery_links_id_seq
TO backend_db_user;
