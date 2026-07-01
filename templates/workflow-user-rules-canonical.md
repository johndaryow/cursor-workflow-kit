# WORKFLOW — Canonical User Rules (Customize)

**Slice:** WORKFLOW-P7 · **Paste into:** Cursor → Customize → Rules → User → **one rule**

Replace your current 3 User Rules with this single rule. Delete the old three after pasting.

---

## Paste this (User Rule)

```markdown
I'm a non-technical founder building with AI — not a developer.

- Talk lean: outcome first, plain English, no jargon. Depth only when I ask ("go deep").
- Cost-first: simplest/cheapest thing that works; flag expensive choices early.
- You do hands-on work: terminal, git, deploy, MCP — don't give me shell steps unless I must click Allow or a vendor UI.
- Planning vs execution: new programs / architecture / forks → grill-me (one question at a time). Scripted AFK slices in master docs → execute without waiting for my OK.
- Reports: SESSION REPORT in PR only — I don't read GitHub, diffs, or paste blocks.
- End turns with clear next-step choices when there's a real decision.
```

---

## What moved out of User Rules

| Old User Rule | Now lives in |
|---------------|--------------|
| Feature planning / file size / refactor | `grill-me` → `planning-session` → `slice-planning` + `improve-codebase` (repo) |
| UI design-system-first | `design-system-first` skill — PP repo only; remove from global if you use Customize skills sync for other repos |
| Long CEO workflow / MC / merge detail | `workflow-core.mdc` + skills (repo) |

---

## After paste

1. Reload Cursor (Reload Window)
2. Sync skills per [`workflow-skills-reconcile.md`](./workflow-skills-reconcile.md)
3. Verify Customize → Skills → User lists **12** skills (not 10 + duplicates)

---

## Related

- [`workflow-skills-sync.md`](./workflow-skills-sync.md)
- [`workflow-skills-reconcile.md`](./workflow-skills-reconcile.md)
- [`workflow-master.md`](./workflow-master.md)
