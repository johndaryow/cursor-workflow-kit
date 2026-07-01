---
name: agent-discipline
description: Token/cost discipline + model/chat picks for cost-conscious CEO. Use every session — before large reads, slice start, or expensive ops.
---

# Agent discipline

**When:** Every session — slice start, planning reads, infra work, model choice.

## Efficiency defaults

1. **Search before read** — grep/glob first; read only files the task needs
2. **No re-reads** — don’t re-open unchanged files
3. **Smallest scope** — one slice, one function, one deploy target
4. **Scripts over vibes** — targeted verify commands, not full-suite reruns unless slice requires

## Model defaults (this repo)

| Task | Model | Mode | Chat |
|------|-------|------|------|
| AFK slice / migration batch / verify | Composer 2.5 | Agent | New per slice |
| Stuck on speed, green path obvious | Composer 2.5 Fast | Agent | Same or new |
| New program / architecture / grill | Opus (latest) | Plan | New |
| Logic-heavy refactor planning | Opus | Plan | New |
| Clear follow-on after plan locked | Composer 2.5 | Agent | New |

**Rules:** Default cheap · No 1M/Max unless CEO asks · **New chat per slice** · switch model in new chat, not mid-thread · `handoff` only if blocked mid-slice.

Tell CEO in one line: `Recommended: <model> · <mode> · <new/this chat>`

## Before expensive ops

Run cost gate per [`cost-estimate-before-action.mdc`](../../rules/cost-estimate-before-action.mdc). Plain-English estimate + CEO OK for bulk DB, always-on Functions, large AI batches.

## Anti-patterns

- Full-repo scans when path is known
- Re-explaining architecture already in STATUS block
- `npm test` entire suite for a one-line doc change
