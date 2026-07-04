# Harrington Kitchens — Operations Dashboard (Demo)

A **mobile-first dashboard for Harrington Kitchens** to schedule kitchen
installations, manage the install team, and keep clients in the loop — with a
client portal, an installer portal with maintenance reports, and Google
automations built in. The app lives in **[`app/`](app/)**.

![status](https://img.shields.io/badge/stack-Next.js%20·%20TypeScript%20·%20Prisma-0d9488)

## The four focus areas

1. **Job scheduling** — jobs flow lead → confirmed → scheduled → in progress →
   completed, with a drag-to-reschedule calendar, today's run sheet, workload
   view and auto-created Google Calendar events.
2. **Installer management** — an *Installers* tab with your team, their weekly
   workload, run sheets and assignments; assign an installer to any job.
3. **Client portal** — every client gets a clean, no-login page showing their
   project's progress tracker, install dates, their installer, sent reports —
   and a one-tap **maintenance request** form that lands back on your dashboard.
4. **Installer portal with maintenance reports** — installers open their own
   run sheet on their phone, get directions, tick off install checklists,
   start/complete jobs, and file branded maintenance-report PDFs from site.

Everything runs in a safe **demo mode** out of the box (no Google account
needed) — calendar/Drive/email steps are logged to each job's activity feed
instead. Connect Google from Settings to turn them on for real.

## Try the demo

```bash
cd app
cp .env.example .env
npm install
npx prisma migrate deploy && npx prisma db seed
npm run dev          # http://localhost:3000
```

Seeded demo data includes 4 installers, 6 clients and 9 kitchen jobs across the
whole lifecycle. Start at the dashboard, then explore:

- **/installers** — the team, workload bars, and per-installer run sheets
- **/portal** — preview the client portal as any seeded client
- **/installer-portal** — preview an installer's run sheet & file a report
- **/calendar** — drag jobs between days
- **/reports** — maintenance reports, including who filed each one

## Docs

- **App docs:** [`app/README.md`](app/README.md)
- **Connect Google:** [`app/deploy/GOOGLE_SETUP.md`](app/deploy/GOOGLE_SETUP.md)
- **Deploy to a VPS (one command):** [`app/deploy/DEPLOY.md`](app/deploy/DEPLOY.md)

---

*Built as a demo for Harrington Kitchens, based on the JoineryFlow dashboard.*
