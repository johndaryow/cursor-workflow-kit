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
HOLD: <why this may not start yet>          # optional
HOLD_UNTIL: <gate name>                     # required whenever HOLD is present
```

| Tag | Meaning |
|-----|---------|
| **AFK** | Away from keyboard — the agent runs without the CEO. Clear exit tests required. |
| **HITL** | Human in the loop — needs CEO judgment before or during the work. |
| `CEO_GATE: none` | No CEO action until the report. |
| `CEO_GATE: merge_only` | Legacy. Use `MERGE_POLICY: auto_when_green` instead when AFK. |
| `CEO_GATE: explicit_ok_in_chat` | The CEO must type approval before apply/deploy/DNS. |
| `CEO_GATE: human_only` | The CEO must perform the action — credentials, DNS UI, vendor billing. |
| `HOLD` | This slice may not start yet. Read by the chain, the queue and `afkf:hold-check` — **not** advice. |
| `HOLD_UNTIL` | The named check that releases it. Without one the slice stays held for ever. |

## HOLD — a wait a machine enforces

A `HOLD` used to be a sentence in the document and nothing else. On 2026-08-21 the chain claimed
and launched AFKF-18 six days before its own block said it could start, because prose is not a
gate. It is one now.

```bash
npm run afkf:hold-check              # everything currently held, and why
npm run afkf:hold-check -- AFKF-18   # one slice. Exits 1 when held
```

**Name a check, never a date.** The stopgap for AFKF-18 was a hand-typed `held until 2026-08-27`,
and that date was wrong — the window's first day was never recorded, so it could not close before
the 28th. A wrong date fails **open**: the day arrives and the gate lets the slice through. A named
check is re-evaluated every time anything asks, so it cannot go stale.

Gates today: `chain-divergence-window`.

**Everything unknown is held.** No `HOLD_UNTIL`, a gate name with a typo, a database that could not
be reached — all four resolve to held, and the reason says which. The way to start a held slice is
to make its evidence exist, never to make the check quieter.

**Where a held slice stops the lane, and where it does not.** `npm run afkf:chain-queue` skips it and
offers the next ready slice from another programme. The on-merge chain does not: a held slice at the
front of its own programme stops that programme's lane until the hold releases. That is the intended
trade — the alternative is starting work out of order — but say so rather than implying the chain
routes around it.

**A `HOLD` with no `HOLD_UNTIL` is held for ever, by design and with no escape but an edit.** Use it
only when the release condition is a human judgement that nothing records. AFKF-22 is the live
example. If a check could record it, write the check.

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
