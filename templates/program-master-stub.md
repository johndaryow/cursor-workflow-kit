# MYPROGRAM — Master Doc

**Program code:** MYPROGRAM  
**Status:** Planning or execution — update STATUS each PR  
**Owner:** CEO + Cursor Cloud Agents  
**Canon:** `.cursor/rules/workflow-core.mdc`

> **Goal:** One sentence — what this program delivers.

---

## STATUS DASHBOARD

> Agents: read **only this block** + `NEXT_PROMPT` before scanning the doc. Update in every executor PR.

```text
ACTIVE_PROGRAM: MYPROGRAM
ACTIVE_SLICE: none
AUTONOMY: AFK
CEO_GATE: none
MERGE_POLICY: auto_when_green
BLOCKED_BY: none
LAST_SOAK: none
DEPLOY_AFTER_MERGE: none
LAST_MERGED_PR: none
LAST_PR: none
NEXT_PROMPT: §12 · MY-1
AFK_QUEUE: MY-1
PARALLEL_LANE_B: none
RALPH_RUNNING: none
```

---

## Slice map (tracer bullets)

| Slice | Title | Tags |
|-------|-------|------|
| MY-1 | First end-to-end tracer bullet | AFK · auto_when_green |

---

## §12 — Execution prompts

### MY-1 — First slice

```text
AUTONOMY: AFK
CEO_GATE: none
MERGE_POLICY: auto_when_green
EST_COST: Low — local/dev only
ON_SUCCESS: none
ON_FAIL: stop — do not advance queue

Rename this chat to: MYPROGRAM MY-1 · first tracer

Goal: One thin vertical slice — schema/API/UI/test — with scripted exit tests.

Exit tests:
- npm test (or project verify script): PASS
- SESSION REPORT in PR with Slice: MY-1

MUST NOT:
- Expand scope beyond this slice
```
