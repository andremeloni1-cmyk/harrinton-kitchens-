# Pre-launch hardening plan — Harrington Kitchens (Benchline)

**Prepared for:** an execution pass by Claude Opus.
**Prepared by:** a five-track code review (auth, API authorization, backend business logic, frontend, config/deploy) of the app at `app/`.
**Date:** 2026-07-23.
**Branch to work on:** `claude/web-app-review-fixes-g4vwrz`.

---

## 0. How to use this document

This is an execution plan, not a discussion. Each item has a stable ID (`P0-1`,
`B1`, …), the exact file and lines, the defect, the fix to apply, and how to
verify it. Work top-to-bottom by priority tier. **Fix P0 (launch blockers) first
— those are the ones that can embarrass the owner in the client meeting or expose
customer data.** Then P1, then P2, then P3 as time allows.

Every finding below was verified by reading the actual code, not inferred.

### Ground rules for the execution pass

1. **One logical fix per commit**, with a message that names the ID(s) it closes
   (e.g. `P0-1..P0-3: gate settings/export/job routes with requirePermission`).
2. **Do not break the green baseline.** Before starting and after every few
   fixes, run the full gate from `app/`:
   ```bash
   cd app
   npm run typecheck && npm run lint && npm test && npm run build
   ```
   (Build needs a `DATABASE_URL`, e.g. `DATABASE_URL="file:./dev.db"`.)
3. **Add a regression test** for every backend-logic and authorization fix. The
   repo has a strong vitest suite (238 tests) and a `permissions.test.ts` pattern
   to follow — extend it. Money and date fixes especially must ship with a test
   that fails before and passes after.
4. **Prefer the patterns already in the codebase.** The right helpers already
   exist: `requirePermission()` (`src/lib/session.ts`), the `Modal` component,
   the `api()` throwing fetch helper, the P2002 retry loop in
   `createJobWithReference` (`src/lib/utils.ts`), and the correct timezone
   formatting in `src/lib/xero/invoices.ts`. Reuse them; don't reinvent.
5. **Keep white-labelling intact.** Brand strings come from `src/lib/brand.ts` +
   `CompanySettings`. Don't hardcode "Harrington".

### Current baseline (starting state — all green)

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ passes |
| `npm run lint` | ✅ 0 errors (41 warnings, see P3-lint) |
| `npm test` | ✅ 238/238 pass |
| `npm run build` | ✅ succeeds |
| `npm audit --omit=dev` | ❌ 3 high vulnerabilities (see P0-6) |

The app is well-built for its stage — pure, unit-tested money/logic helpers,
per-user auth that fails closed, real security headers, idempotent deploy
scripts. The defects below are concentrated and mostly mechanical to fix. Nothing
here needs a redesign.

---

## P0 — Launch blockers (fix before the client meeting / go-live)

These either expose customer data with no login, corrupt money, silently lose
on-site work, or ship a published security advisory.

### P0-1 · Installer portal is completely unauthenticated — customer PII exposed to anyone
**Severity: Critical (broken access control / PII disclosure)**
**Files:** `app/src/proxy.ts:64` (matcher), `app/src/app/installer-portal/page.tsx:9-18`, `app/src/app/installer-portal/[installerId]/page.tsx:25-46`

The proxy `matcher` negative-lookahead excludes `installer-portal`, and both page
Server Components read straight from Prisma with **no auth guard**. An anonymous
visitor can open `/installer-portal`, which enumerates every active installer,
then open `/installer-portal/<id>` to see each job's `clientName`, `address`,
`reference`, status and schedule — customer names, addresses and the job pipeline,
no login at all. (The nested job-detail page fetches `/api/jobs/*`, which *does*
require a staff session, so it dead-ends — see F8 — but the index and run-sheet
pages leak on their own.)

**Fix:** Gate the installer portal behind real auth. Recommended, matching the
client portal's existing design:
- Add a signed per-installer token (mirror `ClientPortalToken` /
  `src/lib/portal-session.ts`): a magic link the office sends each installer, a
  distinct httpOnly cookie, and a `getInstaller()` guard the pages call.
- Scope the run sheet to the authenticated installer, not a URL id.
- Remove `installer-portal` from the public matcher exclusion **only after** the
  pages enforce their own auth (otherwise the middleware redirect breaks the
  installer's own token flow — see the portal precedent).
- If a full token flow is too much before launch, the minimum stop-gap is to
  require a staff session for these pages (call `getSessionUser()` and redirect
  to `/login` when absent) so nothing renders to the public.

**Verify:** logged-out request to `/installer-portal` and
`/installer-portal/<id>` must not return any client name/address; add a test or a
manual `curl` check with no cookie.

### P0-2 · Any logged-in role can rewrite company settings, email templates and the Xero bank account
**Severity: High (authorization)**
**File:** `app/src/app/api/settings/route.ts:48-49` (`PATCH`)

Guarded by `isAuthenticated()` only. The permission matrix reserves settings for
`manage_settings` (ADMIN), and every sibling settings route already enforces it —
this one is the outlier. A FACTORY/INSTALLER user can `PATCH /api/settings` to
rewrite client-facing email templates (a phishing vector), the business
name/logo/signature, and `xeroBankAccountId` / `xeroExpenseAccountCode` (the Xero
account receipts post against).

**Fix:**
```ts
export async function PATCH(req: Request) {
  const gate = await requirePermission("manage_settings");
  if (gate instanceof Response) return gate;
  // …existing body handling…
}
```
Import `requirePermission` from `@/lib/session`. Leave `GET` as-is (or drop it to
`view`).

**Verify:** add to `permissions.test.ts` / a route test that a non-ADMIN gets 403.

### P0-3 · Full-database export downloadable by any logged-in role
**Severity: High (authorization / bulk PII + financial exfiltration)**
**File:** `app/src/app/api/export/route.ts:11-12` (`GET`)

`isAuthenticated()` only. Returns a JSON dump of **all** jobs (incl. `documents`
with base64 file bytes and activities), **all** invoices, **all** clients
(names/emails/phones/addresses), lead sources, price items, reports and settings.
An INSTALLER can pull the entire company database in one request.

**Fix:** gate with an ADMIN-level permission — `requirePermission("manage_settings")`
(this is an owner-grade backup) or `edit_money`. Prefer `manage_settings`.

**Verify:** non-ADMIN → 403.

### P0-4 · Any role can edit money/stage on any job, or delete any job
**Severity: High (authorization)**
**File:** `app/src/app/api/jobs/[id]/route.ts:47` (`PATCH`), `:123` (`DELETE`)

Both guarded by `isAuthenticated()` only, while every job *sub-resource*
(drawings, install, measure, visits, cutlist) already requires
`manage_jobs`. A FACTORY/INSTALLER can `PATCH` any job's `quoteAmount`, flip
`pipelineStage` (which fires `runStageTransition` → client emails / invoice
automations), or `DELETE` any job (removes its calendar event and cascades).

**Fix:** replace the `isAuthenticated()` guard on `PATCH` and `DELETE` with
`requirePermission("manage_jobs")`. Keep `GET` at view level. **Do P0-4 together
with B11** (stage/status validation) — same handler.

**Verify:** non-(ADMIN/OFFICE/DESIGNER) → 403 on PATCH and DELETE.

### P0-5 · Offline queue silently deletes queued writes when the session has lapsed — data loss reported as "synced"
**Severity: Critical (silent data loss of on-site work — the app's headline feature)**
**Files:** `app/src/lib/offline-queue.ts:104-125` (mutation flush), and the interaction with `app/src/proxy.ts:52-59`

The middleware never returns 401 — it **307-redirects to `/login`**. A replayed
`PATCH` (307 preserves the method) follows to `/login`, which returns **405**.
`405` lands in the `res.status >= 400 && < 500 && !== 401` branch (line 114-118)
and the mutation is **deleted forever**. The `401` carve-out is dead code because
the middleware redirects instead of 401-ing. Scenario: an installer ticks
checklist items / edits a check-measure in a signal black-spot ("Saved offline —
will sync"); their 30-day cookie has since expired; on reconnect `flushQueue`
discards every queued write and the OfflineBar goes green.

**Fix:** make the flush redirect-aware and fail safe:
- Use `fetch(m.url, { …, redirect: "manual" })` and treat an opaque redirect
  (`res.type === "opaqueredirect"` / `res.status === 0`) **or** `405` **or** `403`
  the same as `401`: **keep the item, stop the pass, and surface a re-auth prompt.**
- Only delete a mutation on a genuine `res.ok`, or on a true client-validation
  `4xx` that is *not* an auth redirect.
- Add a visible "N changes could not be synced — sign in to retry" state
  (drive it from the existing `pendingMutationCount()`), instead of silently
  dropping. Do the same for the photo path (P2, F11).

**Verify:** with an expired/missing session cookie, a queued mutation must remain
in IndexedDB after `flushQueue()` and the UI must show it as unsynced. Add a unit
test that mocks a redirect/405 response and asserts the item is retained.

### P0-6 · Shipping a Next.js version with a published proxy/middleware auth-bypass advisory
**Severity: Critical (known CVE against this app's only page-level auth gate)**
**File:** `app/package.json:34` (`"next": "16.2.9"`), `:` (`eslint-config-next` pinned to `16.2.9`)

`npm audit --omit=dev` reports **3 high** vulnerabilities: `next` (incl.
GHSA-6gpp-xcg3-4w24, "Middleware / Proxy bypass in App Router applications using
Turbopack", plus SSRF, cache-confusion, DoS, and unauthenticated server-function
disclosure), and a bundled vulnerable `sharp`/libvips. Staff HTML pages are
protected *only* by `src/proxy.ts`; a proxy bypass is an unauthenticated read of
the whole staff app.

**Fix:**
```bash
cd app
npm install next@16.2.11 eslint-config-next@16.2.11
npm audit --omit=dev            # expect: 0 high from next/sharp
npm run typecheck && npm run lint && npm test && npm run build
```
Also run `npm audit fix` for the dev-only `brace-expansion` high. If `16.2.11`
introduces a behavioural change, pin to the lowest patch in `16.2.x` that clears
the advisory. Re-run the full gate — Next is a framework bump, so the build/test
run is the real check.

**Verify:** `npm audit --omit=dev` shows 0 high; full gate stays green.

### P0-7 · Default admin password `benchline-demo` can reach production
**Severity: High (source-visible default credential → remote admin takeover)**
**Files:** `app/prisma/seed.ts:119`, `app/prisma/ensure-admin.ts:31`, comment at `app/deploy/harrington.env.example:15`

Both bootstrap scripts fall back to `OWNER_PASSWORD || "benchline-demo"`.
`ensure-admin` runs unconditionally on deploy (`deploy/update.sh`,
`deploy/auto-update.sh`); on any deploy where the admin doesn't yet exist and
`OWNER_PASSWORD` isn't exported (re-provision, DB reset, or a hand-copied `.env`),
the public site gets admin login `OWNER_EMAIL / benchline-demo`. `install.sh`
mitigates only the happy path.

**Fix:**
- In both `seed.ts` and `ensure-admin.ts`: never fall back to a static password.
  When `OWNER_PASSWORD` is unset, either (a) generate a random password with
  `crypto.randomBytes`, print it once to stdout, and use it; or (b) leave
  `passwordHash` null and force the invite/reset flow. **In `NODE_ENV=production`,
  refuse the static fallback and exit non-zero** with a clear message.
- Fix the misleading `harrington.env.example:15` comment to match actual
  `install.sh` behaviour.

**Verify:** running the seed in a prod-like env with no `OWNER_PASSWORD` must not
create an account with the literal `benchline-demo`.

### P0-8 · Handover final invoice is built from the estimate, not the accepted quote — under-billing (or a negative invoice)
**Severity: High (money correctness)**
**Files:** `app/src/app/api/jobs/[id]/handover/route.ts:70-77`; accept path `app/src/app/api/portal/quotes/[quoteId]/accept/route.ts:53`

The deposit is computed from `quote.subtotalCents` at accept, but nothing writes
the accepted quote back to `job.quoteAmount` / `job.estimateItems`. At handover
the base lines come from `job.estimateItems` (or `job.quoteAmount`), so the final
invoice ignores the contract the client actually signed. Example: estimate
$20,000, quote adds 10% margin → accepted $22,000, deposit invoice $7,260 inc GST;
at handover base = estimate $20,000 → final = 20,000 − 6,600 + GST = **$14,740,
under-billing $2,420**. For a quote-builder-only job with no estimate,
`unitAmount: 0` → the final invoice is **negative**.

**Fix:** derive the handover base lines from the **latest accepted `Quote`** (its
sections + margin, cents-exact), falling back to `estimateItems` / `quoteAmount`
only when no accepted quote exists. The quote total math already lives in
`src/lib/quote.ts` (integer cents) — reuse it. Simplest robust option: on quote
*accept*, snapshot the accepted contract total onto the job (e.g.
`job.quoteAmount` and/or a dedicated field) so handover has a single source of
truth; then handover reads that.

**Verify:** add a test: accept a quote with a margin, run handover, assert the
final invoice balance == contract inc-GST − deposit paid. Add a quote-only (no
estimate) case and assert the invoice is never negative.

### P0-9 · Quote accept has no status guard or atomicity — duplicate deposit invoices
**Severity: High (money correctness / concurrency)**
**File:** `app/src/app/api/portal/quotes/[quoteId]/accept/route.ts:22-57`; re-send at `app/src/app/api/portal/quotes/[quoteId]/send/route.ts:29`

Only guard is `status === "accepted"`; read-then-write, no transaction, no
version supersedence (`grep superseded` → 0 hits). (a) Double-click / two tabs:
both pass the check, both create an Approval, both advance the job and **both
raise a deposit invoice**. (b) `send` sets `status: "sent"` unconditionally, so
re-sending an already-accepted quote lets it be accepted (and auto-deposited)
again. (c) A stale sent v1 stays acceptable after v2 is sent → two deposit
invoices at two totals.

**Fix:**
- In accept, replace the read-check with a conditional write that acts as the
  lock, inside a `$transaction` with the Approval + job update + deposit invoice:
  ```ts
  const claimed = await prisma.quote.updateMany({
    where: { id: quoteId, status: "sent" },
    data: { status: "accepted", acceptedAt: new Date() },
  });
  if (claimed.count === 0) return json({ error: "This quote can't be accepted." }, 409);
  ```
  Require `status === "sent"` to accept (not just "not accepted").
- On `send`, mark older sent versions of the same job `superseded` and refuse
  sending a quote that is already `accepted`.

**Verify:** test that two concurrent accepts create exactly one Approval and one
deposit invoice; that an accepted quote can't be re-sent/re-accepted.

### P0-10 · Factory "complete station" skips the rest of the line when station positions have a gap
**Severity: High (production correctness — jobs bypass QC/dispatch)**
**File:** `app/src/app/api/factory/job-stations/[id]/done/route.ts:25-27`

Next station is found by `{ jobId, position: js.position + 1 }`. Retiring a
station only deactivates it, leaving position gaps; `init_factory` snapshots live
positions, so a job can have JobStations at 0,1,3,4,5,6. Completing position 1
finds no `position: 2`, is treated as the **last** station, marks production
finished and jumps the job to DELIVERY with Assembly/Finishing/QC/Dispatch never
run — and the `isLast` QC/dispatch gate is evaluated for the wrong station.

**Fix:**
```ts
const next = await prisma.jobStation.findFirst({
  where: { jobId: js.jobId, position: { gt: js.position } },
  orderBy: { position: "asc" },
});
```

**Verify:** test with non-contiguous positions that completing a middle station
advances to the next existing station, not DELIVERY.

### P0-11 · Business-day math mixes UTC (`toISOString()`) with the app's server-local wall-clock convention — off-by-one days for an AU business
**Severity: High (scheduling/risk correctness in every real deployment)**
**Files:** `app/src/lib/capacity-server.ts:75,106,119,129`; `app/src/lib/snapshot.ts:26`; `app/src/lib/risk-server.ts:11` (and anywhere else a `'YYYY-MM-DD'` day is derived via `toISOString().slice(0,10)`)

The app's convention (see `src/lib/leads.ts:253-258`, `google/calendar.ts` `wallClock`,
`automations.ts` `localYMD`) is "server-local wall clock = business wall clock".
But these files derive "today" and install due-days with `toISOString()` (UTC).
On a UTC VPS (the common default), every weekday until ~10–11am Sydney "today" is
**yesterday**: `mondayOf(Sunday)` returns the previous Monday, so the factory
schedule board, snapshot and risk engine show last week's grid, and
`earliestInstall` counts from the wrong day.

**Fix:** add one shared helper that renders a `'YYYY-MM-DD'` business day in
`BUSINESS_TZ`, using the pattern already correct in `src/lib/xero/invoices.ts:49-61`:
```ts
// src/lib/business-day.ts
export function businessYMD(d = new Date(), tz = process.env.BUSINESS_TZ || "Australia/Sydney") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
```
Replace every `…toISOString().slice(0,10)` day-derivation in the files above with
`businessYMD(...)`. Add unit tests that pin `TZ=UTC` and assert the correct
business day at 02:00Z.

**Verify:** with `TZ=UTC`, Monday 02:00Z resolves to the correct Sydney Monday;
add tests to `capacity.test.ts` / a new `business-day.test.ts`.

---

## P1 — High (fix this week; several are demo-visible)

### P1-1 · Login has no `catch` — a network blip leaves the button stuck on "Signing in…" forever
**File:** `app/src/app/login/page.tsx:13-30`
`setBusy(false)` only runs on the non-ok path; a thrown fetch is an unhandled
rejection and the spinner never resolves. This is the *first* screen in the demo,
on venue wifi. **Fix:** wrap in `try/catch/finally`; on catch show "Couldn't reach
the server" and re-enable the button. Apply the same to `PortalLogin.tsx:12-22`
(P1-8) and `SetupWizard.tsx:29-38` (show the error).

### P1-2 · Systemic: mutating handlers use `try/finally` with no `catch` — failures render celebratory empty states or silently no-op
**Files (worst first):** `app/src/app/today/page.tsx:34-59,66-74` (failed load shows "🎉 Nothing on today"; Start/Complete fail silently); `app/src/app/jobs/[id]/page.tsx:98-109,230-243,271-277,280-293,307-321` (failure shows "Job not found"; stage/delete/reread/sync give no feedback); `app/src/components/QuoteBuilder.tsx:47-56` (failed load → "No quote yet" + Create button that duplicates an existing quote); `app/src/app/invoices/page.tsx:49-51,615-619`; `app/src/components/FactoryTablet.tsx:36-44`; `app/src/components/LeadInbox.tsx:31-39`; `app/src/components/VariationList.tsx:40-47`; `DrawingSets`, `SnagList`, and the client-facing `app/src/components/PortalMessages.tsx:25-33` ("Send" quietly fails).
**Fix:** adopt the Dashboard's correct pattern (`dashboard.tsx:107-122`: catch → retry card) everywhere — a `catch` that surfaces an error state on load, and a catch+toast on every mutating handler. Route raw `fetch` calls through the throwing `api()` helper where practical.

### P1-3 · `raiseSnag` never checks `res.ok` — false "Snag raised" and the note is destroyed on server error
**File:** `app/src/components/FieldRunSheet.tsx:89-105`
Raw fetch; on 4xx/5xx it still increments the open-snag count, clears the
note/photo, and toasts success. An installer's on-site defect log is lost while
they believe it's recorded. **Fix:** check `res.ok`; keep the form values on
failure; show the error.

### P1-4 · FactoryTablet actions swallow or ignore errors — QC photos "saved" that never persisted
**File:** `app/src/components/FactoryTablet.tsx:135-178`
Only 409 is handled on "Done" (143-161); non-409/500 falls through to
`onChanged()` with no message; network errors are unhandled rejections;
`photo()` (169-178) *silently swallows* errors so a worker thinks a QC photo saved
when it didn't. **Fix:** route through `api()` and show an error banner on the
card; never advance the card on failure.

### P1-5 · Money and factory-override flows use `window.confirm` / `window.prompt`, which the codebase itself documents as unreliable in the installed PWA
**Files:** `app/src/app/invoices/page.tsx:321,332` (Authorise in Xero / Void); `app/src/components/FactoryTablet.tsx:154`; `app/src/components/FactoryBoard.tsx:65`; `app/src/components/InstallBooking.tsx:50`; `app/src/app/expenses/page.tsx:158`. (See the explanatory comment at `app/src/app/jobs/[id]/page.tsx:266` for why job-delete avoids `confirm`.)
On a standalone factory tablet the QC "Complete anyway — enter a reason" prompt
never appears (blocked station can't be overridden); in the office PWA
"Authorise & send to Xero" appears to do nothing. **Fix:** replace with the
existing `Modal` / inline two-tap confirm pattern.

### P1-6 · QuoteBuilder version switch silently discards unsaved edits
**File:** `app/src/components/QuoteBuilder.tsx:202-216` (+ `loadInto` at 39-45)
No `dirty` guard before `loadInto`. Glancing at v1 mid-edit throws away 10 minutes
of work with no warning. **Fix:** confirm (or auto-save) before switching when
`dirty`.

### P1-7 · `nextInvoiceNumber()` is a read-modify-write with no retry — concurrent invoice creation 500s and silently drops the invoice
**File:** `app/src/lib/invoices.ts:45-53,106-108`
No P2002 retry (unlike `createJobWithReference`). A portal auto-deposit racing an
office invoice both compute `INV-1042`; the loser 500s and the accept route's
`catch` only `console.error`s, so the deposit invoice is silently never created.
Also loads *every* invoice row to find the max. **Fix:** wrap the create in the
same P2002-retry loop used in `src/lib/utils.ts`; compute the max with a single
ordered query.

### P1-8 · Portal magic-link token is not single-use — replayable for its full 1-hour TTL
**File:** `app/src/app/api/portal/verify/route.ts:14-24`
On redemption it only sets `lastUsedAt`; it never deletes/consumes the token, and
the lookup only checks `expiresAt > now`. Anyone who obtains the emailed link
(forwarding, shared device, mailbox access) can mint fresh portal sessions for
that client for the whole hour; and because `verify` is a `GET`, link-preview
bots can consume it. **Fix:** atomically single-use — `updateMany({ where: { id,
usedAt: null }, data: { usedAt: new Date() } })` and reject when `count === 0`
(add a `usedAt` column) — or delete the row on first redemption.

### P1-9 · Final invoice credits only *payments received*, never an outstanding deposit invoice — clients can be double-billed
**Files:** `app/src/lib/handover.ts:28-49`, `app/src/app/api/jobs/[id]/handover/route.ts:69`
`paidIncCents` sums `amountPaid` across invoices and is **unfiltered by status**
(voided invoices count). If the deposit invoice is authorised but not yet paid at
handover, `paidIncCents = 0` and the final invoice bills the full contract while
the deposit is still outstanding → 130% of contract billed. **Fix:** credit
raised (submitted/authorised/paid, non-voided) invoice totals — or block handover
invoicing while a deposit invoice is unpaid. Fix alongside P0-8 (same money flow).

### P1-10 · `autoDraftInvoiceOnComplete` never fires once a deposit exists, and the job then shows as "billed"
**Files:** `app/src/lib/invoices.ts:204-210`, `app/src/lib/job-list.ts:32-38`
The auto-draft skips when *any* non-voided invoice exists — the deposit always
exists in the modern flow, so completing via status/stage PATCH (bypassing the
handover ceremony) never drafts the balance invoice. And `job-list` marks a
completed job "billed" if *any* invoice left draft, so the 30% deposit alone
clears the `unbilled` flag and the missing 70% never surfaces. **Fix:** exclude
deposit invoices from both checks (tag deposit invoices, or compare invoiced total
against contract total).

### P1-11 · `prisma migrate deploy` runs as a side effect of `npm run build`
**File:** `app/package.json:8` (`"build": "prisma generate && prisma migrate deploy && next build"`)
Any `npm run build` — a dev building with a copied prod `.env`, or a future CI —
silently migrates whatever `DATABASE_URL` points at. Combined with the deploy
order (migrate → build → reload), the old app serves against the new schema for
the whole build window, and a failed build leaves old code on a migrated DB.
**Fix:** drop `prisma migrate deploy` from the build script (keep `prisma
generate`). In deploy scripts (`deploy/update.sh`, `deploy/auto-update.sh`) build
first, then backup + migrate, then reload. Update `docs/` if it references the
build command.

### P1-12 · Email header injection via `job.clientEmail`
**Severity: High-ish (spoofed/BCC'd automated client emails)**
**Files:** `app/src/lib/google/gmail.ts:63` (`To: ${to}`), value stored verbatim by `app/src/app/api/jobs/[id]/route.ts:54-56`
A `clientEmail` containing `\r\nBcc: attacker@x.com` injects headers into every
automated email for that job. **Fix:** reject addresses containing whitespace/CR/LF
at write time (reuse `EMAIL_RE` from `src/lib/enquiry.ts`) in the job PATCH/POST
and enquiry paths; defensively strip CR/LF in `gmail.ts` before interpolation.

---

## P2 — Medium (fix before or shortly after launch)

### Authorization — replace bare `isAuthenticated()` with the right `requirePermission(...)`
The middleware enforces authentication but not role; these handlers are reachable
by roles the matrix excludes. One mechanical fix each.

- **P2-A1** `app/src/app/api/jobs/route.ts` `POST` → `manage_jobs` (job creation, fires automations).
- **P2-A2** `app/src/app/api/jobs/[id]/documents/route.ts` `POST`/`PATCH`/`DELETE` → `manage_jobs`, **and** add a served-content-type allowlist (raster images + `application/pdf`) or force `content-disposition: attachment` for other types. Today `body.mimeType` is stored verbatim and the portal + staff `GET` stream it back `inline` → an uploaded `text/html`/SVG "document" shared to the client is **stored XSS**. (Contrast the deliberate raster-only allowlist already in `settings` PATCH.)
- **P2-A3** `app/src/app/api/installers/route.ts` `POST` and `app/src/app/api/installers/[id]/route.ts` `PATCH`/`DELETE` → `manage_jobs`.
- **P2-A4** `app/src/app/api/lead-sources/route.ts` `POST` and `.../lead-sources/[id]/route.ts` `PATCH`/`DELETE` → `manage_settings`.
- **P2-A5** Job write sub-resources, all → `manage_jobs`: `jobs/[id]/trades/route.ts` + `.../trades/[tradeId]/route.ts`; `jobs/[id]/todos/route.ts`; `jobs/[id]/maintenance/route.ts`; `jobs/[id]/duplicate/route.ts`; `jobs/[id]/photos/route.ts`; `jobs/[id]/report/route.ts` + `.../report/autofill/route.ts`; `jobs/[id]/reread-images/route.ts`; `jobs/[id]/sync-pdfs/route.ts`.
- **P2-A6** Integration toggles → `manage_settings`: `auth/google/route.ts`, `auth/google/disconnect/route.ts`, `auth/xero/route.ts`, `auth/xero/disconnect/route.ts`; plus `calendar/sync`, `maintenance/dedupe-drive`, `summary/weekly`.
- **P2-A7** Hardware writes → `factory_board`: `hardware/route.ts` `POST`, `hardware/[id]/route.ts` `PATCH`/`DELETE`, `hardware/[id]/action/route.ts` `POST`.

*(Add a test per category to `permissions.test.ts` asserting the excluded role gets 403.)*

### Backend correctness

- **P2-B1** Handover ceremony not idempotent — every POST drafts another final invoice + pack + Approval. `app/src/app/api/jobs/[id]/handover/route.ts:76`. **Fix:** short-circuit (return the existing invoice) when a non-voided, non-deposit invoice already exists; ideally make the route idempotent behind a transactional check.
- **P2-B2** `PATCH /api/jobs/[id]` has no status/stage validation. `app/src/app/api/jobs/[id]/route.ts:69-95`. `{"status":"banana"}` persists garbage (maps to ENQUIRY, un-schedules the job); any backward stage move re-runs the target stage's entry side-effects (dragging HANDOVER→DEPOSIT re-emails the client). **Fix:** validate `status` against `JOB_STATUSES` and reject unknowns; for backward stage moves require an explicit flag or suppress side-effects. Do with P0-4.
- **P2-B3** Accepted/sent quotes remain fully editable. `app/src/app/api/jobs/[id]/quotes/[quoteId]/route.ts:20-48`. **Fix:** reject `PATCH` when `status !== "draft"` (mirror `isRevisionLocked` in `drawings.ts`), or snapshot the accepted totals onto the Approval.
- **P2-B4** Editing any expense field silently recomputes GST as total/11, discarding the receipt's explicit GST; `splitGst` also rejects a legitimate $0.00. `app/src/app/api/expenses/[id]/route.ts` PATCH, `app/src/lib/expenses.ts:60-67`. **Fix:** default `explicitGst` to `existing.gst` when the field isn't in the body; accept `explicitGst >= 0`.
- **P2-B5** Visit/install clash checks are check-then-create with no transaction; unassigned visits skip clash checking. `app/src/app/api/jobs/[id]/visits/route.ts:67-104`, `.../install/route.ts:71-102`. **Fix:** re-run the overlap query inside a `$transaction` immediately before create; clash-check unassigned visits too.
- **P2-B6** Install rebooking cancels the prior visit without deleting its Google Calendar event → orphaned install events (crew shows up on the old date). `app/src/app/api/jobs/[id]/install/route.ts:94`. **Fix:** `deleteJobEvent` the prior scheduled INSTALL events before cancelling (the single-visit DELETE route already does this correctly).
- **P2-B7** `runStageTransition` swallows every side-effect failure with an empty catch — money/email automation failures vanish. `app/src/lib/automations.ts:225-231`. **Fix:** `console.error` + best-effort `logActivity(job.id, "error", …)` in the catch.
- **P2-B8** Transient Anthropic failure is indistinguishable from "AI not configured" during lead scan → a multi-job email collapses to one junk job and is permanently marked processed. `app/src/lib/vision.ts:157-159`, `app/src/lib/leads.ts:104-156,232-234`. **Fix:** return `{ ok: false }` on API error (distinct from not-configured); on error skip and do **not** upsert `ProcessedEmail` so the next scan retries.
- **P2-B9** `scanForLeads` check-then-act on `ProcessedEmail` — overlapping scans double-import. `app/src/lib/leads.ts:91-94,232`. **Fix:** `create` the `ProcessedEmail` row first as a lock (unique `messageId`, catch P2002 to skip), update counts at the end.

### Frontend

- **P2-F1** Installer job page calls staff-gated `/api/jobs/*`, so a real installer (no staff cookie) dead-ends and loses ticks. `app/src/app/installer-portal/[installerId]/jobs/[jobId]/page.tsx:43-56`. Resolve as part of P0-1 (give the installer portal its own auth + token-scoped API access, or gate it and say so).
- **P2-F2** Offline photo queue: 4xx-rejected photos are stuck forever with no UI to remove them; a lost response on a saved photo causes a duplicate on replay (no idempotency key). `app/src/lib/offline-queue.ts:130-145`, `app/src/components/FieldRunSheet.tsx:113-123`. **Fix:** drop-with-notice on 4xx, add a client-generated idempotency key per photo (dedupe server-side), expose the pending queue.
- **P2-F3** RescheduleModal date can never be cleared — render-time re-init snaps it back, so the unschedule path is unreachable; `save()` has no catch. `app/src/components/RescheduleModal.tsx:32-35,88-99`. **Fix:** initialise via an effect keyed on `open`; catch/report save errors.
- **P2-F4** PortalLogin shows "a sign-in link is on its way" even when the request never left the device. `app/src/components/PortalLogin.tsx:12-22`. **Fix:** only `setSent(true)` on `res.ok`; show a reach-the-server error on throw. (Keep the enumeration-safe message for real 200s.)
- **P2-F5** Hydration mismatch: "today" computed with the server clock in SSR'd client components → wrong day each morning for AU users on a UTC server, plus a React hydration error. `app/src/app/today/page.tsx:32,81`, `app/src/app/dashboard.tsx:214-227,416-421`. **Fix:** gate these strings behind a mounted check or compute in `useEffect` (pairs with P0-11).
- **P2-F6** Fire-and-forget toggles look dead on failure (`.catch(() => {})` then reload): `PhotoUpload.toggleShare` (123-130), `TradeSchedule.setStatus/remove` (51-58), `PlanReview.remove` (45-48), `SiteVisitBooking.cancel` (74-77). **Fix:** surface the error via toast on catch.

### Config / deploy / ops

- **P2-C1** Login is the only rate-limited endpoint (nginx `limit_req` at `deploy/nginx-harringtonkitchens.conf:22-30`); `api/auth/reset/*`, `api/auth/invite`, and token-based `api/portal/*` are unthrottled (reset-email spam, portal-token brute-forcing). Also there's no app-level login lockout. **Fix:** add `limit_req` to those locations; add per-account+per-IP throttling/backoff on `/api/auth/login` and a short per-email cooldown on reset/portal-login.
- **P2-C2** `sw.js` is auth-gated by the proxy matcher (`app/src/proxy.ts:64` excludes `manifest.webmanifest`/`icon.svg`/`favicon.ico` but not `sw.js`) → SW registration 307s to `/login`; after the cookie expires, SW update checks fail and pin a stale worker. **Fix:** add `sw.js` to the matcher exclusion list.
- **P2-C3** Service worker cache is never versioned and precaches the auth-gated `/`. `app/public/sw.js:9-22`. Content-hashed `/_next/static/` from every build accumulates on installers' phones, and cached dashboard HTML (client data) persists after silent session expiry. **Fix:** embed a build ID in the cache name (bump on deploy) or prune non-current `/_next/static` on activate; precache a public `/offline` page instead of `/`.
- **P2-C4** No error monitoring, and cron output is discarded. No Sentry anywhere; `deploy/setup-cron.sh:34,36` end in `>/dev/null 2>&1`, so a failed Friday inbox scan (expired Gmail token / rotated `CRON_SECRET`) loses job leads silently. **Fix:** add an error-reporting SDK (Sentry has Next 16 support), install `pm2-logrotate`, log cron output to a file, and alert on non-2xx.
- **P2-C5** Auto-update backs up the live SQLite DB with plain `cp` (misses `-wal`/`-shm`). `deploy/auto-update.sh:56-58`, `deploy/DEPLOY.md:130`. **Fix:** use `sqlite3 "$DB" ".backup '$OUT'"` (the correct method is already documented in `docs/OPERATIONS.md:30`).
- **P2-C6** Whole stack runs as root (`deploy/install.sh:33-36,111-113`; clones into `/root`). The app parses untrusted email attachments/images/PDFs — an RCE there is instant root. **Fix:** run the app/pm2 as a dedicated unprivileged user; keep root only for nginx/certbot/ufw.
- **P2-C7** CI has no dependency-audit step and nothing shows merges are gated. `.github/workflows/ci.yml`. **Fix:** add `npm audit --omit=dev --audit-level=high`; enable branch protection requiring the `build` job on `main`.

---

## P3 — Low / polish (fast follow)

### Backend
- **P3-1** `combineDateTime` wrong-year "safety net" corrupts genuinely recent past dates (>7 days → +1 year). `app/src/lib/leads.ts:264-269`. Only bump when >~11 months past.
- **P3-2** Company attribution fails when `LeadSource.email` is a full address not a bare domain (`domain.includes(s.email)`). `app/src/lib/leads.ts:98`, `app/src/lib/clients.ts:52`. Compare against the domain part.
- **P3-3** Per-line vs whole-subtotal rounding: `computeTotals` (`invoices.ts:24-31`) whole-sums where `lineTotalCents` (`quote.ts:98-101`) rounds per line → quote/invoice can disagree by 1c. Round per line in `computeTotals` too.
- **P3-4** `proposeBlocks` can schedule work in the past (no floor at today). `app/src/lib/capacity.ts:211-233`. Clamp at today; report the shortfall.
- **P3-5** User-supplied `body.reference` defeats the job-create retry loop → opaque 500 on collision. `app/src/app/api/jobs/route.ts:36`. Detect the custom-reference P2002 and return 409.
- **P3-6** Insights money figures are unrounded float accumulations and bucket `amountPaid` by `issueDate`. `app/src/lib/insights.ts:83-127`. `round2` the summary fields.

### Frontend / UX / a11y
- **P3-7** `jf-offline-synced` is dispatched but has no listeners — job page stays stale after a reconnect sync. `app/src/components/OfflineBar.tsx:28`. Subscribe in the job/field pages, or delete the dead event.
- **P3-8** Checklist delete button is `opacity-0 group-hover:` → invisible (but tappable) on touch, in a mobile-first app. `app/src/components/Checklist.tsx:97-105`. Always visible below `lg`.
- **P3-9** Accessibility: placeholder-only inputs / unassociated labels on login (`login/page.tsx:37-54`), portal login (`PortalLogin.tsx:37-46`), and `JobForm` (`JobForm.tsx:172-303`). Add `aria-label` or `htmlFor`/`id` pairs.
- **P3-10** FactoryScanner records `lastCodeRef` before the busy bail, so a second part scanned within ~2.5s is remembered-then-ignored with no feedback. `app/src/components/FactoryScanner.tsx:46-49`. Record `lastCodeRef` only after passing the busy check.
- **P3-11** SignaturePad canvas is sized once on mount — rotating the tablet mid-signature offsets the ink. `app/src/components/SignaturePad.tsx:28-48`. Re-rasterise on `ResizeObserver`.
- **P3-12** SetupWizard "Finish setup" fails with zero feedback. `app/src/components/SetupWizard.tsx:29-38`. Show the error (also listed under P1-1's family).

### White-label / config hygiene
- **P3-13** QR protocol prefix `HK:` is baked into printed labels + scanner, contradicting `brand.ts:44-49` ("internal identifiers must never carry a customer name"). `app/src/lib/labels.ts:42`, `app/src/components/FactoryScanner.tsx:44`. Derive the prefix from `INTERNAL`/config. Also the SetupWizard placeholder "e.g. Harrington Kitchens" names a real customer — make it generic.
- **P3-14** CSP allows `'unsafe-inline'` scripts. `app/next.config.mjs:27`. Move to a nonce-based CSP (Next's documented pattern in `proxy.ts`) or consciously accept the residual risk. Header set is otherwise strong.
- **P3-15** PWA icons are SVG-only → iOS home-screen installs get no real icon. `app/src/app/manifest.ts:15`, `app/src/app/layout.tsx:22`. Add 192/512 PNG (incl. `maskable`) + a 180px `apple-touch-icon`.
- **P3-16** CI tests on Node 22, prod runs Node 20 (`ci.yml:32` vs `install.sh:20`) — pin both to the same major.
- **P3-17** `deploy/update.sh` doesn't take the auto-updater's `flock` — a manual update racing the every-minute cron can interleave. Wrap it in the same `flock`.
- **P3-18** `.gitignore` only covers `.env`/`.env.local` — a future `.env.production` would be committed. Change to `.env*` with `!.env.example`.
- **P3-19** Account-enumeration timing: `verifyPassword` short-circuits before scrypt when the user is missing (`login/route.ts` + `password.ts:23-24`); reset/portal only `await sendEmail` when the account exists. Run a dummy scrypt on the missing-user path; send email out-of-band so timing doesn't branch on existence.
- **P3-20** Weak password policy (length ≥ 8 only). `invite/route.ts`, `reset/confirm/route.ts`. Raise the minimum and screen against a common-password list.

### Lint (P3-lint)
`npm run lint` is 0 errors / 41 warnings: 39 are `react-hooks/set-state-in-effect`
(across ~40 components/pages that `setState` inside an effect on mount — mostly the
data-load pattern), plus one `react-hooks/exhaustive-deps` and one
`import/no-anonymous-default-export`. None are bugs today, but several of the
frontend fixes above (P2-F5 hydration, P1-2 load handlers) touch these effects —
clean up the warnings in the files you're already editing rather than a separate
sweep. Don't disable the rule globally.

---

## Suggested execution order (commit-sized)

1. **Security gate (P0-2, P0-3, P0-4 + B11, P0-7, P0-1)** — authorization + the
   unauth portal + default password. Highest risk, mostly mechanical.
2. **Dependency bump (P0-6)** — Next 16.2.11; re-run the full gate.
3. **Money correctness (P0-8, P0-9, P0-10, P1-9, P1-10, P1-7)** — the quote →
   deposit → handover chain; ship with tests.
4. **Dates (P0-11 + P2-F5)** — the shared `businessYMD` helper + call sites.
5. **Offline + error handling (P0-5, P1-1..P1-6, P2-F*)** — the frontend
   discipline pass.
6. **Remaining P2 authorization + backend + ops.**
7. **P3 polish** as time allows.

After each tier: `cd app && npm run typecheck && npm run lint && npm test && npm run build`.

## Definition of done for the launch
- [ ] `npm audit --omit=dev` → 0 high.
- [ ] Full gate green (typecheck, lint, tests, build).
- [ ] Logged-out `/installer-portal` exposes no client data.
- [ ] A non-ADMIN/OFFICE role gets 403 on settings PATCH, export, job PATCH/DELETE, and every P2-A route (covered by tests).
- [ ] Accept-quote → deposit is exactly-once; handover final invoice equals accepted contract − payments and is never negative; concurrent invoice creation doesn't drop an invoice.
- [ ] Offline queue retains writes on an expired session and surfaces an unsynced state.
- [ ] No `benchline-demo` fallback reachable in production.
