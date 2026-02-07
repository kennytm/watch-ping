#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="${1:-"$ROOT_DIR/watch-ping@example.com"}"
METADATA="$EXT_DIR/metadata.json"

if ! command -v zip >/dev/null 2>&1; then
    echo "error: zip is required but not found" >&2
    exit 1
fi

if [[ ! -f "$METADATA" ]]; then
    echo "error: metadata.json not found at $METADATA" >&2
    echo "usage: $0 [extension-directory]" >&2
    exit 1
fi

UUID="$(sed -n 's/.*"uuid"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$METADATA" | head -n 1)"
VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$METADATA" | head -n 1)"

if [[ -z "$UUID" ]]; then
    echo "error: cannot parse uuid from $METADATA" >&2
    exit 1
fi

if [[ -z "$VERSION" ]]; then
    VERSION="0"
fi

OUT_DIR="$ROOT_DIR/dist"
OUT_FILE="$OUT_DIR/${UUID}.v${VERSION}.shell-extension.zip"

mkdir -p "$OUT_DIR"

TMP_DIR="$(mktemp -d)"
cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cp -R "$EXT_DIR"/. "$TMP_DIR"/

(
    cd "$TMP_DIR"
    zip -qr "$OUT_FILE" .
)

echo "Built extension bundle:"
echo "$OUT_FILE"
echo
echo "Install with:"
echo "gnome-extensions install \"$OUT_FILE\""
