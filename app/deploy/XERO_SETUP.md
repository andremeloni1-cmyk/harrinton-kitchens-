# Connecting JoineryFlow to Xero

JoineryFlow pushes invoices into Xero, pulls payment statuses back, and shows
your Profit & Loss straight from your books. It needs a (free) Xero developer
app so it can talk to your organisation.

## 1. Create the Xero app

1. Sign in at <https://developer.xero.com/app/manage> with your Xero login.
2. **New app** → give it a name (e.g. "JoineryFlow"), choose **Web app**.
3. Company or application URL: your app URL (e.g. `https://jobs.yourdomain.com`).
4. **Redirect URI** — must be exactly:

   ```
   https://jobs.yourdomain.com/api/auth/xero/callback
   ```

   (Use `http://localhost:3000/api/auth/xero/callback` for local dev.)
5. Under **Configuration**, copy the **Client id** and generate a
   **Client secret**.

## 2. Configure the server

Add to `.env` (see `.env.example`):

```
XERO_CLIENT_ID="...from the Xero app..."
XERO_CLIENT_SECRET="...from the Xero app..."
XERO_SALES_ACCOUNT_CODE="200"     # your Sales account code in Xero's chart of accounts
XERO_EXPENSE_ACCOUNT_CODE="400"   # account receipts post to (also settable per-account in Settings)
```

Restart the app (`pm2 restart joineryflow --update-env`).

## 3. Connect

Open **Settings → Xero integration → Connect Xero**, sign in, and pick your
organisation. Settings then shows "Connected to <your org>".

## What happens once connected

- Completing a job drafts an invoice from its quote and pushes it to Xero as a
  **draft**. Review it on the Money tab, then **Authorise & send to Xero**.
- Clients are matched to Xero contacts by email (then name), created if
  missing, and linked for future invoices.
- Payment statuses (paid / amounts due) sync back when you open the Money tab
  (throttled to every 5 minutes) — or on the daily cron below.
- The **P&L** tab shows Xero's Profit and Loss report for any period.
- **Receipts** (Money → Receipts): snap a photo, JoineryFlow reads the vendor,
  date, total and GST, and can push it to Xero as a **spend-money** transaction
  with the image attached — so it's a one-tap reconcile against your bank feed.
  Pick which bank account they post to under **Settings → Xero**.

> **Reconnect after upgrading:** receipts need three extra Xero permissions
> (`accounting.banktransactions`, `accounting.attachments`,
> `accounting.settings.read` — the last lists your bank accounts). If you
> connected Xero before this feature shipped, open **Settings → Xero →
> Disconnect**, then **Connect Xero** again to grant them. Invoices and P&L keep
> working either way.

> **On bank reconciliation:** Xero does not allow apps to tick a bank line as
> reconciled via its API (that raw bank-feed data is protected under open-banking
> rules). JoineryFlow gets you as close as the API allows — the spend-money
> transaction lands pre-filled on Xero's reconcile screen for a one-tap confirm.

Without a connection everything still works locally — invoices just aren't in
your books, and receipts are saved here and feed your BAS (1B) until you connect.

## Optional: daily status sync (cron)

Payment statuses already refresh when you open the Money tab. For a daily
background sync (e.g. 7am), add a cron entry using the same `CRON_SECRET` as
the inbox scan (see `deploy/setup-cron.sh`):

```
0 7 * * * curl -fsS -X POST -H 'x-cron-secret: <CRON_SECRET>' https://jobs.yourdomain.com/api/xero/sync >/dev/null 2>&1
```

## Notes & limits

- Xero refresh tokens expire after **60 days without use**. If the app sits
  idle longer than that, Settings will show "Connect Xero" again — just
  reconnect.
- If your Xero org uses its own invoice auto-numbering, Xero may assign a
  different number; JoineryFlow shows both.
- Authorising an invoice requires a valid `XERO_SALES_ACCOUNT_CODE`; drafts
  push fine without one.
