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

echo "==> Migrating database"
npx prisma migrate deploy

echo "==> Ensuring an admin login exists"
# Best-effort (never fails the deploy): bootstraps the owner as ADMIN if the
# User table is empty, so an in-place update can't lock everyone out.
npm run ensure-admin || echo "   (ensure-admin skipped — see log above)"

echo "==> Building"
npm run build

echo "==> Reloading pm2"
pm2 reload harringtonkitchens --update-env
echo "==> Done"
