import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
test('retired installer rejects without touching the destination', () => {
  const target = mkdtempSync(join(tmpdir(), 'kit-retirement-'));
  writeFileSync(join(target, 'AGENTS.md'), 'existing project instructions');
  const r = spawnSync('bash', ['install.sh', target, '--force'], {encoding:'utf8'});
  assert.equal(r.status, 1); assert.match(r.stderr, /RETIRED/);
  assert.deepEqual(readdirSync(target), ['AGENTS.md']);
  assert.equal(readFileSync(join(target, 'AGENTS.md'), 'utf8'), 'existing project instructions');
});
test('current tree distributes no skills, manifests, or workflow files', () => {
  const r = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {encoding:'utf8'});
  // Deletions are un-staged during local review: only paths still present count.
  const files = r.stdout.trim().split('\n').filter(p => { try { readFileSync(p); return true; } catch { return false; } });
  assert.deepEqual(files.sort(), ['AGENTS.md','README.md','install.sh','package.json','retirement.test.mjs'].sort());
});
