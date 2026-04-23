---
title: "ZaloCRM Phase 2b — Branch B1: Automation Suite"
description: "Drip campaigns + automation controls + per-contact card log tab"
status: pending
priority: P1
effort: 28h
branch: locphamnguyen/b1-automation-suite
tags: [automation, drip, scheduler, backend, frontend]
created: 2026-04-22
---

# B1 — Automation Suite (FEATURE-09/10/11)

## Goal
Ship drip-campaign engine with runtime controls and per-contact history, integrated w/ existing template + rate-limit infra. Zero impact on current `AutomationRule` trigger-based engine.

## Scope
- **FEATURE-11 Drip Campaign** — N-step sequences, 1 msg/day random-in-window, parallel enrollments, start/stop conditions
- **FEATURE-10 Automation Controls** — pause/resume/cancel, delivery log, bulk ops, status filter
- **FEATURE-09 Card Log Tab** — per-contact automation history in chat panel

## Tech Decisions (locked)
| Decision | Choice | Reason |
|---|---|---|
| Scheduler | `node-cron` every 60s + DB poll | already installed, no Redis infra needed, survives restart via `scheduled_at` column |
| State store | Prisma + Postgres | existing, transactional |
| Randomization | SQL `scheduled_at = today + random(windowStart, windowEnd)` computed at enrollment/advance | deterministic, inspectable |
| Rate limit | reuse `zaloRateLimiter` (200/day, 5/30s) | no new abstraction |
| Send path | reuse `sendTemplateAction` pattern | DRY |
| UI routing | extend `AutomationView.vue` w/ tabs: Rules / Drip / Running | minimal restructure |

## Phase Map
| # | Phase | File Owner | Depends | Effort |
|---|---|---|---|---|
| 01 | Schema + migration | `backend/prisma/schema.prisma`, new migration SQL | — | 3h |
| 02 | Drip engine (scheduler + send loop + condition evaluator) | `backend/src/modules/automation/drip/*` | 01 | 10h |
| 03 | Controls API (pause/resume/cancel/bulk/logs) | `backend/src/modules/automation/drip-routes.ts` | 02 | 4h |
| 04 | Frontend drip builder + running-list UI | `frontend/src/views/AutomationView.vue` + `frontend/src/components/automation/drip/*` | 03 | 7h |
| 05 | Card log tab | `frontend/src/components/chat/ChatContactPanel.vue` + new `ChatCardLog.vue` | 03 | 4h |

## File Ownership (no overlap)
- Phase 02 owns: `backend/src/modules/automation/drip/**` (NEW dir)
- Phase 03 owns: `backend/src/modules/automation/drip-routes.ts` (NEW file) + `backend/src/app.ts` (register route only)
- Phase 04 owns: `frontend/src/components/automation/drip/**` + `AutomationView.vue`
- Phase 05 owns: `frontend/src/components/chat/ChatCardLog.vue` + append tab to `ChatContactPanel.vue`
- Shared touch: `schema.prisma` (phase 01 only), `frontend/src/api/` (add client in phases 03/04/05 owners)

## Execution Order
Strictly sequential 01 → 02 → 03. Then 04 and 05 can run **parallel** (different file trees).

## Data Flow (high level)
```
[User creates DripCampaign] → [enroll Contact] → DripEnrollment(status=active, currentStep=0, scheduledAt=T+0 random)
                                                       ↓
[cron 60s tick] → fetch enrollments WHERE scheduledAt <= NOW && status=active
                → for each: check stop-conditions → render template → zaloRateLimiter → sendMessage
                → write AutomationLog(sent|failed) → advance currentStep or complete
                → compute next scheduledAt (tomorrow + random window)
[Incoming reply webhook] → find active enrollments for contact w/ stopOnReply=true → mark completed
```

## Risk Matrix
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scheduler double-fire after restart | Med | High (duplicate sends) | `FOR UPDATE SKIP LOCKED` row-level lock + atomic `sent_at` update in txn |
| Rate-limiter starvation (200/day cap) | High | Med | queue spillover: re-slot to next day w/ randomized window; log `rate_limited` |
| Stop-condition race (reply arrives during send) | Low | Med | re-check stop-conditions inside send txn; if triggered, rollback send no, mark completed |
| Orphan enrollments after campaign delete | Med | Low | ON DELETE CASCADE in FK |
| Time zone drift (scheduling in UTC vs user's 8–11h local) | High | Med | store `timezone` on DripCampaign (default org-level); convert window→UTC at enrollment |
| Long-running cron tick blocks node event loop | Low | High | batch size 50/tick, async iterator, skip if prior tick still running (`isTicking` flag) |
| Template rendered with null contact fields | Med | Low | reuse existing `renderMessageTemplate` safe-fallback |

## Backwards Compatibility
- No changes to existing `AutomationRule` engine/routes/UI
- New tables additive only; no modifications to `Message`/`Contact`/`Conversation`
- Feature flag env: `DRIP_ENGINE_ENABLED=false` default off until phase 04 complete

## Test Matrix
| Layer | What | Location |
|---|---|---|
| Unit | condition evaluator, random-time util, rate-limit integration | `backend/test/automation/drip-*.test.ts` |
| Integration | full enroll→tick→send→advance cycle w/ real DB | `backend/test/integration/drip-flow.test.ts` |
| E2E manual | create campaign → enroll 3 contacts → verify spread + pause/resume | checklist in phase 04 |

## Rollback Plan
- Per phase: `git revert <phase-commit>` safe; migrations reversible via down-SQL in phase 01
- Runtime: `DRIP_ENGINE_ENABLED=false` disables cron tick immediately w/o data loss (enrollments remain frozen)

## Success Criteria (measurable)
- [ ] 10 contacts enrolled in 5-step campaign → all 50 msgs sent over 5 days, spread across 8–11h window, 0 duplicates
- [ ] Pause mid-campaign → next tick skips paused enrollments; resume → picks up from saved `currentStep`
- [ ] Reply from contact → active enrollment marked `completed` within 60s
- [ ] Rate-limit hit (>200/day) → remaining enrollments re-slotted next day, logged
- [ ] Card log tab shows correct progress N/M + next send time for each active enrollment
- [ ] App restart mid-tick → no duplicate sends, no lost enrollments

## Unresolved Questions
1. **Who owns the drip campaign template?** Re-use `MessageTemplate` per-step (FK) or inline content per step? (Recommend FK for DRY, but inline gives per-campaign isolation.)
2. **Webhook start-condition** — is there an existing inbound webhook module to piggyback, or new endpoint needed? (Need scout report.)
3. **Tag system** — start/stop-by-tag requires a tagging table; does `Contact.source` or a separate `ContactTag` model exist? Not in current schema — deferred to B2 or added here?
4. **Multi-account send** — if contact has conversations across multiple Zalo accounts, which account sends the drip? (Propose: store `zaloAccountId` on enrollment, chosen at enroll time.)
5. **Delivery-status callback** — does zca-js emit delivered/seen events we can persist on AutomationLog? (Needs zca-js research — deferred to phase 02 spike.)
6. **Timezone source** — org-level setting exists? Else default `Asia/Ho_Chi_Minh`.
