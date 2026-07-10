# CLAUDE.md — workflow snippet (paste into your repo's CLAUDE.md)

Use this if your repo already has a `CLAUDE.md` and `install.sh` skipped creating one. Paste the block below into your existing file (or merge by hand) so Claude Code sessions load the same always-on rules as `claude/CLAUDE.md` in the kit.

---

```markdown
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

## Skills

Repo skills live in `.claude/skills/`. Invoke by typing `/skill-name`, or describe the situation — the skill can trigger itself when it doesn't have `disable-model-invocation: true`.

Planning chain (fresh session each step): `/grill-me` → `/planning-session` → `/slice-planning` → then `/afk-slice` or just say "Continue".
```

---

## After paste

1. Start a new Claude Code session so it re-reads `CLAUDE.md`
2. Confirm `.claude/skills/` and `.claude/rules/` exist (install.sh creates them)
3. Type `/grill-me` in a fresh session to confirm the skill loads

## Related

- [`workflow-user-rules-canonical.md`](./workflow-user-rules-canonical.md) — the Cursor-side equivalent (User Rule, pasted into Cursor's Customize UI instead of a file)
- [`claude-invoke-cheatsheet.md`](./claude-invoke-cheatsheet.md)
- [`../claude/README.md`](../claude/README.md) — full Cursor ↔ Claude Code mapping table
