> On-demand rule. One copy, read by Claude Code, Cursor and Codex. Index: [`AGENTS.md`](../../AGENTS.md).

# The critic — fresh eyes before the merge

**The agent that built the work never decides whether it is good enough.** A separate agent, with
context that does not contain the building, opens the actual result and rules against the bar.

Adapted from the **gauntlet loop** (Matt Shumer): builders and critics in parallel, the critic on
fresh context, a **blind pick** rather than a score. The adaptation matters — see *The bar* below.

## Why a critic is not a test run

Two different questions, and neither answers the other:

| | Does it run? | Is it right? |
|---|---|---|
| Asks | Do the tests pass? Did anything break? | Did this solve the actual problem? What was missed? |
| Answer | A fact — deterministic | A judgement |
| Produced by | [`preflight.md`](./preflight.md) — `npm run preflight` | This rule |

A critic cannot tell you whether 448 tests pass; only running them can. Preflight cannot tell you
the change solved the wrong problem. **Run both. Preflight first** — never spend a critic on work
that does not even run.

## The bar

The gauntlet loop compares against a **reference product** ("make it as good as Call of Duty").
That works when a reference exists and fails when one does not: the critic invents an arbitrary
standard and burns tokens defending it.

Most slices here have no reference product. **So the bar is the slice's own exit tests plus the
behaviour the CEO asked for** — both already written down before the work started, which is what
makes them a bar rather than a mood.

| Situation | The bar |
|---|---|
| Ordinary slice | The exit tests in §12, and the CEO's own words in the request |
| UI against an existing screen | The screen it must match — a real reference, use the blind pick |
| A rewrite replacing something | The behaviour of the thing being replaced |
| Genuinely novel, no reference | **Say so and skip the comparison.** Judge against the exit tests only. Never invent a bar |

## What the critic is given, and what it is not

**Given:** the diff, the slice's exit tests, the original request, and the preflight result.

**Not given:** how long it took, what was tried and abandoned, the builder's reasoning, or any
"I did X because Y" narrative. Effort is not evidence, and a critic that knows the effort starts
defending it.

## The verdict is a pick, not a score

> **MEETS THE BAR** or **DOES NOT MEET THE BAR**, then the single biggest gap in one sentence.

Never a score out of ten. Scores drift upward every round — 7, then 7.5, then "8, good enough" —
and nothing ever fails. A pick cannot drift.

`DOES NOT MEET` returns the work to the builder with that one gap. Fix it, re-run preflight, put a
**fresh** critic on it. Never argue with a critic; never re-brief the same one.

## Stop after two rounds — of *drift*, not of *findings*

**Two rounds, then stop and write `Status: blocked`** with both verdicts. A third round is usually
the loop optimising the critic's opinion rather than the work, and that is how a gauntlet becomes a
treadmill. Escalating costs one CEO sentence; a treadmill costs a session.

**The counter resets on a verified regression.** These are not the same thing:

| The critic returned | Counts toward the two |
|---|---|
| A **distinct, reproducible** gap you confirmed by looking — a check that runs nowhere, a broken path | **No.** Fix it and keep going; the loop is working exactly as intended. |
| A re-phrasing of the previous gap, a matter of taste, or a claim you checked and could not reproduce | **Yes.** Two of these and you stop. |

Written after the first real use, 2026-08-26. This rule's own change drew **two** DOES NOT MEET
verdicts — nine test suites that would have run nowhere, then the browser suites left with no
automatic venue at all. Both were true, both were confirmed by looking, and both were different.
A flat two-round cap would have escalated a mechanical one-line fix to the CEO while the second
real bug sat unfound.

**Confirm before you count.** A critic's finding is a claim, not a verdict on reality — check it
yourself. If you cannot reproduce it, that round counts toward the two and you say so.

## How to spawn it

The rule is the same everywhere — a subagent whose context does not contain the building.

| Tool | How |
|---|---|
| **Claude Code** | The `Task`/subagent tool — a fresh subagent starts with no conversation history. The `/code-review` skill is a good second lens. |
| **Codex** | Subagents (GA March 2026) — a manager with parallel workers, each with its own context. Codex's own review reads [`AGENTS.md`](../../AGENTS.md), which is why the rulebook lives there. |
| **Cursor** | A new agent/chat on the same branch. Not the chat that built it. |

**Never "review your own diff" in the building session.** It is the same context, and the same
context produces the same blind spot — which is the entire failure this rule exists to prevent.

## Two lenses beat one round

Where the work is worth it, spawn the critic **twice in parallel** with different lenses rather
than sequentially with the same one — *"does it meet the exit tests"* and *"what breaks in
production"*. Redundancy finds the same thing twice; diversity finds two things.

## When to skip it

- A `chore(status):` or docs-only change with no behaviour in it
- A scripted migration batch already proved by its own soak
- A one-line revert of a change that shipped today

Skipping is a decision, not an omission: **say in the SESSION REPORT that it was skipped and why.**

## Related

[`preflight.md`](./preflight.md) · [`merging.md`](./merging.md) · [`reporting.md`](./reporting.md)
