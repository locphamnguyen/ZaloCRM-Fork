# Phase 03 — FEATURE-02: Conversation Filters

**Priority:** High
**Status:** Pending
**Depends on:** Phase 05 (vite fix)

---

## Context

- [Eng Review](../reports/eng-review-260415-2303-phase1-feature-requests.md)
- Conversation model already has `isReplied`, `unreadCount`, `lastMessageAt`
- Contact model has `tags` JSON field

## Overview

Thêm bộ lọc nâng cao cho danh sách hội thoại: Chưa đọc, Chưa trả lời, theo thời gian, theo tags. Infra sẵn ~80%.

## Key Insights

1. `Conversation.isReplied` boolean — set `false` when last msg is from contact, `true` when agent replies
2. `Conversation.unreadCount` integer — incremented on incoming, reset on seen
3. `Conversation.lastMessageAt` datetime — updated on every new message
4. `Contact.tags` JSON array — arbitrary string tags
5. Frontend `ConversationList.vue` only has account filter + search bar
6. Backend `chat-routes.ts` GET `/conversations` accepts `accountId` and `search` params

## Requirements

### Functional
- Filter: Chưa đọc (unreadCount > 0)
- Filter: Chưa trả lời (isReplied = false)
- Filter: Theo khoảng thời gian (lastMessageAt range)
- Filter: Theo tags (Contact.tags contains tag)
- Multiple filters combinable (AND logic)
- Filter counts shown as badges

### Non-functional
- Query under 100ms for 10k conversations
- No full-page reload when changing filters

## Architecture

```
Frontend                          Backend
┌──────────────────┐    GET /conversations?
│ Filter Bar       │    ├─ accountId=xxx
│ ├─ Chưa đọc     │───►├─ unread=true
│ ├─ Chưa trả lời │    ├─ unreplied=true
│ ├─ Thời gian     │    ├─ from=2026-04-01
│ └─ Tags          │    ├─ to=2026-04-15
└──────────────────┘    └─ tags=vip,hot
         │
         ▼
┌──────────────────┐
│ ConversationList │
│ (filtered)       │
└──────────────────┘
```

## Related Code Files

### Modify
- `backend/src/modules/chat/chat-routes.ts` — add filter query params to GET /conversations
- `backend/prisma/schema.prisma` — add composite index
- `frontend/src/components/chat/ConversationList.vue` — add filter UI bar

## Implementation Steps

### Step 1: Add composite index (schema.prisma)

```prisma
model Conversation {
  // existing fields...

  @@index([orgId, zaloAccountId, isReplied, lastMessageAt])
  @@index([orgId, zaloAccountId, lastMessageAt]) // for time-range queries
}
```

Run migration: `npx prisma migrate dev --name add-conversation-filter-indexes`

### Step 2: Extend GET /conversations backend (chat-routes.ts)

Add query params to existing route:

```typescript
// GET /conversations
const {
  accountId,
  search,
  // NEW filter params:
  unread,      // "true" → unreadCount > 0
  unreplied,   // "true" → isReplied = false
  from,        // ISO date string
  to,          // ISO date string
  tags,        // comma-separated tags
} = request.query as Record<string, string>;

const where: any = { orgId };

if (accountId) where.zaloAccountId = accountId;
if (search) {
  where.OR = [
    { contact: { fullName: { contains: search, mode: 'insensitive' } } },
    { contact: { phone: { contains: search } } },
    { groupName: { contains: search, mode: 'insensitive' } },
  ];
}

// New filters
if (unread === 'true') where.unreadCount = { gt: 0 };
if (unreplied === 'true') where.isReplied = false;
if (from || to) {
  where.lastMessageAt = {};
  if (from) where.lastMessageAt.gte = new Date(from);
  if (to) where.lastMessageAt.lte = new Date(to);
}
if (tags) {
  const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
  where.contact = {
    ...where.contact,
    tags: { array_contains: tagList },
  };
}
```

### Step 3: Add filter count endpoint (chat-routes.ts)

```typescript
// GET /conversations/counts — returns badge counts for each filter
fastify.get('/conversations/counts', async (request, reply) => {
  const orgId = getOrgId(request);

  const [unread, unreplied, total] = await Promise.all([
    prisma.conversation.count({ where: { orgId, unreadCount: { gt: 0 } } }),
    prisma.conversation.count({ where: { orgId, isReplied: false } }),
    prisma.conversation.count({ where: { orgId } }),
  ]);

  return { unread, unreplied, total };
});
```

### Step 4: Add filter UI (ConversationList.vue)

Add filter chips above conversation list:

```vue
<!-- Filter bar -->
<div class="filter-bar d-flex gap-2 pa-2">
  <v-chip
    :variant="filters.unread ? 'elevated' : 'outlined'"
    color="primary"
    size="small"
    @click="toggleFilter('unread')"
  >
    Chưa đọc
    <v-badge v-if="counts.unread" :content="counts.unread" color="error" inline />
  </v-chip>

  <v-chip
    :variant="filters.unreplied ? 'elevated' : 'outlined'"
    color="warning"
    size="small"
    @click="toggleFilter('unreplied')"
  >
    Chưa trả lời
    <v-badge v-if="counts.unreplied" :content="counts.unreplied" color="warning" inline />
  </v-chip>

  <v-menu v-model="showDatePicker">
    <template #activator="{ props }">
      <v-chip v-bind="props" :variant="hasDateFilter ? 'elevated' : 'outlined'" size="small">
        <v-icon icon="mdi-calendar" start />
        {{ dateLabel || 'Thời gian' }}
      </v-chip>
    </template>
    <!-- Date range picker -->
  </v-menu>

  <v-menu v-model="showTagFilter">
    <template #activator="{ props }">
      <v-chip v-bind="props" :variant="filters.tags.length ? 'elevated' : 'outlined'" size="small">
        <v-icon icon="mdi-tag" start />
        Tags
      </v-chip>
    </template>
    <!-- Tag checklist -->
  </v-menu>
</div>
```

### Step 5: Wire filters to API calls

```typescript
const filters = reactive({
  unread: false,
  unreplied: false,
  from: null as string | null,
  to: null as string | null,
  tags: [] as string[],
});

const buildFilterParams = () => {
  const params: Record<string, string> = {};
  if (filters.unread) params.unread = 'true';
  if (filters.unreplied) params.unreplied = 'true';
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.tags.length) params.tags = filters.tags.join(',');
  return params;
};

watch(filters, () => fetchConversations(), { deep: true });
```

## Todo List

- [ ] Add composite indexes to Conversation model (schema.prisma)
- [ ] Run Prisma migration
- [ ] Add filter query params to GET /conversations (chat-routes.ts)
- [ ] Add GET /conversations/counts endpoint (chat-routes.ts)
- [ ] Add filter bar UI with chips (ConversationList.vue)
- [ ] Wire filter state to API calls
- [ ] Add date range picker
- [ ] Add tag filter with checklist
- [ ] Test: filter combinations, empty states, performance

## Success Criteria

- "Chưa đọc" filter shows only conversations with unreadCount > 0
- "Chưa trả lời" filter shows conversations where last msg is from contact
- Date range filter works with Vietnamese date format
- Tag filter shows matching conversations
- Filters combine with AND logic
- Badge counts update in real-time via Socket.IO
- Query response < 100ms with 10k conversations

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| tags JSON query slow on PostgreSQL | Medium | Use GIN index on tags if needed |
| Filter counts query N+1 | Low | Single Promise.all query |
| Date picker UX confusion | Low | Use Vietnamese locale, clear labels |
