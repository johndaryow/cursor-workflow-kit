#!/usr/bin/env node
/**
 * PREFLIGHT — the checks that used to run on every push, run here instead.
 *
 * WHY THIS EXISTS (2026-08-26, WORKFLOW-P36).
 *
 * Six workflows fired on every push, ~35–40 runner-minutes a slice, re-running tests the agent
 * session had already run minutes earlier on the same commit. Private-repo Actions minutes are
 * metered; the account ran out and every check began failing in two seconds with no runner
 * assigned — which reads exactly like a broken build and is not one.
 *
 * The checks were never the waste. Running them twice was. So they moved here, and GitHub keeps
 * only the jobs that must run when **no agent session exists**: the chain launcher, the daily
 * digest, the nightly live health check, and one guard on `main` (a squash merge produces a tree
 * no PR run ever tested — that is exactly when a silent breakage lands).
 *
 * THE BARGAIN: this file is now the gate. A push that skipped it is a push nobody checked.
 * `/afk-slice` runs it before opening a PR and will not push without it.
 *
 * A check with `baselineFailures` is RATCHETED, not gated: the suite is known-red, so the gate is
 * "no worse than the recorded number", never zero. Same rule as `test:tsc-ratchet` — lower always
 * passes and is reported; higher fails and names the delta. Never raise a baseline to go green.
 *
 *   npm run preflight              # everything that is fast and offline
 *   npm run preflight -- --full    # adds the browser proof suite (slow: builds the app)
 *   npm run preflight -- --json    # machine-readable, for the critic step
 */
import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const full = argv.includes('--full');
const asJson = argv.includes('--json');

/** Every command a pull_request check used to run, with the workflow it came from. */
const CHECKS = [
  { from: 'tsc-error-ratchet', cmd: 'npm run test:tsc-ratchet' },
  { from: 'tsc-error-ratchet', cmd: 'npm run audit:colors' },
  { from: 'edge-runtime-guard', cmd: 'npm run check:edge-node-globals' },
  { from: 'edge-runtime-guard', cmd: 'npm run check:edge-bundles' },
  { from: 'kit-drift', cmd: 'node scripts/kit-drift-check.mjs' },
  { from: 'kit-drift', cmd: 'node scripts/kit-drift-check.test.mjs' },
  { from: 'ralph-chain-test', cmd: 'npm run test:ralph-chain' },
  { from: 'ralph-chain-test', cmd: 'npm run test:ralph-launch' },
  { from: 'ralph-chain-test', cmd: 'npm run test:ralph-fire-claude' },
  { from: 'ralph-chain-test', cmd: 'npm run test:routine-repo-health' },
  { from: 'ralph-chain-test', cmd: 'npm run test:create-session-guard' },
  { from: 'ralph-chain-test', cmd: 'npm run test:auto-merge' },
  { from: 'ralph-chain-test', cmd: 'npm run test:workflow-rules' },
  { from: 'ralph-chain-test', cmd: 'npm run test:planning-claim' },
  // The stop-list suite. Its workflow comment says a Claude Code session's safety classifier
  // refuses every command in that area (KNOWN_TRAP_7), so CI was "where the list gets checked".
  // Measured 2026-08-26: it runs fine in this session. Both venues keep it — if a future session
  // IS refused, preflight goes red and says so, and main-guard still runs it on a clean machine.
  // A check that can be silently refused must never have only one venue.
  { from: 'ralph-chain-test', cmd: 'npm run test:afkf-permissions' },
  { from: 'ralph-chain-test', cmd: 'npm run test:afkf-10' },
  { from: 'ralph-chain-test', cmd: 'npm run test:afkf-divergence' },
  { from: 'ralph-chain-test', cmd: 'npm run test:afkf-11' },
  { from: 'ralph-chain-test', cmd: 'npm run test:afkf-12' },
  { from: 'ralph-chain-test', cmd: 'npm run test:afkf-13' },
  { from: 'ralph-chain-test', cmd: 'npm run test:afkf-14' },
  { from: 'ralph-chain-test', cmd: 'npm run test:afkf-15' },
  { from: 'ralph-chain-test', cmd: 'npm run test:afkf-16' },
  // Slow: builds the app and drives a real browser. Opt in with --full.
  { from: 'proof-baseline', cmd: 'npm run proof', slow: true },
];

const results = [];
let failed = 0;

for (const check of CHECKS) {
  if (check.slow && !full) {
    results.push({ ...check, status: 'skipped', reason: 'slow — pass --full to include' });
    if (!asJson) console.log(`SKIP  ${check.cmd}  (slow — --full to include)`);
    continue;
  }
  const ratcheted = typeof check.baselineFailures === 'number';
  const started = process.hrtime.bigint();
  let out = '';
  let threw = null;
  try {
    // A ratcheted suite exits non-zero by design, so its output is always captured.
    out = execSync(check.cmd, {
      stdio: asJson || ratcheted ? 'pipe' : 'inherit',
      env: process.env,
    })?.toString() ?? '';
  } catch (err) {
    threw = err;
    out = [err.stdout?.toString() ?? '', err.stderr?.toString() ?? ''].join('');
  }
  const ms = Number((process.hrtime.bigint() - started) / 1000000n);

  if (ratcheted) {
    // node --test prints "# fail N". No count means the run did not complete — never a pass.
    const m = /^# fail (\d+)$/m.exec(out);
    if (!m) {
      results.push({ ...check, status: 'fail', ms, reason: 'no "# fail" line — the suite did not finish', output: out.slice(-4000) });
      failed += 1;
      if (!asJson) console.log(`FAIL  ${check.cmd}  — the suite did not finish (no failure count to compare)`);
    } else {
      const now = Number(m[1]);
      const base = check.baselineFailures;
      const ok = now <= base;
      results.push({ ...check, status: ok ? 'pass' : 'fail', ms, failures: now, baselineFailures: base });
      if (!ok) failed += 1;
      if (!asJson) {
        const delta = now === base ? 'at baseline' : now < base ? `${base - now} FEWER than baseline — lower it` : `${now - base} MORE than baseline`;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${check.cmd}  (${(ms / 1000).toFixed(1)}s) — ${now} failures, ${delta}`);
      }
    }
  } else if (threw) {
    results.push({ ...check, status: 'fail', ms, output: out.trim().slice(-4000) });
    failed += 1;
    if (!asJson) console.log(`FAIL  ${check.cmd}  (${(ms / 1000).toFixed(1)}s)`);
  } else {
    results.push({ ...check, status: 'pass', ms });
    if (!asJson) console.log(`PASS  ${check.cmd}  (${(ms / 1000).toFixed(1)}s)`);
  }
}

const skipped = results.filter((r) => r.status === 'skipped').length;
const summary = {
  ok: failed === 0,
  passed: results.filter((r) => r.status === 'pass').length,
  failed,
  skipped,
  full,
  results,
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('');
  console.log(`preflight: ${summary.passed} passed, ${failed} failed, ${skipped} skipped`);
  if (skipped && !full) {
    // Never let a skip read as a pass. The digest's own lesson: silent truncation reads as
    // "covered everything" when it did not.
    console.log('NOTE: the browser proof was not run. Say so in the SESSION REPORT, or use --full.');
  }
  console.log(failed === 0 ? 'OK — safe to push.' : 'RED — fix before pushing. A push that skipped this is a push nobody checked.');
}

process.exit(failed === 0 ? 0 : 1);
