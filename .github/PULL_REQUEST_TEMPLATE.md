# Pull Request Checklist

## Compatibility

- [ ] I have read `docs/compatibility-gaps.md` and understand current known gaps.
- [ ] This change does NOT alter native passthrough behavior for the `stable` profile.
- [ ] If this change modifies routing logic, I have verified conformance tests pass:
  ```bash
  make test-conformance
  ```
- [ ] If this change introduces a new compatibility gap, I have added it to `docs/compatibility-gaps.md`.

## Conformance Evidence

If this PR changes routing behavior (runner, plugins, profiles):

- [ ] `make test-conformance` output included showing 0 new failures.
- [ ] Any new test cases added to `tests/conformance.ts` for changed behavior.

## Documentation

- [ ] `docs/supported-matrix.json` updated if supported shapes changed.
- [ ] `docs/HANDOFF.md` updated if success factors or project state changed.
- [ ] README updated if user-facing behavior changed.

## Type Safety

- [ ] `bunx tsc --noEmit` passes with no errors.
