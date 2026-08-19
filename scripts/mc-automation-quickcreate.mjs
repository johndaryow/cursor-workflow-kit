#!/usr/bin/env node
/**
 * Prints copy-paste text for cursor.com/automations quick-create box.
 * Agents cannot create automations on CEO's Cursor account — CEO pastes once.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readPrompt(name) {
  return readFileSync(
    resolve(root, `.cursor/automations/prompts/${name}`),
    'utf8',
  );
}

const ralphContinue = readPrompt('ralph-continue-on-merge.md');
const kickstart = readPrompt('ralph-kickstart-fill-dag.md');
const digest = readPrompt('morning-digest-optional.md');

const ralphSpec = `Create an automation named "PP · Ralph continue on merge".

Trigger: GitHub pull request merged on repository johndaryow/pp-workspace.
Repository: johndaryow/pp-workspace, branch main.
Model: Composer 2.5. Private visibility. This agent MAY create PRs when Ralph gates pass.

Instructions:
${ralphContinue}`;

const kickstartSpec = `Create an automation named "PP · Ralph kickstart (Fill the DAG)".

Trigger: Manual / on-demand only (no schedule). CEO runs when cold-starting parallel worker lanes.
Repository: johndaryow/pp-workspace, branch main.
Model: Composer 2.5. Private visibility. May create PRs.

Instructions:
${kickstart}`;

const digestSpec = `Create an automation named "PP · Morning digest (optional)".

Trigger: scheduled every day at 8:00 AM Asia/Manila timezone OR weekly Monday 8 AM — CEO choice.
Repository: johndaryow/pp-workspace, branch main.
Model: Composer 2.5. Private visibility. Do NOT auto-start slices — digest only.

Instructions:
${digest}`;

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  CURSOR AUTOMATIONS — CEO setup (WORKFLOW-P9 Ralph)              ║
║  Open: https://cursor.com/automations                            ║
╚══════════════════════════════════════════════════════════════════╝

You need ONE merge-trigger automation (the AFK engine). Morning brief is OPTIONAL.

── STEP 1 (REQUIRED): Replace "MC batch done ping" ──

1. Open your existing "PP · MC batch done ping" automation → Edit
2. Rename to: PP · Ralph continue on merge
3. Trigger stays: PR merged on pp-workspace / main
4. Delete ALL old instructions → paste this block:

${ralphSpec}

── STEP 2 (OPTIONAL): Morning digest — status only, no auto-start ──

Disable or replace "Morning MC Brief + auto-start" if you check agent sessions yourself.

Paste for a digest-only automation (or edit existing morning automation):

${digestSpec}

── STEP 3 (OPTIONAL): Cold-start parallel lanes ──

New automation, manual trigger. CEO runs once to start first slice, or say "Fill the DAG" in Cloud Agent.

${kickstartSpec}

── CEO daily rhythm (Pocock Ralph in Cursor) ──

• Merge W17 PR → Ralph auto-starts W18 (no morning brief needed)
• Wake up → check Cursor Automations runs + Cloud Agent sessions
• Chain paused? New Cloud Agent → "Fill the DAG" or "Start W18"
• Parallel: after Fill the DAG lists W10,W12,W18 → open 3 Cloud Agents with Start W10 / W12 / W18

── Pause chain ──

Disable STEP 1 automation OR set BLOCKED_BY: CEO pause in platform STATUS

── Scripts (agents use these) ──

npm run mc:ralph-chain -- --pr-number <n>
npm run mc:ralph-fill-dag

YAML: .cursor/automations/
`);
