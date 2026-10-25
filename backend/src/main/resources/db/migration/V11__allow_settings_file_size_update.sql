-- Settings edits overwrite an existing object; keep its displayed byte count accurate.
GRANT UPDATE (size_bytes) ON public.scan_files TO backend_db_user;
