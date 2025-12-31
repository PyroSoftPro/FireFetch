#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="$HERE/dist"
ZIP="$DIST/media-downloader.zip"

mkdir -p "$DIST"
rm -f "$ZIP"

TMP="$DIST/staging"
rm -rf "$TMP"
mkdir -p "$TMP"

shopt -s dotglob
for entry in "$HERE"/*; do
  base="$(basename "$entry")"
  if [[ "$base" == "dist" ]]; then
    continue
  fi
  cp -R "$entry" "$TMP/"
done

(cd "$TMP" && zip -r "$ZIP" . >/dev/null)
rm -rf "$TMP"

echo "Built: $ZIP"









