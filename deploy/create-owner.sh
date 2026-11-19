#!/bin/sh
# Creates the first account: platform admin AND owner (the one who adds and removes admins).
# Run once after the first start. Asks for the password; it is never shown or stored in plain text.
set -eu
cd "$(dirname "$0")"
set -a; . ./.env; set +a

printf 'Your name: '; read -r NAME
printf 'Your email: '; read -r EMAIL
stty -echo; printf 'Password (at least 12 characters): '; read -r PASS; stty echo; echo
stty -echo; printf 'Password again: '; read -r PASS2; stty echo; echo
[ "$PASS" = "$PASS2" ] || { echo "The passwords differ."; exit 1; }
[ ${#PASS} -ge 12 ] || { echo "Use at least 12 characters."; exit 1; }

# bcrypt with the {bcrypt} prefix: the format the app stores and checks.
HASH="{bcrypt}$(docker run --rm httpd:2.4-alpine htpasswd -nbBC 10 "" "$PASS" | tr -d ':\n' | sed 's/^\$2y\$/$2a$/')"

docker compose -f compose.prod.yaml --env-file .env exec -T db \
  psql -v ON_ERROR_STOP=1 -U "$DATABASE_ADMIN_USERNAME" -d "$DATABASE_NAME" \
  -v name="$NAME" -v email="$(echo "$EMAIL" | tr 'A-Z' 'a-z')" -v hash="$HASH" <<'SQL'
INSERT INTO users (display_name, email, password_hash, is_platform_admin, is_owner)
VALUES (:'name', :'email', :'hash', TRUE, TRUE);
SELECT id, email, is_platform_admin, is_owner FROM users WHERE email = :'email';
SQL
echo "Owner created. Sign in at https://$DOMAIN"
