# Ralph / automation incidents — CEO explainers (sacrifice grammar)

Copy tone from [`ceo-communication.mdc`](../../../rules/ceo-communication.mdc). Update when a new class of failure is understood.

---

## WORKFLOW-P16 · RTE-F2 merge didn't start RTE-F3 (2026-06-29)

**Bottom line:** Your passwords were fine. A broken login-check tool made Ralph think the computer wasn't ready — so it stopped instead of starting RTE-F3. Fixed in #348 + #349.

**What happened**
- PR #347 (RTE-F2) merged ~15:22 UTC
- **Ralph** (auto chain on merge) should start **RTE-F3**
- Cursor Automation ran → hit **health check** (`cloud:env-check`) → **FAIL**
- Looked like missing Cloudflare password — **wasn't**. Broken `npx wrangler` on that computer
- Ralph design: health check fail → **notify only** — no new agent at cursor.com/agents

**What we fixed (#348)**
- Health check uses Cloudflare **API verify** — no flaky wrangler
- **RTE-F3 shipped** — export fail/success now hits job board + database (not silent)
- Queue advanced — **RTE-F4** is next

**Planner quirk (#349)**
- PR title had `WORKFLOW-P16 + RTE-F3` → Ralph treated as "docs only" once
- Fixed — combined infra + real slice PRs chain correctly going forward
- **#348 already merged** before fix → **RTE-F4 didn't auto-start**. Manual kick needed once

**You — one check**
- [cursor.com/automations](https://cursor.com/automations) → `PP · Ralph continue on merge` → **Environment = pp-workspace** (same saved bundle as Cloud Agents)
- Re-save snapshot only if you changed secrets lately

**Next**
- Say **Start RTE-F4** in a fresh agent chat (MP4 fix on PP38499)
- After that, merges with `Slice: RTE-F4` in PR should chain to F5 if Environment attached

**How to verify chain healthy**
- Agent runs `npm run mc:ralph-health` → should say **cloud:env-check PASS**
- After next AFK merge → new session at [cursor.com/agents](https://cursor.com/agents) within ~2 min

---

## Template (fill for next incident)

**Bottom line:**

**What happened**
-

**What we fixed**
-

**You**
- none | <one step>

**Next**
-
