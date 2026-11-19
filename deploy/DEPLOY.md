# Deploying to production

One small Ubuntu server runs everything: the app, its Postgres database and Caddy (HTTPS).
Photos and tours live in Cloudflare R2, not on the server.

Server: UpCloud `thymos-3d-prod`, Helsinki, Ubuntu 24.04, 1 CPU / 2 GB.

## Before the first deploy

1. **Domain:** at the domain provider, add an `A` record for the chosen address (for example
   `app.example.com`) pointing at the server's IPv4 address. Wait until `nslookup app.example.com`
   shows that address.
2. **R2:** a production bucket and an API token limited to that bucket.
3. **Atlas:** a monthly spend limit in the World Labs project.
4. **Passwords:** two long random database passwords and your own owner password, kept in a
   password manager. They go only into `deploy/.env` on the server, never into git or chat.

## 1. Prepare the server (once)

From your computer:

```sh
ssh root@SERVER_IP
```

On the server:

```sh
apt-get update && apt-get -y upgrade
curl -fsSL https://get.docker.com | sh
# Spare memory on disk, so a busy moment does not stop the app.
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
# Only SSH and the web are open.
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
mkdir -p /opt/platform
```

## 2. Send the code (every deploy)

From the repository on your computer (WSL), packing exactly what is committed:

```sh
git archive --format=tar.gz -o /tmp/platform.tar.gz HEAD
scp /tmp/platform.tar.gz root@SERVER_IP:/opt/platform/
ssh root@SERVER_IP 'cd /opt/platform && tar xzf platform.tar.gz && rm platform.tar.gz'
```

## 3. Settings (first deploy only)

On the server:

```sh
cd /opt/platform/deploy
cp .env.example .env
nano .env        # fill in every value, without quotes
chmod 600 .env
```

Keep a copy of the filled-in values in your password manager: with them and the repository the
server can be rebuilt from nothing.

## 4. Start

```sh
cd /opt/platform/deploy
docker compose -f compose.prod.yaml --env-file .env up -d --build
docker compose -f compose.prod.yaml --env-file .env logs -f app   # Ctrl+C to stop watching
```

Wait for `Started BackendApplication`. On the very first start the database also creates the app's
own login and runs every migration. Caddy fetches the HTTPS certificate on its own once the domain
points at the server.

Note: Docker Compose prefers variables already set in the shell over the `.env` file. Run these
commands in a plain SSH session, not one where the app's variables were exported.

## 5. Your owner account (first deploy only)

```sh
cd /opt/platform/deploy
sh create-owner.sh
```

It asks your name, email and a password (at least 12 characters) and makes you admin and owner.
Then sign in at `https://YOUR_DOMAIN`.

## 6. Nightly database backup (once)

```sh
cd /opt/platform/deploy
sh backup.sh                       # try it once by hand; it prints "backup ok"
( crontab -l 2>/dev/null; echo '30 3 * * * /bin/sh /opt/platform/deploy/backup.sh >> /var/log/platform-backup.log 2>&1' ) | crontab -
```

Dumps go to `backups/db/` in the R2 bucket; the last 14 days are kept.

Restore (replaces the current data):

```sh
# Download the dump from R2 first, then:
gunzip -c db-STAMP.sql.gz | docker compose -f compose.prod.yaml --env-file .env exec -T db \
  psql -U "$DATABASE_ADMIN_USERNAME" -d "$DATABASE_NAME"
```

## Later deploys

Step 2 (send the code), then:

```sh
cd /opt/platform/deploy
docker compose -f compose.prod.yaml --env-file .env up -d --build app
```

New migrations run on their own when the app starts. The site is down for the few seconds the app
restarts.

## Checks after a deploy

- `https://YOUR_DOMAIN` opens and you can sign in.
- Users page: create an organization and a person.
- A space: add a floor, a gallery link, upload an iPhone photo through the link.
- Spatial context runs on a floor with photos.
- `docker stats --no-stream`: the app stays well under 1 GB.
