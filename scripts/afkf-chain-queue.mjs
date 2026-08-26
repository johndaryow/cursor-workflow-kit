#!/usr/bin/env node
/**
 * AFKF-11 — one ranked queue across all programmes.
 *
 * PRD § Q4 is the spec. Ready is DERIVED, never declared: nothing writes
 * `state = 'ready'` by hand and no dashboard line says "this one next". Q4's six
 * conditions decide it — plus a seventh this slice added on evidence, refusing a
 * slice the plan tagged for the CEO — and every refusal comes back with the name
 * of the rule that refused, because a queue that answers "nothing is ready"
 * without saying why is the silent stall this whole programme exists to end.
 *
 * WHERE THE DEPENDENCY MAP COMES FROM. `depends_on` and `parallel_group` are
 * written ONCE, at slice-planning time (AFKF-D18), into `chain_slices`. This
 * file parses them out of the master doc's §5 table ("Blocked by" column) and
 * its `PARALLEL_GROUPS` dashboard line, which is what slice planning already
 * fills in; `scripts/afkf-chain-import.mjs` writes them to the rows. The master
 * doc is the human-readable rendering of the map, never a second source — two
 * sources is how the duplicate-reconcile problem was born.
 *
 * WHY THE DERIVATION IS PURE JAVASCRIPT AND NOT A SQL VIEW. The claim that stops
 * two agents on one slice belongs in the database and is there (AFKF-9's partial
 * unique index). The QUEUE is a different job: it is a judgement over seven
 * inputs, one of which (the CI ceiling, Q2/AFKF-12) is not a column at all and
 * arrives from the caller, and it has to
 * be provable in CI with no database and no credentials. So the rows come from
 * Postgres and the ruling happens here, in functions with no I/O — and the live
 * proof (`scripts/afkf-chain-queue-db.test.mjs`) runs these same functions over
 * real rows, so there is one implementation, not two that could drift.
 *
 * WHAT THE INDEX DOES NOT DO, AND THIS FILE MUST (KNOWN_TRAP_12). Measured
 * against the live table by AFKF-9: `chain_slices_one_running_per_program` is a
 * PARTIAL index whose predicate excludes rows carrying a `parallel_group`, so
 * grouped rows are outside it entirely. It refuses a second UN-GROUPED claim and
 * nothing wider — it will happily admit an un-grouped claim alongside a running
 * group, and two differently-grouped pairs. Ready-rule 4 below is the narrower
 * rule, and Exit E-B is its proof.
 *
 * Usage:
 *   npm run afkf:chain-queue            # the ranked queue, from the live tables
 *   npm run afkf:chain-queue -- --json
 *   npm run afkf:chain-queue -- --all   # also print every refusal and its reason
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDashboardBlock, readField } from './afkf-chain-state.mjs';
import { ceilingInput, isChainPaused, readCeiling } from './afkf-ci-ceiling.mjs';
import { failurePause } from './afkf-retry.mjs';

import { evaluateHold, evaluateKnownGates, parseHoldTag } from './afkf-hold.mjs';
import { sliceTagBlocks } from './ralph-master-registry.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const SUPABASE_URL = 'https://bmeqxvnaclssbefpshlb.supabase.co';

/**
 * Three lanes (AFKF-D17). Not four because the CI ceiling is the real
 * constraint (KNOWN_TRAP_2), and not two because three programmes moving at
 * once is what the CEO asked for.
 */
export const LANE_COUNT = 3;

/** Slice states that can still be started. Anything else has had its turn. */
export const PENDING_STATES = Object.freeze(['planned', 'ready']);

/** Slice states that occupy a programme's lane right now. */
export const HOLDING_STATES = Object.freeze(['claimed', 'running']);

/** `priority` buckets, in the order Q4 ranks them. */
export const PRIORITY_ORDER = Object.freeze(['now', 'soon', 'whenever']);

/**
 * Every reason a slice can be refused, named. The strings are part of the
 * contract: the digest and AFKF-14's "where are we?" both quote them, and a
 * renamed reason should therefore break a test rather than a sentence a human
 * reads.
 */
export const REFUSAL = Object.freeze({
  NOT_PENDING: 'slice-not-pending',
  CHAIN_PAUSED: 'chain-paused',
  PROGRAM_PAUSED: 'program-paused',
  DEPENDENCY_NOT_MERGED: 'dependency-not-merged',
  OPEN_QUESTION: 'open-question',
  PROGRAM_LANE_BUSY: 'program-lane-busy',
  CI_CEILING: 'ci-ceiling',
  HITL: 'needs-ceo',
  HELD: 'held',
});

/**
 * Dependencies named by one "Blocked by" cell of a §5 slice table.
 *
 * The column is written by hand at slice-planning time and reads like English:
 * `none`, `—`, `AFKF-10`, `AFKF-9, AFKF-10`. Anything that is not a slice id is
 * dropped rather than guessed at — a dependency the parser invented would make a
 * slice permanently un-ready, and nothing downstream could tell that apart from
 * a real block.
 *
 * @param {string | null | undefined} cell
 * @returns {string[]}
 */
export function parseDependsOnCell(cell) {
  const text = (cell ?? '').replace(/\*/g, '').trim();
  if (!text || /^(none|—|-|n\/a)$/i.test(text)) return [];
  const ids = text.match(/[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]+[a-z]?/g) ?? [];
  return [...new Set(ids)];
}

/**
 * The `PARALLEL_GROUPS` dashboard line → one group name per slice id.
 *
 * AFKF's own line is the shape this must handle:
 *
 *   afkf-plan-routes = AFKF-16 + AFKF-17 · afkf-tidy = AFKF-19 + AFKF-20. Every
 *   other slice is serial (AFKF-D18 — recorded here at slice-planning time,
 *   never guessed at run time)
 *
 * Groups are separated by `·`, members by `+`, and the trailing prose after the
 * last group's full stop is not a group. A slice named in no group gets no
 * group, which is the case that matters: an absent group means the slice takes
 * the programme's single lane.
 *
 * @param {string | null | undefined} line
 * @returns {Record<string, string>}
 */
export function parseParallelGroups(line) {
  const text = (line ?? '').trim();
  /** @type {Record<string, string>} */
  const map = {};
  if (!text || /^none\b/i.test(text)) return map;
  for (const part of text.split('·')) {
    const m = part.match(/([A-Za-z][A-Za-z0-9_-]*)\s*=\s*([^.]*)/);
    if (!m) continue;
    const group = m[1].trim();
    const members = m[2].match(/[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]+[a-z]?/g) ?? [];
    // A "group" of one is not a parallel group — it would only take the slice
    // out of the index's reach for no gain.
    if (members.length < 2) continue;
    for (const id of members) map[id] = group;
  }
  return map;
}

/**
 * The whole dependency map of one master doc: what each slice waits for, and
 * which slices were planned as independent of each other.
 *
 * THE COLUMN IS FOUND BY ITS HEADING, NOT BY ITS POSITION, and that is not
 * fussiness — it was measured. The live documents do not share one table
 * shape: AFKF's §5 puts "Blocked by" third, LYRIC-ACC's third column is
 * `AFK · auto`, and `platform-migration-master.md`'s big table is a registry of
 * PROGRAMMES whose rows look exactly like slice rows. Reading "the third cell"
 * would have invented a dependency for LACC and imported twelve programmes as
 * slices, and both failures are silent: an invented dependency makes a slice
 * permanently un-ready, and nothing downstream can tell that apart from a real
 * block.
 *
 * So a table contributes dependencies only when its own header says it has
 * them. A document with no such column yields no dependencies, which is honest:
 * that programme is ordered by its queue instead, serially, which is what it
 * does today.
 *
 * @param {string} masterText
 * @returns {Record<string, { dependsOn: string[], parallelGroup: string | null }>}
 */
export function parseSliceDag(masterText) {
  const block = extractDashboardBlock(masterText) ?? '';
  const groups = parseParallelGroups(readField(block, 'PARALLEL_GROUPS'));
  /** @type {Record<string, { dependsOn: string[], parallelGroup: string | null }>} */
  const map = {};

  /** @type {number | null} */
  let depIndex = null;
  let inTable = false;

  for (const line of masterText.split('\n')) {
    if (!line.trimStart().startsWith('|')) {
      inTable = false;
      depIndex = null;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((c) => c.replace(/\*/g, '').trim());
    if (!inTable) {
      // First row of a table is its header.
      inTable = true;
      depIndex = cells.findIndex((c) => /^(blocked by|depends on|blocked-by|depends_on)$/i.test(c));
      if (depIndex === -1) depIndex = null;
      continue;
    }
    if (depIndex === null) continue;
    if (/^[-: ]+$/.test(cells[0] ?? '')) continue; // the |---| separator row
    const id = cells[0] ?? '';
    if (!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]+[a-z]?$/.test(id)) continue;
    if (map[id]) continue; // first table wins; a later restatement is a summary
    map[id] = {
      dependsOn: parseDependsOnCell(cells[depIndex]),
      parallelGroup: groups[id] ?? null,
    };
  }

  // A slice named only in PARALLEL_GROUPS still gets its group recorded.
  for (const [id, group] of Object.entries(groups)) {
    if (!map[id]) map[id] = { dependsOn: [], parallelGroup: group };
    else map[id].parallelGroup = group;
  }
  return map;
}

/**
 * Is this programme runnable by the chain at all, according to its own file?
 *
 * Rule 1 asks whether the programme is paused, and until now nothing ever set
 * that column — which is KNOWN_TRAP_11 exactly: a gate whose input nobody
 * writes. Two signals in the dashboard already answer it, and both are things a
 * human wrote deliberately:
 *
 *   - `BLOCKED_BY` says something other than `none`. LNP's says so right now,
 *     across fifteen failed attempts, and the first live run of this queue
 *     offered LNP-6 anyway.
 *   - `AFK_QUEUE` names no slice id at all. WAC's reads "empty until the CEO
 *     opens WAC-3b" — the chain has no instruction, and inventing one from the
 *     plan's table would be guessing at what a person deliberately did not say.
 *
 * Anything else is runnable: `running` when something is claimed, `ready`
 * otherwise. Nothing here writes `done` — a finished programme is AFKF-19's
 * archive job, not a state this import may infer.
 *
 * @param {{ blockedBy?: string | null, queueIds: string[], runningIds: string[] }} input
 * @returns {{ state: string, paused_reason: string | null }}
 */
export function programStateFromDashboard({ blockedBy, queueIds, runningIds }) {
  const blocked = (blockedBy ?? '').trim();
  if (blocked && !/^none\b/i.test(blocked)) {
    return { state: 'paused', paused_reason: `BLOCKED_BY: ${blocked.slice(0, 300)}` };
  }
  if (queueIds.length === 0) {
    return {
      state: 'paused',
      paused_reason: 'AFK_QUEUE names no slice id — the chain has no instruction',
    };
  }
  return { state: runningIds.length > 0 ? 'running' : 'ready', paused_reason: null };
}

/**
 * Per-slice autonomy, read from the §12 prompt blocks the plan already writes.
 *
 * WHY THE QUEUE CARES, WHEN Q4'S SIX CONDITIONS DO NOT MENTION IT. The queue's
 * whole purpose is that something claims the top of it without asking. A queue
 * that offers a slice tagged `CEO_GATE: explicit_ok_in_chat` hands an agent work
 * that `hitl-afk-slices.md` says may not start without the CEO. Two live slices
 * are tagged exactly that way today — `WAC-3b`, which its own programme is
 * stalled waiting for, and `MDUR-9` — and both would have been offered the
 * moment they reached the front of their queue. Six conditions plus that one is
 * a smaller change than a queue nobody can safely claim from.
 *
 * A CEO gate IS the HITL tag for this purpose: `hitl-afk-slices.md` says an AFK
 * slice has no `explicit_ok_in_chat` on it, so a gate of `explicit_ok_in_chat`
 * or `human_only` is normalised to HITL here rather than kept as a second
 * column that something else would have to remember to read.
 *
 * WHAT THIS DOES NOT KNOW, WRITTEN DOWN RATHER THAN HIDDEN. It reads a heading
 * naming a slice id and the first `AUTONOMY:` / `CEO_GATE:` line beneath it, so
 * it answers for every slice in AFKF, WAC, LNP, MDUR and most of LIX and
 * LYRIC-ACC — and for none of `platform-migration-master.md`, whose slices are
 * not written as headed blocks. A slice it cannot answer for keeps the row's
 * default (`AFK`). That is a real limit, and it is stated here because a gate
 * whose input is never populated is worse than no gate at all — it is
 * KNOWN_TRAP_11 in a new costume.
 *
 * @param {string} masterText
 * @returns {Record<string, 'AFK' | 'HITL'>}
 */
export function parseSliceAutonomy(masterText) {
  const lines = masterText.split('\n');
  /** @type {Record<string, 'AFK' | 'HITL'>} */
  const out = {};
  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i].match(/^#{2,4}\s+\**([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]+[a-z]?)\b/);
    if (!heading) continue;
    const id = heading[1];
    if (out[id]) continue; // the first block for an id is its prompt
    for (let j = i + 1; j < Math.min(i + 60, lines.length); j += 1) {
      if (/^#{2,4}\s/.test(lines[j])) break; // next section — this block said nothing
      const autonomy = lines[j].match(/^AUTONOMY:\s*\**([A-Za-z]+)/);
      if (autonomy) {
        out[id] = /hitl/i.test(autonomy[1]) ? 'HITL' : 'AFK';
        // Keep reading: a block may say AFK and then carry a CEO gate.
      }
      const gate = lines[j].match(/^CEO_GATE:\s*\**([a-z_]+)/i);
      if (gate && /^(explicit_ok_in_chat|human_only)$/i.test(gate[1])) out[id] = 'HITL';
    }
  }
  return out;
}

/**
 * Per-slice `HOLD:` tags, read from the same §12 prompt blocks `parseSliceAutonomy` reads.
 *
 * Same scanning rule, same 60-line block window, same "first block for an id is its prompt" —
 * kept parallel on purpose. A second traversal with its own idea of where a block ends is how two
 * readers of one document start disagreeing about what it says.
 *
 * @param {string} masterText
 * @returns {Record<string, { prose: string, gate: string | null }>}
 */
export function parseSliceHold(masterText) {
  /** @type {Record<string, { prose: string, gate: string | null }>} */
  const out = {};
  /**
   * ONE BLOCK RULE, BORROWED FROM THE REGISTRY (round four).
   *
   * This used to carry its own heading pattern: first token, must end in `-<digits>`. The registry
   * allows an optional programme-prefix word and an explicit id allowlist, so 28 live slices —
   * `RTE-F1…F10`, `RH1…RH21`, `DS0…DS12`, `DS-BT-4`, `WORKFLOW-P22` — were visible to one reader and
   * not the other. A `HOLD:` on any of them would have been honoured by the on-merge chain and
   * ignored by this queue, `afkf:chat`, the digest, `mc:status` and the planning chain.
   *
   * Three rounds of this slice each fixed a version of "two parsers, one document" and each left a
   * new axis: line window, then fence kind, then id shape. So there is no second parser any more —
   * both callers ask the registry which block belongs to which slice, and only the TAG syntax
   * (`parseHoldTag`) is shared code below that.
   */
  for (const { sliceId, blockText } of sliceTagBlocks(masterText)) {
    if (out[sliceId]) continue; // the first block for an id is its prompt
    const hold = parseHoldTag(blockText);
    if (hold) out[sliceId] = hold;
  }
  return out;
}

/**
 * `HOLD:` lines that sit OUTSIDE a slice's tag block, where no reader will honour them.
 *
 * Requiring the fence makes the two parsers agree, and creates exactly one new way to be wrong: a
 * hold written in prose is now silently no hold at all — fail-open, which is the thing this slice
 * exists to remove. So the mistake is detected instead of tolerated. `npm run afkf:hold-check`
 * refuses to report CLEAR while any of these exist.
 *
 * @param {string} masterText
 * @param {string} label
 */
export function holdsOutsideTagBlock(masterText, label = '') {
  /**
   * EVERY `HOLD:` LINE MUST BELONG TO EXACTLY ONE SLICE. That is the whole invariant, and stating
   * it this way covers cases an "is it inside a fence?" check never could.
   *
   * Round four's fixture found the last one: a tag block preceded by a ```bash example is not
   * matched by the shared block rule at all, so a `HOLD:` inside it is honoured by NOTHING — and
   * both parsers agreeing to ignore it is not the same as being right. Rather than teach the check
   * about fence kinds, headings and allowlists (a third parser, which is how this slice kept
   * failing), it compares what was written against what was attributed. Anything written and not
   * attributed is reported, whatever the reason.
   */
  const parsed = parseSliceHold(masterText);
  const lines = masterText.split('\n');
  const out = [];
  let currentId = null;
  for (const line of lines) {
    const heading = line.match(/^#{2,4}\s+\**(?:[A-Z][A-Z0-9-]*\s+)?([A-Z][A-Z0-9]*(?:[- ][A-Z0-9]+)*-?[0-9]*[a-z]?)\b/);
    if (heading) currentId = heading[1].trim();
    if (!/^HOLD:/.test(line)) continue;
    if (currentId && parsed[currentId]) continue; // attributed — the readers will honour it
    out.push(`${label}${currentId ? `${currentId}: ` : ''}${line.slice(0, 80)}`);
  }
  return out;
}

/**
 * Every `HOLD:` in every master doc, keyed by slice id.
 *
 * Reads all `*-master.md`, not only the live ones. A hold's whole job is to stop a slice that has
 * not started, and a programme can be held before it is live — filtering to live documents would
 * quietly drop exactly the holds that matter most.
 *
 * @param {string} [dir]
 */
export function holdsFromLiveDocs(dir = resolve(root, 'docs/projects')) {
  /** @type {Record<string, { prose: string, gate: string | null }>} */
  const out = {};
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    /**
     * SUBDIRECTORIES TOO, AND `archive/` IS THE ONE THAT MATTERS (critic finding, 2026-08-26).
     *
     * AFKF-19 — two slices from here — moves finished programme docs into `docs/projects/archive/`.
     * A flat read would stop seeing those documents, and a hold in one would silently evaluate to
     * "no hold" rather than to "held". Holds fail closed on an unknown GATE; they cannot fail closed
     * on a document nobody read, because an unread document is indistinguishable from a slice that
     * simply has no hold. So the only defence is to read them, and to keep reading them after the
     * archive move that is already planned.
     */
    if (entry.isDirectory()) {
      Object.assign(out, holdsFromLiveDocs(resolve(dir, entry.name)));
    } else if (entry.name.endsWith('-master.md')) {
      Object.assign(out, parseSliceHold(readFileSync(resolve(dir, entry.name), 'utf8')));
    }
  }
  return out;
}

/**
 * Which planned slices are already behind us?
 *
 * Rule 2 asks whether every dependency is `merged`, and the import only creates
 * rows for what the dashboard still lists — so without this, AFKF-12 would wait
 * forever on an AFKF-11 row that had been dropped from the queue, and every
 * programme would deadlock one slice after its first merge. The rows for the
 * finished slices have to exist, and something has to say they are finished.
 *
 * THE SIGNAL, AND THE TWO CHEAPER ONES THAT DO NOT WORK. A dashboard's
 * `AFK_QUEUE` is what REMAINS, and the plan's table is the order — so the queue
 * points at a position in that order, and everything before it has had its turn.
 *
 *   - "not in the queue" alone is wrong: MDUR's queue names only `MDUR-8`, and
 *     MDUR-9 is not finished, it has not started.
 *   - a ✅ in the row's prose is wrong the other way: two of AFKF's finished
 *     slices carry the tick late in a sentence, one finished slice carries none
 *     at all, and several cells mention other slices' ticks in passing. Parsing
 *     it produced three wrong answers out of twenty-two on the first run.
 *
 * The position rule was checked against all three documents that have a
 * dependency table (AFKF, LNP, MDUR) and is right on each, including LNP, whose
 * table ends `… LNP-5, LNP-7, LNP-6` because LNP-6 is blocked and its successor
 * shipped first.
 *
 * WHEN IT KNOWS NOTHING IT SAYS SO. If the queue is prose rather than ids —
 * WAC's reads "empty until the CEO opens WAC-3b" — this returns nothing at all
 * rather than declaring six slices finished on no evidence.
 *
 * @param {string[]} plannedOrder slice ids in the order the plan's table lists them
 * @param {string[]} pendingIds ids the dashboard still names (queue + claims)
 * @returns {string[]} ids that are behind the queue's current position
 */
export function mergedPrefixIds(plannedOrder, pendingIds) {
  if (pendingIds.length === 0) return [];
  const positions = pendingIds
    .map((id) => plannedOrder.indexOf(id))
    .filter((i) => i !== -1);
  if (positions.length === 0) return [];
  const first = Math.min(...positions);
  return plannedOrder.slice(0, first).filter((id) => !pendingIds.includes(id));
}

/**
 * Rule 4, on its own, because it is the one the database cannot enforce.
 *
 * An UN-GROUPED slice is refused while anything at all holds the programme.
 * A GROUPED slice is refused unless every holder shares its group — which is
 * exactly the sentence the partial index cannot express (KNOWN_TRAP_12).
 *
 * @param {{ parallel_group?: string | null }} slice
 * @param {{ parallel_group?: string | null }[]} holders slices claimed/running in the same programme
 */
export function laneIsFree(slice, holders) {
  if (holders.length === 0) return true;
  const group = slice.parallel_group ?? null;
  if (!group) return false;
  return holders.every((h) => (h.parallel_group ?? null) === group);
}

/**
 * Q4's six conditions, applied to one slice.
 *
 * @param {any} slice a `chain_slices` row
 * @param {object} ctx
 * @param {any} ctx.program the slice's `chain_programs` row
 * @param {any[]} ctx.programSlices every slice row of that programme
 * @param {boolean} [ctx.chainPaused]
 * @param {{ headroom: boolean, reason?: string | null }} [ctx.ceiling]
 * @returns {{ ready: boolean, reason: string | null, detail?: string }}
 */
export function evaluateSlice(slice, ctx) {
  const { program, programSlices, chainPaused = false, chainPausedReason = '', ceiling } = ctx;

  if (!PENDING_STATES.includes(slice.state)) {
    return { ready: false, reason: REFUSAL.NOT_PENDING, detail: slice.state };
  }
  // 1 — the chain and the programme are running.
  //     Two things pause the chain, and the refusal carries WHICH: the spend
  //     ceiling at 100% (AFKF-12) and three consecutive slice failures
  //     (AFKF-13 / AFKF-D36). A refusal that says only "chain-paused" sends a
  //     human to the wrong place, which is the silent-stall shape this whole
  //     programme exists to end.
  if (chainPaused) return { ready: false, reason: REFUSAL.CHAIN_PAUSED, detail: chainPausedReason };
  if (program?.state === 'paused') {
    return { ready: false, reason: REFUSAL.PROGRAM_PAUSED, detail: program.paused_reason ?? '' };
  }
  // 3 — no slice starts on a question that is still open (AFKF-D31).
  //     Checked before dependencies purely so the message a human reads names
  //     the question rather than the dependency behind it.
  if (slice.blocked_on_question) {
    return { ready: false, reason: REFUSAL.OPEN_QUESTION, detail: slice.blocked_on_question };
  }
  // 2 — every dependency is merged. Missing rows count as not merged: a
  //     dependency nobody has planned yet is the strongest possible block.
  const byId = new Map(programSlices.map((s) => [s.slice_id, s]));
  const unmet = (slice.depends_on ?? []).filter((id) => byId.get(id)?.state !== 'merged');
  if (unmet.length > 0) {
    return { ready: false, reason: REFUSAL.DEPENDENCY_NOT_MERGED, detail: unmet.join(', ') };
  }
  // 4 — a lane in this programme is free (AFKF-D18, KNOWN_TRAP_12)
  const holders = programSlices.filter(
    (s) => s.slice_id !== slice.slice_id && HOLDING_STATES.includes(s.state),
  );
  if (!laneIsFree(slice, holders)) {
    return {
      ready: false,
      reason: REFUSAL.PROGRAM_LANE_BUSY,
      detail: holders.map((h) => h.slice_id).join(', '),
    };
  }
  // 5 — the daily CI ceiling has headroom (Q2).
  //     AFKF-12 builds the measurement; until it does, the caller passes
  //     nothing and this reads as headroom. Deliberately an INPUT, not a
  //     constant here: the ceiling is a live number read from GitHub's billing
  //     API, and hard-coding a stand-in is how a brake stops being a brake.
  if (ceiling && ceiling.headroom === false) {
    return { ready: false, reason: REFUSAL.CI_CEILING, detail: ceiling.reason ?? '' };
  }
  // 7 — the one condition Q4 does not list. A queue exists to be claimed from
  //     without asking, and a slice the plan reserved for the CEO may not be:
  //     WAC's queue is stalled on WAC-3b (`AUTONOMY: HITL`) and MDUR-9 is
  //     tagged the same way, so both would be offered the moment they reached
  //     the front. See parseSliceAutonomy for what this can and cannot know.
  if (slice.autonomy === 'HITL') {
    return { ready: false, reason: REFUSAL.HITL, detail: 'the plan tagged this one for the CEO' };
  }
  /**
   * 8 — AFKF-18b. A slice whose `HOLD` is not released is not ready, and the queue is the second
   *     door into a launch: the chain planner covers a merge that chains, this covers "what should
   *     I take next". Gating only the planner would have left `afkf:chain-queue` cheerfully
   *     offering AFKF-18 — which is how the slice got started early in the first place.
   *
   *     `holdGates` is an INPUT for the same reason `ceiling` is: evaluating it is a database read,
   *     and a stand-in constant here is how a brake stops being a brake. Nothing passed means
   *     nothing evaluated, and `evaluateHold` reads that as held.
   */
  const holdVerdict = evaluateHold(slice.hold, ctx.holdGates ?? {});
  if (holdVerdict.held) {
    return { ready: false, reason: REFUSAL.HELD, detail: holdVerdict.reason };
  }
  // 6 — lane share across programmes: decided by selectLanes, not here, because
  //     it is a property of the whole queue rather than of one slice.
  return { ready: true, reason: null };
}

/** Sort key helpers — kept separate so the ordering can be asserted directly. */
export function priorityIndex(priority) {
  const i = PRIORITY_ORDER.indexOf(priority);
  return i === -1 ? PRIORITY_ORDER.length : i;
}

/**
 * Q4's ordering: priority bucket, then rank, then oldest `ready_since`.
 *
 * Two tie-breaks beyond the spec, both for determinism rather than judgement: a
 * null `ready_since` sorts after any real one (a slice that has never been ready
 * is not "older"), and `queue_position` then `slice_id` settle a genuine draw so
 * two runs of the queue never disagree about the order.
 *
 * @param {any[]} entries
 */
export function orderReady(entries) {
  return [...entries].sort((a, b) => {
    const p = priorityIndex(a.priority) - priorityIndex(b.priority);
    if (p !== 0) return p;
    const r = (a.rank ?? 0) - (b.rank ?? 0);
    if (r !== 0) return r;
    const at = a.ready_since ? Date.parse(a.ready_since) : Number.POSITIVE_INFINITY;
    const bt = b.ready_since ? Date.parse(b.ready_since) : Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    const q = (a.queue_position ?? 0) - (b.queue_position ?? 0);
    if (q !== 0) return q;
    return String(a.slice_id).localeCompare(String(b.slice_id));
  });
}

/**
 * The three lanes: the top ready rows with DISTINCT `program_code`.
 *
 * That distinctness is AFKF-D17 expressed as a property of the query as well as
 * of the index — Exit E-C. A programme that is already holding a lane cannot
 * reach here at all (rule 4 refused it), so this is about not giving one
 * programme two of the three lanes on the same pass.
 *
 * `companions` carries the group-mates that may legitimately start alongside the
 * chosen slice (AFKF-D18). They are not extra lanes: three lanes stay three
 * programmes.
 *
 * @param {any[]} ordered output of orderReady
 * @param {number} [lanes]
 */
export function selectLanes(ordered, lanes = LANE_COUNT) {
  const taken = new Set();
  const out = [];
  for (const entry of ordered) {
    if (out.length >= lanes) break;
    if (taken.has(entry.program_code)) continue;
    taken.add(entry.program_code);
    const companions = entry.parallel_group
      ? ordered
          .filter(
            (o) =>
              o.program_code === entry.program_code &&
              o.slice_id !== entry.slice_id &&
              o.parallel_group === entry.parallel_group,
          )
          .map((o) => o.slice_id)
      : [];
    out.push({ ...entry, companions });
  }
  return out;
}

/**
 * The whole queue, from rows to lanes.
 *
 * @param {object} input
 * @param {any[]} input.programs
 * @param {any[]} input.slices
 * @param {boolean} [input.chainPaused]
 * @param {{ headroom: boolean, reason?: string | null }} [input.ceiling]
 * @param {number} [input.lanes]
 */
export function buildQueue({
  programs,
  slices,
  chainPaused = false,
  chainPausedReason = '',
  ceiling,
  lanes = LANE_COUNT,
  /**
   * AFKF-18b. `holds` maps slice id → the parsed `HOLD:` tags from its §12 block; `holdGates` maps
   * gate name → whether it has released. Both are inputs, both default to empty, and an empty
   * `holdGates` holds every slice that carries a hold rather than releasing it. That asymmetry is
   * the safe one: a caller that has not been updated offers less work, never more.
   */
  holds = {},
  holdGates = {},
}) {
  const byCode = new Map(programs.map((p) => [p.code, p]));
  /** @type {Record<string, any[]>} */
  const grouped = {};
  for (const s of slices) (grouped[s.program_code] ??= []).push(s);

  const ready = [];
  const refused = [];
  for (const row of slices) {
    const program = byCode.get(row.program_code);
    // The hold lives in the master doc, not in `chain_slices` — deliberately. A hold's release
    // condition is a CHECK, not a date, and a date is the only thing a column could hold; the
    // stopgap this replaces was exactly such a date, and it was wrong.
    const slice = { ...row, hold: row.hold ?? holds[row.slice_id] ?? null };
    const verdict = evaluateSlice(slice, {
      program,
      programSlices: grouped[slice.program_code] ?? [],
      chainPaused,
      chainPausedReason,
      ceiling,
      holdGates,
    });
    const entry = {
      program_code: slice.program_code,
      slice_id: slice.slice_id,
      priority: program?.priority ?? 'whenever',
      rank: program?.rank ?? 0,
      ready_since: slice.ready_since ?? null,
      queue_position: slice.queue_position ?? 0,
      parallel_group: slice.parallel_group ?? null,
      autonomy: slice.autonomy ?? 'AFK',
      hold: slice.hold ?? null,
    };
    if (verdict.ready) ready.push(entry);
    else refused.push({ ...entry, reason: verdict.reason, detail: verdict.detail ?? '' });
  }

  const ordered = orderReady(ready);
  return { ready: ordered, lanes: selectLanes(ordered, lanes), refused };
}

// ---------------------------------------------------------------------------
// CLI — the only part that touches the network.
// ---------------------------------------------------------------------------

function loadEnvLocal() {
  const path = resolve(root, '.env.local');
  if (!existsSync(path)) return {};
  /** @type {Record<string,string>} */
  const vars = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) vars[m[1]] = m[2].trim();
  }
  return vars;
}

export async function fetchChainRows(key) {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async (path) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  const [programs, slices] = await Promise.all([
    get('chain_programs?select=code,priority,rank,state,paused_reason&order=priority,rank'),
    get(
      'chain_slices?select=program_code,slice_id,state,autonomy,depends_on,parallel_group,blocked_on_question,ready_since,queue_position&order=program_code,queue_position',
    ),
  ]);
  return { programs, slices };
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const showAll = args.includes('--all');
  const env = loadEnvLocal();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) {
    console.error('SUPABASE_SERVICE_ROLE_KEY missing — run npm run access:check');
    process.exit(1);
  }

  const { programs, slices } = await fetchChainRows(key);

  /**
   * AFKF-12 supplies ready-rule 5's input.
   *
   * It arrives from the caller rather than being derived here, which is the
   * point KNOWN_TRAP_14 paid for: a condition whose input nothing writes ships
   * decorative and reads green. `readCeiling` reads the one `chain_ci_budget`
   * row, and at 100% the verdict is not merely "no headroom" but a paused
   * chain — the difference between stopping the reach for new work and stopping
   * everything.
   */
  const verdict = await readCeiling({ key });

  /**
   * AFKF-13 supplies the chain's OTHER pause (AFKF-D36).
   *
   * Derived from the same rows the queue just read, so it costs no extra query
   * and cannot disagree with them. Three slices failing in a row is a fact
   * about the chain, not about one document, so it stops every lane — and a
   * merge clears it by definition, which is why nothing has to remember to
   * reset a counter (KNOWN_TRAP_11).
   */
  const failures = failurePause(slices);

  /**
   * AFKF-14 supplies the chain's THIRD pause — the one a person asked for.
   *
   * Read here as well as on the claim path, so the queue answers the same
   * question the launcher does. A queue that kept offering slices while the
   * chain was paused would be the decorative gate this programme has now paid
   * for three times (KNOWN_TRAP_11, 14, 16).
   *
   * Imported dynamically, and only here in the CLI, because the chat surface
   * imports this file's `buildQueue` — a static import back would be a cycle.
   * The pure half of this module still imports nothing.
   */
  const { controlPause, readControlRow } = await import('./afkf-chat.mjs');
  const manual = controlPause(await readControlRow(key));

  const paused = manual.paused || isChainPaused(verdict) || failures.paused;

  /**
   * AFKF-18b supplies ready-rule 8's two inputs, and it is the same lesson as rules 5 and 7: a
   * condition whose input nothing writes ships decorative and reads green (KNOWN_TRAP_14). The
   * holds come from the master docs the plan already writes; the gates come from recorded
   * evidence. Neither is derived inside the rule.
   */
  const holds = holdsFromLiveDocs();
  const { gates: holdGates } = await evaluateKnownGates();

  const queue = buildQueue({
    programs,
    slices,
    holds,
    holdGates,
    chainPaused: paused,
    chainPausedReason: manual.paused
      ? manual.reason
      : failures.paused
        ? failures.reason
        : (verdict.reason ?? ''),
    ceiling: ceilingInput(verdict),
  });

  if (asJson) {
    console.log(
      JSON.stringify({ ...queue, ceiling: verdict, failurePause: failures, manualPause: manual }, null, 2),
    );
    return;
  }

  console.log('AFKF-11 ranked queue — derived, never declared');
  console.log('');
  console.log(
    `CI ceiling: ${verdict.level}` +
      (verdict.pct === null ? '' : ` — ${verdict.pct}% of the day's ${verdict.allowanceMinutes} min`) +
      (verdict.headroom ? '' : ' — CLAIMING STOPPED'),
  );
  console.log(
    `Failures: ${failures.consecutiveFailures} in a row, pauses at ${failures.threshold}` +
      (failures.paused ? ' — CHAIN PAUSED' : ''),
  );
  console.log(`Asked to pause: ${manual.paused ? `yes — ${manual.reason} (by ${manual.by})` : 'no'}`);
  if (failures.reason) console.log(`  ${failures.reason}`);
  console.log('');
  console.log(`Lanes (${queue.lanes.length}/${LANE_COUNT} filled, one programme each):`);
  if (queue.lanes.length === 0) console.log('  none — nothing is ready');
  for (const lane of queue.lanes) {
    const extra = lane.companions.length ? `  + ${lane.companions.join(', ')} (${lane.parallel_group})` : '';
    console.log(`  ${lane.program_code.padEnd(12)} ${lane.slice_id.padEnd(12)} ${lane.priority}/${lane.rank}${extra}`);
  }
  console.log('');
  console.log(`Ready, in order (${queue.ready.length}):`);
  for (const r of queue.ready) console.log(`  ${r.program_code.padEnd(12)} ${r.slice_id}`);
  if (showAll) {
    console.log('');
    console.log(`Not ready (${queue.refused.length}) — every one with the rule that refused it:`);
    for (const r of queue.refused) {
      console.log(`  ${r.program_code.padEnd(12)} ${r.slice_id.padEnd(12)} ${r.reason}${r.detail ? ` — ${r.detail}` : ''}`);
    }
  } else {
    const counts = {};
    for (const r of queue.refused) counts[r.reason] = (counts[r.reason] ?? 0) + 1;
    console.log('');
    console.log(`Not ready (${queue.refused.length}): ` + (Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'));
    console.log('  (--all lists every one)');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
}
