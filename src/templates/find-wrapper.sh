#!/usr/bin/env bash
# ncr-managed: find
set -u

RUNNER="$HOME/.local/share/ncr/bin/ncr-runner.mjs"

if [[ -f "$RUNNER" ]]; then
  exec node "$RUNNER" find "$@"
fi

exec /usr/bin/find "$@"
