#!/usr/bin/env bash
# Post-deploy smoke test (P13.2): confirms the app is up, the database is
# reachable, and the login page renders. Exits non-zero on any failure so it can
# gate a deploy.
#
#   bash deploy/smoke.sh [BASE_URL]        # defaults to http://127.0.0.1:$APP_PORT
set -euo pipefail

BASE="${1:-http://127.0.0.1:${APP_PORT:-3000}}"
fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

echo "Smoke-testing $BASE"

# 1. Health probe — app up + DB reachable.
HEALTH="$(curl -fsS --max-time 15 "$BASE/api/health" || true)"
echo "$HEALTH" | grep -q '"ok":true' || fail "health check did not return ok (got: ${HEALTH:-no response})"
echo "  ✓ health ok — $HEALTH"

# 2. Login page renders (the branded front door).
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/login" || true)"
[[ "$CODE" == "200" ]] || fail "login page returned HTTP $CODE"
echo "  ✓ login page renders (HTTP 200)"

echo "Smoke test passed."
