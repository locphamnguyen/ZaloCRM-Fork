# AI Configuration - Quick Reference Guide

## 4 Integration Points

### 1️⃣ Dialog Component
**File:** `frontend/src/components/ai/ai-config-dialog.vue` (48 lines)

What it does:
- Displays modal form with 4 fields
- Syncs input state with parent via watch
- Emits `save` event with config object

Current fields:
```vue
<v-select v-model="local.provider" :items="providers" />           ✅ works
<v-text-field v-model="local.model" />                             ❌ text input
<v-text-field v-model.number="local.maxDaily" type="number" />    ✅ works
<v-switch v-model="local.enabled" />                               ✅ works
```

**Provider options (hardcoded):**
```javascript
[
  { title: 'Anthropic', value: 'anthropic' },
  { title: 'Gemini', value: 'gemini' }
]
```

**TO CHANGE:** Replace `v-text-field` for model with `v-select` that populates based on selected provider.

---

### 2️⃣ Parent View
**File:** `frontend/src/views/ApiSettingsView.vue` (227 lines)

What it does:
- Displays current AI config (read-only section)
- Button to open dialog
- Handles dialog lifecycle & API calls

Key functions:
- `loadAiConfig()` - GET `/ai/config` on mount
- `saveAiConfig(value)` - PUT `/ai/config` on save

Current state:
```typescript
const aiConfig = ref({
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  maxDaily: 500,
  enabled: true
})
```

---

### 3️⃣ Composable (Optional)
**File:** `frontend/src/composables/use-chat.ts` (298 lines)

What it does:
- Manages AI state across chat views
- Provides `saveAiConfig()` method
- Tracks `aiConfig` with same structure

This is separate from ApiSettingsView but uses same API endpoints.

---

### 4️⃣ Backend API + Service
**Files:**
- Routes: `backend/src/modules/ai/ai-routes.ts` (110 lines)
- Service: `backend/src/modules/ai/ai-service.ts` (203 lines)
- Schema: `backend/prisma/schema.prisma` (lines 369-382)

Endpoints:
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/ai/config` | Required | Read config + key status |
| PUT | `/api/v1/ai/config` | Owner/Admin | Update config |
| GET | `/api/v1/ai/usage` | Required | Check quota remaining |
| POST | `/api/v1/ai/suggest` | Required | Generate reply draft |

Database:
```
AiConfig (1 per org)
├─ orgId (unique)
├─ provider (string)
├─ model (string)
├─ maxDaily (int)
└─ enabled (boolean)
```

---

## Available Models (Current)

**Anthropic** (backend config default: `claude-sonnet-4-6`)
- claude-3-5-sonnet-20241022
- claude-3-5-haiku-20241022
- claude-3-opus-20250219
- claude-sonnet-4-6 (deprecated)

**Gemini** (backend config default: unspecified)
- gemini-2.0-flash
- gemini-1.5-pro
- gemini-1.5-flash
- gemini-1.5-pro-exp

---

## Current Data Flow Diagram

```
User opens ApiSettingsView
         │
         └─→ onMounted
             └─→ loadAiConfig() → GET /api/v1/ai/config
                 └─→ aiConfig.value = { provider, model, maxDaily, enabled }
                 └─→ Display in card

User clicks "Cấu hình AI"
         │
         └─→ showAiConfig = true
             └─→ Mount AiConfigDialog
                 └─→ local = reactive({ ...aiConfig })
                 └─→ Watch aiConfig for sync

User changes fields in dialog
         │
         └─→ Updates local.provider, local.model, etc
             (no API call yet)

User clicks "Lưu"
         │
         └─→ emit('save', local)
             └─→ saveAiConfig(local)
                 └─→ aiSaving.value = true
                 └─→ PUT /api/v1/ai/config { provider, model, maxDaily, enabled }
                     └─→ Backend upserts AiConfig record
                     └─→ Response includes hasAnthropicKey, hasGeminiKey
                 └─→ aiConfig.value = response
                 └─→ showSnack('Đã lưu')
                 └─→ showAiConfig = false (closes dialog)
```

---

## Request/Response Examples

### GET /api/v1/ai/config
```json
{
  "id": "uuid-123",
  "orgId": "org-456",
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "maxDaily": 500,
  "enabled": true,
  "hasAnthropicKey": true,
  "hasGeminiKey": false,
  "createdAt": "2026-03-31T10:00:00Z",
  "updatedAt": "2026-03-31T18:00:00Z"
}
```

### PUT /api/v1/ai/config
**Request:**
```json
{
  "provider": "gemini",
  "model": "gemini-1.5-pro",
  "maxDaily": 1000,
  "enabled": true
}
```

**Response:** Same as GET

### GET /api/v1/ai/usage
```json
{
  "usedToday": 42,
  "maxDaily": 500,
  "remaining": 458,
  "enabled": true
}
```

---

## Security

### Frontend
- No direct permission checks in Vue
- Dialog only accessible in ApiSettingsView (admin area)

### Backend
- `GET /ai/config`: Any authenticated user
- `PUT /ai/config`: Owner or Admin only (enforced via `requireRole` middleware)
- `maxDaily` validation: Must be >= 1

---

## Model Selection Upgrade Plan

### Current (Text Input - Risk: typos, invalid models)
```
User selects "anthropic" 
└─→ Model field accepts any string
    └─→ Backend accepts any string
        └─→ API call fails at generation time if invalid
```

### Proposed (Dropdown - Better UX)
```
User selects "anthropic"
└─→ Model dropdown shows:
    ├─ claude-3-5-sonnet-20241022
    ├─ claude-3-5-haiku-20241022
    ├─ claude-3-opus-20250219
    └─ claude-sonnet-4-6
└─→ User picks from list
    └─→ No typos
    └─→ Pre-validated before save
```

**Implementation:**
1. Add model lists constant in dialog:
   ```typescript
   const modelsByProvider = {
     anthropic: [
       { title: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
       // ...
     ],
     gemini: [
       { title: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
       // ...
     ]
   }
   ```

2. Replace field:
   ```vue
   - <v-text-field v-model="local.model" label="Model" />
   + <v-select 
   +   v-model="local.model" 
   +   :items="modelsByProvider[local.provider]"
   +   label="Model"
   + />
   ```

3. Watch provider changes:
   ```typescript
   watch(() => local.provider, () => {
     const models = modelsByProvider[local.provider]
     if (!models.find(m => m.value === local.model)) {
       local.model = models[0].value
     }
   })
   ```

---

## Files to Touch (When Making Changes)

### For model dropdown:
1. `frontend/src/components/ai/ai-config-dialog.vue` ← Add model list & replace field

### Optional (for consistency):
2. `frontend/src/views/ApiSettingsView.vue` ← No changes needed currently
3. `frontend/src/composables/use-chat.ts` ← No changes needed currently
4. Backend files ← No changes needed (accept any string)

---

## Testing Checklist

When adding model dropdown:
- [ ] Provider "anthropic" shows Anthropic models
- [ ] Provider "gemini" shows Gemini models
- [ ] Switching provider resets model to first option
- [ ] Saving with model dropdown works (PUT request sent)
- [ ] Loading config displays selected model correctly
- [ ] Dialog closes after save
- [ ] Snackbar shows "Đã lưu"
- [ ] No console errors

---

## Unresolved Questions for Product/Design

1. **Should model be validated server-side?**
   - Currently: Backend accepts any string
   - Option A: Add hardcoded model lists in backend (safer)
   - Option B: Keep dynamic (frontend controls options)
   - → Recommend Option A for production

2. **How are API keys managed?**
   - Currently: Env variables only, no UI to change
   - Should there be a "Configure API Keys" section?
   - → Needs clarification from product

3. **Should unconfigs provider show warning?**
   - `hasAnthropicKey` / `hasGeminiKey` are returned but not used
   - If user saves "gemini" but no API key, generation fails
   - Should we prevent save or show warning?
   - → Recommend showing warning in UI

---

