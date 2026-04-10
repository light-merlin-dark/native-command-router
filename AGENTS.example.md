# AGENTS.md (Example)

Copy this file to `AGENTS.md` for local agent behavior.  
`AGENTS.md` is intentionally gitignored.

## Compatibility Constitution

1. NCR is judged against native command behavior first.
2. Any plugin/backend mismatch vs native output shape must be treated as a defect.
3. If mismatch is not confidently resolvable in NCR, route to native by default and surface the gap.
4. Every discovered gap must be recorded in `docs/compatibility-gaps.md`.
5. Every unresolved upstream-caused gap must be filed as an upstream issue with:
   - reproducible commands
   - expected native output
   - actual plugin output
   - impact on drop-in compatibility

## Required Checks Before Enabling A Plugin By Default

1. Conformance checks for stdout/stderr/exit codes pass on representative repos.
2. Scope correctness is verified (path-limited searches do not leak outside target).
3. Result completeness is verified for supported command shapes.
4. Fallback behavior is verified for unsupported flags and error paths.

## Mandatory Reporting

When a gap is found:

1. Add an entry to `docs/compatibility-gaps.md`.
2. Open/update an issue in the relevant upstream repository.
3. Link the upstream issue in the local gap record.
