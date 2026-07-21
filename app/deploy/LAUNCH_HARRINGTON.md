# Launch checklist — Harrington Kitchens

Harrington Kitchens is the first production deployment of the Benchline platform.
This is the end-to-end runbook to stand it up. Everything works in **demo mode**
first, so you can complete the whole checklist and rehearse before connecting
Google/Xero or going live on a domain.

## 1. Provision & brand

- [ ] Point a DNS A record for the domain at the VPS.
- [ ] Copy `deploy/harrington.env.example` → `app/.env` and fill `SESSION_SECRET`
      and `OWNER_EMAIL` (the rest can stay blank for demo mode).
- [ ] Deploy:
      ```bash
      sudo DOMAIN=jobs.harringtonkitchens.com.au EMAIL=office@harringtonkitchens.com.au \
           BRAND_NAME="Harrington Kitchens" OWNER_EMAIL=office@harringtonkitchens.com.au \
           bash deploy/install.sh
      ```
      This white-labels the chrome to **Harrington Kitchens**, bootstraps the
      admin, builds, starts pm2, and runs the smoke test (health + login).

## 2. First-run wizard (sign in as the owner)

- [ ] Company name **Harrington Kitchens** and brand **accent** (their brand colour).
- [ ] Upload the **logo** (Settings → Branding) — light and dark variants.
- [ ] Confirm the **station line** (Programming → Cutting → Edging → Assembly →
      Finishing → QC → Dispatch); adjust names/hours per their workshop.
- [ ] Connect **Google** and **Xero** when their accounts are ready (skippable now).
- [ ] Invite the **team** with roles: office, designers, factory, installers.

## 3. Import their data

- [ ] **Price list** — put their rate sheet at `scripts/data/harrington-prices.json`
      and import it:
      ```bash
      node scripts/import-prices.mjs scripts/data/harrington-prices.json harrington
      ```
- [ ] **Clients** — add existing clients (or let them arrive via the enquiry form
      and portal invites). Xero contacts link on first invoice push.

## 4. Verify end-to-end (demo mode)

- [ ] `bash deploy/smoke.sh https://jobs.harringtonkitchens.com.au` passes.
- [ ] The **login page and header read "Harrington Kitchens"** (brand applied).
- [ ] Walk one job **enquiry → handover**: create an enquiry, quote + accept
      (deposit drafts), book a check-measure, add a drawing + approve, release to
      the factory, scan parts through the line, book an install, raise + resolve a
      snag, run handover (pack PDF + final invoice), and confirm the **client
      portal** shows the timeline, photos, invoices and messages.
- [ ] Confirm role homes: office dashboard (brief + Ask AI), factory board/tablet,
      installer field run sheet.

## 5. Go live

- [ ] Set real `GOOGLE_*` / `XERO_*` / `ANTHROPIC_API_KEY` and reconnect in Settings.
- [ ] Owner changes their password; deactivate the demo/sample data.
- [ ] Turn on backups and auto-update (`deploy/setup-cron.sh`,
      `deploy/setup-autoupdate.sh`) — see [../../docs/OPERATIONS.md](../../docs/OPERATIONS.md).
