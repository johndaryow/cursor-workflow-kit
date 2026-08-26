> On-demand rule. One copy, read by Claude Code, Cursor and Codex. Index: [`AGENTS.md`](../../AGENTS.md).

# Slice tags — HITL vs AFK

Every §12 phase prompt, and every new slice written in planning, carries these lines at the top:

```text
AUTONOMY: AFK | HITL
CEO_GATE: none | merge_only | explicit_ok_in_chat | human_only
MERGE_POLICY: auto_when_green | recommend_merge | do_not_merge
EST_COST: <plain English> | CEO approval required
ON_SUCCESS: <next STATUS slice id>
ON_FAIL: stop — do not advance queue
```

| Tag | Meaning |
|-----|---------|
| **AFK** | Away from keyboard — the agent runs without the CEO. Clear exit tests required. |
| **HITL** | Human in the loop — needs CEO judgment before or during the work. |
| `CEO_GATE: none` | No CEO action until the report. |
| `CEO_GATE: merge_only` | Legacy. Use `MERGE_POLICY: auto_when_green` instead when AFK. |
| `CEO_GATE: explicit_ok_in_chat` | The CEO must type approval before apply/deploy/DNS. |
| `CEO_GATE: human_only` | The CEO must perform the action — credentials, DNS UI, vendor billing. |

## Defaults

| Work type | AUTONOMY | CEO_GATE | MERGE_POLICY |
|-----------|----------|----------|--------------|
| Scripted migration batch | AFK | none | auto_when_green |
| Daily soak / verify scripts | AFK | none | auto_when_green |
| New product program | HITL | explicit_ok_in_chat | recommend_merge |
| DNS / production cutover | HITL | explicit_ok_in_chat | do_not_merge until OK |
| Schema migration (Supabase) | HITL | explicit_ok_in_chat | recommend_merge |
| First bulk `--apply` on a new pattern | HITL | explicit_ok_in_chat | do_not_merge until OK |
| UI feature slice | HITL or AFK | merge_only / auto | per preview need |
| Vendor billing cancel | HITL | human_only | — |

## AFK requires all four

1. The slice fits one agent context.
2. Exit tests are **scripted or a checklist** — not vibes.
3. `ON_FAIL: stop` — the agent does not improvise past ambiguity.
4. No `CEO_GATE: explicit_ok_in_chat` on this slice.

## Related

[`planning-chain.md`](./planning-chain.md) · [`merging.md`](./merging.md)
