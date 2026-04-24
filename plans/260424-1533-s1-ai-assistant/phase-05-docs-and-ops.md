# Phase 05 — Docs + ops hardening

## Overview
- Priority: P3
- Status: pending
- Goal: operator-facing notes so future dev can rotate keys / tune quota without spelunking.

## Context Links
- `docs/` (existing project docs folder)
- `backend/src/config/index.ts` (aiDefaultProvider / aiDefaultModel)
- `backend/src/modules/ai/provider-registry.ts`

## Requirements
- Add `docs/ai-assistant.md` (< 120 lines) covering:
  - What it does (reply draft, summary, sentiment). Explicit: no auto-send.
  - Env keys: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `AI_DEFAULT_PROVIDER`, `AI_DEFAULT_MODEL`.
  - Per-org override via AppSetting (key format `ai_<provider>_api_key`).
  - Daily quota: where to change (UI + DB).
  - Provider switch runbook (env vs DB override precedence).
  - Logging: what gets logged (no raw API keys, no full conversation — confirm).
- Update `docs/codebase-summary.md` if it exists — add 1-line note for AI module.
- Confirm `ai-service.ts` logger calls don't leak API keys or full message bodies (read + fix if needed).

## Files to Create
- `docs/ai-assistant.md`

## Files to Modify (conditional)
- `docs/codebase-summary.md` (if present)
- `backend/src/modules/ai/ai-service.ts` (only if log leakage found)

## Todo
- [ ] Grep `logger.` calls in `ai-service.ts` — verify no `apiKey`, no `prompt`, no full `raw` response logged (summary only)
- [ ] Write `docs/ai-assistant.md`
- [ ] Cross-link from `docs/codebase-summary.md`

## Success Criteria
- Doc file renders in GitHub markdown preview.
- No API keys or full conversation text in INFO logs (spot-check).

## Risks
- None material.

## Rollback
Delete docs file; revert log changes if any.
