#!/usr/bin/env node
/**
 * docs-stale-check.mjs — compare what the master docs ASSERT against what is actually true.
 *
 * WHY THIS EXISTS, AND IT IS NOT HYPOTHETICAL.
 *
 * This repository keeps writing rules down correctly and then breaking them, because nothing
 * compares the written rule to reality. Three times in two days:
 *
 *   1. `HOLD:` was English prose in a slice block. Nothing read it. The chain launched AFKF-18 six
 *      days early. AFKF-18b made it a machine-checked gate (`afkf-hold.mjs`) — this file copies
 *      that shape and, for holds, literally reuses that parser rather than growing a second one.
 *   2. `history.md` says *"a required check must always report; a filtered-out workflow never
 *      reports at all."* WORKFLOW-P36 demoted `proof-baseline.yml` to `workflow_dispatch` while
 *      leaving `REQUIRED_CHECK_NAMES = ['proof baseline']`, making the merge gate unsatisfiable on
 *      every PR. Two PRs sat stuck. The session that broke it is the same session that migrated
 *      that warning into `history.md`.
 *   3. Plan documents name npm commands and CI checks that no longer exist.
 *
 * This closes (3) permanently and leaves the door open for the general case. It is deliberately
 * THREE classes. A fourth that "seems useful" is how a checker starts crying wolf.
 *
 *   A. `npm run <x>` named in a doc where <x> is not in `package.json`
 *   B. an exit test or slice block naming a GitHub check that no longer runs on a pull request
 *   C. a `HOLD:` line with no machine-readable `HOLD_UNTIL:` gate
 *
 * SEVERITY DEPENDS ON WHETHER THE PROGRAMME IS OPEN, AND THAT IS THE WHOLE DESIGN.
 *
 * A doc with `ACTIVE_SLICE: <ID>` is live: a stale line there is a real problem and fails the run.
 * A closed programme is a HISTORICAL RECORD. A closed doc saying "we ran
 * `npm run agent:pp37982-content-soak`" is true history, not rot — rewriting it would be falsifying
 * the record. Closed findings are reported separately and NEVER fail.
 *
 * Programme status is read the only way a machine can: from `ACTIVE_SLICE:`. `none` (or anything
 * starting with it) is closed; a slice id is open; NO dashboard at all is `unknown`, reported as
 * its own bucket rather than quietly filed as closed. Only `open` gates.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *   - It does not check file links. `npm run docs:check-paths` already owns that.
 *   - It does not rewrite documents. It reports; a person or a slice fixes.
 *
 * ── THE MATCHER, AND WHY IT LOOKS LIKE THIS ────────────────────────────────────────────────────
 *
 * Class A was measured three times on 2026-08-26 and gave three different answers. Two were wrong,
 * and BOTH failure modes are cheap to reintroduce, so both are pinned by fixtures in the test:
 *
 *   attempt 1:  13 dead — the token regex stopped at punctuation, so `npm run build:check` in prose
 *                         became the command `build:`. Under-greedy: invents commands.
 *   attempt 2: 314 dead — the token regex excluded `:`, so `mc:status` became `mc`. Every one of the
 *                         314 was a false positive. A checker that cries wolf gets ignored, and an
 *                         ignored checker is worse than none because it looks like coverage.
 *   attempt 3:   6 dead — GREEDY token (everything up to whitespace), THEN strip trailing
 *                         punctuation, THEN test BOTH the raw and the cleaned form. Correct.
 *
 * The order matters. Greedy-first means a command is never truncated mid-name. Testing both forms
 * means a trailing backtick, full stop or colon cannot manufacture a finding, while a name that
 * legitimately contains `:` or `-` survives intact. Stripping is `[^A-Za-z0-9]+$` — every trailing
 * non-alphanumeric, not a hand-listed set, because the hand-listed set is what missed `` ` `` and
 * turned 5 findings into 38 on the fourth attempt.
 *
 * Usage:
 *   npm run docs:stale              # human report — exits 1 on any OPEN-programme finding
 *   npm run docs:stale -- --json
 *   npm run docs:stale -- --root <dir>
 *   npm run docs:stale -- --strict  # also fail on closed/unknown findings (never used by preflight)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHoldTag } from './afkf-hold.mjs';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ─────────────────────────────────────────────────────────────────── workflows: what is TRUE now */

/**
 * What a workflow file actually declares.
 *
 * `triggers` comes from the top-level `on:` block only. `checks` are the CHECK CONTEXTS GitHub
 * reports under — a job's `name:` when it has one, otherwise its id. That distinction is the whole
 * reason this is parsed rather than assumed: `tsc-error-ratchet.yml` is named "TypeScript error
 * ratchet" but reports as `tsc-ratchet`, which is the string the docs actually use.
 *
 * Parsed with regexes rather than a YAML library on purpose: the kit ships into repos that must not
 * grow a dependency to run a doc check, and the three fields wanted here are all top-level.
 *
 * @param {string} text
 * @param {string} file basename, e.g. `proof-baseline.yml`
 */
export function parseWorkflow(text, file) {
  const name = text.match(/^name:\s*(.+?)\s*$/m)?.[1] ?? null;

  // The `on:` block runs until the next column-0 key. `on: [push]` inline form is handled too.
  const inlineOn = text.match(/^on:\s*\[(.+?)\]\s*$/m)?.[1];
  let triggers;
  if (inlineOn) {
    triggers = inlineOn.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    const block = text.split(/^on:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';
    triggers = [...block.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
  }

  const jobsBlock = text.split(/^jobs:\s*$/m)[1] ?? '';
  const checks = [];
  for (const m of jobsBlock.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)) {
    const body = jobsBlock.slice(m.index + m[0].length).split(/^ {2}[A-Za-z0-9_-]+:\s*$/m)[0];
    checks.push(body.match(/^ {4}name:\s*(.+?)\s*$/m)?.[1] ?? m[1]);
  }

  return { file, name, triggers, checks, runsOnPr: triggers.includes('pull_request') };
}

/**
 * A token is only usable if a document naming it could mean nothing else.
 *
 * Job ids are frequently bare common nouns — `proof`, `guard`, `status`, `watch`, `digest`,
 * `cleanup`. Matching those against prose flags every sentence containing the word "proof". So a
 * token must carry a hyphen or a space: `tsc-ratchet`, `edge-bundles`, `proof baseline`, `kit
 * drift` all survive; `proof` alone does not. Measured: without this rule the class-B candidate set
 * went from 2 to dozens, all noise.
 *
 * @param {string} token
 */
export function isNameableToken(token) {
  return typeof token === 'string' && /[- ]/.test(token.trim()) && token.trim().length >= 4;
}

/**
 * Every string a document could plausibly use to name a workflow or its check, longest first.
 *
 * Longest-first matters for reporting: `proof-baseline.yml` should be reported rather than the
 * substring `proof-baseline` it contains.
 *
 * @param {ReturnType<typeof parseWorkflow>[]} workflows
 */
export function workflowTokens(workflows) {
  const out = [];
  const seen = new Set();
  const candidates = [];
  for (const w of workflows) {
    for (const t of [w.file, w.file.replace(/\.ya?ml$/, ''), w.name, ...w.checks]) {
      if (!isNameableToken(t)) continue;
      candidates.push({ token: t.trim(), key: t.trim().toLowerCase(), runsOnPr: w.runsOnPr, file: w.file });
    }
  }
  candidates.sort((a, b) => b.token.length - a.token.length);
  for (const c of candidates) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    out.push(c);
  }
  return out;
}

/** Read and parse every workflow in a repo. Returns `[]` when the directory is absent. */
export function readWorkflows(root) {
  const dir = join(root, '.github', 'workflows');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => parseWorkflow(readFileSync(join(dir, f), 'utf8'), f));
}

/* ────────────────────────────────────────────────────────────────────────── programme open/closed */

/**
 * Open, closed, or unknown — read from the dashboard, never guessed from prose.
 *
 * `unknown` is its own answer rather than a lenient "closed". 21 of pp-workspace's 157 master docs
 * predate the dashboard and carry their status as English ("**Status:** ✅ Complete"). Calling
 * those closed would be a guess; calling them open would fail the build on 21 archives. They are
 * reported in their own bucket and gate nothing, which says out loud that the checker cannot tell.
 *
 * @param {string} text
 * @returns {{ status: 'open'|'closed'|'unknown', activeSlice: string|null }}
 */
export function programmeStatus(text) {
  const raw = text.match(/^ACTIVE_SLICE:\s*(.*)$/m)?.[1];
  if (raw === undefined) return { status: 'unknown', activeSlice: null };
  const value = raw.trim();
  if (!value || /^none\b/i.test(value)) return { status: 'closed', activeSlice: null };
  const id = value.split(/\s+[—·-]\s+/)[0].replace(/[*`_]/g, '').trim();
  return { status: 'open', activeSlice: id || value.slice(0, 40) };
}

/* ──────────────────────────────────────────────────────────────────────────────────────── regions */

const SLICE_HEADING = /^#{2,4}\s+(?:\d+\.\s+)?([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+[a-z]?)\b/;

/**
 * A slice heading that says this slice is FINISHED AND KEPT FOR THE RECORD.
 *
 * Found by running the checker rather than by reasoning about it. `lyric-acc-master.md` is an OPEN
 * programme — `ACTIVE_SLICE: **LACC-29` — and it carries `npm run agent:lacc-19-aligner-bench`,
 * a command that no longer exists. The doc-level rule made that an open finding and demanded a fix.
 * But the line lives under `### LACC-19 — a real forced aligner, benched against the ruler ✅
 * (record only)`, and "record only" is the document saying, in its own words, that this section is
 * history.
 *
 * The severity principle does not change here, it just applies at the grain the document uses: a
 * finished slice is a historical record even when the programme around it is still running, exactly
 * as a closed programme is one while the repository still runs. Editing it would falsify the record.
 *
 * The marker must be in the HEADING, never in the body, and that boundary is load-bearing rather
 * than fussy. `PROOF-3`'s body opens with **"Shipped 2026-08-08 in PR #1580."** — every finished
 * slice's body says it shipped. Its heading does not carry the marker, so its two false claims about
 * `pull_request` stay live and stay failing, which is correct: they are the ones this run must fix.
 * Measured on 2026-08-26: 11 of 221 slice headings in open programmes carry a marker. It is a real
 * convention, used sparingly.
 */
const SLICE_DONE = /✅|\(record only\)/;
const EXIT_SECTION_HEADING = /^#{1,4}\s+.*\bexit tests?\b/i;
const EXIT_LINE = /^\s*(?:[-*|>]\s*)*(?:\*\*)?Exit\s+(?:E-[A-Z]\b|tests?\b)/i;

/**
 * The parts of a master doc whose claims are LIVE INSTRUCTIONS rather than history.
 *
 * This scoping is the difference between a useful class B and an unusable one. A master doc's log
 * and its `KNOWN_TRAP_*` entries describe what WAS true, often at length and often naming a check
 * precisely because that check changed. Flagging those would report the repository's own accurate
 * history as rot — and would have flagged `KNOWN_TRAP_30`, the entry that RECORDS the demotion this
 * class exists to catch. Measured: unscoped, 8 candidates of which 6 were history; scoped, 3, all
 * real.
 *
 * FENCES ARE TRACKED, AND THAT IS NOT A DETAIL. A §12 slice block is one ```text fence containing
 * `## Scope`, `## Exit tests`, `## MUST NOT` as PLAIN TEXT. Treating those as real headings ends
 * the slice region at its first subsection and drops the scope lines — which is exactly where
 * AFKF-1 asserts `kit-drift.yml` "runs on push and PR". First draft did that and missed it.
 *
 * @param {string} text
 * @returns {{kind:'slice'|'exit-section'|'exit-line', label:string, done:boolean, lines:{n:number,text:string}[]}[]}
 */
export function scanRegions(text) {
  const lines = text.split('\n');
  const out = [];
  let current = null;
  let fence = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMark = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMark) {
      if (fence === null) fence = fenceMark[1][0];
      else if (fenceMark[1][0] === fence) fence = null;
      if (current) current.lines.push({ n: i + 1, text: line });
      continue;
    }

    if (fence === null && /^#{1,6}\s/.test(line)) {
      const slice = SLICE_HEADING.exec(line);
      if (slice) current = { kind: 'slice', label: slice[1], done: SLICE_DONE.test(line), lines: [] };
      else if (EXIT_SECTION_HEADING.test(line)) {
        current = { kind: 'exit-section', label: line.replace(/^#+\s*/, '').trim(), done: false, lines: [] };
      } else current = null;
      if (current) out.push(current);
      continue;
    }

    if (current) current.lines.push({ n: i + 1, text: line });
    else if (EXIT_LINE.test(line)) {
      out.push({ kind: 'exit-line', label: 'exit test', done: false, lines: [{ n: i + 1, text: line }] });
    }
  }
  return out;
}

/* ───────────────────────────────────────────────────────── class A — commands that no longer exist */

/**
 * Greedy token, then strip, then test both forms. See the matcher note in the file header.
 *
 * Placeholders (`npm run <x>`, `npm run test:pb-*`) are skipped — otherwise the rulebook's own
 * syntax examples become findings. See `isPlaceholder` for why that test is not simply "does the
 * raw token contain `<`, `>` or `*`".
 *
 * `known.has(raw)` is defensive rather than load-bearing: measured 2026-08-26, none of
 * pp-workspace's 843 scripts nor pp-shopify-theme's 103 end in a non-alphanumeric character, so
 * today the cleaned form alone would answer identically. It costs one comparison and it is the only
 * guard against a legitimately odd script name, so it stays — and the test pins it with a fixture,
 * because a first mutation run showed that deleting it broke nothing visible.
 *
 * @param {string} text
 * @param {Set<string>|string[]} knownScripts names from `package.json`
 */
/**
 * Is this a syntax example rather than a command?
 *
 * THE OBVIOUS TEST IS WRONG, AND IT COST A REAL FINDING.
 *
 * The first version asked whether the RAW token contained `<`, `>` or `*`. Raw includes the
 * trailing punctuation, so a command wrapped in markdown emphasis —
 *
 *     *"we ran `npm run agent:pp37982-content-soak`"*
 *
 * — produced the raw token ``agent:pp37982-content-soak`"*``, which contains `*`, and was silently
 * skipped. A FALSE NEGATIVE, and the worst kind: a checker reporting nothing looks exactly like a
 * clean repository. Found on 2026-08-26 by writing that exact sentence into a log entry and noticing
 * the count did not move.
 *
 * So the two cases are separated instead of being conflated by one character class:
 *
 *   - a PLACEHOLDER NAME (`<x>`) still has its brackets after trailing punctuation comes off, so
 *     the cleaned form is what gets tested;
 *   - a GLOB (`test:pb-*`) loses its `*` to the strip, so it is recognised by its shape — a `*`
 *     immediately after a name separator, which is what a family of scripts looks like and what a
 *     quotation mark before a `*` never is.
 *
 * @param {string} raw the token exactly as it appeared
 * @param {string} cleaned the same token with trailing non-alphanumerics removed
 */
export function isPlaceholder(raw, cleaned) {
  if (/[<>*]/.test(cleaned)) return true;
  return /[-:/]\*/.test(raw);
}

export function findDeadCommands(text, knownScripts) {
  const known = knownScripts instanceof Set ? knownScripts : new Set(knownScripts);
  const lines = text.split('\n');
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/npm run (\S+)/g)) {
      const raw = m[1];
      const cleaned = raw.replace(/[^A-Za-z0-9]+$/, '');
      if (!cleaned) continue;
      if (isPlaceholder(raw, cleaned)) continue;
      if (known.has(raw) || known.has(cleaned)) continue;
      findings.push({
        klass: 'A',
        line: i + 1,
        command: cleaned,
        raw,
        annotation: annotationOf(lines[i]),
        text: lines[i].trim(),
      });
    }
  }
  return findings;
}

/* ────────────────────────────────────────────── class B — checks that no longer run on a pull request */

/**
 * Phrases that turn a mention of a workflow into a CLAIM that it runs at pull-request time.
 *
 * Deliberately narrow. An early draft included a bare `\bPRs?\b`, which matched the `pr` inside
 * `stale-green-pr-watch.yml` and flagged the file that named it. A claim has to be stated, not
 * merely adjacent.
 */
/**
 * A line that RECORDS a claim which used to be true, and names what made it false.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A MUTE BUTTON.
 *
 * `PROOF-3`'s scope says the baseline runs on `pull_request` as a required status check. That was
 * true on 2026-08-08 and false after WORKFLOW-P36 demoted the workflow. The obvious fix — bolt a
 * correction on afterwards — leaves the false sentence sitting there in the present tense for
 * anyone skimming, and still trips this checker, because the words `pull_request` are still an
 * assertion. The other obvious fix, deleting the line, falsifies the record of what PROOF-3 shipped.
 *
 * So a document gets what AFKF-18b gave a HOLD: prose becomes a MACHINE-READABLE TAG.
 *
 *     <!-- docs-stale: superseded by WORKFLOW-P36 -->
 *
 * A reference is REQUIRED — `superseded` on its own suppresses nothing. That is the difference
 * between an acknowledgement and a mute button: every marker names the change that made the line
 * historical, `grep -rn "docs-stale: superseded" docs/` lists all of them in one command, and each
 * one can be checked against the slice it names. Marked lines are COUNTED AND LISTED in the report,
 * never silently dropped, for the same reason a ratchet prints its baseline every run.
 *
 * Tense is handled without a marker where the words allow it: `runs? on ... PR` matches "run" and
 * "runs" and deliberately not "ran", so a scope line rewritten into the past tense clears on its own.
 * `pull_request` is tense-free, which is exactly when the marker earns its keep.
 *
 * TWO VERBS, ONE QUESTION. The question a marker answers is always "is this line an assertion about
 * THIS repo now, or a reference to somewhere else?" — and there are exactly two somewheres:
 *
 *   superseded <ref>   another TIME. The claim was true and a named change made it false.
 *   elsewhere <repo>   another REPO. The command is real, it just does not live here.
 *
 * `elsewhere` was not designed up front; the theme repo asked for it on the checker's first run
 * there. `pbpf-master.md`'s PBPF-5 is an OPEN slice whose exit checklist names `npm run test:pbpf-1`,
 * `test:tsc-ratchet` and two `deploy:` commands — all four real, all four in `pp-workspace`, none of
 * them in this repo's `package.json`. The finding is correct and the fix is to say which repo, but
 * saying it in prose does not make it checkable: the command name is still there. So the repo gets
 * named in a form a machine reads.
 *
 * Deliberately NOT solved by reading the sibling repo's `package.json`: that file is present in a
 * multi-repo session and absent in CI, so the same commit would pass in one venue and fail in the
 * other. A check whose answer depends on what happens to be checked out is worse than either answer.
 */
/**
 * THE MARKER MUST TERMINATE THE LINE IT ANNOTATES, and that is not stylistic.
 *
 * Without the end-of-line anchor, a line that merely DESCRIBES the syntax counts as using it. That
 * is not hypothetical either: the `WORKFLOW-P39` log entry documenting this very mechanism contains
 * the words `docs-stale: superseded by X` mid-sentence, and it silently annotated — and therefore
 * suppressed — a real finding on its own line. A mute button that installs itself by being written
 * about is the worst possible version of this feature.
 *
 * A trailing table-cell `|` is allowed, because a marker inside a markdown table row has nowhere
 * else to go — `proof-master.md`'s inheritance table is exactly that case.
 */
const MARKER = /<!--\s*docs-stale:\s*(superseded|elsewhere)\s+(?:by\s+|in\s+)?([^\n>]*?)\s*-->\s*\|?\s*$/i;

/**
 * The annotation on a line, or `null` when there is no usable one.
 *
 * A reference is REQUIRED. `superseded` on its own suppresses nothing — that is the difference
 * between an acknowledgement and a mute button.
 *
 * @param {string} line
 * @returns {{ verb: 'superseded'|'elsewhere', ref: string } | null}
 */
export function annotationOf(line) {
  const m = MARKER.exec(line);
  if (!m) return null;
  const ref = m[2]?.trim();
  if (!ref || !/[A-Za-z0-9]/.test(ref)) return null;
  return { verb: m[1].toLowerCase(), ref };
}

/**
 * Backwards-compatible reader for the `superseded` verb alone.
 *
 * @param {string} line
 */
export function supersededBy(line) {
  const a = annotationOf(line);
  return a && a.verb === 'superseded' ? a.ref : null;
}

const PR_CLAIM =
  /\bpull_request\b|\bon (?:every|each|any) (?:PR|pull request)\b|\bevery (?:PR|pull request)\b|\bon (?:a|each|any) (?:\S+ )?(?:PR|pull request)\b|\brequired (?:status )?check\b|\bruns? on .{0,24}\bPR\b|\bblocks? (?:the )?merge\b/i;

/**
 * A live instruction naming a check that GitHub will never report on a PR again.
 *
 * Both halves are required: the workflow token AND the pull-request claim, on the same line. A
 * slice block may legitimately mention `proof baseline` while describing a hand-dispatch; only a
 * line that says it happens on a PR is asserting something now false.
 *
 * @param {string} text
 * @param {ReturnType<typeof workflowTokens>} tokens
 */
export function findDemotedChecks(text, tokens) {
  const findings = [];
  for (const region of scanRegions(text)) {
    for (const { n, text: line } of region.lines) {
      if (!PR_CLAIM.test(line)) continue;
      const lower = line.toLowerCase();
      const hits = tokens.filter((t) => !t.runsOnPr && lower.includes(t.key));
      if (!hits.length) continue;
      // One finding per line: the line is the assertion, however many names it happens to list.
      findings.push({
        klass: 'B',
        line: n,
        region: `${region.kind} ${region.label}`,
        checks: [...new Set(hits.map((h) => h.token))],
        workflows: [...new Set(hits.map((h) => h.file))],
        annotation: annotationOf(line),
        text: line.trim(),
      });
    }
  }
  return findings;
}

/* ───────────────────────────────────────────────────────────── class C — a HOLD with no machine gate */

/**
 * A `HOLD:` with no `HOLD_UNTIL:` — prose alone, which is what launched AFKF-18 six days early.
 *
 * `parseHoldTag` is IMPORTED from `afkf-hold.mjs`, not re-implemented. A second parser for the same
 * tag is how the two copies drift apart and one of them starts reading a hold as clear — the exact
 * shape of failure this whole file exists to catch. `npm run afkf:hold-check` evaluates the gates
 * against live evidence; this only asks the cheaper, offline question: is there a gate at all?
 *
 * @param {string} text
 */
export function findUngatedHolds(text) {
  const findings = [];
  for (const region of scanRegions(text)) {
    if (region.kind !== 'slice') continue;
    const blockText = region.lines.map((l) => l.text).join('\n');
    const hold = parseHoldTag(blockText);
    if (!hold || hold.gate) continue;
    const holdLine = region.lines.find((l) => /^HOLD:/i.test(l.text.trim()));
    const text = (holdLine?.text ?? `HOLD: ${hold.prose}`).trim();
    findings.push({
      klass: 'C',
      line: holdLine?.n ?? region.lines[0]?.n ?? 1,
      slice: region.label,
      annotation: annotationOf(text),
      text,
    });
  }
  return findings;
}

/* ──────────────────────────────────────────────────────────────────────────────────────── assembly */

/**
 * Every finding in one document, with the programme status that decides its severity.
 *
 * @param {{ name: string, text: string, knownScripts: Set<string>, tokens: any[] }} input
 */
export function checkDoc({ name, text, knownScripts, tokens }) {
  const { status, activeSlice } = programmeStatus(text);
  const historical = historicalLines(scanRegions(text));
  const findings = [
    ...findDeadCommands(text, knownScripts),
    ...findDemotedChecks(text, tokens),
    ...findUngatedHolds(text),
  ]
    .map((f) => ({ ...f, historical: historical.has(f.line) }))
    .sort((a, b) => a.line - b.line);
  return { doc: name, status, activeSlice, findings };
}

/**
 * Every line number that sits inside a slice section its own heading marks as finished.
 *
 * A Set of line numbers rather than a range test, because the three finders each report a line and
 * none of them knows which region it came from — keeping it that way lets each finder stay a small
 * pure function over text.
 *
 * @param {ReturnType<typeof scanRegions>} regions
 */
export function historicalLines(regions) {
  const out = new Set();
  for (const r of regions) {
    if (!r.done) continue;
    for (const l of r.lines) out.add(l.n);
  }
  return out;
}

/**
 * REPO-LOCAL acceptances: findings this repository has looked at and consciously not fixed yet.
 *
 * THE RULE IS THE RATCHET'S RULE, AND IT IS NOT A SUPPRESSION LIST.
 *
 * `docs/projects/.docs-stale-accepted.json` is repo data, never kit-owned — the kit ships the
 * mechanism, each repo owns its own entries, the same split the manifest already makes between
 * `hash` and `seed`. An entry must carry a REASON and the WORK IT IS WAITING ON. Entries are listed
 * on every run, exactly as `tsc-ratchet` prints its baseline every run: a number you stop seeing is
 * a number that stops meaning anything.
 *
 * WHY IT EXISTS AT ALL, stated so the next reader can judge it rather than inherit it. AFKF-22
 * carries a `HOLD:` with no `HOLD_UNTIL:` gate, which class C correctly reports. The honest fix is a
 * gate — but a gate is a promise that something is MEASURED EVERY DAY (`afkf-hold.mjs`), and what
 * AFKF-22 is waiting on, "zero manual cold starts in seven days", is recorded by nothing: neither
 * `ralph-chain-launch.mjs` nor `mc-opener.mjs` writes an event, checked 2026-08-26. Naming a gate
 * with no recorder would move the failure rather than remove it, and would leave AFKF-22 held
 * forever on evidence that can never arrive — which its own HOLD calls "the one removal that turns a
 * stall into an unrecoverable one". So the finding stays visible and stays unfixed, on the record,
 * until the recorder is built.
 *
 * An entry matching nothing is REPORTED, never failed — someone fixing the thing must not turn the
 * build red. Same direction as the ratchet: lower always passes and is reported.
 *
 * @param {string} root
 */
export function acceptedOf(root) {
  const file = join(root, 'docs', 'projects', '.docs-stale-accepted.json');
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed.accepted) ? parsed.accepted : [];
  } catch {
    return [];
  }
}

/**
 * Does this acceptance entry describe this finding?
 *
 * Matched on `doc` + `klass` + `key`, deliberately NOT on a line number: documents grow, line
 * numbers move, and an acceptance that drifts onto a different finding is worse than none.
 *
 * @param {{doc?:string,klass?:string,key?:string}} entry
 * @param {{doc:string,klass:string,slice?:string,command?:string,checks?:string[]}} finding
 */
export function acceptanceMatches(entry, finding) {
  if (entry?.doc !== finding.doc || entry?.klass !== finding.klass) return false;
  const key = finding.klass === 'A' ? finding.command : finding.klass === 'C' ? finding.slice : (finding.checks ?? []).join(',');
  return entry?.key === key;
}

/** Package.json script names, or an empty set when there is no package.json. */
export function knownScriptsOf(root) {
  const file = join(root, 'package.json');
  if (!existsSync(file)) return new Set();
  try {
    return new Set(Object.keys(JSON.parse(readFileSync(file, 'utf8')).scripts ?? {}));
  } catch {
    return new Set();
  }
}

/**
 * Scan a repo. Pure enough to test: everything it reads is named by `root`.
 *
 * @param {string} root
 */
export function scanRepo(root) {
  const dir = join(root, 'docs', 'projects');
  const workflows = readWorkflows(root);
  const tokens = workflowTokens(workflows);
  const knownScripts = knownScriptsOf(root);
  const accepted = acceptedOf(root);
  if (!existsSync(dir)) {
    return { root, docs: [], workflows: workflows.length, accepted, noDocsDir: true };
  }
  const docs = readdirSync(dir)
    .filter((f) => f.endsWith('-master.md'))
    .sort()
    .map((f) => checkDoc({ name: f, text: readFileSync(join(dir, f), 'utf8'), knownScripts, tokens }));
  return { root, docs, workflows: workflows.length, accepted, noDocsDir: false };
}

/** Split findings by the severity their programme's status gives them. */
export function partition(docs, accepted = []) {
  const open = [];
  const other = [];
  const acknowledged = [];
  const acceptedHits = [];
  const usedEntries = new Set();
  for (const d of docs) {
    for (const raw of d.findings) {
      const f = { ...raw, doc: d.doc };
      if (f.annotation) {
        acknowledged.push({ ...f, status: d.status, activeSlice: d.activeSlice });
        continue;
      }
      const entry = accepted.find((e) => acceptanceMatches(e, f));
      if (entry) {
        usedEntries.add(entry);
        acceptedHits.push({ ...f, status: d.status, activeSlice: d.activeSlice, accepted: entry });
        continue;
      }
      const live = d.status === 'open' && !f.historical;
      (live ? open : other).push({
        ...f,
        status: f.historical && d.status === 'open' ? 'open · finished slice' : d.status,
        activeSlice: d.activeSlice,
      });
    }
  }
  return { open, other, acknowledged, accepted: acceptedHits, unusedAcceptances: accepted.filter((e) => !usedEntries.has(e)) };
}

const LABEL = {
  A: 'command no longer in package.json',
  B: 'check no longer runs on a pull request',
  C: 'HOLD with no machine-readable HOLD_UNTIL gate',
};

function describe(f) {
  if (f.klass === 'A') return `\`npm run ${f.command}\` — ${LABEL.A}`;
  if (f.klass === 'B') return `${f.checks.join(', ')} — ${LABEL.B} (${f.workflows.join(', ')})`;
  return `${f.slice} — ${LABEL.C}`;
}

function main() {
  const argv = process.argv.slice(2);
  const rootIdx = argv.indexOf('--root');
  const root = rootIdx === -1 ? DEFAULT_ROOT : resolve(argv[rootIdx + 1]);
  const asJson = argv.includes('--json');
  const strict = argv.includes('--strict');

  const result = scanRepo(root);

  if (result.noDocsDir) {
    if (asJson) console.log(JSON.stringify({ ...result, open: [], other: [] }, null, 2));
    else console.log(`docs:stale — no docs/projects/ under ${root}. Nothing to check.`);
    process.exit(0);
  }

  const { open, other, acknowledged, accepted, unusedAcceptances } = partition(result.docs, result.accepted);
  const counts = (list) => ({
    A: list.filter((f) => f.klass === 'A').length,
    B: list.filter((f) => f.klass === 'B').length,
    C: list.filter((f) => f.klass === 'C').length,
  });

  if (asJson) {
    console.log(
      JSON.stringify(
        { root, docs: result.docs.length, open, other, acknowledged, accepted, unusedAcceptances, counts: { open: counts(open), other: counts(other), acknowledged: counts(acknowledged), accepted: counts(accepted) } },
        null,
        2,
      ),
    );
    process.exit(open.length || (strict && other.length) ? 1 : 0);
  }

  const byStatus = (s) => result.docs.filter((d) => d.status === s).length;
  console.log(`docs:stale — ${result.docs.length} master doc(s) under ${root}`);
  console.log(
    `  ${byStatus('open')} open · ${byStatus('closed')} closed · ${byStatus('unknown')} no dashboard · ${result.workflows} workflow(s) read`,
  );

  if (open.length) {
    const c = counts(open);
    console.log(`\nSTALE IN AN OPEN PROGRAMME — ${open.length} finding(s) (A:${c.A} B:${c.B} C:${c.C})`);
    console.log('These are live instructions that are no longer true. Fix them.\n');
    for (const f of open) {
      console.log(`  ${f.doc}:${f.line}  [${f.activeSlice}]`);
      console.log(`    ${describe(f)}`);
      console.log(`    ${f.text.slice(0, 160)}${f.text.length > 160 ? '…' : ''}`);
    }
  } else {
    console.log('\nOK: no open programme asserts anything that is no longer true.');
  }

  if (other.length) {
    const c = counts(other);
    console.log(`\nCLOSED / NO-DASHBOARD — ${other.length} finding(s) (A:${c.A} B:${c.B} C:${c.C}), reported only.`);
    console.log('A closed programme is a historical record. "We ran X" stays true even after X is deleted.');
    console.log('Do not "fix" these — rewriting them falsifies the record.\n');
    for (const f of other) console.log(`  ${f.doc}:${f.line}  (${f.status})  ${describe(f)}`);
  }

  if (acknowledged.length) {
    console.log(`\nANNOTATED — ${acknowledged.length} line(s) marked, each naming another time or another repo.`);
    console.log('Listed every run on purpose: an acknowledgement nobody re-reads becomes a mute button.\n');
    for (const f of acknowledged) console.log(`  ${f.doc}:${f.line}  ${describe(f)}  → ${f.annotation.verb} ${f.annotation.ref}`);
  }

  if (accepted.length) {
    console.log(`\nACCEPTED, STILL OPEN — ${accepted.length} finding(s) this repo has looked at and not fixed yet.`);
    console.log('Printed every run, like a ratchet baseline. Delete the entry when the work lands.\n');
    for (const f of accepted) {
      console.log(`  ${f.doc}:${f.line}  ${describe(f)}`);
      console.log(`    why not fixed: ${f.accepted.reason}`);
      if (f.accepted.needs) console.log(`    needs: ${f.accepted.needs}`);
    }
  }
  if (unusedAcceptances.length) {
    console.log(`\n${unusedAcceptances.length} acceptance entry/entries no longer match anything — delete them:`);
    for (const e of unusedAcceptances) console.log(`  ${e.doc} [${e.klass}] ${e.key}`);
  }

  const failed = open.length || (strict && other.length);
  if (failed) {
    console.log(`\nFAIL: ${open.length} open-programme finding(s)${strict ? ` + ${other.length} in --strict mode` : ''}.`);
    process.exit(1);
  }
  console.log('\nPASS');
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
