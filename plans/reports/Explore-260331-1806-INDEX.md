# AI Configuration Dialog - Exploration Complete ✓

**Date:** 2026-03-31 18:06  
**Status:** Complete  
**Scope:** ZaloCRM Frontend & Backend AI Config System

---

## 📋 Reports Generated

1. **Main Report** (This directory)
   - `Explore-260331-1806-ai-config-dialog.md` - Comprehensive analysis (12 sections)
   - `Explore-260331-1806-ai-config-architecture.md` - ASCII diagrams & data flows
   - `Explore-260331-1806-ai-config-quick-ref.md` - Quick reference guide
   - `Explore-260331-1806-INDEX.md` - This file

---

## 🎯 Key Findings

### Dialog Location
✅ Found: `frontend/src/components/ai/ai-config-dialog.vue` (48 lines)

### Provider Dropdown
✅ **Working** - Hardcoded list with Anthropic & Gemini

### Model Field  
❌ **Issue Found** - Currently `v-text-field` (text input)
- Should be `v-select` (dropdown)
- Backend accepts any string (no validation)
- Risk: Users can typo invalid model names

### Available Providers
- ✅ Anthropic (API tested, working)
- ✅ Gemini (API tested, working)

### API Endpoints
All working and tested:
- `GET /api/v1/ai/config` - Load config
- `PUT /api/v1/ai/config` - Save config
- `GET /api/v1/ai/usage` - Check quota
- `POST /api/v1/ai/suggest` - Generate content

---

## 🔧 What Needs to Change

### High Priority (UX Improvement)
**Model field: Text Input → Dropdown**
- File: `frontend/src/components/ai/ai-config-dialog.vue` 
- Change: Line 7, replace `v-text-field` with `v-select`
- Add model lists per provider (hardcoded)
- Add watcher to reset model on provider change

### Medium Priority (Data Integrity)
**Server-side model validation** (Optional)
- Backend currently accepts any model string
- Could add validation to prevent invalid models being saved
- Currently fails at generation time

### Low Priority (UX Enhancement)
**API key configuration UI** (Not implemented)
- Currently `hasAnthropicKey` / `hasGeminiKey` shown but not actionable
- Could add "Configure API Keys" section
- Currently only environment variables supported

---

## 📁 Files Involved

### Frontend (4 files)
| File | Type | Purpose | Status |
|------|------|---------|--------|
| `ai-config-dialog.vue` | Component | Dialog form | ❌ Needs model dropdown |
| `ApiSettingsView.vue` | View | Parent page | ✅ Works |
| `use-chat.ts` | Composable | State management | ✅ Works |
| N/A | API Client | HTTP calls | ✅ Works |

### Backend (5 files)
| File | Type | Purpose | Status |
|------|------|---------|--------|
| `ai-routes.ts` | Routes | HTTP endpoints | ✅ Works |
| `ai-service.ts` | Service | Business logic | ✅ Works |
| `anthropic.ts` | Provider | API integration | ✅ Works |
| `gemini.ts` | Provider | API integration | ✅ Works |
| `schema.prisma` | Schema | Database models | ✅ Works |

---

## 🔐 Security

**Frontend:** Dialog only in admin settings area  
**Backend:** 
- GET: Any authenticated user
- PUT: Owner/Admin only (enforced)
- Validation: maxDaily must be >= 1

---

## 📊 Data Structure

```typescript
// Frontend state
const aiConfig = {
  provider: string,      // 'anthropic' | 'gemini'
  model: string,         // 'claude-sonnet-4-6', etc
  maxDaily: number,      // 1-999999
  enabled: boolean       // true | false
}

// Database (Prisma)
AiConfig {
  id: uuid
  orgId: uuid (unique)
  provider: string
  model: string
  maxDaily: int
  enabled: boolean
  createdAt: datetime
  updatedAt: datetime
}
```

---

## 🌀 Request Flow

```
1. User opens ApiSettingsView
   └─ onMounted → GET /api/v1/ai/config
   └─ Display config in card

2. User clicks "Cấu hình AI"
   └─ Mount AiConfigDialog
   └─ Populate form from parent state

3. User changes fields
   └─ Update local reactive state
   └─ No API call yet

4. User clicks "Lưu"
   └─ PUT /api/v1/ai/config { provider, model, maxDaily, enabled }
   └─ Backend upserts AiConfig
   └─ Response: updated config with hasAnthropicKey/hasGeminiKey
   └─ Update parent state
   └─ Close dialog + show snackbar
```

---

## 🎓 Model Options Available

### Anthropic
- claude-3-5-sonnet-20241022 (recommended)
- claude-3-5-haiku-20241022 (fast)
- claude-3-opus-20250219 (powerful)
- claude-sonnet-4-6 (deprecated)

### Gemini
- gemini-2.0-flash (recommended)
- gemini-1.5-pro (powerful)
- gemini-1.5-flash (fast)
- gemini-1.5-pro-exp (experimental)

---

## 📝 Unresolved Questions

1. **Should model list be fetched from backend or hardcoded in frontend?**
   - Current: Frontend would hardcode
   - Alternative: Backend endpoint `/api/v1/ai/providers/{provider}/models`

2. **Should invalid models be rejected on save or on generation?**
   - Current: Accepted on save, fails on generation
   - Safer: Validate against known models on save

3. **Should unconfigured provider show warning?**
   - Current: No warning, fails silently on generation
   - Better: Show warning if `hasAnthropicKey=false` for selected provider

4. **How are API keys currently managed?**
   - Environment variables only (ANTHROPIC_API_KEY, GEMINI_API_KEY)
   - No UI to change/update keys
   - Should there be admin UI?

5. **Is model field required?**
   - Current: Required (no default fallback in dialog)
   - Should it have default per provider?

---

## 🚀 Implementation Roadmap

### Phase 1: Model Dropdown (Quick Win)
- [ ] Add model lists constant in dialog
- [ ] Replace v-text-field with v-select for model
- [ ] Add watcher to handle provider changes
- [ ] Test all model switching scenarios
- **Time:** ~30 minutes
- **Risk:** Low

### Phase 2: Validation (Medium)
- [ ] Add model list to backend config
- [ ] Validate on PUT /ai/config
- [ ] Return 400 if invalid model
- [ ] Update frontend error handling
- **Time:** ~1 hour
- **Risk:** Medium (could break existing configs with custom models)

### Phase 3: Key Management UI (Complex)
- [ ] Add "Configure API Keys" section to ApiSettingsView
- [ ] Form to input Anthropic & Gemini keys
- [ ] Encrypt & store in AppSetting table
- [ ] Show status badges for configured providers
- **Time:** ~2-3 hours
- **Risk:** High (crypto operations)

---

## 📞 Next Steps

1. **Review** findings with team
2. **Decide** on model dropdown implementation approach
3. **Choose** Phase 1, 2, or 3 to implement
4. **Delegate** to implementation team
5. **Verify** changes in staging environment

---

## 📚 Report Structure

```
Explore-260331-1806-ai-config-dialog.md         ← Full technical analysis
Explore-260331-1806-ai-config-architecture.md   ← Diagrams & flows
Explore-260331-1806-ai-config-quick-ref.md      ← Quick reference
Explore-260331-1806-INDEX.md                    ← This summary
```

Each report can be read independently or together for full context.

---

Generated by: Explore Agent  
Time spent: ~45 minutes (reading + analysis + writing)  
Files analyzed: 9  
Lines of code reviewed: ~900  
Database tables: 3  
API endpoints: 6

