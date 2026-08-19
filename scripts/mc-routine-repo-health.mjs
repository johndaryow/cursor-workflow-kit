#!/usr/bin/env node
/**
 * WORKFLOW-P26 — "will a fired routine open a session with the repo in it?"
 *
 * THE BUG THIS EXISTS TO END (measured 2026-08-18).
 *
 * The LNP-1 slice session started with an empty working directory: no clone, no
 * `package.json`, no master doc, no rules, no skills. Every instruction it had been given
 * assumed the repo was there. It did not error at launch. It looked alive and had nothing
 * to work on, and it finished only because the agent noticed and attached the repo by hand.
 *
 * A routine carries its own **Repositories** list, set by hand in the routine UI. An
 * agent-created routine starts with that list EMPTY, and nothing in the fire path notices —
 * the /fire call succeeds, a session opens, and the failure only shows up as a wasted run.
 *
 * WORKFLOW-P25 put a recovery paragraph in the fire text. That is mitigation: it makes the
 * failure survivable, not impossible. This module is the detection half — it reads the live
 * routine list and FAILS by name on any routine that will fire into an empty session, and
 * prints the exact click that repairs it.
 *
 * WHY THIS DOES NOT REPAIR ANYTHING ITSELF. The Routines update API (`update_trigger`)
 * accepts name, cron, enabled, model and prompt. It has no field for the repository list.
 * Confirmed against the live tool schema on 2026-08-18. So repairing a routine is a CEO UI
 * action, full stop — the honest job of code here is to DETECT and NAME it, never to claim
 * it fixed something it cannot reach.
 *
 * Usage:
 *   npm run mc:routine-repo-health -- --from-json /tmp/triggers.json
 *   mcp list_triggers output | npm run mc:routine-repo-health -- --from-json -
 *
 * The script cannot call MCP tools. In a Claude Code session the AGENT holds
 * `mcp__Claude_Code_Remote__list_triggers`; it writes that payload to a file and feeds it
 * here — the same split as `mc:auto-merge --from-json`, where the agent does the fetching
 * and the script does the deciding. Without input this exits 2: an instruction with an
 * alarm attached, never a silent pass.
 */
import { readFileSync } from 'node:fs';

/** claude.ai page the CEO repairs a routine on. */
export const ROUTINES_PAGE = 'https://claude.ai/code/routines';

/**
 * Read the git repositories a routine will clone into its fired session.
 *
 * Shape (from the live `list_triggers` payload):
 *   job_config.ccr.session_context.sources[].git_repository.url
 *
 * A routine with no repositories has **no `sources` key at all** — not an empty array —
 * which is exactly why "it looked fine" was so easy: there is nothing there to look wrong.
 *
 * @param {any} trigger
 * @returns {string[]} owner/repo slugs, in the order the routine lists them
 */
export function routineRepoSlugs(trigger) {
  const sources = trigger?.job_config?.ccr?.session_context?.sources;
  if (!Array.isArray(sources)) return [];
  return sources
    .map((source) => source?.git_repository?.url ?? '')
    .map((url) => /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(url)))
    .filter(Boolean)
    .map((m) => `${m[1]}/${m[2]}`);
}

/**
 * Does this routine fire into a session that already exists?
 *
 * A `send_later` reminder or any routine bound to a persistent session continues a
 * conversation that already has its repo. Those need no Repositories list and must not be
 * reported as faults — crying wolf is how a check stops being read.
 *
 * @param {any} trigger
 */
export function bindsToExistingSession(trigger) {
  if (trigger?.persistent_session_id) return true;
  return trigger?.persist_session === true;
}

/**
 * A Ralph chain routine — the ones a merge fires to run the next slice.
 *
 * Matched on the routine's own text rather than a hardcoded id list, so a routine added for
 * a third repo is covered the day it is created instead of the day someone remembers.
 *
 * @param {any} trigger
 */
export function isRalphRoutine(trigger) {
  const name = String(trigger?.name ?? '');
  if (/ralph/i.test(name)) return true;
  const events = trigger?.job_config?.ccr?.events ?? [];
  return events.some((e) => /Ralph Continue agent/i.test(String(e?.data?.message?.content ?? '')));
}

/**
 * `PP · Ralph continue (pp-shopify-theme)` → `pp-shopify-theme`.
 *
 * The routine names the repo it is for in its own title. When it does, the check can say
 * more than "no repo" — it can say WHICH repo is missing, which is the difference between a
 * report the CEO can act on and one they have to research.
 *
 * @param {string} name
 * @returns {string|null}
 */
export function repoHintFromName(name = '') {
  const match = /\(([A-Za-z0-9._-]+)\)\s*$/.exec(String(name).trim());
  return match ? match[1] : null;
}

/**
 * The one click. Named settings, named page, named routine — not "configuration error".
 *
 * @param {{ name: string, expectedRepo: string|null }} entry
 */
export function repairInstruction({ name, expectedRepo }) {
  const repo = expectedRepo ? `\`${expectedRepo}\`` : 'the repository this routine is for';
  return `${ROUTINES_PAGE} → open **${name}** → pencil (Edit) → **Repositories** → add ${repo} → **Save**`;
}

/**
 * Pure evaluation, separated from reading the payload so it can be exercised on captured
 * fixtures with no network and no MCP.
 *
 * @param {any[]} triggers  the `data` array from `list_triggers`
 * @param {{ defaultOwner?: string }} [opts]
 * @returns {{ pass: any[], fail: any[], skipped: any[] }}
 */
export function checkRoutineRepositories(triggers, opts = {}) {
  const defaultOwner = opts.defaultOwner ?? 'johndaryow';
  const pass = [];
  const fail = [];
  const skipped = [];

  for (const trigger of triggers ?? []) {
    const name = String(trigger?.name ?? '(unnamed routine)');
    const id = String(trigger?.id ?? 'unknown');
    const slugs = routineRepoSlugs(trigger);
    const ralph = isRalphRoutine(trigger);

    if (bindsToExistingSession(trigger)) {
      skipped.push({ id, name, why: 'fires into an existing session — it inherits that session\'s repo' });
      continue;
    }

    const hint = repoHintFromName(name);
    const expectedRepo = hint ? (hint.includes('/') ? hint : `${defaultOwner}/${hint}`) : null;

    if (slugs.length === 0) {
      fail.push({
        id,
        name,
        ralph,
        expectedRepo,
        slugs,
        reason:
          'no repository attached — every session this routine fires opens with an EMPTY working directory',
        fix: repairInstruction({ name, expectedRepo }),
      });
      continue;
    }

    /**
     * A routine that names one repo in its title but clones a different one is worse than
     * one that clones nothing: it looks configured, and the agent works on the wrong tree.
     */
    if (expectedRepo && !slugs.includes(expectedRepo)) {
      fail.push({
        id,
        name,
        ralph,
        expectedRepo,
        slugs,
        reason: `attached to ${slugs.join(', ')} but its name says ${expectedRepo}`,
        fix: repairInstruction({ name, expectedRepo }),
      });
      continue;
    }

    pass.push({ id, name, ralph, slugs });
  }

  return { pass, fail, skipped };
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from-json') out.fromJson = argv[++i];
    else if (argv[i] === '--json') out.json = true;
  }
  return out;
}

/**
 * Accepts the `list_triggers` result verbatim (`{ data: [...] }`) or a bare array, so the
 * agent can pipe the tool output through without reshaping it — a reshaping step is a step
 * that can silently drop the field being checked.
 *
 * @param {string} raw
 * @returns {any[]}
 */
export function parseTriggersPayload(raw) {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.data)) return parsed.data;
  if (Array.isArray(parsed?.triggers)) return parsed.triggers;
  throw new Error('Payload has no trigger array — expected the list_triggers result or a bare array');
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

export function printReport(result) {
  console.log('\n# ROUTINE REPO HEALTH (will a fired session have the repo in it?)\n');

  for (const entry of result.pass) {
    console.log(`OK: ${entry.name} → ${entry.slugs.join(', ')}`);
  }
  for (const entry of result.skipped) {
    console.log(`NOTE: ${entry.name} — ${entry.why}`);
  }
  for (const entry of result.fail) {
    console.log(`\nFAIL: ${entry.name}  (${entry.id})`);
    console.log(`  ${entry.reason}`);
    console.log(`  CEO click: ${entry.fix}`);
    console.log(
      '  This cannot be fixed from code: the routines API has no field for the repository list.',
    );
  }

  if (result.fail.length === 0) {
    console.log('\nEvery fresh-session routine has a repository attached.');
  } else {
    console.log(
      `\n${result.fail.length} routine(s) will fire into an empty session until the click above is made.`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.fromJson) {
    console.error('# ROUTINE REPO HEALTH — cannot read the routines from here\n');
    console.error('This script has no MCP client, so it cannot list routines itself.');
    console.error('In a Claude Code session the AGENT can. Two steps:');
    console.error('  1. call mcp__Claude_Code_Remote__list_triggers and write the result to a file');
    console.error('  2. npm run mc:routine-repo-health -- --from-json <that file>');
    console.error('\nNot checking is not a pass — exiting 2.');
    process.exit(2);
  }

  const raw = args.fromJson === '-' ? readStdin() : readFileSync(args.fromJson, 'utf8');
  const triggers = parseTriggersPayload(raw);
  const result = checkRoutineRepositories(triggers);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReport(result);
  }

  process.exit(result.fail.length ? 1 : 0);
}

const isMain =
  process.argv[1] && process.argv[1].endsWith('mc-routine-repo-health.mjs');

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
