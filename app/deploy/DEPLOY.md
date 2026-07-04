# Deploying Harrington Kitchens to Hostinger

Harrington Kitchens is a Node.js (Next.js) app, so it needs a **Hostinger VPS** — not
shared hosting. Any small plan (1 vCPU / 1 GB RAM) is plenty.

## Before you start

1. **A VPS** running Ubuntu 22.04 or 24.04 (Hostinger → VPS → choose Ubuntu).
2. **A subdomain** pointed at the VPS: in Hostinger DNS add an `A` record, e.g.
   `jobs` → your VPS IP. (Let's Encrypt needs this to issue a certificate.)
3. **Google OAuth credentials** — see [GOOGLE_SETUP.md](GOOGLE_SETUP.md). You can
   deploy first and add these later; the app runs in demo mode until then.

## One-command install

SSH into the VPS as root and run:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/andremeloni1-cmyk/harrinton-kitchens-.git
cd harrinton-kitchens-/app
sudo DOMAIN=jobs.yourdomain.com EMAIL=you@yourdomain.com bash deploy/install.sh
```

> **Private repo?** `git clone` over HTTPS will ask for credentials — use a
> GitHub fine-grained personal access token (repo → Contents: read) as the
> password, or make the repo public for the demo.
>
> **Deploying a branch** (e.g. before the demo PR is merged): add
> `-b <branch-name>` to the `git clone` line. The updater scripts follow
> whatever branch the checkout tracks.

The script will:

1. Install Node.js 20, nginx, pm2 and certbot.
2. Create `.env` (with a random `SESSION_SECRET`) — **edit it** to add your
   Google credentials and `OWNER_EMAIL`, then re-run the script.
3. Install dependencies, run database migrations and seed default email templates.
4. Build the app and start it under pm2 (auto-restart on boot/crash).
5. Configure nginx as a reverse proxy and request a free HTTPS certificate.
6. Lock the firewall down to SSH + HTTP/HTTPS.

When it finishes, open `https://jobs.yourdomain.com` on your phone and add it to
your home screen (it's a PWA — it behaves like an app).

## Finishing Google setup

1. Edit `app/.env` on the server:
   ```env
   GOOGLE_CLIENT_ID="..."
   GOOGLE_CLIENT_SECRET="..."
   OWNER_EMAIL="you@yourdomain.com"
   ```
2. Make sure the Google redirect URI is
   `https://jobs.yourdomain.com/api/auth/google/callback`.
3. `pm2 reload harringtonkitchens` then **Settings → Connect Google account**.

## Enable automatic inbox checking (incoming job leads)

Emails from trusted senders (managed in **Settings → Incoming jobs**) become job
leads to approve. To have the app check the inbox automatically every 15 minutes:

```bash
cd /root/harrinton-kitchens-/app && sudo bash deploy/setup-cron.sh
```

This generates a `CRON_SECRET`, restarts the app, and installs a cron entry. You
can always trigger a check by hand with **Check inbox for new jobs** on the Jobs
screen.

## Updating later

```bash
cd /root/harrinton-kitchens-/app && sudo bash deploy/update.sh
```

Pulls the latest code, migrates, rebuilds and reloads with zero config changes.

## Automatic updates (~1 minute after a push)

To skip the manual step entirely, install the auto-updater once:

```bash
cd /root/harrinton-kitchens-/app && sudo bash deploy/setup-autoupdate.sh
```

Every minute the server does a cheap `git fetch`; when a new commit lands on
the deployed branch it backs up the database (last 14 kept in
`app/prisma/backups/`), pulls, migrates, rebuilds and reloads — typically live
within a minute or two of the push. Notes:

- Watch it work: `tail -f /var/log/harringtonkitchens-autoupdate.log`
- If a deploy fails it retries each minute; after 5 failures on the same
  commit it stops and waits for a fixed commit. The running app keeps serving
  the previous build throughout — nothing changes until the final
  `pm2 reload`.
- It deploys whatever branch the server checkout tracks — push to that branch
  (or merge a PR into it) to ship.

## Operations cheat-sheet

| Task | Command |
|------|---------|
| App status / logs | `pm2 status` · `pm2 logs harringtonkitchens` |
| Restart | `pm2 reload harringtonkitchens` |
| nginx reload | `nginx -t && systemctl reload nginx` |
| Renew TLS (auto, but force) | `certbot renew` |
| Back up data | copy `app/prisma/harringtonkitchens.db` somewhere safe |

## Backups

All data lives in the single SQLite file `app/prisma/harringtonkitchens.db`. A simple
nightly backup:

```bash
mkdir -p /root/backups
(crontab -l 2>/dev/null; echo '0 2 * * * cp /root/harrinton-kitchens-/app/prisma/harringtonkitchens.db /root/backups/harringtonkitchens-$(date +\%F).db') | crontab -
```

(The parentheses keep any existing cron entries — the inbox scan and
auto-updater — instead of replacing the whole crontab.)

The auto-updater also snapshots the database into `app/prisma/backups/`
right before every deploy.

## Optional: password gate

For a little extra protection on a public URL, set `APP_PASSWORD` in `.env` and
reload. You'll get a login screen; the session lasts 30 days per device.
