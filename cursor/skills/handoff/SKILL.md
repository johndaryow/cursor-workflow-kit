---
name: handoff
description: Context limit handoff at ~50% session — prefer fresh agent per slice instead. Use only when mid-slice blocked and slice cannot be abandoned.
---

# Handoff

**Default:** one slice = one fresh agent. Do not handoff mid-slice.

## If context > ~50% and slice incomplete

1. Write SESSION REPORT with `Status: blocked` or `partial`
2. Update STATUS `BLOCKED_BY: context` or leave slice active
3. New agent reads STATUS + PR branch name in report

## Handoff block (in PR comment or STATUS notes)

```text
HANDOFF — <slice>
Branch: cursor/...
PR: #n
Done: <bullets>
Remaining: <bullets>
Next command: <test or file to open>
```

CEO does not action handoffs — agent continues.
