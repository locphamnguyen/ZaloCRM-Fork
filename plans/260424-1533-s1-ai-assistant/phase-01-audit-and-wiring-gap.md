# Phase 01 — Audit + wiring gap confirmation

## Overview
- Priority: P1 (blocks other phases)
- Status: pending
- Goal: inventory exact missing wiring in frontend so phases 02/03 have deterministic scope.

## Context Links
- `backend/src/modules/ai/ai-routes.ts` (7 endpoints)
- `frontend/src/components/ai/*.vue`
- `frontend/src/composables/use-chat.ts:173`
- `frontend/src/views/ChatView.vue`, `frontend/src/views/SettingsView.vue`

## Requirements
- Read each AI component file + `MessageThread.vue` + `ChatView.vue` + `SettingsView.vue`.
- Confirm: (a) is summary endpoint called from UI? (b) is sentiment endpoint called? (c) is `ai-config-dialog.vue` mounted in Settings?
- Produce a gap list (short bullets) committed as `plans/260424-1533-s1-ai-assistant/audit.md`.

## Files to Read (no modify)
- `frontend/src/views/ChatView.vue`
- `frontend/src/views/SettingsView.vue`
- `frontend/src/components/chat/MessageThread.vue`
- `frontend/src/components/ai/ai-suggestion-panel.vue`
- `frontend/src/components/ai/ai-summary-card.vue`
- `frontend/src/components/ai/ai-sentiment-badge.vue`
- `frontend/src/components/ai/ai-config-dialog.vue`
- `frontend/src/composables/use-chat.ts`

## Files to Create
- `plans/260424-1533-s1-ai-assistant/audit.md` (bullet list of concrete gaps)

## Todo
- [ ] Grep usages of `/ai/summarize`, `/ai/sentiment` in `frontend/src/`
- [ ] Confirm whether `AiSummaryCard` / `AiSentimentBadge` are imported anywhere
- [ ] Confirm `AiConfigDialog` mount location
- [ ] Write `audit.md` with concrete missing imports/routes/bindings

## Success Criteria
- `audit.md` lists file + line + one-line fix intent per gap.
- Phases 02/03 can proceed without re-reading the codebase blindly.

## Risks
- Hidden state: Pinia store already calling endpoints but UI just not surfaced — audit must check composables, not just views.

## Rollback
N/A (read-only phase).
