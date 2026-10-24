ALTER TABLE public.scans
    ADD COLUMN share_token VARCHAR(64) UNIQUE,
    ADD COLUMN share_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN hosting_enabled BOOLEAN NOT NULL DEFAULT TRUE;
GRANT UPDATE (share_token, share_enabled) ON public.scans TO backend_db_user;
-- hosting_enabled is an entitlement controlled by trusted administration/billing,
-- never by the share endpoint. Existing scans may be hosted during the pre-billing phase.