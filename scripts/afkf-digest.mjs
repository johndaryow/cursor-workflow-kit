#!/usr/bin/env node
/**
 * afkf-digest.mjs — the one daily report (AFKF-3).
 *
 * Three levels and nothing between them (AFKF-D11):
 *
 *   success  -> silence. A finished slice says nothing at all.
 *   daily    -> this digest, written as rows on the team's existing Updates board (AFKF-D12).
 *   alert    -> the phone, for stuck / money / fire only.
 *
 * What it builds for a single Manila day:
 *
 *   - what shipped        : merged commits on origin/main, slice ids pulled out of the subject
 *   - board rows          : lifted verbatim from the changelog's `**Board:**` lines where they
 *                           exist (updates-board.md says prefer them), else written from the
 *                           commit subject. An empty day produces NO rows — that is exit E-B.
 *   - needs your eyes     : ONE batched list with direct links (AFKF-D9). Never a ping.
 *   - alerts              : stuck / money / fire only, one per day per thing (exit E-C)
 *   - new-programme flag  : the first slice of a brand-new programme is called out (AFKF-D37)
 *   - counters            : E1 bookkeeping share (7d), E3 open PRs older than 24h, E4 CEO
 *                           status-check sessions
 *
 * Dedupe rides on `public.events` / `record_event`, which already carries a unique index on
 * `dedupe_key` — so a re-run of the same day writes nothing new (exit E-D) and a repeated
 * alert fires once (exit E-C). No third table: that would be the X3 mistake (AFKF-X11).
 *
 * Dependency-free on purpose — plain `fetch` against Supabase REST, so the scheduled workflow
 * needs no `npm ci` to run it.
 *
 * Usage:
 *   node scripts/afkf-digest.mjs                       # yesterday, Manila, dry run
 *   node scripts/afkf-digest.mjs --day 2026-08-19
 *   node scripts/afkf-digest.mjs --json
 *   node scripts/afkf-digest.mjs --prs-json /tmp/prs.json   # PR list from a GitHub MCP session
 *   node scripts/afkf-digest.mjs --ceo-status-checks 2      # E4, counted by the digest session
 *   node scripts/afkf-digest.mjs --apply                    # record the dedupe events
 *
 * MUST NOT: no PR links and no next prompt in an alert. Those belong in the PR body and in the
 * batched eyes-list, never on the phone (AFKF-D11, exit E-E).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCeiling } from './afkf-ci-ceiling.mjs';
import { failurePause, fetchSlices } from './afkf-retry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

export const SUPABASE_URL = 'https://bmeqxvnaclssbefpshlb.supabase.co';
export const MANILA_OFFSET_MINUTES = 8 * 60;
/** Past this many aged pull requests the eyes-list collapses them into one counted line. */
export const PR_LIST_LIMIT = 5;

/* ------------------------------------------------------------------ days */

/** The Manila calendar day a moment falls in. Manila has no DST, so a fixed offset is exact. */
export function manilaDayOf(date) {
  const ms = date.getTime() + MANILA_OFFSET_MINUTES * 60_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** The day the 1am routine reports on: the one that just ended. */
export function previousManilaDay(now = new Date()) {
  const ms = now.getTime() + MANILA_OFFSET_MINUTES * 60_000 - 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/* -------------------------------------------------------------- commits */

/** `git log --pretty=%H|%cI|%s` output -> commit records stamped with their Manila day. */
export function parseGitLog(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, iso, ...rest] = line.split('|');
      const subject = rest.join('|');
      return { hash, iso, subject, day: manilaDayOf(new Date(iso)) };
    })
    .filter((c) => c.hash && c.subject);
}

/**
 * Bookkeeping: a commit whose whole content is the workflow talking to itself.
 *
 * This is the E1 numerator, and E1 is the programme's headline measurement — 67% of merged
 * commits in the four days before AFKF-1. Deliberately narrow: a `chore(status)` reconcile or
 * a chain claim is bookkeeping; a `chore:` that changed a script is not, and is not matched.
 */
export function isBookkeepingCommit(subject) {
  const s = String(subject || '');
  return (
    /^chore\(status\):/i.test(s) ||
    /^(docs|chore|ci|build|style)\(?[^)]*\)?:\s*(reconcile|claim|advance|bump|sync)\b/i.test(s) ||
    /\bralph chain\b/i.test(s) ||
    /\bstatus[- ]only\b/i.test(s)
  );
}

/** E1 — the share of merged commits that were the workflow's own bookkeeping. */
export function bookkeepingShare(commits) {
  const total = commits.length;
  const bookkeeping = commits.filter((c) => isBookkeepingCommit(c.subject)).length;
  const pct = total === 0 ? 0 : Math.round((bookkeeping / total) * 100);
  return { bookkeeping, shipped: total - bookkeeping, total, pct };
}

/** Slice ids a commit subject names, e.g. `AFKF-3: ...` or `... (LNP-6)`. */
export function sliceIdsFromSubject(subject) {
  const ids = String(subject || '').match(/(?<![A-Za-z0-9-])[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d{1,3}(?![A-Za-z0-9-])/g) || [];
  return [...new Set(ids)];
}

/** AFKF-D37 — the first slice of a brand-new programme is where mistakes compound. */
export function isFirstSliceOfProgramme(sliceId) {
  return /^[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-1$/.test(String(sliceId || ''));
}

/* ------------------------------------------------------------ changelog */

/**
 * `**Board:**` lines out of the changelog, keyed by the date in their entry heading.
 *
 * updates-board.md: prefer a board line the slice already wrote over one re-derived from a
 * commit subject. The slice's author knew what a person would notice; a commit subject does not.
 */
export function parseChangelogBoardLines(text) {
  const out = [];
  const entries = String(text || '').split(/\n(?=- \*\*)/);
  for (const entry of entries) {
    if (!/^- \*\*/.test(entry)) continue;
    const heading = entry.match(/^- \*\*(.+?)\*\*/s)?.[1] ?? '';
    const date = heading.match(/\((\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
    const sliceIds = sliceIdsFromSubject(heading);
    const board = entry.match(/\*\*Board:\*\*\s*(.+)/)?.[1]?.trim();
    if (!date || !board) continue;
    if (/^none\b/i.test(board)) {
      out.push({ date, sliceIds, none: true });
      continue;
    }
    const m = board.match(/^`([^`]+)`\s*·\s*`([^`]+)`\s*[—-]\s*(.+)$/);
    if (!m) continue;
    out.push({
      date,
      sliceIds,
      area: m[1].trim(),
      category: /major/i.test(m[2]) ? 'Major Update' : 'Minor Update',
      what: m[3].trim(),
    });
  }
  return out;
}

/* ---------------------------------------------------------- board rows */

/** One sentence, plain words, no slice ids, no paths — updates-board.md's house style. */
export function isHouseStyle(sentence) {
  const s = String(sentence || '').trim();
  if (!s) return false;
  if (s.length > 320) return false;
  if (/\b[A-Z][A-Z0-9]{1,15}-\d{1,3}\b/.test(s)) return false;
  if (/(^|\s)(src|docs|scripts|functions|packages)\//.test(s)) return false;
  if (/\bPR #\d+|https?:\/\//.test(s)) return false;
  return true;
}

/**
 * The rows for one day, and the work that still needs one written.
 *
 * Authored rows only. A `**Board:**` line in the changelog was written by the person who did
 * the work, in house style, for a reader who is not a developer — a commit subject was not, and
 * turning one into a board row produces exactly the sentence updates-board.md forbids ("Fixed
 * storage object key collision..."). So work with no board line comes back as `needsBoardLine`
 * and the digest session writes it, rather than the script faking it.
 *
 * An empty day returns no rows at all — "an empty day is not an entry" (exit E-B).
 */
export function buildBoardRows({ day, shipped = [], boardLines = [] }) {
  const rows = [];
  const covered = new Set();
  for (const line of boardLines.filter((l) => l.date === day)) {
    for (const id of line.sliceIds) covered.add(id);
    if (line.none) continue;
    rows.push({ area: line.area, what: line.what, date: day, category: line.category });
  }
  const needsBoardLine = shipped
    .filter((c) => !sliceIdsFromSubject(c.subject).some((id) => covered.has(id)))
    .map((c) => ({ subject: c.subject, slices: sliceIdsFromSubject(c.subject) }));
  return { rows, needsBoardLine };
}

/**
 * A starting sentence for a slice with no board line — the digest session's first draft, never
 * written to the board by the script. `isHouseStyle` is the gate it has to pass first.
 */
export function plainSentenceFromSubject(subject) {
  let s = String(subject || '')
    .replace(/\s*\(#\d+\)\s*$/, '')
    .replace(/^\s*[A-Z][A-Z0-9]{1,15}-\d{1,3}\s*[:—-]\s*/, '')
    .replace(/^(feat|fix|chore|docs|ci|build|style|refactor|test)(\([^)]*\))?:\s*/i, '')
    .trim();
  if (!s) return null;
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.!?]$/.test(s)) s += '.';
  return `${s} (agent/ops, not customer-facing)`;
}

/* ------------------------------------------------------------ the eyes */

/** AFKF-D9 — one batched list with direct links, riding with the digest. Never a ping. */
export function buildEyesList({ openPrs = [], blockedProgrammes = [], byHand = [], nowMs = Date.now() }) {
  const items = [];
  const aged = openPrs
    .map((pr) => ({ ...pr, ageDays: Math.floor((nowMs - new Date(pr.created_at).getTime()) / 86_400_000) }))
    .filter((pr) => pr.ageDays >= 1)
    .sort((a, b) => b.ageDays - a.ageDays);

  /**
   * A list of forty pull requests is a wall, and a wall is read once and then never again — the
   * same failure as the ping this list replaced. Past a handful they collapse into one line that
   * states the count out loud (never a silent cap) and names the oldest three. Giving each one a
   * verdict is AFKF-5's job, not the digest's.
   */
  if (aged.length > PR_LIST_LIMIT) {
    const oldest = aged.slice(0, 3).map((pr) => `#${pr.number} (${pr.ageDays}d)`).join(', ');
    items.push({
      kind: 'open-pr-backlog',
      id: 'open-pr-backlog',
      text: `${aged.length} pull requests have been open more than a day — oldest ${oldest}`,
      link: aged[0].html_url.replace(/\/pull\/\d+$/, '/pulls'),
    });
  } else {
    for (const pr of aged) {
      items.push({
        kind: 'open-pr',
        id: `pr-${pr.repo || ''}-${pr.number}`,
        text: `PR #${pr.number} open ${pr.ageDays} day${pr.ageDays === 1 ? '' : 's'} — ${pr.title}`,
        link: pr.html_url,
      });
    }
  }
  for (const p of blockedProgrammes) {
    items.push({
      kind: 'blocked-programme',
      id: `blocked-${p.program}`,
      text: `${p.program} is blocked: ${truncate(p.blockedBy, 160)}`,
      link: p.doc,
    });
  }
  for (const item of byHand) {
    items.push({ kind: 'by-hand', id: `by-hand-${slug(item.text)}`, text: item.text, link: item.link || null });
  }
  return items;
}

/**
 * Alerts: stuck, money, fire. Nothing else earns a phone call (AFKF-D11).
 *
 * No PR link and no next prompt goes in here — exit E-E. An alert says what is stuck and why;
 * the link to look at lives in the batched eyes-list, where it costs nobody an interruption.
 */
export function buildAlerts({ day, stuck = [], spendPct = null, incidents = [], chainPause = null }) {
  const alerts = [];
  /**
   * AFKF-13 exit E-D — three consecutive slice failures paused the chain, and
   * the pause is visible here.
   *
   * `stuck`, not a fourth kind: the whole chain having stopped is the most
   * stuck anything can be, and AFKF-D11 says three kinds and no more. It is
   * pushed FIRST because it is the reason every other stuck line below it
   * stopped moving.
   */
  if (chainPause?.paused) {
    alerts.push({
      kind: 'stuck',
      key: 'stuck:chain-failures',
      dedupeKey: `afkf-alert:stuck:chain-failures:${day}`,
      text: phoneSafe(
        `The chain paused itself: ${chainPause.consecutiveFailures} slices failed in a row` +
          `${chainPause.slices?.length ? ` (${chainPause.slices.join(', ')})` : ''}. Nothing new starts until one merges.`,
      ),
    });
  }
  for (const s of stuck) {
    alerts.push({
      kind: 'stuck',
      key: `stuck:${s.program}`,
      dedupeKey: `afkf-alert:stuck:${s.program}:${day}`,
      text: phoneSafe(`${s.program} is stuck on ${s.slice || 'its running slice'}: ${truncate(s.reason, 140)}`),
    });
  }
  if (typeof spendPct === 'number' && spendPct >= 100) {
    alerts.push({
      kind: 'money',
      key: 'money:ci-ceiling',
      dedupeKey: `afkf-alert:money:ci-ceiling:${day}`,
      text: `The day's CI budget is spent (${spendPct}%). The chain is paused until the reset.`,
    });
  }
  for (const inc of incidents) {
    alerts.push({
      kind: 'fire',
      key: `fire:${inc.id}`,
      dedupeKey: `afkf-alert:fire:${inc.id}:${day}`,
      text: phoneSafe(truncate(inc.text, 180)),
    });
  }
  return alerts;
}

/* --------------------------------------------------------- the payload */

/**
 * AFKF-12 — the one line the CI ceiling is allowed in the digest.
 *
 * Returns null below the notify threshold, because a ceiling with headroom is
 * not news and this file's whole rule is that a successful day says nothing
 * (AFKF-D9). At 100% the money ALERT carries it to the phone instead; this line
 * still appears in the digest so the paused day has a written record.
 *
 * @param {{ level?: string, pct?: number|null, usedMinutes?: number|null, allowanceMinutes?: number|null }|null} ceiling
 * @returns {string|null}
 */
export function ceilingDigestLine(ceiling) {
  if (!ceiling) return null;
  if (ceiling.level === 'unknown') {
    return "CI ceiling: not measured today — the allowance has never been read from GitHub's billing API.";
  }
  if (!['notify', 'stop-claiming', 'paused'].includes(ceiling.level)) return null;
  const used = ceiling.usedMinutes ?? '—';
  const allowance = ceiling.allowanceMinutes ?? '—';
  const tail =
    ceiling.level === 'paused'
      ? ' The chain is paused until the 00:00 UTC reset.'
      : ceiling.level === 'stop-claiming'
        ? ' No new slice is being claimed; work already running finishes.'
        : '';
  return `CI ceiling: ${ceiling.pct}% of today's allowance used (${used} of ${allowance} min).${tail}`;
}

export function buildDigest(input) {
  const {
    day,
    commitsForDay = [],
    commitsForWeek = [],
    boardLines = [],
    openPrs = [],
    blockedProgrammes = [],
    stuck = [],
    byHand = [],
    spendPct = null,
    incidents = [],
    ceoStatusChecks = null,
    /**
     * AFKF-4 — last night's health check, already recorded by `afkf-nightly-health.mjs`.
     *
     * Passed in rather than re-derived: the nightly ran at 02:00 and owns its own verdict and its
     * own alert row. The digest's whole job here is to carry ONE line of it to the CEO. Deciding
     * it a second time from the same data would be a second opinion nobody asked for, and the two
     * could disagree.
     */
    nightly = null,
    /**
     * AFKF-18 precondition — the day's chain-divergence row. Passed in for the same reason
     * `nightly` is: the daily check owns its own verdict, and the digest reports it rather than
     * re-deriving it from a database it would then be a second reader of.
     */
    chainDivergence = null,
    /**
     * AFKF-18b — the held slices, one line each. Supplied for the same reason as everything else
     * here: the hold gate owns its verdict and the digest carries it. Without these lines a held
     * lane waits with nothing anywhere saying so.
     */
    heldLines = [],
    /**
     * AFKF-12 — the day's CI ceiling verdict, read from `chain_ci_budget`.
     *
     * Passed in for the same reason `nightly` is: the ceiling has one owner
     * (`scripts/afkf-ci-ceiling.mjs`) and one verdict, and the digest's job is
     * to carry ONE line of it — never to derive a second opinion from the same
     * numbers and then disagree with the claim path in public.
     */
    ceiling = null,
    /**
     * AFKF-13 — the derived three-strikes pause (AFKF-D36), passed in for the
     * same reason `ceiling` and `nightly` are: it has one owner
     * (`scripts/afkf-retry.mjs`, `failurePause()`), and the digest's job is to
     * carry ONE line of it rather than to re-derive a second opinion that could
     * disagree with the queue in public.
     */
    chainPause = null,
    nowMs = Date.now(),
  } = input;

  // 70% is a digest line; 100% is the alert. Both read the same percentage, so
  // the row a person edits to change the threshold changes both at once (E-E).
  const effectiveSpendPct =
    spendPct ?? (typeof ceiling?.pct === 'number' ? ceiling.pct : null);

  const shipped = commitsForDay.filter((c) => !isBookkeepingCommit(c.subject));
  const e1 = bookkeepingShare(commitsForWeek);
  const eyes = buildEyesList({ openPrs, blockedProgrammes, byHand, nowMs });
  const alerts = buildAlerts({ day, stuck, spendPct: effectiveSpendPct, incidents, chainPause });
  const { rows: boardRows, needsBoardLine } = buildBoardRows({ day, shipped, boardLines });

  const newProgrammes = [
    ...new Set(shipped.flatMap((c) => sliceIdsFromSubject(c.subject)).filter(isFirstSliceOfProgramme)),
  ];

  return {
    day,
    shipped: shipped.map((c) => ({ hash: c.hash, subject: c.subject, slices: sliceIdsFromSubject(c.subject) })),
    boardRows,
    needsBoardLine,
    eyes,
    alerts,
    newProgrammes,
    counters: {
      e1: { ...e1, label: 'bookkeeping share of merged commits, 7 days' },
      e3: { count: openPrs.filter((p) => nowMs - new Date(p.created_at).getTime() >= 86_400_000).length,
            label: 'open PRs older than 24h' },
      e4: { count: ceoStatusChecks ?? 0, supplied: ceoStatusChecks !== null,
            label: 'CEO status-check sessions' },
    },
    chainDivergence: chainDivergence
      ? { status: chainDivergence.status, line: chainDivergence.line ?? null }
      : null,
    heldLines: Array.isArray(heldLines) ? heldLines : [],
    nightly: nightly
      ? { status: nightly.status, line: nightly.digestLine ?? nightly.line ?? null }
      : null,
    ceiling: ceiling
      ? {
          level: ceiling.level,
          pct: ceiling.pct,
          allowanceMinutes: ceiling.allowanceMinutes ?? null,
          usedMinutes: ceiling.usedMinutes ?? null,
          line: ceilingDigestLine(ceiling),
        }
      : null,
    chainPause: chainPause
      ? {
          paused: chainPause.paused,
          consecutiveFailures: chainPause.consecutiveFailures,
          threshold: chainPause.threshold,
          slices: chainPause.slices ?? [],
        }
      : null,
    dedupeKey: `afkf-digest:${day}`,
    empty: boardRows.length === 0 && alerts.length === 0,
  };
}

/** Every key this digest would write, so a second run can be shown to add nothing (E-D). */
export function dedupeKeysOf(digest) {
  return [digest.dedupeKey, ...digest.alerts.map((a) => a.dedupeKey)];
}

/** What is left to write once the already-recorded keys are taken out (E-C, E-D). */
export function unrecorded(keys, recordedKeys) {
  const seen = new Set(recordedKeys);
  return keys.filter((k) => !seen.has(k));
}

/* ------------------------------------------------------------- helpers */

/**
 * Everything an alert says passes through here.
 *
 * Alert text is lifted from a dashboard line a human wrote, so it can and does contain a PR
 * link or a "run npm run mc:opener" prompt. Exit E-E says neither belongs on a phone: a link
 * is something to look at, which is the batched eyes-list's job, and the next prompt lives in
 * the PR body. Scrubbing here rather than trusting the source is the difference between a rule
 * and a mechanism.
 */
export function phoneSafe(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/g, '(link in the daily list)')
    .replace(/`?(npm run|node) [^`\n]+`?/g, 'the usual command')
    .replace(/\bPR #\d+/g, 'the pull request')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

/* ------------------------------------------------------------------ IO */

export function readCommits({ since, cwd = root }) {
  const out = execFileSync('git', ['log', 'origin/main', `--since=${since}`, '--no-merges', '--pretty=%H|%cI|%s'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  return parseGitLog(out);
}

/**
 * The held slices, and why. One line each, or the wait is invisible.
 *
 * AFKF-18b, ADDED BECAUSE THE HOLD WOULD OTHERWISE STALL A LANE IN SILENCE.
 *
 * `readProgrammeState` below reports a programme as *stuck* only when `BLOCKED_BY` is set AND
 * something is claimed. A hold is neither: a held slice is refused before it is claimed, and the
 * whole point of AFKF-18b is that the hand-typed `BLOCKED_BY` stopgap goes away. So a held lane
 * would have waited with nothing anywhere saying so — the silent stall this programme exists to
 * end, reintroduced by the mechanism meant to prevent a different one.
 *
 * Pure: the caller supplies the holds and the evaluated gates, exactly as the queue does.
 *
 * @param {{ holds: Record<string, { prose: string, gate: string|null }>, gates: Record<string, boolean> }} input
 */
export function heldSliceLines({ holds, gates }, evaluate) {
  return Object.entries(holds ?? {})
    .map(([slice, hold]) => ({ slice, verdict: evaluate(hold, gates ?? {}) }))
    .filter((r) => r.verdict.held)
    /**
     * ONE LINE, TRUNCATED. A held slice's reason can be the whole `HOLD:` prose — AFKF-22's runs to
     * three lines — and this prints every day for as long as the hold stands. The digest's own rule
     * is one line per fact; a paragraph repeated daily is how a report stops being read.
     */
    .map((r) => {
      const reason = r.verdict.reason.split(/\s+/).slice(0, 14).join(' ');
      const short = reason.length < r.verdict.reason.length ? `${reason}…` : reason;
      return `Held: ${r.slice} — ${short}`;
    });
}

/** Live programmes whose dashboard says something is wrong. */
export function readProgrammeState(projectsDir = join(root, 'docs/projects')) {
  const blocked = [];
  const stuck = [];
  if (!existsSync(projectsDir)) return { blocked, stuck };
  for (const file of readdirSync(projectsDir).filter((f) => f.endsWith('-master.md'))) {
    const text = readFileSync(join(projectsDir, file), 'utf8');
    const blockedBy = text.match(/^BLOCKED_BY:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const running = text.match(/^RALPH_RUNNING:\s*(.+)$/m)?.[1]?.trim() ?? '';
    // Named after its own document, not its ACTIVE_PROGRAM line: two paused programmes point
    // at a third one's code there, and the batched list must say which document to open.
    const program = file.replace(/-master\.md$/, '').toUpperCase();
    if (!blockedBy || /^none\b/i.test(blockedBy)) continue;
    const isRunning = running && !/^none\b/i.test(running);
    const entry = { program, blockedBy, doc: `docs/projects/${file}`, slice: isRunning ? running : null };
    // Running AND blocked is a chain that has stopped: that earns the phone. Blocked with no
    // claim is a programme nobody is driving — a batched list item, not an interruption.
    if (isRunning) stuck.push({ program, slice: running, reason: blockedBy });
    else blocked.push(entry);
  }
  return { blocked, stuck };
}

/** By-hand items still owed, lifted from the master doc's BY_HAND line (§7). */
export function readByHand(doc = join(root, 'docs/projects/afkf-master.md')) {
  if (!existsSync(doc)) return [];
  const raw = readFileSync(doc, 'utf8').match(/^BY_HAND:\s*(.+)$/m)?.[1];
  if (!raw) return [];
  // "three items, none of them slices — the routines' allowed_tools · ..." — the count is a
  // sentence about the list, not an item in it.
  const line = raw.replace(/^[^—]*\bnone of them slices\s*—\s*/i, '');
  return line
    .split('·')
    .map((s) => s.trim())
    .filter((s) => s && !/^see §/i.test(s))
    .map((text) => ({ text: truncate(text, 200), link: 'docs/projects/afkf-master.md' }));
}

async function fetchOpenPrs({ repos, token }) {
  if (!token) return { prs: [], reason: 'no GitHub token in this venue' };
  const prs = [];
  for (const repo of repos) {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=100`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return { prs: [], reason: `GitHub API ${res.status} for ${repo}` };
    for (const pr of await res.json()) {
      prs.push({ repo, number: pr.number, title: pr.title, created_at: pr.created_at, html_url: pr.html_url });
    }
  }
  return { prs, reason: null };
}

/**
 * AFKF-4 — last night's nightly-health row, if it wrote one.
 *
 * Absence is reported, never silently rendered as green: a nightly that did not run at all is
 * exactly the thing the CEO would want the digest to say out loud.
 */
export async function readNightlyForDay({ day, serviceKey }) {
  if (!serviceKey) return null;
  const key = `nightly-health:${day}`;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/events?select=payload,summary&dedupe_key=eq.${encodeURIComponent(key)}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  if (!rows.length) return { status: 'missing', digestLine: `Nightly check ${day}: did not run.` };
  const payload = rows[0].payload ?? {};
  return {
    status: payload.status ?? 'unknown',
    digestLine: payload.digestLine ?? rows[0].summary ?? `Nightly check ${day}: recorded.`,
  };
}

/**
 * AFKF-18 precondition — the day's chain-divergence row, if the daily check wrote one.
 *
 * Same shape and same rule as `readNightlyForDay` above, deliberately: **absence is reported, never
 * rendered as agreement.** The release gate for AFKF-18 is seven clean days, and a day the check
 * did not run is the one thing that must not read as one of them.
 */
export async function readChainDivergenceForDay({ day, serviceKey }) {
  if (!serviceKey) return null;
  const key = `chain-divergence:${day}`;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/events?select=payload,summary&dedupe_key=eq.${encodeURIComponent(key)}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  if (!rows.length) return { status: 'missing', line: `Chain state ${day}: not measured.` };
  const payload = rows[0].payload ?? {};
  const divergent = Number(payload.divergent ?? 0);
  return {
    status: divergent > 0 ? 'divergent' : 'match',
    line: payload.digestLine ?? rows[0].summary ?? `Chain state ${day}: recorded.`,
  };
}

async function recordedKeysFor(keys, serviceKey) {
  if (!serviceKey || keys.length === 0) return [];
  const list = keys.map((k) => `"${k}"`).join(',');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/events?select=dedupe_key&dedupe_key=in.(${encodeURIComponent(list)})`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) return [];
  return (await res.json()).map((r) => r.dedupe_key);
}

async function recordEvent({ action, summary, payload, dedupeKey, serviceKey }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_event`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_action: action,
      p_entity_type: 'afkf_digest',
      p_entity_id: dedupeKey,
      p_workspace_id: 'pp-workspace',
      p_actor_type: 'system',
      p_actor_id: null,
      p_summary: summary,
      p_payload: payload,
      p_source: 'automation',
      p_correlation_id: dedupeKey,
      p_sensitivity: 'normal',
      p_dedupe_key: dedupeKey,
      p_occurred_at: null,
    }),
  });
  if (!res.ok) throw new Error(`record_event failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/* ------------------------------------------------------------- render */

export function renderDigest(digest, notes = []) {
  const L = [];
  L.push(`AFKF digest — ${digest.day} (Asia/Manila)`);
  L.push('');
  if (digest.empty && digest.shipped.length === 0) {
    L.push('Nothing notable shipped and nothing is stuck. No board rows — an empty day is not an entry.');
  }
  if (digest.boardRows.length) {
    L.push(`Board rows (${digest.boardRows.length}) — house style, ready to write:`);
    for (const r of digest.boardRows) L.push(`  [${r.area} · ${r.category}] ${r.what}`);
    if (digest.boardRows.length > 16) {
      L.push('  (over 16 rows — group related work into one line before writing them)');
    }
    L.push('');
  }
  if (digest.needsBoardLine.length) {
    L.push(`Shipped with no board line (${digest.needsBoardLine.length}) — write one in house style:`);
    for (const n of digest.needsBoardLine) L.push(`  - ${n.subject}`);
    L.push('');
  }
  if (digest.newProgrammes.length) {
    L.push(`New programme started: ${digest.newProgrammes.join(', ')} — first slices are where mistakes compound.`);
    L.push('');
  }
  L.push(`Needs your eyes (${digest.eyes.length}) — batched, nothing pinged:`);
  if (!digest.eyes.length) L.push('  nothing');
  for (const e of digest.eyes) L.push(`  - ${e.text}${e.link ? ` — ${e.link}` : ''}`);
  L.push('');
  if (digest.nightly) {
    /** Exactly one line, green or red — AFKF-4 exit E-D. Never a table, never a per-question list. */
    L.push(digest.nightly.line);
    L.push('');
  }
  if (digest.chainDivergence?.line) {
    /** One line, beside the nightly's, for the same reason it is one line: nobody reads a table. */
    L.push(digest.chainDivergence.line);
    L.push('');
  }
  if (digest.heldLines?.length) {
    /**
     * One line per held slice. A wait that nobody can see is the same thing as a stall, and this
     * is the only place the CEO would learn a lane is waiting on a hold rather than on work.
     */
    for (const line of digest.heldLines) L.push(line);
    L.push('');
  }
  if (digest.ceiling?.line) {
    /** AFKF-12 exit E-C's written half — one line, never a table. */
    L.push(digest.ceiling.line);
    L.push('');
  }
  if (digest.chainPause?.paused) {
    /** AFKF-13 exit E-D's written half — one line, and the alert carries the rest. */
    L.push(
      `Chain PAUSED — ${digest.chainPause.consecutiveFailures} slices failed in a row` +
        `${digest.chainPause.slices.length ? ` (${digest.chainPause.slices.join(', ')})` : ''}.` +
        ' Nothing new starts until one merges.',
    );
    L.push('');
  }
  L.push(`Alerts (${digest.alerts.length}) — stuck / money / fire only:`);
  if (!digest.alerts.length) L.push('  none');
  for (const a of digest.alerts) L.push(`  - [${a.kind}] ${a.text}`);
  L.push('');
  L.push('Counters');
  const { e1, e3, e4 } = digest.counters;
  L.push(`  E1 bookkeeping share of merged commits (7 days): ${e1.pct}%  (${e1.bookkeeping} of ${e1.total})`);
  L.push(`  E3 open PRs older than 24h: ${e3.count}`);
  L.push(`  E4 CEO status-check sessions: ${e4.count}${e4.supplied ? '' : '  (not supplied by this run — the digest session counts these)'}`);
  if (notes.length) {
    L.push('');
    L.push('Notes');
    for (const n of notes) L.push(`  - ${n}`);
  }
  return L.join('\n');
}

/* ---------------------------------------------------------------- CLI */

function parseArgs(argv) {
  const out = { apply: false, json: false, repos: ['johndaryow/pp-workspace', 'johndaryow/pp-shopify-theme'] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--day') out.day = argv[++i];
    else if (a === '--apply') out.apply = true;
    else if (a === '--json') out.json = true;
    else if (a === '--prs-json') out.prsJson = argv[++i];
    else if (a === '--ceo-status-checks') out.ceoStatusChecks = Number(argv[++i]);
    else if (a === '--spend-pct') out.spendPct = Number(argv[++i]);
    else if (a === '--repo') out.repos = [argv[++i]];
    // Lets the alert path be proved end to end against a scratch copy of the dashboards,
    // instead of waiting for a real programme to get stuck.
    else if (a === '--projects-dir') out.projectsDir = argv[++i];
  }
  return out;
}

/**
 * AFKF-13 — the chain's three-strikes pause, read from `chain_slices`.
 *
 * Fail-soft on purpose, and in the direction that keeps the digest honest: with
 * no key or an unreachable table this returns null, the digest says nothing
 * about a pause, and the queue — which reads the same rows with the same
 * function — is still the thing that actually stops claiming. A digest that
 * invented "not paused" from a failed read would be worse than one that stays
 * quiet.
 */
export async function readChainPause(serviceKey) {
  if (!serviceKey) return null;
  try {
    return failurePause(await fetchSlices(serviceKey));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const day = args.day || previousManilaDay();
  const notes = [];

  const commitsForWeek = readCommits({ since: '7 days ago' });
  const commitsForDay = commitsForWeek.filter((c) => c.day === day);

  const changelogPath = join(root, 'docs/design-studio/CHANGELOG.md');
  const boardLines = existsSync(changelogPath)
    ? parseChangelogBoardLines(readFileSync(changelogPath, 'utf8'))
    : [];

  let openPrs = [];
  if (args.prsJson && existsSync(args.prsJson)) {
    openPrs = JSON.parse(readFileSync(args.prsJson, 'utf8'));
  } else {
    const token = process.env.GITHUB_PAT?.trim() || process.env.GITHUB_TOKEN?.trim();
    const got = await fetchOpenPrs({ repos: args.repos, token });
    openPrs = got.prs;
    if (got.reason) notes.push(`E3 counted 0 open PRs: ${got.reason}. Pass --prs-json to supply the list.`);
  }

  const { blocked, stuck } = args.projectsDir ? readProgrammeState(args.projectsDir) : readProgrammeState();
  const nightly = await readNightlyForDay({ day, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() });
  // AFKF-12 — the measured ceiling, not a number typed on the command line.
  // `--spend-pct` survives as an override for a dry run; it no longer has to
  // exist for the money alert to be able to fire.
  const ceiling = await readCeiling();
  const chainPause = await readChainPause(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const chainDivergence = await readChainDivergenceForDay({
    day,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  });
  /**
   * AFKF-18b — the held slices, one line each. WRAPPED, because every other read in this function
   * is fail-soft and this one was not: `holdsFromLiveDocs` is unguarded filesystem I/O, and a
   * critic reproduced a broken symlink named `*-master.md` taking the whole day's digest down. A
   * bookkeeping line must never cost the report it appears in.
   */
  let heldLines = [];
  try {
    const { evaluateHold, evaluateKnownGates } = await import('./afkf-hold.mjs');
    const { holdsFromLiveDocs } = await import('./afkf-chain-queue.mjs');
    heldLines = heldSliceLines(
      { holds: holdsFromLiveDocs(), gates: (await evaluateKnownGates()).gates },
      evaluateHold,
    );
  } catch (err) {
    heldLines = [`Held slices: could not be read (${String(err?.message ?? err)}).`];
  }

  const digest = buildDigest({
    day,
    commitsForDay,
    commitsForWeek,
    boardLines,
    openPrs,
    blockedProgrammes: blocked,
    stuck,
    byHand: readByHand(),
    spendPct: Number.isFinite(args.spendPct) ? args.spendPct : null,
    ceiling,
    chainPause,
    ceoStatusChecks: Number.isFinite(args.ceoStatusChecks) ? args.ceoStatusChecks : null,
    nightly,
    chainDivergence,
    heldLines,
  });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const keys = dedupeKeysOf(digest);
  const already = args.apply || serviceKey ? await recordedKeysFor(keys, serviceKey) : [];
  const todo = unrecorded(keys, already);

  if (args.json) {
    console.log(JSON.stringify({ ...digest, notes, alreadyRecorded: already, toRecord: todo }, null, 2));
  } else {
    console.log(renderDigest(digest, notes));
    console.log('');
    console.log(
      args.apply
        ? `Recording ${todo.length} event(s); ${already.length} already recorded.`
        : `Dry run — nothing written. Would record ${todo.length} event(s); ${already.length} already recorded.`,
    );
  }

  if (!args.apply) return;
  if (!serviceKey) throw new Error('--apply needs SUPABASE_SERVICE_ROLE_KEY');
  if (digest.empty && digest.shipped.length === 0) return; // an empty day is not an entry

  for (const key of todo) {
    const alert = digest.alerts.find((a) => a.dedupeKey === key);
    await recordEvent({
      action: alert ? `afkf.alert.${alert.kind}` : 'afkf.digest',
      summary: alert ? alert.text : `AFKF digest for ${digest.day}`,
      payload: alert ? { day: digest.day, kind: alert.kind, text: alert.text } : digest,
      dedupeKey: key,
      serviceKey,
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(String(err?.message || err));
    process.exit(1);
  });
}
