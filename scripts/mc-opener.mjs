#!/usr/bin/env node
/**
 * WORKFLOW-P28 — the execution prompt is derived, never remembered, never "Continue".
 *
 * WHY THIS EXISTS. `planning-chain-handoff.md` already settled this for planning: a session
 * hands off by deriving the next prompt with `mc:handoff`, never by hand-writing it and never
 * by telling the CEO a magic word. Execution had the opposite habit — the rules told the CEO to
 * type "Continue", which does not say *which* program. The dashboards span 40+ of them, so
 * "Continue" is a guess dressed as an instruction. This script already knew the answer; the
 * rules just never made the agent print it.
 *
 * Two things it used to get wrong, both fixed here:
 *
 *   1. It printed one tool's rule paths at every caller, so the other tool read files it does not
 *      load. Since the rulebook collapsed to a single AGENTS.md this cannot happen: every tool is
 *      pointed at the same file.
 *   2. It printed `EXIT PLAN (Lane B): docs/projects/workers-exit-plan.md` for every program,
 *      including the ~40 that have nothing to do with the workers migration. A line that is
 *      wrong for most callers teaches the reader to skim the block. Exit plans are now
 *      per-program, and omitted when the program has none.
 *
 * "Continue" still works as a cold-start fallback — `agent-chat-session.md` still maps it. What
 * changed is that no agent may *offer* it when it can print this instead.
 *
 * Usage:
 *   npm run mc:opener -- <program>                  # print the next execution prompt
 *   npm run mc:opener -- <program> --agent=claude   # force a tool's rule paths
 *   npm run mc:opener -- <program> --json           # same, machine-readable (create_session)
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseDashboardFields } from './mc-chat-meta.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/**
 * One entry per agent. There is now **one** rulebook — `AGENTS.md` at the repo root — read by all
 * three, so nothing about rules differs per tool any more. What still differs is the session advice
 * and the branch prefix.
 */
export const RULEBOOK = 'AGENTS.md';

export const AGENT_PROFILES = {
  claude: {
    label: 'Claude Code',
    branchPrefix: 'claude',
    sessionLine:
      'Recommended: fresh Claude Code session · Opus for planning, Sonnet for AFK execution (agent-discipline skill)',
  },
  cursor: {
    label: 'Cursor',
    branchPrefix: 'cursor',
    sessionLine: 'Recommended: Composer 2.5 · Agent · new chat',
  },
  codex: {
    label: 'Codex',
    branchPrefix: 'codex',
    sessionLine: 'Recommended: a fresh Codex session',
  },
};

/**
 * Which agent is asking. Explicit flag wins, then an explicit env override, then the markers the
 * two tools set themselves. Unknown is a real answer — a human running this in a plain terminal
 * to paste somewhere gets both dialects rather than a coin flip.
 *
 * @returns {'claude'|'cursor'|'unknown'}
 */
export function detectAgent(env = process.env, argv = []) {
  const flagged = argv.map((a) => /^--agent=(.+)$/.exec(a)?.[1]).find(Boolean);
  const explicit = flagged ?? env.MC_OPENER_AGENT;
  if (explicit) {
    const key = String(explicit).trim().toLowerCase();
    if (!AGENT_PROFILES[key]) {
      throw new Error(
        `Unknown --agent "${explicit}". Use one of: ${Object.keys(AGENT_PROFILES).join(', ')}.`,
      );
    }
    return key;
  }
  const aiAgent = String(env.AI_AGENT ?? '');
  if (env.CLAUDECODE || env.CLAUDE_CODE_SESSION_ID || /claude/i.test(aiAgent)) return 'claude';
  if (env.CURSOR_AGENT || env.CURSOR_TRACE_ID || /cursor/i.test(aiAgent)) return 'cursor';
  if (env.CODEX_SANDBOX || env.CODEX_HOME || /codex/i.test(aiAgent)) return 'codex';
  return 'unknown';
}

/** The "Read and follow" block. One rulebook, so the answer no longer depends on the tool. */
export function rulesBlock() {
  return [
    'Read and follow:',
    `- ${RULEBOOK} — the always-on rulebook (Claude Code, Cursor and Codex alike)`,
    '- docs/rules/<topic>.md — on demand, via the index in §7 of that file',
  ].join('\n');
}

export function sessionLine(agent) {
  if (agent === 'unknown') {
    return 'Recommended: a fresh agent session (Cursor: Composer 2.5 · Agent · new chat)';
  }
  return AGENT_PROFILES[agent].sessionLine;
}

export function autoMergePolicyPath() {
  return 'docs/rules/merging.md';
}

/**
 * Programs that carry a companion plan doc worth naming in the opener. Everything else gets no
 * such line — a path that does not apply is noise, and noise is what makes a prompt get skimmed.
 */
export const PROGRAM_EXIT_PLANS = {
  platform: { rel: 'docs/projects/workers-exit-plan.md', label: 'EXIT PLAN (Lane B)' },
};

/**
 * @param {string} program
 * @param {(rel: string) => boolean} fileExists
 * @returns {string|null} the line to print, or null when this program has no exit plan
 */
export function exitPlanLine(program, fileExists) {
  const entry = PROGRAM_EXIT_PLANS[String(program).trim().toLowerCase()];
  if (!entry) return null;
  if (!fileExists(entry.rel)) return null;
  return `${entry.label}: ${entry.rel}`;
}

/** Master doc path for a program code, matching mc-planning-handoff.mjs. */
export function masterDocRelPath(program) {
  const key = String(program).trim().toLowerCase();
  if (key === 'workflow') return 'docs/projects/workflow-master.md';
  if (key === 'platform') return 'docs/projects/platform-migration-master.md';
  return `docs/projects/${key}-master.md`;
}

export function buildOpener({
  agent,
  program,
  chatRename,
  recommendedSlice,
  autonomy,
  masterRel,
  nextPrompt,
  exitPlan,
  hold = null,
}) {
  /**
   * AFKF-18b, ROUND TWO — THE COLD START IS THE ROUTE THE CEO ACTUALLY NAMED.
   *
   * The first version of the hold gate covered every AUTOMATED launcher: the chain, the queue, the
   * planning chain. It did not cover this one, and this one is the prompt a HUMAN pastes to start a
   * session — the literal "a session reading prose" the CEO asked to stop relying on. `mc:opener`
   * printed `Execute slice **AFKF-18**` with the hold nowhere in sight, and `.github/workflows/
   * mc-ralph.yml` runs it too.
   *
   * A held slice does not get an opener. It gets a refusal that names the slice, the reason, and
   * the command that answers "when?", because the next thing the reader needs is the next ready
   * slice, not an explanation of why this one is stuck.
   */
  if (hold?.held) {
    const heldSlice = hold.slice ?? recommendedSlice;
    return [
      `**Chat name:** ${chatRename}`,
      '',
      `**${heldSlice} is HELD — do not start it.**`,
      '',
      hold.reason,
      '',
      `MASTER DOC: ${masterRel}`,
      '',
      'A held slice is not a blocked chain. Take the next ready slice instead:',
      '  npm run afkf:chain-queue',
      '',
      'When can it start? The check answers, not a date in a document:',
      `  npm run afkf:hold-check -- ${heldSlice}`,
    ].join('\n');
  }

  return [
    `**Chat name:** ${chatRename}`,
    '',
    `Rename this chat to: ${chatRename}`,
    '',
    sessionLine(agent),
    '',
    rulesBlock(),
    '',
    `MASTER DOC: ${masterRel}`,
    ...(exitPlan ? [exitPlan] : []),
    `Run: npm run mc:status -- ${program}`,
    '',
    `Execute slice **${recommendedSlice}** — NEXT_PROMPT (${nextPrompt}) from the master doc.`,
    `AUTONOMY: ${autonomy} — use afk-slice skill if AFK.`,
    '',
    'First reply MUST print the Chat name line, then start preflight.',
    '',
    `End: update STATUS DASHBOARD in same PR, SESSION REPORT in PR body, auto-merge per ${autoMergePolicyPath()} when green.`,
    '',
    `Then hand off: run \`npm run mc:opener -- ${program}\` and put the prompt it prints in the`,
    'SESSION REPORT, so the next session starts from an exact prompt. Never end by telling the',
    'CEO to type "Continue" — it does not say which program.',
    '',
    'Do not ask CEO to paste prompts or MC reports to another chat.',
  ].join('\n');
}

const isDirectRun = Boolean(process.argv[1]) && process.argv[1].endsWith('mc-opener.mjs');

async function runOpener() {
  const argv = process.argv.slice(2);
  const program = argv.find((a) => !a.startsWith('-')) ?? 'platform';
  const wantsJson = argv.includes('--json');

  let agent;
  try {
    agent = detectAgent(process.env, argv);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const statusScript = resolve(__dirname, 'mc-status.mjs');
  const result = spawnSync('node', [statusScript, program], { encoding: 'utf8', cwd: root });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }

  const statusOut = result.stdout;
  const chatRename =
    statusOut.match(/^CHAT_RENAME:\s*(.+)$/m)?.[1]?.trim() ?? 'PLATFORM · migration slice';
  const recommendedSlice =
    statusOut.match(/^RECOMMENDED_SLICE:\s*(.+)$/m)?.[1]?.trim() ?? 'unknown';
  const autonomy = statusOut.match(/^AUTONOMY:\s*(.+)$/m)?.[1]?.trim() ?? 'unknown';

  const masterRel = masterDocRelPath(program);
  const masterText = readFileSync(resolve(root, masterRel), 'utf8');
  const dashboardStart = masterText.indexOf('## STATUS DASHBOARD');
  const dashboardEnd = masterText.indexOf('\n---', dashboardStart);
  const dashboard = masterText.slice(dashboardStart, dashboardEnd);
  const fields = parseDashboardFields(dashboard);
  const nextPrompt = fields.nextPrompt || '§12';

  /**
   * AFKF-18b — the verdict comes from `mc-status`, which this already spawned, rather than from a
   * second evaluation here.
   *
   * The first version re-derived it from `recommendedSlice` alone, and that is the field that was
   * wrong: `ACTIVE_SLICE` names a finished slice while the queue head is the held one. Two readers
   * of the same question is how they came to disagree, so there is one — `mc-status` checks every
   * slice its dashboard could hand over, prints the verdict, and this obeys the line.
   */
  const holdLine = statusOut.match(/^HOLD:\s*(.+)$/m)?.[1]?.trim() ?? 'none';
  const heldMatch = /^HELD\s+(\S+)\s+—\s+([\s\S]+)$/.exec(holdLine);
  const hold = heldMatch
    ? { held: true, slice: heldMatch[1], reason: heldMatch[2] }
    : { held: false, slice: null, reason: '' };

  const opener = buildOpener({
    agent,
    program,
    chatRename,
    recommendedSlice,
    autonomy,
    masterRel,
    nextPrompt,
    exitPlan: exitPlanLine(program, (rel) => existsSync(resolve(root, rel))),
    hold,
  });

  if (wantsJson) {
    console.log(
      JSON.stringify(
        {
          program,
          agent,
          slice: recommendedSlice,
          autonomy,
          chatRename,
          masterDoc: masterRel,
          // AFKF-18b — the machine-readable half. `mc-ralph.yml` and `create_session` read this
          // JSON; a caller that only looks at `slice` must still be able to see the refusal.
          held: Boolean(hold?.held),
          holdReason: hold?.held ? hold.reason : null,
          prompt: opener,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(opener);
  }
}

if (isDirectRun) {
  runOpener().catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
}
