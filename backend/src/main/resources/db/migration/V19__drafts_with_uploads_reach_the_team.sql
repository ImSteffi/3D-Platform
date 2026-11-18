-- There is no send button any more: a space reaches the team with its first plan or photo.
-- Spaces that got uploads before that change are moved on the same way.
UPDATE public.tour_requests t SET status = 'SUBMITTED'
WHERE t.status = 'DRAFT'
  AND EXISTS (
    SELECT 1 FROM public.tour_areas a
    WHERE a.tour_request_id = t.id
      AND (a.plan_object_key IS NOT NULL OR EXISTS (SELECT 1 FROM public.floor_photos p WHERE p.area_id = a.id))
  );
