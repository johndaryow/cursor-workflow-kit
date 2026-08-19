---
name: mc-status
description: Prints Mission Control STATUS DASHBOARD, CHAT_RENAME, and workers migration summary. Use when CEO asks where we are, what to run next, or before opening a fresh execution session.
---

# MC status

## Quick command

```bash
npm run mc:status
npm run mc:status -- platform
npm run mc:status -- workflow
```

## Agent behavior (required)

### CEO asks: "Where are we in workers migration?" (or similar)

1. Run `npm run mc:status -- platform`
2. **First line:** `**Chat name:** <CHAT_RENAME from output>`
3. Summarize in plain English (from `Workers migration (CEO summary)` section):
   - Lane B status
   - GCP functions remaining
   - Recommended next slice
   - Whether blocked
4. **Do not** start execution unless CEO asks to continue

### CEO asks: "Continue" / "Continue where we left off"

Honour it — it is a fallback the CEO may type. But resolve the ambiguity yourself; do not ask them
which program.

1. Run `npm run mc:status -- <program>` then `npm run mc:opener -- <program>`. If the CEO named no
   program, use `ACTIVE_PROGRAM` from the dashboard and say in one line which one you picked.
2. **First line:** Chat name from `CHAT_RENAME:`
3. Execute `RECOMMENDED_SLICE` per `afk-slice` skill

**Never offer "Continue" back to the CEO.** When a status answer ends with a next step, that step is
the prompt `mc:opener` printed, in a fenced block, naming its program —
[`agent-chat-session.md`](../../rules/agent-chat-session.md).

## Manual

1. Identify program: default `platform` → `docs/projects/platform-migration-master.md`
2. Read `CHAT_RENAME:` and `RECOMMENDED_SLICE:` from script output
3. Report to CEO in plain English — no code, no file dumps

## CEO one-liner to start execution

```bash
npm run mc:opener -- <program>
```

Always pass the program. Bare `mc:opener` defaults to `platform`, which is right only when platform is
what the CEO meant. The output is a complete, pasteable prompt — hand that over, not a magic word.

Paste the output into a **new session** — Cursor Cloud Agent or Claude Code, either works — includes chat rename + slice id.

See also: [`agent-chat-session.md`](../../rules/agent-chat-session.md)
