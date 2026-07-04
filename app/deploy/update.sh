#!/usr/bin/env bash
# Pull the latest code and redeploy JoineryFlow (run from anywhere as root).
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

echo "==> Building"
npm run build

echo "==> Reloading pm2"
pm2 reload joineryflow --update-env
echo "==> Done"
