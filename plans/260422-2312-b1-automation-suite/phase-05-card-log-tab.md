# Phase 05 — Card Log Tab (FEATURE-09)

**Status:** pending | **Effort:** 4h | **Depends:** phase-03 | **Owner:** frontend

## Context
Add "Card Log" tab to per-contact chat panel showing all automation history for that contact. Can run parallel with phase-04 (different files).

## Files

### Modify
- `frontend/src/components/chat/ChatContactPanel.vue` — add new tab entry pointing to `<ChatCardLog :contactId="..." />`

### Create
- `frontend/src/components/chat/ChatCardLog.vue` (< 150 lines)
- `frontend/src/components/chat/ChatCardLogItem.vue` (< 100 lines)

## UI Spec (per FEATURE-09)
```
┌─ Card Log ─────────────────────────────────┐
│ ● Active: "Bám đuổi 20 ngày BĐS"            │
│   Progress: 5/20                            │
│   Next send: 09:32 tomorrow                 │
│   [Pause] [Cancel]                          │
│                                             │
│ ✓ Completed: "Chào mừng khách mới"          │
│   Progress: 3/3 — 10/04/2026                │
│   [View logs]                               │
└─────────────────────────────────────────────┘
```

## Data Source
`GET /api/v1/contacts/:id/drip-history` (defined phase-03)
Returns array: `{enrollmentId, campaignName, currentStep, totalSteps, status, nextSendAt, startedAt, completedAt}`

## Behavior
- Tab badge: show count of **active** enrollments (red dot if > 0)
- Sort: active first (by nextSendAt), then paused, then completed (by completedAt desc)
- Inline actions reuse `useDripEnrollments.ts` composable from phase-04
- "View logs" → reuse `DripLogDialog.vue` from phase-04

## Cross-Phase Dependency
Composable + dialog owned by phase-04. Phase-05 imports them. If phase-04 not merged, phase-05 can stub w/ placeholder action handlers.

## Files to Read
- `frontend/src/components/chat/ChatContactPanel.vue` (find existing tab pattern — e.g. Appointments tab)
- `frontend/src/components/chat/ChatAppointments.vue` (template for per-contact panel component)

## Success Criteria
- [ ] Tab appears in ChatContactPanel w/ badge for active count
- [ ] Active enrollments show live progress + next-send time
- [ ] Pause/Cancel buttons work w/o navigating away
- [ ] Completed enrollments show final count + date
- [ ] Empty state: "No automation history" when contact never enrolled
- [ ] Auto-refresh every 30s while tab visible (or socket push if available)

## Risks
- ChatContactPanel.vue tab API unknown — need to grep for existing tab definition pattern
- If tabs are hardcoded enum, schema edit may be required; prefer config array
