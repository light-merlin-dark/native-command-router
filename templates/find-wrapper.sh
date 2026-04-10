#!/usr/bin/env bash
# cmd-bridge-managed: find
set -u

RUNNER="$HOME/.local/share/cmd-bridge/bin/cmd-bridge-runner.mjs"

if [[ -f "$RUNNER" ]]; then
  exec node "$RUNNER" find "$@"
fi

exec /usr/bin/find "$@"
