/**
 * Ralph chain config — merge-triggered AFK chains.
 * Workers/S6b/DLM/COVE: hardcoded serial maps. All programs: doc tags via ralph-master-registry.mjs.
 * Used by ralph-chain.mjs and ralph-fill-dag.mjs (Cursor adaptation of Pocock Ralph loop).
 */
import {
  loadMasterRegistry,
  normalizeDocSliceId,
  nextSliceFromRegistry,
  registrySliceMeta,
  subLaneForDocSlice,
} from './ralph-master-registry.mjs';

/** @typedef {{ autonomy: 'AFK'|'HITL', ceoGate: string, mergePolicy: string, program: string, masterDoc: string }} SliceMeta */

/** Serial next slice per completed slice id (null = lane terminal for Ralph). */
export const WORKER_NEXT = {
  W9: 'W10',
  W10: 'W11',
  W12: 'W13',
  W13: 'W14',
  W14: 'W15',
  W17: 'W18',
  W18: 'W19',
  W19: 'W20',
  W21: 'W25',
  W22: 'W24',
  W26: 'W27',
  W27: 'W28',
  W28: 'W29',
  W29: 'W30',
  W30: 'W31',
  W31: 'W32',
};

/** Dependencies before a slice may start (fill-the-DAG). */
export const WORKER_DEPS = {
  W9: ['W8'],
  W10: ['W9'],
  W11: ['W10'],
  W12: ['W8'],
  W13: ['W12'],
  W14: ['W13'],
  W15: ['W14'],
  W16: ['W8'],
  W17: ['W8'],
  W18: ['W17'],
  W19: ['W18'],
  W20: ['W19'],
  W21: ['W10'],
  W22: ['W10'],
  W23: ['W10'],
  W24: ['W22'],
  W25: ['W21'],
  W26: ['W11', 'W25'],
  W27: ['W26'],
  W28: ['W27'],
  W29: ['W28'],
  W30: ['W29'],
  W31: ['W30'],
  W32: ['W31'],
};

/** Sub-lane within Lane B — parallel OK across different sub-lanes. */
export const WORKER_SUB_LANE = {
  W9: 'B-creative',
  W10: 'B-creative',
  W11: 'B-creative',
  W12: 'B-board',
  W13: 'B-board',
  W14: 'B-board',
  W15: 'B-board',
  W16: 'B-reset',
  W17: 'B-library',
  W18: 'B-library',
  W19: 'B-library',
  W20: 'B-library',
  W21: 'B-hr',
  W22: 'B-schedulers',
  W23: 'B-gmail',
  W24: 'B-shopify',
  W25: 'B-payroll',
  W26: 'B-closeout',
  W27: 'B-phase-c-purge',
  W28: 'B-phase-c-region',
  W29: 'B-phase-c-media',
  W30: 'B-phase-c-edge',
  W31: 'B-phase-c-automation',
  W32: 'B-phase-c-shopify',
};

/** S6b lean-plan serial chain (F7–F11 explicit; F12+ open-ended in nextSliceId). */
export const S6B_F_NEXT = {
  'S6b-F7': 'S6b-F8',
  'S6b-F8': 'S6b-F9',
  'S6b-F9': 'S6b-F10',
  'S6b-F10': 'S6b-F11',
  'S6b-F11': 'S6b-F12',
};

/** First F-number that auto-increments (F12 → F13 → … lean conveyor). */
export const S6B_F_OPEN_ENDED_FROM = 12;

/** Last S6b lean F-slice — Ralph stops here (inventory 0 after F23). */
export const S6B_F_TERMINAL = 23;

/** Last AFK slice in DLM Lane E — Ralph stops here (DLM-12+ is HITL). */
export const DLM_AFK_TERMINAL = 'DLM-11';

/** DLM serial chain (AFK slices auto-chain; stops before DLM-12 HITL). */
export const DLM_NEXT = {
  'DLM-1': 'DLM-2',
  'DLM-5': 'DLM-6',
  'DLM-7': 'DLM-8',
  'DLM-8': 'DLM-9',
  'DLM-9': 'DLM-10',
  'DLM-10': 'DLM-11',
};

export const DLM_DEPS = {
  'DLM-1': [],
  'DLM-2': ['DLM-1'],
  'DLM-3': ['DLM-2'],
  'DLM-4': ['DLM-3'],
  'DLM-5': ['DLM-4'],
  'DLM-6': ['DLM-5'],
  'DLM-7': ['DLM-6'],
  'DLM-8': ['DLM-7'],
  'DLM-9': ['DLM-8'],
  'DLM-10': ['DLM-9'],
  'DLM-11': ['DLM-10'],
};

/** Last AFK slice in COVE — Ralph stops here (COVE P7 is HITL bulk migration). */
export const COVE_AFK_TERMINAL = 'COVE P6';

/** Last AFK slice in FM Lane J — Ralph stops here (program complete). */
export const FM_AFK_TERMINAL = 'FM-10';

/** COVE serial chain (P2–P6 AFK; stops before P7 HITL). */
export const COVE_NEXT = {
  'COVE P1': 'COVE P2',
  'COVE P2': 'COVE P3',
  'COVE P3': 'COVE P4',
  'COVE P4': 'COVE P5',
  'COVE P5': 'COVE P6',
};

/** @type {Record<string, SliceMeta>} */
export const SLICE_META = {
  // Workers — all AFK auto_when_green per workers-exit-plan §5
  W9: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W10: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W11: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W12: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W13: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W14: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W15: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W16: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W17: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W18: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W19: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W20: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W21: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W22: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W23: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W24: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W25: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W26: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W27: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W28: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W29: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W30: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W31: { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  W32: { autonomy: 'HITL', ceoGate: 'human_only', mergePolicy: 'recommend_merge', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  // DLM — AFK slices auto-chain; HITL (DLM-12+) stops Ralph until CEO acts
  'DLM-1': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'DLM', masterDoc: 'docs/projects/dlm-master.md' },
  'DLM-5': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'DLM', masterDoc: 'docs/projects/dlm-master.md' },
  'DLM-8': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'DLM', masterDoc: 'docs/projects/dlm-master.md' },
  'DLM-9': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'DLM', masterDoc: 'docs/projects/dlm-master.md' },
  'DLM-10': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'DLM', masterDoc: 'docs/projects/dlm-master.md' },
  'DLM-11': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'DLM', masterDoc: 'docs/projects/dlm-master.md' },
  'DLM-12': { autonomy: 'HITL', ceoGate: 'explicit_ok_in_chat', mergePolicy: 'do_not_merge', program: 'DLM', masterDoc: 'docs/projects/dlm-master.md' },
  'DLM-13': { autonomy: 'HITL', ceoGate: 'explicit_ok_in_chat', mergePolicy: 'do_not_merge', program: 'DLM', masterDoc: 'docs/projects/dlm-master.md' },
  // S6b batches — pattern S6b-batch-N
  'S6b-batch': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  // S6b lean plan (F7+)
  'S6b-F7': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  'S6b-F8': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  'S6b-F9': { autonomy: 'HITL', ceoGate: 'explicit_ok_in_chat', mergePolicy: 'recommend_merge', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  'S6b-F10': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  'S6b-F11': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  'S6b-F12': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'PLATFORM', masterDoc: 'docs/projects/platform-migration-master.md' },
  // COVE — P2–P6 AFK auto-chain; P7 HITL (bulk Firebase→R2 backfill)
  'COVE P2': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'COVE', masterDoc: 'docs/projects/cove-master.md' },
  'COVE P3': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'COVE', masterDoc: 'docs/projects/cove-master.md' },
  'COVE P4': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'COVE', masterDoc: 'docs/projects/cove-master.md' },
  'COVE P5': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'COVE', masterDoc: 'docs/projects/cove-master.md' },
  'COVE P6': { autonomy: 'AFK', ceoGate: 'none', mergePolicy: 'auto_when_green', program: 'COVE', masterDoc: 'docs/projects/cove-master.md' },
  'COVE P7': { autonomy: 'HITL', ceoGate: 'explicit_ok_in_chat', mergePolicy: 'do_not_merge', program: 'COVE', masterDoc: 'docs/projects/cove-master.md' },
};

/**
 * When a serial sub-lane ends, pick the next parallel kickstart in this order.
 * (First ready slice wins — skips busy sub-lanes via fill-dag.)
 */
export const PARALLEL_KICKSTART_PRIORITY = [
  'W27',
  'W15',
  'W21',
  'W22',
  'W23',
  'W16',
  'W12',
  'W17',
  'W24',
  'W25',
  'DLM-8',
  'DLM-1',
  'DLM-5',
  'S6b-batch',
];

/** Deny list — never auto-chain (CEO / cost gates). Title always scanned. */
export const DENY_KEYWORDS = [
  'dns',
  'schema migration',
  'first bulk apply',
  'billing cancel',
];

/** Body-only deny phrases (stricter than title — avoids SESSION REPORT false positives). */
export const DENY_BODY_PHRASES = [
  'dns cutover',
  'schema migration',
  'first bulk apply',
  'billing cancel',
  'ceo must provide credentials',
  'human_only: credentials',
];

/**
 * True when PR should block Ralph chain (dangerous / CEO-gated work).
 * Real AFK slice closeouts skip body keyword scan — only the title is checked.
 *
 * @param {string} [title]
 * @param {string} [body]
 */
export function isDenyListedPr(title = '', body = '') {
  const titleLower = title.toLowerCase();
  if (DENY_KEYWORDS.some((k) => titleLower.includes(k))) return true;

  const b = body || '';
  const bl = b.toLowerCase();
  const hasAfkCloseout =
    /##\s*session report|session report/i.test(b) &&
    /slice\s*:/i.test(b) &&
    /what shipped|exit test|status:\s*done/i.test(bl);

  if (hasAfkCloseout) return false;

  if (DENY_BODY_PHRASES.some((p) => bl.includes(p))) return true;
  if (/\bcredentials\b/.test(bl) && /ceo action|human_only|must provide/i.test(bl)) {
    return true;
  }
  return false;
}

/**
 * Parse FM STATUS dashboard block from fm-master.md.
 *
 * @param {string} fmText
 */
export function parseFmStatusBlock(fmText) {
  const block = fmText.match(/```text\n([\s\S]*?)```/)?.[1] ?? '';
  const get = (key) => block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? null;
  return {
    ceoGate: get('CEO_GATE'),
    fmSoakPolicy: get('FM_SOAK_POLICY'),
    fmSoakEnd: get('FM_SOAK_END'),
    blockedBy: get('BLOCKED_BY'),
  };
}

/**
 * True when FM 30-day soak window has elapsed (FM_SOAK_END ≤ today UTC).
 *
 * @param {string} fmText docs/projects/fm-master.md contents
 */
export function isFmSoakElapsed(fmText) {
  const { fmSoakEnd: end } = parseFmStatusBlock(fmText);
  if (!end) return false;
  const todayUtc = new Date().toISOString().slice(0, 10);
  return todayUtc >= end;
}

/**
 * CEO waived P1 calendar wait — daily guardrail continues (parallel_guardrail).
 *
 * @param {string} fmText
 */
export function isFmCeoAcceleratedDelete(fmText) {
  const { ceoGate, fmSoakPolicy } = parseFmStatusBlock(fmText);
  return ceoGate === 'explicit_ok_in_chat' && fmSoakPolicy === 'parallel_guardrail';
}

/**
 * True when FM-10 must wait for FM_SOAK_END before Ralph chains or bucket delete.
 *
 * @param {string} fmText
 */
export function isFmSoakWaitBlocking(fmText) {
  if (isFmSoakElapsed(fmText)) return false;
  if (isFmCeoAcceleratedDelete(fmText)) return false;
  return true;
}

export function isS6bInventoryEmpty(platformText) {
  const statusBlock =
    platformText.match(/## STATUS DASHBOARD[\s\S]*?```text\n([\s\S]*?)```/)?.[1] ?? '';

  // STATUS dashboard is authoritative when it shows zero inventory / S6b done
  if (
    /inventory\s+\*\*0\*\*|inventory\s+0\b|S6b\s+DONE/i.test(statusBlock) ||
    /S6B_LEAN:.*inventory\s+\*\*0\*\*/i.test(statusBlock)
  ) {
    return true;
  }

  if (/S6b ON HOLD/i.test(platformText) && !/S6b\s+DONE/i.test(platformText)) return false;
  if (
    /\b0\b pending URLs|pending URLs[^(]*\(\s*\*\*0\*\*/i.test(platformText) ||
    /inventory\s+\*\*0\*\*|inventory\s+0\b/i.test(platformText) ||
    /S6b\s+DONE|S6B_LEAN:.*inventory\s+\*\*0\*\*/i.test(platformText)
  ) {
    return true;
  }
  const scorecard = platformText.match(/pending URLs[^|\n]*\|\s*\*\*([\d,]+)\*\*/i);
  if (scorecard && scorecard[1].replace(/,/g, '') === '0') return true;
  const projectsPending = platformText.match(
    /(\d[\d,]*)\s+projects?\s+w\/\s+pending URLs/i,
  );
  if (projectsPending && projectsPending[1].replace(/,/g, '') === '0') return true;
  return false;
}

/**
 * WORKFLOW program PRs (rules, Ralph setup, CI) — never start PLATFORM migration chains.
 *
 * @param {string} [title]
 * @param {string} [body]
 */
export function isWorkflowMetaPr(title = '', body = '') {
  const t = title.trim();
  const b = body || '';
  const sliceLine = b.match(/Slice:\s*([^\n]+)/i)?.[1]?.trim() ?? '';
  const normalizedSlice = normalizeSliceId(sliceLine);
  // Combined infra + program slice (e.g. WORKFLOW-P16 + RTE-F3) — chain on the real slice id
  if (normalizedSlice && !/^WORKFLOW-P?\d*$/i.test(normalizedSlice)) return false;
  if (/^WORKFLOW(\s*:|[-\s])/i.test(t)) return true;
  if (/^WORKFLOW-P\d+/i.test(t)) return true;
  if (/^fix\(ralph\)\s*:/i.test(t)) return true;
  if (/(?:^|\n)-?\s*Program:\s*WORKFLOW\b/im.test(b)) return true;
  if (/Slice:\s*WORKFLOW-P\d+/i.test(b)) return true;
  return false;
}

/**
 * True when PR is doc/STATUS maintenance only — must NOT trigger Ralph chain.
 * Applies to all programs (PLATFORM, DLM, WORKFLOW, AB, GLIB, …).
 *
 * @param {string} [title]
 * @param {string} [body]
 */
export function isMaintenancePr(title = '', body = '') {
  const t = title.trim();
  const tl = t.toLowerCase();
  const b = body || '';
  const bl = b.toLowerCase();

  const sliceLine = stripMarkdownInline(b.match(/Slice:\s*([^\n]+)/i)?.[1]?.trim() ?? '');
  const normalizedSlice = normalizeSliceId(sliceLine);
  const hasSessionReport =
    /##\s*session report|session report/i.test(b) && /slice\s*:/i.test(b);
  const hasShippedSignal =
    /what shipped|exit test|status:\s*done|autonomy:\s*afk/i.test(bl);

  // Real migration slice closeout — never maintenance (even when title includes WORKFLOW-P##)
  if (hasSessionReport && hasShippedSignal && normalizedSlice) return false;

  // WORKFLOW meta (rules, automations, planner fixes) — notify only
  if (isWorkflowMetaPr(title, body)) return true;

  // docs:* — planning/decomposition/STATUS unless body has a real machine slice id
  if (/^docs(\([^)]+\))?\s*:/i.test(t)) {
    if (!normalizedSlice) return true;
    if (/status|dashboard|post-merge|scorecard|changelog|ralph_running/i.test(tl + bl)) {
      return true;
    }
  }

  // Post-merge STATUS sweeps (title mentions LAST_MERGED_PR, no real report)
  if (/post-merge/i.test(tl) && /status|dashboard|last_merged_pr/i.test(tl + bl)) {
    if (!hasSessionReport) return true;
  }

  // One-line STATUS fix body (agent anti-pattern)
  if (/^post-merge status fix/i.test(b.trim())) return true;

  // STATUS-only closeout PR (second PR after slice — must not chain or re-launch)
  if (/status closeout/i.test(tl + bl)) return true;
  if (
    /clear ralph_running|advance (afk_)?queue|last_merged_pr/i.test(bl) &&
    !hasShippedSignal
  ) {
    return true;
  }

  // Program planning PR — slice line is human label, not machine id (not body text like "pre-existing")
  if (
    hasSessionReport &&
    sliceLine &&
    !normalizedSlice &&
    /planning|decomposition|slices planned|\bpre-fm\b/i.test(sliceLine)
  ) {
    return true;
  }

  // Title lists an FM slice range (planning doc) — not a single merged slice
  if (/vertical slices|slices planned|tracer bullets/i.test(tl) && /FM-\d+[….…\-–]+\s*FM-\d+/i.test(t)) {
    return true;
  }

  return false;
}

/**
 * @param {SliceMeta | undefined} meta
 */
export function canAutoChain(meta) {
  if (!meta) return false;
  return (
    meta.autonomy === 'AFK' &&
    meta.ceoGate === 'none' &&
    meta.mergePolicy === 'auto_when_green'
  );
}

/** Strip markdown bold/italic wrappers from PR slice lines (`**Slice:** AB-1`). */
function stripMarkdownInline(raw) {
  return raw.replace(/\*+/g, '').trim();
}

/**
 * @param {string} text PR title + body
 */
export function extractMergedSliceId(text) {
  const t = text || '';

  // Every "Slice:" line — use first that normalizes to a migration id (skip WORKFLOW-P* / human names)
  for (const m of t.matchAll(/Slice:\s*([^\n]+)/gi)) {
    const raw = stripMarkdownInline(m[1].trim());
    if (/^WORKFLOW-P\d+/i.test(raw)) continue;
    const norm = normalizeSliceId(raw);
    if (norm) return norm;
  }

  const titleLine = t.split('\n')[0] ?? '';
  const titleIsDocs = /^docs(\([^)]+\))?\s*:/i.test(titleLine.trim());

  const platformTitle = !titleIsDocs && titleLine.match(/\bPLATFORM\s+W(\d+[a-z]?)\b/i);
  if (platformTitle) return `W${platformTitle[1]}`;

  if (!titleIsDocs) {
    const dlmTitle = titleLine.match(/\bDLM-(\d+)\b/i);
    if (dlmTitle) return `DLM-${dlmTitle[1]}`;

    const s6bTitle = titleLine.match(/\bS6b[^0-9]{0,20}batch\s*(\d+)\b/i);
    if (s6bTitle) return `S6b-batch-${s6bTitle[1]}`;

    const s6bFTitle = titleLine.match(/\bS6b-F(\d+)\b/i);
    if (s6bFTitle) return `S6b-F${s6bFTitle[1]}`;

    const coveTitle = titleLine.match(/\bCOVE\s+P(\d+)/i);
    if (coveTitle) return `COVE P${coveTitle[1]}`;

    const cdriveTitle = titleLine.match(/\bCDRIVE-(\d+)\b/i);
    if (cdriveTitle) return `CDRIVE-${cdriveTitle[1]}`;

    const catalogTitle = titleLine.match(/\bCATALOG-MATCH\s+CM(\d+)\b/i);
    if (catalogTitle) return `CM${catalogTitle[1]}`;

    const cmTitle = titleLine.match(/\bCM(\d+)\b/i);
    if (cmTitle) return `CM${cmTitle[1]}`;

    // Require word boundary after slice number — skip ranges like RTE-F1–F10 in planning titles
    const rteFTitle = titleLine.match(/\bRTE-F(\d+)\b(?![–-]\s*F\d)/i);
    if (rteFTitle) return `RTE-F${rteFTitle[1]}`;

    const rteTitle = titleLine.match(/\bRTE-W(\d+)\b/i);
    if (rteTitle) return `RTE-W${rteTitle[1]}`;

    const repoHTitle = titleLine.match(/\bREPO-H\s+RH(\d+)\b/i);
    if (repoHTitle) return `RH${repoHTitle[1]}`;

    const dsCleanTitle = titleLine.match(/\bDS-CLEAN\s+DS(\d+)\b/i);
    if (dsCleanTitle) return `DS${dsCleanTitle[1]}`;

    const fmTitle = titleLine.match(/\bFM\s+FM-(\d+)\b/i);
    if (fmTitle) return `FM-${fmTitle[1]}`;

    // Skip ranges like FM-0…FM-10 in planning titles (PR #465 false chain)
    const fmBareTitle =
      !/FM-\d+\s*[….…\-–]+\s*FM-\d+/i.test(titleLine) && titleLine.match(/\bFM-(\d+)\b/i);
    if (fmBareTitle) return `FM-${fmBareTitle[1]}`;

    const rhTitle = titleLine.match(/\bRH(\d+)\b/i);
    if (rhTitle) return `RH${rhTitle[1]}`;

    const dsTitle = titleLine.match(/\bDS(\d+)\b/i);
    if (dsTitle) return `DS${dsTitle[1]}`;

    const abChatTitle = titleLine.match(/\bAB\s+AB-(\d+)\b/i);
    if (abChatTitle) return `AB-${abChatTitle[1]}`;

    const abTitle = titleLine.match(/^AB-(\d+)\s*:/i);
    if (abTitle) return `AB-${abTitle[1]}`;

    const iwaChatTitle = titleLine.match(/\bIWA\s+IWA-(\d+)\b/i);
    if (iwaChatTitle) return `IWA-${iwaChatTitle[1]}`;

    const iwaTitle = titleLine.match(/\bIWA-(\d+)\b/i);
    if (iwaTitle) return `IWA-${iwaTitle[1]}`;
  }

  // Do not scan full body for bare W## — "Next slice: W23/W24" caused false chains (PR #205)

  return null;
}

/**
 * @param {string} raw
 */
export function normalizeSliceId(raw) {
  if (!raw) return null;
  const s = raw.trim();
  const dlm = s.match(/^DLM-(\d+)$/i);
  if (dlm) return `DLM-${dlm[1]}`;
  const w = s.match(/^W(\d+[a-z]?)$/i);
  if (w) return `W${w[1]}`;
  const s6b = s.match(/batch\s*(\d+)/i);
  if (/s6b/i.test(s) && s6b) return `S6b-batch-${s6b[1]}`;
  const s6bF = s.match(/^S6b-F(\d+)$/i);
  if (s6bF) return `S6b-F${s6bF[1]}`;
  const cove = s.match(/^COVE\s+P(\d+)/i) ?? s.match(/^COVE-P(\d+)/i);
  if (cove) return `COVE P${cove[1]}`;
  const rteF = s.match(/^RTE-F(\d+)$/i);
  if (rteF) return `RTE-F${rteF[1]}`;

  const docNorm = normalizeDocSliceId(s);
  if (docNorm) return docNorm;
  return null;
}

/**
 * @param {string} mergedSliceId
 */
export function nextSliceId(mergedSliceId) {
  if (!mergedSliceId) return null;
  if (mergedSliceId.startsWith('S6b-F')) {
    const explicit = S6B_F_NEXT[mergedSliceId];
    if (explicit) return explicit;
    const m = /^S6b-F(\d+)$/i.exec(mergedSliceId);
    if (m) {
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n >= S6B_F_TERMINAL) return null;
      if (Number.isFinite(n) && n >= S6B_F_OPEN_ENDED_FROM) return `S6b-F${n + 1}`;
    }
    return null;
  }
  if (mergedSliceId.startsWith('S6b-batch-')) {
    const n = Number.parseInt(mergedSliceId.replace('S6b-batch-', ''), 10);
    if (Number.isFinite(n)) return `S6b-batch-${n + 1}`;
    return null;
  }
  if (mergedSliceId.startsWith('DLM-')) {
    return DLM_NEXT[mergedSliceId] ?? null;
  }
  if (mergedSliceId.startsWith('COVE P')) {
    return COVE_NEXT[mergedSliceId] ?? null;
  }
  if (mergedSliceId.startsWith('FM-')) {
    if (mergedSliceId === FM_AFK_TERMINAL) return null;
    return nextSliceFromRegistry(mergedSliceId);
  }
  const workerNext = WORKER_NEXT[mergedSliceId];
  if (workerNext) return workerNext;
  return nextSliceFromRegistry(mergedSliceId);
}

/**
 * @param {string} sliceId
 */
export function sliceMetaFor(sliceId) {
  if (!sliceId) return undefined;
  if (sliceId.startsWith('S6b-batch-')) return SLICE_META['S6b-batch'];
  if (sliceId.startsWith('S6b-F')) {
    return SLICE_META[sliceId] ?? SLICE_META['S6b-F10'];
  }
  if (sliceId.startsWith('COVE P')) {
    return SLICE_META[sliceId];
  }
  const hardcoded = SLICE_META[sliceId];
  if (hardcoded) return hardcoded;
  const fromDoc = registrySliceMeta(sliceId);
  if (fromDoc) {
    return {
      autonomy: fromDoc.autonomy,
      ceoGate: fromDoc.ceoGate,
      mergePolicy: fromDoc.mergePolicy,
      program: fromDoc.program,
      masterDoc: fromDoc.masterDoc,
    };
  }
  return undefined;
}

/**
 * @param {string} sliceId
 */
export function subLaneFor(sliceId) {
  if (!sliceId) return null;
  if (sliceId.startsWith('S6b-batch-') || sliceId.startsWith('S6b-F')) return 'A-s6b';
  if (sliceId.startsWith('DLM-')) return 'E-dlm';
  if (sliceId.startsWith('COVE P')) return 'F-cove';
  if (sliceId.startsWith('RH')) return 'H-repo-health';
  if (sliceId.startsWith('DS')) return 'I-ds-clean';
  if (sliceId.startsWith('RTE-F')) return 'H-rte-f';
  if (sliceId.startsWith('IWA-')) return 'J-iwa';
  if (sliceId.startsWith('CDRIVE-')) return 'G-cdrive';
  if (/^CM\d+$/.test(sliceId)) return 'G-catalog-match';
  if (/^AB-\d+$/i.test(sliceId)) return 'D-ab';
  if (sliceId.startsWith('FM-')) return 'J-fm';
  const workerLane = WORKER_SUB_LANE[sliceId];
  if (workerLane) return workerLane;
  const docMeta = registrySliceMeta(sliceId);
  if (docMeta?.subLane) return docMeta.subLane;
  return subLaneForDocSlice(sliceId, docMeta?.program ?? 'PLATFORM');
}

export { loadMasterRegistry };
