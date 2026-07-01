#!/usr/bin/env node
/**
 * AFK slice closeout gate — agent is not done until this passes (Path A).
 *
 * Usage:
 *   npm run mc:slice-closeout -- --branch <name>     # before PR (push + branch on remote)
 *   npm run mc:slice-closeout -- --pr-number <n>    # after PR open (SESSION REPORT + Slice id + STATUS)
 *
 * Does not merge or launch — those are mc:auto-merge + GitHub Action ralph-continue-on-merge.
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMergedSliceId, sliceMetaFor, isMaintenancePr } from './ralph-chain-config.mjs';
import { getRalphRunning } from './ralph-chain.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/** @param {string[]} argv */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--branch') out.branch = argv[++i];
    else if (a === '--pr-number') out.prNumber = argv[++i];
  }
  return out;
}

function gh(args) {
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GITHUB_PAT?.trim();
  const env = token ? { ...process.env, GITHUB_TOKEN: token, GH_TOKEN: token } : process.env;
  return spawnSync('gh', args, { encoding: 'utf8', cwd: root, env });
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

/**
 * @param {string} prNumber
 * @param {string} sliceId
 */
function assertStatusReadyForMerge(prNumber, sliceId) {
  const meta = sliceMetaFor(sliceId);
  const masterRel = meta?.masterDoc ?? 'docs/projects/platform-migration-master.md';

  const prJson = gh(['pr', 'view', prNumber, '--json', 'headRefName']);
  if (prJson.status !== 0) fail(`could not load PR head for STATUS check`);
  const headRefName = JSON.parse(prJson.stdout).headRefName;

  spawnSync('git', ['fetch', 'origin', headRefName, '--depth', '1'], { cwd: root });
  const show = spawnSync(
    'git',
    ['show', `origin/${headRefName}:${masterRel}`],
    { encoding: 'utf8', cwd: root },
  );
  if (show.status !== 0) {
    fail(`could not read ${masterRel} on PR branch — commit STATUS update in same PR`);
  }

  const running = getRalphRunning(show.stdout);
  if (running.includes(sliceId)) {
    fail(
      `STATUS RALPH_RUNNING still contains ${sliceId} — clear before auto-merge (WORKFLOW-P18)`,
    );
  }
}

const args = parseArgs(process.argv.slice(2));

if (args.branch) {
  const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8', cwd: root });
  if (status.stdout?.trim()) {
    fail('working tree not clean — commit before closeout');
  }

  const branch = args.branch.trim();
  const remote = gh(['ls-remote', '--heads', 'origin', branch]);
  if (remote.status !== 0 || !remote.stdout?.includes(branch)) {
    fail(`branch not on origin — run: git push -u origin ${branch}`);
  }

  console.log(`OK: branch ${branch} pushed to origin`);
  console.log('NEXT: open PR with SESSION REPORT + Slice: <id> → run exit tests → mc:auto-merge');
  process.exit(0);
}

if (args.prNumber) {
  if (!/^\d+$/.test(args.prNumber)) fail('usage: mc:slice-closeout -- --pr-number <n>');

  const view = gh(['pr', 'view', args.prNumber, '--json', 'state,title,body,headRefName,url']);
  if (view.status !== 0) fail(`could not load PR #${args.prNumber}`);

  const pr = JSON.parse(view.stdout);
  if (pr.state !== 'OPEN' && pr.state !== 'MERGED') {
    fail(`PR #${args.prNumber} is ${pr.state}`);
  }

  const body = pr.body ?? '';
  if (!/##\s*session report/i.test(body)) {
    fail('PR body missing ## SESSION REPORT');
  }

  if (isMaintenancePr(pr.title, body)) {
    console.log(`OK: PR #${args.prNumber} closeout ready (maintenance — no slice chain)`);
    console.log(`URL: ${pr.url}`);
    if (pr.state === 'OPEN') {
      console.log('NEXT: npm run mc:auto-merge --', args.prNumber);
    }
    process.exit(0);
  }

  if (!/slice\s*:/i.test(body)) {
    fail('PR body missing Slice: <machine-id> (required for chain planner)');
  }

  const sliceId = extractMergedSliceId(`${pr.title}\n${body}`);
  if (!sliceId) {
    fail('could not parse machine slice id from PR title/body');
  }

  if (pr.state === 'OPEN') {
    assertStatusReadyForMerge(args.prNumber, sliceId);
  }

  console.log(`OK: PR #${args.prNumber} closeout ready (${sliceId})`);
  console.log(`URL: ${pr.url}`);
  if (pr.state === 'OPEN') {
    console.log('NEXT: npm run mc:auto-merge --', args.prNumber);
    console.log('THEN: GitHub Action ralph-continue-on-merge launches next slice');
  }
  process.exit(0);
}

fail('usage: mc:slice-closeout -- --branch <name> | --pr-number <n>');
