#!/usr/bin/env node
/**
 * guard-scope.mjs — what has the merge guard actually VERIFIED, and what has it only appeared to?
 *
 * `main-guard` is the only venue that ever tests the squashed tree. It is allowed one shortcut: a
 * docs-only merge cannot break the build, so it skips the suite and reports in ~18 seconds. That
 * shortcut is worth keeping, and on 2026-08-27 it reported a pass for a tree nothing had run.
 *
 * ── WHAT HAPPENED (WORKFLOW-P41, found on the merged tree) ────────────────────────────────────
 *
 * WORKFLOW-P41 merged as two commits, a minute apart, in the order the rulebook prescribes: the
 * code, then `chore(status)` on the master doc. Three things then combined:
 *
 *   1. `concurrency: cancel-in-progress` CANCELLED the code merge's run when the docs merge
 *      landed behind it. Correct economics on its own — only the newest `main` matters, and the
 *      newest tree contains the older one.
 *   2. The superseding run asked "is there any code in THIS merge?" and compared
 *      `github.event.before`..`github.sha` — the previous PUSH, i.e. the code commit. The docs
 *      commit alone. Answer: no code. Skipped.
 *   3. A manual re-run made it worse. On `workflow_dispatch` there is no `event.before` at all,
 *      so the shell fell through to `git diff HEAD~1 HEAD` — the docs commit again. Green in 18
 *      seconds, and indistinguishable from a full pass on the runs list.
 *
 * The code was never tested by the guard. Nothing was red. Nothing was even quiet — it was a
 * confident green tick against a tree no venue had run. (P41 was verified in-session instead,
 * which is why the finding is written down and not a story about a broken `main`.)
 *
 * ── THE FIX, AND WHY IT IS A BASE AND NOT A FLAG ──────────────────────────────────────────────
 *
 * The previous push is the wrong base whenever the run for it did not finish. The right base is
 * THE LAST COMMIT THIS GUARD ACTUALLY FINISHED VERIFYING — which the guard already publishes, in
 * its own run history: the head sha of its most recent SUCCESSFUL run on this branch.
 *
 * A cancelled run is not a success, so its commit is not a base, so the responsibility for that
 * code transfers to the next run rather than dying with the cancelled one. That is what makes
 * `cancel-in-progress` safe to keep: the newest run now measures back to the last proven tree, so
 * cancelling an older run costs runner minutes and never coverage.
 *
 * A successful SKIP counts as verified too, and that is not a loophole — it is induction. A skip
 * says "nothing between the verified base and here is code", so its head is code-equivalent to a
 * tree that really was tested. The chain only holds because every link measured from the last
 * proven one, which is precisely what the old shell did not do.
 *
 * ── THE THREE RULES THAT KEEP IT HONEST ───────────────────────────────────────────────────────
 *
 *   NOT KNOWING IS NEVER A SKIP. No token, an API that answers 500, a first run with no history,
 *   a base that is not an ancestor of HEAD after a force-push: every one of them runs the whole
 *   suite. The expensive answer is the safe one, and this file's entire subject is the cost of a
 *   green tick that means "I could not tell".
 *
 *   A PERSON ASKING IS ALWAYS A RUN. `workflow_dispatch` runs everything, unconditionally. Nobody
 *   dispatches this workflow to be told the tree was fine yesterday, and the 18-second pass above
 *   was a dispatch. There is no base worth computing for a human who pressed the button.
 *
 *   SUCCESS, NOT COMPLETION. `cancelled`, `failure`, `timed_out` and `skipped` runs are not bases.
 *   A red run means the tree is unproven, so the next merge re-measures across it.
 *
 * Usage:
 *   node scripts/guard-scope.mjs                 # writes code/base/reason to $GITHUB_OUTPUT
 *   node scripts/guard-scope.mjs --explain       # same decision, human output, no side effects
 *
 * Reads GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_EVENT_NAME, GITHUB_SHA, GITHUB_TOKEN.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

/**
 * A path that cannot change what the suite tests.
 *
 * Deliberately identical to the rule the shell carried — `docs/` and any markdown file — so this
 * slice changes WHERE the range starts and nothing about what counts as code. Everything else is
 * code, including `.github/workflows/`, `package.json` and this file: a workflow edit is exactly
 * the kind of change that deserves the run it is trying to skip.
 */
export function isCodePath(path) {
  const p = String(path || '').trim();
  if (!p) return false;
  return !/^docs\//.test(p) && !/\.md$/i.test(p);
}

export function hasCode(paths) {
  return paths.some(isCodePath);
}

/**
 * The newest verified sha that this checkout can actually measure from.
 *
 * Runs are newest-first. A sha that is not an ancestor of HEAD is not a base — it is history from
 * a force-push, another branch, or a checkout too shallow to hold it — so the search continues
 * past it rather than handing `git diff` a range that means nothing.
 */
export function pickBase(shas, isAncestor) {
  for (const sha of shas) {
    if (sha && isAncestor(sha)) return sha;
  }
  return null;
}

/**
 * The whole decision, with no I/O in it so every branch is testable.
 *
 * @returns {{code: boolean, reason: string, base: string|null}}
 */
export function decideScope({ event, base, changed }) {
  if (event === 'workflow_dispatch') {
    return { code: true, reason: 'a person asked for this run — the suite runs, always', base: null };
  }
  if (!base) {
    return {
      code: true,
      reason: 'no verified base — this guard cannot name a tree it has proven, so it proves this one',
      base: null,
    };
  }
  if (hasCode(changed)) {
    return { code: true, reason: `code changed since ${base.slice(0, 7)}, the last tree this guard verified`, base };
  }
  return {
    code: false,
    reason: `docs only since ${base.slice(0, 7)}, the last tree this guard verified — the suite is skipped, and this check still reports`,
    base,
  };
}

/** GitHub REST, with every failure answered by `null` — the caller turns that into a full run. */
async function api(url, token, fetchImpl) {
  try {
    const res = await fetchImpl(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Every head sha this workflow has finished successfully on this branch, newest first.
 *
 * The current run is excluded by id as well as by status. Status alone is enough today — a run
 * asking this question is still in progress — but "the run that is asking cannot be its own proof"
 * is the invariant, and an invariant that holds by accident is one mutation away from not holding.
 */
export async function verifiedShas({ repo, runId, token, branch, fetchImpl = globalThis.fetch }) {
  if (!repo || !runId || !token) return [];
  const self = await api(`https://api.github.com/repos/${repo}/actions/runs/${runId}`, token, fetchImpl);
  if (!self?.workflow_id) return [];
  const onBranch = branch || self.head_branch;
  if (!onBranch) return [];
  const runs = await api(
    `https://api.github.com/repos/${repo}/actions/workflows/${self.workflow_id}/runs` +
      `?branch=${encodeURIComponent(onBranch)}&status=success&per_page=100&exclude_pull_requests=true`,
    token,
    fetchImpl,
  );
  return (runs?.workflow_runs ?? [])
    .filter((r) => String(r.id) !== String(runId) && r.conclusion === 'success')
    .map((r) => r.head_sha)
    .filter(Boolean);
}

export function gitIsAncestor(sha, head = 'HEAD') {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, head], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function gitChangedFiles(base, head = 'HEAD') {
  try {
    return execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' })
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Wire the three questions together. A `changed` of `null` — git could not walk the range — is an
 * unknown, and unknowns run the suite; it must never read as an empty diff.
 */
export async function resolveScope({
  event = process.env.GITHUB_EVENT_NAME,
  repo = process.env.GITHUB_REPOSITORY,
  runId = process.env.GITHUB_RUN_ID,
  token = process.env.GITHUB_TOKEN,
  branch = process.env.GITHUB_REF_NAME,
  head = process.env.GITHUB_SHA || 'HEAD',
  isAncestor = gitIsAncestor,
  changedFiles = gitChangedFiles,
  listVerified = verifiedShas,
} = {}) {
  if (event === 'workflow_dispatch') return decideScope({ event, base: null, changed: [] });
  const shas = await listVerified({ repo, runId, token, branch });
  const base = pickBase(shas, (sha) => isAncestor(sha, head));
  if (!base) return decideScope({ event, base: null, changed: [] });
  const changed = changedFiles(base, head);
  if (changed === null) {
    return {
      code: true,
      reason: `cannot read the range ${base.slice(0, 7)}..HEAD — an unreadable diff is not an empty one`,
      base,
    };
  }
  return { ...decideScope({ event, base, changed }), changed };
}

/**
 * A scope step that throws has decided nothing, and there are only two ways to report that.
 *
 * Red is the loud one and it is the wrong one: an unreadable run history, a runner too old for a
 * global `fetch`, a git that will not answer — none of those is a broken build, and a guard that
 * cries "broken" for infrastructure is a guard people learn to re-run without reading
 * (WORKFLOW-P40). Running the whole suite says the same thing at the only honest cost: minutes.
 *
 * Exported so the fallback can be tested by a resolver that throws. It was inlined in `main` at
 * first, which made the one branch that must never be wrong the one branch nothing could reach.
 *
 * The single failure that still exits non-zero is a decision nothing can read — see `main`.
 */
export async function decideOrRunEverything(resolve = resolveScope) {
  try {
    return await resolve();
  } catch (err) {
    return {
      code: true,
      reason: `the scope could not be decided (${err?.message ?? err}) — so the suite runs`,
      base: null,
    };
  }
}

async function main() {
  const decision = await decideOrRunEverything();
  const changed = decision.changed ?? [];
  console.log(`main guard scope: ${decision.code ? 'RUN THE SUITE' : 'skip'} — ${decision.reason}`);
  if (changed.length) {
    console.log(`  ${changed.length} file(s) changed since the last verified tree:`);
    for (const f of changed.slice(0, 40)) console.log(`    ${f}`);
    if (changed.length > 40) console.log(`    …and ${changed.length - 40} more`);
  }
  if (process.argv.includes('--explain')) return;
  const out = process.env.GITHUB_OUTPUT;
  if (!out) {
    console.error('GITHUB_OUTPUT is not set — refusing to decide a scope nothing can read.');
    process.exit(2);
  }
  appendFileSync(
    out,
    `code=${decision.code}\nbase=${decision.base ?? ''}\nreason=${decision.reason}\n`,
  );
}

if (process.argv[1] && process.argv[1].endsWith('guard-scope.mjs')) {
  await main();
}
