# Workflow core (Pocock · Claude Code)

> Always-on rule — imported into `CLAUDE.md`. Claude Code twin of [`.cursor/rules/workflow-core.mdc`](../../.cursor/rules/workflow-core.mdc) — keep them in sync when you edit either. Canon: `docs/projects/workflow-master.md`.

Matt Pocock's pattern adapted for **Claude Code** and a **non-developer CEO**.

## Two modes

| Mode | Who | When |
|------|-----|------|
| **Planning (HITL)** | CEO + grill → PRD → slices | New program, failed slice, architecture — **three fresh sessions** |
| **Execution (AFK)** | Agent alone | Slice in master doc §12 with exit tests + tags |

**AFK means planning is done** — not "no plan." Tags: [`hitl-afk-slices.md`](./hitl-afk-slices.md).

## Doc-as-controller (no MC chat relay)

Master doc (`docs/projects/*-master.md`) is Mission Control — no separate MC chat, regardless of which agent you're driving from.

**First 60 seconds of any session:**

1. `npm run mc:status` or read `## STATUS DASHBOARD`
2. Print **Chat name** from `CHAT_RENAME:` ([`agent-chat-session.md`](./agent-chat-session.md))
3. Confirm `ACTIVE_PROGRAM` / `ACTIVE_SLICE` or first `AFK_QUEUE` item; if `BLOCKED_BY` ≠ `none` → stop
4. Read `NEXT_PROMPT` + linked files only — not whole child docs

**End of PR:** Update STATUS + scorecard in **same PR**; SESSION REPORT in PR body ([`session-report-format.md`](./session-report-format.md) or `session-report` skill). **Never** ask CEO to paste reports.

| Controller | Program |
|------------|---------|
| `platform-migration-master.md` | PLATFORM |
| `workflow-master.md` | WORKFLOW / agent ops |
| Other `*-master.md` | Per program — PLATFORM sequencing wins |

## Smart zone

One slice = one fresh agent session (fresh Claude Code session, same as a fresh Cursor chat). Status block (~50 lines) + slice prompt only.

## Session end state

Every task ends with:

1. Branch pushed (`claude/<name>-<id>` — see note below)
2. PR + SESSION REPORT + plain-English assurance
3. STATUS updated in same PR
4. Auto-merge if AFK + green ([`auto-merge-policy.md`](./auto-merge-policy.md))
4b. **Planning sessions:** merge your own docs-only PR when green, then hand off with
   `npm run mc:handoff -- <program>` — never leave the CEO to compose the next prompt
   ([`planning-chain-handoff.md`](./planning-chain-handoff.md))
4c. **Execution sessions:** same principle, different script — end by printing the next slice's
   exact prompt from `npm run mc:opener -- <program>` in the SESSION REPORT. **Never** end by
   telling the CEO to type "Continue": it does not say which of 40+ programs to continue
   ([`agent-chat-session.md`](./agent-chat-session.md))
5. Post-merge scoped deploy + spot-check when UI/deploy touched
6. Screenshots when UI-visible

**Branch prefix:** Cursor branches use `cursor/<name>-<id>`; Claude Code branches use `claude/<name>-<id>`. Same STATUS dashboard, same slice ids — only the prefix differs.

**Default model:** see [`agent-discipline`](../skills/agent-discipline/SKILL.md) for the Claude model picks (Opus for planning, Sonnet for AFK execution) — the Claude Code equivalent of the Cursor Composer picks.

Do **not** push to `main`. Do **not** deploy prod hosting/functions before merge unless CEO hotfix OK.

### One push per slice — the CI bill is paid per push, not per hour

**Every push fires six workflows** (`proof-live` ~4 min, `proof-baseline` ~3.6 min, `tsc-ratchet`, two
edge guards, the Ralph chain test). A merge fires most of them again on `main`. So a slice costs
roughly **35–40 runner-minutes**, and a slice pushed three times costs closer to seventy.

Measured 2026-08-14, the day the account's Actions budget ran out mid-programme: 30 `proof-live` runs
in one day, 18 of them on branches — i.e. **more pushes than slices**. The repo went dark for ten
hours, every check failing in two seconds with no runner assigned, on `main` as well as on branches.

So: **commit freely, push once.** Batch the doc update, the status update and the fix into the push
that opens the PR. Push again only when a review or a red check demands it.

### What the chain itself costs, and the one saving that is not a trim (2026-08-16)

The chain pushes **three** times per slice, not one: the code, then `chore(status): reconcile after
<slice> merge`, then `chore(status): claim <next> for the chain`. Two of those three change nothing
but markdown under `docs/`.

`proof baseline` and `proof live` had no `paths:` filter, so both were installing Chromium and
building the app to prove that a table in a master doc still parses — roughly two thirds of the two
heaviest workflows' runs. They now short-circuit on a **`docs/`-only diff**: the check still runs and
still reports under the same name, it just skips the build. One line outside `docs/` puts the whole
suite back.

**This is not the trim the paragraph above forbids, and the difference matters.** A trim removes a
gate's ability to say no about code. This removes nothing: no code reaches `main` without the suite
having run on it. What changed is that a markdown edit stopped being asked to prove a browser.

**`paths-ignore:` at the top of the file is the wrong way to do it** — tried and rejected the same
day. `proof baseline` is in `REQUIRED_CHECK_NAMES` in `scripts/mc-auto-merge.mjs`, whose rule 3 is
*"a REQUIRED check is absent entirely — zero checks is a failure, never a pass"*. A filtered-out
workflow never reports at all, so every `chore(status)` PR would sit permanently unmergeable and the
chain would stop dead. **A required check must always report.** Short-circuit inside the job; never
filter the job away.

Corollary, and it is load-bearing: **never smuggle a code change into a `chore(status):` commit.**
It would skip the suite.

### Serial is rarely what makes a programme slow

Measured on FCN, 2026-08-15/16: slices running unattended finished in **~90 minutes each**. The one
slice that took **10.5 hours** was the single `CEO_GATE: explicit_ok_in_chat` gate, waiting for a
human who was asleep.

So before reaching for parallel lanes — which double CI load, and which the `RALPH_RUNNING` claim
exists to prevent after two agents once built one slice twice — **look at the gates**. Every SESSION
REPORT should name the next CEO gate and how many slices away it is, so the CEO can pre-approve or
the chain can be paced to land it in waking hours. That is worth more hours than parallelism, and
costs no risk.

**Do not "save minutes" by trimming the gates.** `proof-baseline.yml` states the reason in its own
header — *"skipping a required check to save runner minutes is the same false green in a cheaper
costume"* — and the `push: main` runs are not duplicates: a squash merge produces a tree no PR run
ever tested, which is exactly when a silent breakage lands. The waste is in the number of pushes, not
in the coverage. Fix the habit, keep the net.

## Paths

| Change | Path |
|--------|------|
| UI / hosting | Preview → merge → prod deploy |
| Backend only | Merge → scoped deploy (`functions:<name>`, firestore, Edge) |
| Mixed | Preview for UI + note post-merge function deploys |

Preview: `tsc -b && npm run build` → `npm run deploy:hosting:preview -- pr-<n>`. Prod UI: https://work.perfectpresents.ph

## CEO role

CEO does **not** read code, diffs, or TypeScript. CEO reads **SESSION REPORT** and status updates only.

CEO acts on: grill answers, `human_only` gates (credentials, DNS, billing), explicit OK for HITL slices.

## Automation first

CEO almost never runs terminal or vendor dashboards — **agent runs CLI, git, deploy, MCP**.

| Priority | Who |
|----------|-----|
| 1 | Agent — shell, git, deploy, logs, MCP |
| 2 | Existing `npm run …` script |
| 3 | CEO one action — OAuth Allow, DNS UI, billing cancel, new secret |
| 4 | **Never** — multi-step terminal instructions for routine work |

CEO manual only: credential UI, DNS cutover, `CEO_GATE: explicit_ok_in_chat`, captcha/2FA. Format: [`manual-task-guidance.md`](./manual-task-guidance.md). **Do not** ask CEO to merge AFK PRs.

## Skills (invoke with `/skill-name`)

| Skill | Use |
|-------|-----|
| `grill-me` | Alignment — new programs only, not AFK batches |
| `planning-session` | **PRD only** after grill (Pocock `/to-prd`) — hard stop before slices |
| `slice-planning` | Tracer bullets + tags + §12 + AFK queue after PRD merges (Pocock `/to-issues`) |
| `afk-slice` | Execute one AFK slice |
| `ralph-loop` | Chain AFK slices (reference — see automation note below) |
| `session-report` | CEO-readable PR closeout (tone: `ceo-communication.md`) |
| — | **Between planning steps:** `npm run mc:handoff -- <program>` prints the next prompt and refuses across an unmerged doc ([`planning-chain-handoff.md`](./planning-chain-handoff.md)) |
| `agent-discipline` | Token/cost + model/session picks every session |
| `tdd` | Logic changes |
| `design-system-first` | UI work |
| `improve-codebase` | Architecture planning |
| `mc-status` | Where are we + chat rename before execution |
| `handoff` | Rare — prefer fresh session per slice |

## Chaining slices (Ralph loop) — read this if you're used to Cursor's auto-chain

Both tools chain from the **same** `ralph-continue-on-merge.yml` and the same STATUS dashboard — you can continue a queue a Cursor agent started, and vice versa. Only the launch step differs, and one repo secret picks it:

- `CLAUDE_ROUTINE_FIRE_URL` **not set** → merge launches a **Cursor Cloud Agent** (default).
- `CLAUDE_ROUTINE_FIRE_URL` **set** → merge fires a **Claude Code routine** → fresh cloud session runs the next slice.

The two launch steps are mutually exclusive, so **one merge** never starts two agents on one slice. Manual cold-start always works: paste the prompt from `npm run mc:opener -- <program>` into a fresh session. (**"Continue"** still works as a fallback the CEO may type — but an agent must never offer it in place of the real prompt: [`agent-chat-session.md`](./agent-chat-session.md).) Setup + trigger types: [`ralph-loop`](../skills/ralph-loop/SKILL.md).

### One slice, one agent — the claim (added 2026-08-11)

Mutual exclusion between *engines* was never the whole problem. **Two merges** were: on 2026-08-11 a slice PR and a one-line `chore(status):` follow-up to it merged ninety seconds apart, both planned the same next slice, and both launched. Two sessions built LAF-8 in parallel and one was discarded.

Two guards now stand between a merge and a launch:

1. **`isMaintenancePr` recognises housekeeping prefixes** — `docs:`, `chore:`, `ci:`, `build:`, `style:` — and bodies that say *"no code changes"* / *"status-only"* / *"follow-up to #N"*. A PR that really shipped a slice carries a SESSION REPORT and is exempted before this rule is reached, so widening the list cannot swallow real work.
2. **The chain claims the slice before launching it** — `ralph-chain-claim.mjs` writes it into `RALPH_RUNNING` and pushes, and the launch steps run only when the claim was taken. The planner has always refused a slice already named there; until now nothing wrote the field, so the gate could never fire.

The claim **fails closed**: an agent that dies leaves its slice held until that slice merges (reconcile clears it) or a person clears the line. A stalled chain is visible in `npm run mc:status`; a duplicated one is not, and costs a session. `npm run mc:ralph-health` checks both guards.

## Secrets (cloud)

Same secrets as the Cursor side: `GOOGLE_APPLICATION_CREDENTIALS_JSON` · `AGENT_BROWSER_*` · `GITHUB_TOKEN` (auto-merge) · optional `SUPABASE_SERVICE_ROLE_KEY`.

Chat naming + continue: [`agent-chat-session.md`](./agent-chat-session.md) · `npm run mc:status` → `CHAT_RENAME:`
