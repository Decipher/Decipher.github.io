#!/usr/bin/env bash
##
# Run one authoring session.
#
# Stands up the backend, makes it conforming, serves the frontend on one
# hostname with Drupal proxied under it, publishes where that is, waits while
# someone writes, and turns whatever they wrote into a change request.
#
# One origin, on purpose. Sign-in, inline editing and a node preview all talk
# to Drupal from the frontend's own origin, so the session cookie, which is
# SameSite=Lax, reaches a preview, and nothing needs CORS. The tunnel opens
# before provisioning because the consumer and the preview target have to know
# the hostname, and a quick tunnel is assigned one before its origin exists.
#
# This is the shared core. GitLab CI, GitHub Actions and a laptop all call it,
# and the only per-provider parts are how the session record is published, how
# the login link is delivered, and what kind of change request gets opened.
# Everything that makes a backend usable already lives in
# drupal/.devtools/provision-authoring, so the frontend cannot tell the three
# apart.
#
# Usage:
#   scripts/session.sh                 # run a session
#   SESSION_MINUTES=20 scripts/session.sh
#
# Environment:
#   SESSION_MINUTES     how long to hold the backend open (default 55)
#   SITE_ORIGIN         the deployed frontend's origin
#   DISCORD_WEBHOOK_URL optional private channel for the login link
#   WEBSERVER_PORT      local port for the backend (default 8888)
#   FRONTEND_PORT       local port for the session's frontend (default 3000)

set -uo pipefail

# Resolve the script's own directory before changing anything, so sourcing and
# the repository root are both correct however this was invoked.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."
REPO_ROOT="$(pwd)"

SESSION_MINUTES="${SESSION_MINUTES:-55}"
SITE_ORIGIN="${SITE_ORIGIN:-https://decipher.github.io}"
SESSION_BRANCH="${SESSION_BRANCH:-session}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
export SITE_ORIGIN

log() { printf '\n=== %s\n' "$*"; }

# Per-provider publishing, delivery and change-request functions.
# shellcheck source=scripts/session-providers.sh
. "$SCRIPT_DIR/session-providers.sh"

# --- Provider detection -----------------------------------------------------
# Only used for publishing and for opening the change request. Everything else
# is identical everywhere.
if [ -n "${GITLAB_CI:-}" ]; then
  PROVIDER="gitlab"
elif [ -n "${GITHUB_ACTIONS:-}" ]; then
  PROVIDER="github"
else
  PROVIDER="local"
fi
log "Session provider: $PROVIDER"

# Before provisioning, not after. The session's export works by subtracting
# whatever provisioning itself wrote, which it cannot separate from an author's
# uncommitted edits. Once `provision` has run the tree is dirty from its own
# work (installing saves `system.site`, and Tome exports it), so this is the
# last moment the question can be answered.
dirty="$(git status --porcelain -- drupal/config drupal/content 2>/dev/null || true)"
if [ -n "$dirty" ]; then
  echo "$dirty" >&2
  echo "Uncommitted changes in drupal/config or drupal/content. Commit or stash first." >&2
  exit 1
fi
export AUTHORING_TREE_VERIFIED=1

# --- Teardown ---------------------------------------------------------------
# From a trap, not as a final step. A manual session is normally ended by being
# cancelled rather than by running to completion, and the export has to happen
# either way or the author's work dies with the runner.
teardown() {
  local status=$?
  log "Teardown (exit $status)"

  # Back to a known directory first. A failure part way through leaves the shell
  # wherever it happened to be, and every path below is relative to the root.
  cd "$REPO_ROOT" || return

  ( cd drupal && ./.devtools/session-export ) || echo "Session export failed." >&2
  propose_changes || echo "Could not open a change request." >&2

  unpublish_session || true
  ( cd drupal && ./.devtools/tunnel --stop ) || true
  stop_frontend
  ( cd drupal && ./.devtools/stop ) || true

  log "Session ended."
}
trap teardown EXIT
trap 'exit 130' INT TERM

FRONTEND_PID_FILE="$REPO_ROOT/drupal/.logs/frontend.pid"
stop_frontend() {
  if [ -f "$FRONTEND_PID_FILE" ]; then
    kill "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null || true
    rm -f "$FRONTEND_PID_FILE"
  fi
}

# --- Bring the backend up ---------------------------------------------------
log "Assembling"
cd drupal
./.devtools/assemble || exit 1

log "Opening the tunnel"
# For the frontend's port, and without waiting for it: the frontend is built
# once there is a backend to build it against, and the backend is provisioned
# with this hostname.
if ! TUNNEL_PORT="$FRONTEND_PORT" ./.devtools/tunnel --no-wait; then
  echo "No tunnel, so nothing outside this runner could reach the session." >&2
  exit 1
fi
SESSION_URL="$(grep -m1 '^TUNNEL_URL=' ../.env | cut -d= -f2-)"
export SESSION_ORIGIN="$SESSION_URL"

log "Provisioning"
./.devtools/provision || exit 1
./.devtools/provision-authoring || exit 1
./.devtools/start || exit 1

# --- Bring the frontend up --------------------------------------------------
# A server build, not the static one: the proxy that puts Drupal under this
# origin is server middleware. Built against the local backend, which is also
# where the proxy sends everything Drupal's.
log "Building the frontend"
cd "$REPO_ROOT/nuxt"
export NUXT_TARGET=server DRUXT_ADMIN_MODE=proxy ROUTER_BASE=/
[ -d node_modules ] || npm install --no-audit --no-fund || exit 1
npm run build || exit 1

log "Starting the frontend on port $FRONTEND_PORT"
mkdir -p "$REPO_ROOT/drupal/.logs"
HOST=127.0.0.1 PORT="$FRONTEND_PORT" nohup npm run start > "$REPO_ROOT/drupal/.logs/frontend.log" 2>&1 &
echo $! > "$FRONTEND_PID_FILE"
cd "$REPO_ROOT/drupal"

# The tunnel was assigned before anything answered behind it. Now something
# should: the frontend for the site, and Drupal through it for JSON:API.
READY=0
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null -m 10 "$SESSION_URL/jsonapi" && curl -sf -o /dev/null -m 10 "$SESSION_URL/"; then
    READY=1
    break
  fi
  sleep 2
done
if [ "$READY" != 1 ]; then
  echo "The session never answered at $SESSION_URL. Frontend log:" >&2
  tail -n 30 "$REPO_ROOT/drupal/.logs/frontend.log" >&2
  exit 1
fi

CLIENT_ID="$(grep -m1 '^OAUTH_CLIENT_ID=' ../.env | cut -d= -f2-)"
EXPIRES_AT="$(date -u -d "+${SESSION_MINUTES} minutes" +%Y-%m-%dT%H:%M:%SZ)"

# Scoped to the tunnel URL: a link generated against the local address is
# useless to anyone outside the runner, and drush defaults to `http://default`
# when no URI is given.
LOGIN_LINK="$(vendor/bin/drush -r "$REPO_ROOT/drupal/web" -l "$SESSION_URL" uli --no-browser 2>/dev/null | tr -d '\r')"
cd "$REPO_ROOT"

log "Session ready at $SESSION_URL (expires $EXPIRES_AT)"

publish_session
deliver_login_link

# --- Hold it open -----------------------------------------------------------
log "Holding the session open for ${SESSION_MINUTES} minutes"
END=$(( $(date +%s) + SESSION_MINUTES * 60 ))
while [ "$(date +%s)" -lt "$END" ]; do
  sleep 60
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$SESSION_URL/jsonapi" || echo unreachable)"
  echo "[heartbeat] $(date -u +%H:%M:%S) backend: $CODE"
done
