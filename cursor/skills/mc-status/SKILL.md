---
name: mc-status
description: Prints Mission Control STATUS DASHBOARD, CHAT_RENAME, and workers migration summary. Use when CEO asks where we are, what to run next, or before opening a fresh execution agent.
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

1. Run `npm run mc:status -- platform` then `npm run mc:opener -- platform`
2. **First line:** Chat name from `CHAT_RENAME:`
3. Execute `RECOMMENDED_SLICE` per `afk-slice` skill

## Manual

1. Identify program: default `platform` → `docs/projects/platform-migration-master.md`
2. Read `CHAT_RENAME:` and `RECOMMENDED_SLICE:` from script output
3. Report to CEO in plain English — no code, no file dumps

## CEO one-liner to start execution

```bash
npm run mc:opener
```

Paste into a **new Cloud Agent** — includes chat rename + slice id.

See also: [`agent-chat-session.mdc`](../../rules/agent-chat-session.mdc)
