#!/usr/bin/env bash
# Replaces this computer's local data with a copy of production's: the database and the stored files
# (plans, photos, spatial contexts, 3DGS files, voxels). One way only: production is only read, never changed.
#
# Run from WSL in the project folder:   bash scripts/pull-prod.sh
# Needs: the local database running (docker compose up -d db), the project's .env, Docker, and SSH access to the server
# (from WSL it uses Windows' ssh.exe, so your Windows key works; set SSH=ssh to use WSL's own).
#
# What it does:
# 1. stops if production's database is newer than this code (pull the latest code first);
# 2. backs up the local data to .dev/backups/ (the last 3 are kept);
# 3. copies production's database over the local one (schema stays local; data only);
# 4. mirrors production's files: on the server into /root/prod-files (with the server's own keys), from there to this
#    computer, and from here into the local bucket (with the local keys). Only new or changed files travel after the first run;
#    files gone from production are removed locally too;
# 5. re-adds the local test admin (.dev/dev-admin.txt) and stops copied runs that were still working at Atlas, so this
#    computer never follows production's Atlas runs.
set -euo pipefail

SERVER=${PROD_SERVER:-root@94.237.115.186}
SSH=${SSH:-ssh.exe}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
MIRROR=${PROD_MIRROR:-$HOME/.cache/tenzo-prod-files}
BACKUPS=$ROOT/.dev/backups
RCLONE_IMAGE=rclone/rclone:1.68
cd "$ROOT"
set -a; . ./.env; set +a

local_sql() { docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -q -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }
prod() { "$SSH" -o BatchMode=yes "$SERVER" "$@"; }
step() { printf '\n== %s\n' "$1"; }

step "1/5 Checking that this code is not behind production"
PROD_VERSION=$(prod "cd /opt/platform/deploy && docker compose -f compose.prod.yaml --env-file .env exec -T db sh -c 'psql -At -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"select max(version::int) from flyway_schema_history where success\"'" | tr -d '\r')
LOCAL_VERSION=$(echo "select max(version::int) from flyway_schema_history where success;" | local_sql)
echo "production database: V$PROD_VERSION, local: V$LOCAL_VERSION"
if [ "$PROD_VERSION" -gt "$LOCAL_VERSION" ]; then
  echo "Production's database is newer than this code. Pull the latest code and start the backend once, then run this again." >&2
  exit 1
fi

step "2/5 Backing up the local data"
mkdir -p "$BACKUPS"
BACKUP="$BACKUPS/local-$(date +%Y%m%d-%H%M%S).sql"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --data-only --exclude-table=flyway_schema_history' > "$BACKUP"
echo "saved $BACKUP ($(du -h "$BACKUP" | cut -f1))"
ls -1t "$BACKUPS"/local-*.sql | tail -n +4 | xargs -r rm --

step "3/5 Copying production's database"
DUMP=$(mktemp)
trap 'rm -f "$DUMP"' EXIT
prod "cd /opt/platform/deploy && docker compose -f compose.prod.yaml --env-file .env exec -T db sh -c 'pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --data-only --exclude-table=flyway_schema_history'" > "$DUMP"
TABLES=$(echo "select string_agg(quote_ident(tablename), ',') from pg_tables where schemaname = 'public' and tablename <> 'flyway_schema_history';" | local_sql)
{ echo "SET session_replication_role = replica;"; echo "TRUNCATE $TABLES RESTART IDENTITY CASCADE;"; tr -d '\r' < "$DUMP"; } | local_sql > /dev/null
echo "users: $(echo 'select count(*) from users;' | local_sql), spaces: $(echo 'select count(*) from tour_requests;' | local_sql), floors: $(echo 'select count(*) from tour_areas;' | local_sql)"

step "4/5 Mirroring production's files"
# On the server, with the server's own keys: production's bucket into /root/prod-files.
prod 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/platform/deploy
set -a; . ./.env; set +a
mkdir -p /root/prod-files
docker run --rm -v /root/prod-files:/data -e RCLONE_CONFIG_P_TYPE=s3 -e RCLONE_CONFIG_P_PROVIDER=Cloudflare \
  -e RCLONE_CONFIG_P_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" -e RCLONE_CONFIG_P_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  -e RCLONE_CONFIG_P_ENDPOINT="$R2_ENDPOINT" rclone/rclone:1.68 sync "p:$R2_BUCKET_NAME" /data --transfers 16 2>&1 | grep -v NOTICE || true
echo "server copy: $(du -sh /root/prod-files | cut -f1), $(find /root/prod-files -type f | wc -l) files"
REMOTE
# From the server to this computer: only what changed.
mkdir -p "$MIRROR"
rsync -a --delete -e "$SSH -o BatchMode=yes" "$SERVER:/root/prod-files/" "$MIRROR/"
echo "local copy: $(du -sh "$MIRROR" | cut -f1)"
# Into the local bucket, with the local keys.
docker run --rm -v "$MIRROR":/data:ro -e RCLONE_CONFIG_L_TYPE=s3 -e RCLONE_CONFIG_L_PROVIDER=Cloudflare \
  -e RCLONE_CONFIG_L_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" -e RCLONE_CONFIG_L_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  -e RCLONE_CONFIG_L_ENDPOINT="$R2_ENDPOINT" -e RCLONE_CONFIG_L_NO_CHECK_BUCKET=true \
  "$RCLONE_IMAGE" sync /data "l:$R2_BUCKET_NAME" --transfers 16 2>&1 | grep -v NOTICE || true
echo "local bucket matches production"

step "5/5 Local fixes"
# Runs copied mid-way belong to production: this computer must not follow them at Atlas.
local_sql <<'SQL'
UPDATE spatial_context_runs SET status = 'FAILED', finished_at = now(), error = 'Copied from production while still running.' WHERE status = 'RUNNING';
UPDATE splat_runs SET status = 'FAILED', phase = NULL, finished_at = now(), error = 'Copied from production while still running.' WHERE status = 'RUNNING';
SQL
# The local test admin (never on production): back with the same password.
if [ -f .dev/dev-admin.txt ]; then
  EMAIL=$(sed -n 's/^email=//p' .dev/dev-admin.txt)
  PASSWORD=$(sed -n 's/^password=//p' .dev/dev-admin.txt)
  HASH="{bcrypt}$(htpasswd -bnBC 10 "" "$PASSWORD" | tr -d ':\n' | sed 's/^\$2y/$2a/')"
  local_sql <<SQL
INSERT INTO users (password_hash, is_platform_admin, display_name, email) VALUES ('$HASH', true, 'Dev Admin', '$EMAIL')
ON CONFLICT ((lower(email))) DO UPDATE SET password_hash = excluded.password_hash, is_platform_admin = true;
SQL
  echo "test admin $EMAIL is back"
fi
printf '\nDone. Local now has production'"'"'s data. Sign in again (sessions were reset); production logins work here too.\n'
