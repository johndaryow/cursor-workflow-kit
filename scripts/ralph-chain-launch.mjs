#!/usr/bin/env node
/**
 * Launch the next Ralph slice via Cursor Cloud Agents API (reliable secrets path).
 *
 * Used by GitHub Actions on PR merge — replaces Cursor Automations for chain continuation
 * when automation VMs miss dashboard secrets (known Cursor bug on GitHub triggers).
 *
 * Usage:
 *   npm run mc:ralph-launch -- --pr-number 218
 *   npm run mc:ralph-launch -- --pr-number 218 --dry-run
 *
 * Required env:
 *   CURSOR_API_KEY — Cursor Dashboard → API Keys (user or service account)
 *   CURSOR_CLOUD_ENV_NAME — saved Cloud Agents environment name (e.g. my-repo-env)
 *
 * Optional env:
 *   CURSOR_AGENT_MODEL — model id (default: omit → account default, usually Composer 2.5)
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planRalphChain } from './ralph-chain.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const CURSOR_API_BASE = process.env.CURSOR_API_BASE?.trim() || 'https://api.cursor.com';
const REPO_SLUG = process.env.RALPH_REPO_SLUG?.trim() || '';

/** @param {string[]} argv */
function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pr-number') out.prNumber = argv[++i];
    else if (a === '--pr-title') out.prTitle = argv[++i];
    else if (a === '--pr-body') out.prBody = argv[++i];
    else if (a === '--merged-slice') out.mergedSlice = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--json') out.json = true;
  }
  return out;
}

/** @param {string} prNumber */
function fetchPr(prNumber) {
  const r = spawnSync(
    'gh',
    ['pr', 'view', prNumber, '--json', 'title,body,number'],
    { encoding: 'utf8', cwd: root },
  );
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

/**
 * @param {string} masterDoc e.g. docs/projects/rte-foundation-master.md
 */
export function statusKeyFromMasterDoc(masterDoc = '') {
  const base = masterDoc.split('/').pop() ?? '';
  return base.replace(/-master\.md$/i, '') || 'platform';
}

/**
 * @param {import('./ralph-chain.mjs').planRalphChain extends (...args: any[]) => infer R ? R : never} plan
 */
export function buildLaunchPrompt(plan) {
  const slice = plan.nextSlice;
  const chatRename = plan.chatRename ?? `PLATFORM ${slice}`;
  const masterDoc = plan.masterDoc ?? 'docs/projects/platform-migration-master.md';
  const statusKey = statusKeyFromMasterDoc(masterDoc);
  const program = plan.program ?? 'PLATFORM';
  const autonomy = plan.autonomy ?? 'AFK';

  return `
**Chat name:** ${chatRename}

Rename this chat to: ${chatRename}

You are the Ralph Continue agent for PP Design Studio — launched after merge of slice ${plan.mergedSlice ?? 'unknown'} (Cursor Automation or manual).

Read and follow:
- AGENTS.md
- docs/rules/merging.md
- docs/rules/slice-tags.md
- .cursor/skills/afk-slice/SKILL.md
- .cursor/skills/session-report/SKILL.md

MASTER DOC: ${masterDoc}
Run first: npm run cloud:env-check
Run: npm run mc:status -- ${statusKey}

Execute slice **${slice}** only — ONE slice per session. Do not start the slice after it.
Program: ${program} · AUTONOMY: ${autonomy} · CHAIN_MODE: ${plan.chainMode ?? 'serial'}

First reply MUST print the Chat name line, then run cloud:env-check.
PR body MUST include \`Slice: ${slice}\` for the next Ralph run.
End: STATUS update in same PR, SESSION REPORT, auto-merge when green per auto-merge-policy.mdc.

Do not ask CEO to paste prompts or MC reports.
`.trim();
}

/**
 * One agent per merged slice → next slice (not per PR number — avoids duplicate RH5 from STATUS closeout PR).
 * @param {string} mergedSlice
 * @param {string} nextSlice
 */
const BC_AGENT_ID_RE = /^bc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function idempotentAgentId(mergedSlice, nextSlice) {
  const hash = createHash('sha256')
    .update(`${REPO_SLUG}:${mergedSlice}:${nextSlice}`)
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  const agentId = `bc-${uuid}`;
  if (!BC_AGENT_ID_RE.test(agentId)) {
    throw new Error(`Generated invalid Cursor agentId: ${agentId}`);
  }
  return agentId;
}

/**
 * @param {object} plan
 * @param {{ envName: string, model?: string, prNumber?: string }} opts
 */
export function buildApiPayload(plan, opts) {
  const promptText = buildLaunchPrompt(plan);
  const payload = {
    name: `${plan.chatRename ?? plan.nextSlice} · Ralph chain`,
    prompt: { text: promptText },
    env: {
      type: 'cloud',
      name: opts.envName,
    },
    autoCreatePR: false,
  };

  if (opts.model) {
    payload.model = { id: opts.model };
  }

  if (plan.mergedSlice && plan.nextSlice) {
    payload.agentId = idempotentAgentId(plan.mergedSlice, plan.nextSlice);
  }

  return payload;
}

/**
 * @param {object} payload
 * @param {string} apiKey
 */
export async function postCursorAgent(payload, apiKey) {
  const res = await fetch(`${CURSOR_API_BASE}/v1/agents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  return { ok: res.ok, status: res.status, body };
}

/**
 * @param {ReturnType<typeof parseArgs>} args
 */
export async function runRalphLaunch(args) {
  let prTitle = args.prTitle;
  let prBody = args.prBody;

  if (args.prNumber && !prTitle) {
    const pr = fetchPr(args.prNumber);
    if (!pr) {
      return { action: 'error', reason: `Could not load PR #${args.prNumber} via gh` };
    }
    prTitle = pr.title;
    prBody = pr.body;
  }

  const plan = planRalphChain({
    mergedSlice: args.mergedSlice,
    prTitle,
    prBody,
  });

  if (plan.action !== 'chain' || !plan.gatesPass || !plan.nextSlice) {
    return {
      action: 'notify',
      plan,
      reason: plan.reason ?? 'Ralph chain skipped',
      gateFailures: plan.gateFailures ?? [],
    };
  }

  const apiKey = process.env.CURSOR_API_KEY?.trim();
  const envName = process.env.CURSOR_CLOUD_ENV_NAME?.trim();

  if (args.dryRun) {
    return {
      action: 'dry-run',
      plan,
      payload: buildApiPayload(plan, {
        envName: envName || '(set CURSOR_CLOUD_ENV_NAME)',
        model: process.env.CURSOR_AGENT_MODEL?.trim(),
        prNumber: args.prNumber,
      }),
    };
  }

  if (!apiKey) {
    return {
      action: 'error',
      plan,
      reason: 'Missing CURSOR_API_KEY — add in GitHub repo secrets + Cursor dashboard',
    };
  }

  if (!envName) {
    return {
      action: 'error',
      plan,
      reason:
        'Missing CURSOR_CLOUD_ENV_NAME — exact name from Cursor → Cloud Agents → Environment',
    };
  }

  const payload = buildApiPayload(plan, {
    envName,
    model: process.env.CURSOR_AGENT_MODEL?.trim(),
    prNumber: args.prNumber,
  });

  const result = await postCursorAgent(payload, apiKey);

  if (result.status === 409) {
    return {
      action: 'already-launched',
      plan,
      reason: 'Agent already exists for this PR + slice (idempotent skip)',
      agentId: payload.agentId,
    };
  }

  if (!result.ok) {
    const msg =
      result.body?.error?.message ||
      result.body?.message ||
      JSON.stringify(result.body).slice(0, 500);
    return {
      action: 'error',
      plan,
      reason: `Cursor API ${result.status}: ${msg}`,
    };
  }

  const agent = result.body?.agent ?? result.body;
  return {
    action: 'launched',
    plan,
    agentId: agent?.id,
    agentUrl: agent?.url,
    runId: result.body?.run?.id,
  };
}

function printHuman(result) {
  console.log('# RALPH LAUNCH\n');

  if (result.plan) {
    console.log(`MERGED_SLICE: ${result.plan.mergedSlice ?? 'unknown'}`);
    console.log(`NEXT_SLICE: ${result.plan.nextSlice ?? 'none'}`);
    console.log(`CHAT_RENAME: ${result.plan.chatRename ?? 'n/a'}`);
    console.log(`CHAIN_MODE: ${result.plan.chainMode ?? 'n/a'}`);
  }

  console.log(`LAUNCH_ACTION: ${result.action}`);
  console.log(`REASON: ${result.reason ?? 'ok'}`);

  if (result.gateFailures?.length) {
    console.log(`GATE_FAILURES: ${result.gateFailures.join(' · ')}`);
  }
  if (result.agentId) console.log(`AGENT_ID: ${result.agentId}`);
  if (result.agentUrl) console.log(`AGENT_URL: ${result.agentUrl}`);
  if (result.runId) console.log(`RUN_ID: ${result.runId}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runRalphLaunch(args);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  if (result.action === 'error') process.exit(1);
  if (result.action === 'notify') process.exit(0);
  if (result.action === 'already-launched') process.exit(0);
  if (result.action === 'dry-run') process.exit(0);
  if (result.action === 'launched') process.exit(0);
  process.exit(1);
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
