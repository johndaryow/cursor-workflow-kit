---
name: planning-session
description: After grill-me — write destination PRD only (Pocock /to-prd). New chat required. No vertical slices, §12, or AFK_QUEUE.
disable-model-invocation: true
---

# Planning session (PRD only · Pocock /to-prd)

**When:** CEO confirmed shared understanding from `grill-me`.

**Not when:** Slice planning, execution, or AFK batches.

## Hard stop (non-negotiable)

This chat ends with a **destination document only**. Do **not** write:

- Vertical slice IDs, phase tables, or dependency chains
- §12 execution prompts
- `AFK_QUEUE`, `NEXT_PROMPT`, or Ralph tag blocks
- Slice roadmap or “execution plan” sections in the PRD

**Next step:** CEO opens a **fresh chat** → `slice-planning` skill.

## Process

1. **Explore the codebase** (if not already) — verify grill assertions; use domain vocabulary from architecture docs.
2. **Sketch test seams** — prefer existing seams; propose new ones at the highest point possible. Confirm with CEO if seams are non-obvious.
3. **Write the PRD** using the template below — synthesize the grill; **do not re-interview** unless a blocking gap appears.

## PRD template (destination only)

Write to `docs/projects/{PROGRAM}_PRD.md` or the program’s canonical PRD path. Link from the program master doc — do not replace STATUS execution fields.

```markdown
# {PROGRAM} — PRD

**Method:** grill → **this PRD** → vertical slices in separate `slice-planning` chat → `{program}-master.md`

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
CEO-readable “done when…” for the whole program (not per-slice).

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
- Title pattern: `docs({PROGRAM}): PRD — {short goal}` — avoids false Ralph chain
- **Do not** set `AFK_QUEUE` or write §12 blocks in this PR

## Model

Opus · Plan · **new chat** after grill for architecture-heavy programs.
