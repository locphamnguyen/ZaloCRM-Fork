# Phase 04 — Backend tests

## Overview
- Priority: P1
- Status: pending
- Goal: lock behaviour of `ai-service.ts` + routes so provider swaps don't regress.

## Context Links
- `backend/src/modules/ai/ai-service.ts`
- `backend/src/modules/ai/ai-routes.ts`
- Existing test runner: check `backend/package.json` + `backend/tests/` (if present) before writing — reuse conventions.

## Requirements
- Unit tests for `ai-service.ts`:
  - `detectLanguage`: vi / en cases, mixed text.
  - `escapeXmlBoundary`: strips `<conversation_context>` tokens from user content.
  - `getAiUsage`: computes `remaining` correctly.
  - Quota enforcement: count == maxDaily → throws "AI daily quota exceeded".
  - Sentiment parsing: valid JSON, invalid JSON → neutral fallback, out-of-range confidence clamped.
- Route tests (supertest/fastify.inject):
  - `POST /ai/suggest` happy path (mock provider call).
  - `POST /ai/suggest` without API key → 500 "provider key not configured".
  - `PUT /ai/config` role guard: member → 403, admin → 200.
  - `GET /ai/usage` returns shape.

## Files to Create
- `backend/src/modules/ai/__tests__/ai-service.test.ts`
- `backend/src/modules/ai/__tests__/ai-routes.test.ts`
- Helper: `backend/src/modules/ai/__tests__/fake-provider.ts` (stub generate fn)

## Files to Modify (minimal)
- `backend/src/modules/ai/ai-service.ts` — export `detectLanguage` + `escapeXmlBoundary` if currently file-local, to enable unit test without breaking API.

## Todo
- [ ] Verify test runner (vitest/jest) in backend
- [ ] Stub Prisma via existing test DB pattern (check other modules)
- [ ] Stub provider HTTP call
- [ ] Write ai-service.test.ts
- [ ] Write ai-routes.test.ts with fastify.inject
- [ ] Run full suite; ensure no regression on other modules

## Success Criteria
- `npm test` green.
- Branch coverage for `ai-service.ts` ≥ 70%.
- Quota race test deterministically passes.

## Risks
- **Prisma test DB setup** may be missing — if so, fall back to Prisma client mocking for this phase (vitest `vi.mock`).
- **Flaky provider mocks**: use fixed fake responses, no network.

## Rollback
Delete test files; no production code changes beyond export line.
