# Performance Benchmarks

Last updated: 2026-04-10

## Environment

- OS: macOS (Apple Silicon)
- Runner: NCR via `~/.local/bin/find` / `~/.local/bin/grep` wrappers
- Runs: 5 per command, 1 warmup, median reported
- Profile: `stable` (default)

## Stable Profile Overhead

The stable profile routes all commands to native tools. Overhead should be minimal (wrapper invocation + routing decision).

### grep benchmark: `grep -R -n --fixed-strings TODO <path>`

| Repo | Files | Native (ms) | NCR Stable (ms) | Overhead |
|------|-------|-------------|------------------|----------|
| ldis/apps/api/src | 537 | 33.7 | 35.0 | **3.8%** |
| seoreport/seoreport-web | 233 | 4326.1 | 4313.0 | **-0.3%** |

### find benchmark: `find <path> -type f -name "*ts*"`

| Repo | Files | Native (ms) | NCR Stable (ms) | Overhead |
|------|-------|-------------|------------------|----------|
| ldis/apps/api/src | 537 | 4.9 | 5.0 | **2.9%** |
| seoreport/seoreport-web | 233 | 176.8 | 174.2 | **-1.4%** |

**SF-3 Result: PASS** — Stable profile median overhead <= 10% on both representative repos.

## Fast Profile Status

The fast profile enables optimization plugins (FFF grep, smart-find). However:

1. **FFF grep** has a per-invocation cold-start cost (MCP process startup + indexing).
2. **GAP-001** (FFF grep completeness mismatch) means results differ from native.
3. The >= 2x speedup target requires persistent/daemon-mode FFF sessions, which are not yet integrated.

**SF-3 Result: NOT MET** for fast profile speedup target. The fast profile is available for experimentation but does not meet the performance qualification bar yet.

## Reproducing

```bash
# Stable overhead
bun run tests/bench-perf.ts --repos "/path/to/repo1,/path/to/repo2" --grep-query TODO --find-query ts --runs 5 --warmup 1

# Fast profile
bun run tests/bench-fast-profile.ts --repo /path/to/repo --query TODO --runs 3
```
