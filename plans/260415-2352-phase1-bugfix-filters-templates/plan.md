# Phase 1 — BUG Fixes + Filters + Templates

**Branch:** `locphamnguyen/fix-setup-vite-pwa`
**Date:** 2026-04-15
**Status:** Planning

---

## Phases

| # | Phase | Status | Priority |
|---|-------|--------|----------|
| 01 | [BUG-01: Message Sync Fix](./phase-01-message-sync-fix.md) | Pending | Critical |
| 02 | [BUG-02: Special Message Types](./phase-02-special-message-types.md) | Pending | Medium |
| 03 | [FEATURE-02: Conversation Filters](./phase-03-conversation-filters.md) | Pending | High |
| 04 | [FEATURE-07: Template Quick-Insert](./phase-04-template-quick-insert.md) | Pending | High |
| 05 | [Vite Setup Fix](./phase-05-vite-setup-fix.md) | Pending | Blocker |

## Execution Order

```
Phase 05 (vite fix) ──► THEN parallel:
                        ├─ Lane A: Phase 01 (msg sync — backend only)
                        ├─ Lane B: Phase 02 (special msgs — backend + frontend)
                        ├─ Lane C: Phase 03 (filters — backend + frontend)
                        └─ Lane D: Phase 04 (templates — backend + frontend)
```

Phase 05 is the blocker — frontend npm install fails without it.
After that, all 4 phases touch different files and can run in parallel.

### File Ownership (no conflicts)

| Lane | Backend files | Frontend files |
|------|--------------|----------------|
| A (msg sync) | `zalo-pool.ts`, `zalo-listener-factory.ts`, `message-handler.ts`, NEW `zalo-message-sync.ts` | — |
| B (special msgs) | `zalo-message-helpers.ts` | `ConversationList.vue` (lastMessagePreview only), NEW `special-message-renderer.vue`, `MessageThread.vue` (renderer import) |
| C (filters) | `chat-routes.ts`, `schema.prisma` (Conversation index) | `ConversationList.vue` (filter bar only) |
| D (templates) | `template-renderer.ts`, `template-routes.ts`, `schema.prisma` (MessageTemplate owner) | NEW `quick-template-popup.vue`, `MessageThread.vue` (popup trigger) |

**Conflict notes:**
- `ConversationList.vue`: Lane B edits `lastMessagePreview()`, Lane C adds filter bar — different sections, merge clean
- `MessageThread.vue`: Lane B adds renderer import, Lane D adds popup trigger — different sections, merge clean
- `schema.prisma`: Lane C adds Conversation index, Lane D adds MessageTemplate column — different models, merge clean

## Research Reports

- [zca-js API Research](../reports/researcher-260415-2352-zca-js-api.md)
- [n8n Zalo Integration](../reports/researcher-260415-2352-n8n-zalo-integration.md)
- [Eng Review](../reports/eng-review-260415-2303-phase1-feature-requests.md)
- [TODOs](../reports/todos-260415-2303-phase1.md)

## Key Discoveries

1. zca-js has `selfListen` option — enables receiving own sent messages
2. `old_messages` listener event delivers historical messages on reconnect
3. `getGroupChatHistory(groupId, count)` fetches group message history
4. `custom` API allows registering arbitrary Zalo API calls
5. No `getUserChatHistory` exists — need custom API or polling for 1:1 backup
6. `sendBankCard`, `getLabels`, `getQuickMessageList` APIs exist in zca-js
