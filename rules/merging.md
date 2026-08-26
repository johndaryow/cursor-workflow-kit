> On-demand rule. One copy, read by Claude Code, Cursor and Codex. Index: [`AGENTS.md`](../../AGENTS.md).

# Merging

The CEO does not review code or PR diffs. An **AFK** slice with green exit tests is merged by the
agent; the CEO reads the SESSION REPORT only.

## The command

```bash
npm run mc:auto-merge -- <pr-number> --wait 15
```

**Always pass `--wait`.** A pull request reports *zero* checks for the first seconds of its life, and
zero checks is a refusal by design. `--wait` polls every 20s and then falls through to the same gate —
it re-reads, it never re-judges. Red ends the wait immediately. A timeout is a refusal, never a pass.
`--wait` with `--from-json` is refused outright, because supplied data cannot change.

**Never hand-roll a loop that waits for CI.** One improvised `until` loop idled a session for an hour
on a PR whose four checks went green in 49 seconds ([history](./history.md#the-hour-spent-waiting-for-a-green-pr)).

`npm run mc:merge-verdict -- <n>` **does not fetch that PR.** It judges only checks handed to it on
stdin or `--file`. Use `mc:auto-merge` when you want fetching.

## May auto-merge — all of these

1. `AUTONOMY: AFK` on the slice
2. `MERGE_POLICY: auto_when_green`
3. Every exit test PASS (or a documented pre-existing red with zero new failures)
4. Plain-English assurance in the PR body
5. STATUS updated in the same PR
6. Not on the stop list

## Must not auto-merge

- `AUTONOMY: HITL`, or `MERGE_POLICY: recommend_merge` / `do_not_merge`
- Any exit test this PR made fail
- `CEO_GATE: explicit_ok_in_chat` not satisfied in this session
- Anything on the stop list in [`AGENTS.md`](../../AGENTS.md): DNS, schema migration, first bulk apply,
  production deploy flip, credentials
- **You are uncertain** — stop and write `Status: blocked`

## Planning PRs merge themselves

A **docs-only** grill / PRD / slice-planning PR merges itself when green, no CEO review. Scope and
conditions: [`planning-chain.md`](./planning-chain.md). One line outside `docs/` and it is back under
the rules above.

## When the merge cannot happen

Check the venue first — not every one can merge from a script:

```bash
npm run mc:merge-capability
```

| Mode | Meaning |
|------|---------|
| `rest` | Real API token — the command above merges. |
| `gh-cli` | `gh` authenticated — same. |
| `mcp-handoff` | The script cannot merge here. You finish it. |

**Read the `WHY:` line before believing `mcp-handoff`.** Behind a proxy, Node's `fetch` ignores
`HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is set at process start, so the token probe can fail
without ever reaching GitHub. Every `mc:` script sets that itself; set it yourself if you invoke one
with bare `node`.

On `mcp-handoff` the agent finishes the merge — it does not stop. Fetch the PR and its checks with the
GitHub tools, then feed them back through the gate rather than judging by eye:

```bash
npm run mc:auto-merge -- <pr> --from-json /tmp/pr.json
```

Merge (squash) **only** if that prints `ALLOW`. The gate is identical on both paths — the MCP path
does the fetching, never the deciding.

Still cannot merge? Say so where a human will see it. **Never leave an open PR in silence:**

```bash
npm run mc:merge-blocked -- --program <program> --pr <n> --reason "<why>"
```

## The backstop covers two kinds of PR

`stale-green-pr-watch.yml` merges what the rules allow, then alarms on the rest.

The slice rules decline two classes on the way — `no slice id` and `maintenance / doc-only`. Both
refusals are correct **about chaining** and were once used as the **merge** test, so a green PR sat
unmerged for eighteen hours while the alarm reported OK
([history](./history.md#the-pr-the-alarm-could-not-see)).

A **standalone** PR is now also merged when it is green, past grace, not draft, mergeable, and **its own
body says `auto-merge when green`**. It never dispatches the chain. It fails closed three ways: silence
is not consent; any human gate in the body wins; a real slice id sends it back to the slice path. A
`BLOCKED_BY` quoted as context is **not** a gate.

## After merging

Do not stop at the merge. Scoped deploy → spot-check when UI/deploy was touched → STATUS updated →
`Merge: PR #n merged: yes (auto)` in the report.

## Related

[`reporting.md`](./reporting.md) · [`planning-chain.md`](./planning-chain.md) · [`history.md`](./history.md)
