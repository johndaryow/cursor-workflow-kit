# CLAUDE.md

The rulebook is [`AGENTS.md`](./AGENTS.md) — one file, read by Claude Code, Cursor and Codex alike.
Rule bodies live once in [`docs/rules/`](./docs/rules/) and are read on demand from the index in
§7 of that file.

@AGENTS.md

## Claude Code specifics

- **Skills:** `.claude/skills/` — invoke with `/name`. Same files as `.cursor/skills/`.
- **Branch prefix:** `claude/<name>-<id>`. Cursor uses `cursor/`, Codex uses `codex/`. Same dashboards,
  same slice ids — only the prefix differs.
- **Session bootstrap:** `.claude/hooks/session-start.sh`, registered in `.claude/settings.json` — installs this repo's CLIs. Don't hand-install them.
- **Merging:** use the GitHub MCP tools when `gh` is unavailable — see
  [`docs/rules/merging.md`](./docs/rules/merging.md).
