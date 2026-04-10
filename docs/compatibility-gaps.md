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
API_SRC=/Users/merlin/_dev/ldis/apps/api/src
WEB_SRC=/Users/merlin/_dev/ldis/apps/web/src

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

## Closed Gaps

None yet.
