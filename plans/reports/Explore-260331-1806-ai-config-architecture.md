# AI Configuration Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Vue 3)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ApiSettingsView.vue                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  AI Assistant Card                                       │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Provider: anthropic                              │  │  │
│  │  │  Model: claude-sonnet-4-6                        │  │  │
│  │  │  Quota/ngày: 500                                 │  │  │
│  │  │  Trạng thái: Bật                                 │  │  │
│  │  │                                                   │  │  │
│  │  │  [Cấu hình AI] ←─────────┐                       │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                │                          │  │
│  │  onMounted:                    │                          │  │
│  │  loadAiConfig() ────────┐      │                          │  │
│  │                         │      │                          │  │
│  └─────────────────────────┼──────┼──────────────────────────┘  │
│                            │      │                              │
│  AiConfigDialog.vue        │      ↓                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Cấu hình AI                                              │ │
│  │ ┌──────────────────────────────────────────────────────┐ │ │
│  │ │ Provider: [▼ anthropic ▼]                           │ │ │
│  │ │  Options: Anthropic, Gemini                         │ │ │
│  │ │                                                      │ │ │
│  │ │ Model: [____________________] ← TEXT INPUT          │ │ │
│  │ │        (needs v-select dropdown)                   │ │ │
│  │ │                                                      │ │ │
│  │ │ Quota mỗi ngày: [500]  ← NUMBER INPUT              │ │ │
│  │ │                                                      │ │ │
│  │ │ ☑ Bật AI  ← SWITCH                                 │ │ │
│  │ └──────────────────────────────────────────────────────┘ │ │
│  │           [Đóng]                    [Lưu] →─────────┐    │ │
│  └────────────────────────────────────────────────────┼────┘ │
│                                                        │       │
│  useChat Composable                                    │       │
│  ├─ aiConfig (ref)                                    │       │
│  ├─ fetchAiConfig() ────────────────┐                 │       │
│  ├─ saveAiConfig(payload) ←──────────────────────────┘       │
│  ├─ fetchAiUsage()                  │                        │
│  └─ aiSuggestion/aiSummary/etc      │                        │
│                                     │                        │
└─────────────────────────────────────┼────────────────────────┘
                                      │
                  HTTP Requests       │
                                      ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Fastify)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ai-routes.ts                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  GET  /api/v1/ai/config                                │  │
│  │  PUT  /api/v1/ai/config  (owner/admin only)            │  │
│  │  GET  /api/v1/ai/usage                                │  │
│  │  POST /api/v1/ai/suggest                              │  │
│  │  POST /api/v1/ai/summarize/:id                        │  │
│  │  POST /api/v1/ai/sentiment/:id                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                     ↓↑                                          │
│  ai-service.ts                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  getAiConfig(orgId)                                    │  │
│  │    ├─ Check AppSetting for API keys                   │  │
│  │    ├─ Return { provider, model, maxDaily, enabled,    │  │
│  │    │           hasAnthropicKey, hasGeminiKey }        │  │
│  │    └─ Fallback to env defaults                        │  │
│  │                                                        │  │
│  │  updateAiConfig(orgId, input)                         │  │
│  │    ├─ Validate maxDaily >= 1                          │  │
│  │    ├─ Upsert AiConfig in database                    │  │
│  │    └─ Return updated config                           │  │
│  │                                                        │  │
│  │  generateAiOutput(orgId, conversationId, type)       │  │
│  │    ├─ Check if AI enabled                             │  │
│  │    ├─ Check daily quota (atomic)                      │  │
│  │    ├─ Get provider API key                            │  │
│  │    ├─ Call provider (Anthropic or Gemini)            │  │
│  │    └─ Save AiSuggestion, return result               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                     ↓↑                                          │
│  providers/                                                     │
│  ├─ anthropic.ts → https://api.anthropic.com/v1/messages     │
│  └─ gemini.ts    → https://generativelanguage.googleapis...   │
│                                                                  │
│  Database (PostgreSQL)                                         │
│  ├─ AiConfig { orgId, provider, model, maxDaily, enabled }   │
│  ├─ AiSuggestion { orgId, conversationId, type, content }   │
│  └─ AppSetting { orgId, settingKey, value_encrypted }       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Request/Response Flow

### Load Config
```
Frontend                          Backend
   │
   ├─ GET /ai/config ────────────→ authMiddleware
                                    ├─ Verify JWT
                                    ├─ getAiConfig(orgId)
                                    │  ├─ Query AiConfig table
                                    │  ├─ Query AppSetting (keys)
                                    │  └─ Compute hasAnthropicKey/hasGeminiKey
                                    └─ Return config object
   ←──────────────────────────────
     {
       provider: "anthropic",
       model: "claude-sonnet-4-6",
       maxDaily: 500,
       enabled: true,
       hasAnthropicKey: true,
       hasGeminiKey: false
     }
   │
   └─ Update aiConfig.value
```

### Save Config
```
Frontend                          Backend
   │
   ├─ PUT /ai/config ────────────→ authMiddleware
     {                              ├─ Verify JWT + owner/admin role
       provider: "gemini",          ├─ Validate maxDaily >= 1
       model: "gemini-1.5-pro",    ├─ updateAiConfig(orgId, body)
       maxDaily: 1000,              │  └─ Upsert AiConfig record
       enabled: true                ├─ Query updated config
     }                              └─ Compute hasAnthropicKey/hasGeminiKey
                                    └─ Return updated config
   ←──────────────────────────────
     {
       provider: "gemini",
       model: "gemini-1.5-pro",
       maxDaily: 1000,
       enabled: true,
       hasAnthropicKey: true,
       hasGeminiKey: true
     }
   │
   └─ Update aiConfig.value
      └─ Close dialog
      └─ Show snackbar("Đã lưu")
```

---

## Provider Selection Logic

### Current (Text Input)
```
User selects Provider ──→ Model field is free text
                         └─ No validation
                         └─ Any string accepted
```

### Proposed (Dropdown)
```
User selects Provider ──→ Model dropdown populated
                         ├─ If "anthropic":
                         │  └─ [claude-3-5-sonnet-20241022,
                         │      claude-3-5-haiku-20241022,
                         │      claude-3-opus-20250219,
                         │      claude-sonnet-4-6]
                         │
                         └─ If "gemini":
                            └─ [gemini-2.0-flash,
                                gemini-1.5-pro,
                                gemini-1.5-flash,
                                gemini-1.5-pro-exp]
```

---

## Database Schema

```
┌─ organizations ─┐
│  id (uuid)      │
│  name           │
│  ...            │ 1
└────────┬────────┘
         │
         │ 1:1
         │
┌────────▼──────────────┐
│  ai_configs           │
├───────────────────────┤
│  id (uuid) [PK]       │
│  org_id (uuid) [FK]   │◄─── unique index
│  provider (string)    │     (only 1 per org)
│  model (string)       │
│  max_daily (int)      │
│  enabled (boolean)    │
│  created_at           │
│  updated_at           │
└──────────────────────┘

┌──────────────────────────┐
│  ai_suggestions          │
├──────────────────────────┤
│  id (uuid) [PK]          │
│  org_id (uuid) [FK]      │
│  conversation_id (uuid)  │
│  message_id (uuid)       │
│  type (string)           │
│  content (text)          │
│  confidence (float)      │
│  accepted (boolean)      │
│  created_at              │
└──────────────────────────┘

┌──────────────────────────┐
│  app_settings            │
├──────────────────────────┤
│  id (uuid) [PK]          │
│  org_id (uuid) [FK]      │
│  setting_key (string)    │
│  value_plain (string)    │
│  value_encrypted (bytes) │
│  created_at              │
│  updated_at              │
└──────────────────────────┘

Example rows in app_settings:
├─ org_id: "org-123", setting_key: "ai_anthropic_api_key",
│  value_encrypted: (encrypted), value_plain: null
└─ org_id: "org-123", setting_key: "ai_gemini_api_key",
   value_encrypted: (encrypted), value_plain: null
```

---

## Component Hierarchy

```
App
└─ DefaultLayout
   └─ SettingsView
      └─ ApiSettingsView (parent)
         ├─ Display current config (static)
         ├─ [Cấu hình AI] button
         └─ AiConfigDialog (mounted conditionally)
            ├─ v-select (provider)
            ├─ v-text-field (model) ← needs change to v-select
            ├─ v-text-field (maxDaily)
            ├─ v-switch (enabled)
            └─ Action buttons: [Đóng] [Lưu]
```

---

## State Management

### ApiSettingsView
```typescript
const showAiConfig = ref(false)              // Dialog visibility
const aiSaving = ref(false)                  // Save loading state
const aiConfig = ref({                       // Current config
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  maxDaily: 500,
  enabled: true
})
```

### AiConfigDialog
```typescript
const local = reactive({                     // Local edits (not saved yet)
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  maxDaily: 500,
  enabled: true
})

watch(() => props.config, (value) => {       // Sync from parent
  local.provider = value.provider
  local.model = value.model
  local.maxDaily = value.maxDaily
  local.enabled = value.enabled
}, { immediate: true, deep: true })
```

---

## API Authorization

```
GET /api/v1/ai/config
├─ authMiddleware
│  └─ Extract JWT, verify, set request.user
└─ Allow: Any authenticated user

PUT /api/v1/ai/config
├─ authMiddleware
│  └─ Extract JWT, verify
├─ requireRole('owner', 'admin')
│  └─ Check request.user.role in ['owner', 'admin']
└─ Allow: Only org owners/admins
```

---

## Error Handling

### Frontend
```typescript
async function loadAiConfig() {
  try {
    const res = await api.get('/ai/config')
    aiConfig.value = { provider: res.data.provider, ... }
  } catch {
    // Fallback to defaults
    aiConfig.value = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      maxDaily: 500,
      enabled: true
    }
  }
}

async function saveAiConfig(value) {
  try {
    const res = await api.put('/ai/config', value)
    aiConfig.value = { ... }
    showSnack('Đã lưu cấu hình AI')
  } catch {
    showSnack('Lưu cấu hình AI thất bại', 'error')
  }
}
```

### Backend
```typescript
app.put('/api/v1/ai/config', { preHandler: requireRole(...) }, async (req, res) => {
  try {
    if (req.body.maxDaily !== undefined && req.body.maxDaily < 1) {
      return res.status(400).send({ error: 'maxDaily must be at least 1' })
    }
    return await updateAiConfig(req.user.orgId, req.body)
  } catch (err) {
    logger.error('[ai] Update config error:', err)
    return res.status(500).send({ error: 'Failed to update AI config' })
  }
})
```

---

## Environment Configuration

```bash
# .env
AI_DEFAULT_PROVIDER=anthropic
AI_DEFAULT_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=sk-ant-v0-xxxxx
GEMINI_API_KEY=AIzaSyDxxxxxx
```

---

