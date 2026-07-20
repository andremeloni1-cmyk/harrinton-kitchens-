# BUILD_TASKS — execution list for the build agent

Ordered, PR-sized tasks implementing [PLAN.md](PLAN.md). Work top to bottom. Read
PLAN.md first; it holds the decisions — do not re-decide them.

## Ground rules (apply to every task)

1. **Source material**: the JoineryFlow repo (`Joineryflow`, app in `app/`) is in
   this session. Phase 0 vendors it into this repo; after that, all work happens here.
2. **Keep CI green**: `npm run typecheck && npm run lint && npm test && npm run build`
   must pass at the end of every task. Add/extend vitest tests for new lib logic
   (pricing, scheduling math, extraction mappers, permissions).
3. **One task ≈ one commit** (or a small series). Descriptive messages. Push to the
   designated branch; never force-push over someone else's work.
4. **House patterns are law**: money in integer cents; Prisma migrations (never edit
   old ones); AI calls follow `lib/vision.ts` — JSON-schema output, untrusted-content
   framing, refusal guard, typed fallback, human review before commit, deterministic-
   first for anything numeric; integrations degrade gracefully when unconnected
   (demo mode); tokens encrypted at rest; mobile-first; dark mode; reduced motion.
5. **Naming**: platform brand comes from one constant/config (`BRAND`, working name
   "Benchline") + `CompanySettings` for per-company branding. Never hardcode
   "JoineryFlow" or "Harrington" in UI strings.
6. **Don't grow monoliths**: new dashboard/page zones are colocated section
   components (the `dashboard-sections/` rule). No new chart/date/UI libraries
   without a note in the PR explaining why.
7. If a task is ambiguous, prefer the smallest interpretation that satisfies its
   "Done when", and leave a `NOTE:` in the PR description.

---

## Phase 0 — Foundation

- [ ] **P0.1 Vendor JoineryFlow.** Copy `Joineryflow/app` → this repo's `app/`
  (exclude `node_modules`, `.next`, `*.db`, `.env`). Copy `.github/workflows/ci.yml`
  and `.github/dependabot.yml`. Root README: product one-liner + links to PLAN.md /
  BUILD_TASKS.md / `app/README.md`.
  *Done when*: fresh clone → `npm install && npx prisma migrate deploy && npx prisma
  db seed && npm run dev` boots in demo mode; CI pipeline passes.
- [ ] **P0.2 De-brand to config.** Introduce `src/lib/brand.ts` (platform `BRAND`
  constant) and route every user-visible product-name string, email footer, PDF
  header, PWA manifest, and `<title>` through it + `CompanySettings.name`. Rename
  visible "JoineryFlow" strings; internal identifiers (cookie name, Drive root
  folder name) may keep legacy values behind constants.
  *Done when*: `grep -ri joineryflow app/src --include='*.tsx' --include='*.ts'`
  shows only the constants file and comments; app runs identically.

## Phase 1 — Users, roles, portal auth foundation

- [ ] **P1.1 Schema: users.** Migration: `User` (id, name, email unique, scrypt
  `passwordHash`, `role` enum ADMIN|OFFICE|DESIGNER|FACTORY|INSTALLER, `active`,
  `credentialEpoch`, timestamps), `Invite` (email, role, tokenHash, expiresAt,
  usedAt). Rename `Account` → `CompanySettings` (`@@map` to keep the table if
  simpler); strip identity fields; migrate the existing owner into a seeded ADMIN
  `User`.
  *Done when*: migration runs on a seeded legacy DB without data loss; seed creates
  an admin from `OWNER_EMAIL`.
- [ ] **P1.2 Session rework.** Sessions carry `userId` + per-user credential epoch
  (same HMAC cookie design as `lib/session.ts` today). Login page: email + password.
  Password set/reset via the existing emailed-token flow, now per-user.
  `isAuthenticated()` → returns the user; middleware unchanged in spirit.
  *Done when*: two users can be logged in simultaneously with distinct identities;
  password reset logs out only that user; legacy `APP_PASSWORD` gate removed.
- [ ] **P1.3 Roles & permissions.** `src/lib/permissions.ts`: `can(user, action)`
  map (e.g. `manage_users` ADMIN; `edit_money` ADMIN|OFFICE; `factory_board` ADMIN|
  FACTORY|OFFICE; `field_app` INSTALLER|…). Enforce in every API route (server-side)
  and hide unauthorized nav (client-side). Vitest the matrix.
  *Done when*: a FACTORY user hitting a money API gets 403; tests cover each role.
- [ ] **P1.4 Team management UI.** Settings → Team: list users, invite (emailed
  magic link → set password), change role, deactivate.
  *Done when*: full invite→join→work→deactivate lifecycle works in demo mode
  (invite email logged to activity when Gmail unconnected).
- [ ] **P1.5 Portal auth.** `ClientPortalToken` (clientId, tokenHash, expiresAt,
  lastUsedAt). `/portal` route group with its own layout + session cookie; login =
  magic link emailed on request (client enters email; only known client emails get
  links). Scoped strictly to that client's jobs.
  *Done when*: a client can open `/portal` via emailed link and sees only their
  jobs; staff sessions don't work on portal routes and vice versa.

## Phase 2 — Design system & shells

- [ ] **P2.1 Workshop Modern tokens.** Rewrite `globals.css` `@theme` per PLAN §8:
  ink/paper palette, brass default accent ramp, radius 16, hairline borders, Fraunces
  display + Inter, refreshed shadows. Keep all structural utilities (`.app-scroll`,
  sheets, skeletons, motion) working. Update `Brand`/`BrandMark`.
  *Done when*: every existing page renders correctly (light+dark) with the new look;
  no component-level regressions in nav, sheets, calendar chips.
- [ ] **P2.2 Per-company accent.** `CompanySettings.accentColor` (hex) → server
  generates the accent ramp as CSS variables in the root layout; Settings → Branding
  gets a colour picker alongside the existing logo upload.
  *Done when*: changing the accent restyles the whole app + portal without rebuild.
- [ ] **P2.3 Four-surface navigation.** Role-aware nav config: office (current
  BottomNav/SideNav, full menu), FACTORY default-lands on `/factory` (Phase 7),
  INSTALLER on `/field` (stub → Phase 10), portal has its own minimal nav. Placeholder
  routes ship now so nav is stable.
  *Done when*: each role logs in to a sensible home with only their surfaces visible.

## Phase 3 — Pipeline spine

- [ ] **P3.1 Stage model.** Migration: `Job.pipelineStage` enum per PLAN §5; map
  legacy `status` values onto it (keep `status` field temporarily, mirrored, until
  P3.3). Stage metadata (label, order, colour token) in `src/lib/pipeline.ts`.
  *Done when*: existing jobs show correct stages; both fields stay consistent.
- [ ] **P3.2 Stage automations.** Generalise `lib/automations.ts`: a transition table
  keyed by stage change → side effects (calendar, Drive, client email, portal event,
  push). Existing behaviours (accept/schedule/cancel/complete) re-expressed as
  transitions; every transition logged to Activity.
  *Done when*: legacy flows behave identically through the new table; tests cover
  the transition matrix.
- [ ] **P3.3 Pipeline UI.** Job detail gets a stage timeline header (done/current/
  upcoming + dates); dashboard and job lists filter by stage group (Sales / Pre-
  production / Factory / Field). Retire the legacy `status` field.
  *Done when*: a job can be walked ENQUIRY→HANDOVER from the UI, side effects firing.

## Phase 4 — Sales & client experience

- [ ] **P4.1 Public enquiry form.** `/enquire` (public, branded, spam-honeypot):
  name/contact/project type/description/photos → creates an ENQUIRY job + client,
  notifies office (push + email). Reuses the AI Capture review pattern for photos.
  *Done when*: submission → reviewed lead in the pipeline with photos attached.
- [ ] **P4.2 Quote builder.** `Quote` model (versioned per job). Builder UI on the
  existing price-list + AI line suggestions; sections, quantities, margins, GST;
  branded quote-pack PDF (pdf-lib) with drawings/renders appendix.
  *Done when*: a quote is drafted, AI-suggested, edited, versioned, and rendered to
  a correct PDF (cents-accurate; vitest on totals).
- [ ] **P4.3 Portal quote acceptance.** Send-to-portal + email link. Portal page:
  view PDF, accept with typed-name signature (records name/timestamp/IP in
  `Approval`) or request changes (comment → office notification). Acceptance →
  stage DEPOSIT + auto-draft deposit invoice (configurable %, Xero push, portal
  shows Xero pay link).
  *Done when*: full accept path works in demo mode; declined/change-request path
  notifies office; deposit invoice math tested.
- [ ] **P4.4 Consultation booking.** SiteVisit model (type CONSULT) + booking from
  the job page onto a chosen staff calendar with clash detection (reuse calendar
  lib); client confirmation email.
  *Done when*: booked consult appears on Google Calendar (or activity log in demo).

## Phase 5 — Check measure

- [ ] **P5.1 Check-measure schema + scheduling.** `CheckMeasure` + SiteVisit(type
  CHECK_MEASURE, assignee). Book from job page; appears in assignee's `/today`.
  *Done when*: visit scheduling + calendar + notification works.
- [ ] **P5.2 Capture UI (field).** Phone-first form: rooms → walls/openings/services
  with dimensions (mm), ceiling heights, appliance list, power/water/gas positions;
  photo capture with simple annotation (arrows/labels); dictated notes
  (`DictateButton`); works offline via the existing offline-queue pattern, syncs on
  reconnect.
  *Done when*: a full room can be captured on a phone offline and syncs cleanly.
- [ ] **P5.3 AI site-sheet reader.** `lib/measure-ai.ts`: photo of handwritten site
  sheet/sketch → structured rooms/dimensions (house AI pattern, review screen
  merges into the form, nothing auto-commits).
  *Done when*: a legible photographed sheet round-trips into structured data behind
  review; unreadable input fails gracefully.
- [ ] **P5.4 Discrepancy & variation hook.** On completion, diff captured dims
  against quote assumptions/notes; discrepancies listed on the job and offered as a
  drafted `Variation` (model lands here; approval flow in P6.4).
  *Done when*: completing a check measure moves stage → DESIGN and surfaces
  discrepancies.

## Phase 6 — Design & sign-off

- [ ] **P6.1 Drawing sets & revisions.** `DrawingSet`/`DrawingRevision` (files via
  existing Document/Drive filing). Upload UI on job page; revision statuses
  draft→sent→approved→released; approved/released revisions immutable (new revision
  required).
  *Done when*: revisions upload, list chronologically, file to Drive, and lock
  correctly.
- [ ] **P6.2 AI revision diff.** `lib/drawing-ai.ts`: compare revision PDFs/images →
  bullet summary of changes, stored on the revision, shown internally and (rewritten
  client-safe) in the portal.
  *Done when*: two differing revisions produce a sensible summary; identical ones
  say so; failure falls back to "summary unavailable".
- [ ] **P6.3 Portal design review.** Portal: view current revision (inline PDF/
  images), comment (threaded → office notification), approve with signature →
  `Approval`, stage → APPROVAL, revision → approved. Office "release to factory"
  → released + stage PRODUCTION.
  *Done when*: comment and approve paths both work end-to-end with notifications.
- [ ] **P6.4 Variations.** Variation lifecycle: draft (AI-assisted from notes) →
  priced (quote-builder mini) → sent → portal approval → approved variations adjust
  job contract value and appear on final invoicing. Post-approval drawing changes
  require a variation (enforced).
  *Done when*: a variation round-trips to portal approval; money maths tested;
  invoice pulls approved variations.

## Phase 7 — Factory I: job board

- [ ] **P7.1 Stations.** `Station` model + Settings → Factory (add/rename/reorder,
  hoursPerDay); seed default 7 stations (PLAN §5.4). Jobs entering PRODUCTION get a
  per-station progress record.
  *Done when*: stations configurable; new production jobs initialise correctly.
- [ ] **P7.2 Factory board (office).** `/factory`: columns per station, job cards
  (client, due date, progress, blockers), drag to advance/return, per-station
  checklists, notes, photos.
  *Done when*: a job walks Programming→Dispatch by drag; every move logged +
  portal-visible as "in production" progress.
- [ ] **P7.3 Tablet mode.** Factory-role landing: single-station select → large
  touch targets, glanceable queue ("what's at my station now/next"), tap to
  complete-at-station, photo + blocker buttons. Blockers ping office (push).
  *Done when*: usable on a tablet with work gloves logic — every action ≤2 taps;
  blocker raise/resolve loop works.

## Phase 8 — Factory II: parts & QR

- [ ] **P8.1 Cut-list AI extraction.** `lib/cutlist-ai.ts`: uploaded CAD-exported
  cut-list/job PDF → `{cabinets[], parts[], hardware[]}` (dims, material, edging,
  qty) via house AI pattern; review/edit screen (per-company `extractionHint`
  supported); confirm → `Cabinet`/`Part` rows.
  *Done when*: a representative cut-list PDF lands as reviewed structured parts;
  cost per extraction noted in docs; malformed PDFs fail with a clear message.
- [ ] **P8.2 QR labels + scanning.** Per-job label sheet PDF (QR per cabinet/part,
  pdf-lib). Tablet/phone camera scan (browser BarcodeDetector, `jsQR` fallback) →
  advances that item at the scanner's station (`StationEvent`).
  *Done when*: print → scan → item moves; job % complete per station derives from
  parts; unscanned-parts view exists.
- [ ] **P8.3 Part-aware board.** Board cards show part-level progress bars per
  station; QC station gets a per-cabinet checklist; dispatch requires all cabinets
  scanned out (override with reason).
  *Done when*: part progress visible office+factory+portal (client-safe %); QC
  holds work back.

## Phase 9 — Factory III: production scheduling

- [ ] **P9.1 Capacity engine.** `lib/schedule.ts` (pure, vitest-heavy): station
  hours/day + `ScheduleBlock`s → utilisation per station per day; job hour
  estimates (per-station defaults by job size, overridable) → auto-proposed blocks
  back from due date; feasibility check for any target date.
  *Done when*: engine unit-tested against hand-computed scenarios incl. overload
  and holiday days.
- [ ] **P9.2 Schedule board.** `/factory/schedule`: week grid station×day showing
  blocks + utilisation heat; drag to rebalance; overload warnings; job due-date
  risk flags surfaced on dashboard.
  *Done when*: rebalancing persists; overloads are visually unmissable; dashboard
  shows at-risk jobs.
- [ ] **P9.3 Lead-time answers.** Sales-facing: "earliest feasible install for a
  job of ~N cabinets" from live capacity; shown in quote builder and Ask AI.
  Deterministic engine, AI narrates only.
  *Done when*: quoting shows a live realistic date that respects current load.

## Phase 10 — Install & handover

- [ ] **P10.1 Install scheduling.** SiteVisit(type INSTALL, multi-day, crew =
  users[]); crew calendars + clash detection; dispatch checklist gates booking
  (parts scanned out).
  *Done when*: multi-day crewed install books to calendar(s); portal shows dates.
- [ ] **P10.2 Field app.** `/field` for installers: today's run sheet (jobs,
  addresses, navigate, gate codes, client contacts), approved drawings only,
  offline-tolerant, photo upload to job.
  *Done when*: an installer's day works from a phone without office calls.
- [ ] **P10.3 Snag list.** `SnagItem` CRUD from field (photo+note, assignee,
  open→resolved with proof photo); office tracker; client-safe progress in portal.
  *Done when*: snag raised on site → resolved → visible trail everywhere.
- [ ] **P10.4 Handover.** On-site client sign-off (SignaturePad → `Approval`) →
  generate handover pack PDF (approved drawings list, care instructions template,
  warranty terms, snag closure) → Drive + portal + email → stage HANDOVER → final
  invoice drafted (contract + approved variations − paid claims).
  *Done when*: full handover ceremony runs in demo mode; final invoice math tested.
- [ ] **P10.5 Maintenance intake.** Portal "request service" → `MaintenanceRequest`
  → office converts to MAINTENANCE job (existing report module covers the visit).
  *Done when*: portal request becomes a scheduled maintenance job with the client
  notified.

## Phase 11 — Portal completion

- [ ] **P11.1 Project timeline.** Portal home per job: stage timeline with dates,
  what's-next copy, key documents, curated progress photos (staff mark photos
  client-visible; never auto-share).
  *Done when*: a client can answer "where's my kitchen?" unaided.
- [ ] **P11.2 Money view.** Invoices list (deposit/progress/final) with status +
  Xero pay links; paid receipts reflected.
  *Done when*: invoice statuses mirror Xero after sync.
- [ ] **P11.3 Messages.** `PortalMessage` thread per job (client ↔ office), email
  notification both ways, office reply from job page; AI-drafted reply suggestions
  (house pattern, human sends).
  *Done when*: two-way thread works with notifications; drafts never auto-send.

## Phase 12 — AI everywhere

- [ ] **P12.1 Role-aware briefs.** Extend daily brief: OFFICE (money, approvals,
  at-risk), FACTORY lead (today's stations, blockers, capacity), INSTALLER (run
  sheet summary). Same deterministic-first guard.
  *Done when*: each role's morning push/brief reflects their world; numbers
  verbatim-guarded.
- [ ] **P12.2 Ask AI, full pipeline.** Extend the business snapshot with pipeline,
  factory, schedule, snags, portal activity; role-scoped (no money in FACTORY
  answers).
  *Done when*: "what's blocking the Nguyen job?" and "can we fit a 12-cabinet job
  before Christmas?" answer correctly from snapshot data.
- [ ] **P12.3 Risk advisor.** Weekly + on-demand: deterministic checks (capacity
  overloads, approvals stale >X days, unsigned quotes, snags aging, deposits
  unpaid) → AI-narrated digest to office (extends weekly summary).
  *Done when*: seeded risk scenarios all surface; thresholds are named constants.

## Phase 13 — White-label & launch

- [ ] **P13.1 Onboarding wizard.** First-run flow: admin account → company details
  + branding → stations/hours → connect Google/Xero (skippable) → invite team →
  seeded sample job tour.
  *Done when*: a fresh instance is production-ready via the wizard alone, no env
  edits beyond install.
- [ ] **P13.2 Installer.** Update `deploy/install.sh` + docs for the new product
  (env additions, brand args); keep one-command VPS install, cron, backups; smoke
  script hits health + login.
  *Done when*: fresh Ubuntu VPS → command → branded login page on HTTPS.
- [ ] **P13.3 Docs & handbook.** Update `app/README.md` (features, env table),
  GOOGLE_SETUP/XERO_SETUP for wizard flow; add `docs/OPERATIONS.md` (backup/
  restore/upgrade/Postgres path) and a short per-role user guide.
  *Done when*: a new company could be onboarded by following docs only.
- [ ] **P13.4 Harrington launch config.** Apply Harrington Kitchens branding
  (name, logo, accent) as the first deployment config + launch checklist (import
  clients/price list via existing import script, connect their Google/Xero, invite
  staff, seed stations).
  *Done when*: checklist exists and a Harrington-branded instance runs end-to-end
  in demo mode.

---

**Final gate**: full CI green; demo-mode walkthrough of one job ENQUIRY→HANDOVER
recorded in the PR description; PLAN.md updated if reality diverged.
