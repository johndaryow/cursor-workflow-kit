#!/usr/bin/env node
/**
 * AFKF-14 — four sentences work in any chat.
 *
 *   "where are we?"      answered from the live rows, without opening a document
 *   "pause the chain"    stops claiming, within one slice boundary
 *   "do MDUR next"       reorders the queue
 *   "resume"             starts it again
 *
 * WHY THIS IS A SCRIPT AND NOT A PROMPT. "Any chat" means a fresh session with
 * no other context, so the behaviour cannot live in one agent's memory or in a
 * skill that only the chain's own sessions load. It lives in one always-on rule
 * (`AGENTS.md`) whose whole content is "run this
 * command", and the command does the work. A rule that told an agent HOW to
 * answer would be a second implementation of the queue, and two implementations
 * are what KNOWN_TRAP_13's dashboard-rebuild lesson is about.
 *
 * WHY "WHERE ARE WE?" MAY NOT READ A MASTER DOC (Exit E-D). The documents are a
 * rendering of the rows (AFKF-10). Answering from a document would reintroduce
 * the second source of truth the database replaced, and it would be wrong in
 * exactly the situation the question is asked in — mid-slice, when the file has
 * not been written yet. So the status path takes rows and nothing else, and the
 * test proves it by running this file in a directory where `docs/` does not
 * exist at all.
 *
 * WHY AN AMBIGUOUS SENTENCE ASKS EXACTLY ONE QUESTION, CARRYING AN ANSWER
 * (AFKF-D30). "Do people next" could be four things. Listing four things and
 * asking the CEO to choose hands back the work the machine was asked to do —
 * that is the status-check session this programme is trying to delete. One
 * question, one recommended answer, at most one alternative. A question with no
 * recommendation is a defect, and `wellFormedQuestion()` is where that is
 * enforced rather than hoped for.
 *
 * WHY A REORDER IS ONE `update` OF ONE COLUMN (Exit E-E). `priority` is set once
 * at creation and never inferred (AFKF-D16); a sentence moves `rank`. Anything
 * that rewrote several rows would be a re-plan wearing a sentence's clothes, and
 * it could not be undone by saying the other programme's name.
 *
 * Usage:
 *   npm run afkf:chat -- "where are we?"
 *   npm run afkf:chat -- "pause the chain"      [--dry-run] [--by "dary"]
 *   npm run afkf:chat -- "resume"
 *   npm run afkf:chat -- "do MDUR next"
 *   npm run afkf:chat -- "where are we?" --json
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildQueue, fetchChainRows, holdsFromLiveDocs, LANE_COUNT } from './afkf-chain-queue.mjs';
import { evaluateKnownGates } from './afkf-hold.mjs';
import { ceilingInput, isChainPaused, readCeiling } from './afkf-ci-ceiling.mjs';
import { failurePause } from './afkf-retry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

export const SUPABASE_URL = 'https://bmeqxvnaclssbefpshlb.supabase.co';

/** The four sentences, plus the two answers a sentence can get that are not one of them. */
export const INTENT = Object.freeze({
  STATUS: 'status',
  PAUSE: 'pause',
  RESUME: 'resume',
  REORDER: 'reorder',
  UNKNOWN: 'unknown',
});

/**
 * Slice states that mean "this one is in flight right now".
 *
 * Deliberately the same two the queue calls HOLDING_STATES. Imported rather than
 * re-listed would be better still, but the queue exports it under a name that
 * describes a lane and this describes an answer; the test asserts they match, so
 * a third state added there cannot go unnoticed here.
 */
export const IN_FLIGHT_STATES = Object.freeze(['claimed', 'running']);

// ---------------------------------------------------------------------------
// Parsing — pure, and the only place a sentence turns into an intent.
// ---------------------------------------------------------------------------

/**
 * The reorder shapes, in the order they are tried. Each captures the programme
 * the CEO named in group 1.
 *
 * WHY NOT ONE CLEVER REGEX. Because the failure mode of a clever one is silent:
 * it matches "pause the chain next week" as a reorder of a programme called
 * "the chain". Small, named shapes fail to match instead, and an unmatched
 * sentence asks a question rather than acting on a guess.
 */
const REORDER_SHAPES = Object.freeze([
  /^(?:let'?s\s+)?(?:can you\s+|please\s+)?do\s+(.+?)\s+(?:next|first)\b/i,
  /^(?:switch|move)\s+to\s+(.+?)\s*$/i,
  /^(?:prioriti[sz]e|prioritize)\s+(.+?)\s*$/i,
  /^work\s+on\s+(.+?)\s+(?:next|first)\b/i,
  /^(.+?)\s+(?:next|first)\s*$/i,
  /^put\s+(.+?)\s+(?:at the )?(?:front|top)\b/i,
]);

const STATUS_SHAPES = Object.freeze([
  /\bwhere\s+are\s+we\b/i,
  /\bwhat'?s?\s+(?:the\s+)?(?:status|happening|going on)\b/i,
  /^status\b/i,
  /\bhow'?s?\s+(?:the\s+)?chain\b/i,
  /\bwhat\s+are\s+(?:we|you)\s+working\s+on\b/i,
  /\bchain\s+status\b/i,
]);

const PAUSE_SHAPES = Object.freeze([
  /\bpause\s+(?:the\s+)?(?:chain|everything)\b/i,
  /^pause\s*[.!]?$/i,
  /\b(?:stop|halt|hold)\s+(?:the\s+)?(?:chain|everything)\b/i,
  /\bstop\s+starting\s+new\s+work\b/i,
]);

const RESUME_SHAPES = Object.freeze([
  /\bresume\s+(?:the\s+)?chain\b/i,
  /^resume\s*[.!]?$/i,
  /\bun-?pause\b/i,
  /\b(?:start|restart)\s+the\s+chain\b/i,
  /\bcarry\s+on\b/i,
]);

/** Words a CEO puts around a programme name that are not part of it. */
const SUBJECT_NOISE =
  /^(?:the|a|an|programme|program|project|please|work|slice|slices|on)\s+|\s+(?:programme|program|project|please|slice|slices)$/gi;

/**
 * @param {string} raw one sentence, exactly as typed.
 * @returns {{ intent: string, subject: string|null, sentence: string }}
 */
export function parseSentence(raw) {
  const sentence = String(raw ?? '').trim();
  const bare = sentence.replace(/[?.!]+\s*$/, '').trim();
  if (!bare) return { intent: INTENT.UNKNOWN, subject: null, sentence };

  // Pause and resume are checked before reorder, because "stop the chain" ends
  // in a noun and the loosest reorder shape ("<something> next") must never get
  // the chance to read a brake as a reordering.
  if (PAUSE_SHAPES.some((re) => re.test(bare))) return { intent: INTENT.PAUSE, subject: null, sentence };
  if (RESUME_SHAPES.some((re) => re.test(bare))) return { intent: INTENT.RESUME, subject: null, sentence };
  if (STATUS_SHAPES.some((re) => re.test(bare))) return { intent: INTENT.STATUS, subject: null, sentence };

  for (const shape of REORDER_SHAPES) {
    const m = shape.exec(bare);
    if (m) {
      const subject = m[1].replace(SUBJECT_NOISE, '').trim();
      if (subject) return { intent: INTENT.REORDER, subject, sentence };
    }
  }
  return { intent: INTENT.UNKNOWN, subject: null, sentence };
}

// ---------------------------------------------------------------------------
// Questions — one, with an answer in it.
// ---------------------------------------------------------------------------

/**
 * A question the CEO can answer in one word, carrying the answer we would pick.
 *
 * @param {{ question: string, recommend: string, alternative?: string|null }} q
 */
export function ask({ question, recommend, alternative = null }) {
  return { kind: 'question', question, recommend, alternative };
}

/**
 * AFKF-D30, enforced rather than hoped for: a question without a recommendation
 * is a defect, and so is one that dumps a list instead of asking something.
 *
 * @param {any} q
 */
export function wellFormedQuestion(q) {
  if (!q || q.kind !== 'question') return false;
  if (typeof q.question !== 'string' || !q.question.trim()) return false;
  if (typeof q.recommend !== 'string' || !q.recommend.trim()) return false;
  if (!q.question.includes('?')) return false;
  // One question, never two stacked into one string.
  if ((q.question.match(/\?/g) ?? []).length !== 1) return false;
  // At most one alternative beside the recommendation — three choices is a list.
  // `undefined` counts as "no alternative": a question that offers none is the
  // tightest shape, and refusing it here would have made the strictest answer
  // the illegal one.
  return q.alternative === null || q.alternative === undefined || typeof q.alternative === 'string';
}

// ---------------------------------------------------------------------------
// Naming a programme — the only genuinely ambiguous input.
// ---------------------------------------------------------------------------

/** Lowercase, letters and digits only, so "PP People" and "pp-people" are one thing. */
export function normalizeName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * How well a typed phrase names a programme. Higher is better; 0 is no match.
 *
 * Exact code beats a title that merely contains the word, which is what stops
 * "lyric" resolving to LIX because both start with L.
 */
export function nameScore(phrase, program) {
  const p = normalizeName(phrase);
  if (!p) return 0;
  const code = normalizeName(program.code);
  const title = normalizeName(program.title);
  if (p === code) return 100;
  if (code.startsWith(p) && p.length >= 3) return 80;
  if (title.startsWith(p) && p.length >= 3) return 70;
  if (title.includes(p) && p.length >= 4) return 50;
  if (p.includes(code) && code.length >= 3) return 40;
  return 0;
}

/**
 * @param {string} phrase
 * @param {Array<{code:string,title:string,priority:string,rank:number,state:string}>} programs
 * @returns {{ match: any }|{ kind:'question', question:string, recommend:string, alternative:string|null }}
 */
export function resolveProgram(phrase, programs) {
  const scored = (programs ?? [])
    .map((p) => ({ p, score: nameScore(phrase, p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.code.localeCompare(b.p.code));

  if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) {
    return { match: scored[0].p };
  }

  if (scored.length === 0) {
    // Nothing matched. The recommendation is the programme already running,
    // because "do X next" from someone whose X does not exist is nearly always
    // a name I do not know for work that is already moving.
    const running = (programs ?? []).find((p) => p.state === 'running') ?? (programs ?? [])[0];
    return ask({
      question: `I have no programme called "${phrase}" — did you mean ${running ? running.code : 'none of the live ones'}?`,
      recommend: running ? `yes, put ${running.code} next` : 'name a programme code and I will move it',
      alternative: 'say a different name and I will look again',
    });
  }

  // A genuine tie. Name ONE, ask yes/no — never print the list (Exit E-C).
  const [first, second] = scored;
  return ask({
    question: `"${phrase}" could be ${first.p.code} or ${second.p.code} — shall I put ${first.p.code} next?`,
    recommend: `yes, ${first.p.code}`,
    alternative: `no, ${second.p.code}`,
  });
}

// ---------------------------------------------------------------------------
// The reorder — one row, one column (Exit E-E).
// ---------------------------------------------------------------------------

export const PRIORITY_ORDER = Object.freeze(['now', 'soon', 'whenever']);

/** The highest-priority bucket that any programme is actually in. */
export function topBucket(programs) {
  for (const bucket of PRIORITY_ORDER) {
    if ((programs ?? []).some((p) => p.priority === bucket)) return bucket;
  }
  return null;
}

/**
 * Move one programme to the front of the queue by changing one number.
 *
 * `priority` is deliberately untouched (AFKF-D16). If the named programme sits
 * in a lower bucket than the work at the front, moving its rank alone would
 * LOOK like it worked and change nothing — the decorative-gate shape this
 * programme has now paid for three times (KNOWN_TRAP_11, 14, 16). So that case
 * asks one question instead, and the question carries the answer.
 *
 * @returns {{ kind:'plan', code:string, rank:number, sql:string, alreadyNext:boolean }|{kind:'question'}}
 */
export function reorderPlan({ programs, program }) {
  const bucket = topBucket(programs);
  if (program.priority !== bucket) {
    return ask({
      question: `${program.code} is in the "${program.priority}" bucket while the front of the queue is "${bucket}" — move it to the front of "${program.priority}" anyway?`,
      recommend: `yes, front of "${program.priority}" — priority is set once at planning time and I should not re-bucket it`,
      alternative: `say "make ${program.code} a now priority" and I will raise the bucket instead`,
    });
  }

  const peers = (programs ?? []).filter((p) => p.priority === program.priority);
  const minRank = peers.reduce((lo, p) => Math.min(lo, Number(p.rank ?? 0)), Number.POSITIVE_INFINITY);
  const alreadyNext =
    Number(program.rank ?? 0) === minRank && peers.every((p) => p.code === program.code || Number(p.rank ?? 0) > minRank);
  const rank = alreadyNext ? Number(program.rank ?? 0) : minRank - 1;

  return {
    kind: 'plan',
    code: program.code,
    rank,
    alreadyNext,
    sql: `update public.chain_programs set rank = ${rank} where code = '${program.code}';`,
  };
}

/** How many rows a plan writes. One. The test asserts on this rather than on prose. */
export function rowsTouched(plan) {
  if (plan?.kind !== 'plan') return 0;
  return plan.alreadyNext ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Pause and resume — the switch, and what it is allowed to stop.
// ---------------------------------------------------------------------------

/**
 * @param {{ by?: string, reason?: string, now?: Date }} args
 */
export function pausePatch({ by = 'chat', reason = 'asked in chat', now = new Date() } = {}) {
  return { paused: true, paused_reason: reason, paused_by: by, paused_at: now.toISOString() };
}

export function resumePatch({ now = new Date() } = {}) {
  return { paused: false, paused_reason: null, paused_by: null, resumed_at: now.toISOString() };
}

/**
 * The manual pause as the claim path and the queue read it.
 *
 * Never throws and never invents: an unreadable row degrades to "not paused",
 * exactly as the CI ceiling and the failure pause do, because halting every
 * programme over a Supabase blip is the silent stall this programme exists to
 * end. The unknown is reported, never swallowed.
 *
 * @param {any} row a `chain_control` row, or null
 */
export function controlPause(row) {
  if (!row || row.paused !== true) return { paused: false, reason: null, by: null, at: null };
  return {
    paused: true,
    reason: row.paused_reason || 'the chain was paused from a chat',
    by: row.paused_by || 'unknown',
    at: row.paused_at || null,
  };
}

// ---------------------------------------------------------------------------
// "Where are we?" — from rows, never from a document (Exit E-D).
// ---------------------------------------------------------------------------

/**
 * @param {{ programs:any[], slices:any[], queue:any, ceiling:any, failures:any, control:any }} input
 */
export function statusReport({ programs, slices, queue, ceiling, failures, control }) {
  const manual = controlPause(control);
  const inFlight = (slices ?? []).filter((s) => IN_FLIGHT_STATES.includes(s.state));
  const merged = (slices ?? []).filter((s) => s.state === 'merged');
  const failed = (slices ?? []).filter((s) => s.state === 'failed');

  const pausedBy = [];
  if (manual.paused) pausedBy.push(`asked in chat by ${manual.by}`);
  if (failures?.paused) pausedBy.push(failures.reason ?? 'three slices failed in a row');
  if (ceiling && isChainPaused(ceiling)) pausedBy.push(ceiling.reason ?? "the day's CI allowance is spent");

  const lanes = (queue?.lanes ?? []).map((l) => `${l.program_code} ${l.slice_id}`);
  const refusalCounts = {};
  for (const r of queue?.refused ?? []) refusalCounts[r.reason] = (refusalCounts[r.reason] ?? 0) + 1;
  const topRefusal = Object.entries(refusalCounts).sort((a, b) => b[1] - a[1])[0] ?? null;

  const lines = [];
  lines.push(pausedBy.length ? `Chain: PAUSED — ${pausedBy.join('; ')}` : 'Chain: running');
  lines.push(
    inFlight.length
      ? `Working on now: ${inFlight.map((s) => `${s.program_code} ${s.slice_id}`).join(' · ')}`
      : 'Working on now: nothing is in flight',
  );
  lines.push(lanes.length ? `Next up: ${lanes.join(' · ')}` : `Next up: nothing is ready`);
  lines.push(
    `Waiting: ${queue?.refused?.length ?? 0} slice(s)` +
      (topRefusal ? ` — most common reason: ${topRefusal[0]} (${topRefusal[1]})` : ''),
  );
  lines.push(`Done so far: ${merged.length} merged${failed.length ? ` · ${failed.length} failed` : ''}`);
  if (ceiling) {
    lines.push(
      `CI budget: ${ceiling.level}` +
        (ceiling.pct === null || ceiling.pct === undefined ? '' : ` — ${ceiling.pct}% of today's allowance used`),
    );
  }
  lines.push(`Failures in a row: ${failures?.consecutiveFailures ?? 0} (chain pauses at ${failures?.threshold ?? 3})`);

  return {
    kind: 'status',
    paused: pausedBy.length > 0,
    pausedBecause: pausedBy,
    inFlight: inFlight.map((s) => ({ program_code: s.program_code, slice_id: s.slice_id, state: s.state })),
    nextUp: lanes,
    waiting: queue?.refused?.length ?? 0,
    merged: merged.length,
    failed: failed.length,
    programs: (programs ?? []).length,
    lanes: LANE_COUNT,
    lines,
  };
}

// ---------------------------------------------------------------------------
// The whole decision, still pure: a sentence plus rows becomes an answer.
// ---------------------------------------------------------------------------

/**
 * @param {{ sentence:string, programs:any[], slices:any[], queue:any, ceiling:any, failures:any, control:any, by?:string, now?:Date }} input
 */
export function decide(input) {
  const parsed = parseSentence(input.sentence);

  switch (parsed.intent) {
    case INTENT.STATUS:
      return { intent: parsed.intent, ...statusReport(input) };

    case INTENT.PAUSE: {
      const already = controlPause(input.control);
      return {
        intent: parsed.intent,
        kind: 'write',
        table: 'chain_control',
        patch: pausePatch({ by: input.by, now: input.now }),
        alreadyDone: already.paused,
        say: already.paused
          ? 'The chain was already paused. Nothing in flight was touched.'
          : 'Chain paused. Nothing new will be claimed. The slice already running finishes normally.',
      };
    }

    case INTENT.RESUME: {
      const already = controlPause(input.control);
      return {
        intent: parsed.intent,
        kind: 'write',
        table: 'chain_control',
        patch: resumePatch({ now: input.now }),
        alreadyDone: !already.paused,
        say: already.paused
          ? 'Chain resumed. The next merge claims the next slice.'
          : 'The chain was already running. Nothing changed.',
      };
    }

    case INTENT.REORDER: {
      const resolved = resolveProgram(parsed.subject, input.programs);
      if (resolved.kind === 'question') return { intent: parsed.intent, ...resolved };
      const plan = reorderPlan({ programs: input.programs, program: resolved.match });
      if (plan.kind === 'question') return { intent: parsed.intent, ...plan };
      return {
        intent: parsed.intent,
        kind: 'write',
        table: 'chain_programs',
        code: plan.code,
        patch: { rank: plan.rank },
        sql: plan.sql,
        rowsTouched: rowsTouched(plan),
        alreadyDone: plan.alreadyNext,
        say: plan.alreadyNext
          ? `${plan.code} is already at the front of the queue. Nothing to change.`
          : `${plan.code} goes next. Its rank is now ${plan.rank}; nothing else moved.`,
      };
    }

    default:
      return {
        intent: INTENT.UNKNOWN,
        ...ask({
          question: `I did not understand "${parsed.sentence}" — did you want the chain's status?`,
          recommend: 'yes, say "where are we?"',
          alternative: 'the other three are "pause the chain", "resume", and "do <programme> next"',
        }),
      };
  }
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

export async function readControlRow(key) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/chain_control?select=*&id=eq.default`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? (rows[0] ?? null) : null;
  } catch {
    return null;
  }
}

async function patchRow(key, path, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/**
 * Split the command line into the sentence and the flags.
 *
 * Written out rather than done with `indexOf`, because the sentence is free
 * text: "do the resume next" contains a word that is also a flag value, and an
 * `indexOf` scan reads the wrong one. Flags that take a value are named here, so
 * a value is never mistaken for part of the sentence.
 */
export function parseArgv(argv) {
  const WITH_VALUE = new Set(['--by', '--rows']);
  const flags = new Set();
  /** @type {Record<string,string>} */
  const values = {};
  const words = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (WITH_VALUE.has(a)) {
        values[a] = argv[i + 1];
        i += 1;
      } else {
        flags.add(a);
      }
      continue;
    }
    words.push(a);
  }
  return { sentence: words.join(' '), flags, values };
}

function printAnswer(answer) {
  if (answer.kind === 'status') {
    for (const line of answer.lines) console.log(line);
    return;
  }
  if (answer.kind === 'question') {
    console.log(answer.question);
    console.log(`  I would say: ${answer.recommend}`);
    if (answer.alternative) console.log(`  Or: ${answer.alternative}`);
    return;
  }
  console.log(answer.say);
}

async function main() {
  const { sentence, flags, values } = parseArgv(process.argv.slice(2));
  const asJson = flags.has('--json');
  const dryRun = flags.has('--dry-run');
  const by = values['--by'] ?? 'chat';

  // Test hook (Exit E-D): rows from a fixture instead of the network, so the
  // status path can be proved in a directory that has no `docs/` at all.
  const rowsFile = values['--rows'];

  let programs;
  let slices;
  let control;
  let ceiling;
  let failures;
  let key = '';

  if (rowsFile) {
    const fixture = JSON.parse(readFileSync(rowsFile, 'utf8'));
    ({ programs = [], slices = [], control = null, ceiling = null } = fixture);
    failures = failurePause(slices);
  } else {
    const env = loadEnvLocal();
    key = (process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!key) {
      console.error('SUPABASE_SERVICE_ROLE_KEY missing — run npm run access:check');
      process.exit(1);
    }
    const rows = await fetchChainRows(key);
    programs = rows.programs;
    slices = rows.slices;
    control = await readControlRow(key);
    ceiling = await readCeiling({ key });
    failures = failurePause(slices);
  }

  const manual = controlPause(control);
  /**
   * AFKF-18b — the chat surface asks the queue the same question the launcher asks, so it must ask
   * it with the same inputs. Without these two, the ready list this surface reports would include a
   * slice the chain itself refuses to start.
   *
   * Narrower than the first version of this comment claimed, and the correction is worth keeping:
   * "do X next" resolves a PROGRAMME, not a slice, and reorders `chain_programs.rank` without
   * consulting the ready list — so it launches nothing and this gate does not stop it. What these
   * inputs fix is the STATUS answer, which is what a person reads before acting.
   */
  const holds = holdsFromLiveDocs();
  const { gates: holdGates } = await evaluateKnownGates();

  const queue = buildQueue({
    programs,
    slices,
    holds,
    holdGates,
    chainPaused: manual.paused || failures.paused || (ceiling ? isChainPaused(ceiling) : false),
    chainPausedReason: manual.reason ?? failures.reason ?? ceiling?.reason ?? '',
    ceiling: ceiling ? ceilingInput(ceiling) : { headroom: true, reason: 'not read' },
  });

  const answer = decide({ sentence, programs, slices, queue, ceiling, failures, control, by });

  if (answer.kind === 'write' && !answer.alreadyDone && !dryRun && !rowsFile) {
    if (answer.table === 'chain_control') await patchRow(key, 'chain_control?id=eq.default', answer.patch);
    else await patchRow(key, `chain_programs?code=eq.${encodeURIComponent(answer.code)}`, answer.patch);
  }

  if (asJson) {
    console.log(JSON.stringify({ sentence, dryRun, ...answer }, null, 2));
    return;
  }
  printAnswer(answer);
  if (answer.kind === 'write' && dryRun) console.log('  (--dry-run — nothing was written)');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
}
