#!/usr/bin/env node
/**
 * kit-drift-check.mjs — the kit is the source, and drift goes red (AFKF-1).
 *
 * Compares every kit-owned path in `kit-manifest.json` against this repo's copy.
 * Exits 1 when any copy has diverged, and prints BOTH the file list and WHICH
 * SIDE IS NEWER — a check that only says "different" makes the next agent guess.
 *
 * Runs unchanged in a live repo (checks `repoPath`) and inside the kit itself
 * (checks `kitPath`, i.e. "is the manifest still true about my own files").
 *
 * Usage: node scripts/kit-drift-check.mjs [--json] [--root <dir>]
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * The kit checks its own copies; a live repo checks the installed ones.
 *
 * Identified by two files that exist ONLY in the kit, by design and by contract:
 * `install.sh` (a repo is installed *into*, it does not carry the installer) and
 * `scripts/kit-manifest-build.mjs` (install.sh explicitly refuses to copy it — building the
 * manifest is the kit's job, checking against it is the repo's).
 *
 * This used to key off a `claude/rules/` directory. When the rules tree was renamed the kit
 * stopped recognising itself, silently fell through to the repo paths, and reported every
 * kit-owned file as "missing" — a check that fails loudly for the wrong reason is only one
 * step better than one that passes for the wrong reason. Never key this off a path the kit's
 * own layout is free to rename.
 */
export function isKitRoot(root) {
  return (
    existsSync(join(root, 'install.sh')) &&
    existsSync(join(root, 'scripts', 'kit-manifest-build.mjs'))
  );
}

export function localPathFor(entry, root) {
  return isKitRoot(root) ? entry.kitPath : entry.repoPath;
}

function gitDate(root, relPath) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', relPath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** True when the working tree copy has edits git has not recorded yet. */
export function hasUncommittedEdit(root, relPath) {
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--', relPath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/** Which side moved last. Never guesses: says "unknown" when it cannot tell. */
export function newerSide(localDate, kitDate) {
  if (!localDate || !kitDate) return 'unknown';
  if (localDate === kitDate) return 'same';
  return localDate > kitDate ? 'repo' : 'kit';
}

export function checkManifest(manifest, root, { readDate = gitDate, readDirty = hasUncommittedEdit } = {}) {
  const findings = [];
  let checked = 0;
  for (const entry of manifest.files) {
    const rel = localPathFor(entry, root);
    const abs = join(root, rel);
    const present = existsSync(abs);

    if (entry.check === 'seed') {
      // Repo-coupled on purpose: these carry the repo's own slice ids, program
      // maps and registry, and the universal helpers are not split out of them
      // yet. The kit ships a starting copy for a NEW repo; an existing repo owns
      // its own, so neither its bytes nor its presence is checked here. Listing
      // them is still the point — it says out loud which files the kit cannot
      // yet be the source of.
      void present;
      continue;
    }

    checked += 1;
    if (!present) {
      findings.push({ path: rel, reason: 'missing', newer: 'kit', kind: entry.kind, check: 'hash' });
      continue;
    }
    if (sha256File(abs) === entry.sha256) continue;

    const localDate = readDate(root, rel);
    // An edit made in place is the whole thing this check exists to catch, and it
    // is invisible to commit dates — both sides still point at the same commit.
    const dirty = readDirty(root, rel);
    findings.push({
      path: rel,
      reason: 'content-differs',
      newer: dirty ? 'repo-uncommitted' : newerSide(localDate, entry.updatedAt ?? null),
      localDate,
      kitDate: entry.updatedAt ?? null,
      kind: entry.kind,
      check: 'hash',
    });
  }
  return { checked, total: manifest.files.length, findings };
}

function advice(f) {
  if (f.reason === 'missing') {
    return 'the kit owns this file and this repo does not have it — install it from the kit';
  }
  if (f.newer === 'repo-uncommitted') {
    return 'THIS REPO was edited in place and not committed — that edit belongs in the kit: make it in cursor-workflow-kit, rebuild the manifest, then re-install into every repo';
  }
  if (f.newer === 'repo') {
    return 'THIS REPO is newer — the edit belongs in the kit: run kit-manifest-build.mjs --from <this repo> --apply in the kit, then re-sync every repo';
  }
  if (f.newer === 'same') {
    return 'both sides last moved in the same commit but the bytes differ — someone edited one copy in place; the kit is the source, so fix it there';
  }
  if (f.newer === 'kit') {
    return 'THE KIT is newer — this repo is stale: copy the kit copy over this file';
  }
  return 'cannot tell which side is newer (no git history for this path) — compare by hand before copying either way';
}

function main() {
  const argv = process.argv.slice(2);
  const rootIdx = argv.indexOf('--root');
  const root = rootIdx === -1 ? DEFAULT_ROOT : resolve(argv[rootIdx + 1]);
  const asJson = argv.includes('--json');

  const manifestPath = join(root, 'kit-manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`FAIL: no kit-manifest.json at ${root}`);
    console.error('The manifest is the contract. Copy it from cursor-workflow-kit.');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const result = checkManifest(manifest, root);

  if (asJson) {
    console.log(JSON.stringify({ root, kitVersion: manifest.kitVersion, ...result }, null, 2));
    process.exit(result.findings.length ? 1 : 0);
  }

  const where = isKitRoot(root) ? 'kit' : 'repo';
  console.log(`kit drift check — ${where} at ${root}`);
  const seedCount = manifest.files.filter((f) => f.check === 'seed').length;
  console.log(`  kit version ${manifest.kitVersion} · ${manifest.files.length} kit-owned paths · ${result.checked} hash-checked · ${seedCount} repo-coupled (seed, not checked)`);

  if (!result.findings.length) {
    console.log('\nOK: no drift. Every kit-owned file matches the kit.');
    process.exit(0);
  }

  console.log(`\nDRIFT: ${result.findings.length} file(s) diverged from the kit.\n`);
  for (const f of result.findings) {
    console.log(`  ${f.path}`);
    console.log(`    ${f.reason}${f.reason === 'content-differs' ? ` · newer side: ${f.newer}` : ''}`);
    if (f.reason === 'content-differs') {
      console.log(`    repo last change: ${f.localDate ?? 'unknown'}`);
      console.log(`    kit  last change: ${f.kitDate ?? 'unknown'}`);
    }
    console.log(`    → ${advice(f)}`);
  }
  console.log('\nThe workflow is written once. Edit it in cursor-workflow-kit, not in place.');
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
