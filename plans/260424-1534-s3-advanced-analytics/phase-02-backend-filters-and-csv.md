# Phase 02 — Backend: filter params + CSV export

## Overview
- Priority: P2
- Status: pending
- Goal: extend all analytics endpoints to accept `zaloAccountId` + `assignedUserId` (rep) optional filters; add CSV download endpoint.

## Context Links
- `backend/src/modules/analytics/analytics-routes.ts`
- `backend/src/modules/analytics/analytics-service.ts`
- All `reports/*.ts`

## Requirements

### Filter params
- Add optional query params to existing 4 + new 3 endpoints:
  - `zaloAccountId`: filter conversations + messages by Zalo account.
  - `assignedUserId`: filter contacts by assigned rep (funnel, tag-distribution, drip-kpi).
- Validate UUID format; ignore if absent.

### CSV export
- Single endpoint: `GET /api/v1/analytics/export?type=<funnel|team|response|heatmap|tags|drip>&from=&to=&...filters`.
- Response: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<type>-<from>-<to>.csv"`.
- BOM (`\uFEFF`) for Excel UTF-8 compatibility (Vietnamese diacritics).
- Reuse existing report fns; convert result → CSV string in a single helper.
- Hard cap: 50k rows; if exceeded, return 413 with hint "narrow date range".

## Files to Create
- `backend/src/modules/analytics/csv-export.ts` (~120 LOC) — type → fn map + row serializer per type.

## Files to Modify
- `backend/src/modules/analytics/analytics-routes.ts` — add `/export` route + extend existing handlers to forward filter params.
- All `reports/*.ts` — accept `filters?: { zaloAccountId?: string; assignedUserId?: string }` and apply in `where` clauses.

## Todo
- [ ] Add filter param parsing helper
- [ ] Update each report fn signature + where clauses
- [ ] Build csv-export.ts with per-type serializers
- [ ] Add `/export` route with content-type + BOM
- [ ] Test with curl → open in Excel for diacritics check

## Success Criteria
- All endpoints accept new filters without breaking existing callers.
- CSV files open in Excel with Vietnamese characters intact.
- 50k cap enforced.

## Risks
- **Backwards compat**: existing frontend calls have no filter params — ensure optional path returns same data shape.
- **Memory blow-up** on large CSV — for v1, accept O(N) memory at 50k cap; streaming is YAGNI.

## Rollback
Revert route + report file changes; delete csv-export.ts.
