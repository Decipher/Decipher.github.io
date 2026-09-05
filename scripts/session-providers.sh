#!/usr/bin/env bash
##
# Per-provider parts of an authoring session.
#
# Three things differ between running a session in GitLab CI, in GitHub Actions
# and on a laptop: where the session record is published so the deployed
# frontend can find the backend, how the one-time login link reaches the person
# who started it, and what kind of change request the session's edits become.
#
# Nothing else does, which is the point. Sourced by scripts/session.sh.

# --- Publishing the session record ------------------------------------------
#
# The record is public on purpose. It names a backend serving content the site
# already publishes, so the URL is not the secret; the login link is. See the
# change's design.md, "Split the session URL from the login credential".

session_record() {
  cat <<JSON
{
  "url": "$SESSION_URL",
  "clientId": "$CLIENT_ID",
  "expiresAt": "$EXPIRES_AT",
  "provider": "$PROVIDER"
}
JSON
}

publish_session() {
  if ! can_push; then
    echo "No token for $PROVIDER, so the session record is not published."
    echo "Point the frontend at the backend URL by hand instead."
    return 0
  fi

  case "$PROVIDER" in
    gitlab|github)
      local tmp
      tmp="$(mktemp -d)"
      session_record > "$tmp/session.json"
      # An orphan branch holding one file. It is not part of the site's
      # history and must never merge into it, so it starts empty rather than
      # from the default branch.
      git -C "$tmp" init -q -b "$SESSION_BRANCH"
      git -C "$tmp" -c user.name="session" -c user.email="session@localhost" \
        add session.json
      git -C "$tmp" -c user.name="session" -c user.email="session@localhost" \
        commit -q -m "chore(session): publish backend $EXPIRES_AT"
      if git -C "$tmp" push -q --force "$(push_url)" "$SESSION_BRANCH" 2>/dev/null; then
        echo "Session record published to the '$SESSION_BRANCH' branch."
      else
        echo "Could not publish the session record; the frontend will need the URL by hand." >&2
      fi
      rm -rf "$tmp"
      ;;
    local)
      session_record > .session.json
      echo "Session record written to .session.json."
      echo "Point the frontend at it, or paste the backend URL into the site."
      ;;
  esac
}

unpublish_session() {
  if ! can_push; then
    echo "No token for $PROVIDER, so the session record is not published."
    echo "Point the frontend at the backend URL by hand instead."
    return 0
  fi

  case "$PROVIDER" in
    gitlab|github)
      # Delete the branch, so a dead backend is not advertised. The frontend
      # treats a missing record and an expired one the same way, but a 404 is
      # faster than waiting for a timeout on a tunnel that no longer exists.
      git push -q --delete "$(push_url)" "$SESSION_BRANCH" 2>/dev/null \
        && echo "Session record withdrawn." \
        || true
      ;;
    local)
      rm -f .session.json
      ;;
  esac
}

push_url() {
  # Defaulted rather than assumed: the caller runs under `set -u`, so an unset
  # token would abort the whole teardown instead of skipping one optional step.
  case "$PROVIDER" in
    gitlab) echo "https://oauth2:${GITLAB_API_TOKEN:-}@${CI_SERVER_HOST:-gitlab.com}/${CI_PROJECT_PATH:-}.git" ;;
    github) echo "https://x-access-token:${GITHUB_TOKEN:-}@github.com/${GITHUB_REPOSITORY:-}.git" ;;
    *)      git remote get-url origin ;;
  esac
}

# True when this provider has what it needs to push. Without it a session with
# no token fails in teardown, which reads as "the session broke" rather than
# "nothing was configured to receive the changes".
can_push() {
  case "$PROVIDER" in
    gitlab) [ -n "${GITLAB_API_TOKEN:-}" ] ;;
    github) [ -n "${GITHUB_TOKEN:-}" ] ;;
    *)      return 0 ;;
  esac
}

# --- Delivering the login link ----------------------------------------------

deliver_login_link() {
  if [ -z "${LOGIN_LINK:-}" ]; then
    echo "No login link was generated." >&2
    return 0
  fi

  if [ -n "${DISCORD_WEBHOOK_URL:-}" ]; then
    # What follows is a one-click administrator session, so it does not go over
    # a plaintext connection. Checked rather than assumed: the URL comes from a
    # secret, and a typo there would otherwise put the link on the wire in
    # clear. `--proto '=https'` is the belt to this brace, and also stops curl
    # being talked down to another scheme.
    case "$DISCORD_WEBHOOK_URL" in
      https://*)
        # Every URL in angle brackets, and embeds suppressed, because the
        # login link is single use and Discord spends it: unfurling a link
        # means fetching it, and fetching a one-time login link logs the
        # unfurler in and invalidates it before anyone clicks. The link arrives
        # looking fine and is already dead.
        local payload
        payload=$(printf '{"content":"Authoring session ready.\\nBackend: <%s>\\nExpires: %s\\nLogin: <%s>","flags":4}' \
          "$SESSION_URL" "$EXPIRES_AT" "$LOGIN_LINK")
        if curl -sf --proto '=https' -X POST -H 'Content-Type: application/json' -d "$payload" \
            "$DISCORD_WEBHOOK_URL" >/dev/null; then
          echo "Login link sent to the private channel. It is deliberately not printed here."
          return 0
        fi
        echo "Could not reach the private channel." >&2
        ;;
      *)
        echo "DISCORD_WEBHOOK_URL is not https, so nothing was sent to it." >&2
        ;;
    esac
  fi

  # No private channel configured. On a public repository a job log is
  # world-readable, and this link is a one-click administrator session, so
  # refuse rather than print it.
  if [ "$PROVIDER" = "github" ]; then
    echo "REFUSING to print the login link: this runner's log is public and no" >&2
    echo "DISCORD_WEBHOOK_URL is set. Configure a private channel first." >&2
    return 1
  fi

  echo "Login link (this log is not public; configure DISCORD_WEBHOOK_URL to stop printing it):"
  echo "  $LOGIN_LINK"
}

# --- Turning the edits into a change request --------------------------------

propose_changes() {
  local paths="drupal/config drupal/content"
  if [ -z "$(git status --porcelain -- $paths)" ]; then
    echo "No content changed this session. No change request needed."
    return 0
  fi

  if ! can_push; then
    echo "Content changed, but there is no token to open a change request with." >&2
    echo "The export is in the working tree; commit it by hand." >&2
    return 0
  fi

  local branch="content/session-$(date -u +%Y%m%d-%H%M%S)"
  git checkout -q -b "$branch"
  git add $paths
  git -c user.name="Authoring session" -c user.email="session@localhost" \
    commit -q -m "chore(content): edits from an authoring session"

  case "$PROVIDER" in
    gitlab)
      git push -q "$(push_url)" "$branch" || return 1
      curl -sf --request POST \
        --header "PRIVATE-TOKEN: $GITLAB_API_TOKEN" \
        --header "Content-Type: application/json" \
        --data "$(printf '{"source_branch":"%s","target_branch":"%s","title":"%s","description":"%s"}' \
          "$branch" "${CI_DEFAULT_BRANCH:-main}" \
          "chore(content): edits from an authoring session" \
          "Content written through the static frontend against an ephemeral backend. Review the diff before merging; merging publishes it.")" \
        "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/merge_requests" >/dev/null \
        && echo "Merge request opened from $branch."
      ;;
    github)
      # Deliberately not GITHUB_TOKEN: a pull request opened with it does not
      # trigger workflows, so the checks that are the whole review gate would
      # never run. See design.md.
      git push -q "$(push_url)" "$branch" || return 1
      gh pr create --head "$branch" \
        --title "chore(content): edits from an authoring session" \
        --body "Content written through the static frontend against an ephemeral backend. Review the diff before merging; merging publishes it." \
        && echo "Pull request opened from $branch."
      ;;
    local)
      echo "Changes committed to $branch. Push it and open a change request when ready."
      ;;
  esac
}
