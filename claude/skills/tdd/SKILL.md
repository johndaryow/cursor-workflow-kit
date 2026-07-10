---
name: tdd
description: Test-driven development for agent implementation — red, green, refactor at small granularity. Use when slice changes logic, not for script-only migration batches.
---

# TDD (agent)

## Cycle

1. **Red** — one failing test or scripted check that captures the requirement
2. **Green** — minimal code to pass
3. **Refactor** — clean up without changing behavior
4. Repeat small — not 20 tests then impl

## This repo

| Change type | Test home |
|-------------|-----------|
| Shared TS logic | `vitest` next to file or `packages/` |
| Edge function shared | `supabase/functions/_shared/*.test.ts` |
| Migration batch | Script dry-run + inventory — not unit tests |
| UI | soak scripts + preview |

## Pre-existing reds

`npm test` has known failures (paper/jsdom). Do not introduce **new** failures. State pre-existing in SESSION REPORT.

For full build: `tsc -b && npm run build` passes; `npm run build:check` may fail audit gate — note in report if slice didn't touch UI primitives.
