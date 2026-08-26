# Repo agent skills — the one source

Skills are written **here only**: `.claude/skills/<name>/SKILL.md`.

`.cursor/skills` and `.agents/skills` are **symlinks** to this directory, so Cursor and the `.agents`
discovery path read the same files. There is nothing to sync and nothing to keep in step by hand —
the drift is impossible by construction rather than caught by a check.

```bash
npm run sync:agent-skills -- --check   # asserts the symlinks are intact (CI)
npm run sync:agent-skills              # repairs them if something replaced one with a copy
```

All three paths sit at the same depth from the repo root, so relative links inside a `SKILL.md`
(`../../../docs/rules/x.md`) resolve identically through any of them.

**Rules** live once in [`docs/rules/`](../../docs/rules/); the always-on rulebook is
[`AGENTS.md`](../../AGENTS.md).

**Planning chain:** `/grill-me` → `/planning-session` → `/slice-planning` → `/afk-slice`.

**Invoke guide:** [`docs/projects/cursor-invoke-cheatsheet.md`](../../docs/projects/cursor-invoke-cheatsheet.md)
