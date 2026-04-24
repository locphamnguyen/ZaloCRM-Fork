# Phase 03 — Frontend: 3 new chart components + AnalyticsView tabs

## Overview
- Priority: P2
- Status: pending
- Goal: render heatmap, tag distribution, drip KPI in AnalyticsView via 3 new components + 3 new tabs.

## Context Links
- `frontend/src/views/AnalyticsView.vue` (current 159 LOC)
- `frontend/src/composables/use-analytics.ts`
- Existing chart components in `frontend/src/components/analytics/`
- chart.js + vue-chartjs already installed

## Requirements

### Components
1. `ResponseHeatmap.vue` — 7×24 grid, color intensity by `avgSeconds` (green=fast, red=slow). HTML/CSS table; chart.js Matrix not needed (avoid plugin).
2. `TagDistributionChart.vue` — horizontal bar chart (vue-chartjs), color from `tag.color`, segmented by source.
3. `DripKpiCard.vue` — stacked card: per-campaign mini-table with KPIs.

### Composable extensions
- Add to `use-analytics.ts`: `responseHeatmap`, `tagDistribution`, `dripKpi` reactive refs + fetch fns.
- Extend `fetchAll()` to include new endpoints (parallel `Promise.all`).

### View
- Add 3 tabs to `AnalyticsView.vue`: "Heatmap", "Thẻ tag", "Drip campaigns".
- Place in tab bar after existing tabs.
- If LOC limit (200) approached, extract `OverviewPanel.vue` + `BuilderPanel.vue` to keep view file small.

## Files to Create
- `frontend/src/components/analytics/ResponseHeatmap.vue` (~120 LOC)
- `frontend/src/components/analytics/TagDistributionChart.vue` (~80 LOC)
- `frontend/src/components/analytics/DripKpiCard.vue` (~100 LOC)

## Files to Modify
- `frontend/src/composables/use-analytics.ts` — add 3 fetchers + reactive state
- `frontend/src/views/AnalyticsView.vue` — 3 new tabs + bindings

## Todo
- [ ] Build ResponseHeatmap with CSS grid + interpolated color
- [ ] Build TagDistributionChart with vue-chartjs Bar
- [ ] Build DripKpiCard with v-data-table
- [ ] Extend composable
- [ ] Add tabs + window-items
- [ ] LOC audit on AnalyticsView; refactor if > 200
- [ ] Manual smoke: empty state + populated state

## Success Criteria
- 3 new tabs visible in AnalyticsView.
- All render without console errors on empty data.
- Heatmap legend shows fast/slow scale.

## Risks
- **AnalyticsView bloat**: hard 200 LOC ceiling. If exceeded, extract panels.
- **Color contrast** on heatmap — pick palette accessible (test with Vietnamese labels).

## Rollback
Delete 3 components; revert composable + view diffs.
