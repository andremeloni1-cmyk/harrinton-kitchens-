#!/usr/bin/env bash
# Checks for new commits on the deployed branch and redeploys when they land.
# Designed to run every minute from cron (see setup-autoupdate.sh) — the check
# is a cheap `git fetch`; the full deploy only runs when the remote moved.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_FILE="$SCRIPT_DIR/.autoupdate-state"
BACKUP_DIR="$APP_DIR/prisma/backups"
MAX_FAILURES=5
KEEP_BACKUPS=14

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Never let two runs overlap — a build takes longer than the cron interval.
exec 9>"/tmp/harringtonkitchens-autoupdate.lock"
flock -n 9 || exit 0

cd "$APP_DIR"

git fetch --quiet origin || { log "fetch failed (network?) — will retry next run"; exit 0; }

TARGET="$(git rev-parse '@{u}' 2>/dev/null)" || { log "no upstream configured for the current branch"; exit 0; }

# State file: line 1 = last successfully deployed sha, line 2 = "<sha> <failures>".
LAST_DEPLOYED=""
FAIL_SHA=""
FAIL_COUNT=0
if [[ -f "$STATE_FILE" ]]; then
  LAST_DEPLOYED="$(sed -n 1p "$STATE_FILE")"
  read -r FAIL_SHA FAIL_COUNT < <(sed -n 2p "$STATE_FILE") || true
  FAIL_COUNT="${FAIL_COUNT:-0}"
fi
# First run on an already-deployed server: treat the current checkout as deployed.
[[ -z "$LAST_DEPLOYED" ]] && LAST_DEPLOYED="$(git rev-parse HEAD)"

[[ "$TARGET" == "$LAST_DEPLOYED" ]] && exit 0

# Back off after repeated failures on the same commit so a broken build doesn't
# rebuild-loop the VPS every minute. Push a fix (new sha) to resume.
if [[ "$FAIL_SHA" == "$TARGET" && "$FAIL_COUNT" -ge "$MAX_FAILURES" ]]; then
  log "SKIPPING $TARGET — failed $FAIL_COUNT times; push a fix or run deploy/update.sh manually"
  exit 0
fi

log "New commit on ${TARGET:0:9} (deployed: ${LAST_DEPLOYED:0:9}) — deploying"

deploy() {
  if [[ "${AUTOUPDATE_DRY_RUN:-}" == "1" ]]; then
    log "dry-run: would back up DB, pull, install, build, migrate, reload"
    return "${AUTOUPDATE_DRY_RUN_RC:-0}"
  fi

  # Safety net: snapshot the SQLite file before migrations touch it.
  if [[ -f "$APP_DIR/prisma/harringtonkitchens.db" ]]; then
    mkdir -p "$BACKUP_DIR"
    cp "$APP_DIR/prisma/harringtonkitchens.db" "$BACKUP_DIR/$(date +%Y%m%d-%H%M%S)-${TARGET:0:9}.db"
    ls -1t "$BACKUP_DIR"/*.db 2>/dev/null | tail -n "+$((KEEP_BACKUPS + 1))" | xargs -r rm -f
  fi

  # Build BEFORE migrating: the build no longer migrates, so the running app
  # stays on the old schema until the build succeeds; only then do we migrate +
  # reload. A failed build aborts the chain, never leaving old code on a new DB.
  git pull --ff-only &&
    { npm ci || npm install; } &&
    npm run build &&
    npx prisma migrate deploy &&
    # Best-effort admin bootstrap (never fails the deploy) so per-user auth can't
    # lock out an in-place update that started with an empty User table.
    { npm run ensure-admin || true; } &&
    pm2 reload harringtonkitchens --update-env
}

if deploy; then
  printf '%s\n' "$TARGET" > "$STATE_FILE"
  log "Deployed ${TARGET:0:9} successfully"
else
  if [[ "$FAIL_SHA" == "$TARGET" ]]; then
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    FAIL_COUNT=1
  fi
  printf '%s\n%s %s\n' "$LAST_DEPLOYED" "$TARGET" "$FAIL_COUNT" > "$STATE_FILE"
  log "Deploy of ${TARGET:0:9} FAILED (attempt $FAIL_COUNT/$MAX_FAILURES) — retrying next run"
  exit 1
fi
