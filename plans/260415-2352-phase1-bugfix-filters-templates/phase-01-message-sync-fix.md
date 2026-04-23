# Phase 01 — BUG-01: Message Sync Fix

**Priority:** Critical
**Status:** Pending
**Depends on:** Phase 05 (vite fix — for frontend testing only)

---

## Context

- [zca-js API Research](../reports/researcher-260415-2352-zca-js-api.md)
- [Eng Review](../reports/eng-review-260415-2303-phase1-feature-requests.md)
- zca-js source: https://github.com/RFS-ADRENO/zca-js

## Overview

Tin nhắn gửi từ app Zalo gốc không hiện trong CRM. Root cause: `selfListen` option chưa bật, `old_messages` event chưa listen.

## Key Insights

1. **`selfListen` option** trong `new Zalo()` constructor controls self-sent message delivery
2. **`old_messages` event** trên listener gửi tin cũ khi reconnect — chưa listen
3. **`getGroupChatHistory(groupId, count)`** lấy được history group (50 msgs/call)
4. **Không có `getUserChatHistory`** cho 1:1 — cần custom API hoặc polling backup
5. **`isSelf` determined by `data.uidFrom == "0"`** — Zalo sets uidFrom to "0" for self messages
6. **`message.isSelf`** already handled in listener code but may not fire for native app sends without selfListen

## Requirements

### Functional
- Tin nhắn gửi từ Zalo app gốc phải hiện trong CRM conversation
- Tin nhắn cũ (khi listener bị disconnect) phải được backfill khi reconnect
- Group chat history phải sync khi mở conversation
- Không tạo tin nhắn trùng (dedup by `zaloMsgId`)

### Non-functional
- Không tăng đáng kể CPU/memory usage
- Không vi phạm rate limits (200/day, 5/30s)
- Listener uptime không bị ảnh hưởng

## Architecture

```
┌─────────────────────────────────┐
│  Zalo App (native)              │
│  User gửi tin nhắn              │
└───────────┬─────────────────────┘
            │
            ▼
┌─────────────────────────────────┐
│  zca-js listener                │
│  selfListen: true  ← NEW       │
│                                 │
│  Events:                        │
│  ├─ message (isSelf=true)       │
│  ├─ old_messages  ← NEW        │
│  └─ group_event                 │
└───────────┬─────────────────────┘
            │
            ▼
┌─────────────────────────────────┐
│  message-handler.ts             │
│  handleIncomingMessage()        │
│  ├─ dedup by zaloMsgId          │
│  ├─ upsertContact (skip self)   │
│  └─ create Message record       │
└───────────┬─────────────────────┘
            │
            ▼
┌─────────────────────────────────┐
│  NEW: zalo-message-sync.ts      │
│  Polling backup (every 5 min)   │
│  ├─ getGroupChatHistory()       │
│  ├─ Compare with DB             │
│  └─ Insert missing messages     │
└─────────────────────────────────┘
```

## Related Code Files

### Modify
- `backend/src/modules/zalo/zalo-pool.ts` — add selfListen option to Zalo constructor
- `backend/src/modules/zalo/zalo-listener-factory.ts` — add `old_messages` handler
- `backend/src/modules/chat/message-handler.ts` — add dedup guard on zaloMsgId

### Create
- `backend/src/modules/zalo/zalo-message-sync.ts` — polling backup service

## Implementation Steps

### Step 1: Enable selfListen (zalo-pool.ts)

Change both `loginQR()` and `reconnect()`:

```typescript
// BEFORE:
const zalo = new Zalo({ logging: false });

// AFTER:
const zalo = new Zalo({ logging: false, selfListen: true });
```

Also update `listener.start()` call if selfListen needs to be passed there.

### Step 2: Add old_messages handler (zalo-listener-factory.ts)

```typescript
listener.on('old_messages', async (messages: any[], type: number) => {
  const threadType = type === 1 ? 'group' : 'user';
  logger.info(`[zalo:${accountId}] Received ${messages.length} old ${threadType} messages`);

  for (const message of messages) {
    try {
      await handleIncomingMessage({
        accountId,
        senderUid: String(message.data?.uidFrom || ''),
        senderName: message.data?.dName || '',
        content: message.data?.content,
        msgType: message.data?.msgType,
        isSelf: message.isSelf || false,
        threadId: message.threadId || '',
        threadType,
        zaloMsgId: message.data?.msgId || message.data?.cliMsgId || '',
        timestamp: message.data?.ts ? new Date(Number(message.data.ts)) : new Date(),
        isBackfill: true, // flag to skip automation triggers
      });
    } catch (err) {
      logger.warn(`[zalo:${accountId}] old_messages processing error:`, err);
    }
  }
});
```

### Step 3: Add dedup guard (message-handler.ts)

Before creating a Message record, check if `zaloMsgId` already exists:

```typescript
// In handleIncomingMessage(), before prisma.message.create():
if (zaloMsgId) {
  const existing = await prisma.message.findFirst({
    where: { conversationId, zaloMsgId },
  });
  if (existing) {
    logger.debug(`[msg] Skipping duplicate zaloMsgId=${zaloMsgId}`);
    return { message: existing, conversationId };
  }
}
```

### Step 4: Create polling backup (zalo-message-sync.ts)

Runs every 5 minutes per connected account. For groups only (since `getGroupChatHistory` is the only history API).

```typescript
export async function syncGroupMessages(api: any, accountId: string): Promise<number> {
  // Get active group conversations from DB
  const groupConvs = await prisma.conversation.findMany({
    where: { zaloAccountId: accountId, threadType: 'group' },
    select: { id: true, externalThreadId: true },
    take: 20, // limit to 20 most recent groups
    orderBy: { lastMessageAt: 'desc' },
  });

  let synced = 0;
  for (const conv of groupConvs) {
    try {
      const history = await api.getGroupChatHistory(conv.externalThreadId, 50);
      for (const msg of history.groupMsgs || []) {
        // Check if exists in DB
        const zaloMsgId = msg.data?.msgId || msg.data?.cliMsgId;
        if (!zaloMsgId) continue;
        const exists = await prisma.message.findFirst({
          where: { conversationId: conv.id, zaloMsgId },
        });
        if (!exists) {
          await handleIncomingMessage({ ... msg, isBackfill: true });
          synced++;
        }
      }
    } catch (err) {
      logger.warn(`[sync:${accountId}] Group ${conv.externalThreadId} failed:`, err);
    }
  }
  return synced;
}
```

### Step 5: Wire up sync in zalo-pool.ts

Start sync interval when account connects:

```typescript
// In attachListener(), after listener setup:
const syncInterval = setInterval(async () => {
  const inst = this.instances.get(accountId);
  if (inst?.status !== 'connected' || !inst.api) return;
  try {
    const count = await syncGroupMessages(inst.api, accountId);
    if (count > 0) logger.info(`[sync:${accountId}] Backfilled ${count} messages`);
  } catch (err) {
    logger.warn(`[sync:${accountId}] Sync error:`, err);
  }
}, 5 * 60_000); // every 5 minutes

// Clear interval on disconnect
// In onDisconnected callback:
clearInterval(syncInterval);
```

## Todo List

- [ ] Enable `selfListen: true` in Zalo constructor (zalo-pool.ts)
- [ ] Add `old_messages` event handler (zalo-listener-factory.ts)
- [ ] Add `isBackfill` flag to `handleIncomingMessage` to skip automation triggers
- [ ] Add dedup guard by zaloMsgId (message-handler.ts)
- [ ] Create `zalo-message-sync.ts` polling backup service
- [ ] Wire sync interval into zalo-pool.ts connect/disconnect lifecycle
- [ ] Add rate-limit/backoff for getGroupChatHistory calls
- [ ] Test with real Zalo account: send from native app, verify appears in CRM
- [ ] Test reconnect scenario: disconnect listener, send messages, reconnect, verify backfill

## Success Criteria

- Tin nhắn gửi từ Zalo app gốc xuất hiện trong CRM trong vòng 5 giây (via selfListen)
- Tin nhắn bị miss khi disconnect được backfill khi reconnect (via old_messages)
- Group history được sync mỗi 5 phút (via polling backup)
- Không có tin nhắn trùng lặp trong DB
- Automation rules không trigger cho backfilled messages

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| selfListen breaks existing listener behavior | Medium | Test thoroughly before deploy |
| old_messages delivers too many msgs → DB overload | Low | Dedup guard + batch insert |
| getGroupChatHistory rate limited by Zalo | Medium | Rate limit to 1 call/group/5min |
| Zalo blocks account for too many API calls | High | Conservative polling interval, circuit breaker |

## Security Considerations

- No new auth/permission surface
- Rate limiter already in place for sends (200/day, 5/30s)
- Read-heavy operations (getGroupChatHistory) may have undocumented limits — start conservative
