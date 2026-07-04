# Harrington Kitchens — Operations Dashboard

A mobile-first dashboard to **schedule kitchen installations, manage installers
and keep clients updated from your phone**, with Google automations built in.

Built with Next.js, TypeScript, Tailwind CSS, Prisma + SQLite, and the Google
APIs (Calendar, Drive, Gmail).

## What it does

| # | Feature | How |
|---|---------|-----|
| 1 | **Job scheduling** | Jobs flow lead → confirmed → scheduled → in progress → completed. Drag on the calendar to reschedule; accepting a job creates a Google Calendar event with the client, address and document links. |
| 2 | **Installer management** | The *Installers* tab lists the team with weekly workload bars and run sheets. Assign an installer on any job — their name shows on job cards, the calendar and the client portal. |
| 3 | **Client portal** (`/portal`) | Each client gets a no-login page: progress tracker per project, install dates, who their installer is, sent report PDFs, and a maintenance-request form that lands on the dashboard as a job to confirm. |
| 4 | **Installer portal** (`/installer-portal`) | Installers open their run sheet on their phone: today's jobs, directions, site contact, install checklists, start/complete actions — and they file the branded maintenance-report PDF from site (recorded against their name). |
| 5 | **Maintenance reports per job** | Fill out a report (rooms, checklists, sign-off signature), generate a branded PDF, save it to Drive and email it to the client in one tap. |
| 6 | **Automations** | Accept / move / cancel each send a templated email from your Gmail; job PDFs from email are filed to Drive; incoming jobs from trusted builder senders appear as leads to approve. |

### Demo mode

The app is fully usable **before** you connect Google. Until then it runs in
*demo mode*: jobs, scheduling, portals, reports and PDF generation all work
locally; the calendar/Drive/email steps are logged to each job's activity feed
instead of being pushed to Google. Connect Google in **Settings** to turn them
on for real — no code changes needed.

## Quick start (local)

```bash
cd app
cp .env.example .env          # edit values (see below)
npm install
npx prisma migrate deploy     # create the SQLite DB
npx prisma db seed            # templates + kitchen demo data
npm run dev                   # http://localhost:3000
```

The seed creates 4 installers, 6 clients and 9 kitchen jobs across the
lifecycle, including a sent maintenance report and a portal maintenance
request waiting to be confirmed.

### Environment variables (`.env`)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | `file:./harringtonkitchens.db` for SQLite |
| `APP_URL` | yes | Public base URL; used to build the OAuth redirect |
| `OWNER_EMAIL` | yes | The single owner account |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for Google | From Google Cloud Console — see [deploy/GOOGLE_SETUP.md](deploy/GOOGLE_SETUP.md) |
| `APP_PASSWORD` | optional | Enables a password gate on the admin dashboard (the client & installer portals stay reachable via their own links) |
| `SESSION_SECRET` | yes | Long random string (`openssl rand -hex 32`) |

> **Demo note:** the installer portal reuses the admin job APIs, so run the
> demo without `APP_PASSWORD`. Production hardening would give each portal its
> own tokened links, like the client portal's per-client URLs.

## Connecting Google

1. Follow **[deploy/GOOGLE_SETUP.md](deploy/GOOGLE_SETUP.md)** to create OAuth
   credentials and enable the Calendar, Drive and Gmail APIs.
2. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and restart.
3. Open **Settings → Connect Google account**.

## Deploying to a VPS

See **[deploy/DEPLOY.md](deploy/DEPLOY.md)**. On a fresh Ubuntu VPS it's one command:

```bash
sudo DOMAIN=jobs.yourdomain.com EMAIL=you@yourdomain.com bash deploy/install.sh
```

This installs Node, builds the app, runs it under pm2, and sets up nginx + free
HTTPS via Let's Encrypt.

## Project layout

```
app/
  prisma/schema.prisma     data model (jobs, installers, clients, reports, templates)
  src/app/                 pages (dashboard, calendar, installers, job detail, settings)
  src/app/portal/          client portal (per-client progress + maintenance requests)
  src/app/installer-portal/ installer portal (run sheets + maintenance reports)
  src/app/api/             REST API + automations + Google OAuth
  src/lib/google/          Calendar / Drive / Gmail / OAuth wrappers (demo-safe)
  src/lib/automations.ts   the status-change & reschedule orchestration
  src/lib/pdf.ts           maintenance-report PDF generation (pdf-lib)
  src/components/          UI components
  deploy/                  VPS install + nginx + pm2 + docs
```

## Scripts

| Command | Does |
|---------|------|
| `npm run dev` | Dev server |
| `npm run build` | Migrate + production build |
| `npm start` | Run the production build |
| `npm run typecheck` | TypeScript check |
| `npm run db:seed` | Seed templates + demo data |
