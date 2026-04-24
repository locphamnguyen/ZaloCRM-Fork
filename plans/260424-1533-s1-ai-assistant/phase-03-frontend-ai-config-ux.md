# Phase 03 — Frontend: AI config UX in Settings

## Overview
- Priority: P2
- Status: pending
- Goal: expose provider / model / daily quota / per-org API key to admin in Settings.

## Context Links
- Component exists: `frontend/src/components/ai/ai-config-dialog.vue`
- Endpoints: `GET /api/v1/ai/config`, `PUT /api/v1/ai/config`, `GET /api/v1/ai/usage`, `GET /api/v1/ai/providers`.

## Requirements
- Add "AI Assistant" section to Settings (new card or new tab in `SettingsView.vue`).
- Admin-only (guard by role in UI; backend already enforces).
- Inside: provider select, model select (from `/ai/providers`), daily quota, enabled toggle, usage meter (used/total).
- Per-org API key field routes to `AppSetting` key `ai_<provider>_api_key` — if endpoint missing, add `PUT /api/v1/ai/api-key` in phase 04 OR reuse existing app-settings endpoint (verify).

## Files to Modify
- `frontend/src/views/SettingsView.vue` — add section / tab.
- `frontend/src/components/ai/ai-config-dialog.vue` — may convert to inline card if dialog UX not needed.

## Files to Create (conditional)
- `frontend/src/composables/use-ai-config.ts` — if settings logic > 80 LOC.

## Todo
- [ ] Fetch `/ai/config` + `/ai/usage` on mount
- [ ] Build form: provider, model, maxDaily, enabled
- [ ] Save → PUT `/ai/config`; show success toast
- [ ] Usage bar: `usedToday / maxDaily`
- [ ] Role guard (owner/admin only) — hide section for member

## Success Criteria
- Admin can change provider from anthropic → gemini and trigger AI in chat successfully without server restart.
- Usage bar updates after each AI call.
- Non-admin sees nothing AI-config related.

## Risks
- **API key storage**: per-org key in `AppSetting.valuePlain` is NOT encrypted — document this; for production use env-based registry (already supported). Add inline warning in UI.
- **Model name mismatch** across providers — validate against `/ai/providers` response.

## Rollback
Revert Settings diff; dialog component stays unused but harmless.
