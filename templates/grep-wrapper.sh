#!/usr/bin/env bash
# cmd-bridge-managed: grep
set -u

RUNNER="$HOME/.local/share/cmd-bridge/bin/cmd-bridge-runner.mjs"

if [[ -f "$RUNNER" ]]; then
  exec node "$RUNNER" grep "$@"
fi

exec /usr/bin/grep "$@"
