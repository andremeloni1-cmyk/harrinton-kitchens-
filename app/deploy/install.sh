#!/usr/bin/env bash
# Harrington Kitchens — one-shot deployment for a fresh Ubuntu 22.04/24.04 Hostinger VPS.
# Idempotent: safe to re-run after pulling new code.
#
#   sudo DOMAIN=jobs.example.com EMAIL=you@example.com bash deploy/install.sh
#
# Requires: a DNS A record for $DOMAIN pointing at this server (for TLS).
set -euo pipefail

# --- resolve paths -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

NODE_MAJOR="${NODE_MAJOR:-20}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
# Localhost port the app listens on behind nginx. Change (e.g. APP_PORT=3001)
# when another app on this VPS already uses 3000.
APP_PORT="${APP_PORT:-3000}"
export APP_PORT

log() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root (sudo)." >&2
  exit 1
fi

# --- 1. system packages ------------------------------------------------------
log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg ufw nginx

# --- 2. Node.js --------------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]]; then
  log "Installing Node.js $NODE_MAJOR via NodeSource"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
log "Node $(node -v), npm $(npm -v)"

# --- 3. pm2 ------------------------------------------------------------------
command -v pm2 >/dev/null 2>&1 || { log "Installing pm2"; npm install -g pm2; }

# --- 4. app config -----------------------------------------------------------
if [[ ! -f .env ]]; then
  log "Creating .env from template — EDIT IT before going live"
  cp .env.example .env
  chmod 600 .env   # secrets — owner-only
  # Best-effort fill from script args.
  if [[ -n "$DOMAIN" ]]; then
    sed -i "s#^APP_URL=.*#APP_URL=\"https://$DOMAIN\"#" .env
  fi
  SECRET="$(openssl rand -hex 32)"
  sed -i "s#^SESSION_SECRET=.*#SESSION_SECRET=\"$SECRET\"#" .env
  # Generate a login password too, so the dashboard is never left open by default.
  APPPW="$(openssl rand -base64 12)"
  sed -i "s#^APP_PASSWORD=.*#APP_PASSWORD=\"$APPPW\"#" .env
  echo "  -> .env created (chmod 600). Login password set to: $APPPW"
  echo "     Also set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / OWNER_EMAIL, then re-run."
else
  chmod 600 .env 2>/dev/null || true
fi

# --- 5. build ----------------------------------------------------------------
log "Installing dependencies"
npm ci || npm install

log "Applying database migrations"
npx prisma migrate deploy
npx prisma db seed || true   # seed templates + demo data on first run

log "Building the app"
npm run build

# --- 6. pm2 service ----------------------------------------------------------
log "Starting app under pm2"
pm2 start deploy/ecosystem.config.js --update-env || pm2 reload harringtonkitchens --update-env
pm2 save
pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true

# --- 7. nginx ----------------------------------------------------------------
if [[ -n "$DOMAIN" ]]; then
  log "Configuring nginx for $DOMAIN"
  SITE=/etc/nginx/sites-available/harringtonkitchens
  sed -e "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" -e "s/PORT_PLACEHOLDER/$APP_PORT/g" deploy/nginx-harringtonkitchens.conf > "$SITE"
  ln -sf "$SITE" /etc/nginx/sites-enabled/harringtonkitchens
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx

  # --- 8. firewall ---------------------------------------------------------
  log "Configuring firewall (ufw)"
  ufw allow OpenSSH || true
  ufw allow 'Nginx Full' || true
  yes | ufw enable || true

  # --- 9. TLS --------------------------------------------------------------
  if [[ -n "$EMAIL" ]]; then
    log "Requesting Let's Encrypt certificate"
    apt-get install -y certbot python3-certbot-nginx
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || \
      echo "  certbot failed — check DNS, then run: certbot --nginx -d $DOMAIN"
  else
    echo "  Set EMAIL=... to auto-request TLS, or run certbot manually later."
  fi
else
  echo "  DOMAIN not set — skipped nginx/TLS. App is on http://127.0.0.1:$APP_PORT"
fi

log "Done. App: ${DOMAIN:+https://$DOMAIN}  |  pm2 status: pm2 status"
