# cmd-bridge

Machine-level command router and shim layer. It routes supported command shapes to faster backends (starting with FFF) and falls back to native commands when compatibility is uncertain.

## Goals

- Keep shell UX the same (`find`, `grep`) with transparent interception.
- Route only safe, validated subsets to accelerated backends through a central policy engine.
- Fall back to native commands when compatibility is uncertain.
- Provide reversible install/uninstall with backups.

## Router Model

- Thin wrappers (`~/.local/bin/find`, `~/.local/bin/grep`) call a shared runner:
  - `~/.local/share/cmd-bridge/bin/cmd-bridge-runner.mjs`
- Runner decides backend and reason (`native`, `smart-find`, `fff`).
- Set `CMD_BRIDGE_DEBUG=1` to print routing decisions to stderr.
- Installed FFF helpers:
  - `~/.local/share/cmd-bridge/bin/grep-fff-helper.mjs`
  - `~/.local/share/cmd-bridge/bin/fff-find-helper.mjs`

## Command Policies

- `find` routes to `smart-find` when present, otherwise `/usr/bin/find`.
- `grep` routes a safe recursive subset to `fff-mcp` via helper:
  - supported: `grep -R|-r [-n] [-F|--fixed-strings] PATTERN DIR`
  - fallback: everything else to `/usr/bin/grep`

## Requirements

- Bun (`bun --version`)
- Node (used by installed `grep` wrapper helper runtime)
- `fff-mcp` in `PATH` for accelerated grep routing

## Usage

```bash
cd /Users/merlin/_dev/cmd-bridge
make bootstrap
make install
make doctor
CMD_BRIDGE_DEBUG=1 grep -R -n -F TODO .
```

Run benchmark (explicitly includes FFF):

```bash
cd /Users/merlin/_dev/cmd-bridge
make bench
```

Or custom benchmark target:

```bash
bun run scripts/bench.ts --path /path/to/repo --grep-query TODO --file-query ts --runs 7 --warmup 2
```

Persistent MCP session benchmark (for warm/cold FFF timing):

```bash
bun run scripts/bench-mcp.ts --path /path/to/repo --tool grep --query TODO --mode warm --iters 20 --max-results 200
bun run scripts/bench-mcp.ts --path /path/to/repo --tool grep --query TODO --mode cold --iters 5 --max-results 200
```

Uninstall and restore previous wrappers:

```bash
make uninstall
```

## Safety Model

- Install path: `~/.local/bin`
- Helper/runtime state: `~/.local/share/cmd-bridge`
- Backups: `~/.local/share/cmd-bridge/backup/<cmd>.backup`
- Wrappers are marked with `cmd-bridge-managed: <cmd>` and only those are removed by uninstall.

## Bypass

- `find`: `SMART_FIND=0 find ...` or `/usr/bin/find ...`
- `grep`: `SMART_GREP=0 grep ...`, `grep --raw ...`, or `/usr/bin/grep ...`
