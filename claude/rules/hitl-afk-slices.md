# HITL vs AFK slices

> Always-on rule — import from root `CLAUDE.md`. Identical in spirit to [`cursor/rules/hitl-afk-slices.mdc`](../../cursor/rules/hitl-afk-slices.mdc); the tags are agent-agnostic so a slice tagged by a Cursor planning session reads the same way in Claude Code.

Every §12 phase prompt (and every new slice in planning) must include these lines at the top:

```text
AUTONOMY: AFK | HITL
CEO_GATE: none | merge_only | explicit_ok_in_chat | human_only
MERGE_POLICY: auto_when_green | recommend_merge | do_not_merge
EST_COST: <plain English> | CEO approval required
ON_SUCCESS: <next STATUS slice id>
ON_FAIL: stop — do not advance queue
```

## Definitions

| Tag | Meaning |
|-----|---------|
| **AFK** | Away from keyboard — agent runs without CEO in chat. Clear exit tests required. |
| **HITL** | Human in the loop — needs CEO judgment before or during work. |
| **CEO_GATE: none** | No CEO action until report (rare for production). |
| **CEO_GATE: merge_only** | CEO used to click merge — use `MERGE_POLICY: auto_when_green` instead when AFK. |
| **CEO_GATE: explicit_ok_in_chat** | CEO must type approval in chat/session before apply/deploy/DNS. |
| **CEO_GATE: human_only** | CEO must perform action (credentials, DNS UI, vendor billing). |

## Default classifications

| Work type | AUTONOMY | CEO_GATE | MERGE_POLICY |
|-----------|----------|----------|--------------|
| Scripted migration batch | AFK | none | auto_when_green |
| Daily soak / verify scripts | AFK | none | auto_when_green |
| New product program | HITL | explicit_ok_in_chat | recommend_merge |
| DNS / production cutover | HITL | explicit_ok_in_chat | do_not_merge until OK |
| Schema migration (Supabase) | HITL | explicit_ok_in_chat | recommend_merge |
| First bulk `--apply` on new pattern | HITL | explicit_ok_in_chat | do_not_merge until OK |
| UI feature slice | HITL or AFK | merge_only / auto | per preview need |
| Vendor billing cancel | HITL | human_only | — |

## AFK requirements (all must be true)

1. Slice fits one agent context (smart zone).
2. Exit tests are **scripted or checklist** — not vibes.
3. `ON_FAIL: stop` — agent does not improvise past ambiguity.
4. No `CEO_GATE: explicit_ok_in_chat` on this slice.

## Planning skill

When decomposing a PRD into slices, run the `slice-planning` skill (fresh session). Tag every §12 block before execution. Works the same whether the planning session runs in Cursor or Claude Code — the tags live in the shared master doc, not in either tool.
