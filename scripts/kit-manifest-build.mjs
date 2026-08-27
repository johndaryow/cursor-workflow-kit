#!/usr/bin/env node
/**
 * kit-manifest-build.mjs — the kit is the source (AFKF-1).
 *
 * Measures how far a live repo's workflow copy has drifted from the kit, and
 * (with --apply) pulls the live repo's version across so the kit becomes the
 * current one, then writes `kit-manifest.json`.
 *
 * The path universe is DERIVED, never retyped:
 *   - rules   = the basenames the kit already owns, plus UNIVERSAL_RULE_ADDITIONS
 *   - skills  = the skill folders the kit already owns, walked in the source repo
 *   - scripts = glob of mc-* / ralph-* / the named workflow helpers in the source repo
 *   - actions = the chain workflows the kit already owns, plus UNIVERSAL_ACTION_ADDITIONS
 * minus EXCLUDE_PATTERNS, which keep deploy steps repo-local (AFKF-D24).
 *
 * Usage:
 *   node scripts/kit-manifest-build.mjs --from /path/to/live-repo            # measure only
 *   node scripts/kit-manifest-build.mjs --from /path/to/live-repo --apply    # copy + write manifest
 *   node scripts/kit-manifest-build.mjs --from /path/to/live-repo --json
 *   node scripts/kit-manifest-build.mjs --from /path/to/live-repo --install  # kit -> repo, never deletes
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Rules the kit does not own yet but that are universal workflow, not product. */
export const UNIVERSAL_RULE_ADDITIONS = [];

/**
 * Actions the kit does not ship yet. Deliberately short: every Action added here
 * starts burning runner minutes in three repos, and CI minutes are the real
 * ceiling (AFKF KNOWN_TRAP_2). `stale-green-pr-watch.yml` is auto-merge
 * machinery and belongs to the auto-merge slice, not to this one.
 */
export const UNIVERSAL_ACTION_ADDITIONS = ['kit-drift.yml'];

/** Non-prefixed scripts that are still universal workflow. */
export const UNIVERSAL_SCRIPT_EXTRAS = [
  'sync-agent-skills.mjs',
  'create-session-source-url-guard.mjs',
  'create-session-source-url-guard.test.mjs',
  'kit-drift-check.mjs',
  'kit-drift-check.test.mjs',
  /**
   * The docs-vs-reality checker (WORKFLOW-P39, 2026-08-26) and its suite.
   *
   * Kit-owned because the failure it catches is the workflow's, not any one product's: a plan
   * document naming an npm command or a CI check that no longer exists. Both repos carry master
   * docs, both demoted the same six workflows to `workflow_dispatch` on the same day, and a second
   * copy edited in place is exactly what `kit:drift` exists to catch.
   *
   * Its ACCEPTANCE FILE is deliberately NOT here: `docs/projects/.docs-stale-accepted.json` holds a
   * repo's own unfixed findings, which is repo data in the same sense a slice id is. The kit owns
   * the mechanism; each repo owns its entries.
   *
   * `docs-stale-check.test.mjs` builds every fixture inline rather than reading a snapshot, so it
   * stays a universal kit test instead of being classed repo-coupled by `seedClosure`.
   */
  'docs-stale-check.mjs',
  'docs-stale-check.test.mjs',
  /**
   * The hold gate and its STATIC import closure (AFKF-18b, 2026-08-26).
   *
   * `ralph-chain.mjs`, `ralph-master-registry.mjs`, `mc-status.mjs`, `mc-opener.mjs` and
   * `mc-ralph-health.mjs` are all kit-owned and all now import `./afkf-hold.mjs`. Without these,
   * a repo seeded from the kit gets five scripts that throw on import — a break introduced by
   * adding an import to a shipped file, which nothing in the drift check can see because those
   * five are `seed` entries whose bytes are never compared.
   *
   * Only the STATIC closure is needed: `afkf-hold` reaches the divergence reader, the registry and
   * the queue through dynamic `import()` inside functions, which fail at call time with a clear
   * message rather than at load time with a broken script.
   */
  'afkf-hold.mjs',
  /**
   * The DYNAMIC imports too, round four. Only the static closure shipped, and `mc-status.mjs`
   * reaches `afkf-chain-queue.mjs` through `await import()` — which failed in a kit-seeded repo,
   * printed `HOLD: unknown`, and `mc-opener` read anything that was not a well-formed HELD line as
   * clear. The gate's default state in a fresh repo was OFF. `mc-opener` fails closed on that now,
   * but a gate that cannot evaluate is a gate nobody trusts, so the modules ship.
   */
  'afkf-chain-queue.mjs',
  'afkf-chat.mjs',
  'afkf-chain-divergence.mjs',
  'afkf-chain-state.mjs',
  'afkf-chain-import.mjs',
  // NOT `afkf-hold.test.mjs`: it asserts against this repo's own master doc, workflow and
  // dashboard, and it imports the queue, which is repo data. The gate is universal; its
  // regression tests are not.
  'afkf-digest.mjs',
  'afkf-ci-ceiling.mjs',
  'afkf-retry.mjs',
  /**
   * The merge guard's scope decision and its suite (WORKFLOW-P42, 2026-08-27).
   *
   * Kit-owned for the same reason `main-guard.yml` is: it IS that workflow's first step, and the
   * two are useless apart. A repo holding the workflow without this script has a guard that cannot
   * start; a repo holding the script without the workflow has a decision nothing consults.
   *
   * The suite ships with it. It builds every fixture inline and injects git and the API, so it
   * stays universal — the one file it reads from disk is the workflow itself, found in the kit
   * under `optional/` and in a repo under `.github/`.
   */
  'guard-scope.mjs',
  'guard-scope.test.mjs',
];

/**
 * Shipped by the kit as a starting point, then customised per repo — the slice
 * ids and program maps are repo data, not workflow. Presence is checked; bytes
 * are not.
 *
 * These two are the ROOTS. Anything that imports them, directly or through
 * another script, is repo-coupled too and is derived below rather than listed
 * here — measured on 2026-08-19 by installing the kit into pp-shopify-theme and
 * watching seven scripts fail on symbols its own config does not export.
 * Splitting the universal helpers out of the repo data is a later slice; this
 * slice only stops pretending the coupling is not there.
 */
export const SEED_ROOT_SCRIPTS = ['ralph-chain-config.mjs', 'ralph-master-registry.mjs'];

/**
 * AFKF-D24 — deploy steps stay repo-local. Anything that pushes a storefront,
 * an app, a bucket or a database is the repo's own business and must never be
 * kit-owned. Tested by kit-drift-check.test.mjs.
 */
export const EXCLUDE_PATTERNS = [
  /^firebase\.json$/,
  /^\.firebaserc$/,
  /^firestore\./,
  /^storage\.rules$/,
  /(^|\/)wrangler\.(toml|json|jsonc)$/,
  /^cloudflare\//,
  /^firebase\//,
  /^scripts\/deploy-/,
  /^scripts\/theme-/,
  /^scripts\/pb-/,
  /^\.github\/workflows\/theme-deploy/,
  /^\.github\/workflows\/cloudflare-worker/,
  /(^|\/)theme-deploy(-|\/|\.)/,
];

/**
 * kit dir -> repo dir. Mirrors install.sh, which is what actually seeds a repo.
 *
 * There used to be four rows here for two trees — `claude/rules` + `cursor/rules` and
 * `claude/skills` + `cursor/skills` — because every workflow file was written twice, in two
 * dialects, and hash-locked to itself. That is what made a two-line fix expensive enough that five
 * rules were written to overrule other rules instead. One rulebook (`AGENTS.md`), one rules tree
 * (`docs/rules/`), one skills tree (`.claude/skills/`, symlinked from `.cursor` and `.agents`).
 */
export const GROUPS = [
  { kind: 'rule', kitDir: 'rules', repoDir: 'docs/rules', ext: '.md' },
  { kind: 'skill', kitDir: 'skills', repoDir: '.claude/skills' },
  { kind: 'script', kitDir: 'scripts', repoDir: 'scripts' },
  { kind: 'action', kitDir: 'optional/github-workflows', repoDir: '.github/workflows' },
];

/**
 * `AGENTS.md` is shipped as `templates/AGENTS.md` and is deliberately NOT in the manifest: section 6
 * is repo-specific, so a hash check would fail in every repo that filled it in honestly. The kit owns
 * the shape; the repo owns the facts.
 */

/**
 * Every script that reaches a seed root through relative imports, plus that
 * script's own test. Derived from the source repo, never hand-listed.
 */
export function seedClosure(scriptsDir) {
  const files = listDirSafe(scriptsDir).filter((f) => f.endsWith('.mjs'));
  const importsOf = new Map();
  for (const f of files) {
    const text = readFileSync(join(scriptsDir, f), 'utf8');
    const deps = [...text.matchAll(/from\s+'\.\/([A-Za-z0-9._-]+\.mjs)'/g)].map((m) => m[1]);
    importsOf.set(f, deps);
  }
  const seed = new Set(SEED_ROOT_SCRIPTS.filter((f) => files.includes(f)));
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of files) {
      if (seed.has(f)) continue;
      if ((importsOf.get(f) ?? []).some((d) => seed.has(d))) {
        seed.add(f);
        grew = true;
      }
    }
  }
  // A test inherits its subject's class, and any test that leans on a repo-local
  // fixture snapshot is repo data whatever its subject is.
  for (const f of files) {
    if (!f.endsWith('.test.mjs')) continue;
    const subject = `${f.slice(0, -'.test.mjs'.length)}.mjs`;
    if (seed.has(subject)) seed.add(f);
    else if (readFileSync(join(scriptsDir, f), 'utf8').includes('fixtures/')) seed.add(f);
  }
  return seed;
}

/**
 * An Action is repo-coupled when it runs a repo-coupled script — directly, or
 * through an npm script that resolves to one. Derived from the source repo's
 * own package.json, because that is where the coupling actually lives.
 * Measured: pp-workspace's ralph-chain-test.yml runs four npm scripts that
 * pp-shopify-theme does not define, so shipping it as kit-owned would have
 * turned that repo's CI red on install.
 */
export function seedCoupledActions(repoRoot, seededScripts) {
  const dir = join(repoRoot, '.github', 'workflows');
  const out = new Set();
  let pkgScripts = {};
  try {
    pkgScripts = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    pkgScripts = {};
  }
  const scriptFor = (npmName) => {
    const cmd = pkgScripts[npmName] ?? '';
    const m = cmd.match(/scripts\/([A-Za-z0-9._-]+\.mjs)/);
    return m ? m[1] : null;
  };
  for (const file of listDirSafe(dir).filter((f) => f.endsWith('.yml'))) {
    const text = readFileSync(join(dir, file), 'utf8');
    const direct = [...text.matchAll(/scripts\/([A-Za-z0-9._-]+\.mjs)/g)].map((m) => m[1]);
    const viaNpm = [...text.matchAll(/npm run ([A-Za-z0-9:._-]+)/g)]
      .map((m) => scriptFor(m[1]))
      .filter(Boolean);
    if ([...direct, ...viaNpm].some((n) => seededScripts.has(n))) out.add(file);
  }
  return out;
}

export function isExcluded(repoPath) {
  return EXCLUDE_PATTERNS.some((re) => re.test(repoPath));
}

function listDirSafe(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
}

export function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function listDir(dir, { dirsOnly = false } = {}) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => (dirsOnly ? e.isDirectory() : e.isFile()))
    .map((e) => e.name)
    .sort();
}

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out.sort();
}

/** Derive the kit-owned path pairs from the kit's own contents + the source repo. */
export function derivePaths(kitRoot, repoRoot) {
  const seeded = seedClosure(join(repoRoot, 'scripts'));
  const seededActions = seedCoupledActions(repoRoot, seeded);
  /** @type {{kitPath:string, repoPath:string, kind:string, check:'hash'|'seed'}[]} */
  const pairs = [];
  const add = (kitPath, repoPath, kind) => {
    if (isExcluded(repoPath)) return;
    const base = repoPath.split('/').pop();
    const coupled =
      (kind === 'script' && seeded.has(base)) || (kind === 'action' && seededActions.has(base));
    const check = coupled ? 'seed' : 'hash';
    pairs.push({ kitPath, repoPath, kind, check });
  };

  for (const g of GROUPS) {
    if (g.kind === 'rule') {
      const owned = listDir(join(kitRoot, g.kitDir))
        .filter((f) => f.endsWith(g.ext))
        .map((f) => f.slice(0, -g.ext.length));
      const names = [...new Set([...owned, ...UNIVERSAL_RULE_ADDITIONS])].sort();
      for (const n of names) add(`${g.kitDir}/${n}${g.ext}`, `${g.repoDir}/${n}${g.ext}`, 'rule');
    }
    if (g.kind === 'skill') {
      for (const skill of listDir(join(kitRoot, g.kitDir), { dirsOnly: true })) {
        const fromRepo = walkFiles(join(repoRoot, g.repoDir, skill));
        const fromKit = walkFiles(join(kitRoot, g.kitDir, skill));
        const rels = new Set([
          ...fromRepo.map((f) => relative(join(repoRoot, g.repoDir, skill), f)),
          ...fromKit.map((f) => relative(join(kitRoot, g.kitDir, skill), f)),
        ]);
        for (const r of [...rels].sort()) {
          const p = r.split(/[\\/]/).join('/');
          add(`${g.kitDir}/${skill}/${p}`, `${g.repoDir}/${skill}/${p}`, 'skill');
        }
      }
    }
    if (g.kind === 'script') {
      const inRepo = listDir(join(repoRoot, g.repoDir)).filter((f) => f.endsWith('.mjs'));
      const inKit = listDir(join(kitRoot, g.kitDir)).filter((f) => f.endsWith('.mjs'));
      const names = [...new Set([...inRepo, ...inKit])]
        .filter(
          (f) =>
            /^(mc-|ralph-)/.test(f) || UNIVERSAL_SCRIPT_EXTRAS.includes(f),
        )
        .sort();
      for (const n of names) add(`${g.kitDir}/${n}`, `${g.repoDir}/${n}`, 'script');
    }
    if (g.kind === 'action') {
      const owned = listDir(join(kitRoot, g.kitDir)).filter((f) => f.endsWith('.yml'));
      const names = [...new Set([...owned, ...UNIVERSAL_ACTION_ADDITIONS])].sort();
      for (const n of names) add(`${g.kitDir}/${n}`, `${g.repoDir}/${n}`, 'action');
    }
  }
  return pairs;
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

export function measure(kitRoot, repoRoot) {
  const pairs = derivePaths(kitRoot, repoRoot);
  const rows = pairs.map((p) => {
    const kitFile = join(kitRoot, p.kitPath);
    const repoFile = join(repoRoot, p.repoPath);
    const inKit = existsSync(kitFile);
    const inRepo = existsSync(repoFile);
    let state = 'identical';
    if (!inKit && inRepo) state = 'missing-in-kit';
    else if (inKit && !inRepo) state = 'missing-in-repo';
    else if (!inKit && !inRepo) state = 'absent-both';
    else if (sha256(kitFile) !== sha256(repoFile)) state = 'differs';
    return { ...p, inKit, inRepo, state };
  });
  const by = (s) => rows.filter((r) => r.state === s);
  return {
    rows,
    summary: {
      total: rows.length,
      identical: by('identical').length,
      missingInKit: by('missing-in-kit').length,
      missingInRepo: by('missing-in-repo').length,
      differs: by('differs').length,
      absentBoth: by('absent-both').length,
    },
  };
}

function apply(kitRoot, repoRoot, rows) {
  let copied = 0;
  for (const r of rows) {
    if (r.state !== 'missing-in-kit' && r.state !== 'differs') continue;
    // Seed-only files carry the live repo's own slice ids and program maps.
    // Copying them would seed the next repo with this one's data.
    if (r.check === 'seed') continue;
    const src = join(repoRoot, r.repoPath);
    const dest = join(kitRoot, r.kitPath);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    copied += 1;
  }
  return copied;
}

export function buildManifest(kitRoot, repoRoot, { sourceRepo, generatedAt }) {
  const pairs = derivePaths(kitRoot, repoRoot);
  const files = [];
  for (const p of pairs) {
    const kitFile = join(kitRoot, p.kitPath);
    if (!existsSync(kitFile)) continue;
    files.push({
      kitPath: p.kitPath,
      repoPath: p.repoPath,
      kind: p.kind,
      check: p.check,
      sha256: p.check === 'hash' ? sha256(kitFile) : null,
      updatedAt: gitDate(repoRoot, p.repoPath) ?? gitDate(kitRoot, p.kitPath),
    });
  }
  return {
    $comment:
      'Generated by scripts/kit-manifest-build.mjs. The kit is the source of the workflow (AFKF-1). ' +
      'A path listed here is owned by the kit; a path not listed belongs to the repo. ' +
      'Deploy steps are deliberately excluded and stay repo-local (AFKF-D24).',
    kitVersion: readFileSync(join(kitRoot, 'VERSION'), 'utf8').trim(),
    generatedAt,
    sourceRepo,
    excludeReason: 'AFKF-D24 — deploy steps stay repo-local',
    excludePatterns: EXCLUDE_PATTERNS.map((re) => re.source),
    seedOnly: pairs.filter((p) => p.check === 'seed').map((p) => p.repoPath.split('/').pop()),
    files,
  };
}

/**
 * Copy every kit-owned file into a live repo, plus the manifest itself.
 * Never deletes and never touches a seed-only file — a repo's slice ids and
 * program maps are its own (AFKF-D25: removal is a later slice, not this one).
 */
export function installInto(kitRoot, repoRoot) {
  const manifest = JSON.parse(readFileSync(join(kitRoot, 'kit-manifest.json'), 'utf8'));
  let written = 0;
  let seeded = 0;
  for (const f of manifest.files) {
    const src = join(kitRoot, f.kitPath);
    if (!existsSync(src)) continue;
    const dest = join(repoRoot, f.repoPath);

    /**
     * SEED MEANS "SHIP A STARTING COPY, NEVER OVERWRITE" — IT DOES NOT MEAN "NEVER SHIP".
     *
     * This branch used to be `if (f.check !== 'hash') continue`, so a seed-only file was skipped
     * whether or not the repo had one. `install.sh` has always done the opposite — it copies every
     * `scripts/*.mjs` the kit holds — so a repo seeded by the installer and a repo updated by
     * `--install` ended up with different file sets, which is the sort of difference nobody notices
     * until something imports across it.
     *
     * Measured 2026-08-26, and it is not hypothetical: installing the kit into `pp-shopify-theme`
     * left `afkf-chain-queue.mjs` and `afkf-chat.mjs` absent while the manifest listed them, and
     * `kit-drift-check.test.mjs` — which asserts every manifest path resolves to a real file — went
     * red. `mc-status.mjs` reaches the queue through `await import()`, so the same gap also printed
     * `HOLD: unknown` rather than failing loudly.
     *
     * Overwriting is still refused, and that half matters just as much: a seed file carries the
     * repo's own slice ids and program map, so replacing one would seed this repo with another's
     * data. Absent → copy. Present → leave it alone, whatever its bytes say.
     */
    if (f.check !== 'hash') {
      if (existsSync(dest)) continue;
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      seeded += 1;
      continue;
    }

    if (existsSync(dest) && sha256(dest) === sha256(src)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    written += 1;
  }
  copyFileSync(join(kitRoot, 'kit-manifest.json'), join(repoRoot, 'kit-manifest.json'));
  return { written, seeded, total: manifest.files.length };
}

function main() {
  const argv = process.argv.slice(2);
  const fromIdx = argv.indexOf('--from');
  if (fromIdx === -1 || !argv[fromIdx + 1]) {
    console.error('FAIL: --from <path-to-live-repo> is required');
    process.exit(2);
  }
  const repoRoot = resolve(argv[fromIdx + 1]);
  const doApply = argv.includes('--apply');
  const doInstall = argv.includes('--install');
  const asJson = argv.includes('--json');

  if (doInstall) {
    const { written, seeded, total } = installInto(KIT_ROOT, repoRoot);
    console.log(`Installed kit workflow into ${repoRoot}`);
    console.log(`  ${written} file(s) written of ${total} kit-owned paths · kit-manifest.json copied`);
    console.log(`  ${seeded} repo-coupled file(s) seeded because this repo had none — existing ones were left alone`);
    console.log('  nothing was deleted');
    return;
  }

  const before = measure(KIT_ROOT, repoRoot);
  if (asJson && !doApply) {
    console.log(JSON.stringify(before, null, 2));
    return;
  }

  console.log(`Kit drift measurement — kit vs ${repoRoot}`);
  console.log(
    `  kit-owned paths: ${before.summary.total}` +
      `  identical: ${before.summary.identical}` +
      `  missing in kit: ${before.summary.missingInKit}` +
      `  differs: ${before.summary.differs}` +
      `  missing in repo: ${before.summary.missingInRepo}`,
  );
  for (const state of ['missing-in-kit', 'differs', 'missing-in-repo']) {
    const rows = before.rows.filter((r) => r.state === state);
    if (!rows.length) continue;
    console.log(`\n  ${state} (${rows.length}):`);
    for (const r of rows) console.log(`    ${r.kitPath}`);
  }

  if (!doApply) {
    console.log('\n(measurement only — pass --apply to bring the kit up to date)');
    return;
  }

  const copied = apply(KIT_ROOT, repoRoot, before.rows);
  const manifest = buildManifest(KIT_ROOT, repoRoot, {
    sourceRepo: 'pp-workspace',
    generatedAt: new Date().toISOString(),
  });
  writeFileSync(join(KIT_ROOT, 'kit-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nApplied: ${copied} file(s) copied into the kit.`);
  console.log(`kit-manifest.json written — ${manifest.files.length} kit-owned paths.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
