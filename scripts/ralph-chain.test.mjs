#!/usr/bin/env node
/**
 * Tests for ralph-chain-config and ralph-chain planner.
 */
import assert from 'node:assert/strict';
import {
  extractMergedSliceId,
  nextSliceId,
  canAutoChain,
  sliceMetaFor,
  subLaneFor,
  isMaintenancePr,
  isWorkflowMetaPr,
  isDenyListedPr,
} from './ralph-chain-config.mjs';
import { planRalphChain, effectiveRalphRunning } from './ralph-chain.mjs';
import { pickNextParallelSlice } from './ralph-fill-dag.mjs';

// extractMergedSliceId
assert.equal(extractMergedSliceId('PLATFORM W17 · library chunk 1'), 'W17');
assert.equal(extractMergedSliceId('Slice: W17\nProgram: PLATFORM'), 'W17');
assert.equal(extractMergedSliceId('DLM-4 R2 pilot'), 'DLM-4');
assert.equal(extractMergedSliceId('S6b hybrid batch 12'), 'S6b-batch-12');
assert.equal(extractMergedSliceId('PLATFORM S6b-F7: lean resolver'), 'S6b-F7');
assert.equal(extractMergedSliceId('Slice: S6b-F7\nProgram: PLATFORM'), 'S6b-F7');
assert.equal(extractMergedSliceId('COVE P1 · media foundation'), 'COVE P1');
assert.equal(extractMergedSliceId('Slice: COVE P1 · media foundation'), 'COVE P1');
assert.equal(extractMergedSliceId('random doc fix'), null);

// COVE serial chain (P2–P6 AFK; stops before HITL P7)
assert.equal(nextSliceId('COVE P1'), 'COVE P2');
assert.equal(nextSliceId('COVE P2'), 'COVE P3');
assert.equal(nextSliceId('COVE P5'), 'COVE P6');
assert.equal(nextSliceId('COVE P6'), null);
assert.equal(canAutoChain(sliceMetaFor('COVE P2')), true);
assert.equal(canAutoChain(sliceMetaFor('COVE P7')), false);
assert.equal(subLaneFor('COVE P3'), 'F-cove');

const coveP1 = planRalphChain({
  prTitle: 'COVE P1 · media foundation (catalog + upload signer)',
  prBody: '## SESSION REPORT\nSlice: COVE P1 · media foundation\nStatus: done',
});
assert.equal(coveP1.mergedSlice, 'COVE P1');
assert.equal(coveP1.action, 'chain');
assert.equal(coveP1.nextSlice, 'COVE P2');
assert.equal(coveP1.masterDoc, 'docs/projects/cove-master.md');
assert.equal(coveP1.chainMode, 'serial');

const coveP6 = planRalphChain({
  mergedSlice: 'COVE P6',
  prTitle: 'COVE P6 · departments landscape',
  prBody: '## SESSION REPORT\nSlice: COVE P6\nStatus: done',
});
assert.equal(coveP6.action, 'notify');
assert.equal(coveP6.nextSlice, 'COVE P7');
assert.equal(coveP6.chainMode, 'cove-terminal');
assert.equal(coveP6.gatesPass, false);

// S6b lean plan serial chain
assert.equal(nextSliceId('S6b-F7'), 'S6b-F8');
assert.equal(nextSliceId('S6b-F8'), 'S6b-F9');
assert.equal(nextSliceId('S6b-F11'), 'S6b-F12');
assert.equal(nextSliceId('S6b-F12'), 'S6b-F13');
assert.equal(nextSliceId('S6b-F13'), 'S6b-F14');
assert.equal(nextSliceId('S6b-F6'), null);

// deny list — AFK closeout body prose must not block (F13 #236 pattern)
const f13Body = `## SESSION REPORT
- Slice: S6b-F13
- Status: done
What shipped:
- GCP credentials passed to spawned pilot
Exit tests:
- Exit — inventory delta: PASS`;
assert.equal(isDenyListedPr('PLATFORM S6b-F13 · lean batch 16', f13Body), false);
assert.equal(isDenyListedPr('PLATFORM DNS cutover', f13Body), true);

// PR #205 pattern — must not pick W23 from "Next slice" prose
const pr205Body = `## SESSION REPORT
- Program: WORKFLOW
- Slice: Ralph reliability hardening
Next slice:
- Ralph continues (W23/W24/W26 queue)
Slice: WORKFLOW-P12`;
assert.equal(extractMergedSliceId(`WORKFLOW: Ralph push-before-PR\n${pr205Body}`), null);
assert.equal(isWorkflowMetaPr('WORKFLOW: Ralph push-before-PR', pr205Body), true);

const pr205Plan = planRalphChain({
  prTitle: 'WORKFLOW: Ralph push-before-PR hardening + chain test CI',
  prBody: pr205Body,
});
assert.equal(pr205Plan.action, 'notify');
assert.equal(pr205Plan.chainMode, 'skip-maintenance');

// PLATFORM slice still chains
assert.equal(nextSliceId('W17'), 'W18');
assert.equal(nextSliceId('W9'), 'W10');
assert.equal(nextSliceId('W16'), null);
assert.equal(nextSliceId('S6b-batch-12'), 'S6b-batch-13');

// sub-lanes differ for parallel
assert.notEqual(subLaneFor('W12'), subLaneFor('W17'));
assert.equal(subLaneFor('W18'), subLaneFor('W17'));

// AFK auto-chain
assert.equal(canAutoChain(sliceMetaFor('W18')), true);
assert.equal(canAutoChain(sliceMetaFor('DLM-4')), false);
assert.equal(canAutoChain(sliceMetaFor('DLM-8')), true);
assert.equal(canAutoChain(sliceMetaFor('DLM-12')), false);

// DLM serial chain (AFK 8–11; stops before HITL 12)
assert.equal(nextSliceId('DLM-7'), 'DLM-8');
assert.equal(nextSliceId('DLM-8'), 'DLM-9');
assert.equal(nextSliceId('DLM-10'), 'DLM-11');
assert.equal(nextSliceId('DLM-11'), null);

const dlm7 = planRalphChain({
  mergedSlice: 'DLM-7',
  prTitle: 'PLATFORM DLM-7 · UI cutover',
  prBody: '## SESSION REPORT\nSlice: DLM-7\nStatus: done',
});
assert.equal(dlm7.action, 'chain');
assert.equal(dlm7.nextSlice, 'DLM-8');
assert.equal(dlm7.chainMode, 'serial');
assert.equal(dlm7.gatesPass, true);

const dlm11 = planRalphChain({
  mergedSlice: 'DLM-11',
  prTitle: 'PLATFORM DLM-11 · Personalizer parity',
  prBody: '## SESSION REPORT\nSlice: DLM-11\nStatus: done',
});
assert.equal(dlm11.action, 'notify');
assert.equal(dlm11.nextSlice, 'DLM-12');
assert.equal(dlm11.chainMode, 'dlm-terminal');
assert.equal(dlm11.gatesPass, false);
assert.match(dlm11.reason, /HITL|terminal/i);

// plan: W17 → W18 serial chain
const chain = planRalphChain({
  mergedSlice: 'W17',
  prTitle: 'PLATFORM W17',
  prBody: 'Slice: W17',
});
assert.equal(chain.action, 'chain');
assert.equal(chain.nextSlice, 'W18');
assert.equal(chain.chainMode, 'serial');
assert.equal(chain.gatesPass, true);

// plan: W11 terminal → parallel fill (live STATUS)
const w11 = planRalphChain({ mergedSlice: 'W11' });
assert.equal(w11.action, 'chain');
assert.equal(w11.chainMode, 'parallel-fill');
assert.equal(w11.gatesPass, true);
assert.notEqual(w11.subLane, subLaneFor('W11'));

// plan: blocked platform → notify
const blockedPlatform = `
## STATUS DASHBOARD
\`\`\`text
BLOCKED_BY: CEO pause
RALPH_RUNNING: none
\`\`\`
W8 ✅ W10 ✅ W11 ✅
`;
const blocked = planRalphChain(
  { mergedSlice: 'W11' },
  { platformText: blockedPlatform, dlmText: '' },
);
assert.equal(blocked.action, 'notify');
assert.match(blocked.reason, /blocked/i);

// pickNextParallelSlice skips busy sub-lanes
const miniPlatform = `
## STATUS DASHBOARD
\`\`\`text
BLOCKED_BY: none
RALPH_RUNNING: W21
\`\`\`
W8 ✅ W10 ✅ W11 ✅
`;
const pick = pickNextParallelSlice(miniPlatform, '', 'W11');
assert.ok(pick);
assert.notEqual(pick.subLane, 'B-hr');

// maintenance PR #197 pattern — notify only, no W25 duplicate
assert.equal(
  isMaintenancePr(
    'docs(platform): STATUS post-merge W21 — LAST_MERGED_PR #196',
    'Post-merge STATUS fix: LAST_MERGED_PR #196, clear LAST_PR.',
  ),
  true,
);
const maint = planRalphChain({
  prTitle: 'docs(platform): STATUS post-merge W21 — LAST_MERGED_PR #196',
  prBody: 'Post-merge STATUS fix: LAST_MERGED_PR #196',
});
assert.equal(maint.action, 'notify');
assert.equal(maint.chainMode, 'skip-maintenance');

// real W21 PR — chains
const w21 = planRalphChain({
  prTitle: 'PLATFORM W21: HR AI bundle',
  prBody: '## SESSION REPORT\nSlice: W21\nStatus: done\nWhat shipped: edge-hr-ai',
});
assert.equal(w21.action, 'chain');
assert.equal(w21.nextSlice, 'W25');

// W25 terminal → parallel fill skips W15 when workers-exit-plan marks it DONE
const workersExitW15Done =
  '## 6g. Slice detail — W15 (DONE 2026-06-27)\n## 6f. Slice detail — W14 (DONE 2026-06-27)\n## 6d. Slice detail — W16 (parallel — DONE 2026-06-26)';
// Frozen platform snapshot — do not read live STATUS (W22–W27 ✅ on main would drift this test).
const w25PlatformSnapshot = `
## STATUS DASHBOARD
\`\`\`text
BLOCKED_BY: none
RALPH_RUNNING: none
\`\`\`
W8 ✅ W10 ✅ W11 ✅ W12 ✅ W17 ✅ W21 ✅ W22 ✅ W23 ✅ W24 ✅
`;
const w25 = planRalphChain(
  { mergedSlice: 'W25', prTitle: 'PLATFORM W25', prBody: 'Slice: W25' },
  { platformText: w25PlatformSnapshot, workersExitText: workersExitW15Done, dlmText: '' },
);
assert.equal(w25.action, 'chain');
assert.equal(w25.chainMode, 'parallel-fill');
// W21–W24 done in snapshot; W16 done via workers-exit — next idle track is W26 or DLM-1
assert.ok(
  ['W26', 'DLM-1'].includes(w25.nextSlice),
  `unexpected next: ${w25.nextSlice}`,
);
assert.notEqual(w25.nextSlice, 'W15');
assert.notEqual(w25.nextSlice, 'W16');

// S6b in-progress snapshot (inventory not zero — historical chain tests)
const s6bRunningPlatform = `
## STATUS DASHBOARD
\`\`\`text
BLOCKED_BY: none
RALPH_RUNNING: none
S6B_LEAN: F12 running — inventory **500** pending
\`\`\`
| Legacy Storage media | **500** projects w/ pending URLs (**1200** URLs) |
`;

// PR #214 — S6b-F7 merged → serial chain S6b-F8 (Lane A table may show 🟢)
const f7 = planRalphChain(
  {
    prTitle: 'PLATFORM S6b-F7: lean resolver + --tier=lean',
    prBody: '## SESSION REPORT\nSlice: S6b-F7\nStatus: done\nWhat shipped: lean resolver',
  },
  { platformText: s6bRunningPlatform },
);
assert.equal(f7.action, 'chain');
assert.equal(f7.nextSlice, 'S6b-F8');
assert.equal(f7.chainMode, 'serial');
assert.equal(f7.gatesPass, true);

// S6b-F13 merged → serial chain S6b-F14 (not parallel-fill DLM-1)
const f13 = planRalphChain(
  {
    prTitle: 'PLATFORM S6b-F13 · lean batch 16 + conveyor bugfix',
    prBody: f13Body,
  },
  { platformText: s6bRunningPlatform },
);
assert.equal(f13.action, 'chain');
assert.equal(f13.nextSlice, 'S6b-F14');
assert.equal(f13.chainMode, 'serial');
assert.equal(f13.gatesPass, true);

// S6b-F12 merged → serial F13 (regression: was parallel-fill DLM-1)
const f12 = planRalphChain(
  {
    prTitle: 'PLATFORM S6b-F12: lean batch 15',
    prBody: '## SESSION REPORT\nSlice: S6b-F12\nStatus: done\nWhat shipped: batch 15',
  },
  { platformText: s6bRunningPlatform },
);
assert.equal(f12.action, 'chain');
assert.equal(f12.nextSlice, 'S6b-F13');
assert.equal(f12.chainMode, 'serial');

// S6b-F23 terminal — inventory 0 → notify (no F24 chain)
assert.equal(nextSliceId('S6b-F23'), null);
const s6bDonePlatform = `
## STATUS DASHBOARD
\`\`\`text
BLOCKED_BY: none
RALPH_RUNNING: none
S6B_LEAN: F23 ✅ 2026-06-28 — orphan verify · inventory **0** · **S6b DONE**
\`\`\`
`;
const f23Done = planRalphChain(
  {
    mergedSlice: 'S6b-F23',
    prTitle: 'PLATFORM S6b-F23: verify orphan cleanup',
    prBody: '## SESSION REPORT\nSlice: S6b-F23\nStatus: done',
  },
  { platformText: s6bDonePlatform },
);
assert.equal(f23Done.action, 'notify');
assert.equal(f23Done.gatesPass, false);
assert.equal(f23Done.chainMode, 's6b-terminal');
assert.match(f23Done.reason, /complete/i);

// S6b-F24 merged → notify (terminal + inventory empty)
const f24Done = planRalphChain(
  {
    mergedSlice: 'S6b-F24',
    prTitle: 'PLATFORM S6b-F24: chain closeout',
    prBody: '## SESSION REPORT\nSlice: S6b-F24\nStatus: done',
  },
  { platformText: s6bDonePlatform },
);
assert.equal(f24Done.action, 'notify');
assert.equal(f24Done.gatesPass, false);
assert.equal(f24Done.chainMode, 's6b-terminal');

// CATALOG-MATCH doc-driven chain (WORKFLOW-P14)
assert.equal(extractMergedSliceId('CDRIVE-7: Company Drive permissions UI'), 'CDRIVE-7');
assert.equal(extractMergedSliceId('CATALOG-MATCH CM6: backfill + exit soak'), 'CM6');
assert.equal(extractMergedSliceId('REPO-H RH7: functions library dead code'), 'RH7');
assert.equal(nextSliceId('RH6'), 'RH7');
assert.equal(canAutoChain(sliceMetaFor('RH6')), true);
assert.equal(canAutoChain(sliceMetaFor('CM1')), false);

const rh11Chain = planRalphChain({
  prTitle: 'REPO-H RH11: orders FS fallback',
  prBody: '## SESSION REPORT\nSlice: RH11\nStatus: done\nWhat shipped: orders board Supabase-only',
});
assert.equal(rh11Chain.mergedSlice, 'RH11');
assert.equal(rh11Chain.action, 'chain');
assert.equal(rh11Chain.nextSlice, 'RH12');
assert.equal(rh11Chain.masterDoc, 'docs/projects/repo-health-master.md');

const rh12Chain = planRalphChain({
  prTitle: 'REPO-H RH12: creative FS fallback',
  prBody: '## SESSION REPORT\nSlice: RH12\nStatus: done\nWhat shipped: creative read Supabase-only',
});
assert.equal(rh12Chain.mergedSlice, 'RH12');
assert.equal(rh12Chain.action, 'chain');
assert.equal(rh12Chain.nextSlice, 'RH13');
assert.equal(rh12Chain.masterDoc, 'docs/projects/repo-health-master.md');

// RTE-F doc-driven chain (WORKFLOW-P14)
assert.equal(extractMergedSliceId('RTE-F1: subscription session hub'), 'RTE-F1');
assert.equal(extractMergedSliceId('## SESSION REPORT\nSlice: RTE-F1\nStatus: done'), 'RTE-F1');
assert.equal(nextSliceId('RTE-F1'), 'RTE-F2');
assert.equal(canAutoChain(sliceMetaFor('RTE-F1')), true);
assert.equal(sliceMetaFor('RTE-F1')?.masterDoc, 'docs/projects/rte-foundation-master.md');

const rteF1Chain = planRalphChain({
  prTitle: 'RTE-F1: subscription session hub',
  prBody: '## SESSION REPORT\nSlice: RTE-F1\nStatus: done\nWhat shipped: ProjectStatusSession',
});
assert.equal(rteF1Chain.mergedSlice, 'RTE-F1');
assert.equal(rteF1Chain.action, 'chain');
assert.equal(rteF1Chain.nextSlice, 'RTE-F2');
assert.equal(rteF1Chain.masterDoc, 'docs/projects/rte-foundation-master.md');

const rteF2Chain = planRalphChain({
  prTitle: 'RTE-F2: layout export enqueue writer (Supabase-first)',
  prBody: '## SESSION REPORT\nSlice: RTE-F2\nStatus: done',
});
assert.equal(rteF2Chain.mergedSlice, 'RTE-F2');
assert.equal(rteF2Chain.action, 'chain');
assert.equal(rteF2Chain.nextSlice, 'RTE-F3');
assert.equal(rteF2Chain.chatRename, 'RTE-F RTE-F3 · layout export terminal sync');

const workflowPlusRteF3 = planRalphChain({
  prTitle: 'WORKFLOW-P16 + RTE-F3: Ralph Automation VM fix + layout terminal writer',
  prBody:
    '## SESSION REPORT\nSlice: RTE-F3\nStatus: done\nWhat shipped:\n- terminal writer',
});
assert.equal(workflowPlusRteF3.mergedSlice, 'RTE-F3');
assert.equal(workflowPlusRteF3.action, 'chain');
assert.equal(workflowPlusRteF3.nextSlice, 'RTE-F4');
assert.equal(workflowPlusRteF3.chainMode, 'serial');

// PR #343 — docs planning decomposition must NOT chain (false RTE-F1 from title range)
const rtePlanningTitle = 'docs(RTE-F): Wave 1 vertical slice decomposition (RTE-F1–F10)';
const rtePlanningBody =
  '## SESSION REPORT\nSlice: planning (slice decomposition)\nStatus: done\nWhat shipped: slice cards';
assert.equal(isMaintenancePr(rtePlanningTitle, rtePlanningBody), true);
assert.equal(extractMergedSliceId(`${rtePlanningTitle}\n${rtePlanningBody}`), null);
const rtePlanningChain = planRalphChain({
  prTitle: rtePlanningTitle,
  prBody: rtePlanningBody,
});
assert.equal(rtePlanningChain.action, 'notify');
assert.equal(rtePlanningChain.chainMode, 'skip-maintenance');

// PR #348 — combined WORKFLOW-P16 + RTE-F3 must chain to RTE-F4 (not skip as maintenance)
const pr348Body = `## SESSION REPORT
- Program: WORKFLOW + RTE-F
- Slice: RTE-F3
- Status: done
What shipped: commitLayoutJobPhase terminal writer`;
assert.equal(isMaintenancePr('WORKFLOW-P16 + RTE-F3: Ralph fix + layout terminal writer', pr348Body), false);
const pr348Chain = planRalphChain({
  prTitle: 'WORKFLOW-P16 + RTE-F3: Ralph Automation VM fix + layout terminal writer',
  prBody: pr348Body,
});
assert.equal(pr348Chain.mergedSlice, 'RTE-F3');
assert.equal(pr348Chain.action, 'chain');
assert.equal(pr348Chain.nextSlice, 'RTE-F4');
assert.equal(pr348Chain.chainMode, 'serial');

// REPO-H serial chain (Lane H)
import { loadMasterRegistry, clearMasterRegistryCache } from './ralph-master-registry.mjs';

clearMasterRegistryCache();
const repoRegistry = loadMasterRegistry();
assert.ok(repoRegistry.has('RH1'), 'RH1 in registry');
assert.ok(repoRegistry.has('RH21'), 'RH21 in registry');
assert.equal(repoRegistry.get('RH1')?.onSuccess, 'RH2');
assert.equal(repoRegistry.get('RH20')?.onSuccess, 'RH21');
assert.equal(repoRegistry.get('RH1')?.autonomy, 'AFK');
assert.equal(repoRegistry.get('RH1')?.masterDoc, 'docs/projects/repo-health-master.md');

assert.equal(extractMergedSliceId('REPO-H RH1 · orphan GCP purge'), 'RH1');
assert.equal(extractMergedSliceId('## SESSION REPORT\nSlice: RH5\nStatus: done'), 'RH5');
assert.equal(nextSliceId('RH1'), 'RH2');
assert.equal(nextSliceId('RH20'), 'RH21');
assert.equal(nextSliceId('RH21'), null);
assert.equal(canAutoChain(sliceMetaFor('RH1')), true);
assert.equal(subLaneFor('RH1'), 'H-repo-health');

const rh1Chain = planRalphChain({
  prTitle: 'REPO-H RH1 · orphan GCP purge',
  prBody: '## SESSION REPORT\nSlice: RH1\nStatus: done\nWhat shipped: deleted orphan GCP\nExit test: PASS',
});
assert.equal(rh1Chain.mergedSlice, 'RH1');
assert.equal(rh1Chain.action, 'chain');
assert.equal(rh1Chain.nextSlice, 'RH2');
assert.equal(rh1Chain.chainMode, 'serial');
assert.equal(rh1Chain.masterDoc, 'docs/projects/repo-health-master.md');
assert.equal(rh1Chain.chatRename, 'REPO-H RH2 · archive migration A');

const rh0Docs = planRalphChain({
  prTitle: 'docs: REPO-H program PRD — repo health & legacy cleanup',
  prBody: '## SESSION REPORT\nPlanning PR — module inventory in §5\nStatus: done',
});
assert.equal(rh0Docs.action, 'notify');
assert.equal(rh0Docs.chainMode, 'skip-maintenance');

// PR #409 pattern — STATUS-only closeout must not chain or re-launch RH5
const rh4StatusCloseout = planRalphChain({
  prTitle: 'REPO-H RH4: STATUS closeout after #408',
  prBody:
    'STATUS closeout for RH4 merge #408 — clear RALPH_RUNNING, set LAST_MERGED_PR, advance queue to RH5.',
});
assert.equal(rh4StatusCloseout.action, 'notify');
assert.equal(rh4StatusCloseout.chainMode, 'skip-maintenance');

// DS-CLEAN serial chain (Lane I)
clearMasterRegistryCache();
const dsRegistry = loadMasterRegistry();
assert.ok(dsRegistry.has('DS1'), 'DS1 in registry');
assert.ok(dsRegistry.has('DS12'), 'DS12 in registry');
assert.equal(dsRegistry.get('DS1')?.onSuccess, 'DS2');
assert.equal(dsRegistry.get('DS11')?.onSuccess, 'DS12');
assert.equal(dsRegistry.get('DS1')?.autonomy, 'AFK');
assert.equal(dsRegistry.get('DS3')?.autonomy, 'AFK');
assert.equal(dsRegistry.get('DS5')?.autonomy, 'AFK');
assert.equal(dsRegistry.get('DS11')?.autonomy, 'AFK');
assert.equal(dsRegistry.get('DS1')?.masterDoc, 'docs/projects/ds-clean-master.md');

assert.equal(extractMergedSliceId('DS-CLEAN DS1 · dead GCP arms'), 'DS1');
assert.equal(nextSliceId('DS1'), 'DS2');
assert.equal(nextSliceId('DS11'), 'DS12');
assert.equal(nextSliceId('DS12'), null);
assert.equal(subLaneFor('DS1'), 'I-ds-clean');

const dsCleanIdleSnapshot = `
## STATUS DASHBOARD
\`\`\`text
ACTIVE_PROGRAM: DS-CLEAN
BLOCKED_BY: none
AFK_QUEUE: DS2 | DS3
RALPH_RUNNING: none
\`\`\`
`;

const ds1Chain = planRalphChain(
  {
    prTitle: 'DS-CLEAN DS1 · dead GCP arms',
    prBody:
      '## SESSION REPORT\nSlice: DS1\nStatus: done\nWhat shipped: removed dead GCP arms\nExit test: PASS',
  },
  { dsCleanText: dsCleanIdleSnapshot },
);
assert.equal(ds1Chain.mergedSlice, 'DS1');
assert.equal(ds1Chain.action, 'chain');
assert.equal(ds1Chain.nextSlice, 'DS2');
assert.equal(ds1Chain.masterDoc, 'docs/projects/ds-clean-master.md');
assert.equal(ds1Chain.chatRename, 'DS-CLEAN DS2 · board reads off FS');

// WORKFLOW-P18 — stale RALPH_RUNNING for merged slice must not block chain
assert.deepEqual(effectiveRalphRunning(['DS5'], 'DS5'), []);
const ds5StaleRunning = `
## STATUS DASHBOARD
\`\`\`text
BLOCKED_BY: none
AFK_QUEUE: DS6 | DS7
RALPH_RUNNING: DS5
\`\`\`
`;
const ds5Chain = planRalphChain(
  {
    prTitle: 'DS-CLEAN DS5: design families Supabase CRUD cutover',
    prBody: '## SESSION REPORT\nSlice: DS5\nStatus: done\nExit test: PASS',
  },
  { dsCleanText: ds5StaleRunning },
);
assert.equal(ds5Chain.mergedSlice, 'DS5');
assert.equal(ds5Chain.action, 'chain');
assert.equal(ds5Chain.nextSlice, 'DS6');
assert.equal(ds5Chain.gatesPass, true);

const ds0Chain = planRalphChain(
  {
    prTitle: 'DS-CLEAN DS0: Design Studio cleanup PRD + Ralph slices',
    prBody:
      '## SESSION REPORT\nSlice: DS0\nStatus: done\nWhat shipped: PRD + Ralph slices\nExit test: PASS',
  },
  { dsCleanText: dsCleanIdleSnapshot },
);
assert.equal(ds0Chain.mergedSlice, 'DS0');
assert.equal(ds0Chain.action, 'chain');
assert.equal(ds0Chain.nextSlice, 'DS1');
assert.equal(ds0Chain.masterDoc, 'docs/projects/ds-clean-master.md');

const ds2ToDs3 = planRalphChain(
  {
    prTitle: 'DS-CLEAN DS2 · board reads off FS',
    prBody: '## SESSION REPORT\nSlice: DS2\nStatus: done\nWhat shipped: board reads\nExit test: PASS',
  },
  { dsCleanText: dsCleanIdleSnapshot },
);
assert.equal(ds2ToDs3.nextSlice, 'DS3');
assert.equal(ds2ToDs3.action, 'chain');
assert.equal(ds2ToDs3.gatesPass, true);
assert.equal(ds2ToDs3.chainMode, 'serial');

const ds3Meta = sliceMetaFor('DS3');
assert.equal(ds3Meta?.autonomy, 'AFK');
assert.equal(canAutoChain(ds3Meta), true);

// AB — App Builder serial chain (Lane D)
clearMasterRegistryCache();
const abRegistry = loadMasterRegistry();
assert.ok(abRegistry.has('AB-1'), 'AB-1 in registry');
assert.ok(abRegistry.has('AB-15'), 'AB-15 in registry');
assert.equal(abRegistry.get('AB-1')?.onSuccess, 'AB-2');
assert.equal(abRegistry.get('AB-14')?.onSuccess, 'AB-15');
assert.equal(abRegistry.get('AB-15')?.onSuccess, null);
assert.equal(abRegistry.get('AB-1')?.autonomy, 'AFK');
assert.equal(abRegistry.get('AB-1')?.masterDoc, 'docs/projects/ab-master.md');

assert.equal(extractMergedSliceId('AB-1: App Builder Design Studio tool shell'), 'AB-1');
assert.equal(extractMergedSliceId('AB AB-1 · Design Studio tool shell'), 'AB-1');
assert.equal(
  extractMergedSliceId(
    'AB-1: App Builder\n<!-- CURSOR -->\n## SESSION REPORT\n\n**Slice:** AB-1  \n**Status:** ready',
  ),
  'AB-1',
);
assert.equal(nextSliceId('AB-1'), 'AB-2');
assert.equal(nextSliceId('AB-14'), 'AB-15');
assert.equal(nextSliceId('AB-15'), null);
assert.equal(subLaneFor('AB-2'), 'D-ab');

const abIdleSnapshot = `
## STATUS DASHBOARD
\`\`\`text
ACTIVE_PROGRAM: AB
ACTIVE_SLICE: AB-1
BLOCKED_BY: none
AFK_QUEUE: AB-2 | AB-3 | AB-4
RALPH_RUNNING: none
\`\`\`
`;

const ab1Chain = planRalphChain(
  {
    prTitle: 'AB-1: App Builder Design Studio tool shell',
    prBody:
      '## SESSION REPORT\n\n**Slice:** AB-1  \n**Status:** ready for merge\nWhat shipped: tool shell\nExit test: PASS',
  },
  { abText: abIdleSnapshot },
);
assert.equal(ab1Chain.mergedSlice, 'AB-1');
assert.equal(ab1Chain.action, 'chain');
assert.equal(ab1Chain.nextSlice, 'AB-2');
assert.equal(ab1Chain.masterDoc, 'docs/projects/ab-master.md');
assert.equal(ab1Chain.chatRename, 'AB AB-2 · wheel dev preview');
assert.equal(ab1Chain.chainMode, 'serial');
assert.equal(ab1Chain.gatesPass, true);

// IWA doc-driven chain (AFK-first Wave V1 + Wave V2)
clearMasterRegistryCache();
const iwaRegistry = loadMasterRegistry();
assert.ok(iwaRegistry.has('IWA-1'), 'IWA-1 in registry');
assert.ok(iwaRegistry.has('IWA-10'), 'IWA-10 in registry');
assert.ok(iwaRegistry.has('IWA-11'), 'IWA-11 in registry');
assert.ok(iwaRegistry.has('IWA-16'), 'IWA-16 in registry');
assert.equal(iwaRegistry.get('IWA-1')?.onSuccess, 'IWA-2');
assert.equal(iwaRegistry.get('IWA-9')?.onSuccess, 'IWA-10');
assert.equal(iwaRegistry.get('IWA-10')?.onSuccess, 'IWA-11');
assert.equal(iwaRegistry.get('IWA-11')?.onSuccess, 'IWA-12');
assert.equal(iwaRegistry.get('IWA-14')?.onSuccess, 'IWA-15');
assert.equal(iwaRegistry.get('IWA-15')?.onSuccess, 'IWA-16');
assert.equal(iwaRegistry.get('IWA-15')?.autonomy, 'AFK');
assert.equal(iwaRegistry.get('IWA-15')?.ceoGate, 'none');
assert.equal(iwaRegistry.get('IWA-15')?.mergePolicy, 'auto_when_green');
assert.equal(iwaRegistry.get('IWA-16')?.onSuccess, null);
assert.equal(iwaRegistry.get('IWA-1')?.autonomy, 'AFK');
assert.equal(iwaRegistry.get('IWA-1')?.masterDoc, 'docs/projects/iwa-master.md');

assert.equal(extractMergedSliceId('IWA IWA-1 · DS catalog primitives'), 'IWA-1');
assert.equal(extractMergedSliceId('## SESSION REPORT\nSlice: IWA-1\nStatus: done'), 'IWA-1');
assert.equal(nextSliceId('IWA-1'), 'IWA-2');
assert.equal(nextSliceId('IWA-9'), 'IWA-10');
assert.equal(nextSliceId('IWA-10'), 'IWA-11');
assert.equal(nextSliceId('IWA-14'), 'IWA-15');
assert.equal(nextSliceId('IWA-16'), null);
assert.equal(canAutoChain(sliceMetaFor('IWA-1')), true);
assert.equal(canAutoChain(sliceMetaFor('IWA-10')), true);
assert.equal(canAutoChain(sliceMetaFor('IWA-14')), true);
assert.equal(canAutoChain(sliceMetaFor('IWA-15')), true);

const iwa1Chain = planRalphChain({
  prTitle: 'IWA IWA-1 · DS catalog primitives',
  prBody:
    '## SESSION REPORT\nSlice: IWA-1\nStatus: done\nWhat shipped: CollectionNavSidebar\nExit test: PASS',
});
assert.equal(iwa1Chain.mergedSlice, 'IWA-1');
assert.equal(iwa1Chain.action, 'chain');
assert.equal(iwa1Chain.nextSlice, 'IWA-2');
assert.equal(iwa1Chain.masterDoc, 'docs/projects/iwa-master.md');
assert.equal(iwa1Chain.chainMode, 'serial');
assert.notEqual(iwa1Chain.nextSlice, 'W15');

const iwa14Chain = planRalphChain({
  prTitle: 'IWA IWA-14 · cleanup script dry-run',
  prBody: '## SESSION REPORT\nSlice: IWA-14\nStatus: done\nExit test: PASS',
});
assert.equal(iwa14Chain.mergedSlice, 'IWA-14');
assert.equal(iwa14Chain.action, 'chain');
assert.equal(iwa14Chain.nextSlice, 'IWA-15');
assert.equal(iwa14Chain.gatesPass, true);

const iwaPlanningTitle = 'docs(IWA): Wave V2 vertical slices — tracer bullets';
const iwaPlanningBody = '## SESSION REPORT\nSlice: none (planning)\nStatus: done';
assert.equal(isMaintenancePr(iwaPlanningTitle, iwaPlanningBody), true);
const iwaPlanningChain = planRalphChain({
  prTitle: iwaPlanningTitle,
  prBody: iwaPlanningBody,
});
assert.equal(iwaPlanningChain.action, 'notify');
assert.equal(iwaPlanningChain.chainMode, 'skip-maintenance');

// FM — Final migration serial chain (Lane J)
clearMasterRegistryCache();
const fmRegistry = loadMasterRegistry();
assert.ok(fmRegistry.has('FM-0'), 'FM-0 in registry');
assert.ok(fmRegistry.has('FM-10'), 'FM-10 in registry');
assert.equal(fmRegistry.get('FM-0')?.onSuccess, 'FM-1');
assert.equal(fmRegistry.get('FM-9')?.onSuccess, 'FM-10');
assert.equal(fmRegistry.get('FM-10')?.onSuccess, null);
assert.equal(fmRegistry.get('FM-0')?.autonomy, 'AFK');
assert.equal(fmRegistry.get('FM-0')?.masterDoc, 'docs/projects/fm-master.md');
assert.equal(fmRegistry.get('FM-0')?.program, 'FM');

assert.equal(extractMergedSliceId('FM FM-0 · inventory rewrite map'), 'FM-0');
assert.equal(extractMergedSliceId('FM-2 · workflow templates rewrite'), 'FM-2');
assert.equal(extractMergedSliceId('## SESSION REPORT\nSlice: FM-5\nStatus: done'), 'FM-5');
assert.equal(nextSliceId('FM-0'), 'FM-1');
assert.equal(nextSliceId('FM-9'), 'FM-10');
assert.equal(nextSliceId('FM-10'), null);
assert.equal(canAutoChain(sliceMetaFor('FM-0')), true);
assert.equal(subLaneFor('FM-0'), 'J-fm');

const fmIdleSnapshot = `
## STATUS DASHBOARD
\`\`\`text
ACTIVE_PROGRAM: FM
BLOCKED_BY: none
AFK_QUEUE: FM-1 | FM-2 | FM-3
RALPH_RUNNING: none
\`\`\`
`;

const fm0Chain = planRalphChain(
  {
    prTitle: 'FM FM-0 · inventory rewrite map',
    prBody:
      '## SESSION REPORT\nSlice: FM-0\nStatus: done\nWhat shipped: inventory + rewrite map\nExit test: PASS',
  },
  { fmText: fmIdleSnapshot },
);
assert.equal(fm0Chain.mergedSlice, 'FM-0');
assert.equal(fm0Chain.action, 'chain');
assert.equal(fm0Chain.nextSlice, 'FM-1');
assert.equal(fm0Chain.masterDoc, 'docs/projects/fm-master.md');
assert.equal(fm0Chain.chatRename, 'FM FM-1 · runtime CDN resolver');
assert.equal(fm0Chain.chainMode, 'serial');
assert.equal(fm0Chain.gatesPass, true);

const fm9DuringSoak = planRalphChain(
  {
    prTitle: 'FM FM-9 · soak gate',
    prBody: '## SESSION REPORT\nSlice: FM-9\nStatus: done\nExit test: PASS',
  },
  {
    fmText: `
## STATUS DASHBOARD
\`\`\`text
FM_SOAK_START: 2026-07-01
FM_SOAK_END: 2026-07-31
BLOCKED_BY: none
\`\`\`
`,
  },
);
assert.equal(fm9DuringSoak.nextSlice, 'FM-10');
assert.equal(fm9DuringSoak.action, 'notify');
assert.equal(fm9DuringSoak.gatesPass, false);
assert.equal(fm9DuringSoak.chainMode, 'fm-soak-wait');

const fm9Terminal = planRalphChain(
  {
    prTitle: 'FM FM-9 · soak gate',
    prBody: '## SESSION REPORT\nSlice: FM-9\nStatus: done\nExit test: PASS',
  },
  {
    fmText: `
## STATUS DASHBOARD
\`\`\`text
FM_SOAK_START: 2026-05-01
FM_SOAK_END: 2026-05-31
BLOCKED_BY: none
\`\`\`
`,
  },
);
assert.equal(fm9Terminal.nextSlice, 'FM-10');
assert.equal(fm9Terminal.action, 'chain');
assert.equal(fm9Terminal.gatesPass, true);

const fm10Terminal = planRalphChain({
  prTitle: 'FM FM-10 · storage delete closeout',
  prBody: '## SESSION REPORT\nSlice: FM-10\nStatus: done\nExit test: PASS',
});
assert.equal(fm10Terminal.nextSlice, null);
assert.equal(fm10Terminal.action, 'notify');

// FM planning PR (#465) — must not false-chain FM-0 → FM-1
const fmPlanningPr = planRalphChain({
  prTitle: 'FM: vertical slices FM-0…FM-10 + Ralph Lane J chain',
  prBody:
    '## SESSION REPORT\nSlice: FM planning (pre-FM-0)\nStatus: ready for merge\nPlanning only — no production data changed.',
});
assert.equal(fmPlanningPr.mergedSlice, null);
assert.equal(fmPlanningPr.action, 'notify');
assert.equal(fmPlanningPr.chainMode, 'skip-maintenance');

// FM-8 SESSION REPORT — must chain FM-9 (not false-positive on "Pre-existing" or **Slice:** markdown)
const fm8PrBody = `## SESSION REPORT

**Slice:** FM-8
**Status:** done

### What shipped
Storage fallback removal.

### Exit tests
| E1 | fm:verify-storage-fallback-removal | PASS |

Pre-existing test-suite reds unchanged.

### STATUS
- NEXT_PROMPT: FM-9
`;
assert.equal(isMaintenancePr('FM-8: storage upload fallback removal', fm8PrBody), false);
const fm8Chain = planRalphChain({
  prTitle: 'FM-8: storage upload fallback removal',
  prBody: fm8PrBody,
});
assert.equal(fm8Chain.mergedSlice, 'FM-8');
assert.equal(fm8Chain.nextSlice, 'FM-9');
assert.equal(fm8Chain.action, 'chain');
assert.equal(fm8Chain.gatesPass, true);

console.log('ralph-chain.test.mjs: all PASS');
