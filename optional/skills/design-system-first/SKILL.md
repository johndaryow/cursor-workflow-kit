---
name: design-system-first
description: UI work must use design system primitives from src/design-system — never one-off components. Use before any React UI change.
---

# Design system first

1. Read `src/design-system/` and `/design-system` route in app
2. Follow [`.cursor/rules/design-system-ui.mdc`](../../rules/design-system-ui.mdc) on UI tasks
3. Reuse existing primitive — Button, Card, Dialog, TableShell, Side Panel, Combobox engine
3. If missing: propose **new variant** on existing primitive first
4. New primitive only with plain-English justification in PR

## Agent rule

No new one-off buttons/inputs in app folders. Drift lint: `npm run audit:buttons` (baseline gate may be pre-existing red).

Canon: [`docs/projects/ds-master.md`](../../docs/projects/ds-master.md)
