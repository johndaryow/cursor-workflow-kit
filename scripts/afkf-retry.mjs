#!/usr/bin/env node
/**
 * AFKF-13 — a failing slice fixes itself, three times, differently.
 *
 * AFKF-D5 is the rule and AFKF-D6 is its brake:
 *
 *   - up to THREE attempts, and a fourth is refused;
 *   - each attempt must be a MATERIALLY DIFFERENT fix — a repeat stops it at
 *     once, whichever earlier attempt first used it;
 *   - a failure no retry can fix (a missing credential, a base branch already
 *     red, the day's CI budget spent) skips the loop ENTIRELY rather than
 *     spending three pushes proving it again;
 *   - three consecutive slice failures pause the chain (AFKF-D36);
 *   - and every attempt costs exactly one push, never more (Exit E-E), because
 *     a push is ~35-40 runner-minutes across six workflows and the 2026-08-14
 *     blackout is what unbounded retry looks like (KNOWN_TRAP_2).
 *
 * WHY THE DECISION IS A PURE FUNCTION AND THE ROW IS JUST STORAGE. Same shape as
 * AFKF-11's queue and AFKF-12's ceiling, for the same reason: the numbers come
 * from Postgres in production, but the ruling has to be provable in CI with no
 * database and no credentials. `decideRetry()` takes a row-shaped object and a
 * failure and returns a verdict; the CLI at the bottom is the only part that
 * touches the network. One implementation, not two that could drift.
 *
 * WHY THE CHAIN PAUSE IS DERIVED AND NOT COUNTED. The obvious design is a
 * `consecutive_failures` column that something increments on failure and
 * something else resets on success. That second something is the bug: it is
 * KNOWN_TRAP_11 in a new costume — a gate whose input nobody reliably writes.
 * `failurePause()` reads the terminal outcomes already in `chain_slices`,
 * newest first, and counts the leading failures. A merge clears it by
 * definition, and there is no reset to forget.
 *
 * Usage:
 *   npm run afkf:retry -- --status
 *   npm run afkf:retry -- --slice AFKF-13 --failure "<the red check's message>" \
 *                         --fix "<what I am about to change>" [--files a.ts,b.ts] [--apply]
 *   npm run afkf:retry -- --slice AFKF-13 --push [--apply]
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

export const SUPABASE_URL = 'https://bmeqxvnaclssbefpshlb.supabase.co';

/**
 * Three, from AFKF-D5. Exported rather than inlined so the fourth-attempt test
 * asserts the same number the code uses — a test carrying its own copy of a
 * limit is a test that keeps passing after the limit is widened.
 */
export const MAX_ATTEMPTS = 3;

/** One. Exit E-E. Same reasoning as MAX_ATTEMPTS. */
export const PUSHES_PER_ATTEMPT = 1;

/** Consecutive slice failures that pause the whole chain (AFKF-D36). */
export const FAILURES_TO_PAUSE = 3;

/**
 * Every named way the loop can end. The strings are contract — the digest
 * quotes them and AFKF-14 will answer questions with them — so renaming one
 * should break a test rather than quietly change a sentence a human reads.
 */
export const STOP = Object.freeze({
  ATTEMPT_LIMIT: 'attempt-limit',
  REPEATED_FIX: 'repeated-fix',
  NOT_RETRYABLE: 'not-retryable',
  PUSH_ALREADY_SPENT: 'push-already-spent',
});

/**
 * Failure classes that no retry can fix (Exit E-C). Retrying one of these does
 * not merely waste three pushes — it produces three identical red runs and then
 * reports "tried everything", which reads like a hard technical problem when it
 * is one missing secret.
 */
export const NON_RETRYABLE = Object.freeze([
  'missing-credential',
  'base-branch-red',
  'ci-budget-spent',
  'needs-ceo',
]);

/**
 * How a failure is recognised.
 *
 * THE PATTERNS ARE NARROW ON PURPOSE, AND THE COST OF WIDENING THEM IS
 * ASYMMETRIC. A retryable failure misread as non-retryable stops a slice that
 * three minutes of work would have fixed, and stops it silently — the row says
 * failed, nobody is paged, and the programme waits. So `token`, `secret` and
 * `403` on their own are NOT enough: a failing test whose assertion message
 * happens to print a token, or a 403 from a fixture, must stay retryable. Each
 * pattern below has to name the ABSENCE or the REFUSAL, not merely the noun.
 *
 * KNOWN_TRAP_17 is the live example of why this matters in the other direction
 * too: a 403 raised by this sandbox's own proxy was read as GitHub refusing a
 * credential, and cost a day and a needless key request. "not permitted for
 * this session type" is GitHub's own wording and is matched; a bare 403 is not.
 */
const CLASSIFIERS = Object.freeze([
  [
    'missing-credential',
    [
      /\b(secret|credential|token|api[_ -]?key)s?\b[^.\n]{0,40}\b(missing|absent|not set|unset|not configured|empty)\b/i,
      /\b(missing|no|unset|empty)\b[^.\n]{0,20}\b(secret|credential|token|api[_ -]?key)s?\b/i,
      // An env-var-shaped name. `SUPABASE_SERVICE_ROLE_KEY missing` is the exact
      // wording this repo's own scripts print, and the noun patterns above miss
      // it: the `KEY` is glued to the name by an underscore, which is a word
      // character, so `\bkey\b` never matches.
      /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(KEY|TOKEN|SECRET|PAT|PASSWORD|CREDENTIALS?)\b[^.\n]{0,40}\b(missing|absent|not set|unset|not configured|empty|required)\b/,
      /\b(missing|absent|unset|no)\b[^.\n]{0,30}\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(KEY|TOKEN|SECRET|PAT|PASSWORD|CREDENTIALS?)\b/,
      /not permitted for this session type/i,
      /\b(bad|invalid|expired|revoked)\s+(credentials|token)\b/i,
      /\bresource not accessible by integration\b/i,
    ],
  ],
  [
    'base-branch-red',
    [
      /\bbase branch\b[^.\n]{0,30}\b(red|failing|broken)\b/i,
      /\b(red|failing|broken)\b[^.\n]{0,20}\bon (the )?(base|main|master)\b/i,
      /\bfails? on (the )?base\b/i,
      /\balready (red|failing) before this (pr|change|branch)\b/i,
    ],
  ],
  [
    'ci-budget-spent',
    [
      /\bactions? (budget|spending limit)\b[^.\n]{0,30}\b(spent|exhausted|exceeded|reached|out)\b/i,
      /\b(out of|no) (runner )?minutes\b/i,
      /\bno runner (was )?assigned\b/i,
      /\bspending limit\b/i,
    ],
  ],
  [
    'needs-ceo',
    [
      /\bCEO_GATE:\s*(explicit_ok_in_chat|human_only)/i,
      /\bneeds? (the )?ceo\b/i,
      /\bhuman[_ -]only\b/i,
      /\bawaiting (ceo|human) approval\b/i,
    ],
  ],
  // Retryable, but named rather than lumped into `unknown`, because the name is
  // what a human reads in `failure_class` when they ask where three attempts went.
  [
    'test-failure',
    [/\b\d+ (test|spec)s? failed\b/i, /\bAssertionError\b/, /\bexpected .* to (be|equal)\b/i, /\btests? failed\b/i],
  ],
  ['type-error', [/\berror TS\d+\b/, /\btype ?check failed\b/i, /\btsc\b[^.\n]{0,20}\bfailed\b/i]],
  ['lint', [/\beslint\b[^.\n]{0,20}\b(error|problem)/i, /\b\d+ problems? \(\d+ errors?\b/i]],
  ['merge-conflict', [/\bmerge conflict\b/i, /\bconflicts? with the base branch\b/i, /\bCONFLICT \(content\)/]],
  ['build', [/\bbuild failed\b/i, /\bnpm ERR!\b/]],
]);

/**
 * Classify one failure. Returns the class and whether the loop may run at all.
 *
 * An unrecognised failure is RETRYABLE. That direction is deliberate: the
 * damage from retrying something unfixable is three pushes and a clear stop;
 * the damage from skipping something fixable is a stalled programme nobody was
 * told about. When in doubt, try.
 *
 * @param {string | null | undefined} text
 * @returns {{ class: string, retryable: boolean }}
 */
export function classifyFailure(text) {
  const s = String(text ?? '');
  for (const [name, patterns] of CLASSIFIERS) {
    if (patterns.some((re) => re.test(s))) {
      return { class: name, retryable: !NON_RETRYABLE.includes(name) };
    }
  }
  return { class: 'unknown', retryable: true };
}

/**
 * A stable fingerprint for one proposed fix.
 *
 * "Materially different" needs a definition a machine can hold, and the honest
 * one is: the same files changed for the same stated reason is the same fix.
 * So the fingerprint is the sorted file list plus the normalised description —
 * lower-cased, punctuation-stripped, whitespace-collapsed — so that re-wording
 * "bump the timeout" as "Bump the timeout!" does not buy a second attempt at
 * the same idea.
 *
 * WHAT IT CANNOT SEE, written down rather than hidden: two genuinely different
 * edits to the same file described in the same words fingerprint identically
 * and will be refused. That is the safe direction — it costs one re-description
 * and prevents a loop — but an agent that hits it should say what actually
 * changed, not re-run with a synonym.
 *
 * @param {{ description?: string, files?: string[] }} fix
 * @returns {string} 16 hex characters, short enough to read in a dashboard
 */
export function fixFingerprint(fix) {
  const description = String(fix?.description ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const files = [...new Set((fix?.files ?? []).map((f) => String(f).trim()).filter(Boolean))].sort();
  return createHash('sha256').update(`${files.join('\n')} ${description}`).digest('hex').slice(0, 16);
}

/** Every fingerprint a row has already tried, the singular column included. */
export function priorFingerprints(slice) {
  const list = Array.isArray(slice?.fix_fingerprints) ? slice.fix_fingerprints : [];
  const last = slice?.last_fix_fingerprint;
  return [...new Set([...list, ...(last ? [last] : [])].filter(Boolean))];
}

/**
 * The whole of AFKF-D5, as one decision over one row.
 *
 * Order matters and is itself a rule. Retryability is asked FIRST, before the
 * attempt count and before the fingerprint, because a missing credential at
 * attempt 1 and the same missing credential at attempt 3 deserve the same
 * answer — and because the message a human reads should name the credential,
 * not the attempt number that happened to expose it.
 *
 * @param {object} input
 * @param {any} input.slice a `chain_slices` row
 * @param {string} [input.failure] the red check's message
 * @param {{ description?: string, files?: string[] }} [input.fix] the fix about to be tried
 * @param {string} [input.failureClass] an explicit class, overriding the classifier
 */
export function decideRetry({ slice, failure = '', fix = {}, failureClass = null }) {
  const classified = failureClass
    ? { class: failureClass, retryable: !NON_RETRYABLE.includes(failureClass) }
    : classifyFailure(failure);
  const attempt = Number(slice?.attempt ?? 1);
  const lastError = String(failure ?? '').slice(0, 2000);
  const base = { attempt, failureClass: classified.class, fingerprint: null };

  // Exit E-C — a failure no retry can fix skips the loop entirely. Not "fails
  // at attempt 3": never enters it, so no push is spent proving it again.
  if (!classified.retryable) {
    return {
      ...base,
      retry: false,
      stop: STOP.NOT_RETRYABLE,
      reason: `${classified.class} — no retry can fix this, so the loop is skipped entirely`,
      patch: {
        state: 'failed',
        failure_class: classified.class,
        retry_stopped_reason: STOP.NOT_RETRYABLE,
        last_error: lastError,
      },
    };
  }

  // Exit E-A — a fourth attempt is refused. The row cannot even hold a 4
  // (AFKF-9's check constraint), so this states the rule where a human reads it
  // rather than leaving a 23514 nobody can interpret.
  if (attempt >= MAX_ATTEMPTS) {
    return {
      ...base,
      retry: false,
      stop: STOP.ATTEMPT_LIMIT,
      reason: `attempt ${attempt} of ${MAX_ATTEMPTS} already spent — a fourth is refused (AFKF-D5)`,
      patch: {
        state: 'failed',
        failure_class: classified.class,
        retry_stopped_reason: STOP.ATTEMPT_LIMIT,
        last_error: lastError,
      },
    };
  }

  // Exit E-B — a repeat of ANY previous fix stops it, not merely a repeat of
  // the immediately preceding one.
  const fingerprint = fixFingerprint(fix);
  const prior = priorFingerprints(slice);
  if (prior.includes(fingerprint)) {
    return {
      ...base,
      retry: false,
      fingerprint,
      stop: STOP.REPEATED_FIX,
      reason: `this fix was already tried (${fingerprint}) — repeating it is a loop, not progress`,
      patch: {
        state: 'failed',
        failure_class: classified.class,
        retry_stopped_reason: STOP.REPEATED_FIX,
        last_error: lastError,
      },
    };
  }

  const next = attempt + 1;
  return {
    ...base,
    retry: true,
    attempt: next,
    fingerprint,
    stop: null,
    reason: `attempt ${next} of ${MAX_ATTEMPTS} — a materially different fix`,
    patch: {
      state: 'claimed',
      attempt: next,
      // Reset with the attempt: Exit E-E is one push per ATTEMPT, so the budget
      // has to come back when the attempt does.
      attempt_pushes: 0,
      fix_fingerprints: [...prior, fingerprint],
      last_fix_fingerprint: fingerprint,
      failure_class: classified.class,
      retry_stopped_reason: null,
      last_error: lastError,
    },
  };
}

/**
 * Exit E-E — may this slice push right now?
 *
 * One push per attempt. Not a suggestion in a rule file that an agent is asked
 * to remember: the counter lives on the row, this is the only thing that reads
 * it, and `--apply --push` is the only thing that increments it.
 *
 * @param {any} slice
 */
export function pushDecision(slice) {
  const spent = Number(slice?.attempt_pushes ?? 0);
  const attempt = Number(slice?.attempt ?? 1);
  if (spent >= PUSHES_PER_ATTEMPT) {
    return {
      allowed: false,
      stop: STOP.PUSH_ALREADY_SPENT,
      reason: `attempt ${attempt} has already pushed once — a second push in one attempt is ~35-40 more runner-minutes for the same idea (AFKF-D6)`,
      patch: null,
    };
  }
  return {
    allowed: true,
    stop: null,
    reason: `push ${spent + 1} of ${PUSHES_PER_ATTEMPT} for attempt ${attempt}`,
    patch: { attempt_pushes: spent + 1 },
  };
}

/**
 * The most a slice may EVER push across its whole retry life. Exists so Exit
 * E-E can be asserted as a property rather than as three separate steps.
 */
export function maxPushesPerSlice() {
  return MAX_ATTEMPTS * PUSHES_PER_ATTEMPT;
}

/**
 * AFKF-D36 — three consecutive slice failures pause the chain.
 *
 * Derived, never counted (see the header). "Consecutive" means: order every
 * slice that has REACHED a terminal outcome by when it reached it, newest
 * first, and count the leading failures. Slices still planned or running are
 * not outcomes and are skipped — a planned slice sitting between two failures
 * does not break the run, and a running one does not end it early.
 *
 * Chain-wide, not per programme, because that is what D36 says and what the
 * signal means: three slices in a row failing anywhere is a fact about the
 * chain, not about one document.
 *
 * @param {any[]} slices `chain_slices` rows
 * @param {{ threshold?: number }} [opts]
 */
export function failurePause(slices, { threshold = FAILURES_TO_PAUSE } = {}) {
  const terminal = (slices ?? [])
    .filter((s) => s?.state === 'failed' || s?.state === 'merged')
    .map((s) => ({
      slice_id: s.slice_id,
      program_code: s.program_code,
      state: s.state,
      at: Date.parse(s.merged_at ?? s.updated_at ?? '') || 0,
    }))
    .sort((a, b) => b.at - a.at || String(b.slice_id).localeCompare(String(a.slice_id)));

  const streak = [];
  for (const row of terminal) {
    if (row.state !== 'failed') break;
    streak.push(row);
  }
  const paused = streak.length >= threshold;
  return {
    paused,
    consecutiveFailures: streak.length,
    threshold,
    slices: streak.map((s) => `${s.program_code}/${s.slice_id}`),
    reason: paused
      ? `${streak.length} slices failed in a row (${streak.map((s) => s.slice_id).join(', ')}) — the chain is paused until one merges`
      : null,
  };
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

export function supabaseKey() {
  const env = loadEnvLocal();
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

export const SLICE_COLUMNS =
  'program_code,slice_id,state,attempt,attempt_pushes,fix_fingerprints,last_fix_fingerprint,failure_class,retry_stopped_reason,merged_at,updated_at';

export async function fetchSlices(key, fetchImpl = fetch) {
  const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/chain_slices?select=${SLICE_COLUMNS}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`chain_slices ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function patchSlice(key, slice, patch, fetchImpl = fetch) {
  const url =
    `${SUPABASE_URL}/rest/v1/chain_slices` +
    `?program_code=eq.${encodeURIComponent(slice.program_code)}` +
    `&slice_id=eq.${encodeURIComponent(slice.slice_id)}`;
  const res = await fetchImpl(url, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH chain_slices ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function parseArgs(argv) {
  /** @type {Record<string, any>} */
  const out = { apply: false, json: false, status: false, push: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--json') out.json = true;
    else if (a === '--status') out.status = true;
    else if (a === '--push') out.push = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : 'true';
      out[key] = value;
    }
  }
  if (typeof out.files === 'string') {
    out.files = out.files.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = supabaseKey();
  if (!key) {
    console.error('SUPABASE_SERVICE_ROLE_KEY missing — run npm run access:check');
    process.exit(1);
  }
  const slices = await fetchSlices(key);
  const pause = failurePause(slices);

  if (args.status || !args.slice) {
    if (args.json) {
      console.log(JSON.stringify({ pause, maxAttempts: MAX_ATTEMPTS, pushesPerAttempt: PUSHES_PER_ATTEMPT }, null, 2));
      return;
    }
    console.log('AFKF-13 retry loop — three attempts, each materially different');
    console.log('');
    console.log(
      `Chain: ${pause.paused ? 'PAUSED' : 'running'} — ` +
        `${pause.consecutiveFailures} consecutive failure(s), pauses at ${pause.threshold}`,
    );
    if (pause.reason) console.log(`  ${pause.reason}`);
    const inLoop = slices.filter((s) => Number(s.attempt ?? 1) > 1 || s.retry_stopped_reason);
    console.log('');
    console.log(`Slices that have retried or stopped (${inLoop.length}):`);
    if (!inLoop.length) console.log('  none');
    for (const s of inLoop) {
      console.log(
        `  ${String(s.program_code).padEnd(12)} ${String(s.slice_id).padEnd(12)} ` +
          `attempt ${s.attempt}/${MAX_ATTEMPTS} pushes ${s.attempt_pushes ?? 0}/${PUSHES_PER_ATTEMPT}` +
          (s.retry_stopped_reason ? `  STOPPED: ${s.retry_stopped_reason}` : '') +
          (s.failure_class ? `  (${s.failure_class})` : ''),
      );
    }
    if (!args.slice) {
      console.log('');
      console.log('Name a slice to ask for a verdict:');
      console.log('  npm run afkf:retry -- --slice AFKF-13 --failure "<message>" --fix "<what changes>"');
    }
    return;
  }

  const slice = slices.find(
    (s) => s.slice_id === args.slice && (!args.program || s.program_code === args.program),
  );
  if (!slice) {
    console.error(`No chain_slices row for ${args.slice}${args.program ? ` in ${args.program}` : ''}`);
    process.exit(1);
  }

  const verdict = args.push
    ? { ...pushDecision(slice), kind: 'push' }
    : {
        ...decideRetry({
          slice,
          failure: args.failure ?? '',
          fix: { description: args.fix ?? '', files: args.files ?? [] },
          failureClass: args.class ?? null,
        }),
        kind: 'retry',
      };

  if (args.json) {
    console.log(JSON.stringify({ slice: slice.slice_id, verdict, pause }, null, 2));
  } else {
    const headline = args.push
      ? verdict.allowed
        ? `PUSH ALLOWED — ${verdict.reason}`
        : `PUSH REFUSED — ${verdict.stop}: ${verdict.reason}`
      : verdict.retry
        ? `RETRY — ${verdict.reason}`
        : `STOP — ${verdict.stop}: ${verdict.reason}`;
    console.log(`${slice.program_code}/${slice.slice_id}: ${headline}`);
    if (pause.paused) console.log(`Chain is PAUSED: ${pause.reason}`);
  }

  if (!args.apply || !verdict.patch) {
    if (verdict.patch) console.log('Nothing written. Re-run with --apply to write.');
    return;
  }
  await patchSlice(key, slice, verdict.patch);
  console.log(`Wrote ${Object.keys(verdict.patch).join(', ')} to ${slice.program_code}/${slice.slice_id}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
}
