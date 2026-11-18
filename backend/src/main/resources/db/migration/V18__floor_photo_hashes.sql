-- The same image added twice to one floor is kept once: the content hash identifies it.
ALTER TABLE public.floor_photos ADD COLUMN content_hash VARCHAR(64);
CREATE UNIQUE INDEX floor_photos_area_hash_idx ON public.floor_photos(area_id, content_hash);
