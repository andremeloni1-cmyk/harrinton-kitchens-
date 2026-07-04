#!/usr/bin/env bash
# Sets up the automatic inbox check that imports new job leads.
# Runs once a week — Friday 7pm (job emails arrive weekly on Fridays).
# Run once on the VPS:  sudo bash deploy/setup-cron.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$APP_DIR/.env"

APP_URL="$(grep -E '^APP_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' || true)"
APP_URL="${APP_URL:-http://127.0.0.1:3000}"

# Run the schedule in the business timezone so "Friday 7pm" means local time,
# not the server's UTC clock.
TZ_VALUE="$(grep -E '^BUSINESS_TZ=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' || true)"
TZ_VALUE="${TZ_VALUE:-Australia/Sydney}"

# Ensure a CRON_SECRET exists in .env (generate one if missing/empty).
SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' || true)"
if [[ -z "$SECRET" ]]; then
  SECRET="$(openssl rand -hex 32)"
  if grep -qE '^CRON_SECRET=' "$ENV_FILE"; then
    sed -i "s#^CRON_SECRET=.*#CRON_SECRET=\"$SECRET\"#" "$ENV_FILE"
  else
    echo "CRON_SECRET=\"$SECRET\"" >> "$ENV_FILE"
  fi
  echo "Generated a new CRON_SECRET and saved it to .env"
  echo "Restarting app to pick it up..."
  pm2 restart joineryflow --update-env >/dev/null 2>&1 || true
fi

# Friday at 19:00, evaluated in TZ_VALUE (CRON_TZ applies to the lines below it).
LINE="0 19 * * 5 curl -fsS -X POST -H 'x-cron-secret: $SECRET' ${APP_URL%/}/api/leads/scan >/dev/null 2>&1"
# Weekly summary email — Monday at 08:00 (a look back at the week just gone).
SUMMARY_LINE="0 8 * * 1 curl -fsS -X POST -H 'x-cron-secret: $SECRET' ${APP_URL%/}/api/summary/weekly >/dev/null 2>&1"

# Install/replace the cron entries idempotently. Strip any previous lines we
# manage and the CRON_TZ, then re-add CRON_TZ followed by the weekly jobs.
TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v '/api/leads/scan' | grep -v '/api/summary/weekly' | grep -v '^CRON_TZ=' > "$TMP" || true
{ echo "CRON_TZ=$TZ_VALUE"; echo "$LINE"; echo "$SUMMARY_LINE"; } >> "$TMP"
crontab "$TMP"
rm -f "$TMP"

echo "Done."
echo "  • Inbox checked every Friday at 7pm ($TZ_VALUE)."
echo "  • Weekly summary emailed every Monday at 8am ($TZ_VALUE)."
echo "Current crontab:"
crontab -l | grep -E 'leads/scan|summary/weekly|CRON_TZ'
