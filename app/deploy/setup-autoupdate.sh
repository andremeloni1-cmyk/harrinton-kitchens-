#!/usr/bin/env bash
# Sets up automatic deployment: every minute the VPS checks GitHub for new
# commits on the deployed branch and redeploys when one lands (~1 min from
# push to live). Run once on the VPS:  sudo bash deploy/setup-autoupdate.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/joineryflow-autoupdate.log"

chmod +x "$SCRIPT_DIR/auto-update.sh"
touch "$LOG_FILE"

LINE="* * * * * bash $SCRIPT_DIR/auto-update.sh >> $LOG_FILE 2>&1"

# Install/replace the cron entry idempotently (same pattern as setup-cron.sh).
TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v 'auto-update.sh' > "$TMP" || true
echo "$LINE" >> "$TMP"
crontab "$TMP"
rm -f "$TMP"

echo "Done. New commits on the deployed branch go live within ~1 minute."
echo "Watch it with:  tail -f $LOG_FILE"
echo "Current crontab:"
crontab -l | grep 'auto-update.sh'
