> On-demand rule. One copy, read by Claude Code, Cursor and Codex. Index: [`AGENTS.md`](../../AGENTS.md).

# Preflight — the checks run here, not on GitHub

```bash
npm run preflight            # every check a pull request used to run. ~40s
npm run preflight -- --full  # adds the browser proof suite (builds the app — minutes)
```

**Green before you push. Always.** A push that skipped preflight is a push nobody checked.

## What moved, and why

Six workflows fired on **every push** — about 35–40 runner-minutes a slice — re-running tests the
agent session had already run on the same commit minutes earlier. Actions minutes are metered on
private repositories. The account ran out, and every check began failing in **two seconds with no
runner assigned**, which reads exactly like a broken build and is not one.

The checks were never the waste. **Running them twice was.**

So all fourteen moved into `npm run preflight`, and GitHub keeps only what cannot run here.

## What GitHub still does — and the one rule that decides it

**A job stays on GitHub if it must run somewhere an agent session is not.** Three ways that happens,
and the first is the one that is easy to miss:

1. **Nobody is here** — it fires on a merge, a schedule, or after a squash.
2. **It needs a credential only CI holds** — the billing API, for instance.
3. **The agent may be refused.** A Claude Code session's safety classifier can refuse an entire
   area of commands (KNOWN_TRAP_7 — the stop-list suite). A check that can be silently refused
   must never have only one venue: it runs in **both**, so a refusal shows up as a red preflight
   rather than as a check that quietly stopped happening.

The first draft of this rule said only "when no agent session exists", and a fresh critic caught
what that missed: **nine suites in `ralph-chain-test.yml` were dropped from the trigger and never
added to preflight** — including the stop-list suite, whose own comment says CI is the only place it
can run. They ran nowhere for the length of one review. That is the failure mode this whole rule
exists to prevent, found by the thing added in the same change.

| Kept | Why it cannot move |
|------|--------------------|
| `ralph-continue-on-merge` | Starts the next session when a PR merges. There is no session alive at that moment to start it. |
| `main-guard` | A squash merge produces a tree **no PR run ever tested**. It runs `preflight -- --full`, so it is also the only automatic venue for the slow browser suites. |
| `nightly-health` | Asks the five questions against the live app while the CEO sleeps. |
| `afkf-daily-digest` | Writes the day's digest. Fires a Routine; nobody is here. |
| `fm-daily-guardrail` | Live content soak inside its 30-day window. |
| `stale-green-pr-watch` | Merges what the rules allow and alarms on the rest — **hourly → daily**. |

That hourly schedule was 720 runs a month, each billed at GitHub's one-minute minimum: roughly a
third of the free allowance spent asking whether anything was stuck. Daily catches the same stall
a day later, which is soon enough for a backstop and 96% cheaper. It is a **backstop**, not the
merge path — the session merges its own PR.

## The slow suites run once, on `main`

`preflight` skips the browser suites by default — a session runs it before every push, and building
the app for a browser on every iteration is the cost that made CI wasteful in the first place.

That makes `main-guard` their **only automatic venue**, which is why it runs `preflight -- --full`.
The first version of this rule ran bare `preflight` there, and a fresh critic pointed out the
consequence: the browser proof would have run **nowhere**. Twice now, the thing that caught a check
falling through the gap was a critic reading the change cold.

Run `--full` yourself before pushing anything that touches UI, rendering or export. Otherwise the
default is right: fast locally, thorough once, on the tree that actually ships.

## Known-red suites are ratcheted, not gated

A suite that is already red on `main` cannot be a pass/fail gate — it would block every push
forever, and the only way out would be deleting tests. So a check may carry `baselineFailures`: the
number measured on `origin/main`, on a stated date.

- **Fewer than baseline** → passes, and says so. Lower the number in the same PR.
- **At baseline** → passes, and prints the count so it never goes quiet.
- **More than baseline** → **fails**, and names the delta.
- **No failure count in the output** → fails. A suite that did not finish is never a pass.

Same rule as `test:tsc-ratchet`, which this repo already trusts. **Never raise a baseline to go
green** — that converts a real regression into a new normal, silently.

Today's baselines (measured 2026-08-26 on `origin/main`, not remembered): `pp-shopify-theme` —
repo suite **105**, `test:pb` **85**.

## The documents are checked too

`npm run docs:stale` reads every master doc under `docs/projects/` and reports anything it asserts
that is no longer true. Three classes, and only three:

| Class | What it catches |
|---|---|
| **A** | `npm run <x>` where `<x>` is not in `package.json` |
| **B** | an exit test or slice block naming a GitHub check that no longer runs on a pull request |
| **C** | a `HOLD:` line with no machine-readable `HOLD_UNTIL:` gate |

**Severity depends on whether the programme is open, and that is the whole design.** A doc with
`ACTIVE_SLICE: <ID>` is live, so a stale line in it is a live instruction that is wrong, and it
fails. A closed programme is a **historical record**: a closed doc saying *"we ran
`npm run agent:pp37982-content-soak`"* is true history, not rot, and rewriting it would falsify the
record. Closed findings are printed and never gate. The same applies at finer grain — a slice whose
own heading says ✅ or *(record only)* is history even inside an open programme.

A line can say, in a form a machine reads, that it is a record rather than an instruction:

```
<!-- docs-stale: superseded by WORKFLOW-P36 -->   another TIME: it was true, a named change made it false
<!-- docs-stale: elsewhere in pp-workspace -->    another REPO: the command is real, it is not here
```

**The reference is required** — a bare `superseded` suppresses nothing. That is the difference
between an acknowledgement and a mute button, and every marker is listed on every run so it stays
readable. `grep -rn "docs-stale:" docs/` shows all of them at once.

A finding this repo has looked at and cannot fix yet goes in
`docs/projects/.docs-stale-accepted.json` with a reason and the work it waits on. Repo data, not
kit-owned. Printed every run, exactly like a ratchet baseline, and an entry that matches nothing is
reported rather than failed — fixing something must never turn the build red. **Never add an entry
to go green.**

It does not check file links; `npm run docs:check-paths` already owns those.

**Why it exists.** Three times in two days this repository wrote a rule down correctly and then
broke it, because nothing compared the written rule to reality: `HOLD:` was prose the launcher
could not see and the chain started a slice six days early; `REQUIRED_CHECK_NAMES` outlived the
workflow it named and made the merge gate unsatisfiable — recorded, in the same pull request that
migrated the warning against it into `history.md`; and plan documents named commands that no longer
exist. Written knowledge no code checks is decoration.

## The bargain

CI's real gift was never the tests. It was that **it did not take the agent's word for it.** Moving
the checks here spends that, so two things buy it back:

1. **Preflight prints what it skipped.** A skip must never read as a pass — the browser suite is
   skipped by default and says so, and the SESSION REPORT must repeat it.
2. **`main-guard` still runs on a clean machine** after the squash, so nothing reaches `main`
   unwatched.

What is genuinely lost: a second machine checking a PR *before* it merges. What replaces it is
[`critic.md`](./critic.md) — fresh eyes on the work, which CI never provided at all.

## When preflight is red

Fix it. Never push red, never `--no-verify`, never "it is unrelated" without proving it on
`origin/main` first:

```bash
git worktree add /tmp/base origin/main && cd /tmp/base && npm run preflight
```

Same failure there → it is not yours; say so in the PR and carry on. Only there → it is yours.

## Related

[`critic.md`](./critic.md) · [`merging.md`](./merging.md) · [`history.md`](./history.md)
