#!/usr/bin/env node
/**
 * guard-scope.test.mjs — the suite for the shortcut that reported a pass on an untested tree.
 *
 * `main-guard` may skip its suite on a docs-only merge. On 2026-08-27 that shortcut went green in
 * 18 seconds for a merge whose code had never been run: the code merge's own run was cancelled by
 * the `chore(status)` merge behind it, and the run that replaced it measured only the last commit.
 *
 * Every test here exists because getting one of these wrong reproduces that: a green tick that
 * means "I did not look". The three that matter most:
 *
 *   - THE CANCELLED RUN (`the tree a cancelled run left behind…`). This is the bug, in full. It
 *     fails the moment the base goes back to being the previous push instead of the last verified
 *     tree.
 *   - NOT KNOWING IS NEVER A SKIP. No token, a dead API, no history, an unreadable range — four
 *     tests, all asserting the expensive answer.
 *   - THE WIRING. A perfect decision that the workflow does not consult is worth nothing; the last
 *     test reads `main-guard.yml` itself, because that is the mutation nothing else here catches.
 *
 * No network, no git, no side effects: every dependency is injected.
 *
 * Usage: npm run test:guard-scope
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  decideOrRunEverything,
  decideScope,
  hasCode,
  isCodePath,
  pickBase,
  resolveScope,
  verifiedShas,
} from './guard-scope.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The kit holds this workflow under `optional/`; a repo holds the installed copy. */
function mainGuardPath() {
  const inKit = join(ROOT, 'optional', 'github-workflows', 'main-guard.yml');
  return existsSync(inKit) ? inKit : join(ROOT, '.github', 'workflows', 'main-guard.yml');
}

/** A fetch that answers the two endpoints and records what it was asked. */
function fakeGitHub({ runsById = {}, runsByWorkflow = {}, fail = false } = {}) {
  const asked = [];
  const fn = async (url) => {
    asked.push(url);
    if (fail) throw new Error('network');
    const byId = /\/actions\/runs\/(\d+)$/.exec(url);
    if (byId) {
      const body = runsById[byId[1]];
      return body ? { ok: true, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
    }
    const byWorkflow = /\/actions\/workflows\/(\d+)\/runs/.exec(url);
    if (byWorkflow) {
      const body = runsByWorkflow[byWorkflow[1]];
      return body ? { ok: true, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  fn.asked = asked;
  return fn;
}

test('docs are docs, and everything else is code', () => {
  assert.equal(isCodePath('docs/projects/workflow-master.md'), false);
  assert.equal(isCodePath('README.md'), false);
  assert.equal(isCodePath('docs/rules/preflight.md'), false);
  // A picture inside docs/ still cannot change what the suite tests.
  assert.equal(isCodePath('docs/img/board.png'), false);
  assert.equal(isCodePath('src/app.tsx'), true);
  assert.equal(isCodePath('package.json'), true);
  // The workflow that decides this, and the script it calls, are code. A change to either is
  // exactly the change that must not be allowed to skip its own verification.
  assert.equal(isCodePath('.github/workflows/main-guard.yml'), true);
  assert.equal(isCodePath('scripts/guard-scope.mjs'), true);
  // Anchored: a `docs/` further down the tree is not this repo's docs directory.
  assert.equal(isCodePath('src/docs/loader.ts'), true);
  assert.equal(hasCode(['docs/a.md', 'b.md']), false);
  assert.equal(hasCode(['docs/a.md', 'src/b.ts']), true);
});

test('a person asking is always a run, and it never even asks for a base', async () => {
  // The 18-second pass was a `workflow_dispatch`. Nobody dispatches this workflow to be told the
  // tree was fine yesterday.
  let asked = false;
  const d = await resolveScope({
    event: 'workflow_dispatch',
    listVerified: async () => {
      asked = true;
      return ['deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'];
    },
    changedFiles: () => [],
  });
  assert.equal(d.code, true);
  assert.match(d.reason, /a person asked/);
  assert.equal(asked, false, 'a dispatch must not depend on run history being readable');
});

test('the tree a cancelled run left behind is measured by the run that replaced it', async () => {
  // THE BUG, IN FULL (WORKFLOW-P41, 2026-08-27).
  //
  //   sha0  last tree main-guard actually verified
  //   sha1  the code merge — its run was CANCELLED by the push below
  //   sha2  chore(status), docs only — HEAD
  //
  // Measured against the previous push (sha1..sha2) the answer is "docs only", and the code at
  // sha1 is never run by any venue. Measured against the last VERIFIED tree it is code, and the
  // run that superseded the cancelled one inherits its job.
  const ranges = [];
  const d = await resolveScope({
    event: 'push',
    head: 'sha2',
    listVerified: async () => ['sha0'],
    isAncestor: () => true,
    changedFiles: (base, head) => {
      ranges.push([base, head]);
      return base === 'sha0'
        ? ['src/feature.ts', 'docs/projects/workflow-master.md']
        : ['docs/projects/workflow-master.md'];
    },
  });
  assert.deepEqual(ranges, [['sha0', 'sha2']], 'the base must be the last verified tree, never the previous push');
  assert.equal(d.code, true);
  assert.match(d.reason, /code changed since sha0/);
});

test('replay: the real 2026-08-27 runs, decided again', async () => {
  // Not a story about the bug — the bug's own data, read back off the runs list on 2026-08-27 and
  // pushed through the new decision. Everything here is measured; nothing is invented.
  //
  //   33062548978  push      e798db73  WORKFLOW-P41, the code      CANCELLED  10:19:45 → 10:21:03
  //   33062639475  push      80b9a429  chore(status), docs only    success    10:20:57 → 10:21:16
  //   33062702041  dispatch  80b9a429  a human re-run              success    10:21:48 → 10:22:06
  //
  // Nineteen seconds, then eighteen. The last success BEFORE all this was 5996ed2f (FTAG-4, 08:34)
  // and `git diff 5996ed2f 80b9a429` is eleven files — among them `scripts/preflight.mjs`,
  // `package.json` and `scripts/deploy-owed-check.mjs`. The guard ran none of it and reported a
  // pass twice.
  const REAL_RUNS = {
    workflow_runs: [
      { id: 33062639475, head_sha: '80b9a429', conclusion: 'success' },
      { id: 33062548978, head_sha: 'e798db73', conclusion: 'cancelled' },
      { id: 33054640457, head_sha: '5996ed2f', conclusion: 'success' },
      { id: 33049230621, head_sha: '32b54256', conclusion: 'failure' },
    ],
  };
  const REAL_DIFFS = {
    // What the old shell measured: `event.before`..`sha`, and on the dispatch `HEAD~1 HEAD`.
    'e798db73': ['docs/projects/workflow-master.md'],
    // What the last verified tree gives.
    '5996ed2f': [
      '.claude/skills/afk-slice/SKILL.md',
      'AGENTS.md',
      'docs/projects/ftag-master.md',
      'docs/projects/workflow-master.md',
      'docs/rules/history.md',
      'docs/rules/merging.md',
      'kit-manifest.json',
      'package.json',
      'scripts/deploy-owed-check.mjs',
      'scripts/deploy-owed-check.test.mjs',
      'scripts/preflight.mjs',
    ],
  };

  // The old base, kept here as the control: it really is docs-only, which is why the tick was green.
  assert.equal(hasCode(REAL_DIFFS['e798db73']), false);

  // The dispatch at 33062702041 — the 18-second pass.
  const dispatch = await resolveScope({
    event: 'workflow_dispatch',
    listVerified: async () => ['80b9a429'],
    changedFiles: () => REAL_DIFFS['e798db73'],
  });
  assert.equal(dispatch.code, true, 'a human re-run must never be answered from yesterday');

  // The push at 33062639475 — the one that superseded the cancelled code run.
  const fetchImpl = fakeGitHub({
    runsById: { 33062639475: { workflow_id: 176448292, head_branch: 'main' } },
    runsByWorkflow: { 176448292: REAL_RUNS },
  });
  const shas = await verifiedShas({ repo: 'johndaryow/pp-workspace', runId: '33062639475', token: 't', fetchImpl });
  assert.deepEqual(shas, ['5996ed2f'], 'the cancelled code run is not a base, and the run itself is not its own base');

  const push = await resolveScope({
    event: 'push',
    head: '80b9a429',
    listVerified: async () => shas,
    isAncestor: () => true,
    changedFiles: (base) => REAL_DIFFS[base] ?? null,
  });
  assert.equal(push.code, true, 'eleven files, three of them code — this must run the suite');
  assert.match(push.reason, /code changed since 5996ed2/);
});

test('the shortcut still works — docs after a verified tree skip the suite', async () => {
  // The saving is real and worth keeping: this is the common case, a `chore(status)` merge that
  // follows a run which actually passed.
  const d = await resolveScope({
    event: 'push',
    head: 'sha2',
    listVerified: async () => ['sha1'],
    isAncestor: () => true,
    changedFiles: () => ['docs/projects/workflow-master.md', 'CHANGELOG.md'],
  });
  assert.equal(d.code, false);
  assert.match(d.reason, /docs only since sha1/);
});

test('a cancelled or failed run is not a verified tree', async () => {
  // `status=success` is asked of the API, and asserted again here on the way out. The API filter
  // alone is one query-string typo away from letting a cancelled run become a base — which is the
  // exact commit this whole file exists because of.
  const fetchImpl = fakeGitHub({
    runsById: { 555: { workflow_id: 77, head_branch: 'main' } },
    runsByWorkflow: {
      77: {
        workflow_runs: [
          { id: 999, head_sha: 'cancelled-sha', conclusion: 'cancelled' },
          { id: 998, head_sha: 'failed-sha', conclusion: 'failure' },
          { id: 997, head_sha: 'good-sha', conclusion: 'success' },
        ],
      },
    },
  });
  const shas = await verifiedShas({ repo: 'o/r', runId: '555', token: 't', fetchImpl });
  assert.deepEqual(shas, ['good-sha']);
});

test('the run asking the question can never be its own proof', async () => {
  // Status alone excludes it today — a run asking this is still in progress. Belt and braces on
  // purpose: an invariant that holds by accident is one mutation away from not holding.
  const fetchImpl = fakeGitHub({
    runsById: { 555: { workflow_id: 77, head_branch: 'main' } },
    runsByWorkflow: {
      77: { workflow_runs: [{ id: 555, head_sha: 'my-own-sha', conclusion: 'success' }] },
    },
  });
  assert.deepEqual(await verifiedShas({ repo: 'o/r', runId: '555', token: 't', fetchImpl }), []);
});

test('the branch asked for is the branch this run is on', async () => {
  const fetchImpl = fakeGitHub({
    runsById: { 555: { workflow_id: 77, head_branch: 'main' } },
    runsByWorkflow: { 77: { workflow_runs: [] } },
  });
  await verifiedShas({ repo: 'o/r', runId: '555', token: 't', branch: 'release-2', fetchImpl });
  assert.ok(
    fetchImpl.asked.some((u) => u.includes('/workflows/77/runs') && u.includes('branch=release-2')),
    'the run list must be scoped to a branch, or another branch\'s green run becomes this one\'s base',
  );
  assert.ok(fetchImpl.asked.some((u) => u.includes('status=success')));
});

test('no credential, no history, no answer — every unknown runs the whole suite', async () => {
  // NOT KNOWING IS NEVER A SKIP. Four ways to know nothing; one answer to all of them.
  const noToken = await verifiedShas({ repo: 'o/r', runId: '555', token: '', fetchImpl: fakeGitHub() });
  assert.deepEqual(noToken, []);

  const dead = await verifiedShas({ repo: 'o/r', runId: '555', token: 't', fetchImpl: fakeGitHub({ fail: true }) });
  assert.deepEqual(dead, [], 'an API that throws must not read as "nothing has changed"');

  const missing = await verifiedShas({ repo: 'o/r', runId: '404', token: 't', fetchImpl: fakeGitHub() });
  assert.deepEqual(missing, [], 'a 404 is not a verified history');

  const d = await resolveScope({
    event: 'push',
    listVerified: async () => [],
    changedFiles: () => {
      throw new Error('must not be reached — there is no range to read');
    },
  });
  assert.equal(d.code, true);
  assert.match(d.reason, /no verified base/);
});

test('a base this checkout cannot reach is not a base', async () => {
  // Force-push, another branch, a shallow clone. `git diff` would answer something for a range it
  // cannot walk, or nothing at all; neither is a verdict.
  assert.equal(pickBase(['gone', 'also-gone'], () => false), null);
  assert.equal(pickBase(['gone', 'present'], (s) => s === 'present'), 'present');
  assert.equal(pickBase([], () => true), null);

  const d = await resolveScope({
    event: 'push',
    listVerified: async () => ['rewritten-sha'],
    isAncestor: () => false,
    changedFiles: () => [],
  });
  assert.equal(d.code, true);
});

test('an unreadable diff is not an empty diff', async () => {
  const d = await resolveScope({
    event: 'push',
    listVerified: async () => ['sha0'],
    isAncestor: () => true,
    changedFiles: () => null,
  });
  assert.equal(d.code, true);
  assert.match(d.reason, /unreadable diff is not an empty one/);
});

test('a decision that throws runs the suite, it does not go red', async () => {
  // The last line of defence, and the one that must never be wrong.
  //
  // A runner too old for a global `fetch`, a git that will not answer, a run history that comes
  // back as something unexpected: none of those is a broken build. Reporting red for them teaches
  // people to re-run the guard without reading it, which is how a real failure gets waved through
  // (WORKFLOW-P40). Running everything costs minutes and says exactly what happened.
  //
  // No network and no git in here: the resolver is the injected dependency.
  const d = await decideOrRunEverything(async () => {
    throw new TypeError('fetch is not a function');
  });
  assert.equal(d.code, true);
  assert.match(d.reason, /could not be decided \(fetch is not a function\)/);
  assert.equal(d.base, null);
});

test('decideScope has no fourth answer', () => {
  assert.equal(decideScope({ event: 'workflow_dispatch', base: null, changed: [] }).code, true);
  assert.equal(decideScope({ event: 'push', base: null, changed: [] }).code, true);
  assert.equal(decideScope({ event: 'push', base: 'abcdef1234', changed: ['src/a.ts'] }).code, true);
  assert.equal(decideScope({ event: 'push', base: 'abcdef1234', changed: ['docs/a.md'] }).code, false);
  // An empty diff against a verified base really is nothing to do.
  assert.equal(decideScope({ event: 'push', base: 'abcdef1234', changed: [] }).code, false);
});

test('the workflow consults this decision, and nothing else', () => {
  // The mutation no other test here can catch: a correct decision the workflow ignores.
  //
  // It reads the file rather than trusting the review, because the two failed bases — the previous
  // push and `HEAD~1` — are one line of shell each, and either one silently restores the bug.
  const wf = readFileSync(mainGuardPath(), 'utf8');
  const runLine = wf.split('\n').find((l) => /^\s*run:.*guard-scope\.mjs/.test(l));
  assert.ok(runLine, 'the scope step must call scripts/guard-scope.mjs');

  // Comments stripped before the two forbidden bases are looked for. The file EXPLAINS both of
  // them at length — a test that reads its own explanation as the bug is a test that forces the
  // next person to delete the explanation. Same finding as P40's `--require-secrets` assertion,
  // pointed the other way: read instructions off instruction lines, never off prose.
  const instructions = wf
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
  assert.doesNotMatch(instructions, /HEAD~1/, 'the last commit is not the last verified tree');
  assert.doesNotMatch(
    instructions,
    /github\.event\.before/,
    'the previous push is not the last verified tree',
  );

  // The API read needs a grant, and a default-restricted token would fail it into "run everything"
  // — safe, and permanently expensive. Explicit here so a repo cannot inherit the wrong default.
  // Read off the instructions, for the same reason as above: a commented-out grant is not a grant.
  assert.match(instructions, /permissions:/);
  assert.match(instructions, /actions:\s*read/);

  // EVERY step after the decision gates on it — not "at least five of them".
  //
  // A count is not a guard: dropping one `if:` leaves the others to keep the number plausible, and
  // the step that lost it runs on every docs-only merge for as long as nobody looks. So the shape
  // is asserted instead — split the job into steps at the point the scope step ends, and require
  // the gate in each one.
  const afterScope = instructions.slice(instructions.indexOf(runLine) + runLine.length);
  const steps = afterScope
    .split(/\n(?=\s{6}- (?:name|uses):)/)
    .map((s) => s.trim())
    .filter(Boolean);
  assert.ok(steps.length >= 5, `expected the heavy steps to still be here, saw ${steps.length}`);
  for (const step of steps) {
    const label = step.split('\n')[0];
    assert.match(
      step,
      /if:\s*steps\.scope\.outputs\.code == 'true'/,
      `every step after the decision must gate on it — this one does not: ${label}`,
    );
  }
  assert.match(instructions, /run: npm run preflight -- --full/);
});
