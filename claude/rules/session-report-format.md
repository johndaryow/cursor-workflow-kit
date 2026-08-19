# SESSION REPORT format (PR description)

> On-demand rule — the Claude Code equivalent of Cursor's `alwaysApply: false`. Don't import this into `CLAUDE.md` (it would eat context every session); instead the `session-report` skill reads this file only when closing a slice. Same content as [`cursor/rules/session-report-format.mdc`](../../cursor/rules/session-report-format.mdc).

CEO reads **this** — not diffs. Put the full report in the **PR description** (and repeat summary in agent chat/session).

**Do not** ask CEO to paste into a separate MC chat.

## Agent turn order

1. Run slice exit tests / smoke / spot-check
2. Plain-English **Assurance** paragraph
3. Auto-merge if policy allows ([`auto-merge-policy.md`](./auto-merge-policy.md)) **or** state blocked
4. SESSION REPORT block in PR description

## Template (PR description)

```markdown
## Assurance

<2–4 sentences: what changed in plain English, what passed, pre-existing reds if any>

## SESSION REPORT

- Program: <CODE>
- Slice: <machine-id> (e.g. CM3, CDRIVE-7, W18 — not a sentence)
- Status: done | blocked
- Date: YYYY-MM-DD

What shipped:
- <bullet>

Exit tests:
- Exit — <name>: PASS | FAIL (<note>)

Merge:
- PR #<n>: auto-merged | pending | blocked

Deploy:
- <none | hosting | edge:<name> | pages — done/pending>

Cost / telemetry:
- <one line>

Blocked / deferred:
- <none or bullet>

CEO action needed:
- <none | one bullet — human_only gates only>

Next slice:
- <ACTIVE_SLICE after this PR> — prompt: `npm run mc:opener -- <program>`

```text
<paste the exact block mc:opener printed, so the next session starts from it>
```
```

## Rules

- Plain English — no file dumps, no TypeScript in CEO-facing sections
- **`Slice:` must be a machine id** (`CM3`, `CDRIVE-7`, `W18`) — the chain uses it to advance the queue; human descriptions go under What shipped
- One line per exit test
- `CEO action needed: none` when AFK chain continues automatically
- **`Next slice:` names the program and carries the prompt** — run `npm run mc:opener -- <program>` and
  paste its output in the report. Never write "say Continue": it does not say which program
  ([`agent-chat-session.md`](./agent-chat-session.md))
- Link preview URL when UI changed

Use SESSION REPORT in the PR only, regardless of which agent opened it.
