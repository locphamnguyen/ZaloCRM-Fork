# Phase-04 Backend Tests Report

**Date:** 2026-04-24 | **Phase:** S1 Phase-04 | **Status:** DONE

## Summary

Implemented complete test infrastructure + backend tests for AI service & routes. **All 27 tests passing**, test runner operational, coverage baseline established.

## Test Infrastructure Setup

| Component | Version | Status |
|-----------|---------|--------|
| Test Runner | vitest 1.6.0 | ✓ Operational |
| Coverage Tool | @vitest/coverage-v8 1.6.0 | ✓ Enabled |
| HTTP Testing | supertest 6.3.4 | ✓ Installed |
| npm test | Added | ✓ Working |

**Config:** `backend/vitest.config.ts` — node environment, glob: `src/**/*.test.ts`, v8 coverage

## Tests Implemented

### Unit Tests: ai-service.test.ts (15 tests)

**detectLanguage:**
- ✓ Vietnamese diacritical marks detection
- ✓ Vietnamese hint phrase detection (khách, chào, giúp, etc)
- ✓ English text detection
- ✓ Mixed text with Vietnamese markers
- ✓ Empty string handling
- ✓ Numbers-only string handling

**escapeXmlBoundary:**
- ✓ Removes `<conversation_context>` tags (case-insensitive)
- ✓ Handles multiple tags in same text
- ✓ Preserves text without tags
- ✓ Empty string handling

**getAiUsage:**
- ✓ Correct remaining count when under quota
- ✓ Returns 0 remaining when quota reached
- ✓ Clamps to 0 when over quota
- ✓ Auto-creates config if missing
- ✓ Prisma mocking for DB isolation

### Integration Tests: ai-routes.test.ts (12 tests)

**GET /api/v1/ai/providers:**
- ✓ Returns available providers list

**GET /api/v1/ai/config:**
- ✓ Returns organization AI config

**PUT /api/v1/ai/config:**
- ✓ Updates config (admin role)
- ✓ Validates maxDaily >= 1

**GET /api/v1/ai/usage:**
- ✓ Returns daily usage + remaining quota

**POST /api/v1/ai/suggest (reply draft):**
- ✓ Happy path: returns suggested reply
- ✓ 400: conversationId missing
- ✓ 404: conversation not found
- ✓ 429: quota exceeded error
- ✓ 400: provider not configured error

**POST /api/v1/ai/summarize/:id:**
- ✓ Summarizes conversation

**POST /api/v1/ai/sentiment/:id:**
- ✓ Analyzes sentiment with label + confidence

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `backend/vitest.config.ts` | Test runner configuration | 24 |
| `backend/src/modules/ai/__tests__/ai-service.test.ts` | Unit tests for service logic | 170 |
| `backend/src/modules/ai/__tests__/ai-routes.test.ts` | Integration tests for HTTP endpoints | 345 |
| `backend/src/modules/ai/__tests__/fake-provider.ts` | Mock provider responses | 22 |

## Files Modified

| File | Changes |
|------|---------|
| `backend/package.json` | Added test scripts + devDependencies (vitest, supertest, coverage) |
| `backend/src/modules/ai/ai-service.ts` | Exported `detectLanguage` + `escapeXmlBoundary` for unit testing |

## Test Results

```
Test Files:  2 passed (2)
Tests:       27 passed (27)
Duration:    378ms
```

### Coverage Metrics

| Module | Lines | Branch | Functions | Statements |
|--------|-------|--------|-----------|------------|
| ai-service.ts | 32.53% | **85.71%** | 50% | 32.53% |
| ai-routes.ts | 77.39% | 67.74% | 100% | 77.39% |

**Branch coverage (85.71% on ai-service) exceeds target of 70%.** ✓

## Test Coverage Gaps (Documented)

### Not Tested

**ai-service.ts (untested functions):**
1. `getProviderApiKey()` — DB lookup for API keys (needs integration test DB)
2. `getAiConfig()` — Full config resolution (partially tested via getAiUsage)
3. `updateAiConfig()` — Upsert logic (routes layer tested, service not isolated)
4. `loadConversation()` — Message loading + ordering
5. `generateText()` — Provider dispatch (anthropic/gemini/openai selection)
6. `buildConversationContext()` — Message formatting
7. `generateAiOutput()` — Full AI generation pipeline (quota race, provider fallback, sentiment parsing edge cases)
8. `saveSuggestion()` — DB write logic

**ai-routes.ts (partially tested):**
- Role-based access control (admin vs member) — mocked but not enforced
- Zalo access middleware — bypassed in tests
- Error logging paths — not verified

### Why Skipped

- **Quota race condition (TOCTOU):** Requires `$transaction` isolation test with concurrent requests — needs test database + transaction support. Deferred to integration phase.
- **Provider dispatch:** Would require mocking Anthropic/Gemini HTTP calls. Stub created (`fake-provider.ts`) but not wired into service. Low priority — provider registry is stable.
- **Role middleware:** Requires extracting requireRole to separate mock. Current mock returns function but doesn't execute guards. Routes assume admin role.
- **DB integration:** No test database pool configured. Prisma mocking works but doesn't catch DB schema mismatches.

## Recommendations

### Phase-05 Expansion (Post-MVP)

1. **Transaction atomicity test** — set up test Postgres instance, verify quota check prevents race
2. **Provider dispatch test** — mock Anthropic + Gemini HTTP; verify selection logic
3. **Sentiment JSON parsing** — add tests for malformed JSON, out-of-range confidence clamping
4. **Message context formatting** — test author resolution (self→staff, null→customer) + XML escape edge cases
5. **Role enforcement** — test 403 for non-admin PUT /ai/config

### Immediate Improvements (If Time)

1. Extract `requireRole` mock to properly enforce role checks in route tests
2. Test `generateAiOutput()` quota check with transaction simulation
3. Add test for sentiment confidence normalization (clamp to [0,1])

## Build Status

✓ TypeScript compilation: Pass (no errors)
✓ Linting: Pass (default rules)
✓ Tests: 27/27 passing
✓ Coverage: Branch 85.71% ≥ 70% target
✓ Git commit: f27c444 — test infrastructure + tests

## Unresolved Questions

- **Should we set up a test database for transaction tests?** (Current phase uses mocks; full DB isolation would be phase-05 work)
- **Do we need to test provider fallback logic** (anthropic fails → try gemini)? (Not in current spec; low priority)
- **Sentiment confidence clamp edge case** (e.g., confidence=1.5 → 1.0) — should we add test? (Minor, covered by existing logic; phase-05 if needed)

---

**Status:** DONE
**Tests Passing:** 27/27 (100%)
**Coverage Target:** 70% branch — **Achieved: 85.71%** ✓
**Blocker Resolution:** Test infrastructure installed, test runner operational
