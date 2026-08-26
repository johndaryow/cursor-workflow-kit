#!/usr/bin/env node
/**
 * Skills are written ONCE, in `.claude/skills/`.
 *
 * `.cursor/skills` and `.agents/skills` are symlinks to it, so Cursor and the
 * `.agents` discovery path see the same files with no copying and no drift. All
 * three locations sit at the same depth from the repo root, so the relative links
 * inside a SKILL.md resolve identically through any of them.
 *
 * This script used to copy `.cursor/skills` → `.agents/skills` and rewrite links on
 * the way. It now just asserts the symlinks are intact and repairs them if not.
 *
 *   npm run sync:agent-skills            # repair if needed
 *   npm run sync:agent-skills -- --check # fail instead of repairing (CI)
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = '.claude/skills';
const MIRRORS = [
  { path: '.cursor/skills', target: '../.claude/skills' },
  { path: '.agents/skills', target: '../.claude/skills' },
];
const checkOnly = process.argv.includes('--check');

if (!existsSync(join(root, SOURCE))) {
  console.error(`Missing ${SOURCE}/ — skills have no source`);
  process.exit(1);
}

let repaired = 0;
let broken = 0;

for (const { path, target } of MIRRORS) {
  const abs = join(root, path);
  const isLink = existsSync(abs) && lstatSync(abs).isSymbolicLink();
  if (isLink && readlinkSync(abs) === target) continue;

  broken += 1;
  const why = !existsSync(abs) ? 'missing' : isLink ? `points at ${readlinkSync(abs)}` : 'is a real directory (a copy — this is the drift)';
  if (checkOnly) {
    console.error(`FAIL: ${path} ${why}; expected a symlink → ${target}`);
    continue;
  }
  if (existsSync(abs) || isLink) rmSync(abs, { recursive: true, force: true });
  mkdirSync(dirname(abs), { recursive: true });
  symlinkSync(target, abs);
  console.log(`repaired: ${path} → ${target} (was ${why})`);
  repaired += 1;
}

if (checkOnly && broken) process.exit(1);

const count = readdirSync(join(root, SOURCE), { withFileTypes: true }).filter((d) => d.isDirectory()).length;
console.log(`sync-agent-skills: ${count} skills in ${SOURCE}/, ${MIRRORS.length} mirrors OK${repaired ? ` (${repaired} repaired)` : ''}`);
