---
name: agent-discipline
description: Token/cost discipline + model/session picks for cost-conscious CEO. Use every session — before large reads, slice start, or expensive ops.
---

# Agent discipline

**When:** Every session — slice start, planning reads, infra work, model choice.

## Efficiency defaults

1. **Search before read** — grep/glob first; read only files the task needs
2. **No re-reads** — don't re-open unchanged files
3. **Smallest scope** — one slice, one function, one deploy target
4. **Scripts over vibes** — targeted verify commands, not full-suite reruns unless slice requires

## Model defaults (Claude Code)

| Task | Model | Session |
|------|-------|---------|
| AFK slice / migration batch / verify | Sonnet 5 | New per slice |
| Stuck on speed, green path obvious | Sonnet 5 (fast/low effort) | Same or new |
| New program / architecture / grill | Opus 4.8 | New |
| Logic-heavy refactor planning | Opus 4.8 | New |
| Clear follow-on after plan locked | Sonnet 5 | New |

Cursor-side equivalent for reference: Composer 2.5 ≈ Sonnet 5's AFK-slice role; Cursor's Opus (Plan mode) ≈ Claude Code's Opus 4.8. Pick whichever tool you're actually sitting in — the model tiering logic is the same, just different model names.

**Rules:** Default cheap · No max-effort/extended-thinking unless CEO asks · **New session per slice** · switch model in new session, not mid-thread · `handoff` only if blocked mid-slice.

Tell CEO in one line: `Recommended: <model> · <new/this session>`

## Before expensive ops

Read [`cost-estimate-before-action.md`](../../rules/cost-estimate-before-action.md). Plain-English estimate + CEO OK for bulk DB, always-on Functions, large AI batches.

## Anti-patterns

- Full-repo scans when path is known
- Re-explaining architecture already in STATUS block
- `npm test` entire suite for a one-line doc change
