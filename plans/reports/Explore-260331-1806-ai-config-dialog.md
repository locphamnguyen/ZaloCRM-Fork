# AI Configuration Dialog - Codebase Exploration Report

**Date:** 2026-03-31 | **Time:** 18:06  
**Status:** Complete  
**Scope:** Frontend & Backend AI Configuration System

---

## Executive Summary

Found complete AI config implementation across frontend & backend. Dialog is Vue 3 component with hardcoded provider dropdown. Model field is currently **text input** (needs conversion to dropdown). All 4 integration points identified below.

---

## 1. Frontend: Dialog Component

**Location:** `frontend/src/components/ai/ai-config-dialog.vue`

### Structure
```vue
<template>
  <v-dialog max-width="520">
    <v-card>
      <!-- Provider dropdown (SELECT) -->
      <v-select v-model="local.provider" :items="providers" label="Provider" />
      
      <!-- Model field (TEXT INPUT - NEEDS CHANGE) -->
      <v-text-field v-model="local.model" label="Model" />
      
      <!-- Daily quota (NUMBER INPUT) -->
      <v-text-field v-model.number="local.maxDaily" type="number" label="Quota mỗi ngày" />
      
      <!-- Enable/disable toggle (SWITCH) -->
      <v-switch v-model="local.enabled" label="Bật AI" />
    </v-card>
  </v-dialog>
</template>
```

### Provider List (Hardcoded)
```typescript
const providers = [
  { title: 'Anthropic', value: 'anthropic' },
  { title: 'Gemini', value: 'gemini' },
];
```

### Data Flow
- Props: `modelValue` (dialog open/close), `loading`, `config` object
- Emits: `update:modelValue`, `save` event with config
- Internal state: `local` reactive object (provider, model, maxDaily, enabled)

### Key Issue
**Model field is `v-text-field`** - users type free text. Should be `v-select` with dynamic model options per provider.

---

## 2. Frontend: Parent Component (ApiSettingsView)

**Location:** `frontend/src/views/ApiSettingsView.vue`

### Integration Points

#### A. Dialog Trigger
```vue
<v-btn color="primary" variant="outlined" @click="showAiConfig = true">
  Cấu hình AI
</v-btn>
```

#### B. Config Display
```vue
<div class="text-body-2">Provider: <strong>{{ aiConfig.provider }}</strong></div>
<div class="text-body-2">Model: <strong>{{ aiConfig.model }}</strong></div>
<div class="text-body-2">Quota/ngày: <strong>{{ aiConfig.maxDaily }}</strong></div>
<div class="text-body-2">Trạng thái: <strong>{{ aiConfig.enabled ? 'Bật' : 'Tắt' }}</strong></div>
```

#### C. Dialog Mount
```vue
<AiConfigDialog
  v-model="showAiConfig"
  :loading="aiSaving"
  :config="aiConfig"
  @save="saveAiConfig"
/>
```

#### D. Config State
```typescript
const aiConfig = ref({
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  maxDaily: 500,
  enabled: true,
});
```

### Lifecycle Hooks
```typescript
onMounted(async () => {
  await Promise.all([loadApiKey(), loadWebhook(), loadAiConfig()]);
});
```

---

## 3. Frontend: Composable (useChat)

**Location:** `frontend/src/composables/use-chat.ts`

### AI Config Interface
```typescript
export interface AiConfig {
  provider: string;
  model: string;
  maxDaily: number;
  enabled: boolean;
  hasAnthropicKey?: boolean;  // Indicates if provider key configured
  hasGeminiKey?: boolean;     // Indicates if provider key configured
}
```

### Config State Management
```typescript
const aiConfig = ref<AiConfig>({
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  maxDaily: 500,
  enabled: true,
});
```

### Methods
- `fetchAiConfig()` - GET `/ai/config`, populate aiConfig state
- `saveAiConfig(payload)` - PUT `/ai/config`, update state from response
- `fetchAiUsage()` - GET `/ai/usage`, check quota remaining

---

## 4. Backend: Routes

**Location:** `backend/src/modules/ai/ai-routes.ts`

### Endpoints

#### GET `/api/v1/ai/config`
- **Auth:** Required (authMiddleware)
- **Response:** 
  ```typescript
  {
    provider: string,
    model: string,
    maxDaily: number,
    enabled: boolean,
    hasAnthropicKey: boolean,  // Server-computed
    hasGeminiKey: boolean      // Server-computed
  }
  ```
- **Implementation:** Calls `getAiConfig(orgId)`

#### PUT `/api/v1/ai/config`
- **Auth:** Required (owner/admin only)
- **Request Body:**
  ```typescript
  {
    provider?: string,
    model?: string,
    maxDaily?: number,
    enabled?: boolean
  }
  ```
- **Validation:** `maxDaily >= 1`
- **Response:** Updated config object
- **Implementation:** Calls `updateAiConfig(orgId, body)`

#### POST `/api/v1/ai/usage`
- Returns remaining quota for current org

#### POST `/api/v1/ai/suggest`, `/ai/summarize/:id`, `/ai/sentiment/:id`
- AI generation endpoints (consume quota)

---

## 5. Backend: Service Logic

**Location:** `backend/src/modules/ai/ai-service.ts`

### Key Functions

#### `getAiConfig(orgId: string)`
```typescript
// Returns config with hasAnthropicKey/hasGeminiKey computed
// Falls back to defaults if not found:
//  - provider: config.aiDefaultProvider (from env)
//  - model: config.aiDefaultModel (from env)
```

#### `updateAiConfig(orgId: string, input)`
```typescript
// Upserts AiConfig in database
// Allows partial updates
// Validates maxDaily >= 1
```

#### `getAiUsage(orgId: string)`
```typescript
// Counts AI suggestions created today
// Returns: { usedToday, maxDaily, remaining, enabled }
```

#### `generateAiOutput(input)`
```typescript
// Called by /ai/suggest, /ai/summarize, /ai/sentiment
// Key checks:
// 1. AI enabled?
// 2. Within daily quota? (atomic transaction)
// 3. Provider API key configured?
// 4. Call appropriate provider (Anthropic or Gemini)
```

---

## 6. Backend: Database Schema

**Location:** `backend/prisma/schema.prisma`

### AiConfig Model
```prisma
model AiConfig {
  id        String   @id @default(uuid())
  orgId     String   @unique @map("org_id")
  provider  String   @default("anthropic")
  model     String   @default("claude-sonnet-4-6")
  maxDaily  Int      @default(500) @map("max_daily")
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
}
```

### Related Models
- **AiSuggestion** - Records each AI call (for quota tracking)
- **AppSetting** - Stores API keys per org:
  - `ai_anthropic_api_key`
  - `ai_gemini_api_key`

---

## 7. Provider Support & Models

### Backend Providers

#### Anthropic
**File:** `backend/src/modules/ai/providers/anthropic.ts`
- Endpoint: `https://api.anthropic.com/v1/messages`
- Default Model: `claude-sonnet-4-6` (from config.aiDefaultModel)
- Timeout: 30 seconds
- Max tokens: 600

#### Gemini
**File:** `backend/src/modules/ai/providers/gemini.ts`
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Model passed dynamically in URL
- Timeout: 30 seconds
- Max tokens: 600

### Configuration

**File:** `backend/src/config/index.ts`
```typescript
{
  aiDefaultProvider: process.env.AI_DEFAULT_PROVIDER || 'anthropic',
  aiDefaultModel: process.env.AI_DEFAULT_MODEL || 'claude-sonnet-4-6',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
}
```

### Key Finding
**No built-in model list.** Backend accepts ANY model string - doesn't validate against provider's available models. Frontend should fetch/hardcode model options per provider.

---

## 8. Current Data Flow

```
ApiSettingsView (parent)
    │
    ├─ onMounted
    │   └─ loadAiConfig() ──GET /api/v1/ai/config─→ Backend
    │       └─ Sets aiConfig.value with current config
    │
    ├─ Click "Cấu hình AI"
    │   └─ showAiConfig = true
    │   └─ Mounts AiConfigDialog
    │
    ├─ User changes Provider/Model/Quota/Enabled in dialog
    │   └─ Updates local reactive state
    │
    ├─ Click "Lưu"
    │   └─ emit('save', local)
    │   └─ saveAiConfig(local)
    │       └─ PUT /api/v1/ai/config { provider, model, maxDaily, enabled }
    │       └─ Response updates aiConfig.value
    │       └─ showSnack('Đã lưu cấu hình AI')
    │       └─ closeDialog
    │
    └─ Display updated config
        └─ Provider: {aiConfig.provider}
        └─ Model: {aiConfig.model}
        └─ Quota/ngày: {aiConfig.maxDaily}
        └─ Trạng thái: {aiConfig.enabled ? 'Bật' : 'Tắt'}
```

---

## 9. Security & Permissions

### Frontend
- Dialog only shown in **ApiSettingsView** (settings/admin area)
- No explicit permission check in Vue

### Backend
- **GET /ai/config:** Requires auth (any user can read)
- **PUT /ai/config:** Requires auth + `owner` OR `admin` role
  - Only org owners/admins can modify AI config
- API keys stored in **AppSetting** table (encrypted via `valueEncrypted` field)

---

## 10. File Inventory

| File Path | Type | Purpose |
|-----------|------|---------|
| `frontend/src/components/ai/ai-config-dialog.vue` | Vue 3 Component | Config dialog with provider select & model text input |
| `frontend/src/views/ApiSettingsView.vue` | Vue 3 View | Parent page that mounts dialog & displays config |
| `frontend/src/composables/use-chat.ts` | Composable | AI state management & API calls |
| `backend/src/modules/ai/ai-routes.ts` | Express Routes | HTTP endpoints for config CRUD & generation |
| `backend/src/modules/ai/ai-service.ts` | Service | Business logic (CRUD, quota checks, generation) |
| `backend/src/modules/ai/providers/anthropic.ts` | Provider | Anthropic API integration |
| `backend/src/modules/ai/providers/gemini.ts` | Provider | Gemini API integration |
| `backend/src/config/index.ts` | Config | Environment variable loader |
| `backend/prisma/schema.prisma` | Schema | Database models (AiConfig, AiSuggestion, AppSetting) |

---

## 11. Model Options Per Provider

**Current Behavior:** Frontend accepts any text in model field.

### Observed Default Models
- **Anthropic:** `claude-sonnet-4-6`
- **Gemini:** (Not specified in config; depends on Google's API)

### Recommended Model Lists (based on 2026 API docs)

#### Anthropic Claude Models
- claude-3-5-sonnet-20241022
- claude-3-5-haiku-20241022
- claude-3-opus-20250219
- claude-sonnet-4-6 (legacy)

#### Gemini Models
- gemini-2.0-flash
- gemini-1.5-pro
- gemini-1.5-flash
- gemini-1.5-pro-exp

---

## 12. Unresolved Questions

1. **Should model options be hardcoded in frontend or fetched from backend?**
   - Currently frontend hardcodes provider list but not model list
   - Consider adding `/api/v1/ai/providers/{provider}/models` endpoint if models need to be managed centrally

2. **How are API keys configured for providers?**
   - Assumed to be environment variables (ANTHROPIC_API_KEY, GEMINI_API_KEY)
   - Stored in AppSetting table but no UI to edit them
   - Need verification of key management flow

3. **What happens if user selects provider without API key configured?**
   - API call fails with "AI provider key is not configured"
   - Frontend shows `hasAnthropicKey` / `hasGeminiKey` but doesn't use them in UI
   - No warning if user saves config with unconfigured provider

4. **Should there be model validation?**
   - Backend accepts any model string without validating against provider's actual models
   - Could fail at generation time if invalid model specified

5. **Is the model field searchable/filterable?**
   - Current text input doesn't support search
   - Dropdown would be better UX for many options

---

## Summary: What Needs to Change

✅ **Currently Working:**
- Provider dropdown (fixed list)
- Quota field
- Enable/disable toggle
- Save/load config via API
- Quota tracking
- Permission controls

❌ **Needs Enhancement:**
- Model field: Text input → Dropdown (get dynamic list per provider)
- Error handling: Show warning if provider key not configured
- Validation: Validate model exists before save (optional)

---

