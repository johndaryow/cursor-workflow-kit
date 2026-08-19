---
name: ralph-loop
description: Chains AFK slices using STATUS AFK_QUEUE and doc updates — Claude Code adaptation of Pocock's Ralph loop. Use for scripted batches and multi-slice worker programs.
---

# Ralph loop (Claude Code)

Pocock's Ralph loop = pick next AFK task → implement → test → commit → repeat until done.

**Only the launcher differs by agent.** The STATUS dashboard, `AFK_QUEUE`, slice tags, and every `mc:*` script are 100% shared — a Claude Code session can read a queue a Cursor agent built, and vice versa.

- **Cursor's chain:** PR merge → `ralph-continue-on-merge.yml` → `mc:ralph-launch` → **Cursor Cloud Agent API** → next slice.
- **Claude Code's chain:** the *same* workflow → `mc:ralph-fire-claude` → **Claude Code routine `/fire` API** → a fresh cloud session running the next slice.

Both launchers live in one workflow file and share the reconcile + plan steps. They are mutually exclusive, so **one merge** never starts two agents on the same slice — and since 2026-08-11 a **claim** stops *two merges* doing it either (see below).

## Three ways to chain from Claude Code

### 1. Merge-triggered (full parity with Cursor — the default once set up)

One repository secret is the engine switch:

| `CLAUDE_ROUTINE_FIRE_URL` secret | What runs on merge |
|---|---|
| not set | Cursor Cloud Agent (unchanged) |
| set | Claude Code routine → new cloud session |

The routine runs as a **full Claude Code cloud session** — same environment, setup script, secrets, and connectors as a session you open by hand, so `access:check`, deploys, and MCP tools all work. That is the important difference from running Claude inside a plain GitHub Actions runner.

Setup (one-time, mostly CEO clicks in the web UI): **`docs/projects/ralph-claude-setup-for-beginners.md`**.

Verify the wiring without spending a session:

```bash
npm run mc:ralph-fire-claude -- --merged-slice W17 --dry-run
```

### 2. Scheduled cold-start (no GitHub secret needed)

A routine with a **schedule trigger** (hourly or slower) that wakes, reads STATUS, and runs the next queued slice — or stops when the queue is empty. Coarser than merge-triggered and it burns a session per firing even when idle, but it needs no repo secret. Create it at [claude.ai/code/routines](https://claude.ai/code/routines) or with `/schedule` in the CLI.

### 3. Manual cold-start (always available)

Run `npm run mc:opener -- <program>` and paste what it prints into a **new** Claude Code session. That
prompt names the program, the slice, the master doc and your tool's rule paths, so the session starts
with nothing left to guess. Zero setup, zero idle cost — the fallback whenever automation is off or a
chain has stopped.

`Continue` and `Start W18` still work if the CEO types them: `mc-status` reads `NEXT_PROMPT` / the
first `AFK_QUEUE` item and `afk-slice` executes it. **But never offer `Continue` as the next step** —
it does not say which of 40+ programs to continue. Print the prompt instead
([`agent-chat-session.md`](../../rules/agent-chat-session.md)).

## Routine trigger types (reference)

Routines are Claude Code's automation primitive. Each routine is a saved prompt + repos + environment, with one or more triggers attached:

| Trigger | Use for |
|---------|---------|
| **API** | The Ralph chain — the merge workflow POSTs to the routine's `/fire` endpoint with the slice prompt as `text` |
| **GitHub event** | `pull_request.closed` filtered to merged. Simpler (no secret, no workflow edit) but fires on *every* merge including doc-only STATUS PRs, so it spends a session to discover there's nothing to do |
| **Schedule** | Option 2 above. Minimum interval is one hour |

We use the **API** trigger because the merge workflow already runs `ralph-chain.mjs` first — doc-only PRs, HITL gates, `BLOCKED_BY`, and empty queues are filtered in cheap CI minutes before any session is spent.

**This gap was real, and it fired (2026-08-11).** The Cursor launcher sends a deterministic `agentId` and treats HTTP 409 as "already launched"; the `/fire` endpoint has no equivalent, so duplicate protection was supposed to come from the workflow's `concurrency` group plus the planner's `RALPH_RUNNING` gate. The concurrency group worked. The `RALPH_RUNNING` gate could not: **nothing ever wrote that field.** `mc-status-reconcile.mjs` cleared it on merge, the planner read it, and it said `none` forever. A slice PR and a `chore(status):` follow-up merged ninety seconds apart, both planned LAF-8, and two sessions built it.

**Fixed by `scripts/ralph-chain-claim.mjs`** — a step between *plan* and *launch* that writes the next slice into `RALPH_RUNNING`, pushes, and reports whether the claim was taken. The launch steps run only on `claimed == 'true'`, and pass `--claimed-slice` so a run is not blocked by its own claim. Both engines sit behind it, so the guard cannot protect one launcher and not the other. It **fails closed**: a dead agent stalls its lane rather than duplicating it, visible in `npm run mc:status`. `npm run mc:ralph-health` asserts both this and the maintenance-PR classifier.

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
npm run mc:ralph-chain -- --pr-number <n>          # after merge — what to run next
npm run mc:ralph-fill-dag                          # cold-start — parallel-ready slices
npm run test:ralph-chain                           # verify chain logic
npm run mc:ralph-launch -- --pr-number <n>         # launch next slice — Cursor
npm run mc:ralph-fire-claude -- --pr-number <n>    # launch next slice — Claude Code
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
- **Doc-only / housekeeping PR** (`docs(...)`, `chore(...)`, `ci:`, `build:`, `style:`, or a body saying *no code changes* / *status-only* / *follow-up to #N*) → **notify only** — never starts duplicate work
- **Belt and braces** — even if a title slips past that classifier, the slice is claimed in `RALPH_RUNNING` before launch, so the second merge finds it held
- Agents: never split STATUS into a second PR ([`afk-slice`](../afk-slice/SKILL.md))

## Good chain food

- Worker slices W9–W25 (AFK, disjoint sub-lanes)
- Scripted batches (Lane A)
- DLM-1, DLM-5, **DLM-8–DLM-11** (AFK only)

## Bad chain food

- HITL slices (DLM-4, schema, DNS) — chain stops; CEO OK required
- Two slices in one agent session
- New architecture / first bulk apply without CEO OK
