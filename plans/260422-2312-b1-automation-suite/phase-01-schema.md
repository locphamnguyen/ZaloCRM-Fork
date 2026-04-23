# Phase 01 — Schema & Migration

**Status:** pending | **Effort:** 3h | **Owner:** backend

## Context
Add drip-campaign persistence. Existing `AutomationRule` untouched.

## Tables

### `drip_campaigns`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid FK→organizations | cascade del |
| name | text | |
| description | text? | |
| enabled | bool | default true |
| window_start | smallint | hour 0–23, default 8 |
| window_end | smallint | hour 0–23, default 11; check `end>start` |
| timezone | text | default `Asia/Ho_Chi_Minh` |
| start_trigger | text | `manual`\|`webhook`\|`tag` |
| start_tag | text? | when trigger=tag |
| stop_on_reply | bool | default true |
| stop_on_tag | text? | |
| stop_on_inactive_days | int? | |
| created_by | uuid FK→users | |
| created_at / updated_at | timestamptz | |
| **index** | (org_id, enabled) | |

### `drip_steps`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| campaign_id | uuid FK→drip_campaigns | cascade |
| step_index | int | 0-based, unique w/ campaign_id |
| template_id | uuid FK→message_templates? | nullable if `content` inline |
| content | text? | fallback if no template |
| day_offset | int | default = step_index (supports skip-days later) |
| **unique** | (campaign_id, step_index) | |

### `drip_enrollments`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| campaign_id | uuid FK→drip_campaigns | cascade |
| contact_id | uuid FK→contacts | cascade |
| conversation_id | uuid FK→conversations | cascade; must exist for send |
| zalo_account_id | uuid FK→zalo_accounts | chosen at enroll |
| current_step | int | default 0 |
| status | text | `active`\|`paused`\|`completed`\|`cancelled`\|`failed` |
| scheduled_at | timestamptz? | next-fire time, null when paused/done |
| last_sent_at | timestamptz? | |
| started_at | timestamptz | default now() |
| completed_at | timestamptz? | |
| fail_reason | text? | |
| **index** | (status, scheduled_at) partial WHERE status='active' | hot path for cron |
| **index** | (contact_id, campaign_id, status) | prevent dupe active enrollment |
| **unique** | (campaign_id, contact_id) WHERE status IN ('active','paused') | DB-level dedup |

### `automation_logs`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| enrollment_id | uuid FK→drip_enrollments | cascade |
| step_index | int | |
| message_id | uuid FK→messages? | null if failed pre-send |
| status | text | `sent`\|`failed`\|`rate_limited`\|`skipped` |
| error | text? | |
| sent_at | timestamptz | default now() |
| **index** | (enrollment_id, sent_at desc) | |
| **index** | (org_id, sent_at desc) | for global log view; denormalize org_id |

## Files
- **Modify:** `backend/prisma/schema.prisma` — append 4 models
- **Create:** `backend/prisma/migrations/{ts}_drip_campaigns/migration.sql` — via `prisma migrate dev --name drip_campaigns`

## Steps
1. Append models to `schema.prisma` in order listed
2. Add relations on `Organization` (`dripCampaigns DripCampaign[]`), `Contact`, `Conversation`, `ZaloAccount`, `MessageTemplate` (optional), `User` (createdBy)
3. Run `pnpm --filter backend exec prisma migrate dev --name drip_campaigns`
4. Verify SQL has partial-unique index for dedup (Prisma may need raw migration edit)
5. Run `pnpm --filter backend exec prisma generate`
6. `tsc --noEmit` to confirm types compile

## Success Criteria
- [ ] Migration applies cleanly on empty + existing DB
- [ ] Prisma client exposes `prisma.dripCampaign`, `dripEnrollment`, `dripStep`, `automationLog`
- [ ] Down-migration SQL present (reversible)
- [ ] No changes to existing 20 models

## Risks
- Partial unique index: Prisma 7 supports `@@unique` w/ no WHERE — may need raw SQL in migration file
- Enum vs text for `status`: chose text for forward-compat; validate in code
