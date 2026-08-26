> On-demand rule. One copy, read by Claude Code, Cursor and Codex. Index: [`AGENTS.md`](../../AGENTS.md).

# Cost estimate before high-spend actions

**Read this file** when you are about to **run, deploy, or recommend** any action below. Do **not** execute until the CEO has seen the estimate (unless they already said "go", "apply", "upgrade", or "deploy it" in this thread for that exact action).

## Triggers (relevant actions only)

| Action | Examples |
|--------|----------|
| **Supabase bulk writes** | `scripts/backfill-*.mjs --apply`, row-by-row patches on `orders` / `order_items` / `job_orders` (realtime tables) |
| **Large Firestore reads/writes** | Backfills, full-collection scans, new unbounded listeners |
| **Vendor plan / quota** | Supabase Free → Pro, enabling PITR, raising limits |
| **Always-on infra** | Cloud Functions / Run `minInstances > 0`, new schedulers, new Gen2 trigger fan-out |
| **New realtime on hot tables** | Subscriptions on tables with bulk updates (orders, order_items, job_orders) |
| **AI at scale** | Batch AI jobs across many projects without per-run caps |
| **Destructive / wide deploys** | Full `firebase deploy` when a scoped deploy suffices |

Skip for: cosmetic UI, docs-only, unit tests, single-row edits, scoped hosting deploy after `build:check`.

## Required output (CEO-friendly, before you run it)

Use this block **once**, plain English, numbers where possible:

```
**Cost check** (before we run this)

- **What:** [one sentence]
- **One-time:** [e.g. "~3 GB egress if 5 tabs open during backfill" or "none"]
- **Monthly:** [e.g. "+$25 Supabase Pro" or "~$0 steady state"]
- **Worst case:** [what could surprise them]
- **Cheaper option:** [dry-run, scoped deploy, batch SQL, run after hours, close boards]
- **Recommendation:** [go / wait / do cheaper option first]
```

Then **stop and offer a button** — do not run `--apply`, upgrade, or full deploy until they confirm.

## Quick reference

Fill in your program's real numbers here (Supabase/Firestore free-tier limits, known spike history, cost log path) — see the Cursor-side file for the Perfect Presents-specific example.

## After a spike or optimization

Log meaningful outcomes in your cost optimization log in the same task when spend behavior changed.
