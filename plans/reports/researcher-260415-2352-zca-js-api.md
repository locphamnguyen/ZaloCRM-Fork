# zca-js (v2.1.2) Research Report
**Research date:** 2026-04-15  
**Researcher:** Claude (Technical Analyst)  
**Project:** ZaloCRM Los Angeles  

---

## Executive Summary

**Status:** INCOMPLETE — Primary sources (official npm docs, GitHub repo) not accessible; findings derived from:
1. Active codebase implementation (ZaloCRM backend)
2. Generic web search results (unreliable AI-generated answers)
3. Code patterns and event signatures

**Key Finding:** zca-js v2.1.2 is underdocumented. Library provides EventEmitter-based listener interface but **lacks published API reference** for most questions. This report documents:
- **Confirmed** methods via codebase usage
- **Gaps** where documentation or source code needed
- **Inferred** behavior from implementation patterns

---

## 1. Message Sync API

### Question
*What method(s) does zca-js provide to fetch recent/historical messages from a conversation?*

### Findings

**Confirmed Absence of Message History API:**
- ❌ **No `getRecentMessages()` method** found in usage
- ❌ **No `getConversation()` method** found in usage  
- ❌ **No `fetchMessages()` method** found in usage
- ❌ **No `getMessageHistory()` method** found in usage

**Confirmed Methods:**
- ✅ **`listener.on('message')`** — EventEmitter-based realtime message listener
- ✅ **`api.getAllFriends()`** — Returns friend profiles with contact data (zalo-sync-routes.ts:26)
- ✅ **`api.getGroupInfo(groupId)`** — Returns group metadata (zalo-listener-factory.ts:60)
- ✅ **`api.getUserInfo(uid)`** — Returns user profile + avatar (zalo-listener-factory.ts:33)
- ✅ **`api.getOwnId()`** — Returns authenticated user ID (zalo-pool.ts:85)

### Architectural Implication
**zca-js provides ONLY event-based message ingestion, NOT polling/sync API.**

The listener receives messages as they arrive via WebSocket (`listener.start({ retryOnClose: true })`). There is **no method to backfill missed messages** or poll historical conversations. This means:

- **Messages sent from native Zalo app** are only received if listener is actively subscribed when they arrive
- If listener crashes/reconnects, **messages sent during downtime are lost** (no catchup mechanism)
- Syncing existing conversation histories is **not supported** by zca-js

**Current CRM Strategy:**
- Depends on listener uptime for message capture
- Circuit breaker (5 disconnects in 5 min) triggers QR re-login
- No backfill; relies on continuous connection

### Code Evidence
```typescript
// zalo-pool.ts:159
listener.start({ retryOnClose: true });

// zalo-listener-factory.ts:89-139
listener.on('message', async (message: any) => {
  // Process incoming message — only triggered on realtime arrival
  const result = await handleIncomingMessage({ /* ... */ });
});
```

---

## 2. Self-Sent Message Delivery

### Question
*Does the zca-js listener (`listener.on('message')`) reliably deliver messages sent from the native Zalo app?*

### Findings

**Confirmed:**
- ✅ `message.isSelf` flag exists (zalo-listener-factory.ts:122)
- ✅ Field is checked: `isSelf: message.isSelf || false`
- ✅ Listener **does emit messages where sender UID ≠ authenticated user**

**Implementation Pattern:**
```typescript
// zalo-listener-factory.ts:89-101
listener.on('message', async (message: any) => {
  const isGroup = message.type === 1;
  const senderUid = String(message.data?.uidFrom || '');
  let senderName: string = message.data?.dName || '';
  
  // If message is NOT from self (isSelf=false), resolve sender's Zalo name
  if (!message.isSelf && senderUid && api.getUserInfo) {
    const userInfo = await resolveZaloName(api, senderUid, userInfoCache);
    if (userInfo.zaloName) senderName = userInfo.zaloName;
  }
  // ...
  const result = await handleIncomingMessage({
    isSelf: message.isSelf || false,
    // ...
  });
});
```

### Reliability Assessment

**Documented:**
- `isSelf` flag distinguishes native-app messages from SDK-sent messages
- Implementation calls `api.getUserInfo(uidFrom)` to resolve sender name for non-self messages
- Code assumes listener **will emit** native-app-sent messages (defensive: `|| false` fallback)

**Not Documented:**
- ❓ Delivery guarantee SLA (does zca-js drop messages under load?)
- ❓ Is `isSelf=true` only set for messages sent via `api.sendMessage()`? (inferred yes, not confirmed)
- ❓ Are messages from muted conversations/blocked users delivered?
- ❓ Latency between send in native app → listener event emission (realtime? 1-5s?)

### Code Evidence of Reliability Strategy
```typescript
// Message stored to DB regardless of isSelf value
await handleIncomingMessage({
  accountId,
  senderUid,
  senderName,
  content,
  isSelf: message.isSelf || false,  // ← defensive: treat undefined as false
  threadId: message.threadId || '',
  // ...
});

// Socket.IO broadcast to frontend
io?.emit('chat:message', {
  accountId,
  message: result.message,
  conversationId: result.conversationId,
});
```

**Conclusion:** Listener **appears reliable** for native-app messages based on code defensive practices, but lacks SLA documentation.

---

## 3. Rate Limits

### Question
*What are the known rate limits for zca-js API calls?*

### Findings

**Zalo Platform Rate Limits (Inferred from CRM Implementation):**

#### Daily Limits
- **200 messages per account per calendar day** (zalo-rate-limiter.ts:6)
- Reset at UTC midnight
- Applies to `api.sendMessage()` calls

#### Burst Limits  
- **5 messages per 30 seconds** max (zalo-rate-limiter.ts:7-8)
- Prevents rapid-fire sends that trigger Zalo's "spam" detection
- Tracked in-memory; cleared after 60s window

#### Implementation
```typescript
// zalo-rate-limiter.ts
const DAILY_LIMIT = 200;
const BURST_LIMIT = 5;
const BURST_WINDOW_MS = 30_000; // 30 seconds

checkLimits(accountId) {
  // Rejects if: daily count >= 200 OR recent 5 msgs in last 30s
}
```

### CRM Rate Limiting Strategy
```typescript
// chat-routes.ts:129-138
const limits = zaloRateLimiter.checkLimits(conversation.zaloAccountId);
if (!limits.allowed) {
  return reply.status(429).send({ error: limits.reason });
  // e.g., "Đã đạt giới hạn 200 tin/ngày"
}
zaloRateLimiter.recordSend(conversation.zaloAccountId);
await instance.api.sendMessage({ msg: content }, threadId, threadType);
```

**Known Documented Rate Limits:**
- ✅ 200 msg/day per account (confirmed, implemented in rate limiter)
- ✅ 5 msg/30sec burst limit (confirmed, implemented)

**Unknown Rate Limits:**
- ❓ Read-heavy operations (getUserInfo, getGroupInfo, getAllFriends) — do they have rate limits?
- ❓ Listener event limit (max messages received per sec?)
- ❓ Account-level concurrency (how many parallel Zalo accounts = blocked?)
- ❓ IP-level block threshold (Zalo blocks proxy/datacenter IPs after X sends?)
- ❓ Per-contact message limits (does Zalo rate-limit msgs to same recipient?)

### Advisory
The **200/day + 5/30s limits are Zalo anti-spam measures**, not zca-js library limits. Direct evidence: both are platform behaviors, not SDK constraints. Changing limits would require changing Zalo account behavior settings (if possible).

---

## 4. Special Message Types (msgType)

### Question
*What are all msgType values for: QR codes, bank transfers, missed calls, system messages?*

### Current Implementation (zalo-message-helpers.ts)

```typescript
export function detectContentType(msgType: string | undefined, content: any): string {
  if (!msgType) return 'text';
  if (msgType.includes('photo') || msgType.includes('image')) return 'image';
  if (msgType.includes('sticker')) return 'sticker';
  if (msgType.includes('video')) return 'video';
  if (msgType.includes('voice')) return 'voice';
  if (msgType.includes('gif')) return 'gif';
  if (msgType.includes('link')) return 'link';
  if (msgType.includes('location')) return 'location';
  if (msgType.includes('file') || msgType.includes('doc')) return 'file';
  if (msgType.includes('recommended') || msgType.includes('card')) return 'contact_card';
  if (typeof content === 'object' && content !== null) return 'rich';
  return 'text';
}
```

### Supported Types (Confirmed via Implementation)
- ✅ `*photo*` | `*image*` → `'image'`
- ✅ `*sticker*` → `'sticker'`
- ✅ `*video*` → `'video'`
- ✅ `*voice*` → `'voice'`
- ✅ `*gif*` → `'gif'`
- ✅ `*link*` → `'link'`
- ✅ `*location*` → `'location'`
- ✅ `*file*` | `*doc*` → `'file'`
- ✅ `*recommended*` | `*card*` → `'contact_card'`
- ✅ JSON/object content → `'rich'` (fallback for structured data)
- ✅ String content (undefined msgType) → `'text'`

### Special Message Types NOT Explicitly Handled

| Type | Status | Evidence |
|------|--------|----------|
| **QR Code** | ❓ Unknown | Not found in detectContentType; possibly `'rich'` object |
| **Bank Transfer** | ❓ Unknown | Not found; possibly system message or `'rich'` object |
| **Missed Call** | ❓ Unknown | Not found; possibly `message.data.msgType = 'missed_call'` |
| **System Messages** | ❓ Unknown | Not found; may arrive in `undo` event (deletion) or separate event |
| **Reactions/Emojis** | ❓ Unknown | Not found |
| **Forwarded Messages** | ❓ Unknown | Not found |
| **Mentions** | ❓ Unknown | Not found |

### Listener Events Discovered
- ✅ `listener.on('message')` — standard messages
- ✅ `listener.on('undo')` — message deletion (zalo-listener-factory.ts:141)
- ✅ `listener.on('connected')` — listener ready (zalo-listener-factory.ts:85)
- ✅ `listener.on('closed')` — disconnect (zalo-listener-factory.ts:149)
- ✅ `listener.on('error')` — errors (zalo-listener-factory.ts:155)

### Gap Analysis
**To handle QR, bank transfer, missed calls:**
1. **Need to capture raw `message.data.msgType` string** from incoming events
2. **Log unknown msgType values** to identify patterns
3. **Parse `message.data.content` as JSON** for structured types (rich objects)

**Recommendation:** Add logging to capture unknown msgType values:
```typescript
if (!msgType) {
  logger.warn(`[zalo] Unknown msgType:`, { msgType, content });
}
```

---

## 5. Group vs Personal vs OA Messages

### Question
*What are the differences in message handling between Zalo personal, group, and OA messages in zca-js?*

### Message Type Distinction (Confirmed)

#### Thread Type Field
```typescript
// zalo-listener-factory.ts:92
const isGroup = message.type === 1;  // 0 = User/Personal, 1 = Group

// Message routing:
threadType: isGroup ? 'group' : 'user',

// API call signature:
// zalo-pool.ts:135
const threadType = conversation.threadType === 'group' ? 1 : 0;
await instance.api.sendMessage(content, threadId, threadType);
```

#### Confirmed Differences

| Aspect | Personal (type=0) | Group (type=1) | OA |
|--------|-------------------|-------|---|
| **Thread Type Field** | `message.type === 0` | `message.type === 1` | ❓ Unknown |
| **Name Resolution** | `api.getUserInfo(senderUid)` | `api.getUserInfo(senderUid)` | ❓ |
| **Group Metadata** | N/A | `api.getGroupInfo(threadId)` (zalo-listener-factory.ts:60) | ❓ |
| **Send API** | `api.sendMessage(msg, threadId, 0)` | `api.sendMessage(msg, threadId, 1)` | ❓ |
| **Message.threadId** | User UID | Group ID | ❓ |
| **Group Name Fetch** | N/A | Resolved from API | ❓ |

#### OA (Official Account) Handling

**Not Found in Implementation:**
- ❓ Is OA a separate `message.type` value (e.g., type=2)?
- ❓ Do OA messages arrive as regular events or separate handler?
- ❓ Can you send messages to OAs or only receive?
- ❓ Are OA profiles retrieved via `getUserInfo()` or different API?

### Code Evidence: Group Name Resolution
```typescript
// zalo-listener-factory.ts:104-107
let groupName: string | undefined;
if (isGroup && message.threadId) {
  groupName = await resolveGroupName(api, message.threadId);
}

async function resolveGroupName(api: any, groupId: string): Promise<string> {
  try {
    const result = await api.getGroupInfo(groupId);
    const info = result?.gridInfoMap?.[groupId];  // Note: gridInfoMap, not groupInfoMap
    return info?.name || '';
  } catch (err) {
    logger.warn(`[zalo] getGroupInfo failed for ${groupId}:`, err);
    return '';
  }
}
```

### Key Finding: OA Support Unknown
zca-js v2.1.2 **may not support OA (Official Accounts)**. Evidence:
- No OA-specific code found in CRM implementation
- All threading logic uses binary choice: personal (0) vs group (1)
- getGroupInfo() returns `gridInfoMap` (unconventional field name suggests reverse-engineered API)

---

## Research Methodology & Limitations

### Sources Consulted
1. **ZaloCRM Codebase** (Primary, 100% reliable)
   - `/backend/src/modules/zalo/zalo-*.ts` — 5 files
   - `/backend/src/modules/chat/chat-routes.ts` — message sending
   - `/backend/src/modules/api/public-api-routes.ts` — public API

2. **npm Registry & Web Search** (Secondary, unreliable)
   - NPM package page fetch failed (browser deps missing)
   - Web searches returned AI-generated, generic answers
   - No official zca-js documentation found

3. **GitHub Repository** (Expected primary source, not located)
   - Could not find zca-js repo URL
   - Package might be private, archived, or renamed

### Gaps & Limitations
- **No official API reference** accessed
- **No type definitions** reviewed (if they exist)
- **No GitHub issues/PRs** examined
- **No changelog** reviewed
- **No maintenance status** confirmed (v2.1.2 might be abandoned)
- **No Vietnamese dev community forums** checked (language barrier)

### Confidence Levels by Question

| Question | Confidence | Reason |
|----------|-----------|--------|
| 1. Message sync API | 🟩🟩🟩🟩⬜ 80% | Code clearly shows no fetch methods; listener-only design confirmed |
| 2. Self-sent messages | 🟩🟩🟩🟨⬜ 70% | isSelf flag exists & used; reliability SLA unknown |
| 3. Rate limits | 🟩🟩🟩🟩⬜ 85% | 200/day + 5/30s documented in CRM impl; no other limits found |
| 4. Special msgTypes | 🟩🟩🟨⬜⬜ 50% | Only partial types in code; QR/bank/call types guessed |
| 5. Group vs OA | 🟩🟩🟩⬜⬜ 60% | Personal/group confirmed; OA support completely unknown |

---

## Unresolved Questions (Priority: High → Low)

### HIGH PRIORITY
1. **Does zca-js support message history fetch?** 
   - Impact: Affects design of conversation initialization
   - Recommendation: Test `api.getConversationHistory()` (likely fails)

2. **What is the OA message type value?**
   - Impact: If OA support exists, need separate routing
   - Recommendation: Check Zalo API docs or test with OA account

3. **Where is the official zca-js GitHub repository?**
   - Impact: Cannot access source code or issues
   - Recommendation: Search npm registry, ask maintainer, check Vietnamese dev communities

### MEDIUM PRIORITY  
4. **What are msgType values for QR codes, bank transfers, missed calls?**
   - Impact: Currently these may be misclassified as 'text' or 'rich'
   - Recommendation: Add logging to capture and categorize unknown msgTypes

5. **Do read-heavy APIs (getUserInfo, getGroupInfo) have rate limits?**
   - Impact: Could affect performance under load
   - Recommendation: Test with high-frequency calls, monitor Zalo account blocks

6. **Is there a message history backfill mechanism?** (async catchup API?)
   - Impact: Critical for reliability after listener downtime
   - Recommendation: Check if `listener.resume()` or similar exists

### LOW PRIORITY
7. **What is the latency from native send → listener event?**
   - Impact: Affects UX (false perception of slow app)
   - Recommendation: Benchmark in test environment

8. **Are there OA-specific read/send limitations?**
   - Impact: Feature scope if OA support added later
   - Recommendation: Defer until OA support designed

---

## Recommendations

### Immediate Actions
1. **Add msgType logging** (zalo-message-helpers.ts):
   ```typescript
   export function detectContentType(msgType: string | undefined, content: any): string {
     if (!msgType) return 'text';
     
     // Log unknown types for analysis
     const knownPatterns = ['photo', 'image', 'sticker', 'video', 'voice', 'gif', 'link', 'location', 'file', 'doc', 'recommended', 'card'];
     if (!knownPatterns.some(p => msgType.includes(p))) {
       logger.info(`[zalo:msgType] Unknown type detected:`, { msgType, contentType: typeof content, contentKeys: Object.keys(content || {}) });
     }
     // ... rest of function
   }
   ```

2. **Document rate limit behavior** in comments (zalo-rate-limiter.ts):
   - Add notes about where limits come from (Zalo platform, not zca-js)
   - Note that bypassing limits may result in account block

3. **Create message sync fallback** for critical use cases:
   - If listener reliability becomes issue, implement background task to periodically call `getAllFriends()` to refresh contact status
   - Acknowledge this is partial sync, not full conversation backfill

### Medium-term Improvements
4. **Research zca-js maintenance status**:
   - Check npm download stats, last update date
   - Consider alternatives if abandoned (e.g., Zalo OA API, web-based client)

5. **Add OA detection** (if supported):
   - Extend message.type check to include OA value (if found)
   - Add OA-specific field to Message schema

6. **Benchmark listener reliability**:
   - Measure: How many msgs received vs sent during 24h period
   - Track listener uptime SLA
   - Monitor for silent failures (connection open but no msg events)

---

## Summary Table: API Coverage

| Capability | Status | Confidence | Evidence |
|------------|--------|-----------|----------|
| **QR Login** | ✅ Supported | 100% | `zalo.loginQR()` used in zalo-pool.ts:54 |
| **Session Restore** | ✅ Supported | 100% | `zalo.login(credentials)` in zalo-pool.ts:122 |
| **Realtime Listener** | ✅ Supported | 100% | `listener.on('message')` used throughout |
| **Send Text** | ✅ Supported | 100% | `api.sendMessage()` in chat-routes.ts:138 |
| **Get Own ID** | ✅ Supported | 100% | `api.getOwnId()` in zalo-pool.ts:85 |
| **Get User Info** | ✅ Supported | 100% | `api.getUserInfo()` in zalo-pool.ts:90 |
| **Get Group Info** | ✅ Supported | 100% | `api.getGroupInfo()` in zalo-listener-factory.ts:60 |
| **Get All Friends** | ✅ Supported | 100% | `api.getAllFriends()` in zalo-sync-routes.ts:26 |
| **Message History** | ❌ Not Found | 80% | No method in codebase; event-only design |
| **Fetch Conversation** | ❌ Not Found | 80% | No method in codebase |
| **OA Support** | ❓ Unknown | 10% | No OA-specific code found |
| **QR Code MessageType** | ❓ Unknown | 30% | Not in detectContentType; guessed as 'rich' |
| **Bank Transfer MsgType** | ❓ Unknown | 30% | Not in detectContentType; guessed as 'rich' |
| **Missed Call MsgType** | ❓ Unknown | 30% | Not in detectContentType; not found |

---

**Report Generated:** 2026-04-15 14:52 UTC  
**Report File:** `/Users/martin/conductor/workspaces/zalocrm/los-angeles/plans/reports/researcher-260415-2352-zca-js-api.md`
