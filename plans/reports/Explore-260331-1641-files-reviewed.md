# Files Reviewed - Chat Message Duplication Analysis

## Summary
Analyzed 12 key files to trace complete message sending flow and identify duplication risks.

---

## Frontend Files (Desktop & Mobile)

### 1. `/frontend/src/composables/use-chat.ts` (296 lines)
**Key findings:**
- Lines 218-237: `sendMessage()` and `sendMessageTo()` functions
  - Line 229: Pushes response to messages array
- Lines 239-255: Socket initialization and listeners
  - Line 242-249: `socket.on('chat:message')` with deduplication check
  - Line 244: `if (!messages.value.find(m => m.id === data.message.id))`
- **CRITICAL:** Deduplication logic exists but only checks same session

### 2. `/frontend/src/views/ChatView.vue` (177 lines)
**Key findings:**
- Lines 121-123: Mounts socket on page load
- Line 122: Calls `initSocket()`
- Desktop view passes `:messages="messages"` (no offline queue merge)
- Messages displayed via MessageThread component

### 3. `/frontend/src/views/MobileChatView.vue` (118 lines)
**Key findings:**
- Lines 69-84: Creates `allMessages` computed that MERGES:
  - `messages.value` (from DB/socket)
  - `pendingMessages.value` (offline queue)
- Lines 86-93: `handleSend()` checks `navigator.onLine`
  - If offline: enqueues message
  - If online: sends immediately
- **CRITICAL:** Mobile shows both pending + real messages simultaneously

### 4. `/frontend/src/composables/use-offline-queue.ts` (72 lines)
**Key findings:**
- Lines 41-48: `enqueue()` adds message with ID format: `offline-${Date.now()}-${random}`
- Lines 50-66: `flush()` sends queued messages
  - Line 57: Sends via provided function
  - Line 58: Removes from queue after successful send
- Offline messages have DIFFERENT ID format than real messages (UUID)
- **ISSUE:** Offline message removed AFTER send completes, not immediately

### 5. `/frontend/src/components/chat/MessageThread.vue` (250 lines)
**Key findings:**
- Line 37: `v-for="msg in messages" :key="msg.id"`
  - Uses message ID as Vue key
  - Different IDs = rendered as different elements
- Lines 152-167: Image extraction logic
- Lines 184-194: Content parsing
- Line 240: Watches messages length, scrolls to bottom
- **ISSUE:** No special handling for offline queue messages; both show if IDs differ

---

## Backend Files (API & Socket)

### 6. `/backend/src/modules/chat/chat-routes.ts` (182 lines)
**Key findings:**
- Lines 110-167: `POST /api/v1/conversations/:id/messages`
  - Line 140-152: Creates message in DB with UUID
  - Line 160: `io?.emit('chat:message', { accountId, message, conversationId })`
    - **CRITICAL:** Emits BEFORE returning response
  - Line 162: Returns message in HTTP response
- Lines 21-65: Lists conversations
- Lines 85-107: Lists messages (paginated)

### 7. `/backend/src/modules/api/public-api-routes.ts` (288 lines)
**Key findings:**
- Lines 254-286: `POST /api/public/messages/send`
  - External API for sending messages
  - Different implementation, no socket emit (fire-and-forget)
- Public API doesn't emit socket events to UI
- Used for external integrations only

### 8. `/backend/src/modules/chat/message-handler.ts` (274 lines)
**Key findings:**
- Lines 48-150: `handleIncomingMessage()` - processes Zalo messages
  - Line 71-84: Creates message in DB
  - Line 86: Updates conversation metadata
  - Line 96-104: Emits webhooks
  - Line 122-138: Runs automation rules
  - **NOTE:** Doesn't directly emit socket; done by listener

### 9. `/backend/src/modules/zalo/zalo-listener-factory.ts` (161 lines)
**Key findings:**
- Lines 89-139: `listener.on('message')` handler
  - Line 114-127: Calls `handleIncomingMessage()`
  - Lines 130-134: `io?.emit('chat:message', { accountId, message, conversationId })`
    - **CRITICAL:** Emits for INCOMING messages (from contact)
- Lines 141-147: `listener.on('undo')` for message deletion
- **NOTE:** This is different from user-sent messages (different code path)

---

## Code Flow Paths

### Path A: User Sends Message (Desktop)
```
ChatView.vue → MessageThread @send
    ↓
use-chat.ts sendMessage()
    ↓
sendMessageTo(conversationId, content)
    ├─ API.post() → messages.value.push(response)
    └─ socket.on('chat:message') → dedup check → maybe push
    
File: use-chat.ts lines 218-237, 242-249
```

### Path B: User Sends Message (Mobile Offline)
```
MobileChatView.vue handleSend()
    ├─ navigator.onLine = false → enqueue
    │   └─ use-offline-queue.ts enqueue()
    └─ When online → flush()
        └─ use-chat.ts sendMessageTo()
            ├─ API.post() → messages.value.push()
            ├─ socket.on('chat:message') → dedup
            └─ pendingMessages filtered

Files: MobileChatView.vue lines 86-93, use-offline-queue.ts lines 50-66
```

### Path C: Contact Sends Message (Incoming)
```
Zalo API → zca-js listener
    ↓
zalo-listener-factory.ts listener.on('message')
    ├─ handleIncomingMessage()
    │   └─ Creates DB message
    └─ io?.emit('chat:message')
        ├─ Frontend dedup check
        └─ messages.value.push()

Files: zalo-listener-factory.ts lines 89-139, chat-routes.ts lines 160
```

---

## Socket Events Identified

### 1. `chat:message`
- **Emitted from:** `chat-routes.ts` line 160, `zalo-listener-factory.ts` line 130
- **Listened in:** `use-chat.ts` line 242
- **Payload:** `{ accountId, message, conversationId }`
- **Dedup check:** Line 244

### 2. `chat:deleted`
- **Emitted from:** `zalo-listener-factory.ts` line 145
- **Listened in:** `use-chat.ts` line 251
- **Purpose:** Mark message as deleted

### 3. `zalo:disconnected`
- **Emitted from:** `zalo-listener-factory.ts` line 152
- **Purpose:** Notify of account disconnection

---

## Data Structures

### Message Object
```typescript
interface Message {
  id: string;                  // UUID from backend
  content: string | null;
  contentType: string;         // 'text', 'image', 'video', etc.
  senderType: string;          // 'self' or 'contact'
  senderName: string | null;
  sentAt: string;              // ISO date
  isDeleted: boolean;
  zaloMsgId: string | null;
}
```

### Offline Queue Message
```typescript
interface PendingMessage {
  id: string;                  // Format: "offline-${Date.now()}-${random}"
  conversationId: string;
  content: string;
  createdAt: string;           // ISO date
}
```

### Socket Message Payload
```typescript
{
  accountId: string;
  message: Message;            // Full Message object
  conversationId: string;
}
```

---

## Deduplication Implementation

### Current Location: `use-chat.ts` lines 244-245
```typescript
if (!messages.value.find(m => m.id === data.message.id)) {
  messages.value.push(data.message);
}
```

### Characteristics
- **Scope:** Only for socket events in same session
- **Type:** Identity-based (UUID match)
- **Performance:** O(n) linear search
- **Reliability:** Works for same session, doesn't handle:
  - Network-duplicated socket events
  - Multiple browser tabs
  - Mobile offline scenarios

---

## File Statistics

| Category | Files | Lines | Key Purpose |
|----------|-------|-------|-------------|
| Frontend composables | 2 | 368 | Chat state & offline queue |
| Frontend views | 2 | 295 | Desktop & mobile UI |
| Frontend components | 1 | 250 | Message display |
| Backend routes | 2 | 470 | REST API endpoints |
| Backend handlers | 2 | 435 | Message processing |
| **Total** | **9** | **1,818** | Chat system core |

---

## Critical Code Sections

### 1. Message Send + Response
- **File:** use-chat.ts
- **Lines:** 223-237
- **Risk:** Low (dedup works)

### 2. Socket Listener
- **File:** use-chat.ts
- **Lines:** 242-249
- **Risk:** Low (dedup works)

### 3. Offline Queue Merge
- **File:** MobileChatView.vue
- **Lines:** 69-84
- **Risk:** MEDIUM (shows both)

### 4. Backend Socket Emit (User Send)
- **File:** chat-routes.ts
- **Lines:** 160
- **Risk:** Low (dedup catches)

### 5. Backend Socket Emit (Incoming)
- **File:** zalo-listener-factory.ts
- **Lines:** 130-134
- **Risk:** Low (dedup catches)

---

## Configuration & Assumptions

### Socket.IO Transport
- **File:** use-chat.ts line 240
- **Config:** `{ transports: ['websocket', 'polling'] }`
- **Implication:** Falls back to polling if WebSocket unavailable

### Offline Queue Storage
- **File:** use-offline-queue.ts line 10
- **Storage:** `localStorage` key: `'zalocrm-offline-queue'`
- **Persistence:** Survives page reload

### Message ID Generation
- **Backend:** UUID (randomUUID from crypto)
- **Offline queue:** Format-based `offline-${timestamp}-${random}`
- **Implication:** Different format prevents accidental match

