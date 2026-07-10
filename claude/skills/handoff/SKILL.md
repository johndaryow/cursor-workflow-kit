---
name: handoff
description: Context limit handoff at ~50% session — prefer fresh agent per slice instead. Use only when mid-slice blocked and slice cannot be abandoned.
---

# Handoff

**Default:** one slice = one fresh agent session. Do not handoff mid-slice.

Note: Claude Code auto-compresses long conversations as they approach the context limit, so you can often keep going past where a Cursor chat would need a manual handoff. Use this skill when the slice is genuinely blocked, not just because the session is long.

## If context is tight and slice incomplete

1. Write SESSION REPORT with `Status: blocked` or `partial`
2. Update STATUS `BLOCKED_BY: context` or leave slice active
3. New agent session reads STATUS + PR branch name in report

## Handoff block (in PR comment or STATUS notes)

```text
HANDOFF — <slice>
Branch: claude/... (or cursor/... if started there)
PR: #n
Done: <bullets>
Remaining: <bullets>
Next command: <test or file to open>
```

CEO does not action handoffs — agent continues.
