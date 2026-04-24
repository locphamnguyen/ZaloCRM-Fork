# Phase 01 — Backend: heatmap + tag distribution + drip KPI services

## Overview
- Priority: P1
- Status: pending
- Goal: 3 new aggregation services + 3 new route handlers, org-scoped, date-range param.

## Context Links
- `backend/src/modules/analytics/analytics-routes.ts`
- `backend/src/modules/analytics/analytics-service.ts`
- `backend/src/modules/analytics/reports/response-time.ts` (pattern reference)
- Schema: `Message`, `ContactTagLink`, `CrmTag`, `DripEnrollment`, `AutomationLog`

## Requirements

### 1. Response-time heatmap
- Output: `{ cells: Array<{ dow: 0-6, hour: 0-23, avgSeconds: number, sampleCount: number }> }`
- Source: pairs of (incoming message, next outgoing message in same conversation within 24h).
- Implementation: raw SQL via `prisma.$queryRaw` — Postgres `EXTRACT(DOW FROM ...)`, `EXTRACT(HOUR FROM ...)` over a derived response_seconds column.
- Default range: last 30 days; cap at 90 days.

### 2. Tag distribution
- Output: `{ tags: Array<{ tagId, name, color, source, contactCount, percent }> }`
- Source: `ContactTagLink` groupBy `tagId` joined to `CrmTag`.
- Org scope: tag.orgId == orgId AND link.contactId in org's contacts (use IN subquery or join).

### 3. Drip campaign KPIs
- Output: `{ campaigns: Array<{ id, name, enrolled, active, completed, failed, cancelled, sendSuccessRate, avgDaysToComplete }> }`
- Source: `DripEnrollment.groupBy({campaignId, status})` + `AutomationLog.groupBy({status})` for send success rate.
- Filter by date: `enrollment.startedAt` within range.

## Files to Create
- `backend/src/modules/analytics/reports/heatmap.ts` (~80 LOC)
- `backend/src/modules/analytics/reports/tag-distribution.ts` (~60 LOC)
- `backend/src/modules/analytics/reports/drip-kpi.ts` (~100 LOC)

## Files to Modify
- `backend/src/modules/analytics/analytics-routes.ts` — add 3 GET routes:
  - `GET /api/v1/analytics/response-heatmap?from=&to=`
  - `GET /api/v1/analytics/tag-distribution?from=&to=`
  - `GET /api/v1/analytics/drip-kpi?from=&to=`
- `backend/src/modules/analytics/analytics-service.ts` — re-export new fns.

## Todo
- [ ] Implement `getResponseHeatmap(orgId, from, to)` with raw SQL
- [ ] Implement `getTagDistribution(orgId)` (date range optional)
- [ ] Implement `getDripKpi(orgId, from, to)`
- [ ] Wire routes with try/catch + logger pattern (match existing style)
- [ ] Manual curl test with seeded data
- [ ] Compile-check: `npm run build` in backend

## Success Criteria
- 3 endpoints return JSON shapes above.
- 0 results case handled (`{ cells: [] }` etc.).
- Org isolation: cross-org user gets empty result.

## Risks
- **Raw SQL** in heatmap bypasses Prisma type safety — write narrow zod-like shape check.
- **Pair-up algorithm** (incoming → next outgoing) cost on millions of messages — limit by date range; consider window function `LEAD(sent_at) OVER (PARTITION BY conversation_id ORDER BY sent_at)`.

## Rollback
Delete 3 files; remove 3 route handlers; remove 3 re-exports.
