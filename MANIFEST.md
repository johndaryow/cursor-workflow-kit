# Workflow kit manifest

Everything you need to replicate the PP agent workflow in another repo — organized by tier.

**Two agents, one workflow:** every tier below ships for **both** Cursor (`cursor/`) and Claude Code (`claude/`). Same skill names, same STATUS-dashboard-as-controller pattern, same tags. See [`claude/README.md`](./claude/README.md) for the Cursor ↔ Claude Code mapping table, and the one real gap (Ralph's merge-triggered auto-chain, which is currently Cursor-Cloud-specific).

---

## Tier 0 — The kit is the source, and drift goes red

Before this existed, the workflow was written once and then lived three times — in `pp-workspace`, in
`pp-shopify-theme`, and here. Measured in code on 2026-08-19, not from memory: of **81 kit-owned
paths, 20 were missing from the kit outright and 31 more had diverged**. A fourth repo started from
the kit that day would have inherited the workflow from before the lessons that made it work.

| File | npm script | Purpose |
|------|------------|---------|
| `kit-manifest.json` | — | **The contract.** A path listed here is owned by the kit; a path outside it belongs to the repo. |
| `scripts/kit-drift-check.mjs` | `kit:drift` | Compares every kit-owned path against the local copy. Exits 1 on divergence, names the files **and which side is newer**. |
| `scripts/kit-drift-check.test.mjs` | `test:kit-drift` | Unit tests, including the deploy-local guard below. |
| `scripts/kit-manifest-build.mjs` | `kit:manifest` | Kit-only. Measures drift, pulls a live repo's newer copy across (`--apply`), installs the kit into a repo (`--install`). Never deletes. |
| `optional/github-workflows/kit-drift.yml` | — | Runs on push and PR in every repo. Always reports; short-circuits **inside the job** on a `docs/`-only diff, never `paths-ignore`. |

### Deploy steps stay repo-local

The manifest deliberately excludes anything that pushes a storefront, an app, a bucket or a database —
`firebase.json`, wrangler config, `scripts/deploy-*`, the Shopify theme guard. Universal is merging,
permissions, reporting, the danger list, the retry loop, the router. `kit-drift-check.test.mjs` fails
if a deploy-local path is ever added to the manifest.

### Two classes of kit-owned file

- **`hash`** — must be byte-identical everywhere. Rules, skills, the router and reporting scripts.
- **`seed`** — the kit ships a starting copy for a **new** repo; an existing repo owns its own, so
  neither bytes nor presence are checked. These are the scripts coupled to repo data: the slice ids
  in `ralph-chain-config.mjs` and the program registry in `ralph-master-registry.mjs`, plus every
  script that imports them. That closure is **derived in code**, not hand-listed — measured by
  installing the kit into `pp-shopify-theme` and watching seven scripts fail on symbols its own
  config does not export. Splitting the universal helpers out of the repo data is a later slice; this
  one only stops pretending the coupling is not there.

### Changing a workflow file

Edit it **in the kit**, then:

```bash
node scripts/kit-manifest-build.mjs --from /path/to/pp-workspace --apply     # kit takes the change
node scripts/kit-manifest-build.mjs --from /path/to/each-repo   --install    # every repo takes it back
```

Editing it in a repo is not forbidden — it is just no longer invisible. `kit:drift` names the file
and says the repo moved.

---

## Tier 1 — Required (minimum viable workflow)

**One rulebook, three agents.** `templates/AGENTS.md` → `AGENTS.md` at the repo root is the **only**
always-on file. Codex and Cursor read it natively; Claude Code imports it from a three-line
`CLAUDE.md`. Every rule body lives once in `rules/` → `docs/rules/`, read on demand from the index in
§7 of the rulebook. Skills live once in `skills/` → `.claude/skills/`, with `.cursor/skills` and
`.agents/skills` as **symlinks** to it.

Until 2026-08-26 the kit shipped all of this twice, in two dialects, hash-locked to each other. The
cost was not the disk space: a repo that could not reach the kit could not fix a rule, so it wrote a
**second rule saying the first was wrong**. Five such rules accumulated in `pp-workspace`, and every
session read both sides of five disagreements before it read the task. One copy is the fix.

### Skills (11 — in `skills/`, installed to `.claude/skills/`, symlinked from `.cursor` and `.agents`)

| Skill | One line |
|-------|----------|
| `grill-me` | Alignment interview before new programs |
| `planning-session` | PRD only — no slices |
| `slice-planning` | Tracer bullets + AFK/HITL tags + §12 |
| `afk-slice` | Execute one scripted slice |
| `ralph-loop` | How merge → next slice works (**Cursor and Claude Code chain differently** — see the skill) |
| `mc-status` | “Where are we?” from STATUS dashboard |
| `session-report` | Plain-English PR closeout |
| `agent-discipline` | Token/cost + model picks |
| `tdd` | Red → green for logic changes |
| `improve-codebase` | Architecture planning only |
| `handoff` | Emergency mid-slice only |

### The rulebook (1, always-on)

`templates/AGENTS.md` — ~1,200 words. Who the work is for and how to talk to them, how to pick a
route, the four sentences that control the chain, how a slice runs, the stop list, a repo-specific
section the repo owns, and an index of what to read when. Section 6 is the only part you fill in.

It is deliberately **not** in `kit-manifest.json`: a hash check would fail in every repo that filled
in section 6 honestly. The kit owns the shape; the repo owns the facts.

### Rules (8, on demand — `rules/` → `docs/rules/`)

| Rule | One line |
|------|----------|
| `merging.md` | Agent merges AFK when green; `--wait`; what to do when the venue cannot merge |
| `reporting.md` | Success is silent; the SESSION REPORT template; the daily digest |
| `planning-chain.md` | Claim → grill → PRD → slices; the merge launches the next step; net lines |
| `slice-tags.md` | AUTONOMY / CEO_GATE / MERGE_POLICY |
| `manual-task-guidance.md` | One step at a time when a human must click a vendor UI |
| `cost-estimate-before-action.md` | Estimate before expensive cloud ops |
| `pair-debugging.md` | Agent owns the fix; the human gets one browser step |
| `history.md` | The incident behind each rule above. Never read per session; linked from the rule it bought |

**Nothing here is always-on.** They are reached from the index in §7 of `AGENTS.md` when the
situation calls for one, which is what keeps the per-session cost at one page instead of twenty-five.

**A rule must never overrule another rule.** If two disagree, edit the kit and delete the loser —
that is what the kit being the source is *for*. A test in `pp-workspace` fails any rule containing
"this file is the canon" or "By-hand item for the kit".

### User Rule / CLAUDE.md (1 each)

- **All three agents:** `install.sh` writes `templates/AGENTS.md` to your repo root as `AGENTS.md`
  (skipped if one exists — compare by hand, since section 6 is yours).
- **Claude Code:** `templates/CLAUDE.md` → `CLAUDE.md`, three lines that import `AGENTS.md`.
- **Cursor:** `templates/cursor/000-agents.mdc` → `.cursor/rules/`, an `alwaysApply` pointer at
  `AGENTS.md`. Cursor reads `AGENTS.md` natively too; this is belt and braces.
- **Codex:** nothing to install — it reads `AGENTS.md`.

### Doc template (1)

`templates/program-master-stub.md` — STATUS DASHBOARD + §12 pattern for your program. Agent-agnostic — both Cursor and Claude Code read the same master doc.

---

## Tier 2 — AFK execution (Mission Control scripts)

**In `scripts/` — wire via `templates/package-scripts.json`.**

| Script | npm script | Purpose |
|--------|------------|---------|
| `sync-agent-skills.mjs` | `sync:agent-skills` | Assert (and repair) the `.cursor/skills` + `.agents/skills` symlinks |
| `mc-status.mjs` | `mc:status` | Print STATUS + CHAT_RENAME |
| `mc-opener.mjs` | `mc:opener` | What slice to run next |
| `mc-chat-meta.mjs` | (internal) | Parse STATUS fields |
| `mc-slice-closeout.mjs` | `mc:slice-closeout` | Pre-merge PR checklist |
| `mc-auto-merge.mjs` | `mc:auto-merge` | Squash merge when green |
| `mc-status-reconcile.mjs` | `mc:status-reconcile` | Fix STATUS after merge |
| `mc-ralph-health.mjs` | `mc:ralph-health` | Chain health check |

**Secrets:** `GITHUB_TOKEN` or `GITHUB_PAT` on Cloud VM for PR create + auto-merge.

---

## Tier 3 — Full Ralph chain (hands-off slice queue)

**Adds merge → next Cloud Agent automatically. This tier is Cursor-specific — see the callout below before assuming it works from Claude Code too.**

| Script | npm script | Purpose |
|--------|------------|---------|
| `ralph-chain.mjs` | `mc:ralph-chain` | Plan next slice after merge |
| `ralph-chain-launch.mjs` | `mc:ralph-launch` | Start Cursor Cloud Agent |
| `ralph-chain-config.mjs` | (internal) | Serial chains + DAG fill — **customize per repo** |
| `ralph-master-registry.mjs` | (internal) | Read ON_SUCCESS from `*-master.md` |
| `ralph-fill-dag.mjs` | `mc:ralph-fill-dag` | Parallel lane cold-start |

| GitHub Action | Purpose |
|---------------|---------|
| `ralph-continue-on-merge.yml` | Primary chain engine on PR merge |
| `ralph-chain-test.yml` | CI for chain logic (optional) |

**GitHub secrets:** `CURSOR_API_KEY`, `CURSOR_CLOUD_ENV_NAME` (or your env name secret)

**Docs:** `templates/workflow-afk-foundation.md`, `templates/workflow-master.md`

**Customize:** Edit `ralph-chain-config.mjs` — remove PP Workers/S6b maps; add your program’s serial chain or rely on doc-only registry.

**Claude Code gap:** `ralph-continue-on-merge.yml` calls the **Cursor Cloud Agent API** to start the next agent — there's no Claude Code equivalent wired up in this kit. Everything upstream of that one API call (`mc:ralph-chain`, the STATUS dashboard, `AFK_QUEUE`) is agent-agnostic and works the same from either tool. From Claude Code, chain slices by saying "Continue" in a fresh session, or build your own trigger using Claude Code's session/Routine APIs if you want it automatic. See [`skills/ralph-loop/SKILL.md`](./skills/ralph-loop/SKILL.md).

---

## Tier 4 — Optional (copy from `optional/` if relevant)

| Item | When to add |
|------|-------------|
| `optional/skills/design-system-first` | Repo has a shared UI design system |
| `optional/rules/design-system-ui.mdc` | With design-system-first |
| `optional/rules/agent-browser-spot-check.mdc` | Agent-owned UI proof with login |
| `optional/rules/scoped-deploy-and-hosting-preflight.mdc` | Firebase/Cloudflare deploy patterns |

---

## Tier 5 — PP product only (do NOT copy for generic workflow)

These rules/skills/docs are **Perfect Presents / Design Studio specific**:

| Item | Why skip |
|------|----------|
| `design-studio-terminology.mdc` | Product vocabulary |
| `architecture-source-of-truth.mdc` | PP architecture doc paths |
| `directory-structure.mdc` | PP repo layout |
| `app-stack.mdc` | Vite/Firebase versions for PP |
| `firestore-cost-consciousness.mdc` | Firestore-specific |
| `gcp-billing-review.mdc` | PP GCP project |
| `gcp-agent-auth.mdc` | PP service account |
| `cloudflare-agent-auth.mdc` | PP Cloudflare account |
| `db-change-safety.mdc` | Supabase patterns for PP |
| `documentation-updates.mdc` | PP changelog paths |
| `changelog.mdc` | Design Studio changelog |
| `global-deep-linking-contract.mdc` | PP routing |
| `guided-tours.mdc` | PP in-app tours |
| `headless-ready.mdc` | PP test architecture |
| `media-preview-zoom.mdc` | PP PDF/image UX |
| `performance-and-ux.mdc` | PP app standards |
| `api-documentation-practice.mdc` | PP third-party APIs |
| `platform-migration-master.md` | Workers migration program |
| `cloud-agent-bootstrap.sh` | PP GCP/Firebase secrets |
| Hardcoded `WORKER_NEXT` / S6b in `ralph-chain-config.mjs` | PP migration only |

Write equivalents in the **target repo** when that product needs them.

---

## CEO cheat sheets (included in `templates/`)

- `cursor-invoke-cheatsheet.md` — `/grill-me` slash commands (Cursor)
- `claude-invoke-cheatsheet.md` — `/grill-me` slash commands (Claude Code)
- `workflow-user-rules-canonical.md` — single User Rule (Cursor)
- `CLAUDE-workflow-snippet.md` — CLAUDE.md merge snippet (Claude Code)
- `workflow-skills-reconcile.md` — delete old global skills

---

## File count summary

Counts are **per agent** — Tier 1 skills/rules exist in both `cursor/` and `claude/`.

| Tier | Skills | Rules | Scripts | GHA | Templates |
|------|--------|-------|---------|-----|-----------|
| 1 Required | 11 × 2 agents | 9 × 2 agents | 0 | 0 | 4+ |
| 2 AFK | — | — | 8 | 0 | 1 |
| 3 Ralph (Cursor-only) | — | — | 5 | 2 | 2 |
| 4 Optional | 1 (Cursor only so far) | 3 (Cursor only so far) | — | — | — |
