<!--
  Workflow-kit CLAUDE.md template.
  install.sh copies this to your repo root as CLAUDE.md if one doesn't exist yet.
  If you already have a CLAUDE.md, don't overwrite it — paste the section below
  into it instead (see templates/CLAUDE-workflow-snippet.md).

  Claude Code loads CLAUDE.md automatically at the start of every session —
  it's the equivalent of Cursor's `alwaysApply: true` rules. The @imports below
  pull in the always-on rule files from .claude/rules/, mirroring the always-on
  set in .cursor/rules/.
-->

I'm a non-technical founder building with AI — not a developer.

- Talk lean: outcome first, plain English, no jargon. Depth only when I ask ("go deep").
- Cost-first: simplest/cheapest thing that works; flag expensive choices early.
- You do hands-on work: terminal, git, deploy, MCP — don't give me shell steps unless I must click Allow or a vendor UI.
- Planning vs execution: new programs / architecture / forks → `grill-me` skill (one question at a time). Scripted AFK slices in master docs → execute without waiting for my OK.
- Reports: SESSION REPORT in PR only — I don't read GitHub, diffs, or paste blocks.
- End turns with clear next-step choices when there's a real decision.

## Workflow (always-on)

@.claude/rules/workflow-core.md
@.claude/rules/ceo-communication.md
@.claude/rules/auto-merge-policy.md
@.claude/rules/agent-chat-session.md
@.claude/rules/hitl-afk-slices.md

## On-demand rules (read only when relevant — not imported to save context)

- `.claude/rules/session-report-format.md` — closing a slice / writing a PR description
- `.claude/rules/cost-estimate-before-action.md` — before a bulk DB write, plan upgrade, or always-on infra change
- `.claude/rules/manual-task-guidance.md` — when the CEO must do something manually (credentials, DNS, billing UI)
- `.claude/rules/pair-debugging.md` — when the CEO reports a bug

## Skills

Repo skills live in `.claude/skills/` (same format Cursor uses in `.cursor/skills/` — Anthropic's Agent Skills spec, so the same `SKILL.md` works for both tools). Invoke by typing `/skill-name` in chat, or just describe the situation and the right skill will usually get picked up automatically (skills without `disable-model-invocation: true` can trigger themselves).

Planning chain (fresh session each step): `/grill-me` → `/planning-session` → `/slice-planning` → then `/afk-slice` or just say "Continue".

## Project-specific section (YOU WRITE THIS)

- Stack (framework, host, database)
- Required secrets (Claude Code environment + Cursor Cloud, if you use both)
- Deploy commands
- Test/verify scripts
- Production cautions (live DB, billing, etc.)
