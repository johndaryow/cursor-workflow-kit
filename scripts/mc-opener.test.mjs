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

describe('rule paths follow the agent asking', () => {
  it('gives a Claude Code session .claude paths and never .cursor ones', () => {
    const block = rulesBlock('claude');
    assert.match(block, /\.claude\/rules\/workflow-core\.md/);
    assert.match(block, /\.claude\/rules\/agent-chat-session\.md/);
    assert.ok(!block.includes('.cursor/'), 'a Claude Code prompt must not cite Cursor rule paths');
    assert.ok(!sessionLine('claude').includes('Composer'), 'Composer is Cursor-only');
    assert.equal(autoMergePolicyPath('claude'), '.claude/rules/auto-merge-policy.md');
  });

  it('gives a Cursor session .cursor paths', () => {
    const block = rulesBlock('cursor');
    assert.match(block, /\.cursor\/rules\/workflow-core\.mdc/);
    assert.ok(!block.includes('.claude/'), 'a Cursor prompt must not cite Claude Code rule paths');
    assert.match(sessionLine('cursor'), /Composer/);
  });

  it('labels both when it cannot tell', () => {
    const block = rulesBlock('unknown');
    assert.match(block, /Claude Code: \.claude\/rules/);
    assert.match(block, /Cursor: \.cursor\/rules/);
  });

  it('ships exactly the two agents the repo has rules for', () => {
    assert.deepEqual(Object.keys(AGENT_PROFILES).sort(), ['claude', 'cursor']);
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
