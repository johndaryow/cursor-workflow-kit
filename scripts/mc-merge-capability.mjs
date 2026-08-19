#!/usr/bin/env node
/**
 * WORKFLOW-P22 — "can this environment merge a pull request at all?"
 *
 * THE BUG THIS EXISTS TO END (measured 2026-08-16).
 *
 * FCN-5 ran unattended, finished correctly, opened PR #1734 and went green on all six
 * checks. Its own SESSION REPORT promised "auto-merge when green". It then did nothing.
 * The PR sat unmerged for over an hour until a human merged it by hand. Because it never
 * merged, the post-merge reconcile never ran, `RALPH_RUNNING: FCN-5` stayed claimed, and
 * the planner — correctly — refused to start FCN-6. From outside, a chain blocked on
 * finished work is indistinguishable from an idle one.
 *
 * `mc-auto-merge.mjs` assumed one merge venue: the `gh` CLI. Probed in a Claude Code cloud
 * session on 2026-08-16:
 *
 *   gh binary                     ABSENT
 *   GITHUB_TOKEN                  SET — but `GET /repos/{owner}/{repo}` → 401 Bad credentials
 *                                 (it is a git-push-only credential, not an API token)
 *   GITHUB_PAT                    unset
 *   fetch → api.github.com        reachable (200 unauthenticated)
 *   GitHub MCP tools              present and able to merge
 *
 * So the script read a token that looked real, shelled out to a binary that did not exist,
 * and reported "is gh installed and authenticated?" — a question about the wrong thing.
 * Meanwhile the session it was running in could merge perfectly well through MCP tools the
 * script has no way to call.
 *
 * A token being SET is therefore not evidence it works. This module probes rather than
 * assumes, and names one of three modes:
 *
 *   rest          a token that actually authenticates → merge over the REST API, no `gh`
 *   gh-cli        no usable token, but `gh` is installed and authenticated
 *   mcp-handoff   neither — the script cannot merge, and says so loudly so the AGENT
 *                 completes the merge through its GitHub MCP tools using the same gate
 *
 * `mcp-handoff` is never a pass. It is an instruction with an alarm attached.
 */
import { spawnSync } from 'node:child_process';

/** Token env vars, in the order we prefer them. GITHUB_PAT first: it is the purpose-made one. */
export const TOKEN_ENV_VARS = ['GITHUB_PAT', 'GITHUB_TOKEN', 'GH_TOKEN'];

/**
 * Pure decision, separated from the probing so it can be exercised without a network.
 *
 * @param {{ tokenSource: string|null, tokenWorks: boolean, hasGh: boolean, ghAuthenticated: boolean,
 *   proxyWarning?: string|null }} facts
 * @returns {{ mode: 'rest'|'gh-cli'|'mcp-handoff', tokenSource: string|null, why: string }}
 */
export function decideMergeCapability({ tokenSource, tokenWorks, hasGh, ghAuthenticated, proxyWarning = null }) {
  if (tokenSource && tokenWorks) {
    return {
      mode: 'rest',
      tokenSource,
      why: `${tokenSource} authenticates against the GitHub API — merging over REST, no gh needed`,
    };
  }
  if (hasGh && ghAuthenticated) {
    return {
      mode: 'gh-cli',
      tokenSource,
      why: 'gh CLI is installed and authenticated — merging through it',
    };
  }

  /**
   * Say which of the two halves failed. "gh not authenticated" was the message that sent the
   * 2026-08-16 diagnosis down the wrong path for an hour; a token that is present but refused
   * is a completely different fault from a token that was never set.
   */
  /**
   * WORKFLOW-P27 — do not blame the credential when the request never left the machine.
   * A configured proxy that Node is not honouring explains a failed probe completely, and
   * says so FIRST, because it is the one cause with a one-word fix.
   */
  const tokenNote = tokenSource
    ? proxyWarning
      ? `${tokenSource} could not be verified — ${proxyWarning}`
      : `${tokenSource} is set but the GitHub API refused it (it is not an API credential)`
    : `no API token in ${TOKEN_ENV_VARS.join(' / ')}`;
  const ghNote = hasGh ? 'gh is installed but not authenticated' : 'gh is not installed';
  return { mode: 'mcp-handoff', tokenSource, why: `${tokenNote}; ${ghNote}` };
}

/**
 * Proxy env vars a sandboxed agent VM sets, and Node's opt-in to honouring them.
 *
 * WORKFLOW-P27 — the second false reading this module has had to learn about.
 *
 * Node's global `fetch` does NOT use `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is set at
 * process start. In an agent sandbox where all egress goes through a proxy, that means every
 * `fetch` here fails to reach GitHub at all — and `probeToken` reports `false`, which
 * `decideMergeCapability` then explains as *"it is set but the GitHub API refused it (it is
 * not an API credential)"*.
 *
 * That sentence is wrong in the most expensive possible way: it names a broken credential
 * when the credential is fine and the request never left the machine. It is the same class of
 * bug as the `gh auth status` message P22 replaced — an answer to a question nobody asked.
 * Measured 2026-08-18: with `NODE_USE_ENV_PROXY=1` the very same `GITHUB_TOKEN` authenticates
 * and the venue is `rest`; without it, `mcp-handoff`.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {string|null} a warning when this process's fetch will silently bypass the proxy
 */
export function proxyBypassWarning(env = process.env) {
  const proxy = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'].find((n) =>
    env[n]?.trim(),
  );
  if (!proxy) return null;
  if (env.NODE_USE_ENV_PROXY?.trim()) return null;
  return `${proxy} is set but NODE_USE_ENV_PROXY is not — Node's fetch ignores the proxy, so this probe never reached GitHub. Re-run with NODE_USE_ENV_PROXY=1 before concluding the token is bad`;
}

/** `https://github.com/owner/repo(.git)` or `git@github.com:owner/repo.git` → `{owner, repo}`. */
export function repoSlugFromGitRemote(cwd = process.cwd()) {
  const remote = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', cwd });
  const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\s*$/.exec(remote.stdout ?? '');
  if (!match) throw new Error(`Could not read owner/repo from git remote: ${remote.stdout?.trim()}`);
  return { owner: match[1], repo: match[2] };
}

export function apiBase() {
  return (process.env.GITHUB_API_URL?.trim() || 'https://api.github.com').replace(/\/$/, '');
}

/** @param {string|null} token */
export function apiHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** First token env var that is set and non-empty. @returns {{name: string, value: string}|null} */
export function findToken(env = process.env) {
  for (const name of TOKEN_ENV_VARS) {
    const value = env[name]?.trim();
    if (value) return { name, value };
  }
  return null;
}

/**
 * Ask GitHub whether the token is real, against the one repo we care about. A 401/403 here is
 * the whole point: it is what distinguishes "set" from "works".
 *
 * @returns {Promise<boolean>}
 */
export async function probeToken(token, owner, repo) {
  try {
    const response = await fetch(`${apiBase()}/repos/${owner}/${repo}`, {
      headers: apiHeaders(token),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Full probe: what can this environment actually do, right now.
 *
 * @returns {Promise<{ mode: string, tokenSource: string|null, token: string|null, why: string,
 *   facts: { tokenSource: string|null, tokenWorks: boolean, hasGh: boolean, ghAuthenticated: boolean } }>}
 */
export async function probeMergeCapability({ owner, repo, cwd = process.cwd() } = {}) {
  const slug = owner && repo ? { owner, repo } : repoSlugFromGitRemote(cwd);
  const token = findToken();

  const tokenWorks = token ? await probeToken(token.value, slug.owner, slug.repo) : false;

  const which = spawnSync('sh', ['-c', 'command -v gh'], { encoding: 'utf8' });
  const hasGh = which.status === 0 && Boolean(which.stdout.trim());
  const ghAuthenticated =
    hasGh && spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', cwd }).status === 0;

  const facts = {
    tokenSource: token?.name ?? null,
    tokenWorks,
    hasGh,
    ghAuthenticated,
    proxyWarning: tokenWorks ? null : proxyBypassWarning(),
  };
  const decision = decideMergeCapability(facts);
  return { ...decision, token: decision.mode === 'rest' ? token.value : null, facts, ...slug };
}

/** CLI: `npm run mc:merge-capability` — prints the truth about this venue, secrets never shown. */
if (process.argv[1] && process.argv[1].endsWith('mc-merge-capability.mjs')) {
  const result = await probeMergeCapability();
  console.log('# MERGE CAPABILITY (this environment)\n');
  console.log(`repo:            ${result.owner}/${result.repo}`);
  console.log(`API token env:   ${result.facts.tokenSource ?? 'none set'}`);
  console.log(`API token works: ${result.facts.tokenWorks ? 'yes' : 'no'}`);
  console.log(`gh installed:    ${result.facts.hasGh ? 'yes' : 'no'}`);
  console.log(`gh authed:       ${result.facts.ghAuthenticated ? 'yes' : 'no'}`);
  console.log(`\nMODE: ${result.mode}`);
  console.log(`WHY:  ${result.why}`);
  if (result.mode === 'mcp-handoff') {
    console.log(
      '\nThis venue cannot merge from a script. An agent here must merge through its GitHub',
    );
    console.log('MCP tools, running the SAME gate via `npm run mc:merge-verdict`, and must record');
    console.log('BLOCKED_BY (`npm run mc:merge-blocked`) if it cannot.');
  }
  process.exit(0);
}
