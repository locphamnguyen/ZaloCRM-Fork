# Phase 02 — Frontend: summary + sentiment wiring

## Overview
- Priority: P2
- Status: pending
- Goal: surface `AiSummaryCard` + `AiSentimentBadge` in chat view so user can trigger summary/sentiment on active conversation.

## Context Links
- Endpoints: `POST /api/v1/ai/summarize/:id`, `POST /api/v1/ai/sentiment/:id`
- `use-chat.ts` currently only calls `/ai/suggest`.

## Requirements
- Add `summarize(conversationId)` + `analyzeSentiment(conversationId)` functions to `use-chat.ts` (or new `use-ai.ts` if cleaner — choose by LOC budget).
- Extend `AiSuggestionPanel.vue` OR add slot area in `MessageThread.vue` sidebar showing:
  - "Tóm tắt hội thoại" button → invokes summarize, renders `AiSummaryCard`.
  - "Phân tích cảm xúc" button → invokes sentiment, renders `AiSentimentBadge`.
- Loading + error states (Vietnamese strings, matches existing style).
- Respect 503 (quota/disabled) → show friendly Vietnamese message.

## Files to Modify
- `frontend/src/composables/use-chat.ts` (or new `use-ai.ts` if > 200 LOC risk)
- `frontend/src/components/chat/MessageThread.vue` (mount 2 new trigger buttons + cards)
- `frontend/src/components/ai/ai-suggestion-panel.vue` (only if panel needs to host new cards)

## Files to Create (optional)
- `frontend/src/composables/use-ai.ts` — if `use-chat.ts` grows past 200 LOC, split AI calls out.

## Todo
- [ ] Add `summarize` / `analyzeSentiment` calls with typed responses
- [ ] Mount trigger buttons near existing "Ask AI" action
- [ ] Bind results to `AiSummaryCard` / `AiSentimentBadge` props
- [ ] Handle 429/503 errors with v-snackbar
- [ ] Manual smoke test: real conversation → trigger each → verify render

## Success Criteria
- User can click → see summary within ~3s.
- Sentiment badge shows label (positive/neutral/negative) + reason tooltip.
- No console errors; loading skeleton visible during request.

## Risks
- **Sentiment JSON parse failure** on provider side already handled in `ai-service.ts` (fallback neutral) — frontend must tolerate any shape.
- **Stale cache**: sentiment is per-conversation, refresh on conversation switch.

## Rollback
Revert 1–3 file diffs; backend untouched.
