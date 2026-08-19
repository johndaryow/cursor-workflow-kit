import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideNextStep,
  stepDone,
  extractDashboard,
  docPathFromLine,
  masterDocRelPath,
  masterDocMatchesMain,
} from './mc-planning-handoff.mjs';

const DASHBOARD = `## STATUS DASHBOARD

\`\`\`text
ACTIVE_PROGRAM: COURSES
GRILL: ✅ 2026-08-16 — brief.md — CEO confirmed
PRD: ✅ docs/projects/courses-prd.md — 2026-08-16
SLICING: ⛔ not started — fresh session
\`\`\`

---
rest of doc`;

describe('decideNextStep', () => {
  it('asks for the grill when nothing is done', () => {
    assert.equal(decideNextStep({ grillDone: false, prdDone: false, slicingDone: false }), 'grill');
  });

  it('asks for the PRD once the grill is confirmed', () => {
    assert.equal(decideNextStep({ grillDone: true, prdDone: false, slicingDone: false }), 'prd');
  });

  it('asks for slices once the PRD is written', () => {
    assert.equal(decideNextStep({ grillDone: true, prdDone: true, slicingDone: false }), 'slicing');
  });

  it('hands over to execution when planning is complete', () => {
    assert.equal(decideNextStep({ grillDone: true, prdDone: true, slicingDone: true }), 'execution');
  });

  it('never skips a step just because a later one is marked done', () => {
    // A doc claiming SLICING ✅ with no PRD is a doc that is wrong; the chain still
    // goes back for the PRD rather than planning slices against nothing.
    assert.equal(decideNextStep({ grillDone: true, prdDone: false, slicingDone: true }), 'prd');
  });
});

describe('stepDone', () => {
  const dash = extractDashboard(DASHBOARD);

  it('counts a ✅ line as done', () => {
    assert.equal(stepDone(dash, 'GRILL'), true);
    assert.equal(stepDone(dash, 'PRD'), true);
  });

  it('does not count a ⛔ line as done', () => {
    assert.equal(stepDone(dash, 'SLICING'), false);
  });

  it('treats a missing line as not done', () => {
    assert.equal(stepDone(dash, 'NOSUCHKEY'), false);
  });

  it('does not match a key that is only a substring of another line', () => {
    const d = extractDashboard('## STATUS DASHBOARD\nSOMEPRD: ✅ yes\n\n---');
    assert.equal(stepDone(d, 'PRD'), false);
  });
});

describe('extractDashboard', () => {
  it('stops at the first horizontal rule', () => {
    assert.ok(!extractDashboard(DASHBOARD).includes('rest of doc'));
  });

  it('returns empty when the doc has no dashboard', () => {
    assert.equal(extractDashboard('# just a doc'), '');
  });
});

describe('docPathFromLine', () => {
  it('finds the doc a step points at', () => {
    assert.equal(docPathFromLine(extractDashboard(DASHBOARD), 'PRD'), 'docs/projects/courses-prd.md');
  });

  it('returns empty when the line names no doc', () => {
    assert.equal(docPathFromLine(extractDashboard(DASHBOARD), 'SLICING'), '');
  });
});

describe('masterDocRelPath', () => {
  it('maps a program code to its master doc', () => {
    assert.equal(masterDocRelPath('COURSES'), 'docs/projects/courses-master.md');
  });

  it('keeps the platform special case', () => {
    assert.equal(masterDocRelPath('platform'), 'docs/projects/platform-migration-master.md');
  });
});

describe('masterDocMatchesMain — the staleness guard', () => {
  // The comparison itself is a git call, so the unit test pins the contract the CLI relies
  // on: three states, and "cannot tell" is its own answer rather than a silent yes.
  it('exports a comparison the CLI can branch on', () => {
    assert.equal(typeof masterDocMatchesMain, 'function');
  });



  it('never answers "stale" for a path that does not exist on either side', () => {
    // A nonexistent path differs from nothing, so it must not be reported as stale — that
    // would block the hand-off on a file the chain does not use. true or null, never false.
    const verdict = masterDocMatchesMain('no/such/path/at/all.md');
    assert.notEqual(verdict, false);
  });

  it('only ever returns one of the three documented states', () => {
    const verdict = masterDocMatchesMain('scripts/mc-planning-handoff.mjs');
    assert.ok([true, false, null].includes(verdict), `unexpected verdict: ${String(verdict)}`);
  });
});
