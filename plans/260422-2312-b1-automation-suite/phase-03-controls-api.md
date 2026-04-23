# Phase 03 — Controls API

**Status:** pending | **Effort:** 4h | **Depends:** phase-02 | **Owner:** backend

## Context
REST API for campaign CRUD, enrollment lifecycle, bulk ops, logs. All guarded by `authMiddleware` + `requireZaloAccess` where msg-send involved, `requireRole('owner','admin')` for destructive ops.

## Files (NEW)
- `backend/src/modules/automation/drip-routes.ts` (< 200 lines — split if needed)
- **Modify:** `backend/src/app.ts` — `app.register(dripRoutes)`

## Endpoints

### Campaigns
| Method | Path | Role | Body | Returns |
|---|---|---|---|---|
| GET | `/api/v1/drip/campaigns` | any | — | `{campaigns}` |
| POST | `/api/v1/drip/campaigns` | admin+ | `{name, windowStart, windowEnd, timezone, startTrigger, stopOnReply, steps:[{templateId\|content, dayOffset}]}` | created |
| GET | `/api/v1/drip/campaigns/:id` | any | — | campaign + steps + enrollment counts |
| PUT | `/api/v1/drip/campaigns/:id` | admin+ | partial | updated |
| DELETE | `/api/v1/drip/campaigns/:id` | admin+ | — | 204 (cascades enrollments) |

### Enrollments
| Method | Path | Role | Body | Returns |
|---|---|---|---|---|
| GET | `/api/v1/drip/enrollments` | any | `?campaignId&status&contactId&page` | paginated list |
| POST | `/api/v1/drip/campaigns/:id/enroll` | `requireZaloAccess('chat')` | `{contactIds:[], zaloAccountId}` | `{enrolled, skipped:[{contactId, reason}]}` |
| POST | `/api/v1/drip/enrollments/:id/pause` | `requireZaloAccess('chat')` | — | updated |
| POST | `/api/v1/drip/enrollments/:id/resume` | `requireZaloAccess('chat')` | — | updated (re-slots `scheduled_at`) |
| POST | `/api/v1/drip/enrollments/:id/cancel` | `requireZaloAccess('chat')` | — | updated |
| GET | `/api/v1/drip/enrollments/:id/logs` | any | — | `{logs:[...]}` |

### Bulk
| Method | Path | Role | Body |
|---|---|---|---|
| POST | `/api/v1/drip/campaigns/:id/bulk` | admin+ | `{action: 'pause'\|'resume'\|'cancel', filter?: {status}}` |

### Per-Contact (for Card Log tab)
| Method | Path | Role |
|---|---|---|
| GET | `/api/v1/contacts/:id/drip-history` | `requireZaloAccess('read')` |
Returns all enrollments for contact, each with `{campaignName, currentStep, totalSteps, status, nextSendAt, lastLogs:[]}`.

## Validation
- POST campaign: `windowEnd > windowStart`, steps non-empty, each step has `templateId` OR non-empty `content`
- Enroll: skip if active enrollment exists for (campaign, contact); skip if contact.assignedUserId mismatch & role=sales
- Pause→Resume: on resume, compute fresh `scheduled_at` from now (don't use stale stored value)

## State Transitions (enforce in code)
```
active  → paused, cancelled, completed, failed
paused  → active (resume), cancelled
completed → (terminal)
cancelled → (terminal)
failed    → active (manual retry — phase 04 UI)
```

## Files to Read
- `backend/src/modules/automation/automation-routes.ts` (pattern for CRUD)
- `backend/src/modules/zalo/zalo-access-middleware.ts`
- `backend/src/modules/auth/role-middleware.ts`

## Success Criteria
- [ ] All endpoints return proper 400/403/404 for validation/auth failures
- [ ] Bulk pause 100 enrollments completes < 2s (single UPDATE query)
- [ ] Enroll dedupe: POST enroll same contact twice → 2nd returns `skipped` w/ reason
- [ ] Resume re-slots `scheduled_at` to next window (not past-due immediate fire)
- [ ] Pagination on `/enrollments` handles 10k rows (cursor or offset w/ limit 100)

## Risks
- Resume race: user resumes while campaign deleted — enforce FK + 404
- Bulk w/o filter could nuke thousands — require explicit `status` filter in body
