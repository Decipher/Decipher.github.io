#!/usr/bin/env bash
##
# Turn a change request into content.
#
# The other half of authoring without a backend. The browser writes JSON:API
# resources and the bytes that go with them; this stands a Drupal up, applies
# them through the entity API, and lets Tome write the content. What is left in
# the working tree is the session's edits and nothing else, ready to commit onto
# the branch the request arrived on.
#
# The conversion is here rather than in the browser on purpose: Tome writes
# Drupal's own normalisation, references by `target_uuid`, an image's width and
# height read off the file, the processed body. Reproducing that in JavaScript
# means keeping a copy of Drupal's normalisers in step with a Drupal that moves,
# which fails quietly and produces pull requests that review cleanly and break
# the next build.
#
# GitHub Actions, GitLab CI and a laptop all call this, so all three produce the
# same commit.
#
# Usage:
#   scripts/apply-change-request.sh requests/edits-20260905-100000/change.json
#   scripts/apply-change-request.sh              # find the one request present
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."
REPO_ROOT="$(pwd)"

log() { printf '\n=== %s\n' "$*"; }

DOCUMENT="${1:-}"

# Nothing named, so find it. A branch carries one request; more than one is a
# branch that has been reused, and picking for somebody is worse than stopping.
if [ -z "$DOCUMENT" ]; then
  # `|| true`: with `pipefail`, `find` closing the pipe early makes the whole
  # pipeline fail, and no requests is a thing to report rather than to crash on.
  mapfile -t FOUND < <(find requests -mindepth 2 -maxdepth 2 -name change.json 2>/dev/null | sort || true)
  if [ "${#FOUND[@]}" -eq 0 ]; then
    log "No change request under requests/. Nothing to do."
    exit 0
  fi
  if [ "${#FOUND[@]}" -gt 1 ]; then
    printf '  %s\n' "${FOUND[@]}"
    log "More than one change request. Name the one to apply."
    exit 1
  fi
  DOCUMENT="${FOUND[0]}"
fi

if [ ! -f "$REPO_ROOT/$DOCUMENT" ]; then
  log "No change request at $DOCUMENT."
  exit 1
fi

log "Applying $DOCUMENT"

cleanup() {
  (cd "$REPO_ROOT/drupal" && ./.devtools/stop) 2>/dev/null || true
}
trap cleanup EXIT

cd drupal

./.devtools/assemble
./.devtools/provision

# Before the request, not after. The export subtracts what provisioning itself
# wrote, and once the request has been applied the two are indistinguishable.
./.devtools/session-baseline

./.devtools/apply-change-request "$DOCUMENT"
./.devtools/session-export

cd "$REPO_ROOT"

# The request has become content, so it has no reason to stay. Leaving it would
# put the same edit in the repository twice, once as a proposal and once as the
# thing itself, and the next run would apply it again.
rm -rf "$(dirname "$DOCUMENT")"

log "Done. The working tree holds the content this request became."
