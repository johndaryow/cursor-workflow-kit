# AGENTS.md — workflow snippet (paste into your repo AGENTS.md)

## Agent workflow (Cursor Cloud)

- **Controller:** `docs/projects/*-master.md` STATUS DASHBOARD — not a separate MC chat
- **Planning:** `/grill-me` → `/planning-session` → `/slice-planning` (three fresh chats)
- **Execution:** `npm run mc:status` → run `NEXT_PROMPT` slice per `afk-slice` skill
- **Reports:** SESSION REPORT in PR only — CEO does not read diffs
- **Merge:** AFK + green exit tests → `npm run mc:auto-merge -- <pr>`
- **Chain:** GitHub Action `ralph-continue-on-merge.yml` after merge (needs `CURSOR_API_KEY`)

## Skills

Repo: `.cursor/skills/` (mirror: `.agents/skills/` via `npm run sync:agent-skills`)

## Customize (CEO)

One User Rule — see `docs/projects/workflow-user-rules-canonical.md`

## Project-specific section (YOU WRITE THIS)

- Stack (framework, host, database)
- Required Cursor Cloud secrets
- Deploy commands
- Test/verify scripts
- Production cautions (live DB, billing, etc.)
