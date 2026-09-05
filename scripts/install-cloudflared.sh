#!/usr/bin/env bash
##
# Install cloudflared, at a known version and known bytes.
#
# The binary runs in the same job as AUTHORING_PR_TOKEN and the webhook that
# carries an administrator login link, so what gets executed is worth being
# sure about. `latest/download` is a moving target and a release asset can be
# replaced in place, so this pins a version and checks the digest.
#
# Cloudflare publishes no checksum file with its releases, so the digests below
# were taken from the assets themselves. That means they are a record of what
# this repository has decided to run, not an upstream attestation: they detect a
# changed artifact, not a malicious release.
#
# To move to a newer cloudflared, change VERSION and run this script; it prints
# the digest it got when the check fails, which is what to paste back in.
#
# Usage:
#   scripts/install-cloudflared.sh [destination]   # default /usr/local/bin/cloudflared

set -euo pipefail

VERSION="2026.8.3"

# One per architecture this runs on. Anything else is a hard stop rather than a
# silent fall back to an unverified download.
SHA256_amd64="f29324fe934d1e100617484c78deef803c4dc2cd351d645bbde42e96b4fccc5e"
SHA256_arm64="4bcfd35521a7cbc545ebfd5d57334a71ee180e2a64874981f374c81472118391"

DEST="${1:-/usr/local/bin/cloudflared}"

case "$(uname -m)" in
  aarch64|arm64) ARCH=arm64 ;;
  x86_64|amd64) ARCH=amd64 ;;
  *)
    echo "No pinned cloudflared for $(uname -m)." >&2
    exit 1
    ;;
esac

EXPECTED="$(eval "echo \"\$SHA256_${ARCH}\"")"
URL="https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/cloudflared-linux-${ARCH}"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "[cloudflared] Downloading ${VERSION} for ${ARCH}."
# `--proto '=https'` so a redirect cannot walk this down to plaintext.
curl -sSLf --proto '=https' -o "$TMP" "$URL"

ACTUAL="$(sha256sum "$TMP" | cut -d' ' -f1)"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "[cloudflared] Digest mismatch for ${URL}" >&2
  echo "  expected ${EXPECTED}" >&2
  echo "  actual   ${ACTUAL}" >&2
  echo "If this is a deliberate version change, update VERSION and SHA256_${ARCH} in $0." >&2
  exit 1
fi

install -m 0755 "$TMP" "$DEST" 2>/dev/null || sudo install -m 0755 "$TMP" "$DEST"
echo "[cloudflared] Installed to ${DEST}."
"$DEST" --version
