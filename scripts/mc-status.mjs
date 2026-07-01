#!/usr/bin/env node
/**
 * Print STATUS DASHBOARD + NEXT_PROMPT excerpt + CHAT_RENAME for Cursor agents.
 * Usage: node scripts/mc-status.mjs [platform|workflow|path-to-master.md]
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDashboardFields,
  chatRenameFromMaster,
  workersMigrationSummary,
} from './mc-chat-meta.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const PROGRAM_PATHS = {
  platform: 'docs/projects/platform-migration-master.md',
  workflow: 'docs/projects/workflow-master.md',
  'ds-clean': 'docs/projects/ds-clean-master.md',
  'repo-health': 'docs/projects/repo-health-master.md',
};

const arg = process.argv[2] ?? 'platform';
const rel =
  PROGRAM_PATHS[arg] ??
  (arg.endsWith('.md') ? arg : `docs/projects/${arg}-master.md`);
const path = resolve(root, rel);

let text;
try {
  text = readFileSync(path, 'utf8');
} catch {
  console.error(`FAIL: cannot read ${rel}`);
  process.exit(1);
}

const startMarker = '## STATUS DASHBOARD';
const endMarker = '---';
const start = text.indexOf(startMarker);
if (start === -1) {
  console.error(`FAIL: no STATUS DASHBOARD in ${rel}`);
  process.exit(1);
}

const afterStart = text.slice(start);
const endRel = afterStart.indexOf('\n---', startMarker.length);
const dashboard =
  endRel === -1 ? afterStart.trim() : afterStart.slice(0, endRel).trim();

const fields = parseDashboardFields(dashboard);
const sliceForRename =
  fields.activeSlice && !fields.activeSlice.startsWith('none')
    ? fields.activeSlice.split(/\s+/)[0]
    : fields.recommendedSlice;
const chatRename = chatRenameFromMaster(text, sliceForRename);

const searchTerms = [
  sliceForRename,
  fields.activeSlice,
  fields.nextPrompt.replace(/^§\d+\s*→\s*/, '').trim(),
  fields.nextPrompt.replace(/^§\d+\.\s*/, '').trim(),
].filter(Boolean);

let promptExcerpt = '';
for (const term of searchTerms) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `###\\s+${escaped}[\\s\\S]*?(?=\\n### |\\n## |\\n<!--|$)`,
    'i',
  );
  const m = text.match(re);
  if (m) {
    promptExcerpt = m[0].trim();
    break;
  }
}

if (!promptExcerpt && searchTerms.length) {
  const loose = searchTerms[0].split(/\s+/).slice(-2).join(' ');
  const re = new RegExp(
    `###[^\\n]*${loose.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=\\n### |\\n## |\\n<!--|$)`,
    'i',
  );
  const m = text.match(re);
  if (m) promptExcerpt = m[0].trim();
}

console.log(`# MC STATUS — ${rel}`);
console.log('');
console.log(dashboard);
console.log('');
console.log('---');
console.log('# AGENT META (chat naming + continue)');
console.log('');
console.log(`CHAT_RENAME: ${chatRename || 'unknown — update §12 or workers-exit-plan.md'}`);
console.log(`RECOMMENDED_SLICE: ${sliceForRename || 'none'}`);
console.log(`AUTONOMY: ${dashboard.match(/^AUTONOMY:\s*(.+)$/m)?.[1]?.trim() ?? 'unknown'}`);

if (arg === 'platform' || rel.includes('platform-migration-master')) {
  console.log('');
  console.log('## Workers migration (CEO summary)');
  console.log('');
  console.log(workersMigrationSummary(text, fields));
}

if (promptExcerpt) {
  console.log('');
  console.log('---');
  console.log('# ACTIVE PROMPT (excerpt)');
  console.log('');
  console.log(promptExcerpt.slice(0, 4000));
  if (promptExcerpt.length > 4000) {
    console.log('\n... (truncated — read full block in master doc)');
  }
}
