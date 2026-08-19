---
name: slice-planning
description: After PRD merged — break PRD into chain-ready tracer-bullet vertical slices (Pocock /to-issues). Quiz CEO on granularity; wire §12 + STATUS. New session only.
disable-model-invocation: true
---

# Slice planning (Pocock /to-issues · chain-ready)

**When:** PRD merged (or CEO says "plan slices for {PROGRAM}") — **fresh session**, not the PRD session.

**Not when:** Writing PRD, executing a slice, or batch N+1.

## Read first

1. Canonical PRD (`docs/projects/{PROGRAM}_PRD.md` or linked path)
2. Program master doc stub (create/update `{program}-master.md`)
3. [`hitl-afk-slices.md`](../../rules/hitl-afk-slices.md)
4. Reference format: `fm-master.md` §4, §11, §12
5. Explore codebase — prefactor opportunities; "make the change easy, then make the easy change"

## Vertical slices (tracer bullets)

Each slice is a **thin path through every layer** — schema/API/UI/tests — leaving something **demoable or verifiable**.

| ❌ Horizontal (reject) | ✅ Tracer bullet |
|------------------------|------------------|
| "All schema migrations" | "Content Library rows live on R2 + client reads CDN" |
| "All Realtime subs refactor" | "Open DS panels without channel flood — proof on PP37937" |
| Phase A / Phase B tables in PRD | End-to-end user outcome per slice |

**Sizing:** one agent session ≈ one slice · ~100–400 LOC target · split if bigger.

## Quiz CEO (required before writing §12)

Present a **numbered draft** — for each slice:

- **Title** — short tracer bullet (user outcome)
- **Blocked by** — prior slice ids or "none"
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
| Scripted storage/migration batch | AFK | none | auto_when_green |
| Scripted verify / inventory dry-run | AFK | none | auto_when_green |
| Callable retirement + soak | HITL | recommend_merge | recommend_merge |
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

## Chain-ready deliverables (same PR)

### 1. Master doc

- **STATUS DASHBOARD** — `AFK_QUEUE`, `NEXT_PROMPT`, `CHAT_RENAME`, `ACTIVE_PROGRAM`
- **Tracer bullet table** — machine ids, goals, tags, `ON_SUCCESS`
- **Rejected horizontal** table (optional but recommended)
- **§12 blocks** under `### {ID} — title` headers:
  - **First slice only:** full executor prompt
  - **Next 1–2 slices:** tags + exit test summary (expand when prior merges)
  - **Rest:** titles + tags until active
- **`Rename this chat to:`** line per slice (for `agent-chat-session.md`)
- **§11 loop** section when serial chain (copy FM pattern)

### 2. Machine slice IDs

Must match `scripts/ralph-master-registry.mjs` patterns, e.g.:

`FM-0`, `RTE-F1`, `W18`, `RH13`, `CDRIVE-0`, `CM2`, `DLM-5`, `S6b-F7`

### 3. Register in platform §9 if new program

### 4. Verify before CEO says "start slice 1"

```bash
npm run test:ralph-chain
```

Fix registry gaps before merge.

## Planning PR closeout

- SESSION REPORT: `Slice: {PROGRAM} slice planning` (human label — **not** `FM-0`)
- Title: `docs({PROGRAM}): vertical slices — tracer bullets`
- Chain **notify only** on this merge — never false-chain to slice 1

## After merge

Planning is complete, so `npm run mc:handoff -- {program}` now points at **execution** and defers to
`npm run mc:opener -- {program}` for that prompt. CEO or chain cold-start: `Start {first-slice-id}`.

Execution: `afk-slice` skill — one fresh agent session per slice (works from either Cursor or Claude Code — same STATUS dashboard).

## Closing this session (do not leave it to the CEO)

Canon: [`planning-chain-handoff.md`](../../rules/planning-chain-handoff.md).

1. Docs-only PR → run the gate (`npm run mc:merge-verdict`) → **merge it yourself when green.**
   The CEO does not review planning documents.
2. `npm run mc:handoff -- <program>` — prints the next step's prompt, derived from the master doc's
   `GRILL:` / `PRD:` / `SLICING:` lines. It **refuses** if the doc the next session must read is not
   on `origin/main` yet; that refusal is the point, so fix the merge rather than the prompt.
3. Offer to start the next session with `create_session` (ask once per conversation), or give the
   CEO the prompt in one copyable block.
4. Last line of the SESSION REPORT: `Next: <step> — <one sentence>. Prompt: npm run mc:handoff -- <program>`

## Model

Opus · fresh session. Sonnet is fine for straightforward program follow-ons.
