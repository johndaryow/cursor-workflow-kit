#!/usr/bin/env node
/**
 * Fill-the-DAG — list AFK slices ready to start in parallel (disjoint sub-lanes).
 * CEO kickstart: one Cloud Agent per READY slice, or optional kickstart automation.
 *
 * Usage: npm run mc:ralph-fill-dag
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORKER_DEPS,
  DLM_DEPS,
  PARALLEL_KICKSTART_PRIORITY,
  canAutoChain,
  sliceMetaFor,
  subLaneFor,
} from './ralph-chain-config.mjs';
import { chatRenameFromMaster } from './mc-chat-meta.mjs';
import { getCompletedSlices, getRalphRunning, parseDashboard } from './ralph-chain.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const PLATFORM_MD = resolve(root, 'docs/projects/platform-migration-master.md');
const DLM_MD = resolve(root, 'docs/projects/dlm-master.md');
const REPO_HEALTH_MD = resolve(root, 'docs/projects/repo-health-master.md');
const DS_CLEAN_MD = resolve(root, 'docs/projects/ds-clean-master.md');
const FM_MD = resolve(root, 'docs/projects/fm-master.md');
const WORKERS_EXIT_MD = resolve(root, 'docs/projects/workers-exit-plan.md');

/** Worker slices eligible for cold-start parallel (post-W8). */
const WORKER_CANDIDATES = [
  'W9', 'W10', 'W11', 'W12', 'W13', 'W14', 'W15', 'W16',
  'W17', 'W18', 'W19', 'W20', 'W21', 'W22', 'W23', 'W24', 'W25',
];

const DLM_CANDIDATES = ['DLM-8', 'DLM-9', 'DLM-10', 'DLM-11', 'DLM-1', 'DLM-5'];

/**
 * @param {string[]} deps
 * @param {Set<string>} completed
 */
function depsMet(deps, completed) {
  return deps.every((d) => completed.has(d));
}

/**
 * @param {string} platformText
 * @param {string} dlmText
 * @param {string | null} [justMergedSlice]
 * @param {string} [workersExitText]
 */
export function computeReadySlices(platformText, dlmText, justMergedSlice = null, workersExitText = '') {
  const completed = getCompletedSlices(platformText, workersExitText);
  if (justMergedSlice) completed.add(justMergedSlice);
  const running = new Set(getRalphRunning(platformText));
  const runningSubLanes = new Set([...running].map((id) => subLaneFor(id)));

  const dash = parseDashboard(platformText);
  if (dash.blockedBy && dash.blockedBy !== 'none') {
    return { ready: [], blockedBy: dash.blockedBy, completed: [...completed] };
  }

  /** @type {{ sliceId: string, subLane: string, chatRename: string, masterDoc: string }[]} */
  const ready = [];

  for (const sliceId of WORKER_CANDIDATES) {
    if (completed.has(sliceId)) continue;
    const deps = WORKER_DEPS[sliceId] ?? [];
    if (!depsMet(deps, completed)) continue;
    const meta = sliceMetaFor(sliceId);
    if (!canAutoChain(meta)) continue;
    const subLane = subLaneFor(sliceId);
    if (runningSubLanes.has(subLane)) continue;
    if (running.has(sliceId)) continue;
    ready.push({
      sliceId,
      subLane,
      chatRename: chatRenameFromMaster(platformText, sliceId),
      masterDoc: 'docs/projects/platform-migration-master.md',
    });
    runningSubLanes.add(subLane);
  }

  for (const sliceId of DLM_CANDIDATES) {
    if (completed.has(sliceId)) continue;
    const deps = DLM_DEPS[sliceId] ?? [];
    if (!depsMet(deps, completed)) continue;
    const meta = sliceMetaFor(sliceId);
    if (!canAutoChain(meta)) continue;
    const subLane = subLaneFor(sliceId);
    if (runningSubLanes.has(subLane)) continue;
    ready.push({
      sliceId,
      subLane,
      chatRename: chatRenameFromMaster(dlmText, sliceId),
      masterDoc: 'docs/projects/dlm-master.md',
    });
    runningSubLanes.add(subLane);
  }

  // S6b batch — if Lane A not running and inventory remains
  const laneARunning = /\|\s*\*\*A — Media\*\*[^|\n]*\|[^|\n]*\|[^|\n]*\|\s*🟢/.test(
    platformText,
  );
  const s6bHold = /S6b ON HOLD|on hold/i.test(platformText);
  if (!laneARunning && !s6bHold && !runningSubLanes.has('A-s6b')) {
    const batchMatch = dash.activeSlice.match(/batch\s*(\d+)/i);
    const nextBatch = batchMatch ? Number.parseInt(batchMatch[1], 10) : 13;
    if (Number.isFinite(nextBatch)) {
      ready.push({
        sliceId: `S6b-batch-${nextBatch}`,
        subLane: 'A-s6b',
        chatRename: `PLATFORM S6b · hybrid batch ${nextBatch}`,
        masterDoc: 'docs/projects/platform-migration-master.md',
      });
    }
  }

  // REPO-H serial lane — first item in AFK_QUEUE when program ready
  if (existsSync(REPO_HEALTH_MD)) {
    const repoHealthText = readFileSync(REPO_HEALTH_MD, 'utf8');
    const repoDash = parseDashboard(repoHealthText);
    const repoRunning = new Set(getRalphRunning(repoHealthText));
    const laneHReady = /\|\s*\*\*H — Repo health\*\*[^|\n]*\|[^|\n]*\|[^|\n]*\|\s*🟢[^|\n]*ready/i.test(
      readFileSync(PLATFORM_MD, 'utf8'),
    );
    const nextRh = repoDash.afkQueue?.[0] ?? repoDash.recommendedSlice;
    if (
      laneHReady &&
      nextRh &&
      /^RH\d+$/i.test(nextRh) &&
      !repoRunning.has(nextRh) &&
      !runningSubLanes.has('H-repo-health')
    ) {
      const meta = sliceMetaFor(nextRh);
      if (canAutoChain(meta)) {
        ready.push({
          sliceId: nextRh,
          subLane: 'H-repo-health',
          chatRename: chatRenameFromMaster(repoHealthText, nextRh),
          masterDoc: 'docs/projects/repo-health-master.md',
        });
        runningSubLanes.add('H-repo-health');
      }
    }
  }

  // DS-CLEAN serial lane — first item in AFK_QUEUE when Lane I ready
  if (existsSync(DS_CLEAN_MD)) {
    const dsCleanText = readFileSync(DS_CLEAN_MD, 'utf8');
    const dsDash = parseDashboard(dsCleanText);
    const dsRunning = new Set(getRalphRunning(dsCleanText));
    const platformTable = readFileSync(PLATFORM_MD, 'utf8');
    const laneIReady = /\|\s*\*\*I — DS cleanup\*\*[^|\n]*\|[^|\n]*\|[^|\n]*\|\s*🟢[^|\n]*ready/i.test(
      platformTable,
    );
    const laneIStart = /\|\s*\*\*I — DS cleanup\*\*[^|\n]*\|[^|\n]*\|[^|\n]*\|\s*⚪[^|\n]*ready/i.test(
      platformTable,
    );
    const nextDs = dsDash.afkQueue?.[0] ?? dsDash.recommendedSlice;
    if (
      (laneIReady || laneIStart) &&
      nextDs &&
      /^DS\d+$/i.test(nextDs) &&
      !dsRunning.has(nextDs) &&
      !runningSubLanes.has('I-ds-clean')
    ) {
      const meta = sliceMetaFor(nextDs);
      if (canAutoChain(meta)) {
        ready.push({
          sliceId: nextDs,
          subLane: 'I-ds-clean',
          chatRename: chatRenameFromMaster(dsCleanText, nextDs),
          masterDoc: 'docs/projects/ds-clean-master.md',
        });
        runningSubLanes.add('I-ds-clean');
      }
    }
  }

  // FM serial lane — first item in AFK_QUEUE when Lane J ready
  if (existsSync(FM_MD)) {
    const fmText = readFileSync(FM_MD, 'utf8');
    const fmDash = parseDashboard(fmText);
    const fmRunning = new Set(getRalphRunning(fmText));
    const platformTable = readFileSync(PLATFORM_MD, 'utf8');
    const laneJReady = /\|\s*\*\*J — Final migration\*\*[^|\n]*\|[^|\n]*\|[^|\n]*\|\s*(🟢|⚪)[^|\n]*(ready|FM-0)/i.test(
      platformTable,
    );
    const nextFm = fmDash.afkQueue?.[0] ?? fmDash.recommendedSlice;
    if (
      laneJReady &&
      nextFm &&
      /^FM-\d+$/i.test(nextFm) &&
      !fmRunning.has(nextFm) &&
      !runningSubLanes.has('J-fm')
    ) {
      const meta = sliceMetaFor(nextFm);
      if (canAutoChain(meta)) {
        ready.push({
          sliceId: nextFm,
          subLane: 'J-fm',
          chatRename: chatRenameFromMaster(fmText, nextFm),
          masterDoc: 'docs/projects/fm-master.md',
        });
        runningSubLanes.add('J-fm');
      }
    }
  }

  return { ready, blockedBy: dash.blockedBy, completed: [...completed] };
}

/** @param {string} sliceId */
function kickstartPriorityRank(sliceId) {
  if (sliceId.startsWith('S6b-batch-')) {
    const i = PARALLEL_KICKSTART_PRIORITY.indexOf('S6b-batch');
    return i === -1 ? 999 : i;
  }
  const i = PARALLEL_KICKSTART_PRIORITY.indexOf(sliceId);
  return i === -1 ? 500 : i;
}

/**
 * Pick one ready parallel slice (highest priority, idle sub-lane).
 * @param {string} platformText
 * @param {string} dlmText
 * @param {string | null} [justMergedSlice] — treat as complete even if STATUS not updated yet
 * @param {string} [workersExitText]
 */
export function pickNextParallelSlice(platformText, dlmText, justMergedSlice = null, workersExitText = '') {
  const { ready, blockedBy } = computeReadySlices(platformText, dlmText, justMergedSlice, workersExitText);
  if (blockedBy && blockedBy !== 'none') return null;
  if (!ready.length) return null;
  const sorted = [...ready].sort(
    (a, b) => kickstartPriorityRank(a.sliceId) - kickstartPriorityRank(b.sliceId),
  );
  return sorted[0] ?? null;
}

function main() {
  const platformText = readFileSync(PLATFORM_MD, 'utf8');
  const dlmText = readFileSync(DLM_MD, 'utf8');
  const workersExitText = readFileSync(WORKERS_EXIT_MD, 'utf8');
  const { ready, blockedBy, completed } = computeReadySlices(platformText, dlmText, null, workersExitText);

  console.log('# RALPH FILL-THE-DAG');
  console.log('');
  console.log(`BLOCKED_BY: ${blockedBy || 'none'}`);
  console.log(`COMPLETED_COUNT: ${completed.length}`);
  console.log(`READY_COUNT: ${ready.length}`);
  console.log('');

  if (!ready.length) {
    console.log('READY_SLICES: none');
    console.log('');
    console.log('All eligible sub-lanes busy, blocked, or waiting on dependencies.');
    return;
  }

  console.log(`READY_SLICES: ${ready.map((r) => r.sliceId).join(', ')}`);
  console.log('');
  for (const r of ready) {
    console.log(`--- ${r.sliceId} ---`);
    console.log(`SUB_LANE: ${r.subLane}`);
    console.log(`CHAT_RENAME: ${r.chatRename}`);
    console.log(`MASTER_DOC: ${r.masterDoc}`);
    console.log(`KICKSTART: Start ${r.sliceId}`);
    console.log('');
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
