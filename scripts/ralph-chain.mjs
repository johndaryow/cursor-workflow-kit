#!/usr/bin/env node
/**
 * Ralph chain planner — deterministic next-slice decision after a PR merge.
 * Cursor adaptation of Pocock Ralph loop (merge → new Cloud Agent → next slice).
 *
 * Usage:
 *   npm run mc:ralph-chain -- --merged-slice W17
 *   npm run mc:ralph-chain -- --pr-title "PLATFORM W17" --pr-body "Slice: W17"
 *   npm run mc:ralph-chain -- --pr-number 180   (requires gh)
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  canAutoChain,
  extractMergedSliceId,
  isDenyListedPr,
  isMaintenancePr,
  nextSliceId,
  sliceMetaFor,
  subLaneFor,
  isS6bInventoryEmpty,
  isFmSoakWaitBlocking,
  DLM_AFK_TERMINAL,
  COVE_AFK_TERMINAL,
  FM_AFK_TERMINAL,
  S6B_F_TERMINAL,
} from './ralph-chain-config.mjs';
import { parseDashboardFields, chatRenameFromMaster } from './mc-chat-meta.mjs';
import { pickNextParallelSlice } from './ralph-fill-dag.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const PLATFORM_MD = resolve(root, 'docs/projects/platform-migration-master.md');
const DLM_MD = resolve(root, 'docs/projects/dlm-master.md');
const COVE_MD = resolve(root, 'docs/projects/cove-master.md');
const CATALOG_MD = resolve(root, 'docs/projects/catalog-match-master.md');
const CDRIVE_MD = resolve(root, 'docs/projects/cdrive-master.md');
const RTE_F_MD = resolve(root, 'docs/projects/rte-foundation-master.md');
const REPO_HEALTH_MD = resolve(root, 'docs/projects/repo-health-master.md');
const DS_CLEAN_MD = resolve(root, 'docs/projects/ds-clean-master.md');
const AB_MD = resolve(root, 'docs/projects/ab-master.md');
const FM_MD = resolve(root, 'docs/projects/fm-master.md');
const IWA_MD = resolve(root, 'docs/projects/iwa-master.md');
const WORKERS_EXIT_MD = resolve(root, 'docs/projects/workers-exit-plan.md');

/** @param {Record<string, string>} [sources] */
function loadMasterSources(sources = {}) {
  const read = (path, fallback = '') =>
    sources[path] ?? (existsSync(path) ? readFileSync(path, 'utf8') : fallback);
  return {
    platformText: sources.platformText ?? read(PLATFORM_MD),
    dlmText: sources.dlmText ?? read(DLM_MD),
    coveText: sources.coveText ?? read(COVE_MD),
    catalogText: sources.catalogText ?? read(CATALOG_MD),
    cdriveText: sources.cdriveText ?? read(CDRIVE_MD),
    rteFText: sources.rteFText ?? read(RTE_F_MD),
    repoHealthText: sources.repoHealthText ?? read(REPO_HEALTH_MD),
    dsCleanText: sources.dsCleanText ?? read(DS_CLEAN_MD),
    abText: sources.abText ?? read(AB_MD),
    fmText: sources.fmText ?? read(FM_MD),
    iwaText: sources.iwaText ?? read(IWA_MD),
    workersExitText: sources.workersExitText ?? read(WORKERS_EXIT_MD),
  };
}

/** @param {string | null | undefined} sliceId @param {ReturnType<typeof loadMasterSources>} masters */
function masterTextForSlice(sliceId, masters) {
  if (!sliceId) return masters.platformText;
  const meta = sliceMetaFor(sliceId);
  if (meta?.masterDoc) {
    const path = resolve(root, meta.masterDoc);
    if (path === CATALOG_MD) return masters.catalogText || masters.platformText;
    if (path === CDRIVE_MD) return masters.cdriveText || masters.platformText;
    if (path === RTE_F_MD) return masters.rteFText || masters.platformText;
    if (path === COVE_MD) return masters.coveText;
    if (path === DLM_MD) return masters.dlmText;
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  if (sliceId.startsWith('COVE P')) return masters.coveText;
  if (sliceId.startsWith('DLM-')) return masters.dlmText;
  if (/^CM\d+$/.test(sliceId)) return masters.catalogText || masters.platformText;
  if (sliceId.startsWith('CDRIVE-')) return masters.cdriveText || masters.platformText;
  if (sliceId.startsWith('RTE-F')) return masters.rteFText || masters.platformText;
  if (sliceId.startsWith('IWA-')) return masters.iwaText || masters.platformText;
  if (sliceId.startsWith('RH')) return masters.repoHealthText || masters.platformText;
  if (sliceId.startsWith('DS')) return masters.dsCleanText || masters.platformText;
  if (sliceId.startsWith('AB-')) return masters.abText || masters.platformText;
  if (sliceId.startsWith('FM-')) return masters.fmText || masters.platformText;
  return masters.platformText;
}

/** @param {string | null | undefined} mergedSlice @param {string} masterText */
function isProgramAfkQueueComplete(mergedSlice, masterText) {
  if (!mergedSlice) return false;
  if (/^W\d/i.test(mergedSlice) || mergedSlice.startsWith('S6b-')) return false;
  const program = sliceMetaFor(mergedSlice)?.program;
  if (!program || program === 'PLATFORM' || program === 'WORKFLOW') return false;
  const dash = masterText.match(/```text\n([\s\S]*?)```/)?.[1] ?? '';
  const afkQueue = dash.match(/^AFK_QUEUE:\s*(.+)$/m)?.[1]?.trim() ?? 'none';
  return !afkQueue || afkQueue === 'none';
}

/** @param {string} path */
function readMaster(path) {
  return readFileSync(path, 'utf8');
}

/** @param {string} masterText */
function parseDashboard(masterText) {
  const start = masterText.indexOf('## STATUS DASHBOARD');
  const after = masterText.slice(start);
  const end = after.indexOf('\n---', '## STATUS DASHBOARD'.length);
  const block = end === -1 ? after : after.slice(0, end);
  return parseDashboardFields(block);
}

/** @param {string} masterText */
function getRalphRunning(masterText) {
  const dash = masterText.match(/```text\n([\s\S]*?)```/)?.[1] ?? '';
  const line = dash.match(/^RALPH_RUNNING:\s*(.+)$/m)?.[1]?.trim() ?? 'none';
  if (line === 'none' || !line) return [];
  return line.split('|').map((s) => s.trim()).filter(Boolean);
}

/**
 * Slices that just merged are not "still running" — doc may be stale (WORKFLOW-P18).
 * @param {string[]} ralphRunning
 * @param {string | null} mergedSlice
 */
export function effectiveRalphRunning(ralphRunning, mergedSlice) {
  if (!mergedSlice) return ralphRunning;
  return ralphRunning.filter((id) => id !== mergedSlice);
}

/**
 * @param {string} masterText platform-migration-master.md
 * @param {string} [workersExitText] workers-exit-plan.md — `(DONE` slice markers
 */
function getCompletedSlices(masterText, workersExitText = '') {
  const completed = new Set();
  for (const m of masterText.matchAll(/\b(W\d+[a-z]?)\s+✅/gi)) {
    completed.add(normalizeWorkerSliceId(m[1]));
  }
  for (const m of masterText.matchAll(/\bDLM-(\d+)\s+✅/gi)) {
    completed.add(`DLM-${m[1]}`);
  }
  for (const m of masterText.matchAll(/S6b[^.\n]{0,40}batch\s*(\d+)\s+✅/gi)) {
    completed.add(`S6b-batch-${m[1]}`);
  }
  if (workersExitText) {
    for (const m of workersExitText.matchAll(/—\s*(W\d+[a-z]?)\s*\([^)]*DONE/gi)) {
      completed.add(normalizeWorkerSliceId(m[1]));
    }
  }
  // Baseline creative spine (always done per workers-exit-plan)
  for (const id of ['W6d', 'W7', 'W8']) completed.add(id);
  return completed;
}

/** @param {string} raw */
function normalizeWorkerSliceId(raw) {
  const m = /^W(\d+[a-z]?)$/i.exec(raw.trim());
  return m ? `W${m[1]}` : raw;
}

/** @param {string} masterText */
function laneBRunningFromTable(masterText) {
  const row = masterText.match(
    /\|\s*\*\*B — Workers\*\*[^|\n]*\|[^|\n]*\|[^|\n]*\|\s*🟢[^|\n]*\|/,
  );
  return Boolean(row);
}

/** @param {string} masterText */
function laneARunningFromTable(masterText) {
  const row = masterText.match(
    /\|\s*\*\*A — Media\*\*[^|\n]*\|[^|\n]*\|[^|\n]*\|\s*🟢[^|\n]*\|/,
  );
  return Boolean(row);
}

/** @param {string} subLane */
function isSubLaneRunning(subLane, ralphRunning, platformText) {
  if (ralphRunning.some((id) => subLaneFor(id) === subLane)) return true;
  if (subLane === 'A-s6b' && laneARunningFromTable(platformText)) return true;
  return false;
}

/** @param {Record<string, string>} args */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--merged-slice') out.mergedSlice = argv[++i];
    else if (a === '--pr-title') out.prTitle = argv[++i];
    else if (a === '--pr-body') out.prBody = argv[++i];
    else if (a === '--pr-number') out.prNumber = argv[++i];
    else if (a === '--json') out.json = true;
  }
  return out;
}

/** @param {string} prNumber */
function fetchPr(prNumber) {
  const r = spawnSync(
    'gh',
    ['pr', 'view', prNumber, '--json', 'title,body'],
    { encoding: 'utf8', cwd: root },
  );
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

/**
 * Build a successful chain result for a target slice.
 * @param {object} base
 * @param {string} targetSlice
 * @param {string} reason
 * @param {'serial'|'parallel-fill'} chainMode
 * @param {string} platformText
 */
function buildChainResult(base, targetSlice, reason, chainMode, masters) {
  const nextMeta = sliceMetaFor(targetSlice);
  const subLane = subLaneFor(targetSlice);
  const masterForRename = masterTextForSlice(targetSlice, masters);
  const chatRename = chatRenameFromMaster(masterForRename, targetSlice);
  const masterDoc = nextMeta?.masterDoc ?? 'docs/projects/platform-migration-master.md';

  return {
    ...base,
    action: 'chain',
    nextSlice: targetSlice,
    gatesPass: true,
    gateFailures: [],
    reason,
    chainMode,
    subLane,
    chatRename,
    masterDoc,
    program: nextMeta?.program ?? 'PLATFORM',
    autonomy: nextMeta?.autonomy ?? 'AFK',
  };
}

/**
 * @param {object} input
 * @param {{ platformText?: string, dlmText?: string }} [sources]
 */
export function planRalphChain(input, sources = {}) {
  const masters = loadMasterSources(sources);
  const { platformText, dlmText, coveText, workersExitText } = masters;

  let mergedSlice = input.mergedSlice ?? null;
  if (!mergedSlice && (input.prTitle || input.prBody)) {
    mergedSlice = extractMergedSliceId(`${input.prTitle ?? ''}\n${input.prBody ?? ''}`);
  }

  const statusText = masterTextForSlice(mergedSlice, masters);
  const fields = parseDashboard(statusText);
  const platformFields = parseDashboard(platformText);
  const ralphRunning = getRalphRunning(statusText);
  const activeRalphRunning = effectiveRalphRunning(ralphRunning, mergedSlice);
  const gateFailures = [];

  const base = {
    mergedSlice,
    blockedBy: platformFields.blockedBy || fields.blockedBy,
  };

  const blockedBy = platformFields.blockedBy || fields.blockedBy;
  if (blockedBy && blockedBy !== 'none') {
    gateFailures.push(`BLOCKED_BY: ${blockedBy}`);
    return {
      ...base,
      action: 'notify',
      nextSlice: null,
      gatesPass: false,
      gateFailures,
      reason: 'Platform blocked',
    };
  }

  // Doc-only STATUS / dashboard PRs — all programs; never start a new slice
  if (isMaintenancePr(input.prTitle ?? '', input.prBody ?? '')) {
    return {
      ...base,
      action: 'notify',
      nextSlice: null,
      gatesPass: false,
      gateFailures: ['Maintenance/doc-only PR — Ralph chain skipped (one slice = one merge)'],
      reason: 'Doc-only STATUS PR — no new slice',
      chainMode: 'skip-maintenance',
    };
  }

  if (!mergedSlice) {
    gateFailures.push('Could not identify merged slice from PR');
    return {
      ...base,
      action: 'notify',
      nextSlice: null,
      gatesPass: false,
      gateFailures,
      reason: 'Unknown merged slice',
    };
  }

  if (isDenyListedPr(input.prTitle ?? '', input.prBody ?? '')) {
    gateFailures.push('Deny list keyword in PR');
    return {
      ...base,
      action: 'notify',
      nextSlice: null,
      gatesPass: false,
      gateFailures,
      reason: 'Deny list',
    };
  }

  const serialNext = nextSliceId(mergedSlice);
  if (!serialNext) {
    if (mergedSlice.startsWith('S6b-F')) {
      const m = /^S6b-F(\d+)$/i.exec(mergedSlice);
      const fNum = m ? Number.parseInt(m[1], 10) : NaN;
      if (Number.isFinite(fNum) && fNum >= S6B_F_TERMINAL && isS6bInventoryEmpty(platformText)) {
        return {
          ...base,
          action: 'notify',
          nextSlice: null,
          gatesPass: false,
          gateFailures: ['S6b lean conveyor complete — no further F slices'],
          reason: 'S6b complete',
          subLane: 'A-s6b',
          chainMode: 's6b-terminal',
        };
      }
    }
    if (mergedSlice === DLM_AFK_TERMINAL) {
      gateFailures.push('DLM AFK chain complete — DLM-12 requires CEO explicit OK');
      return {
        ...base,
        action: 'notify',
        nextSlice: 'DLM-12',
        gatesPass: false,
        gateFailures,
        reason: 'DLM AFK terminal — HITL cutover next',
        subLane: subLaneFor('DLM-12'),
        chainMode: 'dlm-terminal',
      };
    }
    if (mergedSlice === COVE_AFK_TERMINAL) {
      gateFailures.push('COVE AFK chain complete — COVE P7 requires CEO explicit OK (bulk backfill)');
      return {
        ...base,
        action: 'notify',
        nextSlice: 'COVE P7',
        gatesPass: false,
        gateFailures,
        reason: 'COVE AFK terminal — HITL bulk migration next',
        subLane: subLaneFor('COVE P7'),
        chainMode: 'cove-terminal',
      };
    }
    if (mergedSlice === FM_AFK_TERMINAL) {
      const prog = sliceMetaFor(mergedSlice)?.program ?? 'FM';
      return {
        ...base,
        action: 'notify',
        nextSlice: null,
        gatesPass: true,
        gateFailures: [],
        reason: `${prog} program complete — Lane J idle`,
        subLane: subLaneFor(mergedSlice),
        chainMode: 'fm-terminal',
      };
    }
    if (isProgramAfkQueueComplete(mergedSlice, statusText)) {
      const prog = sliceMetaFor(mergedSlice)?.program ?? 'program';
      return {
        ...base,
        action: 'notify',
        nextSlice: null,
        gatesPass: false,
        gateFailures: [`${prog} AFK_QUEUE complete — no serial successor`],
        reason: `${prog} program AFK queue complete`,
        subLane: subLaneFor(mergedSlice),
        chainMode: 'program-terminal',
      };
    }
    const parallel = pickNextParallelSlice(platformText, dlmText, mergedSlice, workersExitText);
    if (parallel) {
      const target = parallel.sliceId;
      const targetMeta = sliceMetaFor(target);
      if (!canAutoChain(targetMeta)) {
        gateFailures.push(`Parallel kickstart ${target} is HITL — CEO must act`);
        return {
          ...base,
          action: 'notify',
          nextSlice: target,
          gatesPass: false,
          gateFailures,
          reason: 'HITL on parallel kickstart',
          subLane: parallel.subLane,
        };
      }
      if (activeRalphRunning.includes(target)) {
        gateFailures.push(`Parallel target ${target} already in RALPH_RUNNING`);
        return {
          ...base,
          action: 'notify',
          nextSlice: target,
          gatesPass: false,
          gateFailures,
          reason: 'Next slice already running',
          subLane: parallel.subLane,
        };
      }
      if (isSubLaneRunning(parallel.subLane, activeRalphRunning, platformText)) {
        gateFailures.push(`Sub-lane ${parallel.subLane} already running`);
        return {
          ...base,
          action: 'notify',
          nextSlice: target,
          gatesPass: false,
          gateFailures,
          reason: 'Sub-lane busy',
          subLane: parallel.subLane,
        };
      }
      return buildChainResult(
        base,
        target,
        `${mergedSlice} lane complete → parallel fill ${target}`,
        'parallel-fill',
        masters,
      );
    }
    return {
      ...base,
      action: 'notify',
      nextSlice: null,
      gatesPass: false,
      gateFailures: [
        `No serial successor for ${mergedSlice} and no idle parallel slice ready`,
      ],
      reason: 'All lanes busy or waiting on dependencies',
      subLane: subLaneFor(mergedSlice),
    };
  }

  const nextSlice = serialNext;

  const nextMeta = sliceMetaFor(nextSlice);
  if (!canAutoChain(nextMeta)) {
    gateFailures.push(`Next slice ${nextSlice} is HITL or not auto_when_green — CEO must act`);
    return {
      ...base,
      action: 'notify',
      nextSlice,
      gatesPass: false,
      gateFailures,
      reason: 'HITL gate on next slice',
      subLane: subLaneFor(nextSlice),
    };
  }

  const subLane = subLaneFor(nextSlice);
  if (activeRalphRunning.includes(nextSlice)) {
    gateFailures.push(`Next slice ${nextSlice} already in RALPH_RUNNING`);
    return {
      ...base,
      action: 'notify',
      nextSlice,
      gatesPass: false,
      gateFailures,
      reason: 'Next slice already running',
      subLane,
    };
  }
  const s6bSerialContinue =
    mergedSlice.startsWith('S6b-F') &&
    nextSlice.startsWith('S6b-F') &&
    !activeRalphRunning.some((id) => subLaneFor(id) === 'A-s6b');
  if (!s6bSerialContinue && isSubLaneRunning(subLane, activeRalphRunning, platformText)) {
    gateFailures.push(`Sub-lane ${subLane} already running (RALPH_RUNNING or §5b 🟢)`);
    return {
      ...base,
      action: 'notify',
      nextSlice,
      gatesPass: false,
      gateFailures,
      reason: 'Sub-lane busy',
      subLane,
    };
  }

  // FM-specific: FM-10 waits until soak elapsed unless CEO accelerated delete in STATUS
  if (mergedSlice === 'FM-9' && nextSlice === 'FM-10' && isFmSoakWaitBlocking(masters.fmText)) {
    gateFailures.push('FM soak window not elapsed — FM-10 blocked until FM_SOAK_END or CEO accelerated OK');
    return {
      ...base,
      action: 'notify',
      nextSlice: 'FM-10',
      gatesPass: false,
      gateFailures,
      reason: 'FM soak gate — wait until FM_SOAK_END',
      subLane: 'J-fm',
      chainMode: 'fm-soak-wait',
    };
  }

  // S6b-specific: stop when inventory empty (batch or lean F conveyor)
  if (nextSlice.startsWith('S6b-batch-') || nextSlice.startsWith('S6b-F')) {
    if (isS6bInventoryEmpty(platformText)) {
      gateFailures.push('S6b inventory empty');
      return {
        ...base,
        action: 'notify',
        nextSlice,
        gatesPass: false,
        gateFailures,
        reason: 'S6b complete',
        subLane,
      };
    }
    if (nextSlice.startsWith('S6b-batch-') && laneARunningFromTable(platformText)) {
      gateFailures.push('Lane A already 🟢 running');
      return {
        ...base,
        action: 'notify',
        nextSlice,
        gatesPass: false,
        gateFailures,
        reason: 'Lane A busy',
        subLane,
      };
    }
  }

  const masterForRename = masterTextForSlice(nextSlice, masters);
  const chatRename = chatRenameFromMaster(masterForRename, nextSlice);
  const masterDoc = nextMeta?.masterDoc ?? 'docs/projects/platform-migration-master.md';

  return {
    ...base,
    action: 'chain',
    nextSlice,
    gatesPass: true,
    gateFailures: [],
    reason: `${mergedSlice} merged → execute ${nextSlice}`,
    chainMode: 'serial',
    subLane,
    chatRename,
    masterDoc,
    program: nextMeta?.program ?? 'PLATFORM',
    autonomy: nextMeta?.autonomy ?? 'AFK',
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let prTitle = args.prTitle;
  let prBody = args.prBody;

  if (args.prNumber && !args.mergedSlice) {
    const pr = fetchPr(args.prNumber);
    if (pr) {
      prTitle = pr.title;
      prBody = pr.body;
    }
  }

  const result = planRalphChain({
    mergedSlice: args.mergedSlice,
    prTitle,
    prBody,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('# RALPH CHAIN PLAN');
  console.log('');
  console.log(`RALPH_ACTION: ${result.action}`);
  console.log(`MERGED_SLICE: ${result.mergedSlice ?? 'unknown'}`);
  console.log(`NEXT_SLICE: ${result.nextSlice ?? 'none'}`);
  console.log(`GATES_PASS: ${result.gatesPass}`);
  console.log(`SUB_LANE: ${result.subLane ?? 'n/a'}`);
  console.log(`CHAT_RENAME: ${result.chatRename ?? 'n/a'}`);
  console.log(`MASTER_DOC: ${result.masterDoc ?? 'n/a'}`);
  console.log(`CHAIN_MODE: ${result.chainMode ?? 'n/a'}`);
  console.log(`REASON: ${result.reason}`);
  if (result.gateFailures?.length) {
    console.log(`GATE_FAILURES: ${result.gateFailures.join(' · ')}`);
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}

export { getCompletedSlices, getRalphRunning, parseDashboard };
