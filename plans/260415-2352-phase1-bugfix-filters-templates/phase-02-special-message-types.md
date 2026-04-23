# Phase 02 — BUG-02: Special Message Types

**Priority:** Medium
**Status:** Pending
**Depends on:** Phase 05 (vite fix)

---

## Context

- [zca-js API Research](../reports/researcher-260415-2352-zca-js-api.md)
- zca-js Enum.ts: `BinBankCard` enum with 50+ Vietnamese banks
- zca-js APIs: `sendBankCard.ts`, `sendCard.ts`, `sendVideo.ts`, `sendVoice.ts`

## Overview

Tin nhắn đặc biệt (QR code, chuyển khoản, cuộc gọi nhỡ, tin hệ thống) hiển thị sai font hoặc raw JSON. Cần mở rộng `detectContentType()` và thêm frontend renderer.

## Key Insights

1. zca-js `sendBankCard` API exists → msgType cho bank transfer có thể là `"bank_card"` hoặc tương tự
2. `TMessage.cmd` field có thể indicate message subtype (system, notification)
3. `TMessage.propertyExt` có `type`, `subType` — additional type info
4. `group_event` listener event handles group join/leave/kick etc.
5. `friend_event` handles friend request/accept/block
6. Zalo's `msginfo.actionlist` format for calendar/reminder messages already partially handled

## Requirements

### Functional
- QR code messages render as image with scan-able preview
- Bank transfer messages show bank name, amount, description
- Missed call/video call messages show icon + duration
- System messages (group join/leave, friend events) show styled notification
- Unknown types show graceful fallback (not raw JSON)

### Non-functional
- No new API calls required for rendering
- Frontend components must be lightweight (no heavy JS libs)

## Related Code Files

### Modify
- `backend/src/modules/zalo/zalo-message-helpers.ts` — extend `detectContentType()`
- `backend/src/modules/zalo/zalo-listener-factory.ts` — add logging for unknown msgTypes
- `frontend/src/components/chat/ConversationList.vue` — extend `lastMessagePreview()`
- `frontend/src/components/chat/MessageThread.vue` — add special message rendering

### Create
- `frontend/src/components/chat/special-message-renderer.vue` — renders non-text messages

## Implementation Steps

### Step 1: Add msgType logging (zalo-message-helpers.ts)

Before fixing, we need data on unknown types. Add logging for types that fall through to 'rich' or 'text':

```typescript
import { logger } from '../../shared/utils/logger.js';

const KNOWN_PATTERNS = [
  'photo', 'image', 'sticker', 'video', 'voice',
  'gif', 'link', 'location', 'file', 'doc',
  'recommended', 'card',
];

export function detectContentType(msgType: string | undefined, content: any): string {
  if (!msgType) return 'text';

  // Existing checks...

  // Log unknown types for analysis
  if (!KNOWN_PATTERNS.some(p => msgType.includes(p))) {
    logger.info(`[zalo:msgType] Unknown: "${msgType}"`, {
      contentType: typeof content,
      contentKeys: typeof content === 'object' ? Object.keys(content || {}) : [],
      contentPreview: typeof content === 'string' ? content.slice(0, 100) : undefined,
    });
  }

  if (typeof content === 'object' && content !== null) return 'rich';
  return 'text';
}
```

### Step 2: Extend detectContentType with known special types

Based on zca-js source analysis:

```typescript
// Add before the 'rich' fallback:
if (msgType.includes('bank') || msgType.includes('transfer')) return 'bank_transfer';
if (msgType.includes('call') || msgType.includes('voip')) return 'call';
if (msgType.includes('qr')) return 'qr_code';
if (msgType.includes('remind') || msgType.includes('todo')) return 'reminder';
if (msgType.includes('poll') || msgType.includes('vote')) return 'poll';
if (msgType.includes('note')) return 'note';
if (msgType.includes('forward')) return 'forwarded';
```

Also parse `content` JSON for action-based messages:

```typescript
// Before rich fallback, check JSON content patterns:
if (typeof content === 'object' && content !== null) {
  if (content.action === 'msginfo.actionlist') return 'reminder';
  if (content.bankCode || content.bankName) return 'bank_transfer';
  if (content.callDuration !== undefined || content.callType) return 'call';
  return 'rich';
}
```

### Step 3: Extend lastMessagePreview (ConversationList.vue)

```typescript
case 'bank_transfer': return prefix + '🏦 Chuyển khoản';
case 'call': return prefix + '📞 Cuộc gọi';
case 'qr_code': return prefix + '📱 Mã QR';
case 'reminder': return prefix + '📅 Nhắc hẹn';
case 'poll': return prefix + '📊 Bình chọn';
case 'note': return prefix + '📝 Ghi chú';
case 'forwarded': return prefix + '↩️ Chuyển tiếp';
case 'rich': return prefix + '📋 Tin nhắn đặc biệt';
```

### Step 4: Create SpecialMessageRenderer (frontend)

Vue component that handles non-text message types in the chat thread:

```vue
<template>
  <div class="special-message">
    <!-- Bank Transfer -->
    <v-card v-if="type === 'bank_transfer'" variant="tonal" color="success" class="pa-3">
      <div class="d-flex align-center">
        <v-icon icon="mdi-bank-transfer" class="mr-2" />
        <div>
          <div class="font-weight-bold">{{ bankName }}</div>
          <div v-if="amount" class="text-h6">{{ formatAmount(amount) }}</div>
          <div v-if="description" class="text-caption">{{ description }}</div>
        </div>
      </div>
    </v-card>

    <!-- Call -->
    <v-chip v-else-if="type === 'call'" variant="tonal" :color="callColor">
      <v-icon :icon="callIcon" class="mr-1" />
      {{ callLabel }}
    </v-chip>

    <!-- QR Code -->
    <v-card v-else-if="type === 'qr_code'" variant="outlined" class="pa-2">
      <v-icon icon="mdi-qrcode" size="48" />
      <div class="text-caption mt-1">Mã QR</div>
    </v-card>

    <!-- Reminder/Calendar -->
    <v-card v-else-if="type === 'reminder'" variant="tonal" color="warning" class="pa-3">
      <v-icon icon="mdi-calendar-clock" class="mr-1" />
      {{ title || 'Nhắc hẹn' }}
    </v-card>

    <!-- Poll -->
    <v-card v-else-if="type === 'poll'" variant="tonal" color="info" class="pa-3">
      <v-icon icon="mdi-poll" class="mr-1" />
      {{ title || 'Bình chọn' }}
    </v-card>

    <!-- Generic rich fallback -->
    <v-chip v-else variant="tonal" color="grey">
      <v-icon icon="mdi-message-text" class="mr-1" />
      Tin nhắn đặc biệt
    </v-chip>
  </div>
</template>
```

### Step 5: Add group_event and friend_event handlers (zalo-listener-factory.ts)

```typescript
listener.on('group_event', async (event: any) => {
  // System messages: member join, leave, kick, name change, etc.
  logger.info(`[zalo:${accountId}] Group event:`, event);
  // Store as system message in conversation
});

listener.on('friend_event', async (event: any) => {
  logger.info(`[zalo:${accountId}] Friend event:`, event);
  // Update contact status
});
```

## Todo List

- [ ] Add msgType logging for unknown types (Step 1)
- [ ] Extend `detectContentType` with bank_transfer, call, qr_code, reminder, poll (Step 2)
- [ ] Extend `lastMessagePreview` in ConversationList.vue (Step 3)
- [ ] Create `special-message-renderer.vue` component (Step 4)
- [ ] Integrate SpecialMessageRenderer into MessageThread.vue
- [ ] Add group_event and friend_event handlers (Step 5)
- [ ] Deploy and collect msgType logs for 1 week to discover more types
- [ ] Iterate: add handlers for newly discovered types

## Success Criteria

- Bank transfer messages show bank name + amount (not raw JSON)
- Call messages show icon + label (not empty text)
- Unknown types show "Tin nhắn đặc biệt" (not blank or garbled)
- No console errors for any message type
- msgType logging active for continuous discovery

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Unknown msgType values not in our list | Low | Logging + graceful fallback |
| Bank transfer content structure varies | Medium | Parse defensively, show fallback |
| Group events flood during large group changes | Low | Batch processing, no UI notification spam |
