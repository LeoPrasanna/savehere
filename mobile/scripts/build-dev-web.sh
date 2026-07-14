#!/usr/bin/env bash
# Build the web bundle for local/Codespace testing via backend/dev_server.py.
#
#   ./scripts/build-dev-web.sh bypass   → no-keys bundle (fake Supabase); pair with
#                                         SAVEHERE_DEV_BYPASS=1 (default) dev_server
#   ./scripts/build-dev-web.sh real     → uses your mobile/.env (real Supabase keys);
#                                         pair with SAVEHERE_DEV_BYPASS=0 dev_server
#
# Both build same-origin: EXPO_PUBLIC_API_URL points at the forwarded :8000 URL,
# which dev_server.py serves the bundle from too (no CORS, no cross-port cookie).
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-bypass}"
API_URL="${EXPO_PUBLIC_API_URL:-https://cautious-guacamole-6w6xxjq57qp2q9r-8000.app.github.dev}"

if [ "$MODE" = "bypass" ]; then
  echo "Building BYPASS bundle (fake Supabase) → dist-dev"
  EXPO_PUBLIC_SUPABASE_URL=https://fake.supabase.co \
  EXPO_PUBLIC_SUPABASE_ANON_KEY=fake-anon-key \
  EXPO_PUBLIC_API_URL="$API_URL" \
    npx expo export --platform web --output-dir dist-dev --clear
  echo "Done. Run:  DATABASE_URL=sqlite:////tmp/savehere-dev.db python dev_server.py   (from backend/)"
  echo "Then open the forwarded :8000 URL and visit /dev-login"
else
  echo "Building REAL bundle from mobile/.env → dist-web"
  # Expo auto-loads mobile/.env; force the API URL to the forwarded backend.
  EXPO_PUBLIC_API_URL="$API_URL" \
    npx expo export --platform web --output-dir dist-web --clear
  echo "Done. Run:  SAVEHERE_DEV_BYPASS=0 DEV_WEB_DIR=dist-web DATABASE_URL=sqlite:////tmp/savehere-real.db python dev_server.py"
  echo "Then open the forwarded :8000 URL and log in through the app."
fi
