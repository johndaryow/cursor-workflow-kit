> On-demand rule. One copy, read by Claude Code, Cursor and Codex. Index: [`AGENTS.md`](../../AGENTS.md).

# Reporting — silence, the PR body, and the digest

**Three levels, and nothing between them.**

| Level | What it is | Where it goes |
|-------|------------|---------------|
| **Success** | A slice finished and merged | **Nothing.** No chat summary, no PR link, no next prompt |
| **Daily** | What shipped, what needs eyes, the counters | One digest, once a day, on the team's Updates board |
| **Alert** | **Stuck**, **money**, **fire** — only these three | The phone |

A finished slice is not news. It is the expected outcome, and reporting it costs the CEO an
interruption to learn that nothing needs them.

## What a successful session does at the end

1. Puts the **whole** SESSION REPORT in the **PR body** — assurance, exit tests, deploy, cost, next prompt.
2. Merges when green ([`merging.md`](./merging.md)).
3. **Says nothing else.** No repeat of the summary in chat. No PR link in chat. No next prompt in chat.

**Blocked is different.** A blocked slice writes `Status: blocked` and says so — a stall a human can
see is recoverable, a silent one is not.

## The SESSION REPORT template (PR body)

```markdown
## Assurance

<2–4 sentences: what changed in plain English, what passed, pre-existing reds if any>

## SESSION REPORT

- Program: <CODE>
- Slice: <machine-id>            # CM3, CDRIVE-7, W18 — an id, never a sentence
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
- <one line, including net production line delta as a number>

Blocked / deferred:
- <none or bullet>

CEO action needed:
- <none | one bullet — human_only gates only>

Next slice:
- <slice id> — cold-start prompt: `npm run mc:opener -- <program>`
```

### Rules

- Plain English. No file dumps, no TypeScript in CEO-facing sections.
- `Slice:` must be a **machine id** — the chain reads it to advance the queue.
- One line per exit test.
- `CEO action needed: none` when the chain continues automatically.
- **Report the net production line delta as a number, in whichever direction it lands.** It is a smoke
  alarm, not a verdict — see [`planning-chain.md`](./planning-chain.md#net-lines-is-a-measurement).
- Link the preview URL when UI changed.
- The next prompt lives **here**, in the PR body, where a machine reads it — not in chat, where a
  person is interrupted by it. Normally the merge launches the next session on its own.

## The digest

`npm run afkf:digest` builds one Manila day: what shipped, board rows lifted from the changelog's
`**Board:**` lines, work still owing a board line, the batched eyes-list with links, the alerts, and the
counters **E1** (bookkeeping share of merged commits over 7 days), **E3** (open PRs older than 24h) and
**E4** (CEO status-check sessions).

- **One place.** No second digest, no dashboard page, no email.
- **An empty day is not an entry.**
- **Batched, never pinged.** Anything needing the CEO's eyes rides in one list with links.
- **The first slice of a brand-new programme is flagged.**
- Dedupe rides on `public.events` via `record_event`. No third table.

## What may never reach the phone

An alert says what is stuck and why, in one sentence. **No link and no command** — `phoneSafe()` in
`scripts/afkf-digest.mjs` strips both, so a dashboard line pasted with a URL cannot become an
interruption that asks the CEO to go and look. Things to look at belong in the batched list.

## Related

[`merging.md`](./merging.md) · [`updates-board.md`](./updates-board.md) · [`changelog.md`](./changelog.md)
