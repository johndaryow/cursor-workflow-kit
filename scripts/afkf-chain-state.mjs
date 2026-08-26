#!/usr/bin/env node
/**
 * AFKF-10 — the chain's state, as data, with the dashboard as its rendering.
 *
 * WHY THIS SHAPE, AND WHY NOT THE OBVIOUS ONE.
 *
 * The obvious design is to normalise every dashboard line into a column and
 * rebuild the block from the columns. It cannot work here, and it is worth
 * saying why before someone tries it again. A live dashboard is mostly prose a
 * human wrote — GOAL, ROOT_CAUSE, eleven numbered KNOWN_TRAPs, a paragraph on
 * why one checkbox is never coming back. That prose is the reason the file is
 * worth reading. Round-tripping it through a schema would either lose it or
 * reproduce it with different whitespace, and Exit E-A of this slice asks for
 * **byte-identical**, not "close enough".
 *
 * So the split is by AUTHORSHIP, not by data type:
 *
 *   - the SIX fields the chain itself writes become columns, replaced in the
 *     stored block by `{{FIELD}}` placeholders;
 *   - everything else is carried verbatim in the template.
 *
 * Those six are not a judgement call. They are exactly the lines that
 * `mc-status-reconcile.mjs` and `ralph-chain-claim.mjs` edit — grep either file
 * for `setDashboardField` and you get this list. A field no script writes is
 * prose as far as the chain is concerned, however structured it looks.
 *
 * What that buys AFKF-18, which is the slice that actually stops writing the
 * file: to generate a dashboard it needs to own the fields it changes and to
 * reproduce the rest untouched. That is this data structure, exactly.
 *
 * DOM-free, network-free, filesystem-free — every function here is pure, so the
 * byte-identity proof runs in CI against the real files with no database and no
 * credentials. `scripts/afkf-chain-state.test.mjs` is that proof.
 */

/**
 * The only dashboard lines the chain writes. Everything else is prose.
 *
 * ACTIVE_SLICE is on this list although no script writes it TODAY: agents edit
 * it by hand each slice, and AFKF-18 replaces that hand with generated output.
 * Importing it as a value rather than as prose is what makes that possible
 * without a second migration.
 */
export const CHAIN_MANAGED_FIELDS = Object.freeze([
  'ACTIVE_SLICE',
  'NEXT_PROMPT',
  'AFK_QUEUE',
  'RALPH_RUNNING',
  'LAST_MERGED_PR',
  'LAST_PR',
]);

/** Column name in `chain_programs` for each managed field. */
export const FIELD_COLUMNS = Object.freeze({
  ACTIVE_SLICE: 'active_slice',
  NEXT_PROMPT: 'next_prompt',
  AFK_QUEUE: 'afk_queue',
  RALPH_RUNNING: 'ralph_running',
  LAST_MERGED_PR: 'last_merged_pr',
  LAST_PR: 'last_pr',
});

/**
 * Cut the STATUS DASHBOARD block out of a master doc.
 *
 * Deliberately the SAME slice `mc-status.mjs` takes — from the heading to the
 * next `\n---`, trimmed — so "byte-identical to the block" means identical to
 * the thing an agent actually reads, not to some tidier internal notion of it.
 *
 * @param {string} masterText
 * @returns {string | null}
 */
export function extractDashboardBlock(masterText) {
  const startMarker = '## STATUS DASHBOARD';
  const start = masterText.indexOf(startMarker);
  if (start === -1) return null;
  const after = masterText.slice(start);
  const endRel = after.indexOf('\n---', startMarker.length);
  return (endRel === -1 ? after : after.slice(0, endRel)).trim();
}

/**
 * Read one `KEY: value` line out of a block. First occurrence only.
 *
 * @param {string} block
 * @param {string} key
 * @returns {string | null}
 */
export function readField(block, key) {
  const m = block.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  return m ? m[1] : null;
}

/**
 * A programme is LIVE when its dashboard still has a queue that says something
 * other than "none".
 *
 * Measured, not chosen: run this over `docs/projects/*-master.md` and it
 * answers 7 of 147 — the same seven the PRD counted by hand. The alternative
 * signal, `ACTIVE_SLICE`, answers twenty, because a finished programme's last
 * slice id is left sitting in it as a record of where it stopped. A queue is
 * about the future; an active slice is often about the past.
 *
 * `none` with a trailing clause (`none — programme complete`) still means none.
 * A queue whose text is prose about being empty (LYRIC-ACC's `**empty.** …`)
 * does NOT: that programme is parked on a CEO decision, not finished, and the
 * chain still has to know about it.
 *
 * @param {string} masterText
 * @returns {boolean}
 */
export function isLiveProgram(masterText) {
  const block = extractDashboardBlock(masterText);
  if (!block) return false;
  const queue = readField(block, 'AFK_QUEUE');
  if (queue === null) return false;
  const trimmed = queue.trim();
  if (!trimmed) return false;
  return !/^none\b/i.test(trimmed);
}

/** Placeholder text for a managed field. */
function placeholderFor(field) {
  return `{{${field}}}`;
}

/**
 * Split a block into (template, values).
 *
 * Throws rather than guesses on the two inputs that would corrupt a round trip:
 * a managed field appearing on two lines, and a value that already contains a
 * placeholder. Both are absurd in practice; a silent corruption of a dashboard
 * is not, and this whole programme exists because silent was the expensive part.
 *
 * @param {string} block
 * @returns {{ template: string, values: Record<string, string> }}
 */
export function toTemplate(block) {
  /** @type {Record<string, string>} */
  const values = {};
  let template = block;

  for (const field of CHAIN_MANAGED_FIELDS) {
    const all = block.match(new RegExp(`^${field}:[ \\t]*.*$`, 'gm')) ?? [];
    if (all.length === 0) continue;
    if (all.length > 1) {
      throw new Error(
        `AFKF-10: ${field} appears ${all.length} times in one dashboard — cannot template it safely`,
      );
    }
    const value = readField(block, field) ?? '';
    if (value.includes('{{') || value.includes('}}')) {
      throw new Error(
        `AFKF-10: ${field} value contains a placeholder token — refusing to template it`,
      );
    }
    values[field] = value;
    template = template.replace(
      new RegExp(`^${field}:[ \\t]*.*$`, 'm'),
      `${field}: ${placeholderFor(field)}`,
    );
  }

  return { template, values };
}

/**
 * Put the values back. `render(...toTemplate(block))` must equal `block`.
 *
 * @param {string} template
 * @param {Record<string, string>} values
 * @returns {string}
 */
export function renderDashboardBlock(template, values) {
  let out = template;
  for (const field of CHAIN_MANAGED_FIELDS) {
    const token = placeholderFor(field);
    if (!out.includes(token)) continue;
    const value = values[field];
    if (value === undefined || value === null) {
      throw new Error(`AFKF-10: template wants ${field} but the row has no value for it`);
    }
    out = out.replace(`${field}: ${token}`, `${field}: ${value}`);
  }
  return out;
}

/**
 * Slice ids named by an `AFK_QUEUE` line, in order.
 *
 * The separator is ` | ` and only ` | ` — KNOWN_TRAP_7 in the AFKF dashboard is
 * the half-hour that fact cost. Each entry may carry a trailing clause
 * (`LNP-6 (serial, sub-lane …)`); the id is the first token.
 *
 * @param {string | null | undefined} line
 * @returns {string[]}
 */
export function parseQueueIds(line) {
  const trimmed = (line ?? '').trim();
  if (!trimmed || /^none\b/i.test(trimmed)) return [];
  return trimmed
    .split('|')
    .map((part) => sliceIdFrom(part))
    .filter((id) => id !== null);
}

/**
 * The slice id at the head of a queue entry or a RALPH_RUNNING entry, or null
 * when the entry is prose rather than an id.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function sliceIdFrom(text) {
  const cleaned = (text ?? '').trim().replace(/^\*+/, '');
  const m = cleaned.match(/^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]+[a-z]?)\b/);
  return m ? m[1] : null;
}

/**
 * Slice ids genuinely held by a `RALPH_RUNNING` line.
 *
 * `ralph-chain.mjs` splits this line on `|` and keeps every part. That is fine
 * for its purpose and wrong for ours: AFKF's own line currently reads
 * `none — the stale AFKF-9 entry is gone … | AFKF-10`, so a naive split adopts
 * a paragraph as a claim. Keep only the parts that start with a slice id.
 *
 * @param {string | null | undefined} line
 * @returns {string[]}
 */
export function parseRalphRunning(line) {
  const trimmed = (line ?? '').trim();
  if (!trimmed) return [];
  return trimmed
    .split('|')
    .map((part) => sliceIdFrom(part))
    .filter((id) => id !== null);
}

/**
 * Programme codes that are not simply the filename upper-cased.
 *
 * One entry, and it earns itself: every rule file, every `mc:status` invocation
 * and the sequencing sentence in `workflow-core.md` call this programme
 * PLATFORM. Importing it as PLATFORM-MIGRATION would give AFKF-11's queue a
 * programme nobody refers to by that name.
 *
 * Not derived from `ACTIVE_PROGRAM`, which looks like the obvious source and is
 * not: PLATFORM's dashboard currently reads `ACTIVE_PROGRAM: TWS`, because that
 * field names the sub-programme running through it this week, not the programme
 * the document is.
 */
export const PROGRAM_CODE_ALIASES = Object.freeze({
  'platform-migration': 'PLATFORM',
});

/**
 * Programme code from a master doc path — `docs/projects/afkf-master.md` → AFKF.
 *
 * @param {string} path
 * @returns {string}
 */
export function programCodeFromPath(path) {
  const base = (path.split('/').pop() ?? '').replace(/-master\.md$/, '');
  return PROGRAM_CODE_ALIASES[base] ?? base.toUpperCase();
}

/**
 * Everything AFKF-10 imports for one programme, derived from its file alone.
 *
 * @param {string} masterText
 * @param {string} masterDocPath
 */
export function programImportRow(masterText, masterDocPath) {
  const block = extractDashboardBlock(masterText);
  if (!block) throw new Error(`AFKF-10: no STATUS DASHBOARD in ${masterDocPath}`);
  const { template, values } = toTemplate(block);
  const title = masterText.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
  return {
    code: programCodeFromPath(masterDocPath),
    title,
    master_doc_path: masterDocPath,
    dashboard_template: template,
    active_slice: values.ACTIVE_SLICE ?? null,
    next_prompt: values.NEXT_PROMPT ?? null,
    afk_queue: values.AFK_QUEUE ?? null,
    ralph_running: values.RALPH_RUNNING ?? null,
    last_merged_pr: values.LAST_MERGED_PR ?? null,
    last_pr: values.LAST_PR ?? null,
  };
}

/**
 * The values map a row carries back into `renderDashboardBlock`.
 *
 * @param {Record<string, any>} row
 * @returns {Record<string, string>}
 */
export function valuesFromRow(row) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const field of CHAIN_MANAGED_FIELDS) {
    const column = FIELD_COLUMNS[field];
    const value = row?.[column];
    if (value !== undefined && value !== null) values[field] = value;
  }
  return values;
}
