---
name: afk-slice
description: Executes one AFK slice from master doc STATUS and NEXT_PROMPT — verify, update doc in PR, auto-merge when green. Use for scripted migration batches and repeatable slices.
---

# AFK slice execution

## Pre-flight

0. `npm run cloud:env-check` — stop and report if FAIL (Ralph/AFK must not run deploy without credentials). This re-auths `gh` with `GITHUB_PAT` so PR create works (Cursor's default `ghs_*` integration cannot open PRs).
1. `npm run gcp:auth` when deploy/spot-check needed
2. `npm run mc:status` — confirm `AUTONOMY: AFK`, `BLOCKED_BY: none`, read `CHAT_RENAME:`
3. **First reply line:** `**Chat name:** <CHAT_RENAME>` (see [`agent-chat-session.mdc`](../../rules/agent-chat-session.mdc))
4. Read NEXT_PROMPT / `RECOMMENDED_SLICE` only + linked files in prompt

## Execute

1. Branch: `cursor/<slice-name>-3633` (or cloud task branch suffix)
2. Implement scope — **stop** if ambiguous; do not guess
3. Run every exit test in prompt
4. TDD for logic changes (`tdd` skill)

**STATUS / `RALPH_RUNNING` (WORKFLOW-P18):** Pipeline owns queue bookkeeping. Do **not** set `RALPH_RUNNING` on slice start. Before auto-merge, ensure `RALPH_RUNNING` does **not** contain your slice id (GitHub Action reconciles after merge).

## End

1. Update STATUS DASHBOARD + scorecard in **same PR**
2. **Commit → push → then PR:** `git push -u origin <branch>` before opening the PR. Run `npm run mc:slice-closeout -- --branch <branch>` then `npm run github:auth-check` if `gh pr create` fails.
3. PR description: SESSION REPORT ([`session-report-format.mdc`](../../rules/session-report-format.mdc)) — **must include** `Slice: <machine-id>` (e.g. `RH13`, `W18`)
4. Run `npm run mc:slice-closeout -- --pr-number <n>` before merge
5. If `MERGE_POLICY: auto_when_green` and all exit PASS → `npm run mc:auto-merge -- <pr>`
6. Post-merge: scoped deploy + spot-check if required
7. Advance `AFK_QUEUE` in STATUS if slice complete
8. **Chain:** GitHub Action `ralph-continue-on-merge.yml` → `mc:ralph-launch` starts next agent. **Do not** call `mc:ralph-launch` from the slice agent (duplicate risk). Canon: [`workflow-afk-foundation.md`](../../docs/projects/workflow-afk-foundation.md)

## MUST NOT

- Expand scope beyond MUST NOT lines in prompt
- Advance queue on FAIL
- Ask CEO to paste reports to another chat
- **Open a second PR** only to update STATUS/scorecard — put dashboard updates in the **same PR** as the slice (avoids double Ralph trigger on merge)
- **Never** open a STATUS closeout PR after merge — `mc:auto-merge` + STATUS in same PR only
