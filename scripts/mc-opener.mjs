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
 *   1. It printed Cursor's rule paths (`.cursor/rules/*.mdc`) and "Composer 2.5" at every
 *      caller, including Claude Code sessions — which then read rules that are not the ones
 *      they load. The agent asking is now detected, and each gets its own paths.
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
 * One entry per agent we ship rules for. `.claude/` and `.cursor/` hold the same content in two
 * dialects; an agent handed the other one's paths reads a file it does not load.
 */
export const AGENT_PROFILES = {
  claude: {
    label: 'Claude Code',
    sessionLine:
      'Recommended: fresh Claude Code session · Opus for planning, Sonnet for AFK execution (agent-discipline skill)',
    rules: ['.claude/rules/workflow-core.md', '.claude/rules/agent-chat-session.md'],
    autoMergePolicy: '.claude/rules/auto-merge-policy.md',
  },
  cursor: {
    label: 'Cursor',
    sessionLine: 'Recommended: Composer 2.5 · Agent · new chat',
    rules: ['.cursor/rules/workflow-core.mdc', '.cursor/rules/agent-chat-session.mdc'],
    autoMergePolicy: '.cursor/rules/auto-merge-policy.mdc',
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
  return 'unknown';
}

/** The "Read and follow" block for the detected agent. Unknown prints both, labelled. */
export function rulesBlock(agent) {
  if (agent === 'unknown') {
    const claude = AGENT_PROFILES.claude.rules.join(' · ');
    const cursor = AGENT_PROFILES.cursor.rules.join(' · ');
    return [
      'Read and follow your own tool\'s copy (same content, two dialects):',
      `- Claude Code: ${claude}`,
      `- Cursor: ${cursor}`,
    ].join('\n');
  }
  return ['Read and follow:', ...AGENT_PROFILES[agent].rules.map((r) => `- ${r}`)].join('\n');
}

export function sessionLine(agent) {
  if (agent === 'unknown') {
    return 'Recommended: a fresh agent session (Cursor: Composer 2.5 · Agent · new chat)';
  }
  return AGENT_PROFILES[agent].sessionLine;
}

export function autoMergePolicyPath(agent) {
  if (agent === 'unknown') return 'the auto-merge-policy rule';
  return AGENT_PROFILES[agent].autoMergePolicy;
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
}) {
  return [
    `**Chat name:** ${chatRename}`,
    '',
    `Rename this chat to: ${chatRename}`,
    '',
    sessionLine(agent),
    '',
    rulesBlock(agent),
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
    `End: update STATUS DASHBOARD in same PR, SESSION REPORT in PR body, auto-merge per ${autoMergePolicyPath(
      agent,
    )} when green.`,
    '',
    `Then hand off: run \`npm run mc:opener -- ${program}\` and put the prompt it prints in the`,
    'SESSION REPORT, so the next session starts from an exact prompt. Never end by telling the',
    'CEO to type "Continue" — it does not say which program.',
    '',
    'Do not ask CEO to paste prompts or MC reports to another chat.',
  ].join('\n');
}

const isDirectRun = Boolean(process.argv[1]) && process.argv[1].endsWith('mc-opener.mjs');

if (isDirectRun) {
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

  const opener = buildOpener({
    agent,
    program,
    chatRename,
    recommendedSlice,
    autonomy,
    masterRel,
    nextPrompt,
    exitPlan: exitPlanLine(program, (rel) => existsSync(resolve(root, rel))),
  });

  if (wantsJson) {
    console.log(
      JSON.stringify(
        { program, agent, slice: recommendedSlice, autonomy, chatRename, masterDoc: masterRel, prompt: opener },
        null,
        2,
      ),
    );
  } else {
    console.log(opener);
  }
}
