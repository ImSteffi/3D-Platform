ALTER TABLE public.users
    ALTER COLUMN email SET NOT NULL;

ALTER TABLE public.users
    ADD CONSTRAINT users_email_not_blank
        CHECK (LENGTH(TRIM(email)) > 0);

ALTER TABLE public.users
    DROP COLUMN username;