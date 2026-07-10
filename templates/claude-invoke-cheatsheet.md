# How to invoke skills (CEO · Claude Code)

Claude Code skills live in `.claude/skills/` — same file format as `.cursor/skills/`, just a different folder Claude Code looks in natively. Nothing to sync manually inside a product repo; both folders come from the kit's `install.sh`.

---

## Planning chain (fresh Claude Code session each step)

| Step | Invoke | Then say |
|------|--------|----------|
| **A — Grill** | `/grill-me` | *Grill me on [program]. One question at a time.* |
| **B — PRD** | `/planning-session` | *Write the PRD only — no slices.* |
| **C — Slices** | `/slice-planning` | *Plan tracer-bullet slices.* |
| **D+ — Execute** | *(no slash)* | *Continue* · *Start FM-0* · *Where are we?* (`mc-status`) |

Planning skills use **`disable-model-invocation: true`** — they run when **you** type `/skill-name`, not auto-only. Same rule as the Cursor side.

---

## If a skill doesn't seem to load

1. Confirm the file exists: `.claude/skills/grill-me/SKILL.md`
2. Plain English always works: *"Read and follow .claude/skills/grill-me/SKILL.md. Grill me on [your idea]. One question at a time."*
3. New repo, first session? Run `install.sh` from the kit (or ask the agent: *"Update workflow from central kit"*) so `.claude/skills/` exists at all.

---

## All 11 workflow skills (Tier 1)

| Skill | When |
|-------|------|
| `grill-me` | New program alignment |
| `planning-session` | PRD only (after grill) |
| `slice-planning` | Tracer bullets + chain wiring |
| `afk-slice` | Execute one slice |
| `ralph-loop` | How the merge chain works (reference — read this one, it's where Cursor and Claude Code genuinely differ) |
| `mc-status` | Where are we? |
| `session-report` | PR closeout |
| `agent-discipline` | Model + session picks |
| `tdd` | Logic changes |
| `improve-codebase` | Architecture planning |
| `handoff` | Emergency mid-slice only |

`design-system-first` is Tier 4 (optional) — copy from `optional/skills/` if your repo has a shared UI design system; not yet mirrored to `.claude/skills/`.

---

## Verify skills exist (agent or you)

Open in repo on **main**:

```text
.claude/skills/grill-me/SKILL.md
```

## One thing that's genuinely different from Cursor

Cursor's Ralph chain auto-launches the next Cloud Agent after a merge, via a GitHub Action + Cursor's own API. Claude Code doesn't plug into that Action. From Claude Code, chain to the next slice by saying **"Continue"** in a fresh session (manual, same idea as `npm run mc:opener`), or set up a scheduled Routine if you're on Claude Code on the web. See the `ralph-loop` skill for detail — it's the one place in this kit where the two tools aren't drop-in equivalents.
