> Archive. **Not read per session.** Every rule in this folder that exists because something went wrong
> links here for the reason. Read a section when you are tempted to undo the rule that points at it.

# Why the rules are the way they are

A rule without its incident is arbitrary, and an arbitrary rule gets deleted by the next person who
finds it inconvenient. This file keeps the incidents so the rules can stay short.

---

## The CI bill is paid per push, not per hour

**2026-08-14.** Every push fires six workflows — `proof-live` (~4 min), `proof-baseline` (~3.6 min),
`tsc-ratchet`, two edge guards, the Ralph chain test. A merge fires most of them again on `main`. A
slice costs roughly **35–40 runner-minutes**; a slice pushed three times costs closer to seventy.

Measured the day the account's Actions budget ran out mid-programme: **30 `proof-live` runs in one day,
18 of them on branches** — more pushes than slices. The repo went dark for ten hours, every check
failing in two seconds with no runner assigned, on `main` as well as on branches.

**Rule that came from it:** commit freely, push once. Batch the doc update, the status update and the
fix into the push that opens the PR.

### The one saving that is not a trim

**2026-08-16.** `proof baseline` and `proof live` had no `paths:` filter, so both installed Chromium and
built the app to prove that a table in a master doc still parses — roughly two thirds of the two
heaviest workflows' runs. They now short-circuit on a **`docs/`-only diff**: the check still runs and
still reports under the same name, it just skips the build.

**This removes nothing.** No code reaches `main` without the suite having run on it. What changed is
that a markdown edit stopped being asked to prove a browser.

**`paths-ignore:` at the top of the file is the wrong way to do it** — tried and rejected the same day.
`proof baseline` is a required check, and *a required check must always report*: a filtered-out workflow
never reports at all, so every `chore(status)` PR would sit permanently unmergeable and the chain would
stop dead. Short-circuit inside the job; never filter the job away.

Corollary, and it is load-bearing: **never smuggle a code change into a `chore(status):` commit.** It
would skip the suite.

---

## Serial is rarely what makes a programme slow

**2026-08-15/16, FCN.** Slices running unattended finished in **~90 minutes each**. The one slice that
took **10.5 hours** was a single `CEO_GATE: explicit_ok_in_chat`, waiting for a human who was asleep.

Before reaching for parallel lanes — which double CI load, and which the claim exists to prevent —
**look at the gates**. Every SESSION REPORT names the next CEO gate and how many slices away it is, so
the CEO can pre-approve or the chain can be paced to land it in waking hours. That is worth more hours
than parallelism and costs no risk.

Do not "save minutes" by trimming the gates. The `push: main` runs are not duplicates: a squash merge
produces a tree no PR run ever tested, which is exactly when a silent breakage lands.

---

## One slice, one agent

**2026-08-11.** Mutual exclusion between *engines* was never the whole problem. **Two merges** were: a
slice PR and a one-line `chore(status):` follow-up merged ninety seconds apart, both planned the same
next slice, and both launched. Two sessions built LAF-8 in parallel and one was discarded.

Two guards now stand between a merge and a launch:

1. **`isMaintenancePr` recognises housekeeping prefixes** — `docs:`, `chore:`, `ci:`, `build:`, `style:`
   — and bodies saying *"no code changes"* / *"status-only"* / *"follow-up to #N"*. A PR that really
   shipped a slice carries a SESSION REPORT and is exempted before this rule is reached.
2. **The chain claims the slice before launching it.** The planner had always refused a slice already
   named in `RALPH_RUNNING`; until then nothing wrote the field, so the gate could never fire.

The claim **fails closed**. A stalled chain is visible in `mc:status`; a duplicated one is not, and
costs a session.

---

## Two sessions planned the same programme

**2026-08-22, LSUX.** Two sessions planned the same programme in parallel from the same PRD. One ran it
to completion (LSUX-1…6). The other finished forty-three minutes later, found `main` unrecognisable, and
was closed as a duplicate. A whole session spent on work that already existed.

The slice claim **could not have caught it**, for two reasons worth keeping written down:

1. **It claims slices, and planning has no slice id.** The first claim ever written for LSUX was
   `LSUX-1`, written *after* the planning PR merged. While planning runs there is nothing to name.
2. **It is a launch-time lock, not a session-time one.** Only the merge workflow called it. Both
   sessions that day were started by hand, so neither touched the field.

At the moment the losing session read the dashboard, `RALPH_RUNNING: none` and `SLICING: pending` were
both **true**. The lock did not fail. The state it locks did not exist.

**Rule that came from it:** [`planning-chain.md` §1](./planning-chain.md#1-claim-the-programme-before-you-read-anything).

---

## The merge that silently did not happen

**2026-08-16.** A finished, green AFK slice (FCN-5, PR #1734) simply did not merge. Nothing recorded
that. The dashboard said `BLOCKED_BY: none`, the queue looked empty, and the chain appeared idle when it
was stalled behind work that was already done — its claim never released. Over an hour lost.

**Rule that came from it:** check `mc:merge-capability` first; on `mcp-handoff` the agent finishes the
merge rather than stopping; and if it still cannot, `mc:merge-blocked` writes it where a human sees it.
A stall a human can see is recoverable; a silent one is not.

---

## The hour spent waiting for a green PR

**2026-08-23.** A pull request reports **zero** checks for the first seconds of its life, and zero checks
is a refusal by design. Sessions bridged that gap with their own `until` loops. One such loop was written
with a condition that could never come true, nothing said so, and the session idled **one hour** on a PR
whose four checks had all gone green in **49 seconds**.

The gate was right the whole time. The waiting was improvised, and improvised waiting is where the hour
went.

**Rule that came from it:** `--wait 15` on `mc:auto-merge`. Never hand-roll a CI wait.

---

## The PR the alarm could not see

**2026-08-23.** The slice rules answer one question — *is a **slice** stuck?* — and decline two whole
classes on the way: `no slice id` (which includes every `WORKFLOW-P*` PR, dropped on purpose so meta
work never chains) and `maintenance / doc-only PR`.

Both refusals are correct **about chaining**, and both were being used as the **merge** test. So *"must
not start an agent"* silently became *"must not be merged, and must not be mentioned either"*, and the
alarm reported `OK: no finished slice is sitting unmerged` — true, and useless. **PR #1902 sat green for
eighteen hours** that way.

**Rule that came from it:** the standalone-PR path in [`merging.md`](./merging.md#the-backstop-covers-two-kinds-of-pr).

---

## The line count that was never a gate

Three programmes wrote *"the repo is smaller — net line count is negative"* into their PRD as a
program-level exit test. **All three failed it, and all three were right to.**

| Programme | Result | What the number actually meant |
|---|---|---|
| **LFG-UX-PARITY-15** | FAIL +1,247 | Production code was **+109**. Tests and the browser proof were **+903**, the soak script **+235**. The deletions were real (−216) and were outweighed by *the checks the programme wrote to prove itself*. |
| **PAS** | FAIL +181 | +82 code-only. Closed as superseded before the number could mean anything. |
| **PEX** | FAIL +2,012 | The programme added a real new ability — exporting a page with **no browser open**, so orders run unattended. New ability is new code. |

PEX's closing slice was then sent hunting for deletions to flip the sign, and the three candidates its
own plan named were **all wrong** (2026-08-24): a helper "claimed unreachable" that had a caller; a
base64 twin "serving one worker" that had **six** production callers; and a module "that would survive"
which was already gone, with two green guard tests proving it.

An exit test that has never once passed is not holding a line. It teaches every programme to go hunting
for a deletion after the work is done — which is exactly when a deletion is least safe. And it points the
wrong way: *a programme asked to count its own tests against the same budget as its component is a
programme under quiet pressure to write fewer tests* — which is how the programme before it came to ship
a soak that could not fail.

**Rule that came from it:** [`planning-chain.md` — net lines is a measurement](./planning-chain.md#net-lines-is-a-measurement).

---

## A quarter of the CEO's sessions were status checks

Every green slice used to end with a wall of text and a prompt for the CEO to carry. Measured: **a
quarter of the CEO's sessions were status checks** — interruptions whose only content was that nothing
needed them.

**Rule that came from it:** [`reporting.md`](./reporting.md) — success is silent, the report lives in the
PR body, the digest is once a day, and only *stuck / money / fire* reaches the phone.

---

## A new session with no repository

**2026-08-18, LNP-1.** A session created without `source_url` inherits the parent's *environment* but not
its repository: it starts with an empty working directory, and a prompt opening with `npm run mc:status`
has no `package.json` to run, no master doc to read, and no rules to load. It does not error at launch —
it wastes the first minutes of a session working out that it has nothing to work on. The slice ran only
because the agent recognised the empty directory and attached the repo itself.

**Rule that came from it:** `source_url` is mandatory on every `create_session`, enforced by
`scripts/create-session-source-url-guard.mjs`.

---

## The rulebook that argued with itself

**2026-08-26.** Every workflow file existed three times — in the kit, in `.claude/rules/`, and in
`.cursor/rules/` — all hash-locked to each other. A session whose authorised repository set did not
include the kit could not fix the source, so five separate rules were written whose main job was to say
*"the other always-on rule is wrong, and this one wins."*

Measured that day: **13 always-on rules, ~10,300 words**, read before every session in every repo, of
which five existed only to overrule another. Separately, **66% of the last 30 days' merged commits were
`chore(status)` bookkeeping**, some of them merged four times over.

**Rule that came from it:** one rulebook (`AGENTS.md`), one copy of every rule body (`docs/rules/`), read
by all three agents. A disagreement is now resolved by deleting the loser, because the source is always
reachable.

---

## The checks were fine; running them twice was not

**2026-08-26.** Six workflows fired on every push — `proof-live`, `proof-baseline`,
`tsc-error-ratchet`, two edge guards, the chain test — about **35–40 runner-minutes a slice**,
re-running tests the agent session had already run on the same commit minutes earlier. Separately,
`stale-green-pr-watch` ran **hourly**: 720 runs a month, each billed at GitHub's one-minute minimum,
to ask whether anything was stuck.

Actions minutes are metered on **private** repositories and unlimited on public ones. The account
ran out. Every check began failing in **two seconds with no runner assigned** — and the proof it was
not the code was that `cursor-workflow-kit`, the one **public** repo, passed the same checks on the
same commit at the same minute.

**A job earns a place on GitHub only if it must run when no agent session exists.** By that test:

- The chain launcher stays — it starts the next session on merge, and nothing is alive then.
- `main-guard` stays — a squash merge produces a tree **no PR run ever tested**.
- The nightly live health check, the daily digest and the FM soak stay — nobody is here.
- The hourly watcher went to **daily**: it is a backstop, not the merge path, and a day is soon
  enough for a backstop.
- The fourteen per-PR checks moved into `npm run preflight`.

**What that spends, stated plainly:** CI's real gift was never the tests — it was that it did not
take the agent's word for it. Two things buy that back: preflight **prints what it skipped**, so a
skip can never read as a pass, and `main-guard` still runs on a clean machine after the squash.

## Nobody was ever checking whether the work was any good

**2026-08-26.** The same review found a gap that no amount of CI would have closed: **the agent
built the work, reviewed the work, and reported on the work.** Tests answer *"does it run?"* — a
fact. Nothing was answering *"is it right?"* — a judgement.

The two are not substitutes. On this very slice, a renamed directory broke `isKitRoot()`: a check
that silently looked in the wrong place and called all fifty kit-owned files missing. The unit test
agreed with the bug, because it built a fixture matching whatever the heuristic expected. What
caught it was a machine **running** the check. A critic reading the diff might have caught it by
reasoning — neither would have caught it alone, and neither replaces the other.

**Rule that came from it:** [`critic.md`](./critic.md) — a subagent with no memory of the building
rules **MEETS** or **DOES NOT MEET** the bar, before the merge. Adapted from the gauntlet loop
(Matt Shumer), with one deliberate change: that pattern compares against a **reference product**,
which works for *"as good as Call of Duty"* and fails for *"did the payroll save"* — with no
reference, a critic invents an arbitrary standard and burns tokens defending it. **Here the bar is
the slice's own exit tests and the CEO's own words**, both written before the work started, which
is what makes them a bar rather than a mood.

A pick, never a score: scores drift upward every round — 7, then 7.5, then "8, good enough" — and
nothing ever fails. Two rounds, then stop: a third round optimises the critic's opinion rather than
the work.
