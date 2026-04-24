# Phase 04 — Frontend: filter bar + CSV download UX

## Overview
- Priority: P2
- Status: pending
- Goal: shared filter bar (date + account + rep) drives all tabs; CSV export button per tab.

## Context Links
- `frontend/src/views/AnalyticsView.vue`
- `frontend/src/composables/use-analytics.ts`
- Existing Zalo accounts list endpoint (reuse from `ZaloAccountsView`)
- Existing users list endpoint (reuse from contact assignment dropdown)

## Requirements

### Filter bar
- Add to AnalyticsView header (next to date pickers):
  - Zalo account multi-select (label "Tài khoản Zalo")
  - Rep select (label "Nhân viên phụ trách")
- On change → trigger `fetchAll()` with new params.

### CSV export
- Per-tab "Xuất CSV" button (icon `mdi-download`).
- Calls `GET /analytics/export?type=...&...filters` and triggers browser download via blob.

## Files to Modify
- `frontend/src/views/AnalyticsView.vue` — filter bar + 6 export buttons (or 1 contextual button per active tab)
- `frontend/src/composables/use-analytics.ts` — add filter state + `exportCsv(type)` helper, propagate filter params to existing fetchers

## Files to Create (conditional)
- `frontend/src/components/analytics/AnalyticsFilterBar.vue` — extract if AnalyticsView LOC > 200

## Todo
- [ ] Wire account + rep dropdown options (reuse existing API)
- [ ] Add filter state to composable
- [ ] Pass filter params in all fetch calls
- [ ] Implement `exportCsv(type)` → blob → anchor click → revoke
- [ ] Add export button to each tab header
- [ ] Disable export button while loading

## Success Criteria
- Changing account dropdown re-fetches all visible charts.
- CSV downloads named correctly with date range.
- Export button shows loading state.

## Risks
- **Filter param explosion** in URL — keep flat, no nested.
- **Stale filters across tab switch** — tab switch must NOT clear filters; filters persist.

## Rollback
Revert view + composable diffs; delete extracted component if any.
