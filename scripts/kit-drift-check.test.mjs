#!/usr/bin/env node
/**
 * Tests for kit-drift-check — the kit is the source, and drift goes red (AFKF-1).
 *
 * Runs unchanged in every repo that carries the kit: it reads the repo's own
 * kit-manifest.json, so the deploy-local guard (AFKF-D24) is enforced where the
 * manifest actually lives, not only where it was generated.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkManifest, newerSide, localPathFor, isKitRoot } from './kit-drift-check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- newerSide
assert.equal(newerSide('2026-08-18T01:00:00Z', '2026-08-16T01:00:00Z'), 'repo');
assert.equal(newerSide('2026-08-14T01:00:00Z', '2026-08-16T01:00:00Z'), 'kit');
assert.equal(newerSide('2026-08-16T01:00:00Z', '2026-08-16T01:00:00Z'), 'same');
assert.equal(newerSide(null, '2026-08-16T01:00:00Z'), 'unknown');
assert.equal(newerSide('2026-08-16T01:00:00Z', null), 'unknown');

// ------------------------------------------------------------- path mapping
const entry = { kitPath: 'rules/merging.md', repoPath: 'docs/rules/merging.md' };
const fakeKit = mkdtempSync(join(tmpdir(), 'kit-'));
mkdirSync(join(fakeKit, 'scripts'), { recursive: true });
writeFileSync(join(fakeKit, 'install.sh'), '#!/usr/bin/env bash\n');
writeFileSync(join(fakeKit, 'scripts', 'kit-manifest-build.mjs'), '// kit only\n');
assert.equal(isKitRoot(fakeKit), true);
assert.equal(localPathFor(entry, fakeKit), 'rules/merging.md');

// install.sh alone is not the kit — a repo could carry a stale copy of it.
const halfKit = mkdtempSync(join(tmpdir(), 'half-'));
writeFileSync(join(halfKit, 'install.sh'), '#!/usr/bin/env bash\n');
assert.equal(isKitRoot(halfKit), false);

const fakeRepo = mkdtempSync(join(tmpdir(), 'repo-'));
assert.equal(isKitRoot(fakeRepo), false);
assert.equal(localPathFor(entry, fakeRepo), 'docs/rules/merging.md');

// ---------------------------------------------------- the real root resolves
// The assertion the fixtures above could not make. isKitRoot decides which side of every
// manifest entry to read; when it guesses wrong, nothing errors — the check simply looks in
// a directory that does not exist and calls every file missing. That is exactly what happened
// when the kit's rules tree was renamed and this heuristic still keyed off the old name.
// Fixtures cannot catch it, because a fixture is built to match whatever the heuristic expects.
// This reads the manifest this repo actually ships and asserts the paths it resolves are real.
{
  const manifestPath = join(ROOT, 'kit-manifest.json');
  if (existsSync(manifestPath)) {
    const live = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const missing = live.files
      .map((f) => localPathFor(f, ROOT))
      .filter((rel) => !existsSync(join(ROOT, rel)));
    assert.deepEqual(
      missing,
      [],
      `localPathFor resolved ${missing.length} of ${live.files.length} kit-owned paths to files that do not exist here. ` +
        `isKitRoot(ROOT) said ${isKitRoot(ROOT)} — if that is wrong, every entry resolves to the wrong side.`,
    );
  }
}

// ------------------------------------------------------------ checkManifest
mkdirSync(join(fakeRepo, 'docs', 'rules'), { recursive: true });
writeFileSync(join(fakeRepo, 'docs', 'rules', 'merging.md'), 'same bytes\n');
// sha256 of "same bytes\n"
const sameSha = '9c2e42b3d0e3a9e0f8f0f7e2b3e0e5d5c7a1f1b1f4b6d6f5f7a4b7f0e3b2c1d0';

const good = {
  files: [
    {
      ...entry,
      kind: 'rule',
      check: 'hash',
      sha256: (await import('node:crypto')).createHash('sha256').update('same bytes\n').digest('hex'),
      updatedAt: '2026-08-16T01:00:00Z',
    },
  ],
};
assert.equal(checkManifest(good, fakeRepo).findings.length, 0, 'matching bytes must not report drift');

const stale = { files: [{ ...good.files[0], sha256: sameSha }] };
const staleResult = checkManifest(stale, fakeRepo, { readDate: () => '2026-08-18T01:00:00Z' });
assert.equal(staleResult.findings.length, 1);
assert.equal(staleResult.findings[0].reason, 'content-differs');
assert.equal(staleResult.findings[0].newer, 'repo', 'must name which side is newer, not just "different"');

// An in-place edit is invisible to commit dates: both sides point at the same
// commit. The check must still say who moved, because this is the exact case it
// exists to catch.
const dirtyResult = checkManifest(stale, fakeRepo, {
  readDate: () => '2026-08-16T01:00:00Z',
  readDirty: () => true,
});
assert.equal(dirtyResult.findings[0].newer, 'repo-uncommitted');

const missing = {
  files: [{ kitPath: 'scripts/mc-status.mjs', repoPath: 'scripts/mc-status.mjs', kind: 'script', check: 'hash', sha256: sameSha, updatedAt: null }],
};
assert.equal(checkManifest(missing, fakeRepo).findings[0].reason, 'missing');

// A seed-only file is repo-customised on purpose: present but different is fine.
mkdirSync(join(fakeRepo, 'scripts'), { recursive: true });
writeFileSync(join(fakeRepo, 'scripts', 'ralph-chain-config.mjs'), 'repo-specific slice ids\n');
const seed = {
  files: [{ kitPath: 'scripts/ralph-chain-config.mjs', repoPath: 'scripts/ralph-chain-config.mjs', kind: 'script', check: 'seed', sha256: null, updatedAt: null }],
};
assert.equal(checkManifest(seed, fakeRepo).findings.length, 0, 'a seed file that differs is not drift — the repo owns it');
const seedAbsent = { files: [{ ...seed.files[0], repoPath: 'scripts/not-here.mjs', kitPath: 'scripts/not-here.mjs' }] };
assert.equal(
  checkManifest(seedAbsent, fakeRepo).findings.length,
  0,
  'a seed file the repo never installed is not drift either — the kit only ships it to NEW repos',
);

// ------------------------------------------- AFKF-D24: deploy stays repo-local
/** Paths that must never be kit-owned, whatever the manifest says. */
const DEPLOY_LOCAL_CANARIES = [
  'firebase.json',
  '.firebaserc',
  'firestore.rules',
  'wrangler.toml',
  'scripts/deploy-pages-production.mjs',
  'scripts/theme-deploy-guard.mjs',
  '.github/workflows/theme-deploy-live.yml',
  '.github/workflows/cloudflare-worker.yml',
];

function deployLocalOffenders(manifest) {
  const patterns = (manifest.excludePatterns ?? []).map((p) => new RegExp(p));
  return manifest.files
    .map((f) => f.repoPath)
    .filter((p) => patterns.some((re) => re.test(p)) || DEPLOY_LOCAL_CANARIES.includes(p));
}

const manifestPath = join(ROOT, 'kit-manifest.json');
assert.ok(existsSync(manifestPath), 'kit-manifest.json must ship with the drift check');
const real = JSON.parse(readFileSync(manifestPath, 'utf8'));
assert.ok(real.files.length > 0, 'manifest must list kit-owned paths');
assert.ok(
  real.files.some((f) => f.check === 'seed'),
  'the manifest must say out loud which files the kit cannot yet be the source of',
);
assert.deepEqual(
  deployLocalOffenders(real),
  [],
  'AFKF-D24 — deploy steps stay repo-local and must never appear in kit-manifest.json',
);

// The guard must BITE: adding a deploy-local path has to fail.
for (const canary of DEPLOY_LOCAL_CANARIES) {
  const poisoned = { ...real, files: [...real.files, { kitPath: canary, repoPath: canary, kind: 'script', check: 'hash', sha256: sameSha, updatedAt: null }] };
  assert.equal(
    deployLocalOffenders(poisoned).includes(canary),
    true,
    `adding ${canary} to the manifest must fail this test`,
  );
}

// Every entry is well formed, and hash entries actually carry a hash.
for (const f of real.files) {
  assert.ok(f.kitPath && f.repoPath, 'every entry needs both a kit path and a repo path');
  assert.ok(f.check === 'hash' || f.check === 'seed', `unknown check mode: ${f.check}`);
  if (f.check === 'hash') assert.match(f.sha256 ?? '', /^[0-9a-f]{64}$/, `${f.repoPath} needs a sha256`);
}

console.log('kit-drift-check.test.mjs: all PASS');
