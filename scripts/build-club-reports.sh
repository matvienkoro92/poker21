#!/bin/sh
set -eu

if [ "$#" -lt 2 ]; then
  echo "Usage: scripts/build-club-reports.sh INPUT.xlsx OUTPUT_DIR" >&2
  exit 1
fi

RUNTIME="/Users/kosmonavt/.cache/codex-runtimes/codex-primary-runtime/dependencies"
WORK_DIR="$(mktemp -d /private/tmp/poker21-club-reports.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT
ln -s "$RUNTIME/node/node_modules" "$WORK_DIR/node_modules"
"$RUNTIME/python/bin/python3" scripts/extract-club-report-data.py "$1" "$WORK_DIR/clubs.json"
(cd "$WORK_DIR" && "$RUNTIME/node/bin/node" "$OLDPWD/scripts/build-club-reports.mjs" "$WORK_DIR/clubs.json" "$2")
