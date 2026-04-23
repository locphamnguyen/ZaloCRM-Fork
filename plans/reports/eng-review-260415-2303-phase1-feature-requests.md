# Eng Review — ZaloCRM Feature Requests Phase 1

**Date:** 2026-04-15
**Branch:** `locphamnguyen/fix-setup-vite-pwa`
**Scope:** 15 items total, scoped to Phase 1 (4 items)
**Status:** CLEAN (plan approved)

---

## Scope Decision

15 items across 4 major system boundaries. Accepted 3-phase approach:

- **Phase 1 (Current):** BUG-01, BUG-02, FEATURE-02, FEATURE-07
- **Phase 2 (Workflow):** FEATURE-03, 06, 11, 12
- **Phase 3 (Intelligence):** FEATURE-04, 05, 08, 09, 10, 13
- **Cross-cutting:** FEATURE-01 (Chat UI polish) threads through all phases

---

## Phase 1 Items

### BUG-01: Tin nhắn gửi từ Zalo thật không đồng bộ (Critical)

**Root cause:** zca-js listener handles `isSelf` messages but may not relay messages sent from native Zalo app consistently.

**Approach:** Polling sync — periodically call zca-js API to fetch recent messages, compare with DB, backfill gaps. Every 30-60s per account.

**Files impacted:**
- NEW: `backend/src/modules/zalo/zalo-message-sync.ts`
- MODIFY: `backend/src/modules/zalo/zalo-pool.ts` (start sync per account)
- MODIFY: `backend/src/modules/chat/message-handler.ts` (dedup by zaloMsgId)

**Critical gap:** Rate limit handling needed — silent failure if Zalo blocks API calls.

**Reference:** https://codedao12.gitbook.io/n8n-nodes-ultimate/tong-quan/installation

### BUG-02: Lỗi font tin nhắn đặc biệt (Medium)

**Root cause:** `detectContentType()` doesn't handle QR codes, bank transfers, missed calls, system messages.

**Files impacted:**
- MODIFY: `backend/src/modules/zalo/zalo-message-helpers.ts` (extend detectContentType)
- NEW: `frontend/src/components/chat/SpecialMessageRenderer.vue`
- MODIFY: `frontend/src/components/chat/MessageThread.vue`
- MODIFY: `frontend/src/components/chat/ConversationList.vue` (lastMessagePreview)

### FEATURE-02: Bộ lọc hội thoại nâng cao (High)

**Existing infra:** `isReplied`, `unreadCount`, `lastMessageAt` on Conversation. `tags` JSON on Contact.

**Files impacted:**
- MODIFY: `backend/src/modules/chat/chat-routes.ts` (add filter query params)
- MODIFY: `frontend/src/components/chat/ConversationList.vue` (filter UI)
- MODIFY: `backend/prisma/schema.prisma` (add composite index)

**Perf note:** Need `@@index([orgId, zaloAccountId, isReplied, lastMessageAt])`.

### FEATURE-07: Tin nhắn mẫu / Tin nhắn nhanh (High)

**Existing infra:** `MessageTemplate` model, `template-renderer.ts` (5 vars), `TemplateManager.vue`.

**Gaps:**
- Extend variable map: `crm_name`, `zalo_name`, `phone`, `date`, `custom_field`
- Quick insert UI in chat (`/` shortcut trigger)
- Personal vs team templates (`ownerUserId` nullable column)
- Preview before send

**Files impacted:**
- MODIFY: `backend/prisma/schema.prisma` (add `ownerUserId` to MessageTemplate)
- MODIFY: `backend/src/modules/automation/template-renderer.ts` (extend vars)
- MODIFY: `backend/src/modules/automation/template-routes.ts` (filter by owner)
- NEW: `frontend/src/components/chat/QuickTemplatePopup.vue`
- MODIFY: `frontend/src/components/chat/MessageThread.vue` (insert trigger)

---

## Code Quality Issues Found

1. `message-handler.ts:62-63` — fire-and-forget contact.update without await, `lastActivity` can go stale
2. `template-renderer.ts` — variable syntax mismatch: code uses `{{ }}`, feature request uses `{ }`
3. `automation-service.ts:51` — unsafe JSON cast without runtime validation

## Performance Issues

1. Polling sync rate limits unknown for zca-js — need real-account testing
2. Missing composite index on Conversation for filter queries

## Parallelization

- **Lane A:** BUG-01 + BUG-02 (zalo/ + chat/ modules)
- **Lane B:** FEATURE-02 (chat/ filters — different files)
- **Lane C:** FEATURE-07 (automation/ + chat/ templates)

Low conflict risk: lanes touch different files within shared modules.

---

## Unresolved Questions

1. zca-js API: which method fetches recent conversation messages? Need research from gitbook docs.
2. zca-js rate limits: unknown ceiling per account. Need empirical testing.
3. Special message types: full list of msgType values for QR, bank transfer, missed call, system messages — need zca-js source analysis.
