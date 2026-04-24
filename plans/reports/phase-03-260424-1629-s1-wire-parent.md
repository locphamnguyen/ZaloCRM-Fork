# Phase 03 — Wire Parent Components + Verify Settings

## Files Modified
- `frontend/src/composables/use-chat.ts` — added `aiSentimentError` ref, expose in return, clear in `clearAiState`, capture in `generateAiSentiment`
- `frontend/src/views/ChatView.vue` — destructure `aiSentimentError` + `aiUsage` from useChat; pass both as props to `<ChatContactPanel>`
- `frontend/src/components/chat/ChatContactPanel.vue` — import `AiUsageInfo`; add `aiSentimentError?` + `aiUsage?` to defineProps; wire `:usage="aiUsage"` to `<AiSummaryCard>`; wire `:error="aiSentimentError"` + `@retry="$emit('refresh-ai-sentiment')"` to `<AiSentimentBadge>`

## Tasks

- [x] Task 1 — Quota badge: `aiUsage` already existed in useChat (line 72). Added to ChatView destructure → passed as `:ai-usage` prop → ChatContactPanel wires to `<AiSummaryCard :usage="aiUsage">`
- [x] Task 2 — Sentiment retry: added `aiSentimentError` ref to useChat; `generateAiSentiment` now captures `err.response?.data?.error`; `clearAiState` resets it; wired `:error` + `@retry` on `<AiSentimentBadge>`
- [x] Task 3 — Settings verify: `ApiSettingsView.vue` already mounts `<AiConfigDialog>` with full config read/write. Route `/api-settings` exists in router + sidebar nav "API & Webhook". No changes needed.

## Type Check
- `cd frontend && npx vue-tsc --noEmit` → **PASS** (no output)
- `cd backend && npx tsc --noEmit` → pre-existing errors in `ai-routes.test.ts` + `ai-service.test.ts` (on branch before this work, confirmed via git stash test). No new errors introduced.

**Status:** DONE
