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

**You get this in `cursor/skills/` + `cursor/rules/` + User Rule (Cursor), and `claude/skills/` + `claude/rules/` + `CLAUDE.md` (Claude Code).**

### Skills (11 — mirrored in `cursor/skills/` and `claude/skills/`, same `SKILL.md` format)

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

### Rules (9 — `alwaysApply` in Cursor / imported into `CLAUDE.md` in Claude Code, or load on demand)

| Cursor rule (`cursor/rules/*.mdc`) | Claude Code rule (`claude/rules/*.md`) | One line |
|------|------|----------|
| `workflow-core.mdc` | `workflow-core.md` | Planning vs AFK; doc-as-controller; chain |
| `ceo-communication.mdc` | `ceo-communication.md` | Outcome-first plain English for founder |
| `auto-merge-policy.mdc` | `auto-merge-policy.md` | Agent merges AFK when tests green |
| `agent-chat-session.mdc` | `agent-chat-session.md` | Chat naming; Continue / status behavior |
| `hitl-afk-slices.mdc` | `hitl-afk-slices.md` | AUTONOMY / CEO_GATE / MERGE_POLICY tags |
| `session-report-format.mdc` | `session-report-format.md` | PR report template — on demand |
| `manual-task-guidance.mdc` | `manual-task-guidance.md` | One step when CEO must click vendor UI — on demand |
| `cost-estimate-before-action.mdc` | `cost-estimate-before-action.md` | Estimate before expensive cloud ops — on demand |
| `pair-debugging.mdc` | `pair-debugging.md` | Agent owns fix; CEO one browser step max — on demand |

The first five are `alwaysApply: true` in Cursor and are `@`-imported into `claude/CLAUDE.md` for Claude Code — both load every session. The last four are `alwaysApply: false` / loaded on demand in Cursor, and in Claude Code are read by a skill (or the agent) only when the situation calls for it — not imported into `CLAUDE.md`, to avoid spending context every session.

### User Rule / CLAUDE.md (1 each)

- **Cursor:** paste `templates/workflow-user-rules-canonical.md` into **Cursor → Customize → Rules → User**.
- **Claude Code:** `install.sh` writes `claude/CLAUDE.md` to your repo root as `CLAUDE.md` (skips if one already exists — merge `templates/CLAUDE-workflow-snippet.md` into it instead).

### Doc template (1)

`templates/program-master-stub.md` — STATUS DASHBOARD + §12 pattern for your program. Agent-agnostic — both Cursor and Claude Code read the same master doc.

---

## Tier 2 — AFK execution (Mission Control scripts)

**In `scripts/` — wire via `templates/package-scripts.json`.**

| Script | npm script | Purpose |
|--------|------------|---------|
| `sync-agent-skills.mjs` | `sync:agent-skills` | Mirror `.cursor/skills` → `.agents/skills` |
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

**Claude Code gap:** `ralph-continue-on-merge.yml` calls the **Cursor Cloud Agent API** to start the next agent — there's no Claude Code equivalent wired up in this kit. Everything upstream of that one API call (`mc:ralph-chain`, the STATUS dashboard, `AFK_QUEUE`) is agent-agnostic and works the same from either tool. From Claude Code, chain slices by saying "Continue" in a fresh session, or build your own trigger using Claude Code's session/Routine APIs if you want it automatic. See [`claude/skills/ralph-loop/SKILL.md`](./claude/skills/ralph-loop/SKILL.md).

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
