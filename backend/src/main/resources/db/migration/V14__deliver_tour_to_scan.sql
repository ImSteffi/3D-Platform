-- An approved tour request ends in a finished scan: the administrator delivers one,
-- and the client opens it from the request. Deleting the scan only undoes the delivery.
ALTER TABLE public.tour_requests
    ADD COLUMN scan_id BIGINT REFERENCES public.scans(id) ON DELETE SET NULL,
    DROP CONSTRAINT tour_requests_status_valid,
    ADD CONSTRAINT tour_requests_status_valid CHECK (status IN
        ('DRAFT', 'SUBMITTED', 'PLAN_READY', 'PHOTOS_SUBMITTED', 'APPROVED', 'DELIVERED'));

CREATE INDEX tour_requests_scan_id_idx ON public.tour_requests(scan_id);

-- backend_db_user already holds table-wide rights on tour_requests (V12), which cover the
-- new column. The SET NULL action runs with the table owner's rights when a scan is deleted,
-- so the DELETE grant on scans (V10) remains enough.
