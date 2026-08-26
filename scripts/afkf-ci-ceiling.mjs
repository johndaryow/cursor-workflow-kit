#!/usr/bin/env node
/**
 * AFKF-12 — the daily CI ceiling stops the chain before the bill does.
 *
 * PRD § Q2 is the spec. KNOWN_TRAP_2 is why it exists: ~35-40 runner-minutes per
 * push across six workflows, and on 2026-08-14 the account's Actions budget ran
 * out mid-programme and took both repos dark for ten hours. Every check failed
 * in two seconds with no runner assigned, on `main` as well as on branches, and
 * nothing in the chain could have seen it coming — because nothing in the chain
 * knew what the day's allowance was.
 *
 * WHAT IT MEASURES, AND WHY IT IS TWO THINGS.
 *
 *   The allowance is MINUTES, from GitHub's billing API. That is the number the
 *   bill is denominated in, and Q2 says so.
 *
 *   The consumption is RUNS, from the repository's own Actions API, converted to
 *   billable minutes one run at a time. Q2 calls runs "the real-time proxy" and
 *   that phrase is load-bearing: the billing API's own usage total lags by
 *   hours, which is useless to a brake that has to act inside one slice. A run
 *   that finished four minutes ago is already in the runs list.
 *
 * WHY THERE IS NO FALLBACK NUMBER ANYWHERE IN THIS FILE. Exit E-A: the allowance
 * comes from the API, never from a constant. So when the measurement is refused
 * or unavailable, `dailyAllowanceMinutes` returns **null** and the ceiling
 * reports `unknown` — it does not quietly assume 2,000 minutes, or 3,000, or any
 * other number that would look like a measurement in the digest and be a guess.
 * `unknown` is reported out loud and leaves the brake off, which is the right
 * trade in this direction: a brake that fails closed on a billing-API blip would
 * halt every programme for a reason no human could see, which is the silent
 * stall this whole programme exists to end. An unknown that is *visible* costs a
 * digest line; an unknown that is *silently treated as zero used* would be a
 * wrong fact nothing downstream could spot (AFKF-10 learned that one about claim
 * times, the hard way).
 *
 * WHY THE RESET NEEDS NO CRON. Exit E-D asks that 00:00 UTC resume the chain
 * with no human action. Usage here is always "billable minutes of runs *started*
 * on this UTC day", so when the day rolls over the previous day's total simply
 * stops being today's. There is no counter to zero and no job that could fail to
 * fire — only a calendar.
 *
 * WHERE THE BRAKE ACTUALLY BITES. Three places, one verdict:
 *   - `scripts/afkf-chain-queue.mjs` ready-rule 5 — the ranked queue stops
 *     offering slices (AFKF-11 left the input open for exactly this).
 *   - `scripts/ralph-chain-claim.mjs` — the live chain refuses a NEW claim.
 *     Nothing touches a slice already in flight, and nothing touches the retry
 *     loop: Exit E-B is that distinction.
 *   - `scripts/afkf-digest.mjs` — one line at 70%, one alert at 100%.
 *
 * Usage:
 *   npm run afkf:ci-ceiling                    # what the stored row says now
 *   npm run afkf:ci-ceiling -- --json
 *   npm run afkf:ci-ceiling -- --refresh       # measure, then write the row
 *   npm run afkf:ci-ceiling -- --refresh --dry-run
 *   npm run afkf:ci-ceiling -- --set-included-minutes 2000 --source manual
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

export const SUPABASE_URL = 'https://bmeqxvnaclssbefpshlb.supabase.co';
export const BUDGET_ROW_ID = 'default';
export const DEFAULT_OWNER = 'johndaryow';
export const DEFAULT_REPO = 'johndaryow/pp-workspace';

/**
 * The one endpoint the allowance may come from (Exit E-A). Written here as a
 * template rather than a URL so the thing being asserted — *which* endpoint —
 * is a value a test can compare, not a substring of a fetch call.
 */
export const BILLING_ENDPOINT = '/users/{user}/settings/billing/actions';
/**
 * The endpoint the brake actually reads.
 *
 * `BILLING_ENDPOINT` above answered **410 This endpoint has been moved** when
 * called with a correctly-scoped account token on 2026-08-21. It is retired.
 * Exit E-A was never a credential problem; it was a dead URL, and the original
 * slice attributed it to a missing key it could not test.
 *
 * This one answers 200 and carries `grossAmount` / `discountAmount` /
 * `netAmount` per SKU as well as minutes — so the brake can count the money
 * that is actually billed instead of a free allowance that ran out on the 4th.
 */
export const USAGE_ENDPOINT = '/users/{user}/settings/billing/usage';

/** The verdicts. `unknown` is a first-class answer, not an error. */
export const LEVELS = Object.freeze({
  OK: 'ok',
  NOTIFY: 'notify',
  STOP_CLAIMING: 'stop-claiming',
  PAUSED: 'paused',
  UNKNOWN: 'unknown',
});

/** The two levels that take the brake off claiming. Named so callers agree. */
export const NO_HEADROOM_LEVELS = Object.freeze([LEVELS.STOP_CLAIMING, LEVELS.PAUSED]);

// ---------------------------------------------------------------------------
// Pure math. No I/O below this line until the CLI section — every rule in Q2 is
// a function, so CI can hold the brake to it with no database and no token.
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` in UTC. The day the whole mechanism is scoped to. */
export function utcDayKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

/** Days in the UTC month containing `date` — the divisor in Q2's formula. */
export function daysInMonthUTC(date = new Date()) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * Q2's formula: `floor((monthly included − reserve) / days in month)`.
 *
 * Returns **null** when the included minutes were never measured. That null is
 * the whole of Exit E-A's guarantee in one line: there is no `?? 2000` here and
 * there must never be one, because a stand-in allowance is how a brake stops
 * being a brake while still printing a number that looks like one.
 *
 * @param {{ includedMinutes?: number|null, reservePct?: number|null, date?: Date|string }} input
 * @returns {number|null}
 */
export function dailyAllowanceMinutes({ includedMinutes, reservePct, date = new Date() }) {
  const included = Number(includedMinutes);
  if (includedMinutes === null || includedMinutes === undefined || !Number.isFinite(included)) {
    return null;
  }
  const reserve = Number.isFinite(Number(reservePct)) ? Number(reservePct) : 0;
  const usable = included - (included * reserve) / 100;
  const days = daysInMonthUTC(date);
  return Math.floor(usable / days);
}

/**
 * The verdict, from a day's usage against a day's allowance.
 *
 * Thresholds arrive as an object because they live in a database row (Exit E-E):
 * changing 90 to 85 must be an `update`, not a deploy. Nothing here reads a
 * module-level threshold constant, and `scripts/afkf-ci-ceiling.test.mjs`
 * asserts that a row carrying different numbers actually changes the answer.
 *
 * @param {object} input
 * @param {number|null} input.usedMinutes
 * @param {number|null} input.allowanceMinutes
 * @param {{ notifyPct?: number, stopClaimingPct?: number, pausePct?: number }} [input.thresholds]
 * @returns {{ level: string, pct: number|null, headroom: boolean, reason: string }}
 */
export function ceilingVerdict({ usedMinutes, allowanceMinutes, thresholds = {} }) {
  const allowance = Number(allowanceMinutes);
  if (!Number.isFinite(allowance) || allowance <= 0) {
    return {
      level: LEVELS.UNKNOWN,
      pct: null,
      headroom: true,
      reason: `daily allowance not measured — nothing has read ${BILLING_ENDPOINT}`,
    };
  }
  // `Number(null)` is 0, and 0 is finite. Reading an unmeasured usage as "no
  // minutes used today" would be the single most dangerous bug this file could
  // have: the brake would report full headroom on the day the budget ran out.
  // So null and undefined are rejected before any arithmetic touches them —
  // the same rule AFKF-10 wrote about unknown claim times, applied to minutes.
  const used = usedMinutes === null || usedMinutes === undefined ? Number.NaN : Number(usedMinutes);
  if (!Number.isFinite(used) || used < 0) {
    return {
      level: LEVELS.UNKNOWN,
      pct: null,
      headroom: true,
      reason: "today's usage not measured — the runs list was not read",
    };
  }

  const notify = Number(thresholds.notifyPct);
  const stop = Number(thresholds.stopClaimingPct);
  const pause = Number(thresholds.pausePct);

  // A row with no thresholds cannot produce a verdict. Falling through to `ok`
  // here would be a brake that answers "plenty of headroom" because nobody had
  // told it where the edge was — decorative in the exact shape KNOWN_TRAP_14
  // describes. Unknown, and say so.
  if (![notify, stop, pause].some((v) => Number.isFinite(v))) {
    return {
      level: LEVELS.UNKNOWN,
      pct: null,
      headroom: true,
      reason: 'no thresholds configured in chain_ci_budget — the ceiling has no edge to compare against',
    };
  }

  const pct = Math.round((used / allowance) * 1000) / 10;

  if (Number.isFinite(pause) && pct >= pause) {
    return {
      level: LEVELS.PAUSED,
      pct,
      headroom: false,
      reason: `the day's CI allowance is spent (${pct}% of ${allowance} min) — the chain resumes at the 00:00 UTC reset`,
    };
  }
  if (Number.isFinite(stop) && pct >= stop) {
    return {
      level: LEVELS.STOP_CLAIMING,
      pct,
      headroom: false,
      reason: `${pct}% of the day's ${allowance} CI minutes used — no new slice is claimed; work already running finishes and still retries`,
    };
  }
  if (Number.isFinite(notify) && pct >= notify) {
    return {
      level: LEVELS.NOTIFY,
      pct,
      headroom: true,
      reason: `${pct}% of the day's ${allowance} CI minutes used`,
    };
  }
  return {
    level: LEVELS.OK,
    pct,
    headroom: true,
    reason: `${pct}% of the day's ${allowance} CI minutes used`,
  };
}

/**
 * A stored `chain_ci_budget` row → the verdict, for a given moment.
 *
 * The row's usage figures describe `day_key`. If that is not today's UTC day,
 * the figures are not today's and today's total is genuinely zero so far — that
 * IS the reset (Exit E-D), and it happens on read, with nothing scheduled. The
 * staleness is reported rather than hidden, so "the chain resumed" and "nobody
 * has measured today" are never the same sentence.
 *
 * @param {any} row
 * @param {{ now?: Date|string }} [opts]
 */
export function verdictFromRow(row, { now = new Date() } = {}) {
  const today = utcDayKey(now);
  const rowDay = row?.day_key ? String(row.day_key).slice(0, 10) : null;
  const staleDay = rowDay !== today;
  // A stale day is genuinely zero — that is the reset (Exit E-D). A CURRENT day
  // with no figure is not zero, it is unmeasured, and must not read as headroom.
  const usedMinutes = staleDay
    ? 0
    : row?.day_used_minutes === null || row?.day_used_minutes === undefined
      ? null
      : Number(row.day_used_minutes);
  const allowanceMinutes = dailyAllowanceMinutes({
    includedMinutes: row?.included_minutes ?? null,
    reservePct: row?.reserve_pct ?? 0,
    date: now,
  });
  const verdict = ceilingVerdict({
    usedMinutes,
    allowanceMinutes,
    thresholds: {
      notifyPct: row?.notify_pct,
      stopClaimingPct: row?.stop_claiming_pct,
      pausePct: row?.pause_pct,
    },
  });
  // The money half. A stale month is genuinely zero spent so far — the month
  // reset, same shape as the day's (Exit E-D). A CURRENT month with no figure
  // is unmeasured, not zero, and must not read as headroom.
  const thisMonth = utcMonthKey(now);
  const rowMonth = row?.month_key ? String(row.month_key).slice(0, 7) : null;
  const staleMonth = rowMonth !== thisMonth;
  const netUsd = staleMonth
    ? 0
    : row?.month_net_usd === null || row?.month_net_usd === undefined
      ? null
      : Number(row.month_net_usd);
  const money = moneyVerdict({
    netUsd,
    budgetUsd: row?.monthly_budget_usd ?? null,
    thresholds: {
      notifyPct: row?.notify_pct,
      stopClaimingPct: row?.stop_claiming_pct,
      pausePct: row?.pause_pct,
    },
  });

  // Worse of the two wins. Neither half can quietly switch the brake off: the
  // day's minutes react inside one slice, the month's dollars are the real
  // limit, and a brake that took the kinder answer would be no brake at all.
  const worst = worseVerdict(verdict, money);

  return {
    ...worst,
    dailyVerdict: verdict,
    moneyVerdict: money,
    dayKey: today,
    rowDayKey: rowDay,
    staleDay,
    usedMinutes,
    allowanceMinutes,
    includedMinutes: row?.included_minutes ?? null,
    includedMinutesSource: row?.included_minutes_source ?? null,
    monthKey: thisMonth,
    rowMonthKey: rowMonth,
    staleMonth,
    netUsd,
    budgetUsd: row?.monthly_budget_usd ?? null,
  };
}

/** 'YYYY-MM' in UTC — the month half of the reset-on-read contract. */
export function utcMonthKey(now = new Date()) {
  return new Date(now).toISOString().slice(0, 7);
}

/**
 * The shape ready-rule 5 in `afkf-chain-queue.mjs` and the claim path both take.
 *
 * Deliberately narrow — `{ headroom, reason }` and nothing else — so the queue
 * never grows an opinion about billing, and so a caller with no database can
 * pass a literal in a test.
 *
 * @param {ReturnType<typeof verdictFromRow>|null|undefined} verdict
 */
export function ceilingInput(verdict) {
  if (!verdict) return { headroom: true, reason: 'ceiling not read', level: LEVELS.UNKNOWN };
  return { headroom: verdict.headroom !== false, reason: verdict.reason, level: verdict.level };
}

/** True when the whole chain should be paused rather than merely not claiming. */
export function isChainPaused(verdict) {
  return verdict?.level === LEVELS.PAUSED;
}

/**
 * One run's billable minutes, from `GET /actions/runs/{id}/jobs`.
 *
 * WHY JOBS AND NOT `/timing`, WHICH IS THE OBVIOUS ENDPOINT. Measured on this
 * account on 2026-08-20, against eight real runs of the day including a
 * 247-second `PROOF live`: `/actions/runs/{id}/timing` returned
 * `billable.UBUNTU.total_ms = 0` for **every single one**, with `run_duration_ms`
 * populated correctly beside it, on a repository the API itself reports as
 * `private`. Whatever the cause, a proxy that reads zero on every run is not a
 * brake — it is a brake-shaped object that would have watched 2026-08-14 happen
 * again and reported full headroom throughout.
 *
 * So the minutes are computed from the jobs' own timestamps, which are real, and
 * **each job is rounded UP to a whole minute** — because that is how GitHub
 * bills Actions, per job, not per run. Rounding up is therefore not a safety
 * margin bolted on; it is the billing rule.
 *
 * `run_duration_ms` is deliberately not used either: it is the run's wall clock,
 * so a run of three parallel four-minute jobs reads as four minutes and bills as
 * twelve. A ceiling that undercounts parallel work would come off exactly when
 * the day was busiest.
 *
 * @param {{ started_at?: string, completed_at?: string }[]} jobs
 * @returns {number} minutes
 */
export function billableMinutesFromJobs(jobs) {
  let minutes = 0;
  for (const job of jobs ?? []) {
    const start = Date.parse(job?.started_at ?? '');
    const end = Date.parse(job?.completed_at ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    minutes += Math.ceil((end - start) / 60000);
  }
  return minutes;
}

/**
 * Did this run start on `dayKey` (UTC)?
 *
 * `run_started_at` is preferred over `created_at`: a run queued at 23:59 and
 * started at 00:02 belongs to the day whose minutes it actually burns.
 *
 * @param {{ run_started_at?: string, created_at?: string }} run
 * @param {string} dayKey
 */
export function isRunOnUtcDay(run, dayKey) {
  const stamp = run?.run_started_at || run?.created_at;
  if (!stamp) return false;
  return String(stamp).slice(0, 10) === dayKey;
}

// ---------------------------------------------------------------------------
// Measurement. Every function here takes its `fetchImpl`, so the suite can hand
// it a recorded answer — including a 403 — without a network or a token.
// ---------------------------------------------------------------------------

const GH_API = 'https://api.github.com';

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'afkf-ci-ceiling',
  };
}

/**
 * The allowance, from the one endpoint Exit E-A names.
 *
 * Returns `{ includedMinutes: null, error }` rather than throwing, because an
 * unreadable allowance is a normal state of the world here — the endpoint is
 * account-scoped, so neither an Actions `GITHUB_TOKEN` nor an agent session
 * bound to one repository can read it, and a token that can is a by-hand item
 * (§7). The caller stores the null and the digest says so.
 *
 * @param {{ user?: string, token: string, fetchImpl?: typeof fetch }} input
 */
export async function fetchIncludedMinutes({ user = DEFAULT_OWNER, token, fetchImpl = fetch }) {
  const path = BILLING_ENDPOINT.replace('{user}', user);
  try {
    const res = await fetchImpl(`${GH_API}${path}`, { headers: ghHeaders(token) });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      return { includedMinutes: null, endpoint: path, error: `${res.status}: ${body}` };
    }
    const json = await res.json();
    const included = Number(json?.included_minutes);
    if (!Number.isFinite(included)) {
      return { includedMinutes: null, endpoint: path, error: 'no included_minutes in response' };
    }
    return {
      includedMinutes: included,
      endpoint: path,
      totalMinutesUsed: Number(json?.total_minutes_used) || 0,
      error: null,
    };
  } catch (err) {
    return { includedMinutes: null, endpoint: path, error: String(err?.message ?? err) };
  }
}

/**
 * Month-to-date Actions spend, from the endpoint that replaced the 410.
 *
 * Returns dollars, not minutes. `netAmount` is what is actually billed after
 * the free allowance has been applied, which on this account was exhausted on
 * 2026-08-04 — so a brake on the allowance itself would read "100% used" every
 * day of every month and mean nothing.
 *
 * Never throws: an unreadable bill is a normal state of the world, and the
 * caller stores the null so the ceiling reports `unknown` and allows work.
 *
 * @param {{ user?: string, token: string, now?: Date, fetchImpl?: typeof fetch }} input
 */
export async function fetchMonthlySpend({
  user = DEFAULT_OWNER,
  token,
  now = new Date(),
  fetchImpl = fetch,
}) {
  const d = new Date(now);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const path = `${USAGE_ENDPOINT.replace('{user}', user)}?year=${year}&month=${month}`;
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const fail = (error) => ({ monthKey, netUsd: null, endpoint: path, error });
  if (!token) return fail('no AFKF_CI_PAT — the billing call needs an account-scoped key');
  try {
    const res = await fetchImpl(`${GH_API}${path}`, { headers: ghHeaders(token) });
    if (!res.ok) return fail(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const items = Array.isArray(json?.usageItems) ? json.usageItems : null;
    if (!items) return fail('no usageItems in response');
    let gross = 0;
    let discount = 0;
    let net = 0;
    let minutes = 0;
    for (const item of items) {
      if (item?.product !== 'actions') continue;
      gross += Number(item.grossAmount) || 0;
      discount += Number(item.discountAmount) || 0;
      net += Number(item.netAmount) || 0;
      if (item?.unitType === 'Minutes') minutes += Number(item.quantity) || 0;
    }
    return {
      monthKey,
      grossUsd: round2(gross),
      discountUsd: round2(discount),
      netUsd: round2(net),
      minutes: Math.round(minutes),
      endpoint: path,
      error: null,
    };
  } catch (err) {
    return fail(String(err?.message ?? err));
  }
}

/** Two decimals, because these are dollars and a float tail reads as noise. */
function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * The money half of the verdict: month-to-date net dollars against the budget.
 *
 * Mirrors `ceilingVerdict`'s contract exactly — same levels, same thresholds,
 * same "unmeasured is not zero" rule — so the two halves can be compared and
 * the worse one taken without either needing to know about the other.
 *
 * @param {{ netUsd: number|null, budgetUsd: number|null, thresholds?: any }} input
 */
export function moneyVerdict({ netUsd, budgetUsd, thresholds = {} }) {
  const budget = Number(budgetUsd);
  if (!Number.isFinite(budget) || budget <= 0) {
    return {
      level: LEVELS.UNKNOWN,
      pct: null,
      headroom: true,
      reason: 'no monthly budget set — set chain_ci_budget.monthly_budget_usd',
    };
  }
  if (netUsd === null || netUsd === undefined || !Number.isFinite(Number(netUsd))) {
    return {
      level: LEVELS.UNKNOWN,
      pct: null,
      headroom: true,
      reason: `this month's spend not measured — nothing has read ${USAGE_ENDPOINT}`,
    };
  }
  const pct = Math.round((Number(netUsd) / budget) * 100);
  const spent = `$${round2(netUsd)} of $${round2(budget)} this month`;
  // No defaults here, deliberately, exactly as in `ceilingVerdict`. A fallback
  // threshold is a constant in code pretending to be configuration, and Exit
  // E-E says the thresholds are rows. A row with none cannot produce a verdict.
  const pause = Number(thresholds.pausePct);
  const stop = Number(thresholds.stopClaimingPct);
  const notify = Number(thresholds.notifyPct);
  if (![notify, stop, pause].some((v) => Number.isFinite(v))) {
    return {
      level: LEVELS.UNKNOWN,
      pct,
      headroom: true,
      reason: 'no thresholds configured in chain_ci_budget — the ceiling has no edge to compare against',
    };
  }
  if (Number.isFinite(pause) && pct >= pause) {
    return { level: LEVELS.PAUSED, pct, headroom: false, reason: `${pct}% — ${spent}` };
  }
  if (Number.isFinite(stop) && pct >= stop) {
    return { level: LEVELS.STOP_CLAIMING, pct, headroom: false, reason: `${pct}% — ${spent}` };
  }
  if (Number.isFinite(notify) && pct >= notify) {
    return { level: LEVELS.NOTIFY, pct, headroom: true, reason: `${pct}% — ${spent}` };
  }
  return { level: LEVELS.OK, pct, headroom: true, reason: `${pct}% — ${spent}` };
}

/**
 * The worse of two verdicts, by severity.
 *
 * `unknown` is deliberately NOT the worst: an unmeasured half must not brake
 * the chain, or a billing blip would halt every programme for a reason nobody
 * could see — the silent stall this programme exists to end. It ranks below
 * `ok` so a measured `ok` beside an unmeasured half still reads as `ok`.
 */
const SEVERITY = { unknown: 0, ok: 1, notify: 2, 'stop-claiming': 3, paused: 4 };
export function worseVerdict(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (SEVERITY[b.level] ?? 0) > (SEVERITY[a.level] ?? 0) ? b : a;
}

/**
 * Today's billable minutes, from the repository's own runs — Q2's real-time
 * proxy, and the half that IS reachable from a repo-scoped session.
 *
 * Paging stops as soon as a page's runs are all older than `dayKey`, because the
 * list is newest-first: a repository with 7,500 runs is never walked to read one
 * day of them.
 *
 * @param {{ repo?: string, token: string, dayKey?: string, fetchImpl?: typeof fetch, maxPages?: number }} input
 */
export async function fetchUsedMinutes({
  repo = DEFAULT_REPO,
  token,
  dayKey = utcDayKey(),
  fetchImpl = fetch,
  maxPages = 10,
  concurrency = 8,
}) {
  const headers = ghHeaders(token);
  const runs = [];
  let truncated = false;
  try {
    for (let page = 1; page <= maxPages; page++) {
      const res = await fetchImpl(
        `${GH_API}/repos/${repo}/actions/runs?per_page=100&page=${page}`,
        { headers },
      );
      if (!res.ok) {
        const body = (await res.text()).slice(0, 200);
    return { usedMinutes: null, runsCounted: 0, truncated, error: `runs ${res.status}: ${body}` };
      }
      const json = await res.json();
      const batch = json?.workflow_runs ?? [];
      if (batch.length === 0) break;
      const onDay = batch.filter((r) => isRunOnUtcDay(r, dayKey));
      runs.push(...onDay);
      // Newest-first: once a whole page predates the day, nothing older can match.
      if (onDay.length === 0 && runs.length > 0) break;
      const oldest = batch[batch.length - 1];
      if ((oldest?.run_started_at || oldest?.created_at || '').slice(0, 10) < dayKey) break;
      // Ran out of pages before running out of day. Measured 2026-08-20: this
      // repository started 500 runs in one UTC day, which hit the old five-page
      // cap exactly — and a cap that truncates in SILENCE undercounts the day,
      // which is the one direction that quietly switches a brake off. Say so.
      if (page === maxPages) truncated = true;
    }

    // One request per run, in small parallel batches rather than one at a time.
    // Sequentially, a 500-run day took about four minutes — four RUNNER minutes
    // added to every merge, by the step whose whole purpose is to spend fewer.
    let minutes = 0;
    for (let i = 0; i < runs.length; i += concurrency) {
      const batch = runs.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (run) => {
          const res = await fetchImpl(
            `${GH_API}/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`,
            { headers },
          );
          if (!res.ok) return 0;
          const json = await res.json();
          return billableMinutesFromJobs(json?.jobs ?? []);
        }),
      );
      for (const m of results) minutes += m;
    }
    return {
      usedMinutes: Math.round(minutes * 10) / 10,
      runsCounted: runs.length,
      truncated,
      error: null,
    };
  } catch (err) {
    return { usedMinutes: null, runsCounted: 0, truncated, error: String(err?.message ?? err) };
  }
}

// ---------------------------------------------------------------------------
// The row
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

/**
 * The account-scoped key, for the billing call and nothing else.
 *
 * NOT named `GITHUB_PAT`: GitHub refuses to store any Actions secret whose name
 * begins with `GITHUB_`, so `secrets.GITHUB_PAT` — the name the first cut of
 * this slice asked for and read — was a name that could never exist.
 */
export function billingToken() {
  const env = loadEnvLocal();
  return (process.env.AFKF_CI_PAT?.trim() || env.AFKF_CI_PAT || '').trim();
}

/**
 * The repository-scoped key, for listing runs and jobs.
 *
 * Kept separate on purpose. The account PAT carries only `user`, so using it
 * for repository calls answers **404 on a private repo** — which is how the
 * first wiring silently stopped measuring the day's minutes while looking like
 * it had simply found nothing. One token for two audiences is the bug.
 */
export function repoToken() {
  const env = loadEnvLocal();
  return (
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    env.GITHUB_TOKEN ||
    env.GH_TOKEN ||
    ''
  ).trim();
}

/** Back-compat for callers that want "whichever token exists". */
export function githubToken() {
  return repoToken() || billingToken();
}

export async function readBudgetRow(key, fetchImpl = fetch) {
  const res = await fetchImpl(
    `${SUPABASE_URL}/rest/v1/chain_ci_budget?id=eq.${BUDGET_ROW_ID}&select=*`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`chain_ci_budget ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

export async function writeBudgetRow(key, patch, fetchImpl = fetch) {
  const res = await fetchImpl(
    `${SUPABASE_URL}/rest/v1/chain_ci_budget?id=eq.${BUDGET_ROW_ID}`,
    {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) throw new Error(`chain_ci_budget PATCH ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

/**
 * Read the stored ceiling, for callers that only need the verdict.
 *
 * Never throws: a chain that cannot reach Supabase must still be able to claim,
 * so an unreadable row degrades to `unknown` (headroom, reported) exactly like
 * an unmeasured allowance does.
 *
 * @returns {Promise<ReturnType<typeof verdictFromRow>>}
 */
export async function readCeiling({ key = supabaseKey(), now = new Date(), fetchImpl = fetch } = {}) {
  if (!key) {
    return {
      ...ceilingVerdict({ usedMinutes: null, allowanceMinutes: null }),
      reason: 'ceiling not read — SUPABASE_SERVICE_ROLE_KEY missing',
      dayKey: utcDayKey(now),
      rowDayKey: null,
      staleDay: true,
      usedMinutes: null,
      allowanceMinutes: null,
      includedMinutes: null,
      includedMinutesSource: null,
    };
  }
  try {
    const row = await readBudgetRow(key, fetchImpl);
    return verdictFromRow(row, { now });
  } catch (err) {
    return {
      ...ceilingVerdict({ usedMinutes: null, allowanceMinutes: null }),
      reason: `ceiling not read — ${String(err?.message ?? err)}`,
      dayKey: utcDayKey(now),
      rowDayKey: null,
      staleDay: true,
      usedMinutes: null,
      allowanceMinutes: null,
      includedMinutes: null,
      includedMinutesSource: null,
    };
  }
}

/**
 * Measure both halves and build the patch the row would take.
 *
 * Pure given its inputs, so the suite proves the important property directly: a
 * refused billing call leaves `included_minutes` **absent from the patch**, so
 * a previously measured allowance is never overwritten with a null by a blip,
 * and an unmeasured one is never invented.
 *
 * @param {{ billing: any, usage: any, row: any, now?: Date }} input
 */
export function buildRefreshPatch({ billing, usage, spend, row, now = new Date() }) {
  const patch = {};
  const notes = [];

  // Same trap as above: `Number(null)` is 0, so a refused billing call would
  // otherwise write `included_minutes = 0` — an allowance of zero, which brakes
  // the chain permanently and looks like a measurement.
  const measuredIncluded =
    billing?.includedMinutes === null || billing?.includedMinutes === undefined
      ? Number.NaN
      : Number(billing.includedMinutes);
  if (Number.isFinite(measuredIncluded) && measuredIncluded > 0) {
    patch.included_minutes = measuredIncluded;
    patch.included_minutes_source = 'billing-api';
    patch.included_minutes_measured_at = new Date(now).toISOString();
    patch.source_endpoint = billing.endpoint ?? BILLING_ENDPOINT;
  } else if (!billing?.retired) {
    notes.push(`allowance not measured (${billing?.error ?? 'no answer'}) — row keeps what it had`);
  }

  const measuredUsed =
    usage?.usedMinutes === null || usage?.usedMinutes === undefined
      ? Number.NaN
      : Number(usage.usedMinutes);
  if (Number.isFinite(measuredUsed) && measuredUsed >= 0) {
    patch.day_key = utcDayKey(now);
    patch.day_used_minutes = measuredUsed;
    patch.day_measured_at = new Date(now).toISOString();
    patch.runs_counted = Number(usage.runsCounted) || 0;
    patch.usage_source = 'repo-actions-runs';
  } else {
    notes.push(`usage not measured (${usage?.error ?? 'no answer'})`);
  }
  // The money half. Same rule as the allowance: a refused call leaves the
  // columns ABSENT from the patch, so a blip never overwrites a real figure
  // with a null and never invents one. `Number(null)` is 0, and a spend of zero
  // would read as full headroom for the rest of the month.
  const measuredNet =
    spend?.netUsd === null || spend?.netUsd === undefined ? Number.NaN : Number(spend.netUsd);
  if (Number.isFinite(measuredNet) && measuredNet >= 0) {
    patch.month_key = spend.monthKey ?? utcMonthKey(now);
    patch.month_net_usd = measuredNet;
    patch.month_gross_usd = Number(spend.grossUsd) || 0;
    patch.month_discount_usd = Number(spend.discountUsd) || 0;
    patch.month_minutes = Number(spend.minutes) || 0;
    patch.month_measured_at = new Date(now).toISOString();
    patch.month_source_endpoint = spend.endpoint ?? USAGE_ENDPOINT;
  } else if (spend) {
    notes.push(`month spend not measured (${spend?.error ?? 'no answer'}) — row keeps what it had`);
  }

  if (usage?.truncated) {
    notes.push(
      `the day had more runs than the page cap could read — ${usage.runsCounted} counted, so today's minutes are a FLOOR, not a total`,
    );
  }

  const merged = { ...(row ?? {}), ...patch };
  const verdict = verdictFromRow(merged, { now });
  patch.last_level = verdict.level;
  patch.last_pct = verdict.pct;
  patch.last_reason = verdict.reason;

  return { patch, verdict, notes };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { json: false, refresh: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--refresh') out.refresh = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--set-included-minutes') out.setIncluded = Number(argv[++i]);
    else if (a === '--set-budget') out.setBudget = Number(argv[++i]);
    else if (a === '--source') out.source = argv[++i];
    else if (a === '--repo') out.repo = argv[++i];
    else if (a === '--user') out.user = argv[++i];
  }
  return out;
}

function render(verdict, notes = []) {
  const L = [];
  L.push('AFKF-12 — the CI ceiling');
  L.push('');
  L.push(`  level        ${verdict.level}`);
  // Money first: it is the limit that actually costs something, and the daily
  // minutes are the fast proxy beneath it.
  L.push(
    `  this month   $${verdict.netUsd ?? '—'} of $${verdict.budgetUsd ?? '—'}` +
      ` (UTC ${verdict.monthKey ?? '—'})`,
  );
  L.push(`  used today   ${verdict.usedMinutes ?? '—'} min (UTC ${verdict.dayKey})`);
  L.push(`  allowance    ${verdict.allowanceMinutes ?? '—'} min/day`);
  L.push(`  headroom     ${verdict.headroom ? 'yes — claiming allowed' : 'NO — claiming stopped'}`);
  L.push(`  why          ${verdict.reason}`);
  if (verdict.staleMonth && verdict.rowMonthKey) {
    L.push(`  note         stored spend describes ${verdict.rowMonthKey}; the UTC month has rolled over`);
  }
  if (verdict.staleDay && verdict.rowDayKey) {
    L.push(`  note         stored figures describe ${verdict.rowDayKey}; the UTC day has rolled over`);
  }
  for (const n of notes) L.push(`  note         ${n}`);
  return L.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = supabaseKey();

  if (Number.isFinite(args.setIncluded)) {
    if (!key) {
      console.error('SUPABASE_SERVICE_ROLE_KEY missing — run npm run access:check');
      process.exit(1);
    }
    const source = args.source === 'billing-api' ? 'billing-api' : 'manual';
    const row = await writeBudgetRow(key, {
      included_minutes: args.setIncluded,
      included_minutes_source: source,
      included_minutes_measured_at: new Date().toISOString(),
      source_endpoint: source === 'billing-api' ? BILLING_ENDPOINT : 'set by hand',
    });
    const verdict = verdictFromRow(row);
    console.log(args.json ? JSON.stringify(verdict, null, 2) : render(verdict));
    return;
  }

  // The monthly ceiling is a DECISION, so it is set by hand and never measured.
  // Exit E-E: this is a row write, not a deploy and not a CI run.
  if (Number.isFinite(args.setBudget)) {
    if (!(args.setBudget > 0)) {
      console.error('--set-budget needs a positive number of dollars');
      process.exit(1);
    }
    if (!key) {
      console.error('no SUPABASE_SERVICE_ROLE_KEY — cannot write the budget');
      process.exit(1);
    }
    const written = await writeBudgetRow(key, { monthly_budget_usd: args.setBudget });
    console.log(`monthly_budget_usd set to $${args.setBudget}`);
    console.log(render(verdictFromRow(written)));
    return;
  }

  if (!args.refresh) {
    const verdict = await readCeiling({ key });
    console.log(args.json ? JSON.stringify(verdict, null, 2) : render(verdict));
    return;
  }

  // Two audiences, two keys. The account PAT reads the bill; the repo token
  // lists runs. Swapping them answers 410 one way and 404 the other, and both
  // look like "found nothing" to a brake that does not check.
  const billingKey = billingToken();
  const repoKey = repoToken();
  if (!billingKey && !repoKey) {
    console.error('no AFKF_CI_PAT and no GITHUB_TOKEN — cannot measure either half');
    process.exit(1);
  }
  const now = new Date();
  const dayKey = utcDayKey(now);
  // `fetchIncludedMinutes` is NOT called. Its endpoint answers 410 Gone, so the
  // call can only ever spend a request to produce the same note on every run —
  // and a note nobody can act on is noise that trains people to skip notes. The
  // function and its tests stay: they document what was measured and when, and
  // if GitHub ever restores the path, one line brings it back.
  const billing = {
    includedMinutes: null,
    endpoint: BILLING_ENDPOINT,
    error: '410 Gone — retired by GitHub 2026-08; the ceiling reads money instead',
    retired: true,
  };
  const [usage, spend] = await Promise.all([
    fetchUsedMinutes({ repo: args.repo ?? DEFAULT_REPO, token: repoKey, dayKey }),
    fetchMonthlySpend({ user: args.user ?? DEFAULT_OWNER, token: billingKey, now }),
  ]);
  const row = key ? await readBudgetRow(key).catch(() => null) : null;
  const { patch, verdict, notes } = buildRefreshPatch({ billing, usage, spend, row, now });

  if (args.dryRun || !key) {
    const out = { verdict, patch, notes, wrote: false };
    console.log(args.json ? JSON.stringify(out, null, 2) : `${render(verdict, notes)}\n\n  (dry run — nothing written)`);
    return;
  }
  const written = await writeBudgetRow(key, patch);
  const finalVerdict = verdictFromRow(written, { now });
  console.log(
    args.json
      ? JSON.stringify({ verdict: finalVerdict, patch, notes, wrote: true }, null, 2)
      : render(finalVerdict, notes),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
}
