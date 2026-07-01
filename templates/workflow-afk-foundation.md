# AFK foundation — how slices run (Path A)

**For:** CEO · non-developer  
**Status:** Locked 2026-06-30 (mini-grill + GitHub secrets)  
**Canon for agents:** `.cursor/skills/afk-slice/SKILL.md`

---

## Your goal (one sentence)

After grill → PRD → slice planning (three chats), **AFK slices run themselves** — you only read SESSION REPORTs.

---

## The loop (single path)

```text
Grill (chat A) → PRD only (chat B) → tracer slices + Ralph wiring (chat C)
  → AFK agent runs ONE slice (chat D+)
  → push → PR → exit tests → auto-merge
  → GitHub Action launches next agent
  → repeat until AFK_QUEUE empty or HITL gate
```

| Step | Who | Where |
|------|-----|--------|
| Queue | Master doc `STATUS` block | `docs/projects/<program>-master.md` |
| Slice shape | Vertical tracer bullet | DB/API/UI/test in one thin slice |
| Merge | Agent (`mc:auto-merge`) | You do not click merge |
| Next agent | **GitHub Action** `ralph-continue-on-merge.yml` | Uses `CURSOR_API_KEY` in GitHub secrets |
| Agent VM secrets | Cursor saved Environment | GCP, GITHUB_PAT, Cloudflare |

**Cursor Automations** (merge trigger): keep **Inactive** — duplicate / unreliable.

---

## CEO setup checklist (one time)

### Cursor Cloud Agents → Environment

- Name: **your saved Environment** (see Cloud Agents → Environments)
- Tier 1 secrets + **Save snapshot**
- Verify: `npm run cloud:env-check` on a fresh agent

### GitHub → repo → Settings → Secrets → Actions

| Secret | Value |
|--------|--------|
| `CURSOR_API_KEY` | Cursor Dashboard → API Keys |
| Cloud env name secret | Same string as Environment name in Cursor dashboard |

### Cursor Automations

- **PP · Ralph continue on merge** → **Inactive**

---

## When a slice is “done”

Agent must pass:

```bash
npm run mc:slice-closeout -- --branch <branch>   # after push
npm run mc:slice-closeout -- --pr-number <n>     # before auto-merge (SESSION REPORT + Slice + STATUS)
npm run mc:auto-merge -- <n>
```

After merge, **GitHub Action** runs `mc:status-reconcile` on `main` (fixes `RALPH_RUNNING`, `LAST_MERGED_PR`, §5b lane row) **then** `mc:ralph-chain` / `mc:ralph-launch`.

---

## If stuck

| Symptom | Fix |
|---------|-----|
| Branch pushed, no PR | Say “open PR and continue” or agent runs `github:auth-check` |
| Merged, no next agent | GitHub Actions tab — check secrets; run `npm run mc:ralph-launch -- --pr-number <n>` |
| Chain says “Sub-lane busy” after merge | Should not recur after WORKFLOW-P18 — run `npm run mc:status-reconcile -- --pr-number <n> --dry-run` on main |
| Agent confused | `npm run mc:status -- <program>` — one STATUS block only |

---

## Pocock alignment

| Pocock | PP (Cursor) |
|--------|----------------|
| `/grill-me` | `grill-me` skill (chat A) |
| `/to-prd` | `planning-session` skill (chat B — destination only) |
| `/to-issues` | `slice-planning` skill (chat C — tracer bullets + quiz) |
| Issue queue | Master doc §12 + STATUS `AFK_QUEUE` |
| Vertical slices | Tracer bullets in §12 — not horizontal phases |
| AFK / HITL tags | `AUTONOMY` / `CEO_GATE` on each slice |
| Ralph bash loop | **GitHub Action + fresh Cloud Agent per slice** |
| Sand Castle parallel | Later — serial first |

---

## Related docs

- [`workflow-master.md`](./workflow-master.md) — program rules
- [`cursor-cloud-setup.md`](./cursor-cloud-setup.md) — secrets detail
- [`repo-health-master.md`](./repo-health-master.md) — active REPO-H queue
