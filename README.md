# Benchline — the joinery operating system

A top-to-bottom operating system for joinery companies: **enquiry → consultation →
quote → check measure → design & sign-off → manufacturing → install → handover →
maintenance**, in one workspace. White-label, deployed one instance per company.
Harrington Kitchens is the first branded deployment.

> **Benchline** is the platform's working name — every brand string is config-driven
> (`src/lib/brand.ts` + per-company `CompanySettings`), so the product name and each
> customer's branding are set without code changes.

The application lives in **[`app/`](app/)** — a Next.js (App Router) + TypeScript +
Prisma + Tailwind app that runs in a safe **demo mode** out of the box (Google/Xero
integrations degrade to activity-log stubs until connected).

## Repository map

| Path | What it is |
|---|---|
| [`PLAN.md`](PLAN.md) | Product & architecture plan — the locked decisions. Read this first. |
| [`BUILD_TASKS.md`](BUILD_TASKS.md) | The ordered, PR-sized execution list that implements the plan. |
| [`app/`](app/) | The application. See [`app/README.md`](app/README.md) for features and setup. |
| [`app/deploy/`](app/deploy/) | One-command VPS install, nginx/pm2/cron, Google & Xero setup guides. |

## Quick start (demo mode)

```bash
cd app
cp .env.example .env
npm install
npx prisma migrate deploy && npx prisma db seed
npm run dev          # http://localhost:3000
```

## Checks

Everything below must pass on every change (this is what CI runs):

```bash
cd app
npm run typecheck && npm run lint && npm test && npm run build
```

---

*Evolved from the JoineryFlow dashboard; see [`PLAN.md`](PLAN.md) §3 for the reuse map.*
