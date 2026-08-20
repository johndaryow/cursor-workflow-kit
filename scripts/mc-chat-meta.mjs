/**
 * Resolve recommended slice + Cursor chat rename from master doc §12 / exit plan.
 * Used by mc-status.mjs and mc-opener.mjs.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/**
 * Pull the bare slice id out of a dashboard value.
 *
 * Dashboards write the id with markdown emphasis and a trailing sentence —
 * `ACTIVE_SLICE: **LACC-20** (canary the new aligner) — its gate is satisfied`. The regexes below
 * need `LACC-20`. Left unstripped, `**LACC-20**` misses every `### LACC-20` section and then reaches
 * a `new RegExp` as `**LACC-20**`, where the leading `*` is a quantifier with nothing to repeat and
 * the whole script dies with `SyntaxError: Nothing to repeat` (hit on LYRIC-ACC, 2026-08-20).
 */
export function sliceIdFromDashboardValue(value) {
  const firstToken = String(value ?? '').trim().split(/\s+/)[0] ?? '';
  const unemphasised = firstToken.replace(/^[*_`~]+/, '').replace(/[*_`~]+$/, '');
  return unemphasised.replace(/[^A-Z0-9-].*$/i, '');
}

/** @param {string} dashboardText */
export function parseDashboardFields(dashboardText) {
  const get = (key) =>
    dashboardText.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';
  const afkQueue = get('AFK_QUEUE')
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    activeProgram: get('ACTIVE_PROGRAM'),
    activeSlice: get('ACTIVE_SLICE'),
    blockedBy: get('BLOCKED_BY'),
    ralphChain: get('RALPH_CHAIN') || 'auto',
    afkQueue,
    nextPrompt: get('NEXT_PROMPT'),
    lastMergedPr: get('LAST_MERGED_PR'),
    recommendedSlice: sliceIdFromDashboardValue(afkQueue[0]),
  };
}

/** @param {string} sliceId e.g. W6d */
export function chatRenameFromMaster(masterText, sliceId) {
  if (!sliceId) return '';

  const escaped = sliceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRe = new RegExp(
    `###\\s+${escaped}[^\\n]*\\n[\\s\\S]*?(?=\\n### |\\n## |\\n<!--|$)`,
    'gi',
  );
  for (const match of masterText.matchAll(sectionRe)) {
    const section = match[0] ?? '';
    const fromPrompt = section.match(/Rename this chat to:\s*(.+)/i)?.[1]?.trim();
    if (fromPrompt) return fromPrompt;
  }

  const exitPlanPath = resolve(root, 'docs/projects/workers-exit-plan.md');
  if (existsSync(exitPlanPath)) {
    const exitPlan = readFileSync(exitPlanPath, 'utf8');
    const rowRe = new RegExp(
      `\\|\\s*\\*\\*${escaped}\\*\\*\\s*\\|[^|]+\\|\\s*\`([^\`]+)\`\\s*\\|`,
      'i',
    );
    const fromTable = exitPlan.match(rowRe)?.[1]?.trim();
    if (fromTable) return fromTable;
  }

  // REPO-H / DS-CLEAN §11.3 execution menu: | `REPO-H RH1 · …` | RH1 | ...
  const programRow = masterText.match(
    new RegExp(
      `\\|\\s*\`([^\`]+)\`\\s*\\|\\s*${escaped}\\s*\\|`,
      'i',
    ),
  )?.[1]?.trim();
  if (programRow) return programRow;

  return /^COVE\s+P\d+/i.test(sliceId) ? sliceId : `PLATFORM ${sliceId}`;
}

/** Plain-English workers lane summary for CEO status questions */
export function workersMigrationSummary(masterText, fields) {
  const scorecard =
    masterText.match(
      /\| GCP functions \(non-mirror\) \|[^|\n]+\|[^|\n]+\|/,
    )?.[0] ?? '';
  const gcpCell = scorecard.split('|').map((s) => s.trim())[2] ?? 'see scorecard';

  const laneB =
    masterText.match(
      /\|\s*\*\*B — Workers\*\*[^|\n]*\|[^|\n]*\|[^|\n]*\|[^|\n]*\|[^|\n]*\|[^|\n]*\|[^|\n]*\|/,
    )?.[0] ?? '';
  const laneStatus = laneB.split('|').map((s) => s.trim())[4] ?? 'unknown';

  const slice = fields.recommendedSlice || fields.activeSlice.replace(/\(.*\)/, '').trim();
  const next =
    slice && slice !== 'none'
      ? `Next recommended slice: **${slice}** (${chatRenameFromMaster(masterText, slice)})`
      : 'Pick a slice from workers-exit-plan.md §6 execution menu';

  return [
    `**Workers migration (Lane B):** ${laneStatus}`,
    `**GCP functions remaining:** ${gcpCell}`,
    next,
    `**Queue:** ${fields.afkQueue.slice(0, 5).join(' → ') || 'empty'}`,
    `**Blocked:** ${fields.blockedBy || 'none'}`,
  ].join('\n');
}
