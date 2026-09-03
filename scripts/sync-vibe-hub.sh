#!/bin/bash
# Copy Finder-facing files from ~/vibe → Desktop/VIBE HUB copy.
# Code stays in ~/vibe. The hub is for opening things in Files.
set -euo pipefail

REPO="${VIBE_REPO:-$HOME/vibe}"
HUB="${VIBE_HUB:-$HOME/Desktop/VIBE HUB copy}"

if [ ! -d "$REPO" ]; then
  echo "Missing repo: $REPO" >&2
  exit 1
fi
if [ ! -d "$HUB" ]; then
  echo "Missing hub folder: $HUB" >&2
  exit 1
fi

mkdir -p "$HUB/BRAND" "$HUB/ACTIVE" "$HUB/DOCS" \
  "$HUB/SESSIONS/handoffs" "$HUB/SESSIONS/journal" "$HUB/otto_mockups"

rsync -a "$REPO/public/html/" "$HUB/ACTIVE/"
rsync -a "$REPO/brand/" "$HUB/BRAND/"
[ -d "$REPO/DOCS" ] && rsync -a "$REPO/DOCS/" "$HUB/DOCS/"
[ -d "$REPO/handoffs" ] && rsync -a "$REPO/handoffs/" "$HUB/SESSIONS/handoffs/"
[ -d "$REPO/public/journal" ] && rsync -a "$REPO/public/journal/" "$HUB/SESSIONS/journal/"
[ -d "$REPO/otto_mockups" ] && rsync -a "$REPO/otto_mockups/" "$HUB/otto_mockups/"

if [ -f "$HOME/vault/Reference/Brand.md" ]; then
  cp "$HOME/vault/Reference/Brand.md" "$HUB/BRAND/Brand.md"
fi

date "+%Y-%m-%d %H:%M" > "$HUB/.last-sync"
echo "Synced ~/vibe → $HUB"
echo "  BRAND/ ACTIVE/ DOCS/ SESSIONS/ otto_mockups/"
