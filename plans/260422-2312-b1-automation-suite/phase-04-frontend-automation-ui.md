# Phase 04 — Frontend Automation UI

**Status:** pending | **Effort:** 7h | **Depends:** phase-03 | **Owner:** frontend

## Context
Extend `AutomationView.vue` w/ tabbed layout: **Rules** (existing) | **Drip Campaigns** (new) | **Running** (new). Build campaign builder + enrollment monitor.

## Files

### Modify
- `frontend/src/views/AutomationView.vue` — wrap existing content in first tab, add 2 new tabs
- `frontend/src/api/` — add `drip-api.ts` client

### Create
```
frontend/src/components/automation/drip/
  DripCampaignList.vue       # table: name, enabled, active count, actions
  DripCampaignEditor.vue     # create/edit form (steps, window, triggers)
  DripStepEditor.vue         # per-step row (template picker or inline content)
  DripEnrollmentTable.vue    # Running tab: filter by status, bulk ops
  DripLogDialog.vue          # modal: per-enrollment log history
  useDripCampaigns.ts        # composable (fetch, CRUD)
  useDripEnrollments.ts      # composable (list, lifecycle ops)
```

## UX Flows

### Create Campaign
1. Click "New drip" → editor opens
2. Fill name, window (sliders 0–23h), timezone dropdown
3. Add steps: pick existing template OR write inline content
4. Configure triggers: start = manual (v1), stop = reply toggle + inactive-days input
5. Save → appears in list w/ `enabled=true`

### Enroll Contacts
- In editor: "Enroll contacts" button → modal w/ contact picker (reuse existing contact search) + zaloAccount selector
- OR from contact detail page (deferred B2)

### Monitor Running
- Running tab: table of enrollments, columns: contact, campaign, step N/M, status, next send, actions
- Filter bar: campaign, status
- Bulk select → "Pause selected / Cancel selected"
- Row action → "View logs" → DripLogDialog

## Components Constraints
- Each component < 200 lines (split aggressively)
- Reuse `frontend/src/components/chat/quick-template-popup.vue` for template picker in step editor
- Socket.io update: if existing socket infra pushes events, subscribe to `drip:enrollment:updated` (optional v1, polling 10s acceptable)

## API Client Shape
```ts
// drip-api.ts
listCampaigns() / createCampaign() / updateCampaign() / deleteCampaign()
listEnrollments(filters) / enroll(campaignId, payload)
pauseEnrollment(id) / resumeEnrollment(id) / cancelEnrollment(id)
getEnrollmentLogs(id) / bulkEnrollmentAction(campaignId, payload)
```

## Files to Read
- `frontend/src/views/AutomationView.vue` (current shape)
- `frontend/src/components/chat/quick-template-popup.vue`
- existing `frontend/src/api/*.ts` for client pattern

## Success Criteria
- [ ] Create 3-step campaign via UI → persists → visible after reload
- [ ] Enroll 5 contacts → Running tab shows 5 rows w/ correct progress
- [ ] Pause + Resume via UI updates row state within 1s
- [ ] Bulk cancel via checkbox selection works on 20+ rows
- [ ] Log dialog shows send history w/ timestamps + status
- [ ] Responsive: works on mobile widths (campaign list stacked)

## Risks
- Existing AutomationView.vue may be large — refactor into subcomponents first if > 300 lines
- Template picker coupling: if quick-template-popup.vue depends on chat context, extract shared base
