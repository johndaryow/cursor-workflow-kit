> On-demand rule. One copy, read by Claude Code, Cursor and Codex. Index: [`AGENTS.md`](../../AGENTS.md).

# The planning chain — grill → PRD → slices → execution

Four sessions. **Nobody carries a prompt between them** — not the CEO, not the agent. Each planning
session merges its own work, and the merge starts the next session.

| A merge of | Starts | Reading |
|---|---|---|
| the grill record | the **PRD** session | `/planning-session` |
| the PRD | the **slice planning** session | `/slice-planning` |
| the slice plan | the **first queued slice** | `/afk-slice` |

The launcher is `scripts/afkf-plan-chain.mjs`, wired into `ralph-continue-on-merge.yml`. It runs only
where the slice chain declined, so **one merge can never start two agents.**

## 1. Claim the programme before you read anything

Before the PRD, before the master doc, before anything:

```bash
npm run mc:claim-planning -- --program <program>
```

| It prints | You do |
|---|---|
| `CLAIMED` | **Push that commit before you start writing.** A claim nobody can see is not a claim. |
| `REFUSE` | **Stop.** Another session is planning this. Say so and end the turn. |
| `SKIP` | No planning step pending. Check you were sent to the right programme. |

All three planning steps, whether fired by the chain or started by a person typing `/grill-me`.

The claim is written as `planning:<PROGRAM>@<iso>` into `RALPH_RUNNING`. `sliceIdFrom` only adopts a
token ending `-<digits>`, so it is invisible to every slice reader: it can never block slice chaining,
be read as a held slice, or be cleared by the post-merge reconcile. **It expires by state, not by
clock** — when the planning document merges and the dashboard line flips to ✅, the claim is inert, so
the ordinary path needs no release. It **fails closed** while the step is pending; release by hand only
when you are certain nobody is on it:

```bash
npm run mc:claim-planning -- --program <program> --release
```

Two sessions once planned the same programme in parallel and a whole session was discarded
([history](./history.md#two-sessions-planned-the-same-programme)).

## 2. A planning PR merges itself when green

A **planning PR** ships only the artefacts of grill, PRD or slice planning:

- `docs/projects/*-prd.md`, `*-master.md`, `*-grill-*.md`, a PRD brief under `docs/**/plans/`
- the program registry row in `platform-migration-master.md` §9.2
- `scripts/ralph-master-registry.mjs` — the slice-id registration slice planning must do

All must hold, or it is not a planning PR:

1. The diff touches **nothing else** — no `src/`, no `supabase/`, no `functions/`, no `packages/`
2. Every check reported and none objected — proven by `npm run mc:merge-verdict`, **never by eye**
3. The SESSION REPORT is in the PR body
4. The STATUS DASHBOARD is updated in the same PR

Then merge it. Do not ask. There is no review coming — the CEO was in the room for the grill.

This carve-out buys convenience with **scope**, not with the gate. One line outside that list and the
PR is back under [`merging.md`](./merging.md).

## 3. Then stop

**Do not tell the CEO what to run next, and do not create the next session yourself.** The merge does
it. Two launchers for one step is a duplicate this chain has already paid a session for.

The next prompt still goes **in the PR body**, where a machine reads it and a person is not interrupted.

**`mc:handoff` and `mc:opener` are the manual cold start** — for when a launch is missed, or a person
wants to run a step themselves:

```bash
npm run mc:handoff -- <program>     # planning steps
npm run mc:opener  -- <program>     # execution slices
```

`mc:handoff` refuses to hand off across an unmerged document, and that refusal is the whole point of
the script; never work around it by writing the prompt by hand. A person may type these. **An agent must
never hand one back in place of the merge**, and must never offer `Continue` — the dashboards span 40+
programmes, so `Continue` hands back a decision the repo already recorded.

### If you do create a session — `source_url` is not optional

The launcher creates sessions, and so does a person doing a manual cold start. Whoever writes that
call passes the repository:

```js
mcp__Claude_Code_Remote__create_session({
  title: "<PROGRAM> — <next step>",
  prompt: "<the prompt from mc:handoff --json>",
  tags: ["planning-chain", "<program>"],
  source_url: "https://github.com/johndaryow/pp-workspace",
})
```

**Leaving it off is a silent failure.** A new session inherits the parent's *environment* but not its
repository: it opens with an empty working directory, and a prompt beginning `npm run mc:status` has no
`package.json` to run, no master doc to read and no rules to load. It does not error at launch — it
wastes the first minutes of a session working out that it has nothing to work on
([history](./history.md#a-new-session-with-no-repository)).

Add `source_revision` only to pin a non-default branch; the chain always wants the default branch.
`scripts/create-session-source-url-guard.mjs` fails the build on any call in this repo that omits it.

## 4. No gate before the first slice — a list instead

Slice planning merging does **not** wait for approval. The first slice's session prints, before any
work, a plain-English list of what is about to be built — one line per queued slice, lifted from the
master doc's tracer-bullet table. It is not a question and nothing waits for an answer; it is the window
in which **"pause the chain"** costs one sentence.

A list the CEO can read beats an approval they will not give.

## Net lines is a measurement

**Measure the number every slice. Make it pass/fail almost never.**

1. **Always report it** — the net **production** line delta, in the SESSION REPORT and in `NET_LINES`.
   Reporting is the requirement; a direction is not.
2. **Do not write a signed line-count target into a PRD by default.** `net lines ≤ 0`, *"the repo is
   smaller"*, *"deletes more than it adds"* — none belong in program-level exit tests unless rule 3 holds.
3. It becomes an exit test **only when removing duplication is the programme's stated purpose** — a
   merge, a dedupe, a retirement, a second engine deleted — **and** the CEO agrees at grill time.
4. When it is an exit test, **count production code only.** Tests, proof harnesses, fixtures, generated
   bundles, scripts and documents count on neither side.
5. **The question that matters is "is anything unreachable?"** — answered by looking, not by the sign of
   a number. A rise **passes** when the dead-code check is clean. Name what was checked and how.
6. **Never delete a test, a guard, a proof or a fixture to make the number fall.** If the only way to go
   negative is to remove something that says no, the target loses.

Write this instead:

```markdown
- **E10 — Nothing dead is left behind.** Every export the programme added has a caller, every helper it
  replaced is gone or still reached, and the guard tests naming the deleted engine are green. The net
  production line delta is reported as a number — in whichever direction it lands.
```

Three programmes failed a signed target and all three were right to
([history](./history.md#the-line-count-that-was-never-a-gate)).

## What still stops for the CEO

- **A grill is a conversation.** HITL by definition; nothing launches one but a person saying "confirmed".
- **`CEO_GATE: explicit_ok_in_chat`** on any slice. Planning never pre-approves execution.
- **Open questions.** Ask, and hand off anyway — the next step usually does not depend on the answer.
  Say plainly if it does.
- **Nothing merges red.** Zero checks is a failure, never a pass.

## Related

[`merging.md`](./merging.md) · [`reporting.md`](./reporting.md) · [`slice-tags.md`](./slice-tags.md)
