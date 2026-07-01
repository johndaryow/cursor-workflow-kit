---
name: ralph-loop
description: Chains AFK slices using STATUS AFK_QUEUE and doc updates — Cursor adaptation of Pocock Ralph loop. Use for S6b batches, worker slices W9–W26, and DLM AFK steps.
---

# Ralph loop (Cursor)

Pocock's Ralph loop = pick next AFK task → implement → test → commit → repeat until done.

**Cursor has no in-session Stop hook.** Chain = **PR merge → GitHub Action → `mc:ralph-launch` → new Cloud Agent → next slice**.

Canon: [`workflow-afk-foundation.md`](../../docs/projects/workflow-afk-foundation.md)

## Chain mechanics

1. STATUS `AFK_QUEUE` + master doc define order
2. Agent completes slice N → updates STATUS → auto-merge if green
3. **GitHub Action** `ralph-continue-on-merge.yml` runs `mc:ralph-launch` → starts slice N+1
4. Repeat until terminal slice, FAIL, HITL gate, or queue empty

## Parallel-fill (WORKFLOW-P10)

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

## CEO starts chain

**After first merge in a lane:** Ralph handles the rest.

**Cold start (no recent merge):**

```text
Fill the DAG
```

or

```text
Start W18
```

in a new Cloud Agent. For parallel lanes, open one agent per slice from `mc:ralph-fill-dag` output.

## Automations (CEO — keep merge trigger OFF)

| Automation | Required? | Trigger |
|------------|-----------|---------|
| **Ralph continue on merge** | **No — Inactive** | Was PR merged; use **GitHub Action** instead |
| Morning digest | No | Daily/weekly status only |
| Ralph kickstart | No | Manual cold-start |

Chain engine: `.github/workflows/ralph-continue-on-merge.yml` — see [`workflow-afk-foundation.md`](../../docs/projects/workflow-afk-foundation.md)

## Agent closeout (every AFK slice)

1. **Push before PR:** commit on feature branch → `git push -u origin <branch>` → then open PR (unpushed branch = Ralph tool failure)
2. PR body must include `Slice: W18` (or DLM-5, S6b batch N) for next Ralph run
3. **Before auto-merge:** `RALPH_RUNNING` must not list your slice — `npm run mc:slice-closeout -- --pr-number <n>` enforces this (WORKFLOW-P18)
4. **After merge:** GitHub Action runs `mc:status-reconcile` then chains next slice — agents do not edit `RALPH_RUNNING` for bookkeeping

## Stop conditions (mandatory)

- Any exit test FAIL (new)
- `BLOCKED_BY` set
- `CEO_GATE: explicit_ok_in_chat` on **next** slice
- `RALPH_ACTION: notify` from mc:ralph-chain (includes **doc-only STATUS PRs**)
- Agent uncertainty — SESSION REPORT `Status: blocked`

## One merge = one chain (all programs)

- **Real slice PR** — SESSION REPORT + `Slice:` → Ralph chains next step
- **Doc-only PR** (`docs(...): STATUS post-merge`, dashboard-only) → Ralph **notify only** — never starts duplicate work
- Agents: never split STATUS into a second PR ([`afk-slice`](./afk-slice/SKILL.md))

## Good Ralph food

- Worker slices W9–W25 (AFK, disjoint sub-lanes)
- S6b batches (Lane A)
- DLM-1, DLM-5, **DLM-8–DLM-11** (AFK only)

## Bad Ralph food

- HITL slices (DLM-4, schema, DNS) — chain stops; CEO OK required
- Two slices in one agent session
- New architecture / first bulk apply without CEO OK
