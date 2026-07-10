# Workflow core (Pocock · Claude Code)

> Always-on rule. Import this file from your repo's root `CLAUDE.md` with `@claude/rules/workflow-core.md` (see `claude/CLAUDE.md` in this kit) so it loads on every session — the Claude Code equivalent of a Cursor `alwaysApply: true` rule.

Matt Pocock's pattern adapted for **Claude Code** and a **non-developer CEO**. Same canon as the Cursor side: [`workflow-master.md`](../../docs/projects/workflow-master.md). This file is the Claude Code twin of [`cursor/rules/workflow-core.mdc`](../../cursor/rules/workflow-core.mdc) — keep them in sync when you edit either.

## Two modes

| Mode | Who | When |
|------|-----|------|
| **Planning (HITL)** | CEO + grill → PRD → slices | New program, failed slice, architecture — **three fresh sessions** |
| **Execution (AFK)** | Agent alone | Slice in master doc §12 with exit tests + tags |

**AFK means planning is done** — not "no plan." Tags: [`hitl-afk-slices.md`](./hitl-afk-slices.md).

## Doc-as-controller (no MC chat relay)

Master doc (`docs/projects/*-master.md`) is Mission Control — no separate MC chat, regardless of which agent you're driving from.

**First 60 seconds of any session:**

1. `npm run mc:status` or read `## STATUS DASHBOARD`
2. Print **Chat name** from `CHAT_RENAME:` ([`agent-chat-session.md`](./agent-chat-session.md))
3. Confirm `ACTIVE_PROGRAM` / `ACTIVE_SLICE` or first `AFK_QUEUE` item; if `BLOCKED_BY` ≠ `none` → stop
4. Read `NEXT_PROMPT` + linked files only — not whole child docs

**End of PR:** Update STATUS + scorecard in **same PR**; SESSION REPORT in PR body ([`session-report-format.md`](./session-report-format.md) or `session-report` skill). **Never** ask CEO to paste reports.

| Controller | Program |
|------------|---------|
| `platform-migration-master.md` | PLATFORM |
| `workflow-master.md` | WORKFLOW / agent ops |
| Other `*-master.md` | Per program — PLATFORM sequencing wins |

## Smart zone

One slice = one fresh agent session (fresh Claude Code session, same as a fresh Cursor chat). Status block (~50 lines) + slice prompt only.

## Session end state

Every task ends with:

1. Branch pushed (`claude/<name>-<id>` — see note below)
2. PR + SESSION REPORT + plain-English assurance
3. STATUS updated in same PR
4. Auto-merge if AFK + green ([`auto-merge-policy.md`](./auto-merge-policy.md))
5. Post-merge scoped deploy + spot-check when UI/deploy touched
6. Screenshots when UI-visible

**Branch prefix:** Cursor branches use `cursor/<name>-<id>`; Claude Code branches use `claude/<name>-<id>`. Same STATUS dashboard, same slice ids — only the prefix differs, so both agents' branches are easy to tell apart in the PR list.

**Default model:** see [`agent-discipline`](../skills/agent-discipline/SKILL.md) for the Claude model picks (Opus for planning, Sonnet for AFK execution) — the Claude Code equivalent of the Cursor Composer picks.

Do **not** push to `main`. Do **not** deploy prod hosting/functions before merge unless CEO hotfix OK.

## Paths

| Change | Path |
|--------|------|
| UI / hosting | Preview → merge → prod deploy |
| Backend only | Merge → scoped deploy (`functions:<name>`, firestore, Edge) |
| Mixed | Preview for UI + note post-merge function deploys |

Preview: build → deploy preview channel for PR. Prod UI: your production URL.

## CEO role

CEO does **not** read code, diffs, or TypeScript. CEO reads **SESSION REPORT** and status updates only.

CEO acts on: grill answers, `human_only` gates (credentials, DNS, billing), explicit OK for HITL slices.

## Automation first

CEO almost never runs terminal or vendor dashboards — **agent runs CLI, git, deploy, MCP**.

| Priority | Who |
|----------|-----|
| 1 | Agent — shell, git, deploy, logs, MCP |
| 2 | Existing `npm run …` script |
| 3 | CEO one action — OAuth Allow, DNS UI, billing cancel, new secret |
| 4 | **Never** — multi-step terminal instructions for routine work |

CEO manual only: credential UI, DNS cutover, `CEO_GATE: explicit_ok_in_chat`, captcha/2FA. Format: [`manual-task-guidance.md`](./manual-task-guidance.md). **Do not** ask CEO to merge AFK PRs.

## Skills (invoke with `/skill-name`)

| Skill | Use |
|-------|-----|
| `grill-me` | Alignment — new programs only, not AFK batches |
| `planning-session` | **PRD only** after grill (Pocock `/to-prd`) — hard stop before slices |
| `slice-planning` | Tracer bullets + tags + §12 + AFK queue after PRD merges (Pocock `/to-issues`) |
| `afk-slice` | Execute one AFK slice |
| `ralph-loop` | Chain AFK slices (reference — see automation note below) |
| `session-report` | CEO-readable PR closeout (tone: `ceo-communication.md`) |
| `agent-discipline` | Token/cost + model/session picks every session |
| `tdd` | Logic changes |
| `design-system-first` | UI work (optional tier) |
| `improve-codebase` | Architecture planning |
| `mc-status` | Where are we + chat rename before execution |
| `handoff` | Rare — prefer fresh session per slice |

## Chaining slices (Ralph loop) — read this if you're used to Cursor's auto-chain

Cursor's Ralph loop uses a GitHub Action that calls the **Cursor Cloud Agent API** to auto-launch the next agent after a merge. That API is Cursor-specific — Claude Code does not plug into it. In a Claude Code session:

- The STATUS dashboard, `AFK_QUEUE`, and slice tags are **identical** — you can read/continue a queue that a Cursor agent started, and vice versa.
- What does **not** carry over automatically: the "merge → auto-start next agent" GitHub Action step. After merging from Claude Code, either say **"Continue"** in a fresh Claude Code session (manual cold-start, same as `npm run mc:opener`) or use a Claude Code **Routine/scheduled trigger** to fire the next session automatically — see [`ralph-loop`](../skills/ralph-loop/SKILL.md) for the how-to.

## Secrets (cloud)

Same secrets as the Cursor side: `GOOGLE_APPLICATION_CREDENTIALS_JSON` · `AGENT_BROWSER_*` · `GITHUB_TOKEN` (auto-merge) · optional `SUPABASE_SERVICE_ROLE_KEY`.

Chat naming + continue: [`agent-chat-session.md`](./agent-chat-session.md) · `npm run mc:status` → `CHAT_RENAME:`
