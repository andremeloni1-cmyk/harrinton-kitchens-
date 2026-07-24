#!/usr/bin/env bash
# Pull the latest code and redeploy Harrington Kitchens (run from anywhere as root).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

echo "==> Pulling latest"
git pull --ff-only

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
