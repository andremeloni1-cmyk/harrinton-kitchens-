# User guide (by role)

A short per-role walkthrough. Everyone signs in with their own email + password;
what you see is scoped to your role. Admins set roles in **Settings → Team**.

## First run (admin)

On a brand-new instance the first sign-in opens the **setup wizard**: enter your
company name and brand accent, confirm the factory stations, optionally connect
Google and Xero, invite your team, and (optionally) create a sample job. That's
it — the workspace is ready. You can change everything later in Settings.

## Office / Admin

Your home is the **dashboard**. From the top down:

- **Your brief** — money this week, overdue invoices, quotes awaiting signature,
  drawings awaiting approval, and jobs at schedule risk.
- **Ask AI** — ask things like *"what's blocking the Nguyen job?"* or *"can we
  fit a 12-cabinet job before Christmas?"* (answers come from live data).
- **Risk watch** and **at-risk jobs** — surface only when there's something to act on.
- **Maintenance requests** — client portal service requests to convert into jobs.

Open any job to run its whole life: quote builder (with a live lead-time),
deposit, check-measure, drawings, variations, cut list, install booking, snags,
handover, invoices and the client message thread.

## Designer

You can manage jobs and drawings but not money. Upload drawing revisions, send
them to the client for review, read their comments, and release approved sets to
the factory. Post-approval changes auto-draft a variation so nothing slips
through unpriced.

## Factory

Your home is the **factory board**. Office/admins get the full board (columns per
station, drag to advance); factory-floor staff get the **tablet** view: pick your
station once, then a big-button queue with Done / Photo / Block.

- **Scan** parts with your phone/tablet camera to advance them at your station.
- **QC** station: tick each cabinet off before the job can leave QC.
- **Dispatch**: a job can't finish until every part is scanned out (override with
  a reason).
- **Schedule** (`/factory/schedule`): the week grid with utilisation heat — drag
  blocks to rebalance, auto-schedule a job backward from its install date.

## Installer

Your home is the **field run sheet** (`/field`): today's installs with tap-to-
navigate, tap-to-call the client, access/gate notes, and the approved drawings.
Add site photos (they queue if you're out of signal and sync later) and raise
snags on the spot. Run the handover with the client's signature when you're done.

## Clients (portal)

Clients get a no-app portal (magic-link sign-in): a project timeline with dates
and "what's next", plans to review and sign, progress photos your team has
shared, their invoices with pay links, a handover pack, and a message thread to
your office. They can also request a maintenance visit.
