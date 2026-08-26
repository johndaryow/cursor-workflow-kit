#!/usr/bin/env node
/**
 * WORKFLOW-P26 — no `create_session` call in this repo may omit the repository.
 *
 * THE BUG THIS EXISTS TO END (measured 2026-08-18).
 *
 * A session created without `source_url` inherits the parent's *environment* but not its
 * repository. It opens with an empty working directory, and the prompt it was handed — which
 * opens with `npm run mc:status` — has no `package.json` to run, no master doc to read, and
 * no rules or skills to load. Nothing errors. The session looks alive and has nothing to
 * work on. That is what happened to LNP-1.
 *
 * WORKFLOW-P25 documented `source_url` in `docs/rules/planning-chain.md`. Docs are
 * not a guarantee: the next agent to tidy that snippet, or to write a new one in a different
 * skill, restores the failure and nothing notices. This guard is what notices.
 *
 * It reads every `create_session(...)` call SHAPE in the repo's own instructions and code —
 * prose mentions in backticks are not calls and are left alone — and fails any that does not
 * pass a repository.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '..');

/** Where instructions and code that could create a session live. */
export const SCAN_ROOTS = ['.claude', '.cursor', 'docs', 'scripts', 'AGENTS.md', 'CLAUDE.md'];

export const SCAN_EXTENSIONS = ['.md', '.mdc', '.mjs', '.js', '.ts', '.tsx', '.yml', '.yaml', '.json'];

/**
 * This guard and its test necessarily contain the very snippets they forbid, as examples.
 * Excluding them by exact path — not by a "looks like a test" pattern — keeps the hole one
 * line wide and visible.
 */
export const EXCLUDED = [
  'scripts/create-session-source-url-guard.mjs',
  'scripts/create-session-source-url-guard.test.mjs',
];

/** The field that attaches the repository. */
export const REQUIRED_FIELD = 'source_url';

/** @param {string} dir @param {string[]} out */
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

/** @param {string} root @returns {string[]} absolute paths */
export function filesToScan(root = REPO_ROOT) {
  const files = [];
  for (const entry of SCAN_ROOTS) {
    const full = resolve(root, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, files);
    else if (SCAN_EXTENSIONS.some((ext) => full.endsWith(ext))) files.push(full);
  }
  return files.filter((f) => !EXCLUDED.includes(relative(root, f)));
}

/**
 * Pull out every `create_session(` call shape, argument text included.
 *
 * Balanced-paren scan rather than a regex, so a nested object (which every real call has)
 * does not truncate the argument text and hide a `source_url` that IS there — or, worse,
 * let a missing one through because the scan stopped early.
 *
 * A bare mention (`create_session` with no opening paren) is prose, not a call, and is
 * deliberately not matched: the three planning skills reference the tool by name in a
 * sentence and must not be forced to inline a code block to say so.
 *
 * @param {string} source
 * @returns {{ index: number, line: number, args: string }[]}
 */
export function extractCreateSessionCalls(source) {
  const calls = [];
  const needle = 'create_session(';
  let from = 0;
  for (;;) {
    const at = source.indexOf(needle, from);
    if (at === -1) break;
    from = at + needle.length;

    let depth = 0;
    let end = at + needle.length - 1;
    for (let i = end; i < source.length; i++) {
      const ch = source[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
      end = i;
    }

    calls.push({
      index: at,
      line: source.slice(0, at).split('\n').length,
      args: source.slice(at + needle.length, end),
    });
  }
  return calls;
}

/**
 * @param {string} source
 * @param {string} label  repo-relative path, for the message
 * @returns {{ file: string, line: number, snippet: string }[]}
 */
export function violationsInSource(source, label) {
  return extractCreateSessionCalls(source)
    .filter((call) => !call.args.includes(REQUIRED_FIELD))
    .map((call) => ({
      file: label,
      line: call.line,
      snippet: call.args.trim().split('\n').slice(0, 6).join('\n'),
    }));
}

/** @param {string} root @returns {{ scanned: number, calls: number, violations: any[] }} */
export function scanRepo(root = REPO_ROOT) {
  const files = filesToScan(root);
  const violations = [];
  let calls = 0;
  for (const file of files) {
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!source.includes('create_session(')) continue;
    const label = relative(root, file);
    calls += extractCreateSessionCalls(source).length;
    violations.push(...violationsInSource(source, label));
  }
  return { scanned: files.length, calls, violations };
}

function main() {
  const result = scanRepo();

  console.log('# CREATE_SESSION SOURCE_URL GUARD\n');
  console.log(`Scanned ${result.scanned} file(s) · found ${result.calls} create_session call shape(s)`);

  if (result.violations.length === 0) {
    console.log(`\nEvery create_session call passes ${REQUIRED_FIELD}. PASS`);
    process.exit(0);
  }

  for (const v of result.violations) {
    console.error(`\nFAIL: ${v.file}:${v.line} — create_session with no ${REQUIRED_FIELD}`);
    console.error(v.snippet.replace(/^/gm, '    '));
  }
  console.error(
    `\nA session created without ${REQUIRED_FIELD} opens with an EMPTY working directory:` +
      '\nno package.json, no master doc, no rules, no skills. It does not error — it just wastes' +
      '\nthe run. Add `source_url: "https://github.com/<owner>/<repo>"` to each call above.',
  );
  process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('create-session-source-url-guard.mjs')) {
  main();
}
