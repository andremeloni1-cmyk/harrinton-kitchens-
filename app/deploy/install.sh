#!/usr/bin/env bash
# Benchline — one-shot deployment for a fresh Ubuntu 22.04/24.04 VPS.
# Idempotent: safe to re-run after pulling new code.
#
#   sudo DOMAIN=jobs.example.com EMAIL=you@example.com \
#        BRAND_NAME="Harrington Kitchens" OWNER_EMAIL=you@example.com \
#        bash deploy/install.sh
#
# White-label with BRAND_NAME (sets APP_NAME + NEXT_PUBLIC_APP_NAME). The first
# admin is bootstrapped from OWNER_EMAIL (+ OWNER_PASSWORD, else a generated one);
# on first sign-in the setup wizard configures the rest — no further env edits.
# Requires: a DNS A record for $DOMAIN pointing at this server (for TLS).
set -euo pipefail

# --- resolve paths -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

NODE_MAJOR="${NODE_MAJOR:-22}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
BRAND_NAME="${BRAND_NAME:-}"
OWNER_EMAIL="${OWNER_EMAIL:-}"
OWNER_PASSWORD="${OWNER_PASSWORD:-}"
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
  # A cron secret for the scheduled inbox scan / weekly summary.
  sed -i "s#^CRON_SECRET=.*#CRON_SECRET=\"$(openssl rand -hex 32)\"#" .env
  # White-label: set the platform name on both the server and client bundle.
  if [[ -n "$BRAND_NAME" ]]; then
    sed -i "s#^APP_NAME=.*#APP_NAME=\"$BRAND_NAME\"#" .env
    sed -i "s#^NEXT_PUBLIC_APP_NAME=.*#NEXT_PUBLIC_APP_NAME=\"$BRAND_NAME\"#" .env
  fi
  # First admin: bootstrap from OWNER_EMAIL; generate a password if none given.
  if [[ -n "$OWNER_EMAIL" ]]; then
    sed -i "s#^OWNER_EMAIL=.*#OWNER_EMAIL=\"$OWNER_EMAIL\"#" .env
    if [[ -z "$OWNER_PASSWORD" ]]; then OWNER_PASSWORD="$(openssl rand -base64 12)"; GEN_PW=1; fi
    sed -i "s#^OWNER_PASSWORD=.*#OWNER_PASSWORD=\"$OWNER_PASSWORD\"#" .env
  fi
  # Web-push (phone notifications) — generate VAPID keys if the tool is present.
  if npx --no-install web-push generate-vapid-keys --json >/tmp/vapid.json 2>/dev/null; then
    VPUB="$(node -e 'process.stdout.write(require("/tmp/vapid.json").publicKey)')"
    VPRIV="$(node -e 'process.stdout.write(require("/tmp/vapid.json").privateKey)')"
    sed -i "s#^VAPID_PUBLIC_KEY=.*#VAPID_PUBLIC_KEY=\"$VPUB\"#" .env 2>/dev/null || true
    sed -i "s#^VAPID_PRIVATE_KEY=.*#VAPID_PRIVATE_KEY=\"$VPRIV\"#" .env 2>/dev/null || true
    rm -f /tmp/vapid.json
  fi
  echo "  -> .env created (chmod 600)."
  [[ -n "${GEN_PW:-}" ]] && echo "     Admin login: $OWNER_EMAIL / $OWNER_PASSWORD  (change it after first sign-in)"
  echo "     Add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / XERO_* / ANTHROPIC_API_KEY when ready — all optional."
else
  chmod 600 .env 2>/dev/null || true
fi

# --- 5. build ----------------------------------------------------------------
log "Installing dependencies"
npm ci || npm install

log "Applying database migrations"
npx prisma migrate deploy
# Seed templates + demo data on first run (set SEED=0 for a clean branded launch).
[[ "${SEED:-1}" == "1" ]] && { npx prisma db seed || true; }
# Deploy-safety: guarantee an admin login exists (bootstraps from OWNER_EMAIL).
log "Ensuring an admin login exists"
npm run ensure-admin || true

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

# --- 10. smoke test ----------------------------------------------------------
log "Running smoke test"
sleep 3 # give pm2 a moment to bind the port
bash deploy/smoke.sh "http://127.0.0.1:$APP_PORT" || echo "  smoke test failed — check 'pm2 logs'"

log "Done. App: ${DOMAIN:+https://$DOMAIN}  |  pm2 status: pm2 status"
echo "  First sign-in lands on the setup wizard to finish white-labelling."
