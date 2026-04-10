#!/usr/bin/env bash
# ncr-managed: grep
set -u

RUNNER="$HOME/.local/share/ncr/bin/ncr-runner.mjs"

if [[ -f "$RUNNER" ]]; then
  exec node "$RUNNER" grep "$@"
fi

exec /usr/bin/grep "$@"
