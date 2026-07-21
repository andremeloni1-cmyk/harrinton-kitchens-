# Benchline — the operating system for joinery companies

Enquiry to handover in one mobile-first workspace: sales, check-measure, design
sign-off, a configurable factory (job board, QR part tracking, capacity
scheduling), install & handover, a client portal, and AI throughout. Fully
**white-label** — set your name, logo and accent and it's your product.

Built with Next.js (App Router) + React, TypeScript, Tailwind, Prisma + SQLite,
with optional Google (Calendar/Drive/Gmail), Xero and Anthropic integrations.

> "Benchline" is the platform's working name. Each deployment brands itself with
> its own company name + logo (Settings, or `APP_NAME`). This repo's first
> deployment is **Harrington Kitchens**.

## What it does

| Area | Highlights |
|------|-----------|
| **Pipeline** | A 13-stage lifecycle (enquiry → consult → quote → deposit → check-measure → design → approval → production → quality → delivery → install → handover → maintenance) with a declarative stage-effect engine (calendar, Drive, email, portal, push). |
| **Sales & client** | Public enquiry form, versioned quote builder with margin/GST and a branded quote-pack PDF, portal quote acceptance with a typed signature, deposit invoicing, consultation booking with clash detection. |
| **Check measure** | On-site structured measure form (offline-tolerant), AI site-sheet reader, discrepancy detection that drafts a variation. |
| **Design & sign-off** | Drawing sets with revisions (draft → sent → approved → released), AI change summaries, portal design review + approval, priced variations that flow into the final invoice. |
| **Factory** | Configurable station board (office + tablet), AI cut-list extraction, **QR part labels + camera scanning**, part-aware progress, QC hold-back and dispatch scan-out gates, **capacity scheduling** (utilisation heat, drag-to-rebalance, live lead-time answers). |
| **Install & handover** | Multi-day crewed install booking (dispatch-gated), an offline installer field run sheet, a snag list (photo → proof), an on-site handover ceremony (signature → pack PDF → final balance invoice). |
| **Client portal** | Per-job milestone timeline with dates + "what's next", curated progress photos, invoices (Xero-synced) with pay links, and a two-way message thread. |
| **AI everywhere** | Role-aware morning briefs, Ask-AI over a live business snapshot, and a weekly risk advisor — all deterministic-first (figures are computed, AI only phrases). |

### Demo mode

Everything works **before** you connect anything. Without Google/Xero/Anthropic
the app runs in *demo mode*: jobs, portals, PDFs, the factory and scheduling all
work locally; calendar/Drive/email/invoice/AI steps degrade gracefully (logged
to the job's activity feed or shown as "unavailable"). Connect integrations in
**Settings** — or during the first-run setup wizard — to turn them on for real.

## Quick start (local)

```bash
cd app
cp .env.example .env          # edit values (see the table below)
npm install
npx prisma migrate deploy     # create the SQLite DB
npx prisma db seed            # templates + demo data (optional)
npm run dev                   # http://localhost:3000
```

Sign in with `OWNER_EMAIL` / `OWNER_PASSWORD`. On a fresh instance the first
sign-in lands on the **setup wizard** (company + brand, stations, integrations,
team, a sample job) — no further env edits needed.

### Environment variables (`.env`)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | `file:./harringtonkitchens.db` for SQLite |
| `APP_URL` | yes | Public base URL; used to build the OAuth redirect URIs |
| `SESSION_SECRET` | yes (prod) | Long random string — `openssl rand -hex 32` |
| `OWNER_EMAIL` | yes | Seeded as the first ADMIN user |
| `OWNER_PASSWORD` | recommended | First admin's password (else the invite/reset flow) |
| `APP_NAME` / `NEXT_PUBLIC_APP_NAME` | white-label | Your product/company name (keep both equal) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for Google | See [deploy/GOOGLE_SETUP.md](deploy/GOOGLE_SETUP.md) |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | for Xero | See [deploy/XERO_SETUP.md](deploy/XERO_SETUP.md) |
| `ANTHROPIC_API_KEY` | for AI | Enables cut-list/measure/summary/Ask-AI features |
| `CRON_SECRET` | for cron | Shared secret for the inbox scan + weekly summary |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | for push | Phone notifications (`npx web-push generate-vapid-keys`) |

Auth is **per-user** (staff sign in with their own email + password; roles gate
access). There is no shared password gate.

## Deploy

One command on a fresh Ubuntu VPS provisions Node, pm2, nginx and TLS:

```bash
sudo DOMAIN=jobs.example.com EMAIL=you@example.com \
     BRAND_NAME="Harrington Kitchens" OWNER_EMAIL=you@example.com \
     bash deploy/install.sh
```

It writes `.env`, bootstraps the admin, builds, starts pm2, and runs
`deploy/smoke.sh` (health + login). See **[deploy/DEPLOY.md](deploy/DEPLOY.md)**,
and **[docs/OPERATIONS.md](../docs/OPERATIONS.md)** for backups, upgrades and the
Postgres path. A per-role walkthrough is in
**[docs/USER_GUIDE.md](../docs/USER_GUIDE.md)**.

## Development

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

CI runs the same on every PR. Money is stored in integer cents in newer domains;
Prisma migrations are additive; new lib logic ships with vitest tests.
