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
  - `grep --raw ...`
  - `/usr/bin/find ...`, `/usr/bin/grep ...`

## How It Works

- Managed wrappers are installed into `~/.local/bin` for `find` and `grep`.
- Wrappers call `~/.local/share/ncr/bin/ncr-runner.mjs`.
- Runner selects backend per command policy:
  - `find` -> `smart-find` if available, otherwise native `find`
  - `grep` -> optimization adapter for safe recursive literal subset, otherwise native `grep`
- Optimization adapters are internal plugin-style modules. Current optimized backend is FFF.

## Current Routing Policy

### `find`

- Routed to `smart-find` when present.
- Smart defaults exclude noise directories (`node_modules`, `.git`, `dist`, `build`, and others).
- Falls back to `/usr/bin/find` when needed.

### `grep`

- Default: routed to native grep (compatibility mode).
- Opt-in optimized backend with `NCR_ENABLE_FFF_GREP=1` for this safe subset:
  - `grep -R|-r [-n] [-F|--fixed-strings] PATTERN DIR`
- Falls back to native grep for:
  - regex/meta patterns
  - `-i`/ignore-case
  - unsupported flags
  - multi-path shapes

## Installation

```bash
git clone https://github.com/light-merlin-dark/native-command-router.git
cd native-command-router
bun install
make install
make doctor
```

## Benchmarking

Run native vs routed vs optimized backend:

```bash
make bench BENCH_PATH=/path/to/repo BENCH_GREP_QUERY=TODO BENCH_FILE_QUERY=ts
```

Test optimized grep path explicitly:

```bash
NCR_ENABLE_FFF_GREP=1 grep -R -n --fixed-strings TODO /path/to/repo
```

Run warm/cold backend session timing:

```bash
make bench-session BENCH_PATH=/path/to/repo BENCH_GREP_QUERY=TODO
```

## Development

```bash
bun install
bunx tsc --noEmit
make install
make doctor
```

## Uninstall

```bash
make uninstall
```

This restores backed-up binaries when available and removes NCR-managed wrappers.

## Project Direction

- NCR-first architecture (router core + policy engine).
- Optimization plugins as optional backends.
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
