# AI Configuration Flow Analysis — ZaloCRM Backend/Frontend

**Date:** 2026-03-31  
**Scope:** End-to-end AI configuration flow, from backend config loading to frontend UI to database storage  
**Status:** Complete

---

## 1. Backend AI Config Loading

### Config Entry Point
**File:** `backend/src/config/index.ts`

```typescript
export const config = {
  aiDefaultProvider: process.env.AI_DEFAULT_PROVIDER || 'anthropic',
  aiDefaultModel: process.env.AI_DEFAULT_MODEL || 'claude-sonnet-4-6',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  // ... other config
};
```

**Behavior:**
- Reads env vars **once at startup** → typed `config` singleton
- Provides fallback defaults (provider=`anthropic`, model=`claude-sonnet-4-6`)
- API keys stored in env or fetched per-org from DB (see §2.2)

---

## 2. Backend AI Service — Core Logic

### File: `backend/src/modules/ai/ai-service.ts`

#### 2.1 getAiConfig(orgId)
```typescript
export async function getAiConfig(orgId: string) {
  let aiConfig = await prisma.aiConfig.findUnique({ where: { orgId } });
  if (!aiConfig) {
    aiConfig = await prisma.aiConfig.create({
      data: { orgId, provider: config.aiDefaultProvider, model: config.aiDefaultModel, maxDaily: 500, enabled: true },
    });
  }
  const [anthropicKey, geminiKey] = await Promise.all([
    getProviderApiKey(orgId, 'anthropic'),
    getProviderApiKey(orgId, 'gemini'),
  ]);
  return {
    ...aiConfig,
    hasAnthropicKey: !!anthropicKey,
    hasGeminiKey: !!geminiKey,
  };
}
```

**Key Points:**
- **Auto-creates** AiConfig record if missing (uses env defaults)
- Returns config + flags indicating which provider keys are available
- Does **not return** actual API keys (security)

#### 2.2 getProviderApiKey(orgId, provider)
```typescript
async function getProviderApiKey(orgId: string, provider: string) {
  if (provider === 'anthropic') {
    if (config.anthropicApiKey) return config.anthropicApiKey;  // Env var first
    const setting = await prisma.appSetting.findFirst({ 
      where: { orgId, settingKey: 'ai_anthropic_api_key' } 
    });
    return setting?.valuePlain || '';  // Fallback to per-org DB
  }
  // ... same for gemini
}
```

**Lookup Precedence:**
1. Global env var (server-wide)
2. Per-org `AppSetting` with key `ai_anthropic_api_key` or `ai_gemini_api_key`

#### 2.3 updateAiConfig(orgId, input)
```typescript
export async function updateAiConfig(orgId: string, input: { provider?: string; model?: string; maxDaily?: number; enabled?: boolean }) {
  return prisma.aiConfig.upsert({
    where: { orgId },
    create: {
      orgId,
      provider: input.provider || config.aiDefaultProvider,
      model: input.model || config.aiDefaultModel,
      maxDaily: input.maxDaily ?? 500,
      enabled: input.enabled ?? true,
    },
    update: {
      provider: input.provider,
      model: input.model,
      maxDaily: input.maxDaily,
      enabled: input.enabled,
    },
  });
}
```

**Note:** Does **not** update API keys (separate concern)

#### 2.4 generateAiOutput(input)
```typescript
export async function generateAiOutput(input: { orgId: string; conversationId: string; type: AiTaskType; messageId?: string }) {
  const [currentConfig, conversation] = await Promise.all([
    getAiConfig(input.orgId),
    loadConversation(input.conversationId, input.orgId),
  ]);

  if (!currentConfig.enabled) throw new Error('AI is disabled for this organization');

  // Atomic quota check
  const withinQuota = await prisma.$transaction(async (tx) => {
    const usedToday = await tx.aiSuggestion.count({ where: { orgId: input.orgId, createdAt: { gte: startOfDay } } });
    return usedToday < currentConfig.maxDaily;
  });
  if (!withinQuota) throw new Error('AI daily quota exceeded');

  const apiKey = await getProviderApiKey(input.orgId, currentConfig.provider);
  if (!apiKey) throw new Error('AI provider key is not configured');

  // ... call generateText() with appropriate provider
}
```

**Workflow:**
1. Fetch config + verify enabled
2. Check daily quota (atomic transaction)
3. Fetch API key for current provider
4. Call provider-specific handler
5. Save suggestion to DB

---

## 3. AI Provider Implementations

### 3.1 Anthropic (`backend/src/modules/ai/providers/anthropic.ts`)

```typescript
export async function generateWithAnthropic(apiKey: string, model: string, system: string, prompt: string) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: controller.signal,  // 30s timeout
  });
  // ... parse response, extract text
}
```

**Key Fields:**
- `model` — e.g., `claude-sonnet-4-20250514`, `claude-3-5-sonnet-20241022`
- `apiKey` — Anthropic API key
- `system` — system prompt (language-specific)
- `prompt` — user input + conversation context

### 3.2 Gemini (`backend/src/modules/ai/providers/gemini.ts`)

```typescript
export async function generateWithGemini(apiKey: string, model: string, system: string, prompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
    }),
    signal: controller.signal,  // 30s timeout
  });
  // ... parse response
}
```

**Key Fields:**
- `model` — e.g., `gemini-2.5-flash`, `gemini-1.5-pro`
- `apiKey` — Google API key
- `systemInstruction` — system prompt
- `contents` — user input

---

## 4. Database Schema — AI Models

### AiConfig Model
```prisma
model AiConfig {
  id        String   @id @default(uuid())
  orgId     String   @unique @map("org_id")
  provider  String   @default("anthropic")       // 'anthropic' or 'gemini'
  model     String   @default("claude-sonnet-4-6")
  maxDaily  Int      @default(500) @map("max_daily")
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@map("ai_configs")
}
```

**Fields:**
- `provider` — 'anthropic' or 'gemini'
- `model` — model identifier (e.g., `claude-sonnet-4-20250514`)
- `maxDaily` — quota (requests/day)
- `enabled` — feature toggle (org-level)

### AiSuggestion Model
```prisma
model AiSuggestion {
  id             String    @id @default(uuid())
  orgId          String    @map("org_id")
  conversationId String    @map("conversation_id")
  messageId      String?   @map("message_id")
  type           String    // 'reply_draft', 'summary', 'sentiment'
  content        String    // JSON for sentiment, plain text for others
  confidence     Float
  accepted       Boolean   @default(false)
  createdAt      DateTime  @default(now()) @map("created_at")

  org          Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@map("ai_suggestions")
}
```

**Fields:**
- `type` — one of: `reply_draft`, `summary`, `sentiment`
- `content` — JSON (sentiment) or string (others)
- `accepted` — user feedback flag

### AppSetting Model (for per-org API keys)
```prisma
model AppSetting {
  id             String   @id @default(uuid())
  orgId          String   @map("org_id")
  settingKey     String   @map("setting_key")
  valuePlain     String?  @map("value_plain")      // For API keys
  valueEncrypted Bytes?   @map("value_encrypted")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([orgId, settingKey])
  @@map("app_settings")
}
```

**Usage for AI:**
- `settingKey: 'ai_anthropic_api_key'` → Anthropic API key
- `settingKey: 'ai_gemini_api_key'` → Google API key

---

## 5. Backend Routes — AI Endpoints

### File: `backend/src/modules/ai/ai-routes.ts`

#### GET `/api/v1/ai/config`
- Returns current org's AiConfig + `hasAnthropicKey` / `hasGeminiKey` flags
- Requires auth
- Auto-creates config if missing

#### PUT `/api/v1/ai/config`
- Updates `provider`, `model`, `maxDaily`, `enabled`
- Requires `owner` or `admin` role
- **Does NOT** accept API key updates (separate concern)

#### GET `/api/v1/ai/usage`
- Returns: `{ usedToday, maxDaily, remaining, enabled }`
- Counts `AiSuggestion` records created today

#### POST `/api/v1/ai/suggest`
- Generates reply draft for conversation
- Checks conversation access (Zalo ACL)
- Returns `{ content, confidence }`

#### POST `/api/v1/ai/summarize/:id`
- Generates summary of conversation
- Returns `{ content, confidence }`

#### POST `/api/v1/ai/sentiment/:id`
- Analyzes sentiment of conversation
- Returns `{ label: 'positive'|'neutral'|'negative', confidence, reason }`

---

## 6. Frontend AI Configuration

### File: `frontend/src/views/ApiSettingsView.vue`

#### Data Flow
1. **Load:** `api.get('/ai/config')` → populate form
2. **Display:** Shows provider, model, maxDaily, enabled status
3. **Save:** `api.put('/ai/config', { provider, model, maxDaily, enabled })`

#### Component: `AiConfigDialog`
```vue
<template>
  <v-dialog>
    <v-select v-model="local.provider" :items="providers" label="Provider" @update:model-value="onProviderChange" />
    <v-select v-model="local.model" :items="modelOptions" label="Model" />
    <v-text-field v-model.number="local.maxDaily" type="number" label="Quota mỗi ngày" :min="1" />
    <v-switch v-model="local.enabled" label="Bật AI" inset color="primary" />
  </v-dialog>
</template>
```

**Features:**
- Provider dropdown: `['anthropic', 'gemini']`
- Model options **keyed by provider** (auto-switches when provider changes)
- Quota validation (min 1)
- Enable/disable toggle

#### Supported Models

**Anthropic:**
- `claude-sonnet-4-20250514` (latest)
- `claude-3-5-sonnet-20241022`
- `claude-3-5-haiku-20241022`
- `claude-3-opus-20240229`

**Gemini:**
- `gemini-2.5-flash` (latest)
- `gemini-2.0-flash`
- `gemini-1.5-pro`
- `gemini-1.5-flash`

---

## 7. Environment Variables

### `.env.example`
```bash
# AI (Phase 6)
# AI_PROVIDER=claude
# ANTHROPIC_API_KEY=
# GEMINI_API_KEY=
```

**Current Status:**
- Commented out in `.env.example` (Phase 6 is optional)
- If set, these env vars override per-org DB keys

---

## 8. Current Implementation Status

### ✅ Implemented
- AiConfig DB model (stored per-org)
- Frontend dialog for provider/model/quota/enabled
- Backend routes: `/api/v1/ai/config` (GET/PUT)
- AI service: multi-provider abstraction (Anthropic, Gemini)
- Per-org API key storage (via AppSetting)
- Daily quota tracking (AiSuggestion count)
- Language detection (Vietnamese/English)
- Three task types: reply_draft, summary, sentiment

### ❌ NOT Implemented
- Per-org API key UI (frontend dialog to input/store keys)
- Anthropic/Gemini SDKs removed per Phase 1–3 refactor (using raw `fetch()`)
- Admin API key management endpoints

---

## 9. Configuration Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│ Startup: Load from Environment                              │
│ config.aiDefaultProvider = ANTHROPIC_API_KEY || 'anthropic' │
│ config.aiDefaultModel = AI_DEFAULT_MODEL || 'claude-...'    │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┴────────────────┐
         │                                │
         v                                v
┌─────────────────────┐         ┌──────────────────────┐
│ Global Config       │         │ Per-Org DB           │
│ (server-wide)       │         │ (AppSetting table)   │
│                     │         │                      │
│ - ANTHROPIC_API_KEY │         │ - ai_anthropic_...   │
│ - GEMINI_API_KEY    │         │ - ai_gemini_api_key  │
│ - AI_DEFAULT_*      │         │                      │
└─────────────────────┘         └──────────────────────┘
         │                                │
         └───────────────┬────────────────┘
                         │
                         v
         ┌───────────────────────────────┐
         │ getProviderApiKey(orgId)      │
         │ Returns: API key for provider │
         └───────────────┬───────────────┘
                         │
         ┌───────────────┴────────────────┐
         │                                │
         v                                v
┌─────────────────────┐         ┌──────────────────────┐
│ Anthropic           │         │ Gemini               │
│ .../v1/messages     │         │ .../generateContent  │
└─────────────────────┘         └──────────────────────┘
         │                                │
         └───────────────┬────────────────┘
                         │
                         v
         ┌───────────────────────────────┐
         │ Save AiSuggestion (DB)        │
         │ Track: type, content, conf... │
         └───────────────────────────────┘
```

---

## 10. Key Observations

### Architecture Decisions
1. **No SDK deps:** Uses raw `fetch()` to both Anthropic & Gemini APIs
2. **Per-org config:** Each organization can choose provider/model/quota independently
3. **Dual key storage:** Global env (server) + per-org DB (fallback)
4. **Lazy AiConfig creation:** Auto-created on first read using env defaults
5. **Atomic quota:** Uses Prisma `$transaction` to prevent TOCTOU race

### Missing Pieces (for Phase 7+)
1. **Admin API key management** — no endpoint to set `ai_anthropic_api_key` / `ai_gemini_api_key` in AppSetting
2. **Frontend key input dialog** — users can't paste API keys in UI (frontend has no form)
3. **Key validation** — no test before saving
4. **Usage analytics** — AiSuggestion counts per user, per type
5. **Cost tracking** — no per-provider cost calculation

---

## 11. Unresolved Questions

1. **API Key Input Flow:** How will admins set per-org keys if not via UI?
   - Need new endpoint: `PUT /api/v1/settings/ai-keys` ?
   - Need frontend form in ApiSettingsView?

2. **Env Var Precedence:** Should global env keys override DB keys or vice versa?
   - Current: env takes precedence (intentional for server-wide config)

3. **Key Expiry / Rotation:** Any mechanism to alert when keys are invalid/expired?
   - No validation logic currently

4. **Provider Switching:** If user switches provider but old key invalid, what happens?
   - Returns error "AI provider key is not configured" on generate call
   - Could validate at config save time

5. **Model Validation:** Do we validate that selected model exists for provider?
   - No — just sends to API, fails there if invalid

---

## Files Analyzed

| File | Purpose | Status |
|------|---------|--------|
| `backend/src/config/index.ts` | Config loader | ✅ |
| `backend/src/modules/ai/ai-service.ts` | Core logic | ✅ |
| `backend/src/modules/ai/ai-routes.ts` | API endpoints | ✅ |
| `backend/src/modules/ai/providers/anthropic.ts` | Anthropic integration | ✅ |
| `backend/src/modules/ai/providers/gemini.ts` | Gemini integration | ✅ |
| `backend/prisma/schema.prisma` | DB schema | ✅ |
| `frontend/src/views/ApiSettingsView.vue` | Settings page | ✅ |
| `frontend/src/components/ai/ai-config-dialog.vue` | Config form | ✅ |
| `.env.example` | Env template | ✅ |

---

**End of Report**
