---
title: "Phase 2b B3 — Multi-account Intelligence"
description: "Group view across nicks, duplicate customer alert, dual tag system (Zalo + CRM)"
status: pending
priority: P2
effort: 22h
branch: locphamnguyen/b3-multi-account-intel
tags: [phase2b, b3, multi-account, tags, duplicate, group-view]
created: 2026-04-22
---

# Phase 2b — B3: Multi-account Intelligence

## Scope
3 read-heavy/additive features. Mostly independent → high parallelism.

| ID | Feature | Effort |
|----|---------|--------|
| FEATURE-04 | Zalo Group View (multi-nick unified inbox) | 5h |
| FEATURE-05 | Duplicate Customer Alert | 4h |
| FEATURE-13 | Dual Tag System (Zalo 2-way sync + CRM internal + auto-rules) | 9h |
| Frontend Intel UI | Switcher + banner + tag badges + mgmt | 4h |

## Phases

| # | Phase | Status | Effort | Blocks |
|---|-------|--------|--------|--------|
| 01 | [Schema migrations](phase-01-schema.md) | pending | 2h | — |
| 02 | [Group View backend](phase-02-group-view-backend.md) | pending | 4h | 01 |
| 03 | [Duplicate detection](phase-03-duplicate-detection.md) | pending | 3h | 01 |
| 04 | [Tag system + sync worker](phase-04-tag-system.md) | pending | 9h | 01 |
| 05 | [Frontend intel UI](phase-05-frontend-intel-ui.md) | pending | 4h | 02,03,04 |

## Parallelization
After phase 01 lands, **02 / 03 / 04** can run in parallel (disjoint files).
Phase 05 is the integration point and runs last.

## File Ownership Map (no overlap)

| Phase | Backend files | Frontend files |
|-------|--------------|----------------|
| 01 | `prisma/schema.prisma`, new migration dir | — |
| 02 | `modules/zalo/group-view-routes.ts` (new), `modules/zalo/group-view-service.ts` (new) | — |
| 03 | `modules/contacts/duplicate-alert-service.ts` (new), `modules/contacts/contact-routes.ts` (add 1 endpoint) | — |
| 04 | `modules/tags/*` (new dir), `modules/tags/zalo-tag-sync-worker.ts` (new), `modules/tags/auto-tag-engine.ts` (new), `index.ts` (register routes) | — |
| 05 | — | `components/chat/GroupViewSwitcher.vue` (new), `components/chat/DuplicateAlertBanner.vue` (new), `components/chat/TagBadgeList.vue` (new), `components/settings/TagManagement.vue` (new), `components/chat/ConversationList.vue` (banner+badge slots), `components/chat/ChatContactPanel.vue` (banner mount), `stores/tags.ts` (new), `stores/groupView.ts` (new) |

Conflict watch: `ConversationList.vue` is touched by phase 05 only. Other branches must rebase if they edit it.

## Data Flows (system-level)

**Group View read flow**:
User → `GET /api/v1/group-views/:id/conversations?cursor=` → `group-view-service.listConversations(viewId, userId)` → joins `ZaloGroupView.accountIds` → `Conversation.where({ zaloAccountId: in [...] })` → applies `requireZaloAccess` filter (only accounts user can read) → returns merged paginated list with `accountId` annotation per row.

**Group View send flow**:
Reply uses existing `POST /api/v1/conversations/:id/messages` — already account-scoped. Group view is **read-merge only**; sends route through originating conversation's account. No new send path.

**Duplicate Alert flow**:
On conversation open → `GET /api/v1/contacts/:id/duplicate-peers` → service queries `Contact.where({ orgId, OR: [phone, zaloUid] match, NOT id })` → for each peer fetches `Conversation.where({ contactId: peer.id })` filtered by `requireZaloAccess` (drops conversations user cannot read) → returns list `[{ contactId, accountDisplayName, conversationId | null }]`. If conversationId null → user has no access → show name only, no link.

**Tag sync flow** (Zalo → CRM):
`zalo-tag-sync-worker` runs per-account every 15min (cron). Calls `api.fetchAccountInfo()` or label-equivalent from zca-js (TBD by researcher) → diffs against `ZaloTagSnapshot` table → writes new/changed labels → upserts `ContactTag(source=zalo)` rows.

**Tag sync flow** (CRM → Zalo):
User toggles Zalo-tag in UI → `PATCH /api/v1/contacts/:id/zalo-tags` → enqueues job in `ZaloTagSyncQueue` → worker batches per account, respects rate limit (5/30s), calls zca-js label-update → on success updates snapshot. Last-write-wins via `updatedAt` comparison.

**Auto-tag rule flow**:
On `Message` insert (handler hook) → `auto-tag-engine.evaluate({ event: 'message_received', contactId, messageId })` → loads matching `AutoTagRule` rows → applies CRM tags → emits `tag.applied` event for downstream automation.

## Failure Modes & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Group view leaks conversations user lacks ACL on | M | High | Always run `requireZaloAccess` filter post-query; integration test asserts denied accounts excluded |
| Duplicate alert leaks PII across orgs | L | High | All queries scoped by `orgId` from JWT; never accept orgId from client |
| Zalo tag sync conflict (both sides changed) | M | M | Last-write-wins by `updatedAt`; log conflict to `audit_log` |
| zca-js label API absent/different signature | M | High | **Spike first** (researcher task A). Fallback: CRM tags only, mark Zalo sync as TBD |
| Auto-tag rule infinite loop (rule triggers itself) | L | M | Rule engine flags `appliedTagIds` per evaluation; rules only fire on `message_received`, not `tag_applied` |
| Phone normalization misses (Vietnamese formats: +84/84/0) | H | M | Centralize in `normalizePhone()` helper; reuse from `duplicate-detector.ts:normPhone`; researcher B confirms patterns |
| Migration adds heavy index on prod | L | M | Use `CREATE INDEX CONCURRENTLY` or run during low-traffic window |
| Group view N+1 on account display name | M | L | `include: { zaloAccount: { select: { displayName, avatarUrl } } }` in single query |

## Backwards Compatibility
- `Contact.tags` JSON kept untouched (other code reads it). New `ContactTagLink` table is additive. Migration script copies existing tag strings → CRM tag rows.
- Existing auto-tagger (`auto-tagger.ts`) still runs untouched; new auto-tag-engine sits beside it (different scope: rule-based vs score-based).
- No breaking changes to chat-routes API. New endpoints under `/api/v1/group-views/`, `/api/v1/contacts/:id/duplicate-peers`, `/api/v1/tags/*`.

## Test Matrix

| Layer | Group View | Duplicate Alert | Tag System |
|-------|-----------|-----------------|------------|
| Unit | merge sort by lastMessageAt; ACL filter | normPhone variants; peer query scoping | rule eval; conflict resolution |
| Integration | API returns merged paginated list; user without ACL sees subset | endpoint returns peers with/without conv links | CRM tag CRUD; sync worker dry-run; auto-tag fires on message |
| E2E | switch view, open thread, reply uses correct account | open contact → banner shown → click peer link | toggle Zalo tag → appears in `ZaloTagSyncQueue` |

## Rollback Plan
| Phase | Rollback |
|-------|----------|
| 01 | `prisma migrate resolve --rolled-back` then drop new tables (additive, safe) |
| 02 | Remove route registration in `index.ts`; tables remain unused |
| 03 | Remove route; service file orphaned |
| 04 | Disable cron registration; tables remain; UI gracefully hides |
| 05 | Revert frontend; backend continues to work without UI consumers |

## Success Criteria
- [ ] User creates group view of 3 accounts → sees merged conversation list ordered by lastMessageAt
- [ ] Reply from group view sends from originating account (verified via `Message.zaloAccountId`)
- [ ] User without ACL on account X does NOT see X's conversations even if added to group view
- [ ] Opening contact with shared phone → banner shows other nicks; link present only when ACL allows
- [ ] CRM tag created → searchable, filterable, triggerable by automation
- [ ] Zalo tag toggled in UI → appears in real Zalo within 30s (post worker run)
- [ ] Auto-tag rule "reply → tag responded" fires within 5s of message arrival
- [ ] All endpoints scoped by orgId; no cross-org leaks (integration test)

## Research Tasks (parallel, before phase 04)
1. **Researcher A** — zca-js label/tag API surface. Read existing report `plans/reports/researcher-260415-2352-zca-js-api.md` first. Probe for `getLabels`, `updateLabels`, `addLabel`, `removeLabel`, `friend.tags`. Test on dev account if possible. → `plans/reports/researcher-260422-2312-zca-js-labels.md`
2. **Researcher B** — Vietnamese phone normalization (E.164, +84/84/0 prefixes, viettel/mobi formats). → `plans/reports/researcher-260422-2312-phone-normalization.md`
3. **Researcher C** — Auto-tag rule engine patterns (event-driven, declarative DSL vs hardcoded). Look at how existing `automation/` module structures rules. → `plans/reports/researcher-260422-2312-auto-tag-engine.md`

## Unresolved Questions
1. Does zca-js v2.1.2 expose any label/tag API? (BLOCKER for FEATURE-13 Zalo half — researcher A)
2. Group view scope: user-scoped only, or shareable (team manager creates, members consume read-only)? Spec says user-scoped → confirm.
3. Duplicate alert: include conversations from accounts owned by other users in same org (visible name only) vs hide entirely? Spec implies visible-but-no-link → confirmed in design.
4. CRM tag color/icon: hardcoded palette or user-customizable per tag? (Recommend customizable but defer to UI iteration.)
5. Auto-tag rule storage: JSON DSL in `AutoTagRule.condition` field or separate normalized tables? (Recommend JSON for v1; YAGNI on builder UI.)
6. Tag sync cadence: 15min cron acceptable, or do we want webhook-style if zca-js emits label events? (Defer until researcher A returns.)
