#!/usr/bin/env sh
##
# Print the path a Pages deployment is served from, with a trailing slash.
#
# A static build bakes its asset paths in, so it has to know at build time
# whether it is served from the domain root or a subdirectory. GitHub user sites
# and GitLab `<group>.gitlab.io` projects serve from the root; everything else
# serves from `/<project>/`.
#
# Rather than assume, this reads the URL the platform says it will publish to.
# Falls back to the root, which is what a user site wants and what a local build
# expects.
set -eu

url="${1:-}"
[ -z "$url" ] && { printf '/'; exit 0; }

# Strip scheme and host, leaving the path.
path=$(printf '%s' "$url" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://[^/]*##')
[ -z "$path" ] && path="/"

# Nuxt's router base must end in a slash, or the last segment is treated as a
# file and every asset URL loses it.
case "$path" in
  */) ;;
  *) path="$path/" ;;
esac

printf '%s' "$path"
