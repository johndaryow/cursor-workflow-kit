# Auto-merge policy (CEO non-developer)

> Always-on rule — import from root `CLAUDE.md`. Same policy as [`cursor/rules/auto-merge-policy.mdc`](../../cursor/rules/auto-merge-policy.mdc) — merge rules don't change by which agent is driving.

The CEO **does not review code or PR diffs**. For **AFK** slices with green exit tests, the **agent merges** after verification — CEO reads SESSION REPORT only.

## When agent MAY auto-merge

All required:

1. `AUTONOMY: AFK` on the slice
2. `MERGE_POLICY: auto_when_green`
3. Every slice exit test **PASS** (or documented pre-existing red with zero new failures)
4. Plain-English assurance in PR description
5. STATUS dashboard updated in PR
6. Not on HITL deny list below

**Command (after verify):**

```bash
npm run mc:auto-merge -- <pr-number>
```

Or `gh pr merge <n> --squash --delete-branch` when `gh` is authenticated. In Claude Code, use the GitHub MCP tools (`mcp__github__merge_pull_request`) if `gh` isn't available in the session.

## Planning PRs — the chain merges its own

A **docs-only** grill / PRD / slice-planning PR merges itself when green, with no CEO review. The
CEO was in the room for the grill; re-reading the write-up is not review.

Scope, conditions and the deny-list boundary: [`planning-chain-handoff.md`](./planning-chain-handoff.md).
The short version: **docs only**, gate run with `npm run mc:merge-verdict`, SESSION REPORT in the
body, STATUS updated in the same PR. One line outside `docs/` (plus the slice-id registry) and the
PR is back under the rules below.

## When agent MUST NOT auto-merge

- `AUTONOMY: HITL`
- `MERGE_POLICY: recommend_merge` or `do_not_merge`
- Any exit test FAIL introduced by this PR
- `CEO_GATE: explicit_ok_in_chat` not satisfied in chat/session history
- DNS, schema migration, first bulk apply, production deploy flip
- Agent is uncertain — **stop** and write SESSION REPORT with `Status: blocked`

## After auto-merge

Agent continues same session (do not stop at merge):

1. Scoped deploy per `scoped-deploy-and-hosting-preflight.mdc` (optional tier — see `MANIFEST.md`)
2. Spot-check per `agent-browser-spot-check.mdc` when UI/deploy touched (optional tier)
3. Update STATUS: `LAST_MERGED_PR`, clear `LAST_PR`, advance `AFK_QUEUE`
4. SESSION REPORT final section: `Merge: PR #n merged: yes (auto)`

## If the merge does not happen — this is the part that used to fail silently

On 2026-08-16 a finished, green AFK slice (FCN-5, PR #1734) simply did not merge. Nothing
recorded that. The dashboard said `BLOCKED_BY: none`, the queue looked empty, and the chain
appeared idle when it was in fact stalled behind work that was already done — its
`RALPH_RUNNING` claim never released. That cost over an hour.

**Not every venue can merge from a script.** Check yours first:

```bash
npm run mc:merge-capability
```

| Mode | What it means |
|------|---------------|
| `rest` | A real API token — `npm run mc:auto-merge -- <n>` merges. |
| `gh-cli` | `gh` authenticated — same command merges. |
| `mcp-handoff` | The script **cannot** merge here. You must. |

**Read the `WHY:` line before believing `mcp-handoff` (WORKFLOW-P27).** In a sandbox where all
egress goes through a proxy, Node's `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1`
is set at process start — so the token probe fails without ever reaching GitHub, and the venue
looks credential-less when its credential is fine. Every `mc:` script that calls the GitHub API
now sets that flag itself, so this should not recur; if you invoke one with bare `node`, set it
yourself. The probe now names this cause instead of blaming the token.

**On `mcp-handoff` the agent finishes the merge — it does not stop.** Fetch the PR and its
checks with the GitHub MCP tools, then feed them back through every gate rather than judging
by eye:

```bash
npm run mc:auto-merge -- <pr> --from-json /tmp/pr.json
```

Merge with `mcp__github__merge_pull_request` (squash) **only** if that prints `ALLOW`. The
gate is identical on both paths — the MCP path does the fetching, never the deciding.

**If you still cannot merge, say so where a human will see it. Never leave an open PR in
silence:**

```bash
npm run mc:merge-blocked -- --program <program> --pr <n> --reason "<why>"
```

That writes `BLOCKED_BY` into the STATUS dashboard and prints the SESSION REPORT lines to
use. `CEO action needed:` then names the one click. A stall a human can see is recoverable;
a silent one is not.

An hourly watch (`stale-green-pr-watch.yml`) also alarms on any AFK `auto_when_green` PR that
is green and older than 15 minutes. It is a backstop, not permission to skip the above.

## GitHub setup (CEO one-time)

For auto-merge to work on cloud sessions (Cursor Cloud **or** Claude Code on the web):

1. Add secret `GITHUB_TOKEN` (fine-grained or PAT) with **Contents + Pull requests** write on this repo
2. Or enable GitHub **auto-merge** + required checks on `main`
3. Re-save the environment/secrets config for whichever cloud agent you're using after adding the secret (Cursor Environment snapshot, or Claude Code environment settings)

If `gh` or token missing: fall back to `Recommend: merge PR #n now` in SESSION REPORT — CEO one button.

## Pushback (intentional safety)

Auto-merge is **not** "YOLO." It replaces CEO merge clicks for **repeatable, tested slices** only. HITL gates stay human forever, no matter which agent is executing.

Same deny list as above (never DNS/schema/first bulk apply via auto-merge) — enforced identically whether the slice runs in Cursor or Claude Code.
