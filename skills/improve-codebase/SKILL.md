---
name: improve-codebase
description: Architecture planning — deep modules, shallow module fixes, codebase health. Use in planning phase only, not mid-AFK slice.
---

# Improve codebase

**Planning / refactor slices only** — not during scripted migration batches.

## Deep modules (Pocock / Ousterhout)

- Simple interface, hide complexity inside
- Test at interface boundary
- Agents navigate easier

## When CEO asks to improve architecture

1. Explore codebase — find shallow modules (leaky, tangled)
2. Propose wrap behind clearer interface
3. CEO grill on scope — `grill-me` if large
4. Slice into vertical refactor PRs — tag HITL unless tiny

## Do not

- Refactor drive-by during AFK migration slice
- Rewrite without exit tests and parity scripts
