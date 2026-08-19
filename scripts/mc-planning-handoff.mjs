#!/usr/bin/env node
/**
 * WORKFLOW-P23 — the planning chain hands itself off.
 *
 * WHY THIS EXISTS. The chain grill → PRD → slices → execution is four sessions, and until now
 * the CEO carried the baton between them by hand: compose a prompt, remember which step comes
 * next, remember which doc it reads, and — the part that actually bit — remember whether the
 * previous step's PR had merged yet. Pasting a slice-planning prompt against a PRD that is still
 * sitting in an open PR produces a session that plans from a document it cannot see.
 *
 * So the step is derived, never remembered. The master doc's STATUS DASHBOARD already records
 * where a program is, in three lines that every planning session writes:
 *
 *   GRILL:   ✅ … | ⛔ …
 *   PRD:     ✅ … | ⛔ …
 *   SLICING: ✅ … | ⛔ …
 *
 * First one that is not ✅ is the next step. This prints the prompt for it, verbatim, ready to
 * paste — or ready for an agent to hand to `create_session` without a human in the middle.
 *
 * It also refuses to hand off across an unmerged PR: if the doc the next session must read is
 * not on `origin/main` yet, that is the answer, and it says so instead of printing a prompt
 * that would fail.
 *
 * Usage:
 *   npm run mc:handoff -- <program>            # print the next planning prompt
 *   npm run mc:handoff -- <program> --json     # same, machine-readable (for create_session)
 *
 * Exit 0 = a prompt was printed. Exit 1 = nothing to hand off, with the reason named.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/** Master doc path for a program code, matching mc-opener.mjs. */
export function masterDocRelPath(program) {
  const p = String(program || '').toLowerCase();
  if (p === 'platform') return 'docs/projects/platform-migration-master.md';
  return `docs/projects/${p}-master.md`;
}

/** Pull the STATUS DASHBOARD block out of a master doc. */
export function extractDashboard(masterText) {
  const start = masterText.indexOf('## STATUS DASHBOARD');
  if (start === -1) return '';
  const end = masterText.indexOf('\n---', start);
  return masterText.slice(start, end === -1 ? undefined : end);
}

/** A dashboard line counts as done only when it actually carries ✅. */
export function stepDone(dashboardText, key) {
  const line = dashboardText.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1] ?? '';
  return line.includes('✅');
}

/**
 * Which planning step is next.
 * Pure so the decision is testable without a repo, a git remote, or a doc on disk.
 */
export function decideNextStep({ grillDone, prdDone, slicingDone }) {
  if (!grillDone) return 'grill';
  if (!prdDone) return 'prd';
  if (!slicingDone) return 'slicing';
  return 'execution';
}

const STEP_META = {
  grill: {
    skill: 'grill-me',
    reads: null,
    label: 'Grill — alignment interview, one question at a time',
  },
  prd: {
    skill: 'planning-session',
    reads: null, // resolved from the grill artefact named in the dashboard
    label: 'PRD — the destination document, no slices',
  },
  slicing: {
    skill: 'slice-planning',
    reads: 'prd',
    label: 'Slices — vertical tracer bullets, tags, §12 prompts',
  },
  execution: {
    skill: 'afk-slice',
    reads: null,
    label: 'Execution — run the first queued slice',
  },
};

/** The path a dashboard line points at, e.g. `PRD: ✅ docs/projects/foo-prd.md — …`. */
export function docPathFromLine(dashboardText, key) {
  const line = dashboardText.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1] ?? '';
  return line.match(/(docs\/[^\s)]+\.md)/)?.[1] ?? '';
}

/** Is this path already on origin/main? An unmerged doc cannot be handed to a fresh session. */
function isOnMain(relPath) {
  const res = spawnSync('git', ['cat-file', '-e', `origin/main:${relPath}`], { cwd: root });
  return res.status === 0;
}

/**
 * Is the working copy of the master doc the same as the one on origin/main?
 *
 * This tool exists to stop stale-state mistakes, so it must not make one. Read the dashboard
 * from a checkout that predates a merge and it will confidently name a step that is already
 * done — observed 2026-08-16, when a local tree two commits behind reported COURSES as needing
 * slices that had merged twenty minutes earlier. Returns null when the comparison itself
 * cannot be made, which is reported rather than treated as agreement.
 */
export function masterDocMatchesMain(relPath) {
  const res = spawnSync('git', ['diff', '--quiet', 'origin/main', '--', relPath], { cwd: root });
  if (res.status === 0) return true;
  if (res.status === 1) return false;
  return null;
}

function fail(message, hint) {
  console.error(`NO HANDOFF: ${message}`);
  if (hint) console.error(hint);
  process.exit(1);
}

const isDirectRun = Boolean(process.argv[1]) && process.argv[1].endsWith('mc-planning-handoff.mjs');
if (!isDirectRun) {
  // imported for tests — nothing runs
} else {
  const args = process.argv.slice(2).filter((a) => a !== '--json');
  const asJson = process.argv.includes('--json');
  const program = args[0];

  if (!program) fail('no program given.', 'Usage: npm run mc:handoff -- <program> [--json]');

  const masterRel = masterDocRelPath(program);
  const masterAbs = resolve(root, masterRel);
  if (!existsSync(masterAbs)) {
    fail(`no master doc at ${masterRel}.`, 'A program needs a master doc before it can hand off.');
  }

  const matchesMain = masterDocMatchesMain(masterRel);
  if (matchesMain === false) {
    console.error(`STALE: your ${masterRel} differs from the one on origin/main.`);
    console.error('The step is read from that file, so a stale copy names a stale step.');
    console.error('Run `git fetch origin main` and check out main, then try again.');
    process.exit(1);
  }
  if (matchesMain === null) {
    console.log(`NOTE: could not compare ${masterRel} against origin/main (no remote ref?).`);
    console.log('      Proceeding, but confirm the file is current before trusting the step.');
    console.log('');
  }

  const masterText = readFileSync(masterAbs, 'utf8');
  const dashboard = extractDashboard(masterText);
  if (!dashboard) fail(`${masterRel} has no ## STATUS DASHBOARD block.`);

  const step = decideNextStep({
    grillDone: stepDone(dashboard, 'GRILL'),
    prdDone: stepDone(dashboard, 'PRD'),
    slicingDone: stepDone(dashboard, 'SLICING'),
  });

  const CODE = String(program).toUpperCase();
  const meta = STEP_META[step];

  // Execution is not a planning step — mc:opener already owns that prompt.
  if (step === 'execution') {
    console.log(
      [
        `Planning is complete for ${CODE} — grill, PRD and slices are all ✅.`,
        '',
        'Next session is execution, not planning. Get its prompt from:',
        `  npm run mc:opener -- ${program.toLowerCase()}`,
      ].join('\n'),
    );
    process.exit(0);
  }

  // The gate that this script exists for: never hand off across an unmerged doc.
  const dependsOn = meta.reads ? docPathFromLine(dashboard, meta.reads.toUpperCase()) : '';
  if (dependsOn && !isOnMain(dependsOn)) {
    fail(
      `${dependsOn} is not on origin/main yet.`,
      [
        'The next session would read a document that does not exist on the branch it starts from.',
        'Merge the planning PR first, then run this again. (`git fetch origin main` if you just merged.)',
      ].join('\n'),
    );
  }

  const readsLine = dependsOn
    ? `Read ${dependsOn} in full before anything else.`
    : `Read ${masterRel} — the STATUS DASHBOARD and the locked decisions.`;

  const prompt = [
    `Run the /${meta.skill} skill.`,
    '',
    `Program: ${CODE}.`,
    '',
    readsLine,
    'Every decision already recorded there is settled and CEO-confirmed. Do not re-grill,',
    'do not re-open settled decisions, and do not re-derive what the document already states.',
    '',
    `Master doc: ${masterRel}`,
    '',
    'Honour the always-on rules: .claude/rules/workflow-core.md, ceo-communication.md,',
    'auto-merge-policy.md, planning-chain-handoff.md.',
    '',
    'End of session: update the STATUS DASHBOARD in the same PR, put the SESSION REPORT in the',
    'PR body, and close the loop yourself per planning-chain-handoff.md — merge when green and',
    'print the next handoff. Do not ask the CEO to paste prompts between sessions.',
  ].join('\n');

  if (asJson) {
    console.log(
      JSON.stringify(
        { program: CODE, step, skill: meta.skill, label: meta.label, masterDoc: masterRel, reads: dependsOn || null, prompt },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  console.log(`NEXT STEP: ${meta.label}`);
  console.log(`SKILL: /${meta.skill}`);
  console.log('');
  console.log('--- paste this into a fresh session ---');
  console.log(prompt);
  console.log('--- end ---');
}
