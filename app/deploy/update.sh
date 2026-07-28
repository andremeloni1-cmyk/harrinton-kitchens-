#!/usr/bin/env bash
# Pull the latest code and redeploy Harrington Kitchens (run from anywhere as root).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

# Take the same lock the every-minute auto-updater holds, so a manual update and
# a cron auto-update can't interleave (both build + migrate the same tree). Wait
# for an in-progress run to finish rather than bailing.
exec 9>"/tmp/harringtonkitchens-autoupdate.lock"
if ! flock -n 9; then
  echo "==> Another update is already running — waiting for it to finish…"
  flock 9
fi

echo "==> Pulling latest"
git pull --ff-only

# Next's type-check step is the memory high-water mark of the whole build, and
# Node's default old-space ceiling (~2GB) is below what this app now needs — it
# died with SIGABRT mid-build on a box with 6GB free. Raise it unless the caller
# already has an opinion. Not set in package.json: `NODE_OPTIONS=… npm run build`
# is shell syntax, and a Windows dev shouldn't inherit a deploy host's problem.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

echo "==> Installing deps"
npm ci || npm install

# Build BEFORE migrating: `npm run build` no longer migrates (that side effect is
# removed), so the old app keeps serving against the old schema during the build.
# Only after a successful build do we migrate + reload, so a failed build never
# leaves old code running against a migrated DB.
echo "==> Building"
npm run build

echo "==> Migrating database"
npx prisma migrate deploy

echo "==> Ensuring an admin login exists"
# Best-effort (never fails the deploy): bootstraps the owner as ADMIN if the
# User table is empty, so an in-place update can't lock everyone out.
npm run ensure-admin || echo "   (ensure-admin skipped — see log above)"

echo "==> Reloading pm2"
pm2 reload harringtonkitchens --update-env
echo "==> Done"
