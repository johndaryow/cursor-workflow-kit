#!/usr/bin/env node
/**
 * One-line Cloud Agent opener from STATUS DASHBOARD + CHAT_RENAME.
 * Usage: npm run mc:opener [-- platform|workflow]
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseDashboardFields, chatRenameFromMaster } from './mc-chat-meta.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const program = process.argv[2] ?? 'platform';
const statusScript = resolve(__dirname, 'mc-status.mjs');

const result = spawnSync('node', [statusScript, program], {
  encoding: 'utf8',
  cwd: root,
});
if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const statusOut = result.stdout;
const chatRename =
  statusOut.match(/^CHAT_RENAME:\s*(.+)$/m)?.[1]?.trim() ??
  'PLATFORM · migration slice';
const recommendedSlice =
  statusOut.match(/^RECOMMENDED_SLICE:\s*(.+)$/m)?.[1]?.trim() ?? 'unknown';
const autonomy =
  statusOut.match(/^AUTONOMY:\s*(.+)$/m)?.[1]?.trim() ?? 'unknown';

const masterRel =
  program === 'workflow'
    ? 'docs/projects/workflow-master.md'
    : program === 'platform'
      ? 'docs/projects/platform-migration-master.md'
      : `docs/projects/${program}-master.md`;

const masterText = readFileSync(resolve(root, masterRel), 'utf8');
const dashboardStart = masterText.indexOf('## STATUS DASHBOARD');
const dashboardEnd = masterText.indexOf('\n---', dashboardStart);
const dashboard = masterText.slice(dashboardStart, dashboardEnd);
const fields = parseDashboardFields(dashboard);
const nextPrompt = fields.nextPrompt || '§12';

const opener = `
**Chat name:** ${chatRename}

Rename this chat to: ${chatRename}

Recommended: Composer 2.5 · Agent · new chat

Read and follow:
- .cursor/rules/workflow-core.mdc
- .cursor/rules/agent-chat-session.mdc

MASTER DOC: ${masterRel}
EXIT PLAN (Lane B): docs/projects/workers-exit-plan.md
Run: npm run mc:status -- ${program}

Execute slice **${recommendedSlice}** — NEXT_PROMPT (${nextPrompt}) from the master doc.
AUTONOMY: ${autonomy} — use afk-slice skill if AFK.

First reply MUST print the Chat name line, then start preflight.

End: update STATUS DASHBOARD in same PR, SESSION REPORT in PR body, auto-merge per auto-merge-policy.mdc when green.

Do not ask CEO to paste prompts or MC reports to another chat.
`.trim();

console.log(opener);
