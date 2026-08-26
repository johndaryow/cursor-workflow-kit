---
name: critic
description: Fresh-eyes verdict on finished work before it merges — a subagent with no memory of building it rules MEETS or DOES NOT MEET the bar. Use after preflight is green and before opening or merging a PR, on any slice that changed behaviour.
---

# Critic (fresh eyes)

**You do not judge your own work.** Spawn a separate agent whose context does not contain the
building, hand it the result and the bar, take its verdict.

Canon: [`critic.md`](../../../docs/rules/critic.md). Adapted from the gauntlet loop — builder and
critic in parallel, critic on fresh context, a blind pick rather than a score.

## Before you run it

1. `npm run preflight` must be **green**. Never spend a critic on work that does not run.
2. Know the bar. Ordinary slice → the §12 exit tests + the CEO's own words. UI matching an
   existing screen → that screen. Genuinely novel → say so and judge against exit tests only.
   **Never invent a bar.**

## Skip it when

A `chore(status):`/docs-only change · a scripted migration already proved by its own soak · a
one-line revert of today's change. Then say in the SESSION REPORT that it was skipped, and why.

## 1. Build the brief

Include **only** these. Nothing about how it was built.

```text
You are reviewing a change you did not write. You have no history with it.

THE REQUEST (the CEO's own words):
<paste verbatim>

THE BAR — this passes only if all of these hold:
<the slice's exit tests, verbatim from §12>

THE CHANGE:
<the full diff — `git diff origin/main...HEAD`>

PREFLIGHT: <n> passed, <n> failed, <n> skipped (name what was skipped)

Answer in this shape and nothing else:

VERDICT: MEETS THE BAR | DOES NOT MEET THE BAR
BIGGEST GAP: <one sentence — the single most important thing wrong or missing>
EVIDENCE: <the file and line, or the exit test, that shows it>

Rules for you:
- A pick, never a score. "Mostly fine" is MEETS. "One real problem" is DOES NOT MEET.
- Judge the result, not the effort. You do not know how long it took and it does not matter.
- If an exit test is not actually proved by this diff, that alone is DOES NOT MEET.
- If you cannot find a real problem, say MEETS. Do not manufacture one to look thorough.
```

**Never include:** what was tried and abandoned, why a choice was made, how long it took, or any
sentence beginning "I". Effort is not evidence, and a critic that sees effort defends it.

## 2. Spawn it — fresh context, every time

| Tool | How |
|------|-----|
| **Claude Code** | The Task/subagent tool. A fresh subagent starts with no conversation history — that is the whole mechanism. `general-purpose` is the right type. |
| **Codex** | Subagents — a manager with parallel workers, each with its own context. |
| **Cursor** | A new agent/chat on the same branch. Not the chat that built it. |

**Two lenses in parallel beats two rounds of one**, where the work is worth it:

- Lens A — *"Is every exit test actually proved by this diff?"*
- Lens B — *"What breaks in production that the tests do not cover?"*

Redundancy finds the same thing twice. Diversity finds two things.

**Never review your own diff inside the building session.** Same context, same blind spot — which
is the exact failure this exists to prevent.

## 3. Act on the verdict

| Verdict | Do |
|---|---|
| **MEETS** (all lenses) | Record it in the SESSION REPORT, proceed to merge |
| **DOES NOT MEET** | Fix the one named gap. Re-run `npm run preflight`. Spawn a **new** critic. |

Never argue with a critic. Never re-brief the same one. Never ask for a second opinion because you
disliked the first.

## 4. Two rounds, then stop

Two rounds and no MEETS → **stop.** Write `Status: blocked`, put both verdicts in the PR body, hand
it to the CEO in one sentence. A third round optimises the critic's opinion rather than the work,
which is how a gauntlet becomes a treadmill.

## 5. Record it

In the SESSION REPORT, always — including when it was skipped:

```text
Critic:
- Lens A (exit tests): MEETS — round 1
- Lens B (production risk): DOES NOT MEET round 1 → <gap> → fixed → MEETS round 2
```

A critic step nobody can see in the report did not happen.

## Anti-patterns

- Reviewing your own diff in the same session ("I've re-read it carefully")
- A score out of ten — it drifts up every round and nothing ever fails
- Pasting your reasoning into the brief so the critic understands "why"
- Looping until it agrees
- Marking MEETS when an exit test was never actually run
