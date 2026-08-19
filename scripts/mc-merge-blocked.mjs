#!/usr/bin/env node
/**
 * WORKFLOW-P22 — an agent that cannot merge must say so where a human will see it.
 *
 * WHY. On 2026-08-16 the failure was not that FCN-5 could not merge. It was that nothing
 * anywhere recorded that it could not. The PR was simply left open. `npm run mc:status`
 * showed `BLOCKED_BY: none` and an empty queue, so the chain looked idle rather than stuck,
 * and the CEO reasonably concluded his routines had stopped working. An hour went by.
 *
 * A silent failure costs more than a loud one. This writes the fact into the STATUS
 * dashboard's `BLOCKED_BY` — the field the planner already refuses to chain past, and the
 * first thing `mc:status` prints — and hands back the exact SESSION REPORT lines to use.
 *
 * Usage:
 *   npm run mc:merge-blocked -- --program workflow --pr 1734 --reason "no merge credential in this venue"
 *   npm run mc:merge-blocked -- --doc docs/projects/fcn-master.md --pr 1734 --reason "..." --dry-run
 *   npm run mc:merge-blocked -- --program workflow --clear      # after the merge lands
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/**
 * Rewrite the `BLOCKED_BY:` line inside the STATUS DASHBOARD block, and nowhere else — the
 * string appears in prose and in worked examples further down these docs, and rewriting one
 * of those would corrupt the file while looking like it worked.
 *
 * @param {string} text  the whole master doc
 * @param {string} reason  the new value (`none` clears the block)
 * @returns {{ text: string, changed: boolean, previous: string|null }}
 */
export function applyBlockedBy(text, reason) {
  const dashStart = text.indexOf('## STATUS DASHBOARD');
  if (dashStart === -1) return { text, changed: false, previous: null };

  /** The dashboard is a fenced block; stay inside it. */
  const fenceStart = text.indexOf('```', dashStart);
  const fenceEnd = fenceStart === -1 ? -1 : text.indexOf('```', fenceStart + 3);
  if (fenceStart === -1 || fenceEnd === -1) return { text, changed: false, previous: null };

  const block = text.slice(fenceStart, fenceEnd);
  const match = /^BLOCKED_BY:[ \t]*(.*)$/m.exec(block);
  if (!match) return { text, changed: false, previous: null };

  const previous = match[1].trim();
  if (previous === reason) return { text, changed: false, previous };

  const updated = block.replace(/^BLOCKED_BY:[ \t]*.*$/m, `BLOCKED_BY: ${reason}`);
  return { text: text.slice(0, fenceStart) + updated + text.slice(fenceEnd), changed: true, previous };
}

/** Same program aliases `mc:status` accepts, so the two are never out of step. */
export function docPathForProgram(program) {
  if (program.endsWith('.md')) return resolve(root, program);
  return resolve(root, `docs/projects/${program}-master.md`);
}

function parseArgs(argv) {
  const out = { dryRun: false, clear: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--program') out.program = argv[++i];
    else if (a === '--doc') out.doc = argv[++i];
    else if (a === '--pr') out.pr = argv[++i];
    else if (a === '--reason') out.reason = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--clear') out.clear = true;
  }
  return out;
}

const isDirectRun = Boolean(process.argv[1]) && process.argv[1].endsWith('mc-merge-blocked.mjs');

if (isDirectRun) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.program && !args.doc) {
    console.error('Usage: npm run mc:merge-blocked -- --program <name> --pr <n> --reason "<why>"');
    process.exit(1);
  }
  if (!args.clear && (!args.pr || !args.reason)) {
    console.error('Both --pr and --reason are required (or pass --clear).');
    process.exit(1);
  }

  const docPath = args.doc ? resolve(root, args.doc) : docPathForProgram(args.program);
  let text;
  try {
    text = readFileSync(docPath, 'utf8');
  } catch {
    console.error(`FAIL: could not read ${docPath}`);
    process.exit(1);
  }

  const reason = args.clear ? 'none' : `PR #${args.pr} needs a merge — ${args.reason}`;
  const result = applyBlockedBy(text, reason);

  if (!result.changed) {
    console.log(`No change — BLOCKED_BY is already "${result.previous ?? '(not found)'}".`);
    process.exit(result.previous === null ? 1 : 0);
  }

  if (args.dryRun) {
    console.log(`DRY RUN — would set BLOCKED_BY in ${docPath}`);
  } else {
    writeFileSync(docPath, result.text);
    console.log(`Wrote BLOCKED_BY into ${docPath}`);
  }
  console.log(`  was: ${result.previous}`);
  console.log(`  now: ${reason}`);

  if (!args.clear) {
    console.log('\nPut these lines in the SESSION REPORT — do not leave the PR open in silence:\n');
    console.log('Merge:');
    console.log(`- PR #${args.pr}: BLOCKED — ${args.reason}`);
    console.log('');
    console.log('CEO action needed:');
    console.log(`- Merge PR #${args.pr} — the work is finished and green, only the merge is stuck.`);
  }
  process.exit(0);
}
