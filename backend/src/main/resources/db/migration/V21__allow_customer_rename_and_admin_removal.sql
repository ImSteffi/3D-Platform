-- Admins rename a customer, and the owner removes another admin.
GRANT UPDATE (name) ON public.organizations TO backend_db_user;
GRANT DELETE ON public.users TO backend_db_user;
