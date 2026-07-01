#!/usr/bin/env node
/**
 * Mirror .cursor/skills → .agents/skills for Cursor discovery (web + CLI).
 * Run after editing repo skills: npm run sync:agent-skills
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const srcRoot = join(root, '.cursor/skills');
const destRoot = join(root, '.agents/skills');

/** Fix relative links that assume .cursor/skills/ parent path. */
function rewriteContent(text, relFromRoot) {
  return text
    .replace(/\]\(\.\.\/\.\.\/rules\//g, '](.cursor/rules/')
    .replace(/\]\(\.\.\/\.\.\/\.\.\/rules\//g, '](.cursor/rules/')
    .replace(/\]\(\.\.\/\.\.\/docs\//g, '](docs/')
    .replace(/\]\(\.\.\/\.\.\/\.\.\/docs\//g, '](docs/')
    .replace(/\]\(\.\.\/skills\//g, '](.cursor/skills/')
    .replace(/\]\(\.\.\/\.\.\/skills\//g, '](.cursor/skills/');
}

function copyTree(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    const src = join(srcDir, name);
    const dest = join(destDir, name);
    if (statSync(src).isDirectory()) {
      copyTree(src, dest);
      continue;
    }
    if (!name.endsWith('.md')) {
      cpSync(src, dest);
      continue;
    }
    const rel = relative(root, dest);
    writeFileSync(dest, rewriteContent(readFileSync(src, 'utf8'), rel), 'utf8');
  }
}

if (!existsSync(srcRoot)) {
  console.error('Missing .cursor/skills/ — nothing to sync');
  process.exit(1);
}

if (existsSync(destRoot)) {
  rmSync(destRoot, { recursive: true, force: true });
}

copyTree(srcRoot, destRoot);

const count = readdirSync(destRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
console.log(`sync-agent-skills: mirrored ${count} skills → .agents/skills/`);
