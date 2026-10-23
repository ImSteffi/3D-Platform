ALTER TABLE public.scan_files ADD COLUMN upload_id TEXT;
GRANT UPDATE (upload_id) ON public.scan_files TO backend_db_user;
