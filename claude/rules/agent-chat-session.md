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
| **Continue** / **Continue where we left off** / **Resume migration** | Fallback, still honoured: run `mc:status` → print **Chat name** → run `npm run mc:opener -- <program>` (read NEXT_PROMPT / first `AFK_QUEUE` slice) → execute that slice per `afk-slice` skill. If the CEO named no program, use `ACTIVE_PROGRAM` and say which one you picked. |
| **Start W6d** (or any slice id) | Print chat name for that slice → execute §12 block for that slice only. |

This works identically whether "Continue" is typed into a Cursor chat or a Claude Code session — both
read the same STATUS dashboard in the repo. But an agent must never **offer** it — see the next section.

## Never offer "Continue" — print the prompt

`Continue` is a **fallback the CEO may type**, not something an agent may hand back. The STATUS
dashboards span 40+ programs; "Continue" does not say which one, so it hands the CEO a decision the
repo already recorded.

[`planning-chain-handoff.md`](./planning-chain-handoff.md) settled this for planning: derive the next
prompt with `npm run mc:handoff`, never hand-write it, never substitute a magic word. **Execution
follows the same rule**, with `mc:opener` as its script:

```bash
npm run mc:opener -- <program>
```

It prints the exact, pasteable prompt for that program's recommended slice — chat name, master doc,
slice id, autonomy — and it emits **your** tool's rule paths (`.claude/rules/*.md` in a Claude Code
session, `.cursor/rules/*.mdc` in Cursor). `--json` gives the same thing machine-readable for
`create_session`.

So whenever a session queues or finishes execution work:

1. Run `npm run mc:opener -- <program>` and put what it prints in the SESSION REPORT, in a fenced
   block the CEO can copy in one click.
2. Where the `claude-code-remote` MCP tools exist, offer to start that session rather than only
   printing the prompt — same `source_url` rule as planning
   ([`planning-chain-handoff.md`](./planning-chain-handoff.md) §3).
3. Name the program in every next-step line. `Next: npm run mc:opener -- ppe-payg` is an instruction;
   `Next: say Continue` is a guess.

**Still true:** if the CEO does type `Continue` in a fresh session, honour it — read STATUS, print the
chat name, run the recommended slice. Keeping the fallback costs nothing. Offering it in place of the
real prompt is the defect.

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
