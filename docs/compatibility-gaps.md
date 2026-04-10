# Compatibility Gaps

This file tracks known differences between NCR-routed behavior and native command behavior.

## Open Gaps

### GAP-001: FFF grep result completeness vs native `grep -R -n --fixed-strings`

- Date observed: 2026-04-10
- Area: `grep` plugin (`fff` backend)
- Severity: High for drop-in compatibility
- Status: Open (native default kept, plugin opt-in)

#### Reproduction

```bash
API_SRC=apps/api/src
WEB_SRC=apps/web/src

# run from repo root

SMART_GREP=0 grep -R -n --fixed-strings TODO "$API_SRC" | wc -l
NCR_ENABLE_FFF_GREP=1 grep -R -n --fixed-strings TODO "$API_SRC" | wc -l

SMART_GREP=0 grep -R -n --fixed-strings TODO "$WEB_SRC" | wc -l
NCR_ENABLE_FFF_GREP=1 grep -R -n --fixed-strings TODO "$WEB_SRC" | wc -l
```

Observed:

- API native: `14`
- API FFF plugin: `6`
- Web native: `4`
- Web FFF plugin: `2`

#### Expected

For supported shapes, plugin output should match native match completeness (or plugin should not be used by default).

#### Current Mitigation

- NCR defaults grep routing to native.
- FFF grep routing is opt-in only via `NCR_ENABLE_FFF_GREP=1`.

#### Upstream

- Repository: <https://github.com/dmtrKovalenko/fff.nvim>
- Issue: <https://github.com/dmtrKovalenko/fff.nvim/issues/365>

### GAP-002: smart-find filters noise directories producing fewer results than native `find`

- Date observed: 2026-04-10
- Area: `find` routing (`smart-find` backend)
- Severity: Medium (intentional behavior, not drop-in compatible)
- Status: Open (design decision needed)

#### Reproduction

```bash
FIXTURE=/path/to/repo-with-node-modules

/usr/bin/find "$FIXTURE" -type f | wc -l
# NCR routes to smart-find:
bun scripts/ncr-runner.ts find "$FIXTURE" -type f | wc -l
```

Observed:

- Native `find` includes all files in `node_modules/`, `dist/`, `build/`
- smart-find filters these noise directories, producing fewer results

#### Expected

For drop-in compatibility, NCR-routed find should produce native-equivalent output.

#### Current Mitigation

- Users can bypass with `SMART_FIND=0 find ...` or `find --raw ...`
- This is intentional smart-find behavior but breaks the drop-in contract for SF-1

#### Resolution Options

1. ~~Make smart-find behavior opt-in (like FFF grep) until native-equivalent routing is verified~~ **Adopted: smart-find is now opt-in via NCR_ENABLE_SMART_FIND=1 or NCR_PROFILE=fast**
2. Track as known design tradeoff in supported matrix
3. Add `drop_in_safe` flag to find routing policy

#### Resolution (2026-04-10)

Smart-find is now gated behind the plugin system. In `stable` profile (default), find routes to native. In `fast` profile, smart-find is enabled. This preserves drop-in safety for SF-1.

## Closed Gaps

### GAP-003: symlinked base path caused false out-of-scope filtering in FFF helper

- Date observed: 2026-04-10
- Date closed: 2026-04-10
- Area: `grep` plugin helper path scoping
- Severity: High for correctness in symlinked paths (for example `/tmp` on macOS)

#### Symptom

When the search base path used a symlink alias, helper path comparisons could treat valid matches as outside scope, dropping all results.

#### Resolution

`scripts/grep-fff-helper.ts` now canonicalizes base, git-root, and resolved match paths before scope checks, while still rendering output paths in input-aligned form.
