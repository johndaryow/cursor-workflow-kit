---
name: grill-me
description: Forces alignment before planning — agent interviews the CEO one question at a time until shared understanding. Use for new programs, failed slices, or architecture decisions — not for routine AFK batches.
disable-model-invocation: true
---

# Grill-me (alignment)

**When:** New program, failed AFK slice, architecture fork, before writing PRD.

**Not when:** Batch N+1, scripted verify-only work, or slice already in §12 with tags.

## Instructions

1. **Do not write production code** until CEO says "go" or planning phase completes.
2. Interview the CEO **one question at a time** — not a numbered list dump.
3. Include your **recommendation** on each question (CEO is non-developer — plain English).
4. Cover until satisfied (often 15–40 questions for medium depth; 40+ for new programs):
   - Goal and success in one sentence
   - Who uses it / who is blocked today
   - Edge cases and failure modes
   - Cost and scale (orders, artists, GB)
   - What we will **not** touch
   - Exit tests CEO can understand without code
   - Dependencies on other programs (PLATFORM sequencing)
5. When done, summarize **shared understanding** in 5 bullets and ask CEO to confirm.
6. When the CEO confirms, **write the grill artefact, merge it, and hand off** — see *Closing this session* below. Do not ask the CEO to compose the next prompt.
7. The chain is grill → PRD → slices → execution. `npm run mc:handoff -- <program>` always knows which one is next.

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

## Anti-patterns

- Jumping to implementation after one CEO message
- Writing slice IDs or §12 blocks during grill or PRD chat
- Technical jargon without one-line explanation
- Asking CEO to read code or diffs
