#!/usr/bin/env node
/**
 * docs-stale-check.test.mjs — prove it BOTH ways before trusting it.
 *
 * A checker that cries wolf gets ignored, and an ignored checker is worse than none, because it
 * looks like coverage. So every class here is asserted twice: lines that MUST be flagged, and
 * lines that MUST NOT. The known-good set is not decorative — it is the record of two matchers that
 * were wrong in opposite directions on the same afternoon, and either is one careless edit away.
 *
 *   attempt 1 (13 dead, wrong): the token regex stopped at punctuation → `npm run build:check`
 *                               became the command `build:`. Pinned by KNOWN_GOOD below.
 *   attempt 2 (314 dead, wrong): the token regex excluded `:` → `mc:status` became `mc`, and every
 *                               one of the 314 was a false positive. Pinned by KNOWN_GOOD below.
 *   attempt 3 (6, correct):     greedy token, strip trailing punctuation, test BOTH forms.
 *
 * `assertMutationIsRed` makes that explicit: it runs the two broken matchers against the same
 * fixture and fails if either is still quiet. A mutation you have not proved red is a test you have
 * not written.
 *
 * Fixtures are inline strings on purpose. They are synthetic — six named dead commands and a set of
 * deliberately awkward good ones — and inlining keeps this suite a UNIVERSAL kit test rather than
 * one coupled to any repo's own documents.
 *
 * Run: node scripts/docs-stale-check.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  acceptanceMatches,
  checkDoc,
  findDeadCommands,
  findDemotedChecks,
  findUngatedHolds,
  historicalLines,
  isNameableToken,
  isPlaceholder,
  parseWorkflow,
  partition,
  programmeStatus,
  scanRegions,
  annotationOf,
  scanRepo,
  supersededBy,
  workflowTokens,
} from './docs-stale-check.mjs';

/* ───────────────────────────────────────────────────────────────────────────────────── fixtures */

/** The scripts a fixture repo's package.json defines. */
const KNOWN = new Set([
  'mc:status',
  'build',
  'build:check',
  'preflight',
  'test:pb',
  'afkf:map',
  'docs:stale',
  'proof',
]);

/**
 * Lines that MUST NOT be flagged. Every one is a real shape from the master docs, chosen because a
 * plausible matcher gets it wrong.
 */
const KNOWN_GOOD = [
  'Run npm run mc:status to see where we are.',                       // attempt 2 died here
  'Then npm run build:check catches the type errors.',                // attempt 1 died here
  'Use `npm run build:check` before pushing.',                        // inside backticks
  'The last step is npm run build.',                                  // end of sentence, full stop
  'Two commands matter here, npm run build: the first is cheap.',     // followed by a colon
  'Wrapped in bold: **npm run preflight** is the gate.',              // bold markers
  'A placeholder: npm run <x> is the shape, not a command.',          // angle-bracket placeholder
  'The family is npm run test:pb-* — see package.json.',              // glob placeholder
  'Mapping a brief: npm run afkf:map -- --brief <brief.json>',        // trailing args
  'Parenthesised (npm run preflight) still resolves.',                // closing paren
  'Quoted "npm run mc:status", still fine.',                          // quote + comma
];

/** The six real dead commands, as they actually appear. */
const KNOWN_BAD = [
  { line: '`align-service/bench_mms.py` + `npm run agent:lacc-19-aligner-bench` (the bench), and', command: 'agent:lacc-19-aligner-bench' },
  { line: 'Soak it: npm run agent:pp37982-content-soak overnight.', command: 'agent:pp37982-content-soak' },
  { line: 'Bump the epoch with `npm run pb:cache-epoch`.', command: 'pb:cache-epoch' },
  { line: 'Then npm run design-system-first for the audit.', command: 'design-system-first' },
  { line: 'Backfill via `npm run backfill:job-application-s2-script`:', command: 'backfill:job-application-s2-script' },
  { line: 'One more: npm run verify:gone-forever.', command: 'verify:gone-forever' },
];

const FENCED_GOOD = ['```bash', 'npm run mc:status', 'npm run build:check', '```'].join('\n');

const WORKFLOWS = [
  parseWorkflow(
    ['name: PROOF baseline', 'on:', '  workflow_dispatch:', 'jobs:', '  proof-baseline:', '    name: proof baseline', '    runs-on: ubuntu-latest'].join('\n'),
    'proof-baseline.yml',
  ),
  parseWorkflow(
    ['name: TypeScript error ratchet', 'on:', '  workflow_dispatch:', 'jobs:', '  tsc-ratchet:', '    runs-on: ubuntu-latest'].join('\n'),
    'tsc-error-ratchet.yml',
  ),
  parseWorkflow(
    ['name: kit drift', 'on:', '  workflow_dispatch:', 'jobs:', '  kit-drift:', '    name: kit drift'].join('\n'),
    'kit-drift.yml',
  ),
  parseWorkflow(
    ['name: Ralph continue on merge', 'on:', '  pull_request:', '  workflow_dispatch:', 'jobs:', '  ralph-launch:', '    runs-on: ubuntu-latest'].join('\n'),
    'ralph-continue-on-merge.yml',
  ),
  parseWorkflow(
    ['name: Canvas proof (browser checks)', 'on:', '  workflow_dispatch:', 'jobs:', '  proof:', '    runs-on: ubuntu-latest'].join('\n'),
    'canvas-proof.yml',
  ),
];
const TOKENS = workflowTokens(WORKFLOWS);

const commandsOf = (findings) => findings.map((f) => f.command).sort();

/* ────────────────────────────────────────────────────── class A — the matcher, both directions */

test('class A: every known-good line is left alone', () => {
  for (const line of KNOWN_GOOD) {
    assert.deepEqual(findDeadCommands(line, KNOWN), [], `false positive on: ${line}`);
  }
});

test('class A: a fenced code block of live commands is left alone', () => {
  assert.deepEqual(findDeadCommands(FENCED_GOOD, KNOWN), []);
});

test('class A: every known-bad line is flagged, with the command read exactly', () => {
  for (const { line, command } of KNOWN_BAD) {
    const found = findDeadCommands(line, KNOWN);
    assert.equal(found.length, 1, `missed: ${line}`);
    assert.equal(found[0].command, command);
  }
});

test('class A: good and bad mixed in one document gives exactly the bad ones', () => {
  const doc = [...KNOWN_GOOD, FENCED_GOOD, ...KNOWN_BAD.map((b) => b.line)].join('\n');
  assert.deepEqual(commandsOf(findDeadCommands(doc, KNOWN)), KNOWN_BAD.map((b) => b.command).sort());
});

/**
 * The two wrong matchers, run against the same fixture, asserted to be wrong.
 *
 * This is the part that makes the known-good list load-bearing rather than decorative. Without it,
 * deleting the strip step or the raw/cleaned double test breaks nothing visible: the six bad lines
 * are still flagged either way, and only the false-positive count moves.
 */
function assertMutationIsRed(name, matcher, doc) {
  const wrong = [];
  for (const line of doc) for (const m of line.matchAll(matcher)) {
    const t = m[1];
    if (!KNOWN.has(t)) wrong.push(t);
  }
  assert.ok(wrong.length > 0, `mutation "${name}" produced no false positives — it is not being proved red`);
  return wrong;
}

test('class A: attempt 1 (stop at punctuation) is proved red on the known-good lines', () => {
  // The 13-dead matcher: token chars only, so `build:check` truncates to `build:`.
  const wrong = assertMutationIsRed('stop-at-punctuation', /npm run ([A-Za-z0-9:_-]*?[:_-]?)(?=[^A-Za-z0-9:_-]|$)/g, KNOWN_GOOD);
  assert.ok(wrong.some((t) => t.endsWith(':')), `expected a truncated "build:"-shaped token, got ${JSON.stringify(wrong)}`);
  // ...and the shipped matcher is silent on the very same lines.
  assert.deepEqual(findDeadCommands(KNOWN_GOOD.join('\n'), KNOWN), []);
});

test('class A: attempt 2 (colon excluded) is proved red on the known-good lines', () => {
  // The 314-dead matcher: `:` is not a token char, so `mc:status` becomes `mc`.
  const wrong = assertMutationIsRed('colon-excluded', /npm run ([A-Za-z0-9_-]+)/g, KNOWN_GOOD);
  assert.ok(wrong.includes('mc'), `expected "mc" from "mc:status", got ${JSON.stringify(wrong)}`);
  assert.deepEqual(findDeadCommands(KNOWN_GOOD.join('\n'), KNOWN), []);
});

/**
 * The raw-form test is DEFENSIVE, not load-bearing today, and this test exists so that is a fact
 * rather than a hope.
 *
 * Measured 2026-08-26: zero of pp-workspace's 843 scripts and zero of pp-shopify-theme's 103 end in
 * a non-alphanumeric character, so stripping-then-testing alone gets the same answer on both repos
 * — which is exactly why dropping `known.has(raw)` survived a first mutation run in silence. It
 * costs one comparison and it is the only thing standing between a legitimately odd script name and
 * a false positive, so it stays, with a fixture that proves it.
 */
test('class A: a live script whose own name ends in punctuation is not flagged', () => {
  const known = new Set(['weird:name+']);
  assert.deepEqual(findDeadCommands('Run npm run weird:name+ to do the thing.', known), []);
  // ...and the same line is still flagged when that script really is gone.
  assert.equal(findDeadCommands('Run npm run weird:name+ to do the thing.', new Set()).length, 1);
});

/**
 * Both halves of the placeholder test, and the false negative that split them apart.
 *
 * The raw-token version of this check silently swallowed a real dead command wrapped in markdown
 * emphasis. A checker that reports nothing looks exactly like a clean repository, which is why this
 * gets a fixture of its own rather than a comment.
 */
test('class A: a command wrapped in markdown emphasis is still flagged', () => {
  const line = 'a closed doc saying *"we ran `npm run agent:pp37982-content-soak`"* is true history';
  const found = findDeadCommands(line, KNOWN);
  assert.equal(found.length, 1, 'trailing *, backtick and quote must not read as a glob');
  assert.equal(found[0].command, 'agent:pp37982-content-soak');
});

test('class A: a genuine glob family is still skipped', () => {
  assert.deepEqual(findDeadCommands('The family is npm run test:pb-* — see package.json.', KNOWN), []);
  assert.deepEqual(findDeadCommands('The shape is npm run <x>, not a command.', KNOWN), []);
});

test('isPlaceholder separates a placeholder NAME from a GLOB from trailing punctuation', () => {
  assert.equal(isPlaceholder('<x>', '<x'), true, 'brackets survive the strip');
  assert.equal(isPlaceholder('test:pb-*', 'test:pb'), true, 'a * after a separator is a family');
  assert.equal(isPlaceholder('agent:soak`"*', 'agent:soak'), false, 'a * after a quote is punctuation');
  assert.equal(isPlaceholder('build:check`', 'build:check'), false);
});

test('class A: no finding is ever a prefix of a live script', () => {
  const doc = [...KNOWN_GOOD, ...KNOWN_BAD.map((b) => b.line)].join('\n');
  for (const f of findDeadCommands(doc, KNOWN)) {
    for (const live of KNOWN) {
      assert.ok(!(live.startsWith(f.command) && live !== f.command), `"${f.command}" is a truncation of "${live}"`);
    }
  }
});

/* ─────────────────────────────────────────────────── class B — checks that no longer run on a PR */

test('parseWorkflow reads triggers, and a job name beats a job id', () => {
  const wf = WORKFLOWS.find((w) => w.file === 'proof-baseline.yml');
  assert.deepEqual(wf.triggers, ['workflow_dispatch']);
  assert.equal(wf.runsOnPr, false);
  assert.deepEqual(wf.checks, ['proof baseline']);
  assert.deepEqual(WORKFLOWS.find((w) => w.file === 'tsc-error-ratchet.yml').checks, ['tsc-ratchet']);
  assert.equal(WORKFLOWS.find((w) => w.file === 'ralph-continue-on-merge.yml').runsOnPr, true);
});

test('parseWorkflow handles the inline on: [..] form', () => {
  const wf = parseWorkflow(['name: Inline', 'on: [push, pull_request]', 'jobs:', '  a:'].join('\n'), 'inline.yml');
  assert.deepEqual(wf.triggers, ['push', 'pull_request']);
  assert.equal(wf.runsOnPr, true);
});

test('a bare common-noun job id is never a usable token', () => {
  assert.equal(isNameableToken('proof'), false);
  assert.equal(isNameableToken('guard'), false);
  assert.equal(isNameableToken('status'), false);
  assert.equal(isNameableToken('tsc-ratchet'), true);
  assert.equal(isNameableToken('proof baseline'), true);
  assert.ok(!TOKENS.some((t) => t.token === 'proof'), 'canvas-proof.yml job id "proof" must not become a token');
});

test('class B: a live claim that a demoted check runs on a PR is flagged', () => {
  const doc = [
    '### PROOF-3 — Red blocks merge',
    '',
    '**Scope:** `proof-baseline.yml` runs on `pull_request` as a required status check.',
  ].join('\n');
  const found = findDemotedChecks(doc, TOKENS);
  assert.equal(found.length, 1);
  assert.ok(found[0].workflows.includes('proof-baseline.yml') || found[0].checks.length > 0);
  assert.equal(found[0].region, 'slice PROOF-3');
});

test('class B: a PR claim naming no workflow at all is out of scope, by design', () => {
  // Both halves are required. Prose alone ("the baseline runs on pull_request") names nothing a
  // machine can check against, and guessing which workflow "the baseline" means is how a checker
  // starts inventing findings.
  const doc = ['### PROOF-3 — Red blocks merge', '', '**Scope:** the baseline runs on `pull_request` as a required status check.'].join('\n');
  assert.deepEqual(findDemotedChecks(doc, TOKENS), []);
});

test('class B: the same claim about a check that DOES run on a PR is left alone', () => {
  const doc = ['### PROOF-3 — Red blocks merge', '', '`ralph-continue-on-merge.yml` runs on every PR.'].join('\n');
  assert.deepEqual(findDemotedChecks(doc, TOKENS), []);
});

test('class B: naming a demoted check without claiming it runs at PR time is left alone', () => {
  const doc = [
    '### PROOF-3 — Red blocks merge',
    '',
    'Hand-dispatch `proof baseline` from the Actions tab before merging.',
    'The `tsc-error-ratchet.yml` pattern is worth copying.',
  ].join('\n');
  assert.deepEqual(findDemotedChecks(doc, TOKENS), []);
});

test('class B: history outside any live region is never flagged', () => {
  // The log entry that RECORDS the demotion must not be reported as rot.
  const doc = [
    '## Log',
    '',
    '- **2026-08-26 — WORKFLOW-P36.** `proof-baseline.yml` used to run on every pull request as a required check; it is `workflow_dispatch` now.',
  ].join('\n');
  assert.deepEqual(findDemotedChecks(doc, TOKENS), []);
});

test('class B: a bare "PR" adjacent to a filename is not a claim (the stale-green-pr-watch trap)', () => {
  const wf = parseWorkflow(['name: Stale green PR watch', 'on:', '  schedule:', 'jobs:', '  watch:'].join('\n'), 'stale-green-pr-watch.yml');
  const tokens = workflowTokens([...WORKFLOWS, wf]);
  const doc = ['### AFKF-12 — the gate', '', 'those two facts together are exactly what `stale-green-pr-watch.yml` merges'].join('\n');
  assert.deepEqual(findDemotedChecks(doc, tokens), []);
});

test('class B: a slice fence keeps ## Scope inside the slice (the AFKF-1 regression)', () => {
  const doc = [
    '### AFKF-1 — The kit is the source',
    '',
    '```text',
    'AUTONOMY: AFK',
    '',
    '## Scope',
    '',
    '- `.github/workflows/kit-drift.yml` — runs on push and PR, **always reports**',
    '',
    '## Exit tests',
    '',
    '- Exit E-A: `npm run kit:drift` exits 0',
    '```',
  ].join('\n');
  const regions = scanRegions(doc);
  assert.equal(regions.length, 1, 'a fenced ## heading must not start a new region');
  assert.equal(regions[0].label, 'AFKF-1');
  const found = findDemotedChecks(doc, TOKENS);
  assert.equal(found.length, 1);
  assert.ok(found[0].checks.some((c) => c.startsWith('kit-drift') || c === 'kit drift'));
});

/* ───────────────────────────────────────────────────────────── class C — a HOLD with no gate */

test('class C: a HOLD with no HOLD_UNTIL is flagged', () => {
  const doc = [
    '### AFKF-22 — Last: the manual fallback is deleted',
    '',
    '```text',
    'AUTONOMY: AFK',
    'HOLD: do not start until AFKF-15 has run unattended for >= 7 days',
    '```',
  ].join('\n');
  const found = findUngatedHolds(doc);
  assert.equal(found.length, 1);
  assert.equal(found[0].slice, 'AFKF-22');
  assert.match(found[0].text, /^HOLD:/);
});

test('class C: a HOLD carrying a HOLD_UNTIL gate is left alone', () => {
  const doc = [
    '### AFKF-18 — stop writing slice state into the repo',
    '',
    '```text',
    'HOLD: do not start until the dual-write window has run >= 7 days clean',
    'HOLD_UNTIL: chain-divergence-window',
    '```',
  ].join('\n');
  assert.deepEqual(findUngatedHolds(doc), []);
});

test('class C: a slice with no HOLD at all is left alone', () => {
  const doc = ['### AFKF-3 — Silence means shipping', '', '```text', 'AUTONOMY: AFK', '```'].join('\n');
  assert.deepEqual(findUngatedHolds(doc), []);
});

/* ────────────────────────────────────────────────────── the superseded marker: acknowledge, not mute */

test('supersededBy reads a reference, and refuses a bare marker', () => {
  assert.equal(supersededBy('x <!-- docs-stale: superseded by WORKFLOW-P36 -->'), 'WORKFLOW-P36');
  assert.equal(supersededBy('| a | b | <!-- docs-stale: superseded by PROOF-3 -->'), 'PROOF-3');
  assert.equal(supersededBy('x <!-- docs-stale: superseded -->'), null, 'a marker naming nothing is a mute button');
  assert.equal(supersededBy('x <!-- docs-stale: superseded by -->'), null);
  assert.equal(supersededBy('an ordinary line'), null);
});

test('a marked line moves to the acknowledged bucket, and an unmarked twin still fails', () => {
  const base = ['ACTIVE_SLICE: X-9', '', '### X-1 — live', ''];
  const claim = '**Scope:** `proof-baseline.yml` runs on `pull_request` as a required status check.';

  const unmarked = partition([checkDoc({ name: 'a.md', text: [...base, claim].join('\n'), knownScripts: KNOWN, tokens: TOKENS })]);
  assert.equal(unmarked.open.length, 1);
  assert.equal(unmarked.acknowledged.length, 0);

  const marked = partition([
    checkDoc({ name: 'a.md', text: [...base, `${claim} <!-- docs-stale: superseded by WORKFLOW-P36 -->`].join('\n'), knownScripts: KNOWN, tokens: TOKENS }),
  ]);
  assert.equal(marked.open.length, 0);
  assert.equal(marked.acknowledged.length, 1);
  assert.equal(marked.acknowledged[0].annotation.ref, 'WORKFLOW-P36');
  assert.equal(marked.acknowledged[0].annotation.verb, 'superseded');
});

test('a bare marker suppresses nothing', () => {
  const text = [
    'ACTIVE_SLICE: X-9',
    '',
    '### X-1 — live',
    '',
    '**Scope:** `proof-baseline.yml` runs on `pull_request` as a required check. <!-- docs-stale: superseded -->',
  ].join('\n');
  const { open, acknowledged } = partition([checkDoc({ name: 'a.md', text, knownScripts: KNOWN, tokens: TOKENS })]);
  assert.equal(open.length, 1, 'a marker with no reference must not suppress');
  assert.equal(acknowledged.length, 0);
});

test('the marker works for a dead command and for an ungated HOLD too', () => {
  const cmd = 'We ran npm run agent:pp37982-content-soak. <!-- docs-stale: superseded by DSC-9 -->';
  assert.equal(findDeadCommands(cmd, KNOWN)[0].annotation.ref, 'DSC-9');

  const hold = [
    '### X-1 — held',
    '',
    '```text',
    'HOLD: wait for the window <!-- docs-stale: superseded by AFKF-18b -->',
    '```',
  ].join('\n');
  assert.equal(findUngatedHolds(hold)[0].annotation.ref, 'AFKF-18b');
});

test('the "elsewhere" verb marks a command that lives in a sibling repo', () => {
  const line = '- [ ] `pp-workspace`: npm run test:pbpf-1 — PASS <!-- docs-stale: elsewhere in pp-workspace -->';
  const found = findDeadCommands(line, KNOWN);
  assert.equal(found.length, 1, 'the command is still reported — the marker labels it, it does not hide it');
  assert.deepEqual(found[0].annotation, { verb: 'elsewhere', ref: 'pp-workspace' });

  const text = ['ACTIVE_SLICE: X-9', '', '### X-1 — live', '', line].join('\n');
  const { open, acknowledged } = partition([checkDoc({ name: 'a.md', text, knownScripts: KNOWN, tokens: TOKENS })]);
  assert.equal(open.length, 0);
  assert.equal(acknowledged.length, 1);
  assert.equal(acknowledged[0].annotation.verb, 'elsewhere');
});

/**
 * The marker must not install itself by being written about.
 *
 * The log entry documenting this mechanism contains the marker's own syntax mid-sentence, and
 * before the end-of-line anchor that line annotated — and silently suppressed — a real finding on
 * itself.
 */
test('a marker described mid-sentence is not a marker', () => {
  const prose = 'Write `<!-- docs-stale: superseded by WORKFLOW-P36 -->` at the end of the line.';
  assert.equal(annotationOf(prose), null, 'documenting the syntax must not invoke it');

  const text = [
    'ACTIVE_SLICE: X-9',
    '',
    '### X-1 — live',
    '',
    `We ran npm run gone:forever. ${prose}`,
  ].join('\n');
  const { open, acknowledged } = partition([checkDoc({ name: 'a.md', text, knownScripts: KNOWN, tokens: TOKENS })]);
  assert.equal(open.length, 1, 'the finding on that line must survive');
  assert.equal(acknowledged.length, 0);
});

test('a marker inside a markdown table cell still counts', () => {
  const row = '| The suite | `proof-baseline.yml` runs on `pull_request` <!-- docs-stale: superseded by WORKFLOW-P36 --> |';
  assert.equal(annotationOf(row)?.ref, 'WORKFLOW-P36');
});

test('annotationOf refuses an unknown verb and a reference-free marker', () => {
  assert.equal(annotationOf('x <!-- docs-stale: ignore this -->'), null, 'only the two verbs count');
  assert.equal(annotationOf('x <!-- docs-stale: elsewhere -->'), null);
  assert.deepEqual(annotationOf('x <!-- docs-stale: elsewhere in pp-workspace -->'), { verb: 'elsewhere', ref: 'pp-workspace' });
  assert.equal(supersededBy('x <!-- docs-stale: elsewhere in pp-workspace -->'), null, 'the verbs do not bleed into each other');
});

test('past tense clears a PR claim without any marker', () => {
  const ran = ['### X-1 — live', '', '- `kit-drift.yml` — ran on push and PR, always reported.'].join('\n');
  assert.deepEqual(findDemotedChecks(ran, TOKENS), [], '"ran on ... PR" is a record, not an assertion');
  const runs = ['### X-1 — live', '', '- `kit-drift.yml` — runs on push and PR, always reports.'].join('\n');
  assert.equal(findDemotedChecks(runs, TOKENS).length, 1, '"runs on ... PR" is an assertion');
});

/* ──────────────────────────────────────────────────────────────────────────────────── severity */

test('programmeStatus reads open, closed and no-dashboard apart', () => {
  assert.equal(programmeStatus('ACTIVE_SLICE: AFKF-17 — done').status, 'open');
  assert.equal(programmeStatus('ACTIVE_SLICE: AFKF-17 — done').activeSlice, 'AFKF-17');
  assert.equal(programmeStatus('ACTIVE_SLICE: **LACC-29 — memory**').activeSlice, 'LACC-29');
  assert.equal(programmeStatus('ACTIVE_SLICE: none').status, 'closed');
  assert.equal(programmeStatus('ACTIVE_SLICE: none — programme complete').status, 'closed');
  assert.equal(programmeStatus('**Status:** Complete — archived').status, 'unknown');
});

const staleDoc = (heading) =>
  [heading, '', '```text', 'AUTONOMY: AFK', '```', '', 'Soak it: npm run agent:pp37982-content-soak overnight.'].join('\n');

function bucketsFor(dashboard, heading) {
  const text = `${dashboard}\n\n${staleDoc(heading)}`;
  return partition([checkDoc({ name: 'x-master.md', text, knownScripts: KNOWN, tokens: TOKENS })]);
}

test('severity: a stale line in an OPEN programme is a failure', () => {
  const { open, other } = bucketsFor('ACTIVE_SLICE: X-1', '### X-1 — live work');
  assert.equal(open.length, 1);
  assert.equal(other.length, 0);
});

test('severity: a stale line in a CLOSED programme is reported, never failed', () => {
  const { open, other } = bucketsFor('ACTIVE_SLICE: none', '### X-1 — done work');
  assert.equal(open.length, 0);
  assert.equal(other.length, 1);
  assert.equal(other[0].status, 'closed');
});

test('severity: a doc with no dashboard is "unknown" and gates nothing', () => {
  const { open, other } = bucketsFor('**Status:** Complete — archived 2026-06-30', '### X-1 — old work');
  assert.equal(open.length, 0);
  assert.equal(other[0].status, 'unknown');
});

test('severity: a finished slice inside an OPEN programme is history (the LACC-19 case)', () => {
  for (const marker of ['### X-1 — benched ✅ (record only)', '### X-1 — shipped ✅']) {
    const { open, other } = bucketsFor('ACTIVE_SLICE: X-9', marker);
    assert.equal(open.length, 0, `expected history for heading: ${marker}`);
    assert.equal(other[0].status, 'open · finished slice');
  }
});

test('severity: "Shipped" in the BODY does not make a slice history (the PROOF-3 case)', () => {
  const text = [
    'ACTIVE_SLICE: PROOF-6',
    '',
    '### PROOF-3 — Red blocks merge',
    '',
    '**Shipped 2026-08-08 in PR #1580.**',
    '',
    '**Scope:** `proof-baseline.yml` runs on `pull_request` as a required status check.',
  ].join('\n');
  const { open } = partition([checkDoc({ name: 'proof-master.md', text, knownScripts: KNOWN, tokens: TOKENS })]);
  assert.equal(open.length, 1, 'a shipped slice whose heading carries no marker stays live');
  assert.equal(open[0].klass, 'B');
});

test('historicalLines covers a finished slice and nothing else', () => {
  const doc = [
    '### X-1 — done ✅',
    'inside finished',
    '',
    '### X-2 — live',
    'inside live',
  ].join('\n');
  const lines = historicalLines(scanRegions(doc));
  assert.ok(lines.has(2));
  assert.ok(!lines.has(5));
});

/* ────────────────────────────────────────────── accepted-but-unfixed: a ratchet, not a mute button */

const heldDoc = [
  'ACTIVE_SLICE: X-9',
  '',
  '### AFKF-22 — Last: the manual fallback is deleted',
  '',
  '```text',
  'HOLD: do not start until the chain has run unattended for 7 days',
  '```',
].join('\n');

const ENTRY = { doc: 'afkf-master.md', klass: 'C', key: 'AFKF-22', reason: 'no recorder exists', needs: 'a daily cold-start recorder' };

test('an accepted finding is reported but does not fail', () => {
  const docs = [checkDoc({ name: 'afkf-master.md', text: heldDoc, knownScripts: KNOWN, tokens: TOKENS })];
  const before = partition(docs, []);
  assert.equal(before.open.length, 1, 'without the entry it must fail');

  const after = partition(docs, [ENTRY]);
  assert.equal(after.open.length, 0);
  assert.equal(after.accepted.length, 1);
  assert.equal(after.accepted[0].accepted.reason, 'no recorder exists');
  assert.deepEqual(after.unusedAcceptances, []);
});

test('an acceptance is matched on doc+class+key, never on a line number', () => {
  const f = { doc: 'afkf-master.md', klass: 'C', slice: 'AFKF-22', line: 1331 };
  assert.equal(acceptanceMatches(ENTRY, f), true);
  assert.equal(acceptanceMatches(ENTRY, { ...f, line: 9999 }), true, 'line numbers move; the entry must not care');
  assert.equal(acceptanceMatches(ENTRY, { ...f, slice: 'AFKF-21' }), false);
  assert.equal(acceptanceMatches(ENTRY, { ...f, doc: 'other-master.md' }), false);
  assert.equal(acceptanceMatches(ENTRY, { ...f, klass: 'A' }), false);
});

test('an acceptance that accepts a DIFFERENT finding in the same doc does not cover this one', () => {
  const docs = [checkDoc({ name: 'afkf-master.md', text: heldDoc, knownScripts: KNOWN, tokens: TOKENS })];
  const { open, accepted } = partition(docs, [{ ...ENTRY, key: 'AFKF-21' }]);
  assert.equal(open.length, 1);
  assert.equal(accepted.length, 0);
});

test('an acceptance matching nothing is reported, never failed', () => {
  const clean = ['ACTIVE_SLICE: X-9', '', '### X-1 — live', '', 'nothing wrong here'].join('\n');
  const docs = [checkDoc({ name: 'afkf-master.md', text: clean, knownScripts: KNOWN, tokens: TOKENS })];
  const { open, unusedAcceptances } = partition(docs, [ENTRY]);
  assert.equal(open.length, 0, 'fixing the thing must never turn the build red');
  assert.equal(unusedAcceptances.length, 1);
});

test('an acceptance covers only its own class-A command', () => {
  const text = ['ACTIVE_SLICE: X-9', '', '### X-1 — live', '', 'Run npm run gone:one and npm run gone:two.'].join('\n');
  const docs = [checkDoc({ name: 'a.md', text, knownScripts: KNOWN, tokens: TOKENS })];
  const { open, accepted } = partition(docs, [{ doc: 'a.md', klass: 'A', key: 'gone:one', reason: 'r' }]);
  assert.equal(accepted.length, 1);
  assert.equal(open.length, 1);
  assert.equal(open[0].command, 'gone:two');
});

/* ───────────────────────────────────────────────────────────────────────────── repo integration */

test('scanRepo reads a whole repo, and an absent docs/projects is said out loud', () => {
  const root = mkdtempSync(join(tmpdir(), 'docs-stale-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: Object.fromEntries([...KNOWN].map((k) => [k, 'true'])) }));
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
    writeFileSync(
      join(root, '.github', 'workflows', 'proof-baseline.yml'),
      ['name: PROOF baseline', 'on:', '  workflow_dispatch:', 'jobs:', '  proof-baseline:', '    name: proof baseline'].join('\n'),
    );

    assert.equal(scanRepo(root).noDocsDir, true, 'a repo with no master docs must say so, not pass quietly');

    mkdirSync(join(root, 'docs', 'projects'), { recursive: true });
    writeFileSync(
      join(root, 'docs', 'projects', 'live-master.md'),
      ['ACTIVE_SLICE: X-1', '', '### X-1 — live', '', '**Scope:** `proof-baseline.yml` runs on `pull_request` as a required status check.'].join('\n'),
    );
    writeFileSync(
      join(root, 'docs', 'projects', 'closed-master.md'),
      ['ACTIVE_SLICE: none', '', '### X-1 — done', '', 'We ran npm run agent:pp37982-content-soak.'].join('\n'),
    );

    const result = scanRepo(root);
    assert.equal(result.noDocsDir, false);
    assert.equal(result.docs.length, 2);
    const { open, other } = partition(result.docs);
    assert.equal(open.length, 1);
    assert.equal(open[0].doc, 'live-master.md');
    assert.equal(open[0].klass, 'B');
    assert.equal(other.length, 1);
    assert.equal(other[0].doc, 'closed-master.md');
    assert.equal(other[0].klass, 'A');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
