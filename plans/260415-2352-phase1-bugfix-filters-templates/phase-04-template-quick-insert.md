# Phase 04 — FEATURE-07: Template Quick-Insert

**Priority:** High
**Status:** Pending
**Depends on:** Phase 05 (vite fix)

---

## Context

- [Eng Review](../reports/eng-review-260415-2303-phase1-feature-requests.md)
- Existing: `MessageTemplate` model, `template-renderer.ts` (5 vars), `TemplateManager.vue`
- Decision: add `ownerUserId` nullable column for personal vs team templates

## Overview

Mở rộng hệ thống tin nhắn mẫu: thêm biến mới, quick-insert bằng `/` trong chat, phân biệt template cá nhân vs team, preview trước khi gửi.

## Key Insights

1. `template-renderer.ts` đã có 5 biến: `contact.fullName`, `contact.phone`, `contact.email`, `account.displayName`, `org.name`
2. `TemplateManager.vue` có CRUD UI nhưng chưa có quick-insert trong chat
3. zca-js có `getQuickMessageList()` và `addQuickMessage()` — Zalo's built-in quick messages
4. Template syntax hiện tại: `{{ variable }}` (ngoặc kép) — giữ format này
5. Decision: thêm `ownerUserId` nullable vào `MessageTemplate` (null = team, có giá trị = cá nhân)

## Requirements

### Functional
- Quick-insert: gõ `/` trong chat input hiện danh sách template
- Filter templates khi gõ tiếp: `/xin chào` lọc templates chứa "xin chào"
- Preview template trước khi gửi (với biến đã render)
- Phân biệt template cá nhân (chỉ mình thấy) và team (ai cũng thấy)
- Mở rộng biến: thêm `contact.zaloName`, `date.today`, `date.now`
- Keyboard navigation: up/down để chọn, Enter để insert

### Non-functional
- Popup hiện trong < 100ms
- Không chặn typing flow
- Mobile-friendly

## Architecture

```
Chat Input
    │
    ├─ User gõ "/"
    │   └─► QuickTemplatePopup hiện
    │       ├─ Danh sách template (personal + team)
    │       ├─ Filter khi gõ tiếp
    │       └─ Preview panel (rendered)
    │
    ├─ User chọn template
    │   └─► template-renderer fills variables
    │       └─► Insert vào chat input
    │
    └─ User gõ Enter → send
```

## Related Code Files

### Modify
- `backend/prisma/schema.prisma` — add `ownerUserId` to MessageTemplate
- `backend/src/modules/automation/template-renderer.ts` — extend variable map
- `backend/src/modules/automation/template-routes.ts` — filter by owner, add search
- `frontend/src/components/chat/MessageThread.vue` — add `/` trigger + popup mount

### Create
- `frontend/src/components/chat/quick-template-popup.vue` — popup component

## Implementation Steps

### Step 1: Schema change (schema.prisma)

```prisma
model MessageTemplate {
  // existing fields...
  ownerUserId String?    // null = team template, value = personal
  owner       User?      @relation(fields: [ownerUserId], references: [id])

  @@index([orgId, ownerUserId])
  @@index([orgId, category])
}
```

Run migration: `npx prisma migrate dev --name add-template-owner`

### Step 2: Extend template variables (template-renderer.ts)

```typescript
const variableMap: Record<string, (ctx: RenderContext) => string> = {
  // Existing
  'contact.fullName': (ctx) => ctx.contact?.fullName || '',
  'contact.phone': (ctx) => ctx.contact?.phone || '',
  'contact.email': (ctx) => ctx.contact?.email || '',
  'account.displayName': (ctx) => ctx.account?.displayName || '',
  'org.name': (ctx) => ctx.org?.name || '',

  // NEW
  'contact.zaloName': (ctx) => ctx.contact?.zaloName || ctx.contact?.fullName || '',
  'contact.tags': (ctx) => (ctx.contact?.tags as string[] || []).join(', '),
  'date.today': () => new Intl.DateTimeFormat('vi-VN').format(new Date()),
  'date.now': () => new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit',
  }).format(new Date()),
};

// Export available variables for UI documentation
export const AVAILABLE_VARIABLES = Object.keys(variableMap);
```

### Step 3: Update template routes (template-routes.ts)

Add owner filtering + search:

```typescript
// GET /templates — list templates for current user
fastify.get('/templates', async (request, reply) => {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { search, category } = request.query as Record<string, string>;

  const where: any = {
    orgId,
    OR: [
      { ownerUserId: null },      // team templates
      { ownerUserId: userId },    // my personal templates
    ],
  };

  if (search) {
    where.AND = {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ],
    };
  }
  if (category) where.category = category;

  const templates = await prisma.messageTemplate.findMany({
    where,
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, content: true,
      category: true, ownerUserId: true,
    },
  });

  return templates.map(t => ({
    ...t,
    isPersonal: t.ownerUserId !== null,
  }));
});

// GET /templates/variables — list available variables for UI
fastify.get('/templates/variables', async () => {
  return { variables: AVAILABLE_VARIABLES };
});
```

### Step 4: Create QuickTemplatePopup (frontend)

```vue
<template>
  <v-menu
    v-model="visible"
    :activator="activatorEl"
    location="top start"
    :close-on-content-click="false"
    max-height="300"
    max-width="400"
  >
    <v-list density="compact" nav>
      <v-list-subheader>Tin nhắn mẫu</v-list-subheader>

      <v-list-item
        v-for="(tpl, i) in filtered"
        :key="tpl.id"
        :active="i === selectedIndex"
        @click="selectTemplate(tpl)"
      >
        <template #prepend>
          <v-icon
            :icon="tpl.isPersonal ? 'mdi-account' : 'mdi-account-group'"
            size="small"
            :color="tpl.isPersonal ? 'primary' : 'grey'"
          />
        </template>
        <v-list-item-title>{{ tpl.name }}</v-list-item-title>
        <v-list-item-subtitle class="text-truncate">
          {{ tpl.content }}
        </v-list-item-subtitle>
      </v-list-item>

      <v-list-item v-if="!filtered.length" disabled>
        <v-list-item-title class="text-grey">Không tìm thấy</v-list-item-title>
      </v-list-item>
    </v-list>

    <!-- Preview panel -->
    <v-divider v-if="previewTemplate" />
    <div v-if="previewTemplate" class="pa-3 bg-grey-lighten-4">
      <div class="text-caption text-grey mb-1">Preview:</div>
      <div class="text-body-2">{{ renderedPreview }}</div>
    </div>
  </v-menu>
</template>

<script setup lang="ts">
// Props: templates list, contact context, activatorEl
// Emits: select(renderedContent)
// Logic: filter by query, keyboard nav, render preview
</script>
```

### Step 5: Wire popup to chat input (MessageThread.vue)

```typescript
// In chat input handler:
const onInput = (e: Event) => {
  const value = (e.target as HTMLTextAreaElement).value;

  // Detect "/" at start of input or after space
  if (value === '/' || value.endsWith(' /')) {
    showTemplatePopup.value = true;
    templateQuery.value = '';
  } else if (showTemplatePopup.value) {
    // Extract query after last "/"
    const lastSlash = value.lastIndexOf('/');
    templateQuery.value = value.slice(lastSlash + 1);
  }
};

// On template selected:
const onTemplateSelect = (rendered: string) => {
  // Replace from last "/" to end with rendered content
  const input = messageInput.value;
  const lastSlash = input.lastIndexOf('/');
  messageInput.value = input.slice(0, lastSlash) + rendered;
  showTemplatePopup.value = false;
};
```

## Todo List

- [ ] Add `ownerUserId` to MessageTemplate schema + migration
- [ ] Extend `template-renderer.ts` with new variables
- [ ] Export `AVAILABLE_VARIABLES` for UI docs
- [ ] Update GET /templates route with owner filter + search
- [ ] Add GET /templates/variables endpoint
- [ ] Create `quick-template-popup.vue` component
- [ ] Add `/` trigger detection in chat input
- [ ] Add keyboard navigation (up/down/Enter/Escape)
- [ ] Add preview panel with rendered variables
- [ ] Update `TemplateManager.vue` with personal/team toggle
- [ ] Test: personal template only visible to owner
- [ ] Test: team template visible to all org members

## Success Criteria

- Gõ `/` hiện popup danh sách template trong < 100ms
- Filter templates khi gõ tiếp sau `/`
- Preview hiện nội dung đã render với biến thực tế
- Enter insert rendered content vào chat input
- Template cá nhân chỉ hiện cho owner
- Template team hiện cho tất cả trong org
- Biến mới (zaloName, date) render đúng

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `/` conflicts with normal typing | Low | Only trigger at start or after space |
| Template variable render fails | Low | Fallback to empty string, existing behavior |
| Large template list slow to filter | Low | Client-side filter, max 100 templates per org |
