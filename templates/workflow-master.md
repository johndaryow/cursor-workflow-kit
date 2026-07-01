# WORKFLOW — Pocock Agent Ops · Master Doc

**Program code:** WORKFLOW  
**Status (2026-06-24):** ✅ **Grill + Phase 2 complete** — operating system locked  
**Owner:** CEO + Cursor Cloud Agents  
**Canon:** `.cursor/rules/workflow-core.mdc`

> **Goal:** Adapt Matt Pocock’s engineering-first AI workflow for **Cursor**, **non-developer CEO**, doc-as-controller, AFK chains for migration — **no MC chat relay**.

---

## STATUS DASHBOARD

```text
ACTIVE_PROGRAM: WORKFLOW
ACTIVE_SLICE: none
AUTONOMY: AFK
CEO_GATE: none
MERGE_POLICY: auto_when_green
BLOCKED_BY: none
LAST_SOAK: mc:ralph-health PASS · test:ralph-chain PASS · GHA chain WORKFLOW-P17
DEPLOY_AFTER_MERGE: none
LAST_MERGED_PR: #496 WORKFLOW-P20b UI rules diet
LAST_PR: WORKFLOW-P21 skill discovery mirror
NEXT_PROMPT: none — CEO reload web; try /grill-me in main chat ([cursor-invoke-cheatsheet.md](./cursor-invoke-cheatsheet.md))
AFK_QUEUE: none
```

---

## CEO daily rhythm (cheat sheet)

| When | You | Agents |
|------|-----|--------|
| **~8 AM** | Optional: read **Morning digest** run (or skip — check agent sessions) | Digest only — no auto-start unless you kept legacy brief |
| **Any AFK merge** | **Ralph continue** starts next slice (workers + S6b) | Automations run view |
| **New program / fork** | Answer **grill-me** (chat A) · approve PRD (chat B) · approve slices (chat C) | PRD → then tracer slices in master doc |
| **Blocked / HITL** | DNS, schema, billing, credentials only | Stop + SESSION REPORT |
| **Never** | GitHub, PR diffs, merge clicks on S6b | — |

**Manual override:** `npm run mc:opener` in any agent chat · pause migration: disable morning automation or `BLOCKED_BY: CEO pause` in platform STATUS.

---

## 1. Locked decisions (grill — 2026-06-24)

| # | Decision |
|---|----------|
| W1 | **Tool:** Cursor only — no Claude Code |
| W2 | **Controller:** master doc STATUS block — **no MC agent chat relay** |
| W3 | **CEO:** non-developer — no code/PR diff review; plain-English SESSION REPORT only |
| W4 | **Auto-merge:** AFK slices + green exit tests → **agent merges** via `mc:auto-merge` |
| W5 | **HITL forever:** DNS, schema, first bulk apply, billing cancel, new credentials |
| W6 | **CEO time:** planning (grill) + human-only gates — not merge clicks for batches |
| W7 | **Fundamentals:** Pocock stack — grill, vertical slices, TDD, deep modules, smart zone |
| W8 | **Ralph:** merge → `mc:ralph-chain` → next AFK slice; `mc:opener` manual fallback |
| W9 | **Skills (repo):** `.cursor/skills/` committed — cloud agents + team source of truth |
| W10 | **Reports:** PR description SESSION REPORT — not paste to MC chat |
| W11 | **Lanes:** **Fill the DAG** — run every idle lane that passes §5b parallel rules |
| W12 | **Notifications:** **Cursor Automations** — CEO reads Automations UI, not GitHub |
| W13 | **Morning:** optional digest only — not required for AFK chain |
| W14 | **Skills (CEO):** Global `~/.cursor/skills/` — sync from repo after skills PRs ([`workflow-skills-reconcile.md`](./workflow-skills-reconcile.md)) |
| W15 | **S6b auto-merge:** Full auto-merge on S6b batches when exit tests green — CEO reads report only |
| W16 | **Reporting:** All programs → SESSION REPORT in PR only — [`AGENT_REPORTING.md`](./AGENT_REPORTING.md); MC chat paste **deprecated** |
| W17 | **Ralph on merge:** GitHub Action `ralph-continue-on-merge.yml` — [`workflow-afk-foundation.md`](./workflow-afk-foundation.md) WORKFLOW-P17 |
| W18 | **Planning = 3 chats:** grill → `planning-session` (PRD only) → `slice-planning` (tracer bullets + Ralph) — no slice content in PRD |
| W19 | **Skills diet (P20a):** 12 skills · CEO tone in `ceo-communication.mdc` (sacrifice grammar) · `agent-discipline` replaces efficiency + model-picker |
| W20 | **UI rules diet (P20b):** one `design-system-ui.mdc` replaces 7 granular UI rules; specialty rules kept |
| W21 | **Skill discovery (P21):** mirror `.cursor/skills/` → `.agents/skills/` via `npm run sync:agent-skills`; planning skills slash-only (`disable-model-invocation`); CEO cheat sheet |

---

## 2. Pocock alignment (honest comparison)

**Same spirit as Matt Pocock — adapted for you:**

| Pocock | PP WORKFLOW |
|--------|-------------|
| `/grill-me` before code | `grill-me` skill — chat A |
| `/to-prd` destination doc | `planning-session` — chat B · **no slices in PRD** |
| `/to-issues` tracer bullets | `slice-planning` — chat C · quiz CEO · Ralph-ready §12 |
| AFK vs HITL tags | `AUTONOMY` / `CEO_GATE` on each slice |
| Ralph loop (repeat AFK tasks) | **GitHub Action** on merge + `mc:ralph-launch` + auto-merge |
| Parallel independent slices | §5b sub-lanes + `mc:ralph-fill-dag` — one agent per slice |
| TDD red → green | `tdd` skill |
| Smart zone (lean context) | One slice = one fresh agent chat |
| Sandcastle (parallel Docker agents) | Cursor Cloud Agents + git branches + lane rules |

**Intentional differences (not bugs):**

- **Cursor only** — no Claude Code, no Sandcastle Docker
- **You don't read code** — SESSION REPORT replaces engineer-style PR review
- **Doc-as-controller** — our master doc STATUS replaces GitHub Issues kanban + MC chat paste
- **Cursor Automations** — merge trigger **off**; optional digest only
- **GitHub Action** — `ralph-continue-on-merge.yml` is the AFK chain engine ([`workflow-afk-foundation.md`](./workflow-afk-foundation.md))

**Expectation:** Agents follow Pocock **fundamentals** (grill, vertical slices, TDD, feedback loops). Execution: **GitHub Action + Cursor Cloud Agents** — see [`workflow-afk-foundation.md`](./workflow-afk-foundation.md).

---

## 3. Planning rhythm (four chats · Pocock)

| Chat | CEO says | Skill | Stops when |
|------|----------|-------|------------|
| **A** | “Grill me on X” | `grill-me` | CEO confirms 5-bullet summary |
| **B** | “Write the PRD” | `planning-session` | PRD merged — **no slices, no §12** |
| **C** | “Plan slices for Ralph” | `slice-planning` | CEO approves tracer draft · `test:ralph-chain` green · doc PR merged |
| **D+** | “Start {slice}” / Ralph | `afk-slice` | One slice per agent until queue empty or HITL gate |

**Execution mode:** CEO reads SESSION REPORT only — not code or merge clicks on AFK slices.

---

## 4. Two modes (CEO rhythm)

| Mode | You do | Agent does |
|------|--------|------------|
| **Planning** | Answer grill; approve PRD; approve slice breakdown | PRD chat → slice-planning chat (separate PRs) |
| **Execution** | Read SESSION REPORT / Automations runs; human-only gates only | AFK slice → verify → merge → deploy |

**Migration execution:** Morning automation · or `npm run mc:opener` → PLATFORM S6b batch chain.

---

## 5. What's in the repo (skills + rules)

**Rules** (`.cursor/rules/` — agents load automatically):

- **Always-on (4):** `workflow-core`, `hitl-afk-slices`, `auto-merge-policy`, `ceo-communication`
- **On-demand:** `design-system-ui`, `session-report-format`, deploy/spot-check/docs rules — loaded when relevant (UI: `src/**/*.tsx`)
- Reconcile global Customize: [`workflow-skills-reconcile.md`](./workflow-skills-reconcile.md) · User Rules: [`workflow-user-rules-canonical.md`](./workflow-user-rules-canonical.md)

**Skills** (`.cursor/skills/` — cloud agents read from repo checkout):

- `grill-me`, `planning-session`, `slice-planning`, `mc-status`, `afk-slice`, `ralph-loop`, `tdd`, `session-report`, `agent-discipline`, `handoff`, `design-system-first`, `improve-codebase`

**Scripts:** `mc:status` · `mc:opener` · `mc:auto-merge` · `mc:automation-setup` · `mc:ralph-chain` · `mc:ralph-fill-dag`

**Reporting canon:** [`AGENT_REPORTING.md`](./AGENT_REPORTING.md)

**Your Mac:** Copy repo skills to `~/.cursor/skills/` once (and after skills PRs) — [`workflow-skills-sync.md`](./workflow-skills-sync.md). **Automations:** ✅ CEO configured 2026-06-24.

---

## 6. CEO one-time setup (human_only)

| Item | Status |
|------|--------|
| Cursor Automations (morning + batch ping) | ✅ CEO 2026-06-24 |
| Global skills sync (`~/.cursor/skills/`) | ⏳ CEO Mac — see [`workflow-skills-reconcile.md`](./workflow-skills-reconcile.md) |
| User Rules (Customize → one canonical rule) | ⏳ CEO — see [`workflow-user-rules-canonical.md`](./workflow-user-rules-canonical.md) |
| `GITHUB_TOKEN` in Cloud Secrets (auto-merge) | Verify in Cursor Cloud → Secrets |
| Environment snapshot re-saved | After secrets change — see [`cursor-cloud-setup.md`](./cursor-cloud-setup.md) |

---

## 7. Daily commands

| Want | Command / where |
|------|-----------------|
| Where are we? | Automations morning run · or `npm run mc:status` |
| Start next agent manually | `npm run mc:opener` |
| Migration program | `npm run mc:opener` (default platform) |

---

## 8. Cursor Automations

**Guide:** [`workflow-cursor-automations.md`](./workflow-cursor-automations.md) · **CEO setup:** ✅ complete

---

## 9. Mission Control loop (doc-as-controller)

1. Agent reads STATUS DASHBOARD  
2. Executes NEXT_PROMPT  
3. PR updates STATUS + SESSION REPORT  
4. Auto-merge if AFK + green (S6b: W15)  
5. Post-merge deploy + spot-check  
6. Next agent reads updated doc — **no paste loop**

---

## 12. Phase prompts (archive)

### WORKFLOW-P1 — Pocock overhaul ✅ #118–119

### WORKFLOW-P2 — PLATFORM STATUS sync ✅ (closeout 2026-06-24)

Doc drift fixed; platform §12 uses `mc:opener` as primary entry.

### WORKFLOW-P3 — Resume migration chain

**Not WORKFLOW scope** — execution lives under PLATFORM §12 S6b batch 10+. Start via morning automation or `mc:opener`.

### WORKFLOW-P4 — Cursor morning automations ✅ #121 · CEO UI 2026-06-24

### WORKFLOW-P4b — Automation YAML + W14 ✅ #122

### WORKFLOW-P5 — Grill closeout ✅ #123

W15 S6b auto-merge · STATUS idle · CEO cheat sheet · Pocock alignment table.

### WORKFLOW-P20b — UI rules diet ✅

One **`design-system-ui.mdc`** (globs: `src/**/*.tsx`) replaces 7 granular UI rules. Kept specialty: `media-preview-zoom`, `guided-tours`, `global-deep-linking-contract`, `design-studio-terminology`, `performance-and-ux`. Canon: `DESIGN-SYSTEM.md` + `ds-master.md` + `/design-system` styleguide. W20 locked.

### WORKFLOW-P20a — Workflow OS diet ✅

**Merged P19 first (#494).** Skills 15 → **12**: `agent-discipline` (efficiency + model-picker); deleted `ceo-plain`, `automation-first` (→ `ceo-communication` + `workflow-core`); deleted rules `mc-report-format`, `phased-plan-execution`. W19 locked.

### WORKFLOW-P19 — Pocock 3-chat planning ✅

Split planning to match Pocock `/to-prd` + `/to-issues`:

- `planning-session` → PRD only (hard stop — no slices in PRD)
- `slice-planning` → tracer bullets + CEO quiz + Ralph-ready §12
- Removed `slice-tagger` (merged into slice-planning)
- W18 locked in §1

### WORKFLOW-P15 — Ralph planner hardening (Cursor Automation primary) ✅

**Engine unchanged:** Cursor Automations `PP · Ralph continue on merge` (GitHub merge workflow stays disabled).  
**Fixes:** docs planning PRs (e.g. RTE-F1–F10 decomposition) no longer false-chain; `--resolve-latest-merge` for automation PR pick; `mc:ralph-health`.  
**CEO:** confirm automation Active at cursor.com/automations + Environment snapshot saved.

### WORKFLOW-P14 — Cursor-native Ralph + doc registry ✅

**Primary engine:** Cursor Automations `PP · Ralph continue on merge` (GitHub merge workflow disabled).  
**Doc-driven planner:** `ralph-master-registry.mjs` reads `ON_SUCCESS` + per-slice tags from `*-master.md` (CM, CDRIVE, …).  
**Auto-merge:** per-slice tags from PR `Slice:` id.  
**CI:** `ralph-chain-test.yml` path-filtered only.

### WORKFLOW-P18 — Ralph STATUS hardening ✅ (in PR)

Three-layer fix after DS5 chain stall: (1) `ralph-chain` ignores merged slice in `RALPH_RUNNING` busy check; (2) `mc:slice-closeout` blocks auto-merge if slice still marked running; (3) `mc:status-reconcile` on GHA after merge updates program STATUS + platform §5b. Agents no longer set `RALPH_RUNNING` on start.

### WORKFLOW-P11 — Maintenance PR skip + dedupe ✅

Ralph **ignores doc-only STATUS PRs** (all programs) so one slice = one chain. Skips when next slice already in `RALPH_RUNNING`. Agents must not open a second PR for dashboard-only updates.

### WORKFLOW-P10 — Parallel-fill on lane end ✅

When a serial track ends (e.g. W11), `mc:ralph-chain` auto-starts the next **idle** parallel track via fill-the-DAG (skips `RALPH_RUNNING` sub-lanes). Priority: W15 → W21 → W22 → W23 → …

### WORKFLOW-P9 — Workers Ralph + Fill-the-DAG ✅

Unified **Ralph continue on merge** for Lane B workers (W9→W26 chains) + S6b + DLM AFK. Deterministic `scripts/ralph-chain.mjs` + `ralph-fill-dag.mjs`. Morning brief demoted to optional digest. CEO: `npm run mc:automation-setup` STEP 1 — replace batch ping.

### WORKFLOW-P8 — Ralph continue on merge ✅

Merge-triggered Lane A chain — `ralph-continue-on-merge.md` + automation setup. CEO enables Automation 2 via `npm run mc:automation-setup` STEP 2.

### WORKFLOW-P7 — Rules diet + skills reconcile ✅ #125

Merged `pocock-workflow` + `cloud-agent-workflow` + `mc-doc-controller` → `workflow-core.mdc`. Demoted 5 rules to on-demand. Deleted `self-improvement.mdc`. Added `agent-efficiency`, `automation-first`, `model-picker` skills. CEO guides: [`workflow-user-rules-canonical.md`](./workflow-user-rules-canonical.md) · [`workflow-skills-reconcile.md`](./workflow-skills-reconcile.md).

---

## Changelog

- **2026-07-01 — WORKFLOW-P21.** Skill discovery mirror `.agents/skills/` + `sync:agent-skills`; planning slash-only; [`cursor-invoke-cheatsheet.md`](./cursor-invoke-cheatsheet.md). W21 locked.
- **2026-07-01 — WORKFLOW-P20b.** UI rules 7 → 1 `design-system-ui.mdc` + 4 specialty UI rules. W20 locked.
- **2026-07-01 — WORKFLOW-P20a.** Skills 12; sacrifice grammar in `ceo-communication`; delete deprecated workflow rules.
- **2026-07-01 — WORKFLOW-P19.** Pocock 3-chat planning: `planning-session` = PRD only; new `slice-planning`; removed `slice-tagger`. W18 locked.
- **2026-06-29 — WORKFLOW-P15.** Planner hardening (docs planning PR skip, mc:ralph-health); revert GitHub Ralph primary — Cursor Automations stays engine.
- **2026-06-29 — WORKFLOW-P14.** Cursor-native Ralph; doc registry for CM/CDRIVE; GitHub merge workflow disabled; path-filtered CI.
- **2026-06-27 — WORKFLOW-P11.** Skip doc-only STATUS PRs on Ralph merge; dedupe RALPH_RUNNING; one merge = one chain (all programs).
- **2026-06-27 — WORKFLOW-P10.** Parallel-fill on lane end — W11→next idle track; `CHAIN_MODE` in mc:ralph-chain.
- **2026-06-26 — WORKFLOW-P9.** Workers Ralph on merge; mc:ralph-chain + fill-dag; optional morning digest; RALPH_RUNNING in STATUS.
- **2026-06-24 — WORKFLOW-P8.** Merge-triggered Ralph for Lane A S6b; Automation 2 replaces notify-only ping; W17.
- **2026-06-24 — WORKFLOW-P7.** Rules diet (`workflow-core.mdc`); 4 always-on rules; 14 skills; global reconcile docs.
- **2026-06-24 — WORKFLOW-P6.** MC REPORT → SESSION REPORT cleanup; `AGENT_REPORTING.md`; W16.
- **2026-06-24 — WORKFLOW-P5 closeout.** Grill complete W1–W15; program idle; CEO cheat sheet; Pocock alignment; automations ✅.
- **2026-06-24 — WORKFLOW-P4b.** Automation YAML + `mc:automation-setup`; W14 global skills sync doc.
- **2026-06-24 — WORKFLOW-P4 (grill).** W11–W13 locked; `workflow-cursor-automations.md`.
- **2026-06-24 — WORKFLOW-P1.** Pocock adaptation: doc-as-controller, skills, auto-merge, mc scripts.
