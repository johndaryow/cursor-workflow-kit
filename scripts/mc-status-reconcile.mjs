#!/usr/bin/env node
/**
 * WORKFLOW-P18 — Post-merge STATUS reconcile (pipeline-owned bookkeeping).
 *
 * Runs on main after an AFK slice PR merges — fixes RALPH_RUNNING, LAST_MERGED_PR,
 * AFK_QUEUE, SLICES line, and platform §5b lane row when stale.
 *
 * Usage:
 *   npm run mc:status-reconcile -- --pr-number <n> [--dry-run]
 *   npm run mc:status-reconcile -- --merged-slice DS5 --pr-number 436 --dry-run
 *
 * GitHub Action ralph-continue-on-merge.yml runs this BEFORE mc:ralph-chain.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  extractMergedSliceId,
  isMaintenancePr,
  nextSliceId,
  sliceMetaFor,
} from './ralph-chain-config.mjs';
import { getRalphRunning } from './ralph-chain.mjs';
import { chatRenameFromMaster } from './mc-chat-meta.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const PLATFORM_MD = resolve(root, 'docs/projects/platform-migration-master.md');

/** @param {string[]} argv */
function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pr-number') out.prNumber = argv[++i];
    else if (a === '--merged-slice') out.mergedSlice = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--json') out.json = true;
  }
  return out;
}

function gh(args) {
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GITHUB_PAT?.trim();
  const env = token ? { ...process.env, GITHUB_TOKEN: token, GH_TOKEN: token } : process.env;
  return spawnSync('gh', args, { encoding: 'utf8', cwd: root, env });
}

/** @param {string} prNumber */
function fetchPr(prNumber) {
  const r = gh(['pr', 'view', prNumber, '--json', 'title,body,number,mergedAt,state']);
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

/**
 * @param {string} dash
 * @param {string} key
 * @param {string} value
 */
export function setDashboardField(dash, key, value) {
  const re = new RegExp(`^${key}:.*$`, 'm');
  if (re.test(dash)) return dash.replace(re, `${key}: ${value}`);
  return `${dash.trimEnd()}\n${key}: ${value}\n`;
}

/**
 * @param {string} dash
 * @param {string} mergedSlice
 */
export function clearMergedFromRalphRunning(dash, mergedSlice) {
  const running = getRalphRunning(`\`\`\`text\n${dash}\`\`\``);
  const filtered = running.filter((id) => id !== mergedSlice);
  const value = filtered.length ? filtered.join(' | ') : 'none';
  return setDashboardField(dash, 'RALPH_RUNNING', value);
}

/**
 * @param {string} dash
 * @param {string} mergedSlice
 * @param {string | null} nextSlice
 */
export function advanceAfkQueueField(dash, mergedSlice, nextSlice) {
  const line = dash.match(/^AFK_QUEUE:\s*(.+)$/m)?.[1]?.trim() ?? 'none';
  if (line === 'none' || !line) {
    return nextSlice ? setDashboardField(dash, 'AFK_QUEUE', nextSlice) : dash;
  }
  const items = line
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((id) => id !== mergedSlice);
  if (nextSlice && items[0] !== nextSlice && !items.includes(nextSlice)) {
    items.unshift(nextSlice);
  } else if (nextSlice) {
    const withoutDup = [nextSlice, ...items.filter((id) => id !== nextSlice)];
    return setDashboardField(
      dash,
      'AFK_QUEUE',
      withoutDup.length ? withoutDup.join(' | ') : 'none',
    );
  }
  return setDashboardField(dash, 'AFK_QUEUE', items.length ? items.join(' | ') : 'none');
}

/**
 * @param {string} dash
 * @param {string} mergedSlice
 */
export function markSliceCompleteInDashboard(dash, mergedSlice) {
  let next = dash.replace(
    new RegExp(`\\b${mergedSlice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(PR\\)`, 'g'),
    `${mergedSlice} ✅`,
  );
  next = next.replace(
    new RegExp(`\\b${mergedSlice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(in flight\\)`, 'gi'),
    `${mergedSlice} ✅`,
  );
  return next;
}

/**
 * @param {string} masterText
 * @param {{ mergedSlice: string, prNumber: string, nextSlice: string | null }} opts
 */
export function reconcileProgramMasterText(masterText, opts) {
  const { mergedSlice, prNumber, nextSlice } = opts;
  const fence = masterText.match(/```text\n([\s\S]*?)```/);
  if (!fence) return { text: masterText, changed: false, fields: [] };

  let dash = fence[1];
  const before = dash;

  dash = setDashboardField(dash, 'LAST_MERGED_PR', `#${prNumber} ${mergedSlice}`);
  dash = setDashboardField(dash, 'LAST_PR', 'none');
  dash = clearMergedFromRalphRunning(dash, mergedSlice);
  dash = advanceAfkQueueField(dash, mergedSlice, nextSlice);
  if (nextSlice) {
    dash = setDashboardField(dash, 'NEXT_PROMPT', `§11 · ${nextSlice}`);
  }
  dash = markSliceCompleteInDashboard(dash, mergedSlice);

  if (dash === before) return { text: masterText, changed: false, fields: [] };

  const text = masterText.replace(fence[0], `\`\`\`text\n${dash}\`\`\``);
  return { text, changed: true, fields: ['STATUS DASHBOARD'] };
}

/**
 * @param {string} platformText
 * @param {{ mergedSlice: string, nextSlice: string | null, chatRename: string, program: string }} opts
 */
export function reconcilePlatformLaneRow(platformText, opts) {
  const { mergedSlice, nextSlice, chatRename, program } = opts;
  let laneNeedle = null;
  if (mergedSlice.startsWith('DS')) laneNeedle = 'I — DS cleanup';
  else if (mergedSlice.startsWith('RH')) laneNeedle = 'H — Repo health';
  else if (mergedSlice.startsWith('FM-')) laneNeedle = 'J — Final migration';
  if (!laneNeedle) return { text: platformText, changed: false };

  const date = new Date().toISOString().slice(0, 10);
  const activeNote = `**${mergedSlice} ✅** merged`;
  const nextCol = nextSlice ? `**${nextSlice}** (Ralph / fresh agent)` : '—';
  const chatCol = chatRename || `${program} ${nextSlice ?? mergedSlice}`;
  const laneStatus =
    mergedSlice === 'FM-10' || !nextSlice ? '✅ **idle**' : '🟢 **running**';

  let changed = false;
  const nextLines = platformText.split('\n').map((line) => {
    if (!line.includes(`**${laneNeedle}**`)) return line;
    const newLine = `| **${laneNeedle}** | ${program} | \`${chatCol}\` | ${laneStatus} | ${activeNote} | ${nextCol} | ${date} |`;
    if (newLine !== line) changed = true;
    return newLine;
  });

  return { text: nextLines.join('\n'), changed };
}

/**
 * @param {{ mergedSlice: string, prNumber: string, prTitle?: string, prBody?: string, dryRun?: boolean }} input
 */
export function planStatusReconcile(input) {
  const { mergedSlice, prNumber, prTitle = '', prBody = '' } = input;
  const meta = sliceMetaFor(mergedSlice);
  const masterRel = meta?.masterDoc ?? 'docs/projects/platform-migration-master.md';
  const masterPath = resolve(root, masterRel);
  const nextSlice = nextSliceId(mergedSlice);

  /** @type {{ path: string, reason: string }[]} */
  const files = [];

  if (existsSync(masterPath)) {
    const masterText = readFileSync(masterPath, 'utf8');
    const chatRename = nextSlice
      ? chatRenameFromMaster(masterText, nextSlice)
      : chatRenameFromMaster(masterText, mergedSlice);
    const programResult = reconcileProgramMasterText(masterText, {
      mergedSlice,
      prNumber,
      nextSlice,
    });
    if (programResult.changed) {
      files.push({ path: masterRel, text: programResult.text, reason: 'program STATUS' });
    }

    if (
      (mergedSlice.startsWith('DS') ||
        mergedSlice.startsWith('RH') ||
        mergedSlice.startsWith('FM-')) &&
      existsSync(PLATFORM_MD)
    ) {
      const platformText = readFileSync(PLATFORM_MD, 'utf8');
      const platformResult = reconcilePlatformLaneRow(platformText, {
        mergedSlice,
        nextSlice,
        chatRename: nextSlice ? chatRename : '',
        program:
          meta?.program ??
          (mergedSlice.startsWith('DS')
            ? 'DS-CLEAN'
            : mergedSlice.startsWith('RH')
              ? 'REPO-H'
              : 'FM'),
      });
      if (platformResult.changed) {
        files.push({
          path: 'docs/projects/platform-migration-master.md',
          text: platformResult.text,
          reason: '§5b lane row',
        });
      }
    }
  }

  return {
    mergedSlice,
    prNumber,
    nextSlice,
    masterDoc: masterRel,
    skipped: isMaintenancePr(prTitle, prBody),
    files,
    changed: files.length > 0,
  };
}

/**
 * @param {ReturnType<typeof planStatusReconcile>} plan
 * @param {{ dryRun?: boolean, push?: boolean }} opts
 */
export function applyStatusReconcile(plan, opts = {}) {
  if (plan.skipped || !plan.changed) {
    return { applied: false, reason: plan.skipped ? 'maintenance PR' : 'already correct' };
  }

  if (opts.dryRun) {
    return { applied: false, dryRun: true, files: plan.files.map((f) => f.path) };
  }

  for (const file of plan.files) {
    writeFileSync(resolve(root, file.path), file.text, 'utf8');
  }

  if (!opts.push) {
    return { applied: true, pushed: false, files: plan.files.map((f) => f.path) };
  }

  spawnSync('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'], {
    cwd: root,
  });
  spawnSync('git', ['config', 'user.name', 'github-actions[bot]'], { cwd: root });

  for (const file of plan.files) {
    spawnSync('git', ['add', file.path], { cwd: root });
  }

  const msg = `chore(status): reconcile after ${plan.mergedSlice} merge (#${plan.prNumber})`;
  const commit = spawnSync('git', ['commit', '-m', msg], { encoding: 'utf8', cwd: root });
  if (commit.status !== 0) {
    return {
      applied: false,
      pushed: false,
      reason: commit.stderr || 'nothing to commit',
    };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    spawnSync('git', ['pull', '--rebase', 'origin', 'main'], { cwd: root });
    const push = spawnSync('git', ['push', 'origin', 'main'], { encoding: 'utf8', cwd: root });
    if (push.status === 0) {
      return { applied: true, pushed: true, files: plan.files.map((f) => f.path) };
    }
  }

  return { applied: true, pushed: false, reason: 'git push failed after retries' };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prNumber) {
    console.error('Usage: mc:status-reconcile -- --pr-number <n> [--dry-run]');
    process.exit(1);
  }

  let mergedSlice = args.mergedSlice ?? null;
  let prTitle = '';
  let prBody = '';

  if (args.prNumber) {
    const pr = fetchPr(args.prNumber);
    if (!pr) {
      console.error(`FAIL: could not load PR #${args.prNumber}`);
      process.exit(1);
    }
    if (pr.state !== 'MERGED') {
      console.error(`SKIP: PR #${args.prNumber} is ${pr.state} (not merged)`);
      process.exit(0);
    }
    prTitle = pr.title ?? '';
    prBody = pr.body ?? '';
    mergedSlice = mergedSlice ?? extractMergedSliceId(`${prTitle}\n${prBody}`);
  }

  if (!mergedSlice) {
    console.error('SKIP: no merged slice id');
    process.exit(0);
  }

  const plan = planStatusReconcile({
    mergedSlice,
    prNumber: args.prNumber,
    prTitle,
    prBody,
  });

  if (plan.skipped) {
    console.log('RECONCILE: skip (maintenance/doc-only PR)');
    process.exit(0);
  }

  if (!plan.changed) {
    console.log(`RECONCILE: ok (no changes needed for ${mergedSlice})`);
    process.exit(0);
  }

  const result = applyStatusReconcile(plan, {
    dryRun: args.dryRun,
    push: !args.dryRun && process.env.MC_STATUS_RECONCILE_PUSH === '1',
  });

  if (args.json) {
    console.log(JSON.stringify({ plan, result }, null, 2));
    process.exit(0);
  }

  console.log('# STATUS RECONCILE\n');
  console.log(`MERGED_SLICE: ${plan.mergedSlice}`);
  console.log(`NEXT_SLICE: ${plan.nextSlice ?? 'none'}`);
  console.log(`FILES: ${plan.files.map((f) => f.path).join(', ')}`);
  console.log(`APPLIED: ${result.applied ? 'yes' : 'no'}`);
  if (result.dryRun) console.log('DRY_RUN: yes');
  if (result.pushed) console.log('PUSHED: yes');
  if (result.reason) console.log(`REASON: ${result.reason}`);

  process.exit(0);
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
