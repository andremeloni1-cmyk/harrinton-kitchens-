# Operations handbook

Running a Benchline instance day to day: backups, restores, upgrades, health,
and the path to Postgres. Commands assume the app lives in `app/` and runs under
pm2 (as set up by `deploy/install.sh`).

## Health

- Liveness/readiness: `GET /api/health` → `{ "ok": true, "app": "...", "db": "up" }`.
- Smoke test (health + login): `bash app/deploy/smoke.sh https://your-domain`.
- Process status / logs: `pm2 status`, `pm2 logs`.

## Backups

The database is a single SQLite file: `app/prisma/harringtonkitchens.db`
(plus `-wal`/`-shm` sidecars in WAL mode). Uploaded plans, handover packs and
snag/site photos stored inline live **inside** that file, so backing it up
captures the data too. Drive-hosted files live in the owner's Google Drive.

**Nightly backup (cron):**

```bash
# /etc/cron.daily/benchline-backup  (chmod +x)
#!/usr/bin/env bash
set -euo pipefail
DB=/opt/benchline/app/prisma/harringtonkitchens.db
OUT=/var/backups/benchline
mkdir -p "$OUT"
# .backup is safe while the app is running (consistent snapshot).
sqlite3 "$DB" ".backup '$OUT/benchline-$(date +%F).db'"
find "$OUT" -name 'benchline-*.db' -mtime +30 -delete   # keep 30 days
```

Copy backups off-box (e.g. `rclone` to object storage). Test restores quarterly.

## Restore

```bash
pm2 stop all
cp /var/backups/benchline/benchline-YYYY-MM-DD.db app/prisma/harringtonkitchens.db
rm -f app/prisma/harringtonkitchens.db-wal app/prisma/harringtonkitchens.db-shm
pm2 start all
bash app/deploy/smoke.sh
```

## Upgrades

```bash
cd app
git pull
npm ci
npm run build                  # build first — it no longer migrates, so the old
                               # app keeps serving until the build succeeds
npx prisma migrate deploy      # additive migrations only — never destructive
npm run ensure-admin           # deploy-safety: guarantees an admin login exists
pm2 reload all
bash deploy/smoke.sh
```

`deploy/update.sh` and `deploy/auto-update.sh` wrap this (the latter is wired to
cron by `deploy/setup-autoupdate.sh`). Migrations are additive by policy, so an
in-place upgrade never drops data. Take a backup first regardless.

## Scheduled jobs (cron)

`deploy/setup-cron.sh` installs the inbox scan and the weekly summary. Both call
authenticated endpoints with `x-cron-secret: $CRON_SECRET`:

- Inbox scan — imports builder-sent job leads.
- `POST /api/summary/weekly` — emails the owner the week's numbers **plus the
  risk-watch digest** (capacity overloads, stale approvals, unpaid deposits, …).

## Scaling to Postgres

SQLite comfortably runs a single joinery business. To move to Postgres (multiple
app nodes, heavier concurrency):

1. Provision Postgres; set `DATABASE_URL="postgresql://user:pass@host:5432/db"`.
2. In `prisma/schema.prisma` set `datasource db { provider = "postgresql" }`.
3. Re-baseline migrations for Postgres in a staging environment
   (`prisma migrate dev`) and verify against a copy of your data.
4. Migrate the data (e.g. `pgloader sqlite://…/harringtonkitchens.db postgresql://…`),
   then `prisma migrate deploy` and run the smoke test.

Keep SQLite in production until you've rehearsed the cutover on staging.

## Security notes

- `.env` is `chmod 600`; it holds `SESSION_SECRET`, OAuth secrets and API keys.
- Auth is per-user; deactivating a user bumps their credential epoch and ends
  their sessions immediately.
- Client and installer portals use their own tokened links, separate from staff
  auth.
