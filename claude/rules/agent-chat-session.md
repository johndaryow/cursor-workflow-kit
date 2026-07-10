# Agent chat session (naming + status + continue)

> Always-on rule — import from root `CLAUDE.md`. Adapted from [`cursor/rules/agent-chat-session.mdc`](../../cursor/rules/agent-chat-session.mdc) — the naming *pattern* is identical, only the "how the UI renames" note differs by tool.

CEO stays organized by **one session name per slice**. Agents own the naming logic — CEO does not hunt §12 for rename strings.

## Session rename (every execution turn)

**First line of the agent's first reply** in an execution session (after `mc:status` preflight):

```text
**Chat name:** PLATFORM W6d · flip flags retire 7
```

Get the exact string from:

1. `npm run mc:status -- platform` → `CHAT_RENAME:` line, **or**
2. §12 prompt `Rename this chat to:` for the active slice, **or**
3. [workers-exit-plan.md](../../docs/projects/workers-exit-plan.md) execution menu **Chat name** column

Neither Cursor nor Claude Code auto-renames the session title from chat text — still print the line every time so the CEO can rename in one click (Claude Code: click the session title in the sidebar/web UI; Cursor: same idea in the chat tab), and so titles stay consistent across both tools.

**Pattern:** `{PROGRAM} {slice id} · {short plain-English goal}` — e.g. `PLATFORM W6d · flip flags retire 7`, `PLATFORM S6b · hybrid batch 13`.

## CEO phrase → agent behavior

| CEO says | Agent does |
|----------|------------|
| **Where are we in workers migration?** / **Migration status?** | Run `npm run mc:status -- platform`. Reply plain English: Lane B status, GCP count, recommended slice, chat rename. **Do not** start new work unless asked. |
| **Continue** / **Continue where we left off** / **Resume migration** | Run `mc:status` → print **Chat name** → run `npm run mc:opener -- platform` logic (read NEXT_PROMPT / first `AFK_QUEUE` slice) → execute that slice per `afk-slice` skill. |
| **Start W6d** (or any slice id) | Print chat name for that slice → execute §12 block for that slice only. |

This works identically whether "Continue" is typed into a Cursor chat or a Claude Code session — both read the same STATUS dashboard in the repo.

## Execution preflight (add to first 60 seconds)

After [`workflow-core.md`](./workflow-core.md) step 1 (`mc:status`):

1. Print **Chat name** line (from `CHAT_RENAME:`)
2. If `BLOCKED_BY` ≠ `none` → stop and report
3. If `ACTIVE_SLICE` is `none`, use first item in `AFK_QUEUE` as the slice to run when CEO said continue

## Skills

- Status-only questions → [`mc-status` skill](../skills/mc-status/SKILL.md)
- Slice execution → [`afk-slice` skill](../skills/afk-slice/SKILL.md)

## MUST NOT

- Ask CEO to paste §12 prompts or rename chats manually without giving the exact string
- Use generic chat titles like "migration" when a slice id exists in STATUS
