# cursor-workflow-kit

**Central agent playbook** for Cursor Cloud Agents **and Claude Code** — shared across all your repos.

Improve the process **here once** → update each product repo when ready. Same skills, same STATUS-dashboard-as-controller pattern, same AFK/HITL tags, for both agents — see [`claude/README.md`](./claude/README.md) for the Cursor ↔ Claude Code mapping and the one place they genuinely differ (auto-chaining after a merge).

See [`MANIFEST.md`](./MANIFEST.md) for the full list.

## The kit is the source, and drift goes red

"Update each product repo when ready" used to mean *never*. Measured in code on 2026-08-19: of 81
kit-owned paths, 20 were missing from this kit and 31 more had diverged from the repos it is meant to
seed.

Now `kit-manifest.json` says which paths the kit owns, and every repo runs `npm run kit:drift` on
push and PR. It goes **red** when a copy has diverged, names the files, and says **which side is
newer** — a check that only says "different" makes the next agent guess.

```bash
npm run kit:drift                                                  # in any repo, or here
node scripts/kit-manifest-build.mjs --from ../pp-workspace --apply    # the kit takes a change
node scripts/kit-manifest-build.mjs --from ../pp-workspace --install  # a repo takes it back
```

Deploy steps stay repo-local and are excluded on purpose — see MANIFEST.md, Tier 0.

## Install into a product repo

Tell your agent: **“Update workflow from central kit”**

This lays down `AGENTS.md` (the one always-on rulebook, read by Claude Code, Cursor and Codex), `docs/rules/` (one copy of each rule, read on demand), `.claude/skills/` with `.cursor/skills` and `.agents/skills` symlinked to it, and thin `CLAUDE.md` / `.cursor/rules/000-agents.mdc` pointers.

## Ralph GitHub Actions

Workflow YAML files live in `optional/github-workflows/` — copy into each product repo's `.github/workflows/` when you enable the Ralph chain.

## Version

See [`VERSION`](./VERSION).
