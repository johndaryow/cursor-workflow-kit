#!/usr/bin/env node
/**
 * AFKF-18b — a HOLD that a machine can enforce.
 *
 * WHY THIS EXISTS, AND IT IS NOT HYPOTHETICAL.
 *
 * AFKF-18's §12 block has carried this line since it was planned:
 *
 *     HOLD: do not start until the dual-write window opened by AFKF-10 has run >= 7 days with
 *           zero divergence.
 *
 * Nothing read it. `grep -rn hold scripts/` over the chain scripts returns comments and one
 * hard-coded FM gate — the tag itself was prose in a document, enforced by whoever happened to
 * read the document carefully. On 2026-08-21 a session started AFKF-18 six days early. The hold
 * was written down, correctly, in English, and that was not enough. A gate a session can read
 * past is not a gate.
 *
 * The stopgap was `BLOCKED_BY: AFKF-18 held until 2026-08-27` on the AFKF dashboard — a hand-typed
 * DATE. That date was wrong (see below), and a wrong date fails OPEN: on 2026-08-27 the line reads
 * as satisfied and the chain proceeds on a window that never closed. Replacing prose with a date
 * moves the failure, it does not remove it.
 *
 * SO A HOLD NAMES A CHECK, NEVER A DATE.
 *
 *     HOLD: <prose — what a person reads>
 *     HOLD_UNTIL: <gate name — what the chain evaluates>
 *
 * The gate is re-evaluated every time anything asks. It cannot go stale, because there is no
 * remembered answer to go stale: the question is asked against recorded evidence, now.
 *
 * WHY THE DATE IN THE DOC WAS WRONG, since it is the whole argument for this file. The window was
 * taken to have opened 2026-08-20, so seven days landed on 2026-08-27. But 2026-08-20 was never
 * recorded — the recorder did not exist until AFKF-18a merged on 2026-08-21 — and a day with no
 * row is MISSING, never clean (`summariseHistory`). A day that was never measured cannot be
 * backfilled: the evidence for it does not exist and inventing it is the failure this programme
 * exists to stop. So the earliest window that can close is 2026-08-21…2026-08-27, and the gate
 * below reports that by arithmetic instead of by anyone writing a date down again.
 *
 * FAIL CLOSED, IN ALL FOUR WAYS IT CAN FAIL.
 *
 *   1. `HOLD:` present, no `HOLD_UNTIL:`   → HELD. Prose alone is not a release condition.
 *   2. `HOLD_UNTIL:` names an unknown gate → HELD. A typo must not open the door.
 *   3. The gate could not be evaluated     → HELD. "The database was unreachable" is not "clean".
 *   4. The gate says not yet               → HELD.
 *
 * Only an evaluated gate returning `true` releases. That ordering is deliberate: every unknown
 * resolves to held, so the way to get a slice moving is to make the evidence exist, never to make
 * the check quieter.
 *
 * PURE CORE, IO AT THE EDGE. `evaluateHold` takes the gate results the caller already fetched, so
 * the interesting half is asserted without a database and `planRalphChain` stays synchronous.
 *
 * Usage:
 *   npm run afkf:hold-check                 # every slice in the registry that carries a HOLD
 *   npm run afkf:hold-check -- AFKF-18      # one slice — exits 1 when held
 *   npm run afkf:hold-check -- --json
 */
import { manilaDayOf, previousManilaDay } from './afkf-digest.mjs';

/**
 * Gates a `HOLD_UNTIL:` may name. Anything not on this list is unknown, and unknown is held.
 *
 * Keep this small. A gate is a promise that something is measured every day; adding one that
 * nothing records recreates the problem in a new place.
 */
export const KNOWN_HOLD_GATES = ['chain-divergence-window'];

/**
 * Read the HOLD tags out of a §12 slice block.
 *
 * Returns `null` when the block carries no hold — the common case, and the one that must stay
 * cheap, since every slice in every master doc goes through here.
 *
 * @param {string} blockText
 * @returns {{ prose: string, gate: string | null } | null}
 */
export function parseHoldTag(blockText) {
  const prose = blockText?.match(/^HOLD:\s*([^\n]+)/mi)?.[1]?.trim();
  const gate = blockText?.match(/^HOLD_UNTIL:\s*(\S+)/mi)?.[1]?.trim() ?? null;
  if (!prose && !gate) return null;
  return { prose: prose ?? '', gate };
}

/**
 * Is this slice held?
 *
 * @param {{ prose?: string, gate?: string | null } | null | undefined} hold
 * @param {Record<string, boolean | undefined>} [gateResults] evaluated gates, by name
 * @returns {{ held: boolean, gate: string | null, reason: string }}
 */
export function evaluateHold(hold, gateResults = {}) {
  if (!hold) return { held: false, gate: null, reason: '' };

  const gate = hold.gate ?? null;
  const prose = hold.prose ?? '';

  if (!gate) {
    return {
      held: true,
      gate: null,
      reason:
        'HOLD has no HOLD_UNTIL gate — prose alone cannot be checked, so the slice stays held' +
        (prose ? ` (${prose})` : ''),
    };
  }
  if (!KNOWN_HOLD_GATES.includes(gate)) {
    return {
      held: true,
      gate,
      reason: `HOLD_UNTIL names an unknown gate "${gate}" — known gates: ${KNOWN_HOLD_GATES.join(', ')}`,
    };
  }
  if (gateResults[gate] === true) {
    return { held: false, gate, reason: `${gate} released` };
  }
  return {
    held: true,
    gate,
    reason: `${gate} not released${gateResults[gate] === undefined ? ' (not evaluated — absence is not release)' : ''}`,
  };
}

/**
 * The seven days the divergence window must cover, ending on the last COMPLETED Manila day.
 *
 * `previousManilaDay`, not today, and the choice matters twice. It is the day the recorder itself
 * files under, so both sides name the same day — the bug AFKF-18a fixed. And a day still running
 * is a day that can still diverge; counting it would let the gate open on evidence that is not
 * finished being collected.
 *
 * @param {Date} [now]
 */
export function divergenceWindowDays(now = new Date()) {
  const end = previousManilaDay(now);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const out = [];
  for (let i = 6; i >= 0; i--) out.push(new Date(endMs - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

/**
 * The earliest day this gate could possibly release, given what is already recorded.
 *
 * Reported so a held slice answers "when?" with arithmetic rather than with a date someone typed.
 * A missing day inside the window pushes the answer past it — the window has to clear that day
 * entirely, because the day cannot be backfilled.
 *
 * @param {{ recordedDays: string[], now?: Date }} input
 * @returns {string} YYYY-MM-DD
 */
export function earliestReleaseDay({ recordedDays, divergentDays = [], now = new Date() }) {
  const recorded = new Set(recordedDays ?? []);
  const divergent = new Set(divergentDays ?? []);
  const days = divergenceWindowDays(now);

  /**
   * A DIVERGENT DAY DISQUALIFIES THE WINDOW EXACTLY AS A MISSING ONE DOES, AND THE FIRST DRAFT
   * COUNTED ONLY MISSING — found by two independent critics, which is how obvious it was.
   *
   * The gate itself was always right: `evaluateKnownGates` refuses on either. What was wrong was
   * the DATE this function reported, and only in the dirty case — with all seven days recorded and
   * one of them divergent it answered "today", when the window cannot close for another week. The
   * one number a held slice reports, optimistic, in precisely the situation that most warrants
   * pessimism. That is Exit E-E's own claim failing on its own terms.
   */
  const lastBad = [...days].reverse().find((d) => !recorded.has(d) || divergent.has(d));

  // No gap and no divergence in the current window: it closes on the next completed day — today.
  if (!lastBad) return manilaDayOf(now);

  // The window must start after the last disqualifying day, and it is seven days long. Its final
  // day is therefore lastBad + 7; the gate reads it the morning after, once that day is recorded.
  const endMs = Date.parse(`${lastBad}T00:00:00Z`) + 7 * 86_400_000;
  return new Date(endMs + 86_400_000).toISOString().slice(0, 10);
}

/**
 * The slice ids a cold start could hand a session, from its dashboard fields.
 *
 * Exported and pure because the previous version of this lived inline in `mc-status.mjs` and its
 * test re-implemented the same string munging alongside it — so the test passed while the real
 * candidate was dead. `NEXT_PROMPT: §11 · AFKF-18` reduces to `""` unless the section prefix comes
 * off first, and a test that strips the prefix itself proves only that stripping works.
 *
 * @param {{ activeSlice?: string, recommendedSlice?: string, afkQueue?: string[], nextPrompt?: string }} fields
 * @param {(v: string) => string} sliceIdOf
 */
export function holdCandidates(fields, sliceIdOf) {
  const strip = (v) => sliceIdOf(String(v ?? '').replace(/^\s*§\S*\s*[·→-]?\s*/, ''));
  return [
    strip(fields?.activeSlice),
    fields?.recommendedSlice ?? '',
    strip(fields?.afkQueue?.[0]),
    strip(fields?.nextPrompt),
  ].filter(Boolean);
}

/**
 * The first HELD slice among the ones a cold start could hand a session, or `null`.
 *
 * WHY A LIST AND NOT "THE" SLICE (critic finding, round three).
 *
 * The first cold-start gate evaluated one value — `ACTIVE_SLICE`, falling back to the queue head.
 * `ACTIVE_SLICE` names the slice that RAN, and on this dashboard it names a finished one, while
 * `AFK_QUEUE` and `NEXT_PROMPT` both point at the held slice a session would actually start. So the
 * gate reported `HOLD: none` under a recommendation to begin held work — the exact failure it had
 * just been added to prevent, one field to the left.
 *
 * There is no single field that reliably names "the slice about to be started": `AGENTS.md` sends a
 * session to `ACTIVE_SLICE` *or* the first `AFK_QUEUE` item *or* `NEXT_PROMPT` depending on what is
 * set. So every one of them is checked, and any hold among them refuses. Over-refusing costs a
 * session one command; under-refusing costs a session.
 *
 * @param {Array<string|null|undefined>} sliceIds
 * @param {Record<string, { prose: string, gate: string|null }>} holds
 * @param {Record<string, boolean>} gates
 */
export function firstHeldOf(sliceIds, holds, gates) {
  for (const slice of sliceIds) {
    if (!slice) continue;
    const verdict = evaluateHold(holds?.[slice] ?? null, gates ?? {});
    if (verdict.held) return { slice, ...verdict };
  }
  return null;
}

/* ------------------------------------------------------------------ evaluation (IO at the edge) */

/**
 * Evaluate every known gate against what is actually recorded.
 *
 * The divergence read is imported dynamically, deliberately: the pure half of this file is
 * imported by the registry, which is imported by everything, and a static import of the Supabase
 * reader would drag a network client into every consumer of a slice tag.
 *
 * A gate that THROWS is left out of the returned map, not set to `false`. Both are held —
 * `evaluateHold` treats absent as held — but the distinction survives into the reason a person
 * reads: "not evaluated" says the check could not run, "not released" says it ran and said no.
 * Reporting an outage as a clean negative is how an unmeasured week came to read as a clean one.
 *
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<{ gates: Record<string, boolean>, detail: Record<string, string> }>}
 */
export async function evaluateKnownGates({ now = new Date() } = {}) {
  /** @type {Record<string, boolean>} */
  const gates = {};
  /** @type {Record<string, string>} */
  const detail = {};

  const days = divergenceWindowDays(now);
  try {
    const { readDays } = await import('./afkf-chain-divergence.mjs');
    const rows = await readDays(days);
    const recorded = new Set(
      (rows ?? []).map((r) => String(r?.dedupe_key ?? '').replace(/^chain-divergence:/, '')),
    );
    const divergent = new Set(
      (rows ?? [])
        .filter((r) => Number(r?.payload?.divergent ?? 0) > 0)
        .map((r) => String(r?.dedupe_key ?? '').replace(/^chain-divergence:/, '')),
    );
    const missing = days.filter((d) => !recorded.has(d));
    const dirty = days.filter((d) => divergent.has(d));
    const clean = missing.length === 0 && dirty.length === 0;

    gates['chain-divergence-window'] = clean;
    detail['chain-divergence-window'] = clean
      ? `${days.length} of ${days.length} days measured and every one agreed (${days[0]} … ${days.at(-1)})`
      : `${days.length - missing.length} of ${days.length} days measured` +
        (missing.length ? `, ${missing.length} never ran (${missing.join(', ')})` : '') +
        (dirty.length ? `, ${dirty.length} divergent (${dirty.join(', ')})` : '') +
        ` — earliest possible release ${earliestReleaseDay({ recordedDays: [...recorded], divergentDays: [...divergent], now })}`;
  } catch (err) {
    detail['chain-divergence-window'] = `could not evaluate — ${String(err?.message ?? err)}`;
  }

  return { gates, detail };
}

/* ----------------------------------------------------------------------------------------- CLI */

async function main() {
  const asJson = process.argv.includes('--json');
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  const { loadMasterRegistry } = await import('./ralph-master-registry.mjs');
  const { holdsOutsideTagBlock } = await import('./afkf-chain-queue.mjs');
  const registry = loadMasterRegistry();
  const { gates, detail } = await evaluateKnownGates();

  /**
   * A `HOLD:` outside a slice's tag fence is honoured by nothing. Reported here, and it makes the
   * command exit non-zero, because the alternative is a hold somebody wrote in good faith that
   * quietly does not exist.
   */
  const { readdirSync, readFileSync: rf, existsSync: ex } = await import('node:fs');
  const { resolve: res, dirname: dn } = await import('node:path');
  const { fileURLToPath: f2p } = await import('node:url');
  const docsDir = res(dn(f2p(import.meta.url)), '..', 'docs/projects');
  const stray = [];
  const walk = (dir) => {
    if (!ex(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(res(dir, e.name));
      else if (e.name.endsWith('-master.md')) {
        stray.push(...holdsOutsideTagBlock(rf(res(dir, e.name), 'utf8'), `${e.name}: `));
      }
    }
  };
  walk(docsDir);

  const rows = [...registry.entries()]
    .filter(([id, meta]) => meta?.hold && (wanted.length === 0 || wanted.includes(id)))
    .map(([id, meta]) => ({ slice: id, program: meta.program, ...evaluateHold(meta.hold, gates) }));

  /**
   * A slice named on the command line that carries no hold is RELEASED, not missing. `hold-check
   * AFKF-19` is a question about whether it may start, and the answer for an unheld slice is yes.
   */
  for (const id of wanted) {
    if (rows.some((r) => r.slice === id)) continue;
    const meta = registry.get(id);
    rows.push({
      slice: id,
      program: meta?.program ?? 'unknown',
      ...(meta
        ? { held: false, gate: null, reason: 'no HOLD on this slice' }
        : { held: true, gate: null, reason: 'slice not found in any master doc — cannot confirm it is unheld' }),
    });
  }

  const held = rows.filter((r) => r.held);

  if (asJson) {
    console.log(JSON.stringify({ rows, gates, detail, strayHolds: stray }, null, 2));
  } else {
    console.log('AFKF-18b hold check — may these slices start?');
    console.log('');
    for (const [name, value] of Object.entries(detail)) {
      console.log(`  gate ${name}: ${gates[name] === true ? 'RELEASED' : 'not released'}`);
      console.log(`       ${value}`);
    }
    console.log('');
    if (rows.length === 0) {
      console.log('  no slice in any master doc carries a HOLD.');
    }
    for (const r of rows) {
      console.log(`  ${r.held ? '✗ HELD    ' : '✓ RELEASED'} ${r.slice.padEnd(12)} ${r.reason}`);
    }
    console.log('');
    if (stray.length) {
      console.log(`WRITTEN BUT NOT ENFORCED — ${stray.length} HOLD line(s) outside a slice's tag block:`);
      for (const line of stray) console.log(`  ${line}`);
      console.log('  Move them inside the ```text block, beside AUTONOMY. Nothing reads them there.');
      console.log('');
    }
    console.log(
      held.length
        ? `HELD: ${held.length} slice(s) may not start — ${held.map((r) => r.slice).join(', ')}.`
        : stray.length
          ? 'NOT CLEAR: nothing is held, but a HOLD is written where nothing reads it.'
          : 'CLEAR: nothing is held.',
    );
  }

  if (held.length || stray.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
}
