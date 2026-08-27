# AGENTS.md — how we work here

**The one always-on rulebook.** Claude Code, Cursor and Codex all read this file. Everything else is
read on demand from [`docs/rules/`](docs/rules/) — one copy per rule, no mirrors.

---

## 1. Who you are working for

A non-technical founder building with AI. Not a developer.

- **Outcome first**, then one line of why. Plain English. Gloss any jargon in 2–6 words.
- **Sacrifice grammar for concision.** Fragments are fine. Drop *just*, *basically*, *I think*.
- **No file paths, no TypeScript, no "review the diff"** unless the CEO says "go deep".
- **Bullets, not prose.** Bold only for an **action** or a **blocker**.
- **You own the terminal** — git, deploy, CLI, MCP. The CEO owns the browser, and only when you
  genuinely cannot do it: credential UI, DNS registrar, captcha, an explicit OK.
- End a turn with real next-step choices only when there is a real decision.

## 2. Pick a route, then start

A new request gets a route before it gets work. **Pick it — never ask.**

```bash
npm run afkf:route -- "<the request, in the CEO's own words>"
```

Print its `Route:` line as the first line of your first reply, then start. The CEO overrides with one
word — `fix` · `plan` · `grill` · `map` — and that word wins immediately, without discussion.

| Route | When | What happens |
|---|---|---|
| **fast lane** | bug fix, guardrail, wording | branch → change → checks → PR → merge when green. No PRD, no grill. |
| **write-up** | one clear outcome, one sitting | `/planning-session` — straight to the PRD |
| **quick chat** | needs alignment first | `/grill-me`, one question at a time |
| **map** | big, foggy, more than one session | `npm run afkf:map -- --brief <brief.json>` |

## 3. The four sentences that control the chain

Work in any session, any programme, no other context. **Run the command — never answer from memory or a
dashboard block.** The documents are written at closeout, so mid-slice they are stale in exactly the
moment the question is asked.

| The CEO says | You run |
|---|---|
| "where are we?" · "status" | `npm run afkf:chat -- "where are we?"` |
| "pause the chain" · "stop" | `npm run afkf:chat -- "pause the chain"` |
| "resume" · "unpause" | `npm run afkf:chat -- "resume"` |
| "do MDUR next" · "prioritise X" | `npm run afkf:chat -- "do MDUR next"` |

Then say what it printed, in plain English. **Never hand back a list** — if the sentence is ambiguous
the command asks one question; print that question as it came. A pause stops the chain reaching for
*new* work; it never stops work already in flight. Say so — it is the part people worry about.

## 4. How a slice runs

**Planning (HITL)** produces a PRD and slices. **Execution (AFK)** runs a slice that is already
planned — clear exit tests, tags, `ON_FAIL: stop`. AFK means planning is done, not that there is no plan.

**First 60 seconds of an execution session:**

1. `npm run mc:status` — or read the master doc's `## STATUS DASHBOARD` block, and only that block.
2. Print the **Chat name** line from `CHAT_RENAME:` so the CEO can rename in one click.
3. Confirm `ACTIVE_SLICE`, or take the first `AFK_QUEUE` item. If `BLOCKED_BY` ≠ `none` → **stop**.
4. Read `NEXT_PROMPT` and the files it links. Not whole child docs.

**Ending a slice:**

0. `npm run preflight` — **green before you push.** The fourteen checks that used to run on every
   pull request run here now ([`preflight.md`](docs/rules/preflight.md)).
0b. **A fresh critic rules on it** — a subagent with no memory of building it, MEETS or DOES NOT
   MEET the bar. You never judge your own work ([`critic.md`](docs/rules/critic.md)).
1. Branch pushed — `claude/<name>-<id>`, `cursor/<name>-<id>`, or `codex/<name>-<id>`.
2. SESSION REPORT in the **PR body** — never in chat ([`reporting.md`](docs/rules/reporting.md)).
3. STATUS updated in the **same** PR.
4. Merge when green ([`merging.md`](docs/rules/merging.md)).
5. Scoped deploy + spot-check if UI or deploy was touched. Screenshots if UI-visible.

**Commit freely, push once.** Nothing fires on a push any more — the checks run in your session via
`npm run preflight`, and GitHub keeps only what must run when no session exists: the chain launcher,
one guard on `main` after the squash, and the scheduled jobs. Still batch the doc update, the status
update and the fix into one push; a push is cheap now, but a half-finished PR is not. **Never smuggle
a code change into a `chore(status):` commit** — `main-guard` skips docs-only merges by design.
(It measures from the last tree it actually verified, so smuggled code is now caught rather than
skipped — the rule stands because a cancelled run costing a full re-run is nobody's idea of cheap.)

Do **not** push to `main`. Do **not** deploy production before merge unless the CEO says hotfix.

## 5. The stop list — always a human, whatever the route

1. **Credentials** — any secret the CEO must paste or a vendor UI must issue
2. **DNS** — propose the exact record and wait for an explicit OK in chat
3. **Schema migration** — Supabase changes are migrations-only; destructive ops need an OK **and** a backup checkpoint
4. **First bulk `--apply`** on a new pattern
5. **Production deploy flip** — the cutover itself, not the build

Plus: any slice tagged `CEO_GATE: explicit_ok_in_chat`, and **any time you are uncertain** — stop and
write `Status: blocked`. A fast-lane route never overrides this list.

Before a bulk write, a plan upgrade or always-on infra: [`cost-estimate-before-action.md`](docs/rules/cost-estimate-before-action.md).

## 6. This project

> **Fill this in per repo.** Keep it to facts an agent needs before it knows the task — the ones that
> change what it types. Everything longer belongs in `docs/rules/` with an index row in §7.

- **Stack:** <framework · language · hosting · database> — and the direction of travel if you are mid-migration.
- **Dev server:** <command> — say plainly whether it talks to production data.
- **Known-red baseline** (not your fault, do not add to it): <lint / test / typecheck counts>. Live report: <command>.
- **Type checking:** <does the build type-check? if not, what ratchets it?>
- **Access:** <one command that separates "blocked" from "missing credential" from "rejected credential">
- **Auth:** <the non-interactive command; and what never to run>
- **Deploy:** preview <command> · production <command>. Name the surface that is actually live.
- **Mission Control:** master docs at `docs/projects/*-master.md`. Never ask the CEO to paste a report.

## 7. Read this when that happens

| When | Read |
|---|---|
| Before every push | [`preflight.md`](docs/rules/preflight.md) — `npm run preflight` |
| Before merging anything that changed behaviour | [`critic.md`](docs/rules/critic.md) + `/critic` |
| Merging a PR, or it will not merge | [`merging.md`](docs/rules/merging.md) |
| Closing a slice, writing a PR body, the digest | [`reporting.md`](docs/rules/reporting.md) |
| Grill / PRD / slice planning, or handing off | [`planning-chain.md`](docs/rules/planning-chain.md) |
| Writing or reading slice tags | [`slice-tags.md`](docs/rules/slice-tags.md) |
| A credential, CLI or bootstrap fails | [`environments.md`](docs/rules/environments.md) |
| The CEO reports a bug | [`pair-debugging.md`](docs/rules/pair-debugging.md) |
| The CEO must do something by hand | [`manual-task-guidance.md`](docs/rules/manual-task-guidance.md) |
| Before a bulk write / plan upgrade / always-on infra | [`cost-estimate-before-action.md`](docs/rules/cost-estimate-before-action.md) |
| Anything else this repo added | its own row in `docs/rules/` |
| You want to undo a rule above | [`history.md`](docs/rules/history.md) — the incident that bought it |

Full index: [`docs/rules/`](docs/rules/). Add a row here whenever you add a rule — a rule the
rulebook does not index is a rule nobody finds.

## 8. Skills

Claude Code: `.claude/skills/` · Cursor: `.cursor/skills/` (same files) · invoke with `/name`.

`/grill-me` → `/planning-session` → `/slice-planning` → `/afk-slice`. Plus `/session-report`,
`/critic`, `/mc-status`, `/tdd`, `/improve-codebase`, `/agent-discipline`, `/handoff`, `/ralph-loop`.
