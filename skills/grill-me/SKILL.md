---
name: grill-me
description: Forces alignment before planning — agent interviews the CEO one question at a time until shared understanding. Use for new programs, failed slices, or architecture decisions — not for routine AFK batches.
disable-model-invocation: true
---

# Grill-me (alignment)

## Claim the programme first — before you read anything

```bash
npm run mc:claim-planning -- --program <program>
```

| It prints | You do |
|---|---|
| `CLAIMED` | **Push that commit before you start writing.** A claim nobody can see is not a claim. |
| `REFUSE` | **Stop.** Another session is planning this. Say so and end the turn. |
| `SKIP` | No planning step pending — check you were sent to the right programme. |

Two sessions once planned the same programme in parallel and one whole session was discarded.
Canon: [`planning-chain.md`](../../../docs/rules/planning-chain.md).

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

## Closing this session

1. Docs-only PR → run the gate (`npm run mc:merge-verdict`) → **merge it yourself when green.**
   The CEO does not review planning documents.
2. **Then stop.** The merge launches the next session. Do **not** print the next prompt in chat, and do
   **not** create the session yourself — two launchers for one step is a duplicate the chain has already
   paid a session for.
3. The next prompt goes in the **PR body** only. `npm run mc:handoff -- <program>` is the manual cold
   start, for when a launch is missed or a person wants to run the step by hand.

Canon: [`planning-chain.md`](../../../docs/rules/planning-chain.md).


## Anti-patterns

- Jumping to implementation after one CEO message
- Writing slice IDs or §12 blocks during grill or PRD chat
- Technical jargon without one-line explanation
- Asking CEO to read code or diffs
