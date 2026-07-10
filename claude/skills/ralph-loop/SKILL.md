---
name: ralph-loop
description: Chains AFK slices using STATUS AFK_QUEUE and doc updates — Claude Code adaptation of Pocock's Ralph loop. Use for scripted batches and multi-slice worker programs.
---

# Ralph loop (Claude Code)

Pocock's Ralph loop = pick next AFK task → implement → test → commit → repeat until done.

**This is the one piece of the workflow that genuinely differs by agent — read this before assuming parity with the Cursor side.**

- **Cursor's chain:** PR merge → GitHub Action (`ralph-continue-on-merge.yml`, needs `CURSOR_API_KEY`) → `mc:ralph-launch` → new **Cursor Cloud Agent** → next slice. That GitHub Action calls Cursor's Cloud Agent API specifically — it cannot start a Claude Code session.
- **Claude Code has no plug into that same Action.** The STATUS dashboard, `AFK_QUEUE`, tags, and scripts are 100% shared — a Claude Code session can read a queue a Cursor agent built, and vice versa. What's missing is the "auto-start the next agent" step.

## Two ways to chain from Claude Code

### 1. Manual cold-start (simplest — start here)

After a merge, in a **new** Claude Code session say:

```text
Continue
```

or

```text
Start W18
```

Same as the Cursor pattern — `mc-status` skill reads `NEXT_PROMPT` / first `AFK_QUEUE` item and the agent executes it via `afk-slice`. No automation needed; the CEO (or a script) just opens the next session.

### 2. Automated cold-start (optional — Claude Code Routines)

If you're running Claude Code on the web, you can schedule a **Routine** (a cron-like trigger) that fires a fresh session with a "Continue" prompt on an interval, or after you notice a merge. This is not a merge-triggered webhook like the Cursor GitHub Action — it's closer to "check the queue every N minutes." Good enough for most solo-founder AFK batches; if you need true merge-triggered chaining from Claude Code, that requires a new GitHub Action step calling Claude Code's session-creation API instead of Cursor's — a small follow-on project, not something this kit does today.

**Recommendation for a beginner running both tools:** keep the Cursor GitHub Action as your automated chain (`ralph-continue-on-merge.yml`), and use Claude Code for slices you want to drive interactively or when Cursor is unavailable. Both write to the same STATUS dashboard, so nothing is lost switching between them mid-program.

## Chain mechanics (shared, regardless of trigger mechanism)

1. STATUS `AFK_QUEUE` + master doc define order
2. Agent completes slice N → updates STATUS → auto-merge if green
3. Next agent (started manually, by the Cursor Action, or by a Routine) picks up slice N+1
4. Repeat until terminal slice, FAIL, HITL gate, or queue empty

## Parallel-fill

When a **track ends** (e.g. W11 — no W12 on creative track):

1. `mc:ralph-chain` runs fill-the-DAG logic
2. Picks **one** ready slice on an **idle** sub-lane (skips tracks already in `RALPH_RUNNING`)
3. Priority: W15 → W21 → W22 → W23 → W16 → W12 → …
4. One new agent per merge — safe cost; parallel happens when **multiple tracks merge** or **multiple lanes already running**

## Deterministic scripts (required for automations)

```bash
npm run mc:ralph-chain -- --pr-number <n>    # after merge — what to run next
npm run mc:ralph-fill-dag                    # cold-start — parallel-ready slices
npm run test:ralph-chain                     # verify chain logic
```

These are plain Node scripts — identical output no matter which agent runs them.

## Agent closeout (every AFK slice)

1. **Push before PR:** commit on feature branch → `git push -u origin <branch>` → then open PR (unpushed branch = a broken chain link)
2. PR body must include `Slice: W18` (or DLM-5, batch N) for the next run to pick up
3. **Before auto-merge:** `RALPH_RUNNING` must not list your slice — `npm run mc:slice-closeout -- --pr-number <n>` enforces this
4. **After merge:** the chain mechanism (GitHub Action or your next manual/Routine session) runs `mc:status-reconcile` then picks up the next slice — agents do not edit `RALPH_RUNNING` for bookkeeping

## Stop conditions (mandatory)

- Any exit test FAIL (new)
- `BLOCKED_BY` set
- `CEO_GATE: explicit_ok_in_chat` on **next** slice
- `RALPH_ACTION: notify` from `mc:ralph-chain` (includes **doc-only STATUS PRs**)
- Agent uncertainty — SESSION REPORT `Status: blocked`

## One merge = one chain (all programs)

- **Real slice PR** — SESSION REPORT + `Slice:` → chains next step
- **Doc-only PR** (`docs(...): STATUS post-merge`, dashboard-only) → **notify only** — never starts duplicate work
- Agents: never split STATUS into a second PR ([`afk-slice`](../afk-slice/SKILL.md))

## Good chain food

- Worker slices W9–W25 (AFK, disjoint sub-lanes)
- Scripted batches (Lane A)
- DLM-1, DLM-5, **DLM-8–DLM-11** (AFK only)

## Bad chain food

- HITL slices (DLM-4, schema, DNS) — chain stops; CEO OK required
- Two slices in one agent session
- New architecture / first bulk apply without CEO OK
