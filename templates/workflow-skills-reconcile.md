# WORKFLOW — Skills reconcile (global ↔ repo)

**Slice:** WORKFLOW-P21 · **CEO one-time:** reload Cursor web; invoke via main chat slash ([`cursor-invoke-cheatsheet.md`](./cursor-invoke-cheatsheet.md))

Repo `.cursor/skills/` is **source of truth**. Mirror `.agents/skills/` for Cursor discovery — run `npm run sync:agent-skills` after editing skills. Mac desktop: optional sync to `~/.cursor/skills/`.

---

## Delete from global User Skills

| Skill | Why |
|-------|-----|
| `prd-to-phases` | Superseded by `planning-session` + `slice-planning` |
| `write-a-prd` | Superseded by `planning-session` |
| `slice-tagger` | Merged into `slice-planning` (P19) |
| `ceo-plain` | Merged into `ceo-communication` rule + `session-report` (P20a) |
| `automation-first` | Merged into `workflow-core.mdc` (P20a) |
| `agent-efficiency` | Merged into `agent-discipline` (P20a) |
| `model-picker` | Merged into `agent-discipline` (P20a) |

---

## Final skill list (12)

`agent-discipline` · `afk-slice` · `design-system-first` · `grill-me` · `handoff` · `improve-codebase` · `mc-status` · `planning-session` · `ralph-loop` · `session-report` · `slice-planning` · `tdd`

---

## CEO steps (Customize UI)

1. **Delete** skills listed above (if present)
2. **Delete** outdated copies of remaining skills (old descriptions mentioning “PRD + slices” or MC paste)
3. **Sync from repo** (Mac, after pull):

```bash
mkdir -p ~/.cursor/skills
cp -r /path/to/pp-workspace/.cursor/skills/* ~/.cursor/skills/
```

4. Reload Cursor → Customize → Skills → User should show **12** skills
5. User Rules: one canonical rule — [`workflow-user-rules-canonical.md`](./workflow-user-rules-canonical.md)

---

## Cloud vs local

| Environment | Skills loaded from |
|-------------|-------------------|
| **Cloud Agent** | Repo `.cursor/skills/` + mirror `.agents/skills/` |
| **Cursor web slash** | Main chat `/grill-me` etc. — **not** + → Skills picker (User Skills only) |
| **Local Agent** | Customize User Skills + repo (dedupe by sync) |
| **User Rules** | Customize — both environments |

After editing `.cursor/skills/`:

```bash
npm run sync:agent-skills
git add .cursor/skills .agents/skills
```

---

## Related

- [`cursor-invoke-cheatsheet.md`](./cursor-invoke-cheatsheet.md) — CEO invoke on web
- [`workflow-skills-sync.md`](./workflow-skills-sync.md)
- [`workflow-user-rules-canonical.md`](./workflow-user-rules-canonical.md)
