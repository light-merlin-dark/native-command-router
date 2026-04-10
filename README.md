```
███╗   ██╗ ██████╗██████╗
████╗  ██║██╔════╝██╔══██╗
██╔██╗ ██║██║     ██████╔╝
██║╚██╗██║██║     ██╔══██╗
██║ ╚████║╚██████╗██║  ██║
╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝

Native Command Router for Developers and AI Agents
Compatibility-first routing • Optimization plugins • Strict native fallback
```

## Why?

- Keep native shell UX (`find`, `grep`) without changing agent prompts.
- Route only validated command shapes to optimized backends.
- Enforce strict fallback to native tools when compatibility is uncertain.
- Preserve command output and exit semantics as the primary contract.

## Core Contract

NCR is not a command replacement language. It is a compatibility router.

- Native shape first: `stdout`, `stderr`, and exit code behavior must match expected native behavior.
- Conservative policy: if NCR cannot guarantee compatibility, it falls back to `/usr/bin/find` or `/usr/bin/grep`.
- Explicit bypasses always exist:
  - `SMART_FIND=0 find ...`
  - `SMART_GREP=0 grep ...`
  - `find --raw ...`, `grep --raw ...`
  - `/usr/bin/find ...`, `/usr/bin/grep ...`

## How It Works

- Managed wrappers are installed into `~/.local/bin` for `find` and `grep`.
- Wrappers call `~/.local/share/ncr/bin/ncr-runner.mjs`.
- Runner selects backend based on active profile and plugin availability.
- Optimization plugins are opt-in via profile or env var.

## Profiles

NCR uses a profile system to control routing behavior:

### `stable` (default)

- All commands route to native tools.
- Minimal overhead (<=4% wrapper cost), exact native parity.
- Set via `NCR_PROFILE=stable` or by default.

### `fast`

- Enables optimization plugins (smart-find, FFF grep).
- Use when you want speed and accept the documented gaps.
- Set via `NCR_PROFILE=fast`.

## Routing Policy

### `find`

| Profile | Backend | Behavior |
|---------|---------|----------|
| stable | `/usr/bin/find` | Native passthrough (default) |
| fast | `smart-find` | Noise-dir filtering (node_modules, .git, dist, build) |
| any | `/usr/bin/find` | With `SMART_FIND=0` or `--raw` |

### `grep`

| Profile | Backend | Behavior |
|---------|---------|----------|
| stable | `/usr/bin/grep` | Native passthrough (default) |
| fast | `fff` | For recursive literal subset only |
| any | `/usr/bin/grep` | With `SMART_GREP=0` or `--raw`, or for unsupported shapes |

### Grep safe subset (fast profile / FFF backend)

Supported shape: `grep -R|-r [-n] [-F|--fixed-strings] PATTERN DIR`

Falls back to native grep for:
- regex/meta patterns
- `-i`/ignore-case
- unsupported flags
- multi-path shapes
- non-directory paths

## Plugins

```bash
make plugins                    # list plugins
bun run scripts/plugins-cli.ts status   # detailed status
bun run scripts/plugins-cli.ts enable smart-find
bun run scripts/plugins-cli.ts disable smart-find
```

| Plugin | Capability | Profile | Env Enable | Env Disable |
|--------|-----------|---------|-----------|-------------|
| smart-find | ranked_preview | fast | `NCR_ENABLE_SMART_FIND=1` | `SMART_FIND=0` |
| fff-grep | ranked_preview | fast | `NCR_ENABLE_FFF_GREP=1` | `SMART_GREP=0` |

Capability types:
- `drop_in_safe`: Eligible for default-on in stable profile.
- `ranked_preview`: Opt-in only, not default-on unless explicitly requested.

## Installation

```bash
git clone https://github.com/light-merlin-dark/native-command-router.git
cd native-command-router
bun install
make install
make doctor
```

## Diagnostics

```bash
make doctor              # router status
make doctor -- --verbose # detailed plugin/routing info
```

Trace mode for debugging route decisions:

```bash
NCR_TRACE=1 grep -R -n TODO src/
NCR_DEBUG=1 find . -type f
```

## Conformance Testing

```bash
make test-conformance   # run full conformance suite
```

Compares NCR output against native commands for supported matrix shapes. See `docs/supported-matrix.json` for the full command shape registry.

## Benchmarking

```bash
make bench BENCH_PATH=/path/to/repo BENCH_GREP_QUERY=TODO BENCH_FILE_QUERY=ts
make bench-session BENCH_PATH=/path/to/repo BENCH_GREP_QUERY=TODO
```

## Development

```bash
bun install
bunx tsc --noEmit
make install
make doctor
make test-conformance
```

## Uninstall

```bash
make uninstall
```

This restores backed-up binaries when available and removes NCR-managed wrappers.

## Project Direction

- NCR-first architecture (router core + policy engine + plugin registry).
- Optimization plugins as optional backends gated by profile.
- Compatibility conformance tests as release gates to prevent output drift.
- Known behavior differences are tracked in `docs/compatibility-gaps.md`.
- Full handoff plan and hard success factors are tracked in `docs/HANDOFF.md`.

## Local Agent Guidance

- `AGENTS.md` is intentionally local-only and gitignored.
- Use `AGENTS.example.md` as the template for local agent instructions.
- Compatibility policy in agent guidance is binding: unresolved plugin/native mismatches must be surfaced and tracked.

## License

MIT License - see [LICENSE](LICENSE).

---

Built by [Robert E. Beckner III (Merlin)](https://rbeckner.com)
