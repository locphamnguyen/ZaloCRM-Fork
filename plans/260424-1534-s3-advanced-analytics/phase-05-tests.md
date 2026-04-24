# Phase 05 — Tests

## Overview
- Priority: P1
- Status: pending
- Goal: lock new report fns + route contracts + CSV format.

## Context Links
- All `backend/src/modules/analytics/reports/*.ts`
- `backend/src/modules/analytics/analytics-routes.ts`
- `backend/src/modules/analytics/csv-export.ts`

## Requirements

### Unit tests
- `heatmap.test.ts`: seeded conversation w/ known message timestamps → expected cells.
- `tag-distribution.test.ts`: seeded tags + links → expected counts + percentages sum to 100.
- `drip-kpi.test.ts`: seeded enrollments in mixed states → expected aggregates.
- `csv-export.test.ts`: each type → string with correct headers, BOM prefix, row count.

### Route tests (fastify.inject)
- New 3 endpoints: 200 happy path, 401 without auth, filter param honored, cross-org isolation.
- `/export`: content-type + Content-Disposition headers correct, 50k cap returns 413.

## Files to Create
- `backend/src/modules/analytics/reports/__tests__/heatmap.test.ts`
- `backend/src/modules/analytics/reports/__tests__/tag-distribution.test.ts`
- `backend/src/modules/analytics/reports/__tests__/drip-kpi.test.ts`
- `backend/src/modules/analytics/__tests__/csv-export.test.ts`
- `backend/src/modules/analytics/__tests__/analytics-routes.test.ts`

## Files to Modify
- None (tests are additive)

## Todo
- [ ] Identify test runner + DB strategy (mirror phase 04 of S1 audit)
- [ ] Build seed helper for analytics test fixtures
- [ ] Write 4 unit test files
- [ ] Write route test file
- [ ] `npm test` green; coverage ≥ 70% for new files

## Success Criteria
- All tests pass deterministically (no time-of-day dependence — use fixed dates).
- Cross-org isolation explicitly tested.
- CSV BOM + diacritics verified by string match.

## Risks
- **Test DB setup** may not exist — fall back to `vi.mock` for prisma if no test DB infra.
- **Raw SQL in heatmap** — if mocking prisma, raw query is harder to mock; prefer real test DB if available.

## Rollback
Delete test files only.
