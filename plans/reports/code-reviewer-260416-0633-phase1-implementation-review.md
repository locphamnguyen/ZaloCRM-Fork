# Code Review: ZaloCRM Phase 1 Implementation

**Reviewer:** code-reviewer | **Date:** 2026-04-16  
**Branch:** `locphamnguyen/fix-setup-vite-pwa` -> `main`  
**Diff:** ~1,144 lines across 12 modified + 3 new files

---

## Scope

| Area | Files |
|------|-------|
| BUG-01: Message Sync | `zalo-pool.ts`, `zalo-listener-factory.ts`, `message-handler.ts`, `zalo-message-sync.ts` (NEW) |
| BUG-02: Special Messages | `zalo-message-helpers.ts`, `special-message-renderer.vue` (NEW), `MessageThread.vue`, `ConversationList.vue` |
| FEATURE-02: Filters | `chat-routes.ts`, `schema.prisma`, `ConversationList.vue` |
| FEATURE-07: Templates | `template-routes.ts`, `template-renderer.ts`, `quick-template-popup.vue` (NEW), `MessageThread.vue` |
| FIX: Vite PWA | `frontend/.npmrc` (NEW), `frontend/package.json`, `bin/dev-setup` |

---

## Overall Assessment

Solid implementation covering 5 distinct features. Architecture decisions are sound: dedup by zaloMsgId, selfListen for own-message capture, polling backup for groups, personal vs team templates with proper authz checks. Code is readable, error handling is present throughout.

**However**, there are 2 critical issues and several high-priority items that should be addressed before merging.

---

## Critical Issues (BLOCKING)

### C-1. Race condition in message dedup — TOCTOU vulnerability
**File:** `backend/src/modules/chat/message-handler.ts:72-81`

The dedup check is a classic Time-of-Check-Time-of-Use (TOCTOU) race. Between the `findFirst` (check) and `create` (use), a concurrent call with the same `zaloMsgId` can insert the duplicate.

This is likely to occur in production because:
- `old_messages` handler processes messages sequentially per batch, BUT
- The real-time `message` listener AND the `old_messages` handler AND the polling `zalo-message-sync.ts` all feed into `handleIncomingMessage` concurrently
- A message arriving via real-time + appearing in old_messages backfill = same msgId processed twice simultaneously

**Impact:** Duplicate messages stored in DB, shown to users twice.

**Fix:** Add a unique partial index on `messages(conversationId, zaloMsgId)` WHERE `zaloMsgId IS NOT NULL`, then wrap the insert in a try/catch for unique constraint violation:

```prisma
// schema.prisma — Message model
@@unique([conversationId, zaloMsgId])  // or @@index with unique
```

```typescript
// message-handler.ts — replace findFirst+create with upsert or catch
try {
  const message = await prisma.message.create({ data: { ... } });
} catch (err: any) {
  if (err.code === 'P2002') { // Prisma unique constraint violation
    logger.debug(`[message-handler] Dedup: zaloMsgId=${msg.msgId} already exists`);
    return null;
  }
  throw err;
}
```

Note: A `@@unique` constraint on a nullable column in Prisma/PostgreSQL allows multiple NULLs, so messages without zaloMsgId are unaffected.

### C-2. N+1 query in polling sync — unbounded DB calls per group per message
**File:** `backend/src/modules/zalo/zalo-message-sync.ts:46-56`

The sync loop does this for EACH message in EACH group:
1. `prisma.message.findFirst(...)` — 1 query per message to check existence
2. `handleIncomingMessage(...)` — which internally does another `findFirst` for dedup + creates

With `MAX_GROUPS_PER_SYNC=20` and `MESSAGES_PER_GROUP=50`, that's up to **1,000 existence checks** every 5 minutes per account, plus the handler's own queries. With multiple connected Zalo accounts, this grows linearly.

**Impact:** DB load scales poorly. Under 5 accounts with 20 active groups each, expect ~5,000 queries every 5 minutes just for sync.

**Fix:** Batch the existence check:

```typescript
// Fetch all existing zaloMsgIds for this conversation in one query
const existingMsgIds = await prisma.message.findMany({
  where: {
    conversationId: conv.id,
    zaloMsgId: { in: messages.map(m => String(m.data?.msgId || '')).filter(Boolean) },
  },
  select: { zaloMsgId: true },
});
const existingSet = new Set(existingMsgIds.map(m => m.zaloMsgId));

for (const msg of messages) {
  const zaloMsgId = String(msg.data?.msgId || '');
  if (!zaloMsgId || existingSet.has(zaloMsgId)) continue;
  // ... proceed with handleIncomingMessage
}
```

---

## High Priority

### H-1. Missing index on `messages.zaloMsgId` — full table scan on dedup
**File:** `backend/prisma/schema.prisma:195`

The `Message` model has no index involving `zaloMsgId`. Every dedup check (`findFirst where conversationId + zaloMsgId`) does a sequential scan on the messages table. As message volume grows, this becomes a bottleneck.

**Fix:** Add composite index (or unique constraint per C-1):
```prisma
@@index([conversationId, zaloMsgId])
```

### H-2. `accountId` filter silently overridden for member role
**File:** `backend/src/modules/chat/chat-routes.ts:27,35` and `:64,99`

When a member passes `?accountId=X` to filter by a specific account, the code first sets `baseWhere.zaloAccountId = accountId` (line 27/64), then unconditionally overwrites it with `{ in: [...accessible] }` (line 35/99). The member's filter is silently ignored.

**Impact:** Functional bug — member filtering by specific account shows all their accessible accounts instead.

**Fix:** Intersect rather than override:
```typescript
if (user.role === 'member') {
  const accessible = await prisma.zaloAccountAccess.findMany({...});
  const accessibleIds = accessible.map(a => a.zaloAccountId);
  if (accountId) {
    // Respect filter only if member has access
    if (!accessibleIds.includes(accountId)) {
      return reply.status(403).send({ error: 'Access denied' });
    }
    // accountId already set, access confirmed
  } else {
    where.zaloAccountId = { in: accessibleIds };
  }
}
```

### H-3. No input validation on `from`/`to` date params — `Invalid Date` passed to Prisma
**File:** `backend/src/modules/chat/chat-routes.ts:79-80`

`new Date(from)` with an arbitrary string like `from=notadate` produces `Invalid Date`, which Prisma will either reject with an unhelpful error or silently pass to PostgreSQL.

**Fix:**
```typescript
if (from) {
  const d = new Date(from);
  if (isNaN(d.getTime())) return reply.status(400).send({ error: 'Invalid from date' });
  where.lastMessageAt.gte = d;
}
```

### H-4. `parseInt` without radix or bounds checking on pagination
**File:** `backend/src/modules/chat/chat-routes.ts:115-116`

`parseInt(limit)` with user-controlled input. Passing `limit=0` causes `take: 0` (empty result). Passing `limit=-1` with Prisma: undefined behavior. Passing `limit=999999` fetches the entire table.

**Fix:** Clamp to reasonable bounds:
```typescript
const pageNum = Math.max(1, parseInt(page) || 1);
const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
```

### H-5. Template variable rendering has no output encoding — XSS risk
**File:** `backend/src/modules/automation/template-renderer.ts:38-39`

`renderMessageTemplate` does raw string interpolation. If a contact's `fullName` contains `<script>alert(1)</script>`, the rendered template will contain executable HTML/JS. If this rendered content is ever displayed in a web context (admin panel, email notification, etc.), it's XSS.

Currently, templates go through Zalo's chat which strips HTML, so the risk is limited to the admin-facing template preview and any future rendering contexts.

**Fix:** Sanitize values in the resolver functions or document that callers must sanitize output.

---

## Medium Priority

### M-1. Template `category` is set to `null` when not provided in PUT — destructive update
**File:** `backend/src/modules/automation/template-routes.ts:124`

```typescript
category: typeof body.category === 'string' ? body.category : null,
```

If a PUT request omits `category`, it's set to `null`, clearing any existing category. Should be `undefined` (skip update) when not provided.

**Fix:**
```typescript
category: body.category !== undefined ? (typeof body.category === 'string' ? body.category : null) : undefined,
```

### M-2. `contact_card` type not rendered in MessageThread
**File:** `backend/src/modules/zalo/zalo-message-helpers.ts:31` returns `'contact_card'`, but `SPECIAL_TYPES` in `MessageThread.vue:188` does not include it. `ConversationList.vue:382` has a preview for it.

**Impact:** `contact_card` messages fall through to the plain text renderer in the message thread, showing raw JSON content.

**Fix:** Add `'contact_card'` to `SPECIAL_TYPES` set and add a corresponding card in `SpecialMessageRenderer`.

### M-3. Frontend template variable renderer is duplicated and divergent from backend
**Files:** `quick-template-popup.vue:90-101` vs `template-renderer.ts:7-32`

The frontend `renderVariables()` has a subset of backend variables and lacks `contact.email`, `contact.status`, `org.name`, `conversation.id`. The preview will show `{{org.name}}` literally while the backend would resolve it.

**Impact:** Misleading template preview — user sees unresolved variables that will actually be resolved server-side.

**Fix:** Either import the variable list from the `/templates/variables` endpoint and render all known ones, or clearly indicate "some variables resolve on send only".

### M-4. `old_messages` handler processes sequentially — no concurrency control
**File:** `backend/src/modules/zalo/zalo-listener-factory.ts:154-201`

The `for (const message of messages)` loop awaits each message sequentially. With potentially dozens of backfill messages, each requiring `resolveZaloName` (API call + cache miss) + `handleIncomingMessage` (3+ DB queries), this could take 30+ seconds.

During this time, new real-time messages are queued in the Node.js event loop and won't be processed until backfill completes, causing visible delay.

**Fix:** Use `Promise.allSettled` with a concurrency limiter (e.g., p-limit) to process in batches of 5-10.

### M-5. Tags filter uses `array_contains` on Prisma Json field
**File:** `backend/src/modules/chat/chat-routes.ts:88`

`array_contains` on a `Json` typed field in Prisma generates a PostgreSQL `@>` jsonb operator. This works correctly BUT:
- No GIN index exists on `contacts.tags`, so this filter does a sequential scan on the contacts table
- Prisma's `array_contains` filter on `Json` fields is documented as unstable/experimental in some versions

**Fix:** Consider adding a GIN index via raw SQL migration:
```sql
CREATE INDEX idx_contacts_tags ON contacts USING GIN (tags jsonb_path_ops);
```

### M-6. Template route `/variables` is unauthenticated relative to org
**File:** `backend/src/modules/automation/template-routes.ts:12-14`

The `/templates/variables` endpoint returns the same static list for all users regardless of org. This is fine architecturally (it's static data), but it's registered after `authMiddleware`, so at least authentication is enforced. No issue per se, but worth noting it's org-agnostic.

---

## Low Priority

### L-1. `selfListen: true` type assertion is redundant
**File:** `backend/src/modules/zalo/zalo-pool.ts:20`

The `Zalo` constructor type was updated to include `selfListen?: boolean` but only in the local `as` cast. If `zca-js` updates its types, this will diverge.

### L-2. `contact_card` preview label in ConversationList but no handler
**File:** `frontend/src/components/chat/ConversationList.vue:382`

Added `case 'contact_card': return prefix + 'Danh thiep';` but no matching renderer exists (see M-2).

### L-3. `formatDateShort` does not handle invalid input
**File:** `frontend/src/components/chat/ConversationList.vue:427-430`

If `dateStr` is malformed (not YYYY-MM-DD), the `split('-')` produces garbage. Low risk since it's only called from a date input that enforces format.

### L-4. No pagination on template list endpoint
**File:** `backend/src/modules/automation/template-routes.ts:43`

`findMany` without `take` limit. An org with thousands of templates returns all at once. Low risk for MVP since template counts are typically small.

### L-5. `vite-plugin-pwa` moved to devDependencies — verify build still works
**File:** `frontend/package.json`

The package was moved from `dependencies` to `devDependencies`. This is correct (it's a build tool), but verify the production build doesn't reference it at runtime.

---

## Edge Cases Found by Scout

1. **Empty string zaloMsgId:** `String(message.data?.msgId || '')` produces `''` when msgId is falsy. The dedup check (`if (msg.msgId)`) skips empty strings correctly. But `prisma.message.create` stores `zaloMsgId: msg.msgId || null` which converts `''` to `null`. Consistent and safe.

2. **Backfill during active chat:** When `old_messages` fires, backfilled messages emit `io.emit('chat:message')` which causes the frontend to show them in real-time. If the user is actively chatting, they'll see old messages appear at the bottom (newest position). The frontend should sort messages by `sentAt` to handle this — verified that `MessageThread.vue` fetches by `sentAt desc` and reverses, so display order is correct.

3. **Sync interval not cleaned on process exit:** `syncIntervals` map in `zalo-message-sync.ts` uses `setInterval`. On graceful shutdown, these intervals are not cleared (no process exit handler). Leak risk in hot-reload dev environments.

4. **Circuit breaker key mismatch:** In `zalo-pool.ts:183`, the disconnect history key is `dc_${id}` but `disconnectHistory` is checked by that key. The `delete` on line 193 uses the same key. This is consistent, but the `dc_` prefix is unnecessary since the Map is already account-scoped.

---

## Positive Observations

- **Dedup strategy is correct in concept** — checking by zaloMsgId before insert is the right approach (just needs a unique constraint for atomicity)
- **isBackfill flag** — cleanly skips automations and webhooks for historical messages, preventing notification spam
- **Template authorization model** — personal vs team with proper role checks on create/update/delete is well-thought-out
- **Composite indexes on Conversation** — `[orgId, zaloAccountId, isReplied, lastMessageAt]` covers the new filter queries efficiently
- **Error isolation** — each message in `old_messages` loop has its own try/catch, so one failure doesn't abort the batch
- **SpecialMessageRenderer** — clean component with computed properties, proper Vietnamese locale formatting for currency
- **Circuit breaker** — disconnect throttling with 5-in-5-min threshold prevents infinite reconnect loops

---

## Recommended Actions (prioritized)

1. **[MUST] C-1:** Add `@@unique([conversationId, zaloMsgId])` index + catch P2002 in handler — prevents duplicate messages
2. **[MUST] C-2:** Batch existence check in `zalo-message-sync.ts` — prevents DB overload under normal operation
3. **[SHOULD] H-1:** Falls under C-1 fix — same index resolves both issues
4. **[SHOULD] H-2:** Fix accountId intersection for member role — functional bug visible to members
5. **[SHOULD] H-3:** Validate date params — prevents 500 errors on malformed input
6. **[SHOULD] H-4:** Clamp pagination params — prevents abuse
7. **[COULD] M-1:** Fix category null/undefined in PUT — data loss on partial updates
8. **[COULD] M-2:** Add contact_card to SpecialMessageRenderer
9. **[COULD] M-3:** Align frontend/backend template variables

---

## Ship Recommendation

**NO-SHIP** until C-1 and C-2 are resolved.

- C-1 (dedup race) will cause duplicate messages in production under normal concurrent load
- C-2 (N+1 sync) will cause measurable DB load that grows with each connected account

After those fixes: **SHIP** with H-2 through H-4 as fast-follow fixes in the next sprint.

---

## Metrics

| Metric | Value |
|--------|-------|
| Files changed | 15 (12 modified, 3 new) |
| LOC added | ~900 |
| New DB indexes | 3 (2 composite on Conversation, 1 on MessageTemplate) |
| Missing indexes | 1 critical (messages.zaloMsgId) |
| Schema changes | 1 new column (ownerUserId), 1 new relation |
| Critical issues | 2 |
| High issues | 5 |
| Medium issues | 6 |
| Low issues | 5 |

---

## Unresolved Questions

1. Is there a Prisma migration generated for the schema changes (new column, new indexes)? No migration file was included in the diff. This needs `prisma migrate dev` before deployment.
2. Should admins be able to edit other users' personal templates? Current code allows it. Needs product decision.
3. What's the expected volume of connected Zalo accounts per org? This affects whether the sync polling interval (5 min) is aggressive enough or too aggressive.

**Status:** DONE  
**Summary:** Comprehensive review of Phase 1 with 2 critical (dedup race, N+1 sync), 5 high, 6 medium findings. No-ship until C-1 and C-2 resolved.  
**Concerns:** Dedup race condition will produce duplicates in production; polling sync N+1 queries will stress DB under multi-account load.
