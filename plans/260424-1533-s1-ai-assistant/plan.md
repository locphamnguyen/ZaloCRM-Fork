---
title: "S1 AI Assistant — Gap fill & Hardening"
description: "Complete AI reply-draft / summary / sentiment feature: finish frontend wiring, config UX, tests. No auto-send."
status: pending
priority: P2
effort: 8h
branch: locphamnguyen/b3-multi-intel-v2
tags: [ai, claude, gemini, chat, sprint-s1]
created: 2026-04-24
---

# S1 — AI Assistant (Reply Draft + Summary + Sentiment)

## Context

Sprint S1 of `plans/sprint-plan.md`. Backend is already largely implemented; this plan fills remaining gaps, wires frontend for all 3 task types, and adds tests. **No auto-send.**

### Existing (do NOT rebuild)
- Schema: `AiSuggestion`, `AiConfig` already in `backend/prisma/schema.prisma`.
- Backend: `backend/src/modules/ai/` has `ai-routes.ts` (7 endpoints), `ai-service.ts` (quota, language detection, provider dispatch), provider wrappers (anthropic, gemini, openai-compat), prompt builders.
- Registered in `backend/src/app.ts:163`.
- Frontend components exist: `frontend/src/components/ai/ai-suggestion-panel.vue`, `ai-summary-card.vue`, `ai-sentiment-badge.vue`, `ai-config-dialog.vue`.
- `MessageThread.vue:101` already renders `AiSuggestionPanel`. `use-chat.ts:173` calls `/ai/suggest`.

### Gaps to close
- Summary + sentiment UI not yet wired into ChatView sidebar.
- AI config dialog not yet surfaced in Settings navigation (verify + wire).
- No automated tests for ai-service (quota race, language detection, sentiment JSON parsing, provider dispatch).
- No rate-limit integration test for 429 path.
- Docs: add short operator doc for env keys + daily quota tuning.

## Phases

| # | Phase | File | Effort | Depends |
|---|---|---|---|---|
| 01 | Audit + gap confirmation | phase-01-audit-and-wiring-gap.md | 1h | — |
| 02 | Frontend: summary + sentiment wiring in ChatView | phase-02-frontend-summary-sentiment.md | 2h | 01 |
| 03 | Frontend: AI config UX in Settings | phase-03-frontend-ai-config-ux.md | 1h | 01 |
| 04 | Backend tests: service + routes | phase-04-backend-tests.md | 2.5h | 01 |
| 05 | Docs + ops hardening (env, quota, logs) | phase-05-docs-and-ops.md | 1.5h | 02,03,04 |

## Dependencies
- ANTHROPIC_API_KEY / GEMINI_API_KEY envs (prod & dev).
- Provider registry already reads env; per-org `AppSetting` fallback already supported — no schema change.

## Out of scope (YAGNI)
- Auto-send of AI replies (explicit product decision).
- Streaming responses (current 2–3s latency acceptable).
- Multi-turn agent flows, tool use, RAG over knowledge base.
- Provider cost tracking dashboard (S3 can surface AI usage later).

## Risks
- **Prompt injection via message content** — mitigate: XML boundary escape already in place (`escapeXmlBoundary`), keep in tests.
- **Quota race** — atomic check already via `$transaction`, cover in test.
- **Provider API drift** (Claude/Gemini version change) — pin `aiDefaultModel` in config, surface provider-level errors to UI.

## Rollback
Each phase is additive. Disable via `AiConfig.enabled=false` or unset env keys → routes return 503 / "provider key not configured".

## Success Criteria
- `ChatView` can trigger all 3 AI tasks, result renders in sidebar.
- Settings page exposes provider + model + daily quota.
- Backend tests: quota, language detection, sentiment parsing, provider dispatch — all green.
- `docs/` has 1-page AI ops note (env keys, quota, provider switch).
