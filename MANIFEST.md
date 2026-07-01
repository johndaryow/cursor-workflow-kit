# Workflow kit manifest

Everything you need to replicate the PP agent workflow in another repo — organized by tier.

---

## Tier 1 — Required (minimum viable workflow)

**You get this in `cursor/skills/` + `cursor/rules/` + User Rule.**

### Skills (11)

| Skill | One line |
|-------|----------|
| `grill-me` | Alignment interview before new programs |
| `planning-session` | PRD only — no slices |
| `slice-planning` | Tracer bullets + AFK/HITL tags + §12 |
| `afk-slice` | Execute one scripted slice |
| `ralph-loop` | How merge → next slice works |
| `mc-status` | “Where are we?” from STATUS dashboard |
| `session-report` | Plain-English PR closeout |
| `agent-discipline` | Token/cost + model picks |
| `tdd` | Red → green for logic changes |
| `improve-codebase` | Architecture planning only |
| `handoff` | Emergency mid-slice only |

### Rules (9 — `alwaysApply` or load every execution chat)

| Rule | One line |
|------|----------|
| `workflow-core.mdc` | Planning vs AFK; doc-as-controller; Ralph |
| `ceo-communication.mdc` | Outcome-first plain English for founder |
| `auto-merge-policy.mdc` | Agent merges AFK when tests green |
| `agent-chat-session.mdc` | Chat naming; Continue / status behavior |
| `hitl-afk-slices.mdc` | AUTONOMY / CEO_GATE / MERGE_POLICY tags |
| `session-report-format.mdc` | PR report template |
| `manual-task-guidance.mdc` | One step when CEO must click vendor UI |
| `cost-estimate-before-action.mdc` | Estimate before expensive cloud ops |
| `pair-debugging.mdc` | Agent owns fix; CEO one browser step max |

### User Rule (1)

Paste from `templates/workflow-user-rules-canonical.md` into **Cursor → Customize → Rules → User**.

### Doc template (1)

`templates/program-master-stub.md` — STATUS DASHBOARD + §12 pattern for your program.

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

**Adds merge → next Cloud Agent automatically.**

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

- `cursor-invoke-cheatsheet.md` — `/grill-me` slash commands
- `workflow-user-rules-canonical.md` — single User Rule
- `workflow-skills-reconcile.md` — delete old global skills

---

## File count summary

| Tier | Skills | Rules | Scripts | GHA | Templates |
|------|--------|-------|---------|-----|-----------|
| 1 Required | 11 | 9 | 0 | 0 | 2+ |
| 2 AFK | — | — | 8 | 0 | 1 |
| 3 Ralph | — | — | 5 | 2 | 2 |
| 4 Optional | 1 | 3 | — | — | — |
