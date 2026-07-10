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

## GitHub setup (CEO one-time)

For auto-merge to work on cloud sessions (Cursor Cloud **or** Claude Code on the web):

1. Add secret `GITHUB_TOKEN` (fine-grained or PAT) with **Contents + Pull requests** write on this repo
2. Or enable GitHub **auto-merge** + required checks on `main`
3. Re-save the environment/secrets config for whichever cloud agent you're using after adding the secret (Cursor Environment snapshot, or Claude Code environment settings)

If `gh` or token missing: fall back to `Recommend: merge PR #n now` in SESSION REPORT — CEO one button.

## Pushback (intentional safety)

Auto-merge is **not** "YOLO." It replaces CEO merge clicks for **repeatable, tested slices** only. HITL gates stay human forever, no matter which agent is executing.

Same deny list as above (never DNS/schema/first bulk apply via auto-merge) — enforced identically whether the slice runs in Cursor or Claude Code.
