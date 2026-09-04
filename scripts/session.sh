#!/usr/bin/env bash
##
# Run one authoring session.
#
# Stands up the backend, makes it conforming, exposes it, publishes where it
# is, waits while someone writes, and turns whatever they wrote into a change
# request.
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

set -uo pipefail

# Resolve the script's own directory before changing anything, so sourcing and
# the repository root are both correct however this was invoked.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."
REPO_ROOT="$(pwd)"

SESSION_MINUTES="${SESSION_MINUTES:-55}"
SITE_ORIGIN="${SITE_ORIGIN:-https://decipher.github.io}"
SESSION_BRANCH="${SESSION_BRANCH:-session}"
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

# --- Teardown ---------------------------------------------------------------
# From a trap, not as a final step. A manual session is normally ended by being
# cancelled rather than by running to completion, and the export has to happen
# either way or the author's work dies with the runner.
teardown() {
  local status=$?
  log "Teardown (exit $status)"

  ( cd drupal && ./.devtools/session-export ) || echo "Session export failed." >&2
  propose_changes || echo "Could not open a change request." >&2

  unpublish_session || true
  ( cd drupal && ./.devtools/tunnel --stop ) || true
  ( cd drupal && ./.devtools/stop ) || true

  log "Session ended."
}
trap teardown EXIT
trap 'exit 130' INT TERM

# --- Bring the backend up ---------------------------------------------------
log "Assembling and provisioning"
cd drupal
./.devtools/assemble || exit 1
./.devtools/provision || exit 1
./.devtools/provision-authoring || exit 1
./.devtools/start || exit 1

log "Opening the tunnel"
if ! ./.devtools/tunnel; then
  echo "No tunnel, so nothing outside this runner could reach the backend." >&2
  exit 1
fi

SESSION_URL="$(grep -m1 '^TUNNEL_URL=' ../.env | cut -d= -f2-)"
CLIENT_ID="$(grep -m1 '^OAUTH_CLIENT_ID=' ../.env | cut -d= -f2-)"
EXPIRES_AT="$(date -u -d "+${SESSION_MINUTES} minutes" +%Y-%m-%dT%H:%M:%SZ)"

# Scoped to the tunnel URL: a link generated against the local address is
# useless to anyone outside the runner, and drush defaults to `http://default`
# when no URI is given.
LOGIN_LINK="$(vendor/bin/drush -r "$REPO_ROOT/drupal/web" -l "$SESSION_URL" uli --no-browser 2>/dev/null | tr -d '\r')"
cd "$REPO_ROOT"

log "Backend ready at $SESSION_URL (expires $EXPIRES_AT)"

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
