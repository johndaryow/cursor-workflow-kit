#!/usr/bin/env node
/**
 * AFKF-10 — Exit E-C. Does the database still say what the file says?
 *
 * This is the whole safety net of the one-week dual-write window. Both copies
 * are written during it, the database is authoritative, and the only way to
 * know that promoting it in AFKF-18 is safe is to check every day that the two
 * have not drifted apart. Zero divergence for seven days is the release gate;
 * this script is what produces that number.
 *
 * WHAT IT COMPARES. For each live programme: render the block from the row, and
 * diff it against the block in the file, byte for byte. Not a field-by-field
 * comparison — a field-by-field comparison agrees while the prose around it
 * quietly rots, and the prose is most of what a person reads.
 *
 * Three ways to be divergent, and they mean different things:
 *   - `rendered != file`  — the row and the file disagree. The real finding.
 *   - `missing row`       — a programme went live and nobody imported it.
 *   - `stale sha`         — the file block changed since import. Expected during
 *                           the window (an agent edits prose); it is the signal
 *                           to re-run the import, not a fault.
 *
 * Exit code 1 on any of the first two, so a scheduled run can alarm. A stale sha
 * alone is reported and exits 0 — it is bookkeeping, and waking someone for it
 * would be the interruption this programme exists to remove.
 *
 * AFKF-18 PRECONDITION, ADDED 2026-08-21, AND THE REASON IT IS HERE AT ALL.
 *
 * The release gate above says "zero divergence for seven days". Until now nothing ran this on a
 * schedule — not the nightly, not the digest, not the merge workflow — so the gate could only ever
 * be answered by whoever happened to type the command, and on the day AFKF-18 unholds the honest
 * answer would have been *two of seven days measured*. A gate proved by memory is not a gate.
 *
 * So each run may now `--record` one row per Manila day in `public.events`, keyed
 * `chain-divergence:<day>`, and `--history` reads those rows back. The read is deliberately
 * pessimistic in the one way that matters: **a day with no row is MISSING, never clean.** Absence
 * of evidence is the failure this whole programme exists to stop reporting as success — the same
 * rule `readNightlyForDay` already applies to the nightly, and the same rule that made an
 * unmeasured week look green in the first place.
 *
 * No third table (AFKF-X11): `public.events` already carries a unique index on `dedupe_key`, so a
 * re-run of a day writes nothing new and the row for a day is written once.
 *
 * Usage:
 *   npm run afkf:chain-divergence
 *   npm run afkf:chain-divergence -- --json
 *   npm run afkf:chain-divergence -- --record            # records the day that JUST ENDED — run daily
 *   npm run afkf:chain-divergence -- --history           # was every day of the window clean?
 *   npm run afkf:chain-divergence -- --history --days 7 --until 2026-08-27
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { manilaDayOf, previousManilaDay } from './afkf-digest.mjs';
import {
  extractDashboardBlock,
  isLiveProgram,
  programCodeFromPath,
  renderDashboardBlock,
  valuesFromRow,
} from './afkf-chain-state.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const SUPABASE_URL = 'https://bmeqxvnaclssbefpshlb.supabase.co';
const AS_JSON = process.argv.includes('--json');
const RECORD = process.argv.includes('--record');
const HISTORY = process.argv.includes('--history');

/**
 * @param {string} flag
 * @param {string|null} fallback
 */
function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

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

const env = loadEnvLocal();
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

/**
 * Compare one programme. Pure — the caller supplies both sides, so this is
 * testable without a database.
 *
 * @param {string} code
 * @param {string} fileBlock
 * @param {Record<string, any> | undefined} row
 */
export function compareProgram(code, fileBlock, row) {
  if (!row) return { code, status: 'missing-row', detail: 'no chain_programs row' };
  let rendered;
  try {
    rendered = renderDashboardBlock(row.dashboard_template ?? '', valuesFromRow(row));
  } catch (err) {
    return { code, status: 'render-failed', detail: String(err?.message ?? err) };
  }
  if (rendered !== fileBlock) {
    return { code, status: 'divergent', detail: firstDifference(rendered, fileBlock) };
  }
  const sha = createHash('sha256').update(fileBlock, 'utf8').digest('hex');
  if (row.dashboard_source_sha && row.dashboard_source_sha !== sha) {
    return { code, status: 'stale-sha', detail: 'file changed since import — re-run afkf:chain-import' };
  }
  return { code, status: 'match', detail: '' };
}

/**
 * The first line that differs, so a failure names the line instead of dumping
 * two dashboards into a log nobody will read.
 *
 * @param {string} a
 * @param {string} b
 */
export function firstDifference(a, b) {
  const left = a.split('\n');
  const right = b.split('\n');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] !== right[i]) {
      return `line ${i + 1}: db=${JSON.stringify((left[i] ?? '').slice(0, 90))} file=${JSON.stringify((right[i] ?? '').slice(0, 90))}`;
    }
  }
  return 'lengths differ with no differing line';
}

/**
 * The one line a person reads. Green or red, never a table — the same shape the nightly's line
 * takes in the digest, for the same reason: a daily report that renders a per-programme list is
 * one nobody finishes reading.
 *
 * Pure, so the wording is pinned by a test rather than by whoever edits the renderer next.
 *
 * @param {{ day: string, divergent: number, stale: number }} input
 */
export function divergenceDigestLine({ day, divergent, stale }) {
  if (divergent > 0) {
    return `Chain state ${day}: ${divergent} programme${divergent === 1 ? '' : 's'} DIVERGENT — the database and the master docs disagree.`;
  }
  const tail = stale > 0 ? ` (${stale} awaiting re-import — not a fault)` : '';
  return `Chain state ${day}: database and master docs agree${tail}.`;
}

/**
 * The window's verdict, read from what was actually recorded.
 *
 * THE ONE RULE THAT MAKES THIS WORTH HAVING: a day with no row is `missing`, and a window with any
 * missing day is NOT clean. It would be trivial — and wrong — to count only the rows present and
 * report "7 clean days" from three of them. That is precisely the arithmetic that let an unmeasured
 * week read as a clean one, and it is why `allClean` requires `recorded === days.length`.
 *
 * Pure: the caller supplies both the days it wants and the rows it read.
 *
 * @param {{ days: string[], rows: Array<{ dedupe_key?: string, payload?: any }> }} input
 * @returns {{ days: string[], recorded: number, clean: string[], divergentDays: string[], missing: string[], allClean: boolean }}
 */
export function summariseHistory({ days, rows }) {
  const byDay = new Map();
  for (const row of rows ?? []) {
    const day = String(row?.dedupe_key ?? '').replace(/^chain-divergence:/, '');
    if (day) byDay.set(day, row?.payload ?? {});
  }
  const clean = [];
  const divergentDays = [];
  const missing = [];
  for (const day of days) {
    if (!byDay.has(day)) {
      missing.push(day);
      continue;
    }
    const divergent = Number(byDay.get(day)?.divergent ?? 0);
    (divergent > 0 ? divergentDays : clean).push(day);
  }
  return {
    days,
    recorded: clean.length + divergentDays.length,
    clean,
    divergentDays,
    missing,
    allClean: missing.length === 0 && divergentDays.length === 0 && days.length > 0,
  };
}

/**
 * The N Manila days ending at `until`, inclusive and in order.
 *
 * @param {string} until YYYY-MM-DD
 * @param {number} count
 */
export function daysEndingAt(until, count) {
  const end = Date.parse(`${until}T00:00:00Z`);
  if (Number.isNaN(end) || count < 1) return [];
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(new Date(end - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

function liveDocs() {
  const dir = resolve(root, 'docs/projects');
  return readdirSync(dir)
    .filter((f) => f.endsWith('-master.md'))
    .sort()
    .map((f) => ({ rel: `docs/projects/${f}`, text: readFileSync(resolve(dir, f), 'utf8') }))
    .filter((d) => isLiveProgram(d.text));
}

/* ------------------------------------------------------------- IO (events) */

/**
 * One row per Manila day. `record_event`'s unique index on `dedupe_key` makes a re-run a no-op,
 * so the scheduled call and a manual one can both fire on the same day without doubling up.
 *
 * @param {{ day: string, divergent: number, stale: number, results: any[] }} input
 */
async function recordDay({ day, divergent, stale, results }) {
  const dedupeKey = `chain-divergence:${day}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_event`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_action: 'chain_divergence_measured',
      p_entity_type: 'afkf_chain',
      p_entity_id: dedupeKey,
      p_workspace_id: 'pp-workspace',
      p_actor_type: 'system',
      p_actor_id: null,
      p_summary: divergenceDigestLine({ day, divergent, stale }),
      p_payload: {
        day,
        divergent,
        stale,
        digestLine: divergenceDigestLine({ day, divergent, stale }),
        programs: results.map((r) => ({ code: r.code, status: r.status })),
      },
      p_source: 'automation',
      p_correlation_id: dedupeKey,
      p_sensitivity: 'normal',
      p_dedupe_key: dedupeKey,
      p_occurred_at: null,
    }),
  });
  if (!res.ok) throw new Error(`record_event failed (${res.status}): ${await res.text()}`);
}

/**
 * Which of these days have a recorded row? Exported because AFKF-18b's hold gate asks the same
 * question the `--history` verdict asks, and two readers of the same evidence must not each grow
 * their own copy of the query — one of them would drift and the drift would look like a clean day.
 *
 * @param {string[]} days
 */
export async function readDays(days) {
  const list = days.map((d) => `"chain-divergence:${d}"`).join(',');
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/events?select=dedupe_key,payload&dedupe_key=in.(${encodeURIComponent(list)})`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  );
  if (!res.ok) throw new Error(`could not read events (${res.status}): ${await res.text()}`);
  return res.json();
}

/**
 * `--history`. Exits 1 when the window is not provably clean, so a release gate can call it
 * instead of a person remembering.
 */
async function history() {
  /**
   * THE SAME WINDOW THE GATE USES, AND THEY DID NOT MATCH (critic finding, 2026-08-26).
   *
   * This defaulted to `manilaDayOf(now)` — a window ending TODAY — while `afkf-hold.mjs` ends its
   * window on the last COMPLETED day. On the release morning that produces two commands disagreeing
   * about the one number anybody cares about: `--history` printing WINDOW CLEAN while
   * `afkf:hold-check` still refuses. The master doc names THIS command as the authority, so it is
   * the one that has to be right, and "right" is the pessimistic reading both should share.
   */
  const until = argValue('--until', previousManilaDay(new Date()));
  const count = Number(argValue('--days', '7'));
  const days = daysEndingAt(String(until), count);
  const verdict = summariseHistory({ days, rows: await readDays(days) });

  if (AS_JSON) {
    console.log(JSON.stringify(verdict, null, 2));
  } else {
    console.log(`AFKF-10 chain divergence — ${days.length} day(s) ending ${until}`);
    console.log('');
    for (const day of days) {
      const mark = verdict.missing.includes(day) ? '?' : verdict.divergentDays.includes(day) ? '✗' : '✓';
      const what = verdict.missing.includes(day)
        ? 'NOT MEASURED — absence is not a clean day'
        : verdict.divergentDays.includes(day)
          ? 'divergent'
          : 'clean';
      console.log(`  ${mark} ${day}  ${what}`);
    }
    console.log('');
    console.log(
      verdict.allClean
        ? `WINDOW CLEAN: ${verdict.clean.length} of ${days.length} days measured and every one agreed.`
        : `WINDOW NOT PROVEN: ${verdict.recorded} of ${days.length} days measured` +
          `${verdict.missing.length ? `, ${verdict.missing.length} never ran` : ''}` +
          `${verdict.divergentDays.length ? `, ${verdict.divergentDays.length} divergent` : ''}.`,
    );
  }
  if (!verdict.allClean) process.exit(1);
}

async function main() {
  if (!KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY missing — run npm run access:check');
    process.exit(1);
  }
  if (HISTORY) return history();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/chain_programs?select=*`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) {
    console.error(`chain_programs read failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  /** @type {any[]} */
  const rows = await res.json();
  const byCode = new Map(rows.map((r) => [r.code, r]));

  const results = liveDocs().map((doc) => {
    const code = programCodeFromPath(doc.rel);
    return compareProgram(code, extractDashboardBlock(doc.text) ?? '', byCode.get(code));
  });

  const bad = results.filter((r) => r.status === 'divergent' || r.status === 'missing-row' || r.status === 'render-failed');
  const stale = results.filter((r) => r.status === 'stale-sha');

  if (AS_JSON) {
    console.log(JSON.stringify({ divergent: bad.length, stale: stale.length, results }, null, 2));
  } else {
    console.log('AFKF-10 chain divergence — database vs master docs');
    console.log('');
    for (const r of results) {
      const mark = r.status === 'match' ? '✓' : r.status === 'stale-sha' ? '~' : '✗';
      console.log(`  ${mark} ${r.code.padEnd(12)} ${r.status}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    console.log('');
    console.log(`DIVERGENCE: ${bad.length}`);
    if (stale.length) console.log(`STALE (not a fault): ${stale.length}`);
  }

  /**
   * Recorded BEFORE the exit, and that ordering is the point: a divergent day must leave a row
   * saying so. A record written only on the happy path would make every red day look like a day
   * the check did not run, which is the one reading `summariseHistory` treats as unproven — so the
   * failure would erase its own evidence.
   */
  if (RECORD) {
    /**
     * THE DAY THIS ROW IS FILED UNDER IS THE DIGEST'S DAY, NOT THE CLOCK'S, AND THAT IS A BUG FIX
     * RATHER THAN A PREFERENCE (caught before merge, 2026-08-21).
     *
     * The scheduled run fires at 01:00 Manila, so `manilaDayOf(now)` is already TOMORROW from the
     * digest's point of view — the digest reports "the day that just ended" (`previousManilaDay`).
     * Filing under the clock's day would mean the digest looked up `chain-divergence:<D>` while the
     * run an hour earlier had written `<D+1>`: every day's line would read "not measured", and the
     * window count would be permanently one short. Both sides must name the same day, so both use
     * the same default. A run that genuinely means today passes `--day`.
     */
    /**
     * THE DAY RECORDED IS ALWAYS A DAY THAT HAS ENDED, AND A `--today` FLAG WAS ADDED AND THEN
     * REMOVED IN THE SAME SESSION FOR A REASON WORTH KEEPING (2026-08-26).
     *
     * The flag existed for ninety minutes because a bare `--record` run in-session at 22:00 Manila
     * writes YESTERDAY, which is usually already present, so the run changes nothing while printing
     * success — and during the runner outage that looked like the window would never close.
     *
     * A critic found what `--today` cost. `record_event` dedupes on the day key, so the FIRST write
     * for a day wins permanently. A mid-day sample of a still-running day is therefore an
     * UNCORRECTABLE claim about a day that has not finished: clean at 09:00, a mirror step fails at
     * 14:00, a 22:00 re-run finds the divergence and its write is silently discarded. The gate would
     * then read that day as measured and clean. That is precisely what `afkf-hold.mjs` says a window
     * must never do — "a day still running is a day that can still diverge" — bought back a day
     * later by the convenience flag.
     *
     * So the fix for "today never gets recorded" is NOT to record today. It is to run this once a
     * day and let it record the day that just ended, which is what the scheduled job always did.
     * A day nobody was present for stays unmeasured, and unmeasured is the honest answer.
     */
    const day = argValue('--day', previousManilaDay(new Date()));
    await recordDay({ day: String(day), divergent: bad.length, stale: stale.length, results });
    if (!AS_JSON) console.log(`Recorded chain-divergence:${day}`);
  }

  if (bad.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
}
