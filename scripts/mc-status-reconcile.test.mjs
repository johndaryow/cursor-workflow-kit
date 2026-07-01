#!/usr/bin/env node
/**
 * Tests for mc-status-reconcile.mjs (WORKFLOW-P18)
 */
import assert from 'node:assert/strict';
import {
  clearMergedFromRalphRunning,
  advanceAfkQueueField,
  reconcileProgramMasterText,
  reconcilePlatformLaneRow,
  planStatusReconcile,
} from './mc-status-reconcile.mjs';

const sampleDash = `
ACTIVE_PROGRAM: DS-CLEAN
LAST_MERGED_PR: #435 DS4
LAST_PR: DS5 (in flight)
NEXT_PROMPT: §11 · DS6
AFK_QUEUE: DS6 | DS7 | DS8
RALPH_RUNNING: DS5
SLICES: DS0 ✅ · DS4 ✅ · DS5 (PR) · DS6–DS12 pending
`.trim();

const sampleMaster = `## STATUS DASHBOARD\n\`\`\`text\n${sampleDash}\n\`\`\`\n`;

const reconciled = reconcileProgramMasterText(sampleMaster, {
  mergedSlice: 'DS5',
  prNumber: '436',
  nextSlice: 'DS6',
});
assert.equal(reconciled.changed, true);
assert.match(reconciled.text, /LAST_MERGED_PR: #436 DS5/);
assert.match(reconciled.text, /RALPH_RUNNING: none/);
assert.match(reconciled.text, /LAST_PR: none/);
assert.match(reconciled.text, /DS5 ✅/);
assert.doesNotMatch(reconciled.text, /DS5 \(PR\)/);

assert.equal(clearMergedFromRalphRunning('RALPH_RUNNING: DS5 | DS6', 'DS5'), 'RALPH_RUNNING: DS6');
assert.equal(clearMergedFromRalphRunning('RALPH_RUNNING: DS5', 'DS5'), 'RALPH_RUNNING: none');

const queue = advanceAfkQueueField('AFK_QUEUE: DS5 | DS6 | DS7', 'DS5', 'DS6');
assert.match(queue, /AFK_QUEUE: DS6 \| DS7/);

const platformRow = `| **I — DS cleanup** | DS-CLEAN | \`old\` | ✅ **idle** | stale | **DS3** | 2026-06-30 |`;
const platform = `# lanes\n${platformRow}\n`;
const lane = reconcilePlatformLaneRow(platform, {
  mergedSlice: 'DS5',
  nextSlice: 'DS6',
  chatRename: 'DS-CLEAN DS6 · metrics line items',
  program: 'DS-CLEAN',
});
assert.equal(lane.changed, true);
assert.match(lane.text, /DS5 ✅/);
assert.match(lane.text, /\*\*DS6\*\*/);

const fmLaneRow = `| **J — Final migration** | FM · PLATFORM-FM | \`FM FM-0 · inventory rewrite map\` | ⚪ **ready** | **Slices planned** | **FM-0** | 2026-07-01 |`;
const fmPlatform = `# lanes\n${fmLaneRow}\n`;
const fmLane = reconcilePlatformLaneRow(fmPlatform, {
  mergedSlice: 'FM-0',
  nextSlice: 'FM-1',
  chatRename: 'FM FM-1 · runtime CDN resolver',
  program: 'FM',
});
assert.equal(fmLane.changed, true);
assert.match(fmLane.text, /FM-0 ✅/);
assert.match(fmLane.text, /🟢 \*\*running\*\*/);
assert.match(fmLane.text, /\*\*FM-1\*\*/);

const fmPlanningReconcile = planStatusReconcile({
  mergedSlice: 'FM-0',
  prNumber: '465',
  prTitle: 'FM: vertical slices FM-0…FM-10 + Ralph Lane J chain',
  prBody:
    '## SESSION REPORT\nSlice: FM planning (pre-FM-0)\nStatus: ready for merge\nPlanning only — no production data changed.',
});
assert.equal(fmPlanningReconcile.skipped, true);

console.log('mc-status-reconcile.test.mjs: all PASS');
