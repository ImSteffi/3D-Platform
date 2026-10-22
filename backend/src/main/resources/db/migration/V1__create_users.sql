CREATE TABLE public.users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE
);

GRANT SELECT ON TABLE public.users TO backend_db_user;