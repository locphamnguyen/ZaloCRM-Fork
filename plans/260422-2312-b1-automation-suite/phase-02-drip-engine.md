# Phase 02 — Drip Engine (Scheduler + Send Loop)

**Status:** pending | **Effort:** 10h | **Depends:** phase-01 | **Owner:** backend

## Context
Core runtime. Poll-based scheduler (node-cron 60s) w/ DB-locked claim. Reuses `zaloRateLimiter`, `renderMessageTemplate`, `zaloPool`.

## Files (NEW)
```
backend/src/modules/automation/drip/
  drip-scheduler.ts        # cron registration, tick orchestration (< 120 lines)
  drip-worker.ts           # claim + send single enrollment (< 150 lines)
  drip-enroller.ts         # enroll/unenroll API, dedup check
  drip-conditions.ts       # stop-condition evaluator (reply/tag/inactive)
  drip-window.ts           # random-time-in-window util + timezone convert
  drip-types.ts            # shared types
```
**Modify:** `backend/src/app.ts` — call `startDripScheduler(app)` on boot if `DRIP_ENGINE_ENABLED=true`.

## Data Flow

### Tick (every 60s)
```
1. if isTicking: return                          // reentrancy guard
2. isTicking = true
3. txn BEGIN
4. SELECT ... FROM drip_enrollments
     WHERE status='active' AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC
     LIMIT 50
     FOR UPDATE SKIP LOCKED                     // Postgres row lock
5. for each: processEnrollment()                // sequential (respects rate limit)
6. txn COMMIT
7. isTicking = false
```

### processEnrollment(e)
```
1. reload contact + conversation + campaign + step
2. evaluate stop-conditions → if met: mark completed, clear scheduled_at, log(skipped), return
3. rate-limit check → if blocked: re-schedule +1 day random, log(rate_limited), return
4. render template (step.template_id ?? step.content)
5. instance.api.sendMessage(...) inside try/catch
6. on success:
     - insert Message row (reuse pattern from send-template-action)
     - insert AutomationLog(sent, message_id)
     - if last step: status='completed', completed_at=now, scheduled_at=null
     - else: current_step++, scheduled_at = nextWindow(tomorrow, campaign.window, tz)
7. on failure:
     - insert AutomationLog(failed, error)
     - retry count on enrollment? (defer — mark failed after 3 consecutive)
```

## Condition Evaluator (`drip-conditions.ts`)

```ts
evaluateStopConditions(enrollment, campaign): StopReason | null
  - stopOnReply: query messages WHERE conversationId=X AND senderType='contact' AND sentAt > enrollment.startedAt → true if any
  - stopOnTag: check contact.tags (Q: schema?) or Contact.source/status
  - stopOnInactiveDays: now - contact.lastMessageAt > N days
```

**Q1 from plan.md** (tags) resolved here: if no tag system, implement only `stopOnReply` + `stopOnInactiveDays` in v1. Tag-based conditions deferred.

## Random Window Util (`drip-window.ts`)

```ts
nextScheduledAt(baseDate, windowStart, windowEnd, tz): Date
  - baseDate in tz → zero time
  - minuteRange = (windowEnd - windowStart) * 60
  - offset = crypto.randomInt(0, minuteRange)
  - local = baseDate + windowStart hours + offset minutes
  - return utc(local)
```
Use `Intl.DateTimeFormat` or lightweight tz lib already in deps (check). If none, hardcode UTC+7 for `Asia/Ho_Chi_Minh` — list as follow-up.

## Worker Concurrency
Single node process → single cron tick. No horizontal scaling concerns in v1. If deployed multi-instance later, `FOR UPDATE SKIP LOCKED` still safe; document in phase.

## Reply-Trigger Path
**Not** in scheduler. Hook into existing message-receive pipeline (find in `zalo-message-sync.ts` or chat routes): on inbound contact message, call `markEnrollmentsOnReply(contactId)` → update `status='completed'` for active enrollments w/ `stopOnReply=true`.

**Modify:** the existing inbound handler (ONE line call). File owner still phase-02 (cross-cutting but minimal).

## Files to Read for Context
- `backend/src/modules/zalo/zalo-rate-limiter.ts`
- `backend/src/modules/zalo/zalo-pool.ts`
- `backend/src/modules/automation/actions/send-template-action.ts`
- `backend/src/modules/automation/template-renderer.ts`
- `backend/src/modules/zalo/zalo-message-sync.ts` (for reply hook)

## Success Criteria
- [ ] Unit: `nextScheduledAt` returns time within [start, end] window in target tz, 1000 iterations
- [ ] Unit: stop-condition evaluator correctly returns reason when reply exists after enrollment
- [ ] Integration: enroll contact → fast-forward `scheduled_at=now()` → tick → message sent, log written, step advanced
- [ ] Restart mid-tick (SIGTERM during send): no duplicate send on restart (row lock proves it)
- [ ] Rate limit triggered → enrollment re-slotted to next-day window, log shows `rate_limited`

## Risks
- `FOR UPDATE SKIP LOCKED` — Prisma exposes raw via `$queryRaw`; use raw for the SELECT, then Prisma for updates within same txn
- Cron tick > 60s: set batch=50, typical send is <1s, so 50s worst case; add metric
- Reply-hook regression: touching hot path in message-sync; feature-flag call behind `DRIP_ENGINE_ENABLED`
