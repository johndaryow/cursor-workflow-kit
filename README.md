# cursor-workflow-kit

**Central agent playbook** for Cursor Cloud Agents **and Claude Code** — shared across all your repos.

Improve the process **here once** → update each product repo when ready. Same skills, same STATUS-dashboard-as-controller pattern, same AFK/HITL tags, for both agents — see [`claude/README.md`](./claude/README.md) for the Cursor ↔ Claude Code mapping and the one place they genuinely differ (auto-chaining after a merge).

See [`MANIFEST.md`](./MANIFEST.md) for the full list.

## Install into a product repo

Tell your agent: **“Update workflow from central kit”**

This lays down `.cursor/skills/`, `.cursor/rules/`, `.claude/skills/`, `.claude/rules/`, and `CLAUDE.md` (if you don't already have one) in the target repo.

## Ralph GitHub Actions

Workflow YAML files live in `optional/github-workflows/` — copy into each product repo's `.github/workflows/` when you enable the Ralph chain.

## Version

See [`VERSION`](./VERSION).
