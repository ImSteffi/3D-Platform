-- Admins edit a customer's name, email and password, and remove a customer: their memberships go,
-- and their spaces move to a colleague in the same organization.
GRANT UPDATE (display_name, email, password_hash) ON public.users TO backend_db_user;
GRANT DELETE ON public.organization_memberships TO backend_db_user;
GRANT UPDATE (user_id) ON public.tour_requests TO backend_db_user;
