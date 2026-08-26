---
name: afk-slice
description: Executes one AFK slice from master doc STATUS and NEXT_PROMPT — verify, update doc in PR, auto-merge when green. Use for scripted migration batches and repeatable slices.
---

# AFK slice execution

## Pre-flight

0. `npm run cloud:env-check` — stop and report if FAIL (AFK must not run deploy without credentials). If this repo's version re-auths `gh` with a PAT for the Cursor Cloud path, Claude Code sessions with GitHub MCP tools available can usually skip that step — MCP handles PR create directly.
1. `npm run gcp:auth` when deploy/spot-check needed
2. `npm run mc:status` — confirm `AUTONOMY: AFK`, `BLOCKED_BY: none`, read `CHAT_RENAME:`
3. **First reply line:** `**Chat name:** <CHAT_RENAME>` (see [`agent-chat-session.md`](../../../docs/rules/planning-chain.md))
4. Read NEXT_PROMPT / `RECOMMENDED_SLICE` only + linked files in prompt

## Execute

1. Branch: `<tool>/<slice-name>-<id>` — `claude/` in Claude Code, `cursor/` in Cursor, `codex/` in
   Codex. Same dashboards, same slice ids; only the prefix differs.
2. Implement scope — **stop** if ambiguous; do not guess
3. Run every exit test in prompt
4. TDD for logic changes (`tdd` skill)

**STATUS / `RALPH_RUNNING`:** The pipeline owns queue bookkeeping. Do **not** set `RALPH_RUNNING` on slice start. Before auto-merge, ensure `RALPH_RUNNING` does **not** contain your slice id (GitHub Action or your own chain step reconciles after merge).

## End

0. **`npm run preflight`** — the fourteen checks a pull request used to run. Green before you push;
   a push that skipped it is a push nobody checked. It prints what it skipped — repeat that in the
   report ([`preflight.md`](../../../docs/rules/preflight.md)).
0b. **Fresh critic** — `/critic`. A subagent with no memory of building this rules MEETS or DOES NOT
   MEET the bar (the §12 exit tests + the CEO's words). You never judge your own diff in this
   session. Skip only for docs-only/status changes, and say so
   ([`critic.md`](../../../docs/rules/critic.md)).
1. Update STATUS DASHBOARD + scorecard in **same PR**
2. **Commit → push → then PR:** `git push -u origin <branch>` before opening the PR. Run `npm run mc:slice-closeout -- --branch <branch>` then verify GitHub auth if PR creation fails (Claude Code: check the GitHub MCP connection; Cursor: `npm run github:auth-check`).
3. PR description: SESSION REPORT ([`session-report-format.md`](../../../docs/rules/reporting.md)) — **must include** `Slice: <machine-id>` (e.g. `RH13`, `W18`)
4. Run `npm run mc:slice-closeout -- --pr-number <n>` before merge
5. If `MERGE_POLICY: auto_when_green` and all exit PASS → `npm run mc:auto-merge -- <pr> --wait 15`
   (or the GitHub MCP merge tool). **Always pass `--wait`** — a young PR reports zero checks, and zero
   checks is a refusal. Never hand-roll a CI wait ([`merging.md`](../../../docs/rules/merging.md)).
6. Post-merge: scoped deploy + spot-check if required
7. Advance `AFK_QUEUE` in STATUS if slice complete
8. **Then stop — say nothing in chat.** The whole SESSION REPORT lives in the PR body, next prompt
   included; the merge launches the next slice. No chat summary, no PR link, no "Continue"
   ([`reporting.md`](../../../docs/rules/reporting.md)).
9. **Chain:** see [`ralph-loop`](../ralph-loop/SKILL.md) for how the next slice gets picked up — mechanism differs between Cursor (GitHub Action → Cloud Agent) and Claude Code (the cold-start prompt above or a scheduled Routine). **Do not** trigger the next agent yourself from inside the slice session (duplicate risk).

## MUST NOT

- **Push without a green `npm run preflight`** — nothing on GitHub re-checks a PR any more
- **Judge your own diff** instead of spawning a fresh critic — same context, same blind spot

- Expand scope beyond MUST NOT lines in prompt
- Advance queue on FAIL
- Ask CEO to paste reports to another chat
- **Open a second PR** only to update STATUS/scorecard — put dashboard updates in the **same PR** as the slice (avoids double chain trigger on merge)
- **Never** open a STATUS closeout PR after merge — auto-merge + STATUS in same PR only
