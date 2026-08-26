import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_PROFILES,
  detectAgent,
  rulesBlock,
  sessionLine,
  autoMergePolicyPath,
  exitPlanLine,
  masterDocRelPath,
  buildOpener,
} from './mc-opener.mjs';
import { sliceIdFromDashboardValue, chatRenameFromMaster } from './mc-chat-meta.mjs';

const always = () => true;

describe('detectAgent', () => {
  it('takes the explicit flag over anything the environment says', () => {
    assert.equal(detectAgent({ CLAUDECODE: '1' }, ['ppe-payg', '--agent=cursor']), 'cursor');
  });

  it('reads Claude Code markers', () => {
    assert.equal(detectAgent({ CLAUDECODE: '1' }, []), 'claude');
    assert.equal(detectAgent({ AI_AGENT: 'claude-code_2-1-235_agent' }, []), 'claude');
  });

  it('reads Cursor markers', () => {
    assert.equal(detectAgent({ CURSOR_AGENT: '1' }, []), 'cursor');
    assert.equal(detectAgent({ AI_AGENT: 'cursor-composer' }, []), 'cursor');
  });

  it('says unknown rather than guessing in a plain terminal', () => {
    assert.equal(detectAgent({}, []), 'unknown');
  });

  it('refuses an agent name it does not ship rules for', () => {
    assert.throws(() => detectAgent({}, ['--agent=composer']), /Unknown --agent/);
  });
});

describe('one rulebook, every agent', () => {
  // Was: "rule paths follow the agent asking" — the repo shipped the same rules in two dialects
  // (.claude/rules/*.md and .cursor/rules/*.mdc), so an agent handed the other one's paths read a
  // file it does not load. There is now one AGENTS.md read by all three tools, and these tests
  // exist to stop the dialects coming back.

  it('points every agent at the same rulebook', () => {
    for (const agent of ['claude', 'cursor', 'codex', 'unknown']) {
      const block = rulesBlock(agent);
      assert.match(block, /AGENTS\.md/, `${agent} must be pointed at AGENTS.md`);
    }
  });

  it('never cites a tool-specific rule directory', () => {
    for (const agent of ['claude', 'cursor', 'codex', 'unknown']) {
      const block = rulesBlock(agent);
      assert.ok(!block.includes('.claude/rules'), `${agent}: .claude/rules is gone`);
      assert.ok(!block.includes('.cursor/rules'), `${agent}: .cursor/rules is gone`);
    }
  });

  it('still keeps the session advice tool-specific', () => {
    assert.ok(!sessionLine('claude').includes('Composer'), 'Composer is Cursor-only');
    assert.match(sessionLine('cursor'), /Composer/);
  });

  it('names one auto-merge rule, whoever asks', () => {
    assert.equal(autoMergePolicyPath(), 'docs/rules/merging.md');
  });

  it('ships the three agents the repo is driven from', () => {
    assert.deepEqual(Object.keys(AGENT_PROFILES).sort(), ['claude', 'codex', 'cursor']);
  });

  it('gives every agent its own branch prefix', () => {
    assert.deepEqual(
      Object.values(AGENT_PROFILES).map((p) => p.branchPrefix).sort(),
      ['claude', 'codex', 'cursor'],
    );
  });
});

describe('exitPlanLine', () => {
  it('names the workers exit plan for the platform program', () => {
    assert.equal(
      exitPlanLine('platform', always),
      'EXIT PLAN (Lane B): docs/projects/workers-exit-plan.md',
    );
  });

  it('is silent for a program that has nothing to do with the workers migration', () => {
    assert.equal(exitPlanLine('ppe-payg', always), null);
    assert.equal(exitPlanLine('courses', always), null);
  });

  it('is silent when the mapped doc is not in the repo', () => {
    assert.equal(exitPlanLine('platform', () => false), null);
  });
});

describe('masterDocRelPath', () => {
  it('matches mc-planning-handoff for the named programs and the general case', () => {
    assert.equal(masterDocRelPath('workflow'), 'docs/projects/workflow-master.md');
    assert.equal(masterDocRelPath('platform'), 'docs/projects/platform-migration-master.md');
    assert.equal(masterDocRelPath('ppe-payg'), 'docs/projects/ppe-payg-master.md');
  });
});

describe('buildOpener', () => {
  const base = {
    agent: 'claude',
    program: 'ppe-payg',
    chatRename: 'PPE-PAYG PPE-PAYG-1 · alarm on a stuck payroll period',
    recommendedSlice: 'PPE-PAYG-1',
    autonomy: 'AFK',
    masterRel: 'docs/projects/ppe-payg-master.md',
    nextPrompt: '§12 PPE-PAYG-1',
    exitPlan: null,
  };

  it('prints no exit-plan line when there is no exit plan', () => {
    assert.ok(!buildOpener(base).includes('EXIT PLAN'));
  });

  it('prints the exit-plan line when there is one', () => {
    const out = buildOpener({ ...base, program: 'platform', exitPlan: 'EXIT PLAN (Lane B): x.md' });
    assert.match(out, /EXIT PLAN \(Lane B\): x\.md/);
  });

  it('tells the session to hand off with a real prompt instead of "Continue"', () => {
    const out = buildOpener(base);
    assert.match(out, /npm run mc:opener -- ppe-payg/);
    assert.match(out, /Never end by telling the/);
  });

  it('carries the slice, autonomy and chat name the chain runs on', () => {
    const out = buildOpener(base);
    assert.match(out, /Execute slice \*\*PPE-PAYG-1\*\*/);
    assert.match(out, /AUTONOMY: AFK/);
    assert.match(out, /\*\*Chat name:\*\* PPE-PAYG PPE-PAYG-1/);
  });
});

describe('sliceIdFromDashboardValue — dashboards write ids with markdown around them', () => {
  it('strips bold and the trailing sentence, leaving the bare id', () => {
    assert.equal(
      sliceIdFromDashboardValue('**LACC-20** (canary the new aligner) — its gate is satisfied'),
      'LACC-20',
    );
  });

  it('strips backticks and underscores too', () => {
    assert.equal(sliceIdFromDashboardValue('`W6d`'), 'W6d');
    assert.equal(sliceIdFromDashboardValue('_RH1_ do the thing'), 'RH1');
  });

  it('leaves a bare id alone', () => {
    assert.equal(sliceIdFromDashboardValue('LACC-20'), 'LACC-20');
  });

  it('returns empty for missing input rather than throwing', () => {
    assert.equal(sliceIdFromDashboardValue(undefined), '');
    assert.equal(sliceIdFromDashboardValue(''), '');
  });
});

describe('chatRenameFromMaster — an emphasised id must never reach new RegExp raw', () => {
  it('does not throw on an id carrying regex metacharacters', () => {
    // `**LACC-20**` used to be interpolated unescaped into the exit-plan row regex, where the
    // leading `*` is a quantifier with nothing to repeat — the whole script died (2026-08-20).
    assert.doesNotThrow(() => chatRenameFromMaster('# doc\n', '**LACC-20**'));
    assert.doesNotThrow(() => chatRenameFromMaster('# doc\n', 'A+B'));
  });
});
