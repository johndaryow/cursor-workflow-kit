---
name: grill-me
description: Forces alignment before planning — agent interviews the CEO one question at a time until shared understanding. Use for new programs, failed slices, or architecture decisions — not for routine AFK batches.
disable-model-invocation: true
---

# Grill-me (alignment)

**When:** New program, failed AFK slice, architecture fork, before writing PRD.

**Not when:** S6b batch N+1, scripted verify-only work, or slice already in §12 with tags.

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
6. **Next step (new chat):** `planning-session` skill → **PRD only** — no slices.
7. **After PRD merges (another new chat):** `slice-planning` skill → tracer bullets + Ralph wiring.

## Anti-patterns

- Jumping to implementation after one CEO message
- Writing slice IDs or §12 blocks during grill or PRD chat
- Technical jargon without one-line explanation
- Asking CEO to read code or diffs
