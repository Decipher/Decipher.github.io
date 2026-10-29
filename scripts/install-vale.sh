#!/usr/bin/env bash
##
# Install Vale, at a known version and known bytes.
#
# The vale module runs this binary on every save, on a backend that an author
# signs in to over a tunnel, so what gets executed is worth being sure about.
# `drush vale:install` would fetch the latest release, and a demo should not
# change under its presenter, so this pins a version and checks the digest.
#
# Vale publishes a checksums file with each release. The digests below are
# copied from vale_3.17.1_checksums.txt, so they are an upstream attestation,
# unlike the cloudflared ones. The same version lints the README in CI.
#
# To move to a newer Vale, change VERSION and paste the four digests from the
# release's checksums file.
#
# Usage:
#   scripts/install-vale.sh [destination]   # default drupal/bin/vale

set -euo pipefail

VERSION="3.17.1"

SHA256_Linux_64_bit="db947f89f2292e6a0381a61de155f6a5f5cb4cb460ca178ea412ef605559cefd"
SHA256_Linux_arm64="92d91ebf9ee69ec077379be95cd09e6710ab33d3d5bab66bb482e66ebc80dc23"
SHA256_macOS_64_bit="b37ab999dfd1414d041bd2e94ced103292d634da76f954c385bf789dc7f5f939"
SHA256_macOS_arm64="80cacf85ef23f53cfdd77355ec41a6ef99aec136f15dfb3517723482f35593f9"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$REPO_ROOT/drupal/bin/vale}"

case "$(uname -s)" in
  Linux) OS=Linux ;;
  Darwin) OS=macOS ;;
  *)
    echo "No pinned Vale for $(uname -s)." >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  aarch64|arm64) ARCH=arm64; KEY=arm64 ;;
  x86_64|amd64) ARCH=64-bit; KEY=64_bit ;;
  *)
    echo "No pinned Vale for $(uname -m)." >&2
    exit 1
    ;;
esac

EXPECTED="$(eval "echo \"\$SHA256_${OS}_${KEY}\"")"
URL="https://github.com/vale-cli/vale/releases/download/v${VERSION}/vale_${VERSION}_${OS}_${ARCH}.tar.gz"

if [ -x "$DEST" ] && [ "$("$DEST" --version 2>/dev/null | sed -n 's/^vale version //p')" = "$VERSION" ]; then
  echo "[vale] ${VERSION} already at ${DEST}."
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "[vale] Downloading ${VERSION} for ${OS} ${ARCH}."
# `--proto '=https'` so a redirect cannot walk this down to plaintext.
curl -sSLf --proto '=https' -o "$TMP/vale.tar.gz" "$URL"

ACTUAL="$(sha256sum "$TMP/vale.tar.gz" 2>/dev/null | cut -d' ' -f1 || shasum -a 256 "$TMP/vale.tar.gz" | cut -d' ' -f1)"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "[vale] Digest mismatch for ${URL}" >&2
  echo "  expected ${EXPECTED}" >&2
  echo "  actual   ${ACTUAL}" >&2
  echo "If this is a deliberate version change, update VERSION and the digests in $0 from the release's checksums file." >&2
  exit 1
fi

tar -xzf "$TMP/vale.tar.gz" -C "$TMP" vale
mkdir -p "$(dirname "$DEST")"
install -m 0755 "$TMP/vale" "$DEST"
echo "[vale] Installed to ${DEST}."
"$DEST" --version
