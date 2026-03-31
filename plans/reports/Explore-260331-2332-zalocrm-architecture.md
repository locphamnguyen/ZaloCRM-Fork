# ZaloCRM Project Exploration Report
**Date:** 2026-03-31 | **Time:** 23:32 | **Status:** Complete

---

## 1. PRISMA SCHEMA: ZaloAccount MODEL

### Model Definition
**Location:** `/Users/martin/conductor/workspaces/zalocrm/nashville/backend/prisma/schema.prisma` (lines 75-95)

```prisma
model ZaloAccount {
  id              String    @id @default(uuid())
  orgId           String    @map("org_id")
  ownerUserId     String    @map("owner_user_id")
  zaloUid         String?   @unique @map("zalo_uid")
  displayName     String?   @map("display_name")
  avatarUrl       String?   @map("avatar_url")
  phone           String?
  status          String    @default("disconnected") // connected, disconnected, qr_pending
  sessionData     Json?     @map("session_data")
  lastConnectedAt DateTime? @map("last_connected_at")
  createdAt       DateTime  @default(now()) @map("created_at")

  org           Organization        @relation(fields: [orgId], references: [id], onDelete: Cascade)
  owner         User                @relation(fields: [ownerUserId], references: [id])
  access        ZaloAccountAccess[]
  conversations Conversation[]
  dailyStats    DailyMessageStat[]

  @@map("zalo_accounts")
}
```

### Key Fields
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key, auto-generated |
| `orgId` | String | Foreign key to Organization |
| `ownerUserId` | String | Foreign key to User (account owner) |
| `zaloUid` | String (unique) | Zalo user ID from Zalo API, null until login |
| `displayName` | String? | User-friendly name (e.g., "Zalo Sale Hương") |
| `avatarUrl` | String? | Avatar from Zalo profile |
| `phone` | String? | Phone number from Zalo profile |
| `status` | String | Connected/Disconnected/QR_pending |
| `sessionData` | JSON | Stores {cookie, imei, userAgent} for auto-reconnect |
| `lastConnectedAt` | DateTime? | Last successful connection timestamp |
| `createdAt` | DateTime | Account creation time |

### Related Models
- **Organization** (many-to-one): Every account belongs to one org
- **User** (owner): The creator/owner of the account
- **ZaloAccountAccess[]**: ACL for per-user permissions (read/chat/admin)
- **Conversation[]**: All chats through this account
- **DailyMessageStat[]**: Message statistics by date

---

## 2. BACKEND ROUTES/CONTROLLERS FOR CRUD

### Route Files

#### 2.1 Main Zalo Routes
**File:** `/Users/martin/conductor/workspaces/zalocrm/nashville/backend/src/modules/zalo/zalo-routes.ts` (lines 1-154)

| Method | Endpoint | Handler | Line | Purpose |
|--------|----------|---------|------|---------|
| GET | `/api/v1/zalo-accounts` | List with live status | 15-38 | Fetch all org's Zalo accounts, merge live status from pool |
| POST | `/api/v1/zalo-accounts` | Create account | 40-58 | Create new account record, init status='qr_pending' |
| POST | `/api/v1/zalo-accounts/:id/login` | Init QR login | 60-81 | Fire zaloPool.loginQR(), emit QR via Socket.IO |
| POST | `/api/v1/zalo-accounts/:id/reconnect` | Reconnect session | 83-112 | Use saved sessionData to reconnect |
| DELETE | `/api/v1/zalo-accounts/:id` | Delete account | 114-133 | Disconnect from pool, delete from DB |
| GET | `/api/v1/zalo-accounts/:id/status` | Get live status | 135-152 | Get current connection status from pool |

**All routes require:** `authMiddleware` (JWT auth)

#### 2.2 Access Control Routes
**File:** `/Users/martin/conductor/workspaces/zalocrm/nashville/backend/src/modules/zalo/zalo-access-routes.ts` (lines 1-121)

| Method | Endpoint | Handler | Line | Purpose | Role |
|--------|----------|---------|------|---------|------|
| GET | `/api/v1/zalo-accounts/:id/access` | List users | 20-34 | List all users with access to account | Any auth |
| POST | `/api/v1/zalo-accounts/:id/access` | Grant access | 37-68 | Add user with permission (read/chat/admin) | owner/admin |
| PUT | `/api/v1/zalo-accounts/:id/access/:accessId` | Update permission | 71-98 | Change user's permission level | owner/admin |
| DELETE | `/api/v1/zalo-accounts/:id/access/:accessId` | Revoke access | 101-119 | Remove user's access | owner/admin |

**Permissions:** read (view), chat (send), admin (manage)

#### 2.3 Sync Routes
**File:** `/Users/martin/conductor/workspaces/zalocrm/nashville/backend/src/modules/zalo/zalo-sync-routes.ts` (lines 1-76)

| Method | Endpoint | Handler | Line | Purpose |
|--------|----------|---------|------|---------|
| POST | `/api/v1/zalo-accounts/:id/sync-contacts` | Sync contacts | 17-75 | Fetch all Zalo friends via API, create/update CRM contacts |

**Calls:** `instance.api.getAllFriends()` → creates Contact records

---

## 3. FRONTEND COMPONENTS FOR ZALO ACCOUNTS

### Composable
**File:** `/Users/martin/conductor/workspaces/zalocrm/nashville/frontend/src/composables/use-zalo-accounts.ts` (lines 1-171)

#### Exports & State
```typescript
export interface ZaloAccount {
  id: string;
  displayName: string | null;
  zaloUid: string | null;
  status: string;
  liveStatus?: string;
  phone: string | null;
  sessionData: any;
  ownerUserId: string;
  createdAt: string;
}

// Main state refs:
const accounts = ref<ZaloAccount[]>([]);
const loading = ref(false);
const adding = ref(false);
const deleting = ref(false);
const showQRDialog = ref(false);
const qrImage = ref('');
const qrScanned = ref(false);
```

#### Key Functions
| Function | Line | Purpose |
|----------|------|---------|
| `fetchAccounts()` | 55-65 | GET /zalo-accounts, set accounts state |
| `addAccount(displayName)` | 67-79 | POST /zalo-accounts, create new |
| `loginAccount(accountId)` | 81-94 | POST /zalo-accounts/:id/login, setup Socket listener |
| `reconnectAccount(accountId)` | 96-103 | POST /zalo-accounts/:id/reconnect |
| `deleteAccount(account)` | 105-117 | DELETE /zalo-accounts/:id |
| `setupSocket()` | 124-159 | Connect Socket.IO, listen for 'zalo:*' events |

#### Socket.IO Event Handlers
- `zalo:qr` — Display QR code image
- `zalo:scanned` — Show "scanned" status + display name
- `zalo:connected` — Success, close dialog, refresh list
- `zalo:disconnected` — Account lost connection
- `zalo:error` — Login failed
- `zalo:qr-expired` — QR code expired
- `zalo:reconnect-failed` — Reconnect failed

### Main View Component
**File:** `/Users/martin/conductor/workspaces/zalocrm/nashville/frontend/src/views/ZaloAccountsView.vue` (lines 1-175)

#### Components
1. **Header** (lines 3-7): Title + "Thêm Zalo" button
2. **Data Table** (lines 10-33): Display accounts with live status
3. **Add Dialog** (lines 37-49): Form to add new account
4. **QR Dialog** (lines 51-75): Show QR code, scanned status
5. **Delete Dialog** (lines 77-88): Confirm deletion
6. **Access Dialog** (lines 91-95): Manage per-user permissions (child component)

#### Table Actions
- **Access Control** (line 17): `openAccess()` → opens ZaloAccessDialog
- **Sync Contacts** (line 20): `syncContacts()` → POST /zalo-accounts/:id/sync-contacts
- **Login QR** (line 23): Show QR if not connected
- **Reconnect** (line 26): If disconnected + has sessionData
- **Delete** (line 29): Remove account

#### Key Methods
| Method | Line | Purpose |
|--------|------|---------|
| `syncContacts(accountId)` | 132-142 | Call sync API, show result alert |
| `handleAddAccount()` | 144-150 | Call addAccount(), close dialog |
| `confirmDelete()` | 152-155 | Show delete confirmation |
| `openAccess()` | 157-160 | Show access control dialog |
| `handleDeleteAccount()` | 162-169 | Delete + refresh list |
| `onMounted()` | 171-174 | Fetch accounts, setup Socket |

### Access Control Dialog Component
**File:** `/Users/martin/conductor/workspaces/zalocrm/nashville/frontend/src/components/settings/ZaloAccessDialog.vue` (lines 1-196)

#### Features
- **List current access** (lines 13-44): Users with permissions, selectable dropdown to change
- **Add user** (lines 46-76): Select user + permission level, click "Thêm"
- **Remove access** (line 35): Delete button per user

#### API Calls
| Method | URL | Line | Purpose |
|--------|-----|------|---------|
| GET | `/zalo-accounts/:id/access` | 142 | Fetch access list |
| POST | `/zalo-accounts/:id/access` | 156 | Grant access |
| PUT | `/zalo-accounts/:id/access/:accessId` | 172 | Update permission |
| DELETE | `/zalo-accounts/:id/access/:accessId` | 181 | Revoke access |

---

## 4. ZALO API CALLS & HTTP CLIENT CONFIGURATION

### HTTP Client Setup (Frontend)
**File:** `/Users/martin/conductor/workspaces/zalocrm/nashville/frontend/src/api/index.ts` (lines 1-35)

```typescript
const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
});

// JWT interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      router.replace('/login');
    }
    return Promise.reject(error);
  },
);
```

**Key Details:**
- **Library:** axios
- **Base URL:** `/api/v1` (relative, proxied to backend)
- **Timeout:** 30 seconds
- **Auth:** Bearer token in Authorization header
- **Session:** Auto-redirect to login on 401

### Zalo SDK Integration (Backend)
**File:** `/Users/martin/conductor/workspaces/zalocrm/nashville/backend/src/modules/zalo/zalo-pool.ts` (lines 1-283)

#### SDK Loading
```typescript
// zca-js has no reliable ESM type exports — load via CJS interop
const require = createRequire(import.meta.url);
const { Zalo } = require('zca-js') as { Zalo: new (opts: { logging: boolean }) => any };
```

**SDK:** `zca-js` v2.x (imported via CommonJS interop for ESM)

#### Key API Methods Called
| Method | Line | Purpose |
|--------|------|---------|
| `zalo.loginQR({}, callback)` | 54 | Start QR login, get events |
| `zalo.login(credentials)` | 122 | Reconnect with saved session |
| `api.getOwnId()` | 85 | Get logged-in user's Zalo UID |
| `api.getUserInfo(uid)` | 90 | Fetch user profile {avatar, zaloName} |
| `api.getGroupInfo(groupId)` | 60 (factory) | Fetch group name |
| `api.sendMessage(msg, threadId, type)` | 138 (chat-routes) | Send message |
| `api.getAllFriends()` | 26 (sync-routes) | Get all friends list |
| `api.listener.start()` | 159 (factory) | Start listening for messages |

### Listener/Socket Setup
**File:** `/Users/martin/conductor/workspaces/zalocrm/nashville/backend/src/modules/zalo/zalo-listener-factory.ts` (lines 1-161)

#### Listener Events
```typescript
listener.on('connected', () => { /* connected */ });
listener.on('message', async (message) => { /* incoming message */ });
listener.on('undo', async (data) => { /* message deleted */ });
listener.on('closed', (code, reason) => { /* connection lost */ });
listener.on('error', (err) => { /* error */ });
listener.start({ retryOnClose: true });
```

#### User Info Cache
- **TTL:** 5 minutes (300,000 ms)
- **Scope:** Per-pool shared cache across all accounts
- **Purpose:** Reduce API calls for user profile resolution

### AI Provider HTTP Client Pattern (Example)
**File:** `/Users/martin/conductor/workspaces/zalocrm/nashville/backend/src/modules/ai/providers/anthropic.ts` (lines 1-35)

```typescript
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    authorization: `Bearer ${apiKey}`,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({ model, max_tokens: 600, system, messages: [...] }),
  signal: controller.signal,
});
```

**Pattern:** `fetch()` API with AbortController timeout (30s)

---

## 5. PROXY-RELATED CODE

### Socket.IO Real-time Proxy
**File:** `/Users/martin/conductor/workspaces/zalocrm/nashville/backend/src/app.ts` (lines 79-99)

```typescript
const io = new Server(app.server, {
  cors: {
    origin: config.isProduction ? config.appUrl : '*',
    credentials: true,
  },
});

app.decorate('io', io);
zaloPool.setIO(io); // Pass io to zalo pool for real-time event emission

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);
  socket.on('disconnect', () => {
    logger.debug(`Socket disconnected: ${socket.id}`);
  });
});
```

**Purpose:** Real-time events for:
- QR code delivery during login
- Message arrivals
- Account connection/disconnection status
- Error notifications

### Event Emission Pattern
**In zalo-pool.ts (lines 57, 64, 102, 151, etc.):**
```typescript
this.io?.to(`account:${accountId}`).emit('zalo:qr', { accountId, qrImage: ... });
this.io?.emit('zalo:connected', { accountId, zaloUid: ownId });
this.io?.emit('zalo:error', { accountId, error: String(err) });
```

### Message Sending Proxy (zaloPool → Zalo SDK)
**File:** `/Users/martin/conductor/workspaces/zalocrm/nashville/backend/src/modules/chat/chat-routes.ts` (lines 110-167)

```typescript
// User submits message via REST API
// Backend retrieves Zalo instance from pool
const instance = zaloPool.getInstance(conversation.zaloAccountId);
if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

// Rate limit check
const limits = zaloRateLimiter.checkLimits(conversation.zaloAccountId);
if (!limits.allowed) {
  return reply.status(429).send({ error: limits.reason });
}

// Send via Zalo SDK
await instance.api.sendMessage({ msg: content }, threadId, threadType);

// Log to DB + emit Socket.IO event
const message = await prisma.message.create({ ... });
io?.emit('chat:message', { accountId, message, conversationId: id });
```

**Rate Limiter:** `/Users/martin/conductor/workspaces/zalocrm/nashville/backend/src/modules/zalo/zalo-rate-limiter.ts`
- Prevents blocking (max 200 messages/day)
- Detects rapid sending

---

## 6. ARCHITECTURE OVERVIEW

### Request Flow: Login QR
```
Frontend                    Backend                     Zalo
  │                           │                          │
  ├─ POST /login ───────────> │                          │
  │                           ├─ zaloPool.loginQR() ────> (generate QR)
  │                           │                          │
  │ Subscribe to Socket        │                          │
  ├─ socket:subscribe ───────> │                          │
  │                           │ (emit QR via socket)      │
  │ <─ zalo:qr ────────────── │                          │
  │   (show QR image)         │                          │
  │                           │ (listen for events)       │
  │   User scans phone         │  <─ QRCodeScanned ────── │
  │                           ├─ emit zalo:scanned       │
  │ <─ zalo:scanned ───────── │                          │
  │                           │  <─ GotLoginInfo ─────── │
  │                           ├─ save sessionData to DB   │
  │                           ├─ api.getOwnId() ────────> │
  │ <─ zalo:connected ─────── │ <─ zaloUid ────────────- │
  │ (close dialog)            │ (update DB status)       │
```

### Request Flow: Send Message
```
Frontend                    Backend                     Zalo
  │                           │                          │
  ├─ POST /conversations/      │                          │
  │   :id/messages ───────────> (auth check)             │
  │                           │ (rate limit check)        │
  │                           ├─ getApi(accountId) ────> │
  │                           │ <─ sendMessage() ─────── │
  │                           │ (save to DB)             │
  │ <─ Success response ────── │                          │
  │                           ├─ emit Socket.IO event    │
  │ <─ socket: chat:message ─ │ (to all clients)        │
```

### Component Hierarchy
```
App
├── ZaloAccountsView (main view)
│   ├── useZaloAccounts() composable
│   ├── Data table (accounts list)
│   ├── Add dialog
│   ├── QR dialog (Socket.IO listener)
│   ├── Delete dialog
│   └── ZaloAccessDialog (child)
│       ├── Access list
│       ├── Add user form
│       └── API calls (GET/POST/PUT/DELETE)
```

---

## 7. KEY TECHNICAL DETAILS

### State Management
- **Frontend:** Vue 3 Composition API (refs + composables)
- **Backend:** Singleton ZaloAccountPool (in-memory, per process)
- **Persistence:** PostgreSQL (Prisma ORM)

### Authentication
- **Frontend → Backend:** JWT Bearer token in header
- **Public API:** X-API-Key header (AppSetting lookup)
- **Zalo SDK:** Cookie + IMEI + UserAgent (session-based)

### Real-time Communication
- **Socket.IO:** Bidirectional WebSocket for live events
- **QR Code Delivery:** Base64 image via socket event
- **Message Push:** Instant delivery via listener + socket emit

### Error Handling
- **Circuit Breaker:** >5 disconnects in 5 min → force QR re-login
- **Auto-reconnect:** 30-second delay after disconnect
- **Rate Limiting:** 200 messages/day per account

### Data Models
- **1:N Zalo → Contacts:** Via Message listeners create contacts on first message
- **Many:Many Zalo → Users:** Via ZaloAccountAccess (ACL)
- **1:N Zalo → Conversations:** Conversations group messages by thread

---

## 8. FILE PATHS & LINE NUMBERS (SUMMARY)

### Schema
- `backend/prisma/schema.prisma:75-95` — ZaloAccount model
- `backend/prisma/schema.prisma:98-110` — ZaloAccountAccess model

### Backend Routes
- `backend/src/modules/zalo/zalo-routes.ts:1-154` — CRUD endpoints
- `backend/src/modules/zalo/zalo-access-routes.ts:1-121` — Access control endpoints
- `backend/src/modules/zalo/zalo-sync-routes.ts:1-76` — Sync contacts endpoint
- `backend/src/modules/chat/chat-routes.ts:110-167` — Send message proxy

### Backend Core
- `backend/src/modules/zalo/zalo-pool.ts:1-283` — Zalo instance manager
- `backend/src/modules/zalo/zalo-listener-factory.ts:1-161` — Message listener
- `backend/src/modules/zalo/zalo-rate-limiter.ts` — Rate limiting
- `backend/src/app.ts:79-99` — Socket.IO setup
- `backend/src/modules/zalo/zalo-socket.ts` — Socket event handlers

### Frontend Composables
- `frontend/src/composables/use-zalo-accounts.ts:1-171` — Main composable

### Frontend Components
- `frontend/src/views/ZaloAccountsView.vue:1-175` — Main view
- `frontend/src/components/settings/ZaloAccessDialog.vue:1-196` — Access control
- `frontend/src/api/index.ts:1-35` — HTTP client (axios)

---

## 9. UNRESOLVED QUESTIONS

None identified. Architecture is clear and well-documented.

---

**Report Generated:** 2026-03-31 23:32
