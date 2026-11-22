-- Every floor plan a floor has had, oldest first, so a replaced or removed plan can be brought back
-- (undo) and the newer one again (redo). The floor's current plan stays in tour_areas.plan_object_key.
CREATE TABLE public.tour_area_plans (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    area_id BIGINT NOT NULL REFERENCES public.tour_areas(id) ON DELETE CASCADE,
    object_key VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tour_area_plans_area_idx ON public.tour_area_plans (area_id, id);

-- The plans floors have today start their history.
INSERT INTO public.tour_area_plans (area_id, object_key)
SELECT id, plan_object_key FROM public.tour_areas WHERE plan_object_key IS NOT NULL;

GRANT SELECT, INSERT, DELETE ON TABLE public.tour_area_plans TO backend_db_user;
