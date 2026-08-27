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

## "Green" changed meaning on 2026-08-26

A pull request no longer runs the fourteen checks — `npm run preflight` did, in the session, on the
same commit ([`preflight.md`](./preflight.md)). So on a PR, **green means preflight was green and a
fresh critic said MEETS** ([`critic.md`](./critic.md)), both recorded in the PR body.

`main-guard` then re-runs preflight on `main` after the squash, on a clean machine — because a
squash produces a tree no PR run ever tested. A PR carrying no checks is now **normal**, not a
refusal; `--wait` still applies to the checks that do exist.

## May auto-merge — all of these

1. `AUTONOMY: AFK` on the slice
2. `MERGE_POLICY: auto_when_green`
3. Every exit test PASS (or a documented pre-existing red with zero new failures)
4. Plain-English assurance in the PR body, **including the preflight counts and the critic's verdict**
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

**This sentence used to be in front of every agent, and stopped being.** Until 2026-08-26 it lived in
an always-on rule under the heading *After auto-merge*, opening `Agent continues same session (do not
stop at merge)`. The one-rulebook change moved it here — a page opened BEFORE a merge and seldom
after one. Measured on 2026-08-27: four slices merged green promising a production deploy, and the
live app was older than all four. Nothing went red, because the field promising the deploy was read
by no code anywhere. So the check belongs to the machine, not to this paragraph: where the repo has
a deploy-debt check, it must say **none owed** before the session stops, and where the answer is
"not yet", the reason goes in that programme's own `DEPLOY_AFTER_MERGE`. A skipped deploy is allowed
to be a decision; it is never allowed to be silence
([history](./history.md#the-deploy-nobody-was-asking-about)).

## Related

[`reporting.md`](./reporting.md) · [`planning-chain.md`](./planning-chain.md) · [`history.md`](./history.md)
