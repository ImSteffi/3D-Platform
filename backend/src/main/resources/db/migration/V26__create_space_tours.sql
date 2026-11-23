-- A space's combined 3D tour: its floors' 3DGS joined by teleports the team places. One per space.
-- The whole layout (start point, scenes, teleports) is one JSON document, edited and saved as a whole.
-- public_id is the tour's address, so the space's own id is not needed to open it.
CREATE TABLE public.space_tours (
    tour_request_id BIGINT PRIMARY KEY REFERENCES public.tour_requests(id) ON DELETE CASCADE,
    public_id UUID NOT NULL UNIQUE,
    definition JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.space_tours TO backend_db_user;
