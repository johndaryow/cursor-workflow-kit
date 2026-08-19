#!/usr/bin/env node
/**
 * WORKFLOW-P26 — tests for the `create_session` repository guard.
 *
 * Two halves, and both matter:
 *
 *  1. Unit assertions on the extractor, so a future "simplification" that turns the
 *     balanced-paren scan back into a regex is caught rather than silently narrowing what
 *     the guard can see.
 *  2. A scan of the REAL repository. This is the assertion with teeth: if anyone deletes
 *     `source_url` from a rule or a skill, or writes a new snippet without it, this fails.
 *     It already earned its keep — on its first run it found the Cursor twin of the rule,
 *     `.cursor/rules/planning-chain-handoff.mdc`, still carrying the pre-P25 snippet.
 */
import assert from 'node:assert/strict';
import {
  extractCreateSessionCalls,
  violationsInSource,
  scanRepo,
  filesToScan,
  REQUIRED_FIELD,
} from './create-session-source-url-guard.mjs';

// ---- the real repository must be clean --------------------------------------
const live = scanRepo();
assert.equal(
  live.violations.length,
  0,
  `create_session call(s) without ${REQUIRED_FIELD}:\n` +
    live.violations.map((v) => `  ${v.file}:${v.line}`).join('\n') +
    '\nA session created without it opens with an empty working directory.',
);
assert.ok(live.calls >= 2, 'the guard must actually be finding the known snippets, not scanning nothing');
assert.ok(filesToScan().length > 100, 'the scan must reach the rules, skills and scripts trees');

// Both twins of the hand-off rule carry the field — they drift by hand, so both are checked.
assert.equal(violationsInSource('x', 'x').length, 0);
for (const twin of ['.claude/rules/planning-chain-handoff.md', '.cursor/rules/planning-chain-handoff.mdc']) {
  assert.ok(
    filesToScan().some((f) => f.endsWith(twin.replace(/^\./, '.'))),
    `${twin} must be inside the scanned tree`,
  );
}

// ---- a call with no source_url is a violation -------------------------------
const bad = `
mcp__Claude_Code_Remote__create_session({
  title: "X",
  prompt: "go",
  tags: ["planning-chain"],
})
`;
assert.equal(violationsInSource(bad, 'bad.md').length, 1, 'a call with no source_url must fail');
assert.equal(violationsInSource(bad, 'bad.md')[0].line, 2);

const good = bad.replace('tags:', 'source_url: "https://github.com/o/r",\n  tags:');
assert.equal(violationsInSource(good, 'good.md').length, 0, 'the same call with source_url must pass');

// ---- nested objects must not truncate the argument text ---------------------
// A regex stopping at the first `)` would miss a source_url that comes after a nested call,
// and report a false failure — or stop early and miss a real one.
const nested = `create_session({ opts: fn({ a: 1 }), source_url: "https://github.com/o/r" })`;
assert.equal(violationsInSource(nested, 'n.md').length, 0);
assert.equal(extractCreateSessionCalls(nested).length, 1);
assert.match(extractCreateSessionCalls(nested)[0].args, /source_url/);

// ---- prose mentions are not calls -------------------------------------------
// The three planning skills reference the tool by name in a sentence. Forcing them to
// inline a code block to say so would be noise, and noise is what makes a guard get muted.
const prose = 'Offer to start the next session with `create_session` (ask once per conversation).';
assert.equal(extractCreateSessionCalls(prose).length, 0, 'a bare mention is prose, not a call');
assert.equal(violationsInSource(prose, 'skill.md').length, 0);

// ---- several calls in one file are each judged ------------------------------
const two = `create_session({ a: 1 })\ncreate_session({ source_url: "u" })\n`;
assert.equal(extractCreateSessionCalls(two).length, 2);
assert.equal(violationsInSource(two, 'two.md').length, 1);
assert.equal(violationsInSource(two, 'two.md')[0].line, 1);

console.log('create-session-source-url-guard.test.mjs: all PASS');
