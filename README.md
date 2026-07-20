# Benchline (working name) — the joinery operating system

A top-to-bottom AI platform for joinery companies: enquiry → quote → check measure →
design & sign-off → manufacturing → install → handover → maintenance. White-label,
deployed per company. **Harrington Kitchens** is the first branded deployment.

Built on the proven [JoineryFlow](../Joineryflow) foundation (Next.js · TypeScript ·
Prisma · Tailwind · Claude AI · Google Calendar/Gmail/Drive · Xero).

- **[PLAN.md](PLAN.md)** — product & architecture plan (decisions, stages, data
  model, design language).
- **[BUILD_TASKS.md](BUILD_TASKS.md)** — the ordered execution list for the build
  agent (14 phases, PR-sized tasks with acceptance criteria).

The application code lands in `app/` starting at Phase 0 of the build.
