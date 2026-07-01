---
name: slice-planning
description: After PRD merged — break PRD into Ralph-ready tracer-bullet vertical slices (Pocock /to-issues). Quiz CEO on granularity; wire §12 + STATUS. New chat only.
disable-model-invocation: true
---

# Slice planning (Pocock /to-issues · Ralph-ready)

**When:** PRD merged (or CEO says “plan slices for {PROGRAM}”) — **fresh chat**, not the PRD chat.

**Not when:** Writing PRD, executing a slice, or S6b batch N+1.

## Read first

1. Canonical PRD (`docs/projects/{PROGRAM}_PRD.md` or linked path)
2. Program master doc stub (create/update `{program}-master.md`)
3. [`hitl-afk-slices.mdc`](../../rules/hitl-afk-slices.mdc)
4. Reference format: [`fm-master.md`](../../docs/projects/fm-master.md) §4, §11, §12
5. Explore codebase — prefactor opportunities; “make the change easy, then make the easy change”

## Vertical slices (tracer bullets)

Each slice is a **thin path through every layer** — schema/API/UI/tests — leaving something **demoable or verifiable**.

| ❌ Horizontal (reject) | ✅ Tracer bullet |
|------------------------|------------------|
| “All schema migrations” | “Content Library rows live on R2 + client reads CDN” |
| “All Realtime subs refactor” | “Open DS panels without channel flood — proof on PP37937” |
| Phase A / Phase B tables in PRD | End-to-end user outcome per slice |

**Sizing:** one agent session ≈ one slice · ~100–400 LOC target · split if bigger.

## Quiz CEO (required before writing §12)

Present a **numbered draft** — for each slice:

- **Title** — short tracer bullet (user outcome)
- **Blocked by** — prior slice ids or “none”
- **User stories covered** — from PRD
- **AUTONOMY / CEO_GATE / MERGE_POLICY** — see tag defaults below

Ask:

1. Granularity — too coarse / too fine?
2. Dependencies — correct order?
3. Merge or split any slices?

**Iterate until CEO approves.** Do not write §12 machine blocks before approval.

## Tag defaults (this repo)

| Pattern | AUTONOMY | CEO_GATE | MERGE_POLICY |
|---------|----------|----------|--------------|
| S6b firebase-storage batch | AFK | none | auto_when_green |
| Scripted verify / inventory dry-run | AFK | none | auto_when_green |
| Worker callable retirement + soak | HITL | recommend_merge | recommend_merge |
| DNS / Pages cutover | HITL | explicit_ok_in_chat | do_not_merge |
| Supabase schema migration apply | HITL | explicit_ok_in_chat | recommend_merge |
| First bulk `--apply` on new pattern | HITL | explicit_ok_in_chat | do_not_merge |
| New UI panel | HITL or AFK | per preview | recommend_merge or auto_when_green |
| Vendor billing cancel | HITL | human_only | — |

Every §12 block must include at top:

```text
AUTONOMY: AFK | HITL
CEO_GATE: none | merge_only | explicit_ok_in_chat | human_only
MERGE_POLICY: auto_when_green | recommend_merge | do_not_merge
EST_COST: <plain English>
ON_SUCCESS: <next machine slice id> | none | <terminal label>
ON_FAIL: stop — do not advance queue
```

## Ralph-ready deliverables (same PR)

### 1. Master doc

- **STATUS DASHBOARD** — `AFK_QUEUE`, `NEXT_PROMPT`, `CHAT_RENAME`, `ACTIVE_PROGRAM`
- **Tracer bullet table** — machine ids, goals, tags, `ON_SUCCESS`
- **Rejected horizontal** table (optional but recommended)
- **§12 blocks** under `### {ID} — title` headers:
  - **First slice only:** full executor prompt
  - **Next 1–2 slices:** tags + exit test summary (expand when prior merges)
  - **Rest:** titles + tags until active
- **`Rename this chat to:`** line per slice (for `agent-chat-session.mdc`)
- **§11 Ralph loop** section when serial chain (copy FM pattern)

### 2. Machine slice IDs

Must match `scripts/ralph-master-registry.mjs` patterns, e.g.:

`FM-0`, `RTE-F1`, `W18`, `RH13`, `CDRIVE-0`, `CM2`, `DLM-5`, `S6b-F7`

### 3. Register in platform §9 if new program

### 4. Verify before CEO says “start slice 1”

```bash
npm run test:ralph-chain
```

Fix registry gaps before merge.

## Planning PR closeout

- SESSION REPORT: `Slice: {PROGRAM} slice planning` (human label — **not** `FM-0`)
- Title: `docs({PROGRAM}): vertical slices — tracer bullets`
- Ralph **notify only** on this merge — never false-chain to slice 1

## After merge

CEO or Ralph cold-start: `Start {first-slice-id}` or `npm run mc:opener -- {program}`

Execution: `afk-slice` skill — one fresh agent per slice.

## Model

Opus · Plan · fresh chat. Composer OK for straightforward program follow-ons.
