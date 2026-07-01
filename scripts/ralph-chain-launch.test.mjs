#!/usr/bin/env node
/**
 * Tests for ralph-chain-launch (prompt + payload; no live API calls).
 */
import assert from 'node:assert/strict';
import {
  buildLaunchPrompt,
  buildApiPayload,
  idempotentAgentId,
  statusKeyFromMasterDoc,
} from './ralph-chain-launch.mjs';
import { planRalphChain } from './ralph-chain.mjs';

const w17Plan = planRalphChain({
  prTitle: 'PLATFORM W17: hybrid batch',
  prBody: '## SESSION REPORT\nSlice: W17\nStatus: done\nWhat shipped: hybrid batch',
});

assert.equal(w17Plan.action, 'chain');
assert.equal(w17Plan.nextSlice, 'W18');
assert.equal(w17Plan.gatesPass, true);

const prompt = buildLaunchPrompt(w17Plan);
assert.match(prompt, /\*\*Chat name:\*\* PLATFORM W18/);
assert.match(prompt, /Slice: W18/);
assert.match(prompt, /cloud:env-check/);
assert.match(prompt, /mc:status -- platform/);

const rteF1Plan = planRalphChain({
  prTitle: 'RTE-F1: subscription session hub',
  prBody: '## SESSION REPORT\nSlice: RTE-F1\nStatus: done\nWhat shipped: session hub',
});
const rtePrompt = buildLaunchPrompt(rteF1Plan);
assert.match(rtePrompt, /mc:status -- rte-foundation/);
assert.equal(
  statusKeyFromMasterDoc('docs/projects/rte-foundation-master.md'),
  'rte-foundation',
);

const payload = buildApiPayload(w17Plan, { envName: 'my-repo-env', prNumber: '218' });
assert.equal(payload.env.type, 'cloud');
assert.equal(payload.env.name, 'my-repo-env');
assert.equal(payload.autoCreatePR, false);
assert.ok(!payload.repos, 'named env must not include repos');
const BC_AGENT_ID_RE = /^bc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
assert.match(payload.agentId ?? '', BC_AGENT_ID_RE);

const id1 = idempotentAgentId('W17', 'W18');
const id2 = idempotentAgentId('W17', 'W18');
assert.equal(id1, id2);
assert.match(id1, BC_AGENT_ID_RE);
// Same chain step from different PR numbers must dedupe (STATUS closeout PR)
assert.equal(id1, idempotentAgentId('W17', 'W18'));
assert.notEqual(id1, idempotentAgentId('W16', 'W18'));

const maint = planRalphChain({
  prTitle: 'docs(platform): STATUS post-merge',
  prBody: 'Post-merge STATUS fix only',
});
assert.equal(maint.action, 'notify');

console.log('ralph-chain-launch.test.mjs: all PASS');
