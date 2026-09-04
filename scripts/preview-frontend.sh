#!/usr/bin/env bash
##
# Build the static site and hold it behind a Cloudflare tunnel.
#
# The frontend half of a preview. `scripts/session.sh` publishes a backend; this
# publishes a frontend, and they are deliberately independent: a frontend with
# no backend is still the site, and is the thing most worth looking at before a
# change lands.
#
# Building needs a Drupal, because Druxt reads the JSON:API index and the entity
# display configuration at build time. One is provisioned, used, and left
# running only as long as the build takes.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."
REPO_ROOT="$(pwd)"

PREVIEW_MINUTES="${PREVIEW_MINUTES:-55}"
PORT="${PREVIEW_PORT:-3000}"
LOG_DIR="$REPO_ROOT/.logs"
mkdir -p "$LOG_DIR"

log() { printf '\n=== %s\n' "$*"; }

cleanup() {
  cd "$REPO_ROOT" || return
  [ -f "$LOG_DIR/cloudflared.pid" ] && kill "$(cat "$LOG_DIR/cloudflared.pid")" 2>/dev/null
  [ -f "$LOG_DIR/serve.pid" ] && kill "$(cat "$LOG_DIR/serve.pid")" 2>/dev/null
  (cd drupal && ./.devtools/stop) 2>/dev/null
  log "Preview ended."
}
trap cleanup EXIT
trap 'exit 130' INT TERM

log "Building the static site"
(cd drupal && ./.devtools/assemble && ./.devtools/provision && ./.devtools/start) || exit 1
(cd nuxt && npm install && ROUTER_BASE=/ npm run generate) || exit 1

# The backend has done its job. Stopping it now proves what is served next needs
# nothing behind it.
(cd drupal && ./.devtools/stop) || true

log "Serving nuxt/dist"
# -s so a hard reload on any client-side route serves the app rather than a 404.
nohup npx --yes serve -s --no-clipboard --no-port-switching -l "$PORT" nuxt/dist \
  >"$LOG_DIR/serve.log" 2>&1 &
echo $! > "$LOG_DIR/serve.pid"
sleep 3

log "Opening the tunnel"
nohup cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate \
  >"$LOG_DIR/cloudflared.log" 2>&1 &
echo $! > "$LOG_DIR/cloudflared.pid"

URL=""
for _ in $(seq 1 30); do
  sleep 2
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/cloudflared.log" 2>/dev/null | head -1)"
  # A hostname is not a working tunnel: quick tunnel DNS sometimes never
  # publishes, and reporting the name alone hands out a dead link.
  [ -n "$URL" ] && curl -sf -o /dev/null -m 5 "$URL" && break
  URL=""
done

if [ -z "$URL" ]; then
  echo "No working tunnel after 60s. Last lines of the log:" >&2
  tail -n 20 "$LOG_DIR/cloudflared.log" >&2
  exit 1
fi

log "Frontend preview: $URL"
echo "No backend is running. Connect one from the site's own log in control."

log "Holding for ${PREVIEW_MINUTES} minutes"
END=$(( $(date +%s) + PREVIEW_MINUTES * 60 ))
while [ "$(date +%s)" -lt "$END" ]; do
  sleep 60
  echo "[heartbeat] $(date -u +%H:%M:%S) $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL" || echo unreachable)"
done
