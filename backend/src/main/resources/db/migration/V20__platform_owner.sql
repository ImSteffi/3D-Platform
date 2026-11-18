-- One owner among the platform admins: the first admin. Only the owner adds or removes other admins,
-- and the owner can never be removed.
ALTER TABLE users ADD COLUMN is_owner BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET is_owner = TRUE
 WHERE id = (SELECT MIN(id) FROM users WHERE is_platform_admin);
