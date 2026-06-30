#!/usr/bin/env bash
set -euo pipefail

SOURCE_REPO="${SOURCE_REPO:-/Users/aitoshuu/Documents/GitHub/TongyeGuanmi}"
SPIKE_REPO="${SPIKE_REPO:-/Users/aitoshuu/Documents/GitHub/react-runtime-spike}"

SOURCE_INDEX="$SOURCE_REPO/index.html"
SPIKE_MANIFEST="$SPIKE_REPO/src/manifest/realManifest.ts"

if [[ ! -f "$SOURCE_INDEX" ]]; then
  echo "Missing SOURCE_REPO/index.html: $SOURCE_INDEX" >&2
  exit 1
fi

if [[ ! -f "$SPIKE_MANIFEST" ]]; then
  echo "Missing SPIKE_REPO/src/manifest/realManifest.ts: $SPIKE_MANIFEST" >&2
  exit 1
fi

source_ids="$(mktemp)"
spike_ids="$(mktemp)"
trap 'rm -f "$source_ids" "$spike_ids"' EXIT

grep -o 'data-scene-id="[^"]*"' "$SOURCE_INDEX" \
  | sed 's/data-scene-id="\([^"]*\)"/\1/' \
  | sort -u > "$source_ids"

awk '
  /export const scenes/ { in_scenes = 1 }
  in_scenes { print }
  in_scenes && /^\];/ { exit }
' "$SPIKE_MANIFEST" \
  | grep -o "id: '[^']*'" \
  | sed "s/id: '\([^']*\)'/\1/" \
  | sort -u > "$spike_ids"

echo "=== Original HTML data-scene-id ==="
cat "$source_ids"

echo ""
echo "=== Spike realManifest scene ids ==="
cat "$spike_ids"

echo ""
echo "=== Source-only scene ids ==="
comm -23 "$source_ids" "$spike_ids" || true

echo ""
echo "=== Spike-only scene ids ==="
comm -13 "$source_ids" "$spike_ids" || true

echo ""
echo "=== Duplicate data-scene-id in SOURCE_REPO/index.html ==="
grep -o 'data-scene-id="[^"]*"' "$SOURCE_INDEX" \
  | sed 's/data-scene-id="\([^"]*\)"/\1/' \
  | sort \
  | uniq -d || true

echo ""
echo "=== Duplicate scene ids in SPIKE_REPO realManifest scenes[] ==="
awk '
  /export const scenes/ { in_scenes = 1 }
  in_scenes { print }
  in_scenes && /^\];/ { exit }
' "$SPIKE_MANIFEST" \
  | grep -o "id: '[^']*'" \
  | sed "s/id: '\([^']*\)'/\1/" \
  | sort \
  | uniq -d || true

echo ""
echo "=== Reconciliation note ==="
echo "Source-only method and Figure2 proof ids are resolved as local/sub-state ids in SCENE-NAMING-DECISIONS.md."
echo "Spike-only ids are canonical React runtime scenes introduced by the frozen scene graph."
echo "Duplicate id sections above must remain empty for the freeze to pass."
