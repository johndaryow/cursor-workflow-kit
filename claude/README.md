# Repo agent skills — Claude Code mirror

This is the Claude Code counterpart of [`cursor/`](../cursor/) in this kit. Same workflow, same skill names, same STATUS-dashboard-as-controller pattern — adapted for Claude Code's file conventions instead of Cursor's.

| Cursor | Claude Code | Notes |
|--------|-------------|-------|
| `.cursor/skills/*/SKILL.md` | `.claude/skills/*/SKILL.md` | **Identical format** — both use Anthropic's Agent Skills spec (`name` + `description` + optional `disable-model-invocation` frontmatter). Content is the same skill, just two folders. |
| `.cursor/rules/*.mdc` (`alwaysApply: true`) | Root `CLAUDE.md` + `.claude/rules/*.md` imported via `@` | Claude Code has no per-file "always apply" rule loader — `CLAUDE.md` is auto-loaded every session, so always-on rules are imported into it. |
| `.cursor/rules/*.mdc` (`alwaysApply: false`) | `.claude/rules/*.md`, **not** imported into `CLAUDE.md` | Loaded on demand by a skill or by the agent reading the file when the situation calls for it — same intent as Cursor's conditional rules, different mechanism. |
| Cursor → Customize → Rules → User | Root `CLAUDE.md` | One file instead of a separate "User Rule" UI setting. |
| `/grill-me` slash command | `/grill-me` slash command | Same — typing `/skill-name` invokes the skill in both tools. |
| GitHub Action → Cursor Cloud Agent API (Ralph chain) | No 1:1 equivalent | See [`ralph-loop` skill](./skills/ralph-loop/SKILL.md) — this is the one real gap, not a naming difference. |

## Edit here, sync everywhere

This **kit repo** (`cursor/` + `claude/`) is the single source of truth — same pattern as the top-level README already says: "Improve the process here once → update each product repo when ready." `cursor/skills/*` and `claude/skills/*` are intentionally two parallel trees, not a mechanical mirror of each other — most content is identical, but a few files carry small per-agent adaptations (branch prefixes, model names, the chain-automation note in `ralph-loop`). When you change workflow policy, edit **both** trees here, then re-run `install.sh` in each product repo — it rsyncs `cursor/skills/` → `.cursor/skills/` and `claude/skills/` → `.claude/skills/` with `--delete`, so product repos stay in lockstep with the kit. Don't hand-edit skills inside a product repo; edit the kit and reinstall.

`.agents/skills/` (Cursor's alternate discovery path) is still mirrored from a product repo's own `.cursor/skills/` via `npm run sync:agent-skills` — that part is unchanged and Cursor-specific.

**Planning chain (slash in main chat):** `/grill-me` → `/planning-session` → `/slice-planning`
