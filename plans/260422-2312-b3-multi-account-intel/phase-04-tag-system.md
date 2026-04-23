# Phase 04 — Dual Tag System (FEATURE-13)

**Status:** pending | **Effort:** 9h | **Depends:** 01 + Researcher A report

## Context
Two tag types coexisting:
- **CRM tag** — internal, automation triggers, fully under our control.
- **Zalo tag** — 2-way sync with real Zalo via zca-js label API (pending researcher A).

Auto-tag rules: declarative event-driven (e.g., `message_received` + reply detection → tag "responded").

## Files (new module dir)
- Create: `backend/src/modules/tags/tag-routes.ts`
- Create: `backend/src/modules/tags/tag-service.ts`
- Create: `backend/src/modules/tags/auto-tag-engine.ts`
- Create: `backend/src/modules/tags/zalo-tag-sync-worker.ts`
- Create: `backend/src/modules/tags/zalo-tag-sync-queue.ts`
- Modify: `backend/src/index.ts` (register routes + start worker)
- Modify: `backend/src/modules/chat/message-handler.ts` (emit hook → auto-tag-engine)

## API

```
GET    /api/v1/tags?source=crm|zalo|all
POST   /api/v1/tags                              { name, color, icon?, source }
PATCH  /api/v1/tags/:id
DELETE /api/v1/tags/:id

GET    /api/v1/contacts/:id/tags                 → both sources, separated
POST   /api/v1/contacts/:id/tags                 { tagId } (queues Zalo sync if source=zalo)
DELETE /api/v1/contacts/:id/tags/:tagId

GET    /api/v1/auto-tag-rules
POST   /api/v1/auto-tag-rules                    { name, event, condition, tagId }
PATCH  /api/v1/auto-tag-rules/:id
DELETE /api/v1/auto-tag-rules/:id
POST   /api/v1/auto-tag-rules/:id/test           { sampleEventPayload } → dry-run match
```

## Auto-tag Rule DSL (JSON in `condition` column)

```json
{
  "all": [
    { "field": "message.contentLowercase", "op": "contains", "value": "giá" },
    { "field": "contact.status", "op": "in", "value": ["new","contacted"] }
  ]
}
```

Operators: `eq`, `ne`, `contains`, `in`, `gte`, `lte`, `regex`, `hasReplied`. Keep small for v1 (YAGNI).

## Auto-tag Engine

```ts
// auto-tag-engine.ts
export async function evaluate(event: TagEvent) {
  const rules = await prisma.autoTagRule.findMany({
    where: { orgId: event.orgId, event: event.type, enabled: true },
    include: { tag: true },
  });
  for (const rule of rules) {
    if (matchesCondition(rule.condition, event.payload)) {
      await applyTag({
        contactId: event.contactId,
        tagId: rule.tagId,
        source: rule.tag.source,
        appliedBy: `auto-rule:${rule.id}`,
      });
      // If Zalo tag → enqueue sync
      if (rule.tag.source === 'zalo') await enqueueZaloSync({ ... });
    }
  }
}
```

Hook in `message-handler.ts` after message persist:
```ts
await autoTagEngine.evaluate({
  type: 'message_received',
  orgId, contactId, payload: { message, contact },
});
```

Loop guard: engine never fires `tag_applied` event itself; rules only react to message/status events.

## Zalo Tag Sync Worker

Cron every 15min (using existing `node-cron` if present, else `setInterval`):
1. **Pull** — for each connected `ZaloAccount`, call `api.getLabels()` (TBD researcher A) → diff against `ZaloTagSnapshot` → upsert deltas → create `ContactTagLink` for new labels.
2. **Push** — drain `ZaloTagSyncQueue` (status=pending, ordered by createdAt). Per account: respect `zaloRateLimiter` (5/30s). Call `api.addLabel(uid, label)` / `api.removeLabel(uid, label)`. On success → mark `done`, update snapshot. On failure → increment `attempts`; after 3 → `failed`, log.
3. **Conflict resolution** — if pull diff conflicts with pending queue item: last-write-wins by `updatedAt`. Log to `audit_log` (or just `logger.warn`).

Pseudocode:
```ts
async function runOnce() {
  const accounts = await prisma.zaloAccount.findMany({ where: { status: 'connected' } });
  await Promise.allSettled(accounts.map(pullLabelsForAccount));
  await drainQueue();
}
```

If researcher A returns "no label API" → ship CRM-only path; mark Zalo queue/worker as feature-flagged off; UI hides Zalo tag controls.

## Steps
1. Read researcher A report (BLOCKER for Zalo half).
2. Implement `tag-service.ts` (CRM CRUD + contact link).
3. Implement `tag-routes.ts` with Zod.
4. Implement `auto-tag-engine.ts` + hook in `message-handler.ts`.
5. Implement worker (skeleton even if no zca-js API; toggle via env `ZALO_TAG_SYNC_ENABLED`).
6. Tests:
   - CRM tag CRUD scoped by orgId
   - Auto-tag rule matches on keyword
   - Auto-tag rule applies tag once (idempotent unique constraint)
   - Sync worker queue drain respects rate limit
   - Pull diff updates snapshot

## Success Criteria
- [ ] CRM tag CRUD works, source distinguished in API responses
- [ ] Adding Zalo tag in UI → row in `ZaloTagSyncQueue` with status=pending
- [ ] Worker run drains queue, calls zca-js (if API exists), updates snapshot
- [ ] Auto-tag rule "contains 'giá' → tag interested" fires on next inbound message
- [ ] No infinite loops (rule output doesn't re-trigger rules)
- [ ] Feature flag disables Zalo half cleanly

## Risks
- **Critical**: zca-js label API may not exist → entire Zalo half blocked. Mitigation: feature flag + ship CRM-only.
- Worker crash mid-batch → next run picks up remaining pending. Idempotent.
- Rate limit shared with chat sends → worker yields if `zaloRateLimiter.checkLimits` returns near-limit. Reserve 80% capacity for chat.
- Auto-tag rule misfire on bulk import → engine should accept `skipAutoTag` flag for bulk operations.
