# How to invoke skills (CEO · Cursor web + desktop)

**Repo skills live in two mirrored folders** (same content):

- `.cursor/skills/` — primary source (edit here)
- `.agents/skills/` — mirror for Cursor discovery (auto-synced)

After editing skills, agents run: `npm run sync:agent-skills`

---

## Planning chain (fresh chat each step)

| Step | Invoke | Then say |
|------|--------|----------|
| **A — Grill** | `/grill-me` | *Grill me on [program]. One question at a time.* |
| **B — PRD** | `/planning-session` | *Write the PRD only — no slices.* |
| **C — Slices** | `/slice-planning` | *Plan tracer-bullet slices for Ralph.* |
| **D+ — Execute** | *(no slash)* | *Continue* · *Start FM-0* · *Where are we?* (`mc-status`) |

Planning skills use **`disable-model-invocation: true`** — they run when **you** type `/skill-name`, not auto-only.

---

## If + → Skills shows “No matching skills”

That picker often lists **User Skills** (account), not repo skills. **Ignore it.** Use one of these instead:

### 1. Slash in the **main chat box** (best)

```text
/grill-me

Grill me on [your idea]. One question at a time.
```

### 2. @ attach

Type `@` in chat → search **grill-me** or paste:

```text
.cursor/skills/grill-me/SKILL.md
```

### 3. Plain English (always works)

```text
Read and follow .cursor/skills/grill-me/SKILL.md.
Grill me on [your idea]. One question at a time.
```

---

## All 12 workflow skills

| Skill | When |
|-------|------|
| `grill-me` | New program alignment |
| `planning-session` | PRD only (after grill) |
| `slice-planning` | Tracer bullets + Ralph wiring |
| `afk-slice` | Execute one slice |
| `ralph-loop` | How merge chain works (reference) |
| `mc-status` | Where are we? |
| `session-report` | PR closeout |
| `agent-discipline` | Model + token picks |
| `tdd` | Logic changes |
| `design-system-first` | UI work |
| `improve-codebase` | Architecture planning |
| `handoff` | Emergency mid-slice only |

---

## Verify skills exist (agent or you)

Open in repo on **main**:

```text
.cursor/skills/grill-me/SKILL.md
.agents/skills/grill-me/SKILL.md
```

**Customize → Rules → Skills** — should list project skills under **Agent Decides** after reload.

---

## Desktop Mac only (optional)

Copy repo skills to account (all projects):

```bash
cp -r /path/to/pp-workspace/.cursor/skills/* ~/.cursor/skills/
```

Not required for **Cursor web**.
