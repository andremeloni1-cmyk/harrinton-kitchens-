# Plan — The Joinery Platform (working name: Benchline)

A top-to-bottom AI operating system for joinery companies: **enquiry → consultation →
quote → check measure → design & sign-off → manufacturing → install → handover →
maintenance**. White-label, deployed per company. Harrington Kitchens is the first
branded deployment.

This document is the product/architecture plan. The ordered execution list for the
build agent is in [BUILD_TASKS.md](BUILD_TASKS.md).

---

## 1. Locked decisions

These were confirmed with the owner and are not up for re-litigation during the build:

1. **Base**: fork JoineryFlow (`Joineryflow` repo, `app/`) into this repo and evolve it.
   Its AI layer, Google (Calendar/Gmail/Drive) + Xero integrations, invoicing, PDF
   generation, PWA shell, and deploy tooling are proven — reuse, don't rewrite.
2. **Product shape**: white-label, **one deployment per company** (VPS, one-command
   install), not a shared multi-tenant SaaS. So: no tenant keys on rows; "tenancy" is
   the instance. Productization = repeatable installer + config-driven branding.
3. **Scope**: all five pipeline stages ship in v1, built in the phase order below.
4. **Users**: real per-user accounts with roles (admin, office/sales, designer,
   factory, installer) **plus a client portal** (quote approval, design sign-off,
   progress, payments, documents).
5. **Design stage**: manage CAD *output*, not CAD itself — drawing sets, revisions,
   client sign-off, release-to-factory locking. No in-app CAD, no structured CAD
   importer.
6. **Factory depth**: the full stack — job-stage board → part/cabinet-level tracking
   with QR labels → production scheduling with station capacity planning. Built in
   that order (each layer works without the next).
7. **Part data source**: **AI extraction from CAD-exported cut-list/job PDFs**
   (Claude, with a mandatory human review screen), so the product works with any CAD
   package. Manual entry is the fallback, never the primary path.
8. **Team size target**: 5–15 people per company. Roles and crew scheduling sized for
   that; no approval-chain bureaucracy.
9. **Payments**: invoices raised in-app → pushed to Xero → portal surfaces Xero's
   online payment link. No Stripe, no new payment rails.
10. **Identity**: new product name (proposals in §2); fresh design language (§8);
    per-company branding (logo, accent colour, name) is config, applied everywhere
    including client-facing surfaces.

## 2. Product name

Owner chose "new name" but hasn't picked one. Branding must be **config-driven**
(`CompanySettings` + a platform-level `BRAND` constant) so the name never blocks the
build. Working name in code and docs: **Benchline**.

Proposals (pick any time; a one-line config change):

- **Benchline** *(recommended)* — the joiner's bench meets the production line.
- **Datum** — the reference line every set-out starts from.
- **Millrun** — the job's run through the mill.
- **JoineryOS** — descriptive, does what it says.

## 3. What we inherit from JoineryFlow (reuse map)

| JoineryFlow asset | Reused as |
|---|---|
| `lib/vision.ts` + `*-ai.ts` modules (Claude, injection-hardened, JSON-schema output) | The AI foundation; new extractors follow the exact same pattern |
| Google OAuth/Calendar/Gmail/Drive libs (`lib/google/`), demo-mode degradation, encrypted tokens | Unchanged core; calendar extended to multi-crew |
| Xero libs (`lib/xero/`) — invoices, spend money, P&L, contacts | Unchanged; progress-claim invoices added on top |
| `lib/automations.ts` status-change orchestration | Generalised to the new pipeline-stage model |
| Invoicing, expenses/receipts (AI GST extraction), price list, quotes, BAS/P&L | Carried over as the Money module |
| `lib/pdf.ts` (pdf-lib, branded A4) | Extended: quote packs, handover packs, QR labels |
| Push notifications, weekly digest, daily brief (hallucination-guarded) | Carried over, made role-aware |
| PWA shell, offline bar, pull-to-refresh, bottom sheets, dictation, photo upload, signature pad | Carried over into the new design system |
| Deploy tooling (`deploy/install.sh`, pm2, nginx, certbot, cron, backups) | Evolved into the white-label installer |
| CI (`typecheck → lint → test → migrate → seed → build`) | Kept green from Phase 0 onward |

**What JoineryFlow does NOT have** (the new build): per-user auth & roles, client
portal, check-measure module, drawing/revision/sign-off module, the entire factory
module, install/snag/handover module, variations, multi-crew scheduling, the new
design language.

## 4. Architecture decisions

- **Stack**: unchanged — Next.js (App Router) + TypeScript + Tailwind v4 (CSS-first
  tokens) + Prisma. **SQLite (WAL) stays** for v1: a 5–15 person company on a single
  pm2 process is comfortably inside SQLite's envelope, and it preserves the
  one-command install. Keep Prisma portable (no SQLite-only raw SQL) and document the
  Postgres upgrade path.
- **Entity naming**: keep the `Job` model as the spine (renaming to `Project` across
  the codebase is a huge diff for zero behaviour). A job now carries a
  `pipelineStage` spanning the whole journey. UI may say "project"; code says job.
- **Auth**: replace the single shared password with a `User` table (scrypt hashes,
  per-user credential epoch in the session cookie — same proven cookie design,
  per-user). Roles: `ADMIN`, `OFFICE`, `DESIGNER`, `FACTORY`, `INSTALLER`. Client
  portal access is **separate**: magic-link tokens scoped to one client's jobs, no
  password to manage.
- **`Account` → `CompanySettings`**: the existing singleton keeps integrations
  (Google/Xero tokens), branding, working hours. User identity moves out of it.
- **Four surfaces, one app**: office (desktop-first), factory (tablet,
  big-touch-target station views), field (installer/check-measure phone), client
  portal (`/portal`, own layout, own auth). One codebase, one deploy; layouts and
  navigation differ by role.
- **AI**: Anthropic only, `ANTHROPIC_MODEL` env-configurable. Every new extractor
  copies the house pattern: untrusted-content framing, JSON-schema outputs, refusal
  guard, typed fallback, mandatory human review before anything is committed, and
  deterministic-first composition for anything with numbers in it (the daily-brief
  rule: AI may reword, never invent).
- **Scheduling**: production scheduling is **deterministic capacity math**
  (station hours vs. booked hours) with AI as an advisor ("what's at risk this
  week"), never a black-box optimiser silently moving work.

## 5. The pipeline (stage model)

`Job.pipelineStage`:
`ENQUIRY → CONSULT → QUOTE → DEPOSIT → CHECK_MEASURE → DESIGN → APPROVAL →
PRODUCTION → QUALITY → DELIVERY → INSTALL → HANDOVER → MAINTENANCE`
(plus `LOST`/`CANCELLED`). Stage transitions run through the automations layer
(calendar, Drive filing, client emails/portal events, notifications) exactly as
JoineryFlow's status changes do today. The old `status` field maps onto this and is
migrated.

### Stage 1 — Client experience & sales
Enquiry intake from email (existing AI reader) **plus** a public enquiry form and
AI Capture (photo/note) for showroom walk-ins. CRM: clients, contacts, enquiry
source tracking. Consultation booking → calendar. Quote builder on the existing
price-list + AI line suggestion engine, output as a branded quote pack PDF; sent to
the **portal for e-acceptance** (signature + timestamp + IP), deposit invoice
auto-raised on acceptance via Xero.

### Stage 2 — Site check measure
Site visits scheduled to a crew/person calendar. On-site (phone, offline-capable):
structured check-measure form (rooms → walls/openings/services with dimensions),
photo capture with annotations, dictated notes, and **AI read of scribbled site
sheets** (photo of paper notes/sketch → structured measurements, review screen).
Output: a check-measure record attached to the job, flagged discrepancies vs. quote
assumptions, and an automatic prompt to raise a **variation** if scope changed.

### Stage 3 — Design & drawings
Drawing sets with revisions (files from any CAD → PDF/render uploads). Each revision:
status `draft → sent → approved → released`, AI summary of what changed between
revisions, internal review then **client sign-off in the portal** (view, comment,
approve with signature). Approval **locks the revision** and releases it to the
factory; post-approval changes force a new revision + variation. Variations carry
their own pricing and portal approval.

### Stage 4 — Manufacturing
Three layers, shipped in order:
1. **Job board**: configurable stations (default: Programming → Cutting → Edging →
   Assembly → Finishing → QC → Dispatch). Factory tablet view: today's jobs per
   station, big touch targets, per-stage checklists, photos, blocker flags (blocked
   jobs ping the office).
2. **Parts**: designer uploads the CAD cut-list/job PDF → Claude extracts cabinets,
   parts, materials, hardware → review/edit screen → parts created. QR label sheet
   PDF per job; scanning a label at a station moves that cabinet/part forward.
   Job progress becomes % of parts through each station.
3. **Production scheduling**: station capacity (hours/day) vs. booked work,
   drag-to-rebalance weekly board, delivery-date feasibility on every job, and a
   lead-time answer for sales ("earliest install for a new job of size X").

### Stage 5 — Install & handover
Install bookings (multi-day, crew-assigned) on the shared calendar; installer phone
view: run sheet, drawings (approved revision only), gate codes, client contacts,
navigate links. **Snag list**: photo + note per defect, assigned, tracked to closure;
client sees resolution progress in the portal. Completion: client signs off on the
installer's phone → **handover pack** PDF (approved drawings, care instructions,
warranty terms, snag closure) generated, filed to Drive, emailed and published to the
portal → final invoice raised. Maintenance: warranty requests arrive via the portal,
become maintenance jobs (JoineryFlow's report module already covers the visit
report).

### The client portal (built incrementally alongside stages)
Magic-link login → their project(s): live stage timeline, quote acceptance, design
review/sign-off, variation approvals, progress photos (factory + install), documents,
invoices with Xero pay links, message thread with the office. Every client-visible
event can also go out as email — the portal augments, never replaces, email.

## 6. AI feature matrix

| Existing (carried over) | New |
|---|---|
| Email/PDF/image → job leads | Cut-list PDF → cabinets/parts/hardware (the factory feed) |
| AI Capture (photo/note → leads) | Site-sheet photo → structured check-measure data |
| Receipt → expense w/ GST | Drawing revision diff summaries |
| Rate-card estimate & invoice line suggestions | Variation drafting from site/design notes |
| Report drafting, todo drafting | Snag detection aid from install photos (suggest, never auto-commit) |
| Email thread summaries | Production risk advisor (deterministic schedule + AI narrative) |
| Ask AI (business snapshot Q&A) | Ask AI extended over the full pipeline incl. factory + installs |
| Daily brief (guarded rephrase) | Role-aware briefs: office / factory lead / installer variants |

## 7. Data model — additions & changes (Prisma)

- **Changed**: `Account` → `CompanySettings` (integrations, branding, hours; identity
  removed). `Job` gains `pipelineStage`, `installStart/End`, crew + designer
  assignment, `depositInvoiceId`, `checkMeasureId`.
- **New (auth)**: `User` (role, scrypt hash, epoch, active), `Invite`,
  `ClientPortalToken` (magic-link, scoped to client).
- **New (sales)**: `Quote` (versioned, lineItems JSON cents, status, acceptance
  signature/timestamp/IP), `Variation` (pricing, status, approval).
- **New (measure)**: `SiteVisit` (type: consult|check_measure|install, crew, times),
  `CheckMeasure` (rooms/dimensions JSON, photos, discrepancies).
- **New (design)**: `DrawingSet`, `DrawingRevision` (files via existing `Document`,
  status, aiChangeSummary, approval link), `Approval` (polymorphic: quote | revision
  | variation | handover; token, signature, signedAt, ip).
- **New (factory)**: `Station` (name, order, hoursPerDay), `Cabinet`, `Part`
  (cabinet-linked, material, dims, qrCode, currentStationId), `StationEvent`
  (part/cabinet × station × user × timestamp — the scan log), `ScheduleBlock`
  (station × date × job × hours — the capacity plan).
- **New (install)**: `SnagItem` (photo, note, assignee, status), `HandoverPack`
  (pdf, driveFileId, signedApprovalId), `MaintenanceRequest` (portal-raised →
  becomes a job).
- **New (portal)**: `PortalMessage` (job-scoped thread), `PortalEvent` (what the
  client sees on the timeline).

All money integer cents (house rule). All new tables indexed on `jobId` where
applicable. `SetNull` survival semantics for financial records, as today.

## 8. Design language (fresh)

Brief for the new system — "**Workshop Modern**":

- **Palette**: deep charcoal ink (`#16130F`-family) + warm off-white paper surfaces;
  one **oak/brass accent ramp** as the platform default, overridden per company by a
  single configurable accent (`--accent` ramp generated from one hex in
  CompanySettings). Semantic colours for stage/status never depend on the accent.
- **Type**: Inter for UI; **Fraunces** (or similar warm display serif) for headings
  and client-facing surfaces — premium, craft, print-like. Client portal and PDFs
  share this voice so the client experience feels like one brand.
- **Surfaces**: calmer than Ember Glow — flat paper cards, hairline borders, generous
  whitespace, radius ~16px (down from 30px bento). Frosted glass only for overlays.
- **Dark mode**: first-class (factory tablets run dark by default).
- **Per-surface ergonomics**: office = density + keyboard; factory = ≥48px touch
  targets, glanceable from a metre away; field = one-hand reach, offline-tolerant;
  portal = editorial, image-led, zero jargon.
- Keep everything already good: PWA, no-flash theme init, reduced-motion respect,
  16px inputs (iOS), skeletons, the `.app-scroll` fixed-dock architecture.
- Tokens live in `globals.css` `@theme` exactly as today; this is a re-skin of the
  token layer + component refresh, not a CSS framework change.

## 9. Deploy & white-label

- One VPS per company: evolved `deploy/install.sh` takes `COMPANY_NAME`, `DOMAIN`,
  `ACCENT`, logo path → running branded instance (nginx + certbot + pm2 + cron +
  daily SQLite backups, as today).
- First-run **onboarding wizard** (admin account, company details, branding, connect
  Google/Xero, stations & working hours, invite team) replaces hand-editing env.
- Demo mode preserved: full product usable before Google/Xero connect — it's the
  sales demo.
- Per-company Google Cloud + Xero apps documented (existing GOOGLE_SETUP/XERO_SETUP
  docs updated for the wizard).

## 10. Build order (summary — full list in BUILD_TASKS.md)

| Phase | Delivers |
|---|---|
| 0 | JoineryFlow vendored in, rebranded to config, CI green |
| 1 | Users, roles, invites, client portal auth foundation |
| 2 | Workshop Modern design system + four-surface navigation shell |
| 3 | Pipeline stage model + automations generalised |
| 4 | Sales: enquiry form, CRM polish, quote builder + portal e-acceptance, deposit flow |
| 5 | Check measure module |
| 6 | Design: drawing sets, revisions, AI diffs, portal sign-off, variations |
| 7 | Factory I: stations + job board + tablet view |
| 8 | Factory II: AI cut-list extraction, parts, QR labels + scanning |
| 9 | Factory III: capacity scheduling + lead-time engine |
| 10 | Install: run sheets, snags, sign-off, handover pack, maintenance intake |
| 11 | Portal completion: timeline, photos, invoices/payments, messages |
| 12 | AI everywhere: role briefs, pipeline-wide Ask AI, risk advisor |
| 13 | White-label installer, onboarding wizard, docs, Harrington launch config |

Each phase leaves the app shippable. Harrington Kitchens can go live on the product
from Phase 4 onward and pick up modules as they land.

## 11. Risks & standing assumptions

- **SQLite ceiling**: fine for 5–15 users; if a customer outgrows it, the documented
  Postgres migration is the answer — don't complicate v1.
- **AI extraction accuracy** (cut lists especially): mitigated by mandatory review
  screens, per-company `extractionHint`s (existing pattern), and never auto-committing.
  Extraction cost is cents per document (existing envelope).
- **Factory adoption** is behavioural, not technical: QR scanning must be faster than
  not scanning (one tap, instant), or staff will skip it. Job-level board works even
  if part scanning lapses — graceful degradation is designed in.
- **Google/Xero remain optional** per company (demo-mode degradation everywhere).
- Assumed: Australian-first (GST/BAS, AUD, `BUSINESS_TZ`) as today; product name
  finalised later via config; Harrington's real branding supplied before launch.
