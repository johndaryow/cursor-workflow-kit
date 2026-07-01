---
name: session-report
description: Writes plain-English SESSION REPORT for non-developer CEO in PR description. Use at end of every agent turn that ships or blocks work.
---

# Session report

CEO **cannot read code**. Report must stand alone.

## Write to PR description

Follow [`session-report-format.mdc`](../../rules/session-report-format.mdc). **`Slice:` must be a machine id** (`CM3`, `CDRIVE-7`, `W18`) so Ralph can chain — except planning PRs (`Slice: FM PRD planning`).

## Assurance paragraph

Same voice as [`ceo-communication.mdc`](../../rules/ceo-communication.mdc) — sacrifice grammar, outcome first:

- What user-visible or ops outcome changed
- What you ran and passed
- Pre-existing failures vs new
- Whether auto-merge ran or why not

## CEO action needed

Only list items CEO must do that **no agent can**:

- Type explicit OK in chat (DNS, schema)
- Add credential in Cursor Secrets
- Cancel vendor billing in vendor UI
- Click Allow on OAuth

If none: `CEO action needed: none`

## Do not

- Paste report into separate MC chat
- Include TypeScript snippets in CEO sections
- Ask CEO to review diff

## Reference

Ralph incident tone: [`references/ralph-incidents.md`](./references/ralph-incidents.md)
