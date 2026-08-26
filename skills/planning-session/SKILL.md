---
name: planning-session
description: After grill-me — write destination PRD only (Pocock /to-prd). New session required. No vertical slices, §12, or AFK_QUEUE.
disable-model-invocation: true
---

# Planning session (PRD only · Pocock /to-prd)

## Claim the programme first — before you read anything

```bash
npm run mc:claim-planning -- --program <program>
```

| It prints | You do |
|---|---|
| `CLAIMED` | **Push that commit before you start writing.** A claim nobody can see is not a claim. |
| `REFUSE` | **Stop.** Another session is planning this. Say so and end the turn. |
| `SKIP` | No planning step pending — check you were sent to the right programme. |

Two sessions once planned the same programme in parallel and one whole session was discarded.
Canon: [`planning-chain.md`](../../../docs/rules/planning-chain.md).

**When:** CEO confirmed shared understanding from `grill-me`.

**Not when:** Slice planning, execution, or AFK batches.

## Hard stop (non-negotiable)

This session ends with a **destination document only**. Do **not** write:

- Vertical slice IDs, phase tables, or dependency chains
- §12 execution prompts
- `AFK_QUEUE`, `NEXT_PROMPT`, or chain tag blocks
- Slice roadmap or "execution plan" sections in the PRD

**Next step:** `slice-planning` in a fresh session — **you** merge this PR and print that prompt before ending (see *Closing this session*). The CEO should never have to compose it or check whether this merged.

## Process

1. **Explore the codebase** (if not already) — verify grill assertions; use domain vocabulary from architecture docs.
2. **Sketch test seams** — prefer existing seams; propose new ones at the highest point possible. Confirm with CEO if seams are non-obvious.
3. **Write the PRD** using the template below — synthesize the grill; **do not re-interview** unless a blocking gap appears.

## PRD template (destination only)

Write to `docs/projects/{PROGRAM}_PRD.md` or the program's canonical PRD path. Link from the program master doc — do not replace STATUS execution fields.

```markdown
# {PROGRAM} — PRD

**Method:** grill → **this PRD** → vertical slices in separate `slice-planning` session → `{program}-master.md`

## Problem statement
…

## Solution (user perspective)
…

## User stories
Numbered list — extensive; cover all aspects.

## Implementation decisions
Modules, interfaces, schema, API contracts, architectural choices.
No file paths. Prototype snippets OK only when they encode a decision.

## Testing decisions
What makes a good test; which modules; prior art in repo.

## Program-level exit tests
CEO-readable "done when…" for the whole program (not per-slice).

**Never write a signed line-count target here** — `net lines ≤ 0`, "the repo is smaller",
"deletes more than it adds". Three programmes shipped one; all three failed it and all three were
right to. A programme that adds a real new ability adds code, and a programme asked to count its own
tests against the same budget as its component is under quiet pressure to write fewer tests.

It becomes an exit test **only** when removing duplication is the programme's stated purpose — a merge,
a dedupe, a retirement, a second engine deleted — **and** the CEO agreed at grill time. Then count
**production code only**: tests, proof harnesses, fixtures, generated bundles, scripts and documents
count on neither side.

Otherwise write the checkable version:

```markdown
- **E10 — Nothing dead is left behind.** Every export the programme added has a caller, every helper it
  replaced is gone or still reached, and the guard tests naming the deleted engine are green. The net
  production line delta is reported as a number — in whichever direction it lands.
```

## Out of scope
…

## Further notes
One line only: *Execution slices: planned in separate session → `{program}-master.md` §12.*
```

## Deliverables (this PR)

1. PRD file (above)
2. Master doc: **locked decisions** table + link to PRD + `GRILL: ✅` line — **no slice table**
3. Register program in `platform-migration-master.md` §9 if new (pointer only)

## Planning PR closeout

- SESSION REPORT with human label: `Slice: {PROGRAM} PRD planning` (not a machine slice id)
- Title pattern: `docs({PROGRAM}): PRD — {short goal}` — avoids a false chain trigger
- **Do not** set `AFK_QUEUE` or write §12 blocks in this PR

## Closing this session

1. Docs-only PR → run the gate (`npm run mc:merge-verdict`) → **merge it yourself when green.**
   The CEO does not review planning documents.
2. **Then stop.** The merge launches the next session. Do **not** print the next prompt in chat, and do
   **not** create the session yourself — two launchers for one step is a duplicate the chain has already
   paid a session for.
3. The next prompt goes in the **PR body** only. `npm run mc:handoff -- <program>` is the manual cold
   start, for when a launch is missed or a person wants to run the step by hand.

Canon: [`planning-chain.md`](../../../docs/rules/planning-chain.md).


## Model

Opus · new session after grill for architecture-heavy programs.
