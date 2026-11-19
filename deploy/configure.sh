#!/bin/sh
# Writes deploy/.env on the server. Asks only for the secrets a person must supply (R2 and Atlas keys);
# the database passwords are generated here and never leave the server. Run in your own SSH session.
set -eu
cd "$(dirname "$0")"
if [ -f .env ]; then echo ".env already exists. Remove it first if you really want to start over."; exit 1; fi

ask() { # ask VAR "question" [hidden]
  if [ "${3:-}" = hidden ]; then stty -echo; printf '%s: ' "$2"; read -r value; stty echo; echo
  else printf '%s: ' "$2"; read -r value; fi
  [ -n "$value" ] || { echo "$1 cannot be empty."; exit 1; }
  eval "$1=\$value"
}
random() { tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 40; }

ask DOMAIN "Domain (e.g. app.tenzo.ee)"
ask R2_ENDPOINT "R2 S3 endpoint (https://ACCOUNT_ID.r2.cloudflarestorage.com, without the bucket)"
ask R2_BUCKET_NAME "R2 bucket name"
ask R2_ACCESS_KEY_ID "R2 Access Key ID" hidden
ask R2_SECRET_ACCESS_KEY "R2 Secret Access Key" hidden
ask WLT_API_KEY "World Labs Atlas API key" hidden

umask 077
cat > .env <<EOF
DOMAIN=$DOMAIN
DATABASE_NAME=platform
DATABASE_ADMIN_USERNAME=platform_admin
DATABASE_ADMIN_PASSWORD=$(random)
DATABASE_USERNAME=backend_db_user
DATABASE_PASSWORD=$(random)
R2_ENDPOINT=${R2_ENDPOINT%/}
R2_BUCKET_NAME=$R2_BUCKET_NAME
R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY
WLT_API_KEY=$WLT_API_KEY
EOF
chmod 600 .env
echo "Saved deploy/.env (only root can read it)."
echo "Copy it to your password manager too: cat /opt/platform/deploy/.env"
