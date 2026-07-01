#!/usr/bin/env node
/**
 * Ralph chain health check — CEO/agent preflight before trusting Cursor Automation chain.
 *
 * Usage:
 *   npm run mc:ralph-health
 *   npm run mc:ralph-health -- --pr-number 344
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planRalphChain } from './ralph-chain.mjs';
import { isMaintenancePr } from './ralph-chain-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/** @param {string[]} argv */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pr-number') out.prNumber = argv[++i];
  }
  return out;
}

/** @param {string} prNumber */
function fetchPr(prNumber) {
  const r = spawnSync(
    'gh',
    ['pr', 'view', prNumber, '--json', 'title,body,number,mergedAt'],
    { encoding: 'utf8', cwd: root },
  );
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const issues = [];
  const ok = [];

  const workflowYaml = resolve(root, '.github/workflows/ralph-continue-on-merge.yml');
  if (existsSync(workflowYaml)) {
    ok.push('GitHub Action ralph-continue-on-merge.yml present');
    const yaml = readFileSync(workflowYaml, 'utf8');
    if (/types:\s*\[closed\]/.test(yaml)) {
      ok.push('GHA trigger: pull_request closed (merge chain)');
    } else {
      issues.push('ralph-continue-on-merge.yml missing pull_request closed trigger');
    }
  } else {
    issues.push('Missing .github/workflows/ralph-continue-on-merge.yml');
  }

  const automationYaml = resolve(root, '.cursor/automations/ralph-continue-on-merge.yaml');
  if (existsSync(automationYaml)) {
    ok.push('Legacy Cursor Automation spec still in repo (should stay Inactive in UI)');
  }

  const envCheck = spawnSync('npm', ['run', 'cloud:env-check'], {
    encoding: 'utf8',
    cwd: root,
    shell: true,
  });
  if (envCheck.status === 0) {
    ok.push('cloud:env-check PASS on this VM');
  } else {
    issues.push(
      'cloud:env-check FAIL — Ralph agent will notify-only until Cursor Environment snapshot has Tier 1 secrets',
    );
  }

  const gh = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', cwd: root });
  if (gh.status === 0) {
    ok.push('gh CLI authenticated');
  } else {
    issues.push('gh CLI not authenticated — Ralph agent cannot read merged PR');
  }

  const tests = spawnSync('npm', ['run', 'test:ralph-chain'], {
    encoding: 'utf8',
    cwd: root,
    shell: true,
  });
  if (tests.status === 0) {
    ok.push('test:ralph-chain PASS');
  } else {
    issues.push('test:ralph-chain FAIL — planner regression');
  }

  const planningTitle = 'docs(RTE-F): Wave 1 vertical slice decomposition (RTE-F1–F10)';
  const planningBody =
    '## SESSION REPORT\nSlice: planning (slice decomposition)\nStatus: done\nWhat shipped: slice cards';
  if (isMaintenancePr(planningTitle, planningBody)) {
    ok.push('docs planning PR correctly classified as maintenance (no false chain)');
  } else {
    issues.push('docs planning PR would false-chain — fix isMaintenancePr');
  }

  if (args.prNumber) {
    const pr = fetchPr(args.prNumber);
    if (!pr) {
      issues.push(`Could not load PR #${args.prNumber}`);
    } else {
      const plan = planRalphChain({ prTitle: pr.title, prBody: pr.body });
      console.log(`PR #${args.prNumber}: ${pr.title}`);
      console.log(
        `  merged: ${pr.mergedAt ?? 'not merged'} · RALPH_ACTION: ${plan.action} · NEXT: ${plan.nextSlice ?? 'none'}`,
      );
      if (plan.gateFailures?.length) {
        console.log(`  gates: ${plan.gateFailures.join(' · ')}`);
      }
      if (plan.action === 'chain' && plan.gatesPass) {
        ok.push(`PR #${args.prNumber} would chain → ${plan.nextSlice}`);
      }
    }
  }

  console.log('\n# RALPH HEALTH (GitHub Action chain)\n');
  for (const line of ok) console.log(`OK: ${line}`);
  for (const line of issues) console.log(`WARN: ${line}`);

  console.log('\nEngine: GitHub Action `ralph-continue-on-merge.yml` on PR merged → mc:ralph-launch');
  console.log('CEO checklist:');
  console.log('  1. GitHub repo secrets: CURSOR_API_KEY + CURSOR_CLOUD_ENV_NAME');
  console.log('  2. Cursor Environment: saved snapshot (Active) — same name as CURSOR_CLOUD_ENV_NAME secret');
  console.log('  3. Cursor Automations merge trigger: **Inactive** (avoid duplicate agents)');
  console.log('  4. Cloud Agent secrets: GITHUB_PAT for PR create + auto-merge');
  console.log('  5. Manual fallback: npm run mc:ralph-launch -- --pr-number <merged-pr>');

  process.exit(issues.length ? 1 : 0);
}

main();
