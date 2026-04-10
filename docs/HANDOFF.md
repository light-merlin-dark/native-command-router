# NCR Agent Handoff

Last updated: 2026-04-10  
Repo: `light-merlin-dark/native-command-router`  
Baseline commit: `9dd8b1f`

## Mission

Build NCR into a compatibility-first native command router that:

1. Preserves native command expectations (`find`, `grep`) for users and AI agents.
2. Delivers real performance wins through optimization plugins.
3. Surfaces and tracks every compatibility gap until resolved.

## Hard Completion Rule

NCR is **not complete** until all success factors in this document are met.

If any success factor is unmet, the project remains in-progress regardless of speed gains or feature completeness.

## Current State Snapshot

1. `find` is intercepted and routed to `smart-find` backend.
2. `grep` is intercepted; default path is native for compatibility.
3. FFF grep route exists but is opt-in via `NCR_ENABLE_FFF_GREP=1`.
4. Known FFF grep completeness gap is tracked in:
   - `docs/compatibility-gaps.md` (GAP-001)
   - Upstream issue: <https://github.com/dmtrKovalenko/fff.nvim/issues/365>
5. Local agent constitution pattern exists:
   - `AGENTS.example.md` (tracked)
   - `AGENTS.md` is gitignored

## Non-Negotiable Principles

1. Compatibility is the product. Performance is a feature.
2. Any mismatch vs native behavior is a defect or an explicitly documented non-goal.
3. Unsupported/unsafe command shapes must route to native, never “best effort.”
4. Every unresolved gap must be tracked locally and (if upstream-caused) filed upstream.

## Success Factors (Required)

## SF-1: Drop-In Correctness (Supported Matrix)

NCR must produce native-equivalent behavior for supported command shapes.

Required outcomes:

1. Exact parity of:
   - `stdout` content
   - `stderr` behavior (including error messages where applicable)
   - exit codes (`0`, `1`, `2`)
2. Scope correctness:
   - No out-of-target path leakage
   - Path formatting consistent with native expectations
3. Verified by automated conformance tests in CI.

Pass threshold:

1. 100% pass on conformance suite for declared supported matrix.

## SF-2: Safe Fallback Behavior

NCR must never compromise correctness when command shape is not guaranteed.

Required outcomes:

1. Unsupported flags/shapes route to native.
2. Plugin failures/timeouts/errors route to native (with traceable reason).
3. No unhandled crashes from wrapper/runner in fallback paths.

Pass threshold:

1. 100% fallback-path test pass.

## SF-3: Measurable Performance Benefit

Optimization plugins must provide real wins where enabled.

Required outcomes:

1. Stable profile overhead stays low when using native path.
2. Fast profile/plugins show meaningful speedups on representative repos.

Pass threshold:

1. Stable profile median overhead <= 10% over direct native command for tested supported matrix.
2. Fast profile median speedup >= 2x on at least 2 large representative repos.

## SF-4: Plugin Contract Clarity

Plugin behavior must be explicit and machine-readable.

Required outcomes:

1. Plugin capability model exists, with at least:
   - `drop_in_safe` (eligible for default-on)
   - `ranked_preview` (not default-on unless explicitly requested)
2. Router policy uses capability flags to decide default routing.
3. `ncr plugins` UX exists for visibility and control.

Pass threshold:

1. Users can run `ncr plugins list/status/enable/disable` and see contract class.

## SF-5: Production Diagnostics

NCR must be debuggable in real deployments.

Required outcomes:

1. `ncr doctor --verbose` shows:
   - active wrappers
   - backend availability
   - active policy/profile
   - fallback counters/reasons
2. Structured trace mode (`NCR_TRACE=1`) for route decisions.

Pass threshold:

1. Debug traces sufficient to explain any route choice/fallback in field reports.

## SF-6: OSS Readiness and Trust

Community adoption depends on trust, not claims.

Required outcomes:

1. Clear docs for:
   - behavior contract
   - supported command matrix
   - known gaps and status
2. CI matrix on macOS + Linux.
3. Contribution workflow:
   - issue templates
   - compatibility bug template
   - PR checklist requiring conformance evidence.

Pass threshold:

1. A new contributor can reproduce baseline tests and understand known limitations in <30 minutes.

## Execution Plan (Priority Order)

## Phase 1: Conformance Foundation (Do First)

1. Create fixture repos under `tests/fixtures/` with known outputs.
2. Build test harness:
   - run native command
   - run NCR command
   - normalize only unavoidable platform noise
   - compare outputs and exit codes.
3. Cover matrix:
   - `find`: basic traversal, path filters, hidden dirs, symlinks, permission errors, `--raw`.
   - `grep`: recursive fixed-string, regex, case-insensitive, no matches, binary files, invalid regex, path scoping.

Deliverable:

1. `pnpm`/`bun` one-command conformance run with machine-readable report.

## Phase 2: Plugin Contract + Profiles

1. Add profile policy:
   - `stable` default (drop-in-safe only)
   - `fast` opt-in (includes ranked/preview plugins)
2. Add plugin metadata model and routing guards.
3. Implement `ncr plugins` command surface.

Deliverable:

1. Explicit behavior difference between profiles documented and test-covered.

## Phase 3: Diagnostics + Reliability

1. Implement route decision tracing and fallback counters.
2. Add `ncr doctor --verbose`.
3. Add stress tests for subprocess failures/timeouts and shell edge cases.

Deliverable:

1. Reproducible debug bundle for user-reported issues.

## Phase 4: Performance Qualification

1. Benchmark harness on:
   - `_dev/ldis`
   - at least one additional large repo.
2. Publish comparison tables per profile (`stable`, `fast`).
3. Ensure performance claims reference profile and command matrix.

Deliverable:

1. Honest benchmark docs with reproducible commands and environment.

## Open Gaps to Resolve

1. GAP-001 (FFF grep completeness mismatch) remains open.
2. Upstream response/action on issue #365 required to move FFF grep toward default-on in stable profile.

## Acceptance Checklist (Must All Be True)

- [ ] SF-1 complete
- [ ] SF-2 complete
- [ ] SF-3 complete
- [ ] SF-4 complete
- [ ] SF-5 complete
- [ ] SF-6 complete
- [ ] `docs/compatibility-gaps.md` has no open high-severity gaps for default-enabled paths
- [ ] README supported matrix matches actual router behavior
- [ ] CI green on macOS + Linux

## Suggested Immediate Next Actions (Next Agent)

1. Implement conformance test harness and fixtures (Phase 1).
2. Add first CI workflow to run conformance tests on macOS/Linux.
3. Add a machine-readable supported matrix file (for docs + tests to share one source of truth).
4. Keep FFF grep in opt-in mode until SF-1 and GAP-001 are resolved.

