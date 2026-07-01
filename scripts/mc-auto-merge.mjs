#!/usr/bin/env node
/**
 * Auto-merge PR when AFK + green (agent-owned merge for non-developer CEO).
 * Usage: npm run mc:auto-merge -- <pr-number>
 * Requires: gh CLI + GITHUB_TOKEN, GITHUB_PAT, or gh auth
 *
 * Gate checks use **per-slice** tags from PR body + master doc registry — not program-level STATUS.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMergedSliceId, sliceMetaFor, isMaintenancePr } from './ralph-chain-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pr = process.argv[2];

const ghToken = process.env.GITHUB_TOKEN?.trim() || process.env.GITHUB_PAT?.trim();
const ghEnv = ghToken ? { ...process.env, GITHUB_TOKEN: ghToken, GH_TOKEN: ghToken } : process.env;

if (!pr || !/^\d+$/.test(pr)) {
  console.error('Usage: npm run mc:auto-merge -- <pr-number>');
  process.exit(1);
}

function gh(args) {
  return spawnSync('gh', args, { encoding: 'utf8', env: ghEnv });
}

const prView = gh(['pr', 'view', pr, '--json', 'state,mergeable,title,headRefName,body']);
if (prView.status !== 0) {
  console.error('FAIL: gh pr view — is gh installed and authenticated?');
  console.error(prView.stderr || prView.stdout);
  console.error(
    'Tip: add GITHUB_TOKEN or GITHUB_PAT to Cursor Cloud Secrets with pull request write access.',
  );
  process.exit(1);
}

const info = JSON.parse(prView.stdout);
if (info.state !== 'OPEN') {
  console.error(`FAIL: PR #${pr} is not open (state=${info.state})`);
  process.exit(1);
}

if (info.mergeable === 'CONFLICTING') {
  console.error(`FAIL: PR #${pr} has merge conflicts`);
  process.exit(1);
}

/** @param {string} title @param {string} body */
function assertAutoMergeAllowed(title, body) {
  const sliceId = extractMergedSliceId(`${title}\n${body ?? ''}`);
  if (sliceId) {
    const meta = sliceMetaFor(sliceId);
    if (meta) {
      if (meta.autonomy === 'HITL') {
        console.error(`FAIL: Slice ${sliceId} is HITL — auto-merge blocked`);
        process.exit(1);
      }
      if (meta.mergePolicy && meta.mergePolicy !== 'auto_when_green') {
        console.error(
          `FAIL: Slice ${sliceId} MERGE_POLICY is ${meta.mergePolicy} — auto-merge blocked`,
        );
        process.exit(1);
      }
      if (meta.ceoGate && meta.ceoGate !== 'none' && meta.ceoGate !== 'merge_only') {
        console.error(
          `FAIL: Slice ${sliceId} CEO_GATE is ${meta.ceoGate} — auto-merge blocked`,
        );
        process.exit(1);
      }
      return;
    }
  }

  // Fallback: program STATUS dashboard (legacy — avoid blocking when slice id missing)
  const platformDoc = resolve(__dirname, '../docs/projects/platform-migration-master.md');
  try {
    const text = readFileSync(platformDoc, 'utf8');
    const dashStart = text.indexOf('## STATUS DASHBOARD');
    if (dashStart !== -1) {
      const slice = text.slice(dashStart, dashStart + 800);
      const autonomy = slice.match(/AUTONOMY:\s*(\S+)/)?.[1];
      const mergePolicy = slice.match(/MERGE_POLICY:\s*(\S+)/)?.[1];
      if (autonomy === 'HITL') {
        console.error('FAIL: PLATFORM STATUS AUTONOMY is HITL — auto-merge blocked');
        process.exit(1);
      }
      if (mergePolicy && mergePolicy !== 'auto_when_green') {
        console.error(`FAIL: PLATFORM MERGE_POLICY is ${mergePolicy} — auto-merge blocked`);
        process.exit(1);
      }
    }
  } catch {
    // no platform doc — proceed with gh only
  }
}

assertAutoMergeAllowed(info.title, info.body);

const closeout = spawnSync(
  'node',
  ['scripts/mc-slice-closeout.mjs', '--pr-number', pr],
  { encoding: 'utf8', cwd: resolve(__dirname, '..'), env: ghEnv },
);
if (closeout.status !== 0) {
  console.error('FAIL: mc:slice-closeout');
  console.error(closeout.stdout || closeout.stderr);
  process.exit(1);
}

const filesJson = gh(['pr', 'view', pr, '--json', 'files']);
if (filesJson.status === 0) {
  try {
    const { files = [] } = JSON.parse(filesJson.stdout);
    const touchesRalph = files.some((f) =>
      /(?:master\.md$|ralph-chain|mc-status-reconcile|ralph-master-registry)/i.test(
        f.path ?? '',
      ),
    );
    if (touchesRalph) {
      const chainTest = spawnSync('npm', ['run', 'test:ralph-chain'], {
        encoding: 'utf8',
        cwd: resolve(__dirname, '..'),
        env: ghEnv,
      });
      if (chainTest.status !== 0) {
        console.error('FAIL: test:ralph-chain (PR touches Ralph planner / master docs)');
        console.error(chainTest.stdout || chainTest.stderr);
        process.exit(1);
      }
    }
  } catch {
    // non-fatal — proceed with merge if file list unavailable
  }
}

const ready = gh(['pr', 'ready', pr]);
if (ready.status !== 0 && !ready.stderr?.includes('already')) {
  console.error('WARN: gh pr ready failed (may already be ready)');
}

const merge = gh(['pr', 'merge', pr, '--squash', '--delete-branch']);
if (merge.status !== 0) {
  console.error('FAIL: gh pr merge');
  console.error(merge.stderr || merge.stdout);
  process.exit(1);
}

console.log(`OK: merged PR #${pr} (${info.title})`);
console.log(`Branch ${info.headRefName} deleted`);

// Chain continuation: GitHub Action ralph-continue-on-merge.yml (WORKFLOW-P17).
// Do NOT call mc:ralph-launch here — avoids duplicate agents when GHA also fires.
if (isMaintenancePr(info.title, info.body)) {
  console.log('');
  console.log('CHAIN: skipped — maintenance/doc-only PR (GHA will notify-only too)');
} else {
  console.log('');
  console.log('CHAIN: GitHub Action ralph-continue-on-merge will launch the next slice.');
  console.log(`Check: GitHub → Actions → Ralph continue on merge (PR #${pr})`);
  console.log(`Manual fallback: npm run mc:ralph-launch -- --pr-number ${pr}`);
}
