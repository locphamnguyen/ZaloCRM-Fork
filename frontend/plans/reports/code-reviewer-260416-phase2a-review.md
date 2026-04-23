# Code Review: Phase 2a — CRM Name + Tab "Khac"

**Reviewer:** code-reviewer  
**Date:** 2026-04-16  
**Scope:** FEATURE-06 (Two-layer naming) + FEATURE-03 (Tab "Khac" / Other tab)

---

## Scope

- **Files reviewed:** 15 files (backend + frontend)
- **Features:** crmName field on Contact, conversation tab switching (main/other)
- **Focus:** Security, type safety, logic correctness, missing migrations, edge cases

## Overall Assessment

Implementation is functional and well-structured. Both features are cleanly integrated across the stack. However, there are several production-readiness issues: a missing DB migration, a security bypass on the tab-move endpoint, a filter/authz race condition affecting members, and counts not scoped to the active tab.

---

## Critical Issues

### CRIT-1: Missing database migration for `crmName` and `tab` columns

**File:** `backend/prisma/schema.prisma` (lines 121, 162)

The schema adds two new fields (`crm_name` on contacts, `tab` on conversations) but no migration file exists. The last migration is `20260329120357_add_contact_intelligence`. Deploying this to production without a migration will crash the app with column-not-found errors.

**Fix:** Run `cd backend && npx prisma migrate dev --name add-crm-name-and-conversation-tab` before merging.

---

### CRIT-2: PATCH /conversations/:id/tab lacks Zalo access authorization for members

**File:** `backend/src/modules/chat/chat-routes.ts` (lines 254-270)

The `PATCH /conversations/:id/tab` endpoint only uses `authMiddleware` (JWT) but does NOT use `requireZaloAccess`. A member user can move ANY conversation in the org between tabs, even conversations belonging to Zalo accounts they don't have access to. The `updateMany` with `orgId` prevents cross-org abuse but not cross-account abuse within an org.

Compare with:
- `GET /conversations/:id/messages` uses `requireZaloAccess('read')`
- `POST /conversations/:id/messages` uses `requireZaloAccess('chat')`

**Impact:** Authorization bypass. A member can manipulate conversations they shouldn't access.

**Fix:** Add `{ preHandler: requireZaloAccess('chat') }` to the PATCH route, or at minimum `requireZaloAccess('read')`.

---

### CRIT-3: Member `accountId` filter overwritten by access check — counts AND conversations list

**File:** `backend/src/modules/chat/chat-routes.ts` (lines 27-36, 105-110)

In both the `/conversations/counts` and `GET /conversations` endpoints, when a member user provides an `accountId` filter, it gets set first:
```js
if (accountId) baseWhere.zaloAccountId = accountId;
```
Then immediately overwritten by the member access check:
```js
baseWhere.zaloAccountId = { in: accessibleAccounts.map(...) };
```

This means:
1. The `accountId` filter is silently ignored for members.
2. A member could potentially pass an `accountId` they don't have access to and it would be correctly overwritten (good for security), but the accountId-specific filtering intent is lost.

**Fix:** Intersect the user's `accountId` filter with their accessible accounts:
```ts
const accessible = accessibleAccounts.map(a => a.zaloAccountId);
if (accountId) {
  baseWhere.zaloAccountId = accessible.includes(accountId) ? accountId : '__none__';
} else {
  baseWhere.zaloAccountId = { in: accessible };
}
```

---

## High Priority

### HIGH-1: Counts not scoped to active tab

**File:** `frontend/src/components/chat/ConversationList.vue` (lines 365-376)

`fetchCounts()` does NOT include the `tab` parameter. The backend counts endpoint supports `tab` filtering (line 28 of chat-routes.ts: `if (tab) baseWhere.tab = tab`), but the frontend never sends it. This means the unread/unreplied badge counts show totals across both tabs, which is misleading — the user sees "5 unread" but only 2 are in the current tab.

Additionally, `fetchCounts()` is NOT called when the tab changes. The `watch(activeTab, ...)` handler only emits events, it doesn't refresh counts.

**Fix:** Include `tab: activeTab.value` in the `fetchCounts` params and add `fetchCounts()` to the `watch(activeTab, ...)` handler.

---

### HIGH-2: `crmName` missing from automation context in contact_created and status_changed triggers

**File:** `backend/src/modules/contacts/contact-routes.ts` (lines 177-183, 245-251)

Both `runAutomationRules` calls in the contact create and update routes omit `crmName` from the context:
```ts
contact: {
  id: contact.id,
  fullName: contact.fullName,
  phone: contact.phone,
  status: contact.status,
  source: contact.source,
  assignedUserId: contact.assignedUserId,
  // crmName is MISSING
}
```

While `crmName` is optional in `AutomationContext`, templates can reference `{{contact.crmName}}` which will always resolve to fallback `fullName` since `crmName` is never passed for these triggers.

**Fix:** Add `crmName: contact.crmName` to both automation context objects.

---

### HIGH-3: Pipeline endpoint missing `crmName` in select

**File:** `backend/src/modules/contacts/contact-routes.ts` (lines 90-98)

The pipeline/kanban query uses explicit `select` but does not include `crmName`. If the frontend kanban view is later updated to show CRM names, this will silently return null.

**Fix:** Add `crmName: true` to the pipeline select clause.

---

### HIGH-4: Missing composite index on `(orgId, zaloAccountId, tab, lastMessageAt)`

**File:** `backend/prisma/schema.prisma` (lines 172-174)

The `tab` column is used as a filter on every `GET /conversations` call (default `tab = 'main'`), but there is no index that includes `tab`. The existing indexes are:
- `@@index([orgId, zaloAccountId, isReplied, lastMessageAt])`
- `@@index([orgId, zaloAccountId, lastMessageAt])`

Every conversation list query now filters by `tab`, so the DB will scan all rows matching `(orgId, zaloAccountId)` then filter `tab` in-memory. For orgs with thousands of conversations, this degrades performance.

**Fix:** Add `@@index([orgId, zaloAccountId, tab, lastMessageAt])` or at minimum `@@index([orgId, tab])`.

---

## Medium Priority

### MED-1: Context menu v-menu positioning will not work correctly with Vuetify

**File:** `frontend/src/components/chat/ConversationList.vue` (line 228)

```html
<v-menu v-model="contextMenu.show" :style="{ position: 'fixed', left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
```

Vuetify's `v-menu` requires an `activator` to position itself. Setting `:style` on the `v-menu` component does not control the internal overlay positioning. The menu will likely appear at the wrong position or not appear at all. This is because `v-menu` uses Vuetify's internal positioning system (attached to activator or coordinates), not CSS on the component root.

**Fix:** Use `v-menu`'s built-in coordinate positioning:
```html
<v-menu
  v-model="contextMenu.show"
  :target="[contextMenu.x, contextMenu.y]"
  location="bottom start"
>
```
Or use a plain positioned `v-card` instead of `v-menu`.

---

### MED-2: No input validation or sanitization on `crmName` backend

**File:** `backend/src/modules/contacts/contact-routes.ts` (lines 153, 209)

`body.crmName` is passed directly to Prisma without any validation. While Prisma handles SQL injection via parameterized queries, there's no length check, no trim, and no XSS sanitization. A user could store a 10MB string or HTML/script tags that could cause issues when rendered in template outputs (via `renderMessageTemplate`).

**Fix:** Add basic validation:
```ts
crmName: typeof body.crmName === 'string' ? body.crmName.trim().slice(0, 255) : undefined,
```

---

### MED-3: `tab` default `'main'` in conversations list creates backward-incompatibility for API consumers

**File:** `backend/src/modules/chat/chat-routes.ts` (line 62)

```ts
tab = 'main',  // Default is 'main', not empty
```

Before this change, `GET /conversations` with no `tab` param returned all conversations. Now it only returns `main` tab conversations. Any existing API consumers (webhooks, integrations, mobile views) that don't pass `tab` will suddenly see a subset of conversations. The mobile view (`MobileChatView.vue`) was not included in reviewed files — it may not send `tab`.

**Fix:** Either:
1. Default to empty string and only filter when explicitly provided: `tab = ''` then `if (tab) where.tab = tab;`
2. Or verify all API consumers are updated to pass `tab`.

---

### MED-4: `tab-changed` event emitted but never handled in ChatView

**File:** `frontend/src/views/ChatView.vue`

The `ConversationList` emits `tab-changed` (line 402), but `ChatView.vue` does not bind a handler for `@tab-changed`. The tab filtering still works because `onFiltersUpdate` is called separately via `update:filters`, but this is confusing — the event is defined and emitted but has no consumer, suggesting dead code or a missing handler.

---

### MED-5: Contact update allows setting `fullName` to null via empty string

**File:** `frontend/src/composables/use-chat-contact-panel.ts` (line 88)

```ts
fullName: form.fullName || null,
```

If the user clears the "Ten hien thi Zalo" field, this sends `fullName: null` to the backend, which Prisma stores as NULL. The `upsertContact` function in `message-handler.ts` (line 252) only updates the name when `contact.fullName === 'Unknown'`, so once set to NULL, incoming messages won't repopulate it either.

---

## Low Priority

### LOW-1: `Conversation` interface in frontend doesn't include `tab` field

**File:** `frontend/src/composables/use-chat.ts` (lines 34-43)

The `Conversation` interface doesn't have a `tab` property. While the frontend doesn't currently need it (filtering is server-side), if any future code tries to access `conv.tab`, TypeScript won't catch the issue.

---

### LOW-2: Redundant ternary in `findOrCreateConversation`

**File:** `backend/src/modules/chat/message-handler.ts` (line 283)

```ts
contactId: msg.threadType === 'user' ? contactId : contactId,
```

Both branches return the same value. Likely a copy-paste remnant.

---

### LOW-3: `formatDateShort` may fail on malformed date strings

**File:** `frontend/src/components/chat/ConversationList.vue` (lines 496-500)

```ts
const [year, month, day] = dateStr.split('-');
```

No validation that `dateStr` has the expected `YYYY-MM-DD` format. If `dateStr` is empty or malformed, this returns `undefined/undefined/undefined`.

---

## Positive Observations

1. **Clean schema design** — `tab` with default `"main"` and `crmName` as nullable are good choices. No breaking changes to existing data.
2. **Template fallback** — `contact.crmName` template variable falls back to `fullName` when not set (template-renderer.ts line 22). Sensible default.
3. **Tab validation** — Backend properly validates `tab` value is `"main"` or `"other"` before persisting (chat-routes.ts line 259).
4. **Org scoping** — All queries properly scope to `user.orgId`, preventing cross-org data access.
5. **Tab switcher UI** — Using `v-btn-toggle` with `mandatory` ensures always one tab is selected. Good UX.
6. **crmName search** — Added to both contacts list and conversations list search. Comprehensive.

---

## Recommended Actions (Priority Order)

1. **[CRIT]** Generate and apply Prisma migration for `crm_name` and `tab` columns
2. **[CRIT]** Add `requireZaloAccess('chat')` to PATCH `/conversations/:id/tab`
3. **[CRIT]** Fix member accountId filter intersection in counts and conversations list
4. **[HIGH]** Pass `tab` param in `fetchCounts()` and refresh counts on tab change
5. **[HIGH]** Add `crmName` to automation context in contact create/update routes
6. **[HIGH]** Add composite index including `tab` for conversation queries
7. **[MED]** Fix context menu positioning for Vuetify v-menu
8. **[MED]** Decide default `tab` behavior for backward compatibility

---

## Unresolved Questions

1. Does `MobileChatView.vue` need tab support? It was not in the reviewed file list.
2. Is the pipeline/kanban view expected to show `crmName`? If so, the select clause needs updating.
3. Should automation rules be able to condition on `contact.crmName` (e.g., `is_not_empty`)? Currently `getFieldValue` in automation-service.ts doesn't support it.
4. Is there a plan for backfilling existing conversations with `tab = 'main'`? The schema default handles new rows, but existing rows in a live DB may have NULL if the column is added without a migration DEFAULT.

---

**Status:** DONE_WITH_CONCERNS  
**Summary:** Phase 2a implementation is functionally complete but has 3 critical issues (missing migration, authz bypass on tab endpoint, member filter overwrite) and 4 high-priority issues that should be addressed before shipping.  
**Concerns:** Missing migration will cause production crash. Auth bypass on tab endpoint is a security hole for multi-user orgs.
