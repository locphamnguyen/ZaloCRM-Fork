---
title: "S3 Advanced Analytics — Heatmap, Tag Distribution, Drip KPIs, Filters, CSV"
description: "Extend existing analytics module with response-time heatmap, tag distribution, drip campaign KPIs, account/rep filters, CSV export."
status: pending
priority: P2
effort: 11h
branch: locphamnguyen/b3-multi-intel-v2
tags: [analytics, dashboard, charts, sprint-s3]
created: 2026-04-24
---

# S3 — Advanced Analytics (Gap Fill)

## Context

Sprint S3 of `plans/sprint-plan.md`. Existing module already covers funnel / team-performance / response-time / custom report. This plan adds the remaining KPIs requested by the sprint and ops needs: **heatmap, tag distribution, drip KPIs, account/rep filters, CSV export, tests.**

### Existing (do NOT rebuild)
- Schema: `SavedReport`, `DripCampaign/DripStep/DripEnrollment/AutomationLog`, `CrmTag/ContactTagLink`, `Conversation/Message`, `Contact` — sufficient. **No migration needed.**
- Backend: `backend/src/modules/analytics/` — routes + service + 4 reports + saved-report-routes. Registered in `app.ts:157`.
- Frontend: `frontend/src/views/AnalyticsView.vue` (159 LOC), `use-analytics.ts`, components `ConversionFunnelChart`, `TeamLeaderboard`, `ResponseTimeChart`, `ReportBuilder`.
- Chart libs available: `chart.js@4.5`, `vue-chartjs@5.3`. **Use these — no new dep.**

### New scope
1. Response-time **heatmap** (hour-of-day × day-of-week, last N days).
2. **Tag distribution** — counts per `CrmTag`, split by source (crm/zalo).
3. **Drip campaign KPIs** — enrollments active/completed/failed, send success rate, avg days to complete.
4. **Filters**: date range (exists), Zalo account, assigned rep.
5. **CSV export** for each chart.
6. Tests.

## Phases

| # | Phase | File | Effort | Depends |
|---|---|---|---|---|
| 01 | Backend: heatmap + tag distribution + drip KPI services | phase-01-backend-new-reports.md | 3h | — |
| 02 | Backend: filter params + CSV export route | phase-02-backend-filters-and-csv.md | 1.5h | 01 |
| 03 | Frontend: 3 new chart components + AnalyticsView tabs | phase-03-frontend-new-charts.md | 3h | 01 |
| 04 | Frontend: filter bar + CSV download UX | phase-04-frontend-filters-csv.md | 1.5h | 02,03 |
| 05 | Tests: report fns + route shapes | phase-05-tests.md | 2h | 01,02 |

## File ownership (no parallel collisions)
- Backend new reports: `backend/src/modules/analytics/reports/heatmap.ts`, `tag-distribution.ts`, `drip-kpi.ts`, plus edits to `analytics-routes.ts` + `analytics-service.ts` (these two are shared — phases 01/02 must be sequential).
- Frontend new charts: `frontend/src/components/analytics/ResponseHeatmap.vue`, `TagDistributionChart.vue`, `DripKpiCard.vue`. New tabs in `AnalyticsView.vue` (shared file with phase 04).

## Out of scope (YAGNI)
- Real-time live-updating dashboard (poll on refresh button only — same as existing UX).
- Predictive forecasting / cohort analysis.
- Email-scheduled digests.
- New chart library (stick with chart.js).

## Risks
- **Heavy aggregation queries** on large `Message` tables → use Prisma `groupBy` + indexes already on `(orgId, lastMessageAt)`. For heatmap, raw SQL with `EXTRACT(dow/hour FROM sent_at)` is required (Prisma groupBy can't do date parts). Mitigate: limit to last 30 days default.
- **Tag distribution N+1** — single `groupBy` on `ContactTagLink` joined via `tagId`.
- **Drip KPI cost** — `AutomationLog` may be large; index `(orgId, sentAt)` already exists. Aggregate by date range only.
- **CSV memory** — stream rows for >10k; phase 02 caps at 50k rows + warns.
- **AnalyticsView LOC** already 159 — adding 3 tabs may push past 200. Mitigation: extract overview/funnel/team panels to small components if needed.

## Rollback
Each phase additive. New routes do not modify existing endpoints. Drop new files + revert AnalyticsView/use-analytics diffs.

## Test Matrix
- Unit: each new report fn with seeded data (fixed dates).
- Route: `fastify.inject` for shape + auth + filter params.
- E2E (manual): refresh AnalyticsView with real org data, export CSV, open in Excel.

## Success Criteria
- 3 new tabs render with data.
- Filter bar (date + account + rep) propagates to all charts.
- CSV downloads with headers in Vietnamese.
- Tests green.
