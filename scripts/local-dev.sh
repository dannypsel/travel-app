#!/usr/bin/env bash
# Local dev — no Docker, no AWS. Just uvicorn + vite, pointed at a Supabase
# Cloud dev project (the free tier gives you 2 projects: one for prod, one
# for dev — better parity than a local Docker Supabase, and nothing to run).
#
# One-time setup:
#   1. Create a dev project at https://supabase.com/dashboard
#   2. From the repo root: supabase link --project-ref <dev-project-ref> \
#        && supabase db push      (migrations live in supabase/ at repo root)
#   3. Copy api/.env.example to api/.env (not committed) and fill in:
#      SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
#      (from the dev project's API settings).
#   4. ./scripts/local-dev.sh
set -euo pipefail
cd "$(dirname "$0")/.."

die() { echo "✗ $1" >&2; exit 1; }

# Load the service .env if present (gitignored, never committed).
if [ -f api/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . api/.env
  set +a
fi

[ -n "${SUPABASE_URL:-}" ] \
  || die "SUPABASE_URL is not set. Create a dev Supabase project, run the migrations (see header), and put the API keys in api/.env"
[ -n "${SUPABASE_ANON_KEY:-}" ] \
  || die "SUPABASE_ANON_KEY is not set (Supabase dashboard → Project Settings → API)."
[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] \
  || die "SUPABASE_SERVICE_ROLE_KEY is not set (Supabase dashboard → Project Settings → API)."
case "$SUPABASE_URL" in
  *localhost*|*127.0.0.1*)
    die "SUPABASE_URL points at localhost. Point it at your Supabase Cloud dev project." ;;
esac

command -v node >/dev/null 2>&1 || die "node not found (need 20+)."
command -v npm  >/dev/null 2>&1 || die "npm not found."
command -v python3 >/dev/null 2>&1 || die "python3 not found (need 3.12)."
command -v uvicorn >/dev/null 2>&1 \
  || die "uvicorn not found. Install it with: python3 -m pip install -r api/requirements.txt"

cleanup() { kill 0 2>/dev/null; }
trap cleanup EXIT INT TERM

echo "▸ travel-service on :8001…"
(cd api && \
  SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  uvicorn api:app --host 0.0.0.0 --port 8001) &

echo "▸ web on :5174…"
(cd web && \
  VITE_SUPABASE_URL="$SUPABASE_URL" \
  VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  VITE_BACKEND_URL=http://localhost:8001 \
  npm run dev -- --port 5174) &

sleep 3
# Best-effort LAN IP for reaching the backend from other devices — cross-platform.
LAN_IP=$( { ipconfig getifaddr en0 2>/dev/null \
  || hostname -I 2>/dev/null | awk '{print $1}' \
  || ip route get 1 2>/dev/null | awk '{print $7; exit}'; } | head -n1)
LAN_IP=${LAN_IP:-<your-lan-ip>}
echo ""
echo "── local dev (no Docker) ───────────────────────────────"
echo "  web        http://localhost:5174"
echo "  backend    http://localhost:8001   (LAN: http://$LAN_IP:8001)"
echo "  supabase   $SUPABASE_URL   (Cloud dev project)"
echo "────────────────────────────────────────────────────────"
wait
