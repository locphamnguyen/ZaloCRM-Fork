# Chat Message Flow - Visual Diagrams

## Flow 1: Desktop User Sends Message

```
┌─────────────────────────────────────────────────────────────────────┐
│ ChatView.vue (Desktop)                                              │
├─────────────────────────────────────────────────────────────────────┤
│  User types message → MessageThread @send event                     │
│  ↓                                                                    │
│  sendMessage(content) called                                        │
└─────────────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────────────┐
│ use-chat.ts composable                                              │
├─────────────────────────────────────────────────────────────────────┤
│  sendMessageTo(conversationId, content)                             │
│  ├─ Set sendingMsg = true                                           │
│  ├─ API.post('/conversations/:id/messages', { content })            │
│  │  └─ Response: { id, content, sentAt, ... }                       │
│  └─ messages.value.push(response.data)  ← FIRST ADD (LINE 229)      │
└─────────────────────────────────────────────────────────────────────┘
       ↓ (Network)
┌─────────────────────────────────────────────────────────────────────┐
│ Backend: chat-routes.ts                                             │
├─────────────────────────────────────────────────────────────────────┤
│  POST /api/v1/conversations/:id/messages                            │
│  ├─ Create message in DB with UUID                                  │
│  ├─ io.emit('chat:message', { message, conversationId })            │
│  │  ↓ (WebSocket to all connected clients)                          │
│  └─ Return message in response                                      │
└─────────────────────────────────────────────────────────────────────┘
       ↓↓ (Two parallel returns)
   ┌───┴─────────────────────────────────────────────────┬──────────┐
   │                                                     │          │
   ↓ (HTTP Response)                            ↓ (WebSocket Event)  │
┌────────────────────────────────┐     ┌──────────────────────────┐  │
│ Frontend receives response      │     │ use-chat.ts socket      │  │
│ (~50ms from send)               │     │ listener                │  │
├────────────────────────────────┤     ├──────────────────────────┤  │
│ messages.value.push(res.data)   │     │ on('chat:message')      │  │
│ ← Already in array from L229    │     │ {                       │  │
└────────────────────────────────┘     │  if (!find(m.id)) {      │  │
                                        │    messages.push(msg)    │  │
                                        │  }  ← DEDUP CHECK SAVE   │  │
                                        │ }                        │  │
                                        └──────────────────────────┘  │
                                                    (Line 244-245)    │
```

**Result:** Message shown ONCE ✓ (deduplication works)

---

## Flow 2: Mobile User Goes Offline, Then Online

```
┌────────────────────────────────────────────────────────────────────┐
│ MobileChatView.vue                                                  │
├────────────────────────────────────────────────────────────────────┤
│ T0: navigator.onLine = false                                       │
│     User sends message                                             │
│     ├─ handleSend(content)                                         │
│     ├─ !navigator.onLine → true                                    │
│     └─ enqueue(conversationId, content)                            │
│        └─ pendingMessages = [{ id: 'offline-xxx', content }]       │
│                                                                    │
│ Display: allMessages = [...messages, ...pending]                  │
│         Shows: message with id='offline-xxx'  ← PENDING VISIBLE    │
└────────────────────────────────────────────────────────────────────┘
     ↓ (User comes back online)
┌────────────────────────────────────────────────────────────────────┐
│ MobileChatView.vue onOnline event (T1)                              │
├────────────────────────────────────────────────────────────────────┤
│ flush(sendMessageTo)  ← Calls use-chat.ts                          │
└────────────────────────────────────────────────────────────────────┘
     ↓
┌────────────────────────────────────────────────────────────────────┐
│ use-chat.ts sendMessageTo()                                        │
├────────────────────────────────────────────────────────────────────┤
│ T2: API.post('/conversations/:id/messages', { content })           │
│     messages.value.push(response)  ← NEW REAL MESSAGE              │
│                                     └─ id='550e8400-...' (UUID)     │
└────────────────────────────────────────────────────────────────────┘
     ↓ (Network)
┌────────────────────────────────────────────────────────────────────┐
│ Backend chat-routes.ts (T3)                                        │
├────────────────────────────────────────────────────────────────────┤
│ Create in DB → io.emit('chat:message', { message })                │
└────────────────────────────────────────────────────────────────────┘
     ↓ (WebSocket)
┌────────────────────────────────────────────────────────────────────┐
│ Frontend socket listener (T4)                                      │
├────────────────────────────────────────────────────────────────────┤
│ on('chat:message') → messages.push() (no dup, already from API)    │
│                                                                    │
│ Meanwhile: pendingMessages still has 'offline-xxx'                 │
│           → allMessages shows BOTH:                                │
│             - 'offline-xxx' (pending)                              │
│             - '550e8400-...' (real)                                │
│                       ↑                                             │
│                BRIEF DUPLICATION! (different IDs)                  │
└────────────────────────────────────────────────────────────────────┘
     ↓
┌────────────────────────────────────────────────────────────────────┐
│ use-offline-queue.ts flush() completes (T5)                        │
├────────────────────────────────────────────────────────────────────┤
│ pendingMessages = pendingMessages.filter(m => m.id !== 'offline-xxx')
│ → Removes offline-pending message                                  │
│                                                                    │
│ allMessages = [...messages, ...pending]                           │
│             = [..., '550e8400-...']  ← Only real message remains   │
└────────────────────────────────────────────────────────────────────┘

**Result:** Briefly shows 2 messages (T2-T5), then 1 ⚠️ (moderate risk)
```

---

## Flow 3: Incoming Message from Zalo Contact

```
┌────────────────────────────────────────────────────────────────────┐
│ Zalo API                                                            │
├────────────────────────────────────────────────────────────────────┤
│ Contact sends message                                              │
└────────────────────────────────────────────────────────────────────┘
     ↓ (zca-js SDK detects)
┌────────────────────────────────────────────────────────────────────┐
│ zalo-listener-factory.ts                                           │
├────────────────────────────────────────────────────────────────────┤
│ listener.on('message') {                                           │
│   handleIncomingMessage({                                          │
│     accountId, senderUid, content, threadId, ...                   │
│   })                                                               │
│   └─ Creates message in DB                                         │
│                                                                    │
│   io.emit('chat:message', {                                        │
│     accountId,                                                     │
│     message: { id, content, senderType='contact', ... },          │
│     conversationId                                                 │
│   })                                                               │
│ }                                                                  │
└────────────────────────────────────────────────────────────────────┘
     ↓ (WebSocket)
┌────────────────────────────────────────────────────────────────────┐
│ Frontend use-chat.ts socket listener                               │
├────────────────────────────────────────────────────────────────────┤
│ on('chat:message', data) {                                         │
│   if (data.conversationId === selectedConvId) {                    │
│     if (!messages.find(m => m.id === data.message.id)) {          │
│       messages.push(data.message)  ← DEDUP WORKS                  │
│     }                                                              │
│   }                                                                │
│   fetchConversations()  ← Refresh list                            │
│ }                                                                  │
└────────────────────────────────────────────────────────────────────┘

**Result:** Message shown ONCE ✓ (deduplication works)
```

---

## Socket Event Broadcast

```
Backend emits to ALL clients:
    io.emit('chat:message', { ... })
         ↓
    ┌────────────────────────────────────────────┐
    │ All WebSocket connections receive          │
    ├────────────────────────────────────────────┤
    │ • Other browsers/tabs same user             │
    │ • Other device (phone)                     │
    │ • Different users in same org (potentially) │
    └────────────────────────────────────────────┘
         ↓
    Each client checks:
    ├─ if (conversationId === selectedConvId)
    │  └─ Only add if viewing this conversation
    └─ if (!messages.find(m => m.id === msg.id))
       └─ Only add if not already present (DEDUP)

⚠️ NOTE: Backend broadcasts to ALL clients, not conversation-scoped
         Could be optimized with io.to(`conversation:${id}`)
```

---

## Key Timing Windows

### Desktop: Tight Race

```
T0+0ms    Backend saves message
T0+1ms    Backend emits socket event
T0+2ms    Backend sends HTTP response
T0+50ms   Frontend receives HTTP response
T0+55ms   Frontend receives socket event
          
Action at each point:
T0+50ms   message added from HTTP
T0+55ms   dedup check finds it → no duplicate added ✓
```

### Mobile Offline: Long Race

```
T0        Message added to offline queue
T1+500ms  User reconnects
T2        Flush starts API request
T2+100ms  HTTP response returns
T2+101ms  pendingMessages still contains 'offline-xxx'
T2+150ms  Socket event arrives
T2+200ms  Flush removes 'offline-xxx' from pending
          
Display windows:
T2+100ms-200ms  allMessages shows BOTH ⚠️ VISIBLE DUPLICATE
T2+200ms        Offline entry removed ✓ Back to 1
```

---

## Socket Connection Lifecycle

```
Page Load
   ↓
ChatView.vue onMounted → initSocket()
   ├─ io = io({ transports: ['websocket', 'polling'] })
   ├─ Listen to 'chat:message' events
   ├─ Listen to 'chat:deleted' events
   └─ Connected and ready
   
User Activity
   ├─ Sends message → API.post() ✓
   ├─ Receives socket events ✓
   └─ Can receive from other tabs/devices ✓
   
Page Unload
   └─ ChatView.vue onUnmounted → destroySocket()
      └─ socket.disconnect()
         └─ Connection closed
```

---

## Message Deduplication Algorithm

### Current (use-chat.ts line 244-246)

```
socket.on('chat:message', (data) => {
  if (data.conversationId === selectedConvId.value) {
    if (!messages.value.find(m => m.id === data.message.id)) {  ← O(n)
      messages.value.push(data.message);
    }
  }
  fetchConversations();
});
```

**Pros:**
- Simple, correct for same-session dedup
- ID uniqueness guaranteed by UUID

**Cons:**
- O(n) linear search on every message
- Could be Set-based for O(1) lookup
- Doesn't handle network duplication of socket event itself

### Improved (Optional)

```
// In composable init
const messageIds = new Set<string>();

socket.on('chat:message', (data) => {
  if (data.conversationId === selectedConvId.value) {
    if (!messageIds.has(data.message.id)) {  ← O(1)
      messages.value.push(data.message);
      messageIds.add(data.message.id);
    }
  }
  fetchConversations();
});

// When clearing messages
function onSelectConversation() {
  messages.value = [];
  messageIds.clear();
}
```

This is more efficient but premature optimization.

