#!/bin/sh
# Nightly database backup to R2 (cron runs it; see DEPLOY.md). Keeps the last 14 days.
# Uses the R2 keys from deploy/.env; the dump goes under backups/db/ in the same bucket.
set -eu
cd "$(dirname "$0")"
set -a; . ./.env; set +a

STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
FILE="/tmp/db-$STAMP.sql.gz"
docker compose -f compose.prod.yaml --env-file .env exec -T db \
  pg_dump -U "$DATABASE_ADMIN_USERNAME" -d "$DATABASE_NAME" --no-owner | gzip > "$FILE"

s3() {
  docker run --rm -v /tmp:/tmp \
    -e AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" -e AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    -e AWS_DEFAULT_REGION=auto amazon/aws-cli:2.17.0 --endpoint-url "$R2_ENDPOINT" s3 "$@"
}

s3 cp "$FILE" "s3://$R2_BUCKET_NAME/backups/db/$(basename "$FILE")" --only-show-errors
rm -f "$FILE"

# Drop backups older than 14 days.
CUTOFF=$(date -u -d '14 days ago' +%Y-%m-%d)
s3 ls "s3://$R2_BUCKET_NAME/backups/db/" | awk '{print $4}' | while read -r name; do
  day=$(echo "$name" | sed -n 's/^db-\([0-9-]*\)T.*/\1/p')
  if [ -n "$day" ] && [ "$day" \< "$CUTOFF" ]; then
    s3 rm "s3://$R2_BUCKET_NAME/backups/db/$name" --only-show-errors
  fi
done
echo "backup ok: $STAMP"
