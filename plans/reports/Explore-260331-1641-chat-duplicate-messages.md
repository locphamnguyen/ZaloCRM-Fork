# Chat Message Duplication Flow Analysis

**Date:** 2026-03-31  
**Analysis:** Message sending flow & socket event handling duplication risks

---

## Executive Summary

Found **3 potential duplicate message scenarios**:

1. **Same-session API + socket duplication** (HIGH RISK)
2. **Offline queue + socket re-emission** (MEDIUM RISK)
3. **Message list rendering** (LOW RISK — deduplication exists)

---

## 1. PRIMARY FLOW: Same-Session Duplication (API + Socket)

### The Problem Flow

```
User sends message:
  ↓
ChatView.vue → sendMessage()
  ↓
use-chat.ts → sendMessage() → sendMessageTo(conversationId, content)
  ↓
API.post('/conversations/:id/messages', { content })
  ↓
Backend chat-routes.ts receives request:
  - Creates message in DB
  - Emits via io.emit('chat:message', { message, conversationId })
  - Returns message in response
  ↓
Frontend receives response:
  - Line 229: messages.value.push(res.data)  ← FIRST PUSH
  ↓
Socket listener (same-session):
  - initSocket() line 242-249
  - On 'chat:message' event:
    - Line 244: if (!messages.value.find(m => m.id === data.message.id))
    - Line 245: messages.value.push(data.message)  ← SECOND PUSH?
```

### Deduplication Analysis

**Good news:** Line 244 in `use-chat.ts` has deduplication logic:
```typescript
if (!messages.value.find(m => m.id === data.message.id)) {
  messages.value.push(data.message);
}
```

**However, there's a timing issue:**
- Backend creates message at T0, returns it in response
- Frontend pushes from response at T0 (synchronous)
- Socket event arrives at T0+δ (network latency)
- By time socket fires, message is already in array
- Deduplication check finds it → **prevents duplication** ✓

**BUT:** If socket emits BEFORE API response arrives (timing race):
- Socket push at T0+1ms
- API response at T0+50ms
- Then both would be different operations, but...

**Socket emission timing:**
Backend line 160 (`chat-routes.ts`):
```typescript
io?.emit('chat:message', { accountId: conversation.zaloAccountId, message, conversationId: id });
```
This is **synchronous** right after DB save. Response is sent immediately after this emit.
So API response and socket event leave backend nearly simultaneously. 

**Frontend receives:** Both in quick succession, deduplication saves us.

### Verdict: SAFE (for now)
The `msg.id` deduplication check prevents duplication in same session.

---

## 2. INCOMING MESSAGE FLOW: Zalo → Socket

### Background

When a Zalo message comes IN (not sent by user):
- `zalo-listener-factory.ts` line 114-135 handles incoming Zalo message
- Line 130-134: Emits via `io?.emit('chat:message', { ... })`
- Same deduplication logic applies

### Incoming Message Path

```
Zalo sends message to account
  ↓
zalo-listener-factory.ts listener.on('message')
  ↓
handleIncomingMessage() creates DB record
  ↓
io?.emit('chat:message', { accountId, message, conversationId })
  ↓
Frontend socket listener receives:
  - Deduplication check prevents duplicate
```

**Verdict: SAFE** (same deduplication logic)

---

## 3. OFFLINE QUEUE FLOW: Mobile Specific Risk

### Mobile Message Sending Path

`MobileChatView.vue` lines 86-93:
```typescript
async function handleSend(content: string) {
  if (!selectedConvId.value) return;
  if (!navigator.onLine) {
    enqueue(selectedConvId.value, content);  ← Add to offline queue
    return;
  }
  await sendMessage(content);  ← Send now if online
}
```

### The Offline Queue Merge

`MobileChatView.vue` lines 69-84:
```typescript
const allMessages = computed(() => {
  const pending = pendingMessages.value
    .filter(p => p.conversationId === selectedConvId.value)
    .map(p => ({
      id: p.id,  ← ID starts with "offline-${Date.now()}-..."
      content: p.content,
      contentType: 'text',
      senderType: 'self',
      senderName: null,
      sentAt: p.createdAt,
      isDeleted: false,
      zaloMsgId: null,
      _pending: true,
    }));
  return [...messages.value, ...pending];
});
```

### When Coming Back Online

`use-offline-queue.ts` line 50-66:
```typescript
async function flush(sendFn: (conversationId: string, content: string) => Promise<void>) {
  if (flushing) return;
  flushing = true;
  try {
    const queue = [...pendingMessages.value];
    for (const msg of queue) {
      try {
        await sendFn(msg.conversationId, msg.content);
        pendingMessages.value = pendingMessages.value.filter(m => m.id !== msg.id);
      } catch {
        break;
      }
    }
  } finally {
    flushing = false;
  }
}
```

### The Duplication Scenario

**Scenario:** User goes offline, sends message, comes back online before app reconnects

1. Message added to offline queue (local ID: "offline-xxx")
2. User comes back online
3. `flush()` calls `sendMessageTo()` → creates message in DB with real ID
4. Backend emits socket event
5. Socket listener receives, adds to messages array
6. But the offline-pending message is STILL VISIBLE until flush removes it

**Wait — there's a problem here!**

In `MobileChatView.vue`, the `allMessages` computed shows both:
- `messages.value` (real DB messages)
- `pending` (offline queue messages)

When the flush happens:
1. Message is sent via API
2. API response returned, added to `messages.value`
3. Socket event may also add it (deduplication prevents double)
4. Offline queue entry removed from `pendingMessages`

**Issue:** If the real message gets added to `messages` from API response BEFORE socket arrives, we're fine. But if socket arrives first and the offline queue hasn't been flushed yet:

```
Timeline:
T0: Message in offline queue
T1: Connection restored
T2: flush() sends message via API
T3: Socket event arrives
T4: API response arrives
T5: Offline queue entry removed

Between T2-T5: Message shows TWICE:
  - Once in messages.value (from response or socket)
  - Once in pending (still in offline queue)
```

### Verdict: MEDIUM RISK

The offline queue message stays visible while the network message is being processed. Duplication can occur briefly.

**However:** Vue's `:key="msg.id"` on line 37 of MessageThread.vue will show them as separate messages since they have different IDs:
- Offline message: `id: "offline-1711845660000-abc123"`
- Real message: `id: "550e8400-e29b-41d4-a716-446655440000"` (UUID)

---

## 4. MESSAGE RENDERING: Vue Key Handling

### Template (MessageThread.vue line 37)

```vue
<div v-for="msg in messages" :key="msg.id" class="mb-2 d-flex" ...>
```

Uses message ID as key. Since offline queue messages have different IDs than real messages:
- Different keys = Vue treats as different elements
- Both will render if both exist in array

**However:** Desktop view (ChatView.vue) only shows `messages` (not `allMessages`):
```typescript
:messages="messages"
```

So desktop doesn't have the offline queue merge problem.

**Mobile view shows `allMessages`** which includes offline queue, so brief duplication possible there.

### Verdict: Low visual risk on desktop, moderate on mobile

---

## 5. Deduplication Check Edge Cases

### Current Logic (use-chat.ts line 244)

```typescript
if (!messages.value.find(m => m.id === data.message.id)) {
  messages.value.push(data.message);
}
```

**This uses `.find()` with identity check on `id` field.**

**Risks:**
1. ✓ Different API and socket emission will have same ID → prevents duplication
2. ✓ Message IDs are UUIDs from backend → unique
3. ✓ Offline queue messages have different ID format → won't match real messages

**However:** 
- If backend sends same socket event twice, it would create duplicate (unlikely but possible)
- If network duplicates the socket message, duplicate would occur (TCP should prevent, but WebSocket doesn't guarantee)

---

## 6. FINDINGS SUMMARY

| Scenario | Risk | Why | Status |
|----------|------|-----|--------|
| Same-session API + socket | LOW | Deduplication on `msg.id` works | ✓ Safe |
| Incoming Zalo → socket | LOW | Same deduplication | ✓ Safe |
| Offline queue + real message | MEDIUM | Different IDs, shows briefly as 2 entries on mobile | ⚠ Risky |
| Socket duplicate send | LOW | Would need backend bug or network issues | ✓ Unlikely |
| Race condition (API vs socket) | LOW | Dedup catches both | ✓ Safe |

---

## 7. RECOMMENDATIONS

### 1. **Offline Queue Double-Check** (PRIORITY: HIGH)

In `use-offline-queue.ts` flush(), after successful send, immediately remove from pending:

```typescript
await sendFn(msg.conversationId, msg.content);
// Remove immediately, don't wait for socket
pendingMessages.value = pendingMessages.value.filter(m => m.id !== msg.id);
```

This already exists (line 58). ✓ Good.

### 2. **Add Idempotency Key** (PRIORITY: MEDIUM)

Add request ID to prevent duplicate sends if request retries:

```typescript
// Frontend
const requestId = `${conversationId}-${Date.now()}`;
const res = await api.post(`/conversations/${conversationId}/messages`, { 
  content,
  requestId  // Add this
});

// Backend
app.post('/api/v1/conversations/:id/messages', async (req, res) => {
  const { content, requestId } = req.body;
  // Store requestId in cache/DB to deduplicate retries
  if (isSeenBefore(requestId)) return getCachedResponse(requestId);
  // ... rest of logic
});
```

### 3. **Visible Offline Indicator** (PRIORITY: MEDIUM)

On mobile, mark offline-queue messages with visual indicator:

```vue
<div v-if="msg._pending" class="text-caption" style="opacity: 0.6; font-style: italic;">
  🔄 Đang gửi...
</div>
```

This helps users understand they're seeing queued messages.

### 4. **Monitor Socket Subscriptions** (PRIORITY: LOW)

Consider checking if user is subscribed to correct conversation before emitting:

```typescript
// Backend - only emit to users watching this conversation
io?.to(`conversation:${conversationId}`).emit('chat:message', { ... });
```

Current code emits to all connected clients then filters client-side. Server-side filtering is more efficient.

### 5. **Add Message Hash Deduplication** (PRIORITY: LOW)

For extra safety, add content hash check:

```typescript
const messageHash = hash(msg.content + msg.sentAt);
if (messages.value.find(m => m.hash === messageHash)) return; // Skip
```

But this is probably overkill given current deduplication.

---

## 8. ROOT CAUSE ANALYSIS

**Why does this happen?**

1. **Dual delivery channels:** API response + WebSocket event both inform client
2. **Asynchronous nature:** Socket event timing unpredictable
3. **Mobile offline scenario:** Introduces temporary message ID mismatch
4. **Vue reactivity:** Both arrays can be visible simultaneously on mobile

**Design is fundamentally sound** but has edge cases in offline flow.

---

## Unresolved Questions

1. **How often do users experience duplicates?** Need metrics from production
2. **Does offline queue flush happen before socket reconnect?** Timing depends on network
3. **Are there other socket events that might cause duplication?** (e.g., group messages)
4. **Should we implement request deduplication on backend?** Best practice but not urgent
5. **Is the offline queue used on desktop?** Appears to be mobile-only, confirm

