# Phase 05 — Frontend Intel UI

**Status:** pending | **Effort:** 4h | **Depends:** 02, 03, 04

## Context
Wire up: group view switcher, duplicate alert banner, tag badges + management.

## Files
- Create: `frontend/src/components/chat/GroupViewSwitcher.vue`
- Create: `frontend/src/components/chat/DuplicateAlertBanner.vue`
- Create: `frontend/src/components/chat/TagBadgeList.vue`
- Create: `frontend/src/components/settings/TagManagement.vue`
- Create: `frontend/src/components/settings/AutoTagRules.vue`
- Create: `frontend/src/stores/tags.ts` (Pinia)
- Create: `frontend/src/stores/groupView.ts` (Pinia)
- Create: `frontend/src/api/tags.ts`, `frontend/src/api/group-views.ts`
- Modify: `frontend/src/components/chat/ConversationList.vue` (mount switcher in header; show account avatar per row when in group view mode)
- Modify: `frontend/src/components/chat/ChatContactPanel.vue` (mount DuplicateAlertBanner + TagBadgeList)
- Modify: `frontend/src/router/index.ts` (settings routes)

## Components

### GroupViewSwitcher.vue
- Dropdown: "All accounts" | individual accounts | "+ Group View" submenu
- "+ Create" → modal: name, color, multi-select accounts (chips)
- Edit/delete via context menu
- Emits `update:filter` → ConversationList re-fetches

### DuplicateAlertBanner.vue
Props: `contactId`. On mount → fetch `/contacts/:id/duplicate-peers`. If empty → render nothing.
```
⚠️ Khách này kết nối với 2 nick khác:
   • Zalo Sale Hương  [Mở hội thoại →]   (or no link if !conversationId)
   • Zalo Sale Mai     (chỉ xem được tên)
```
Yellow border, dismissible per-session (sessionStorage key `dupbanner:dismissed:{contactId}`).

### TagBadgeList.vue
Props: `contactId`. Render two rows:
- **Zalo tags** (icon: Zalo logo, blue): `[●] Khách VIP` `[●] Tiềm năng`
- **CRM tags** (icon: tag glyph, gray): `[#] hot-lead` `[#] đã-phản-hồi`
Click `+` → searchable picker. Click `×` on badge → confirm + delete (queues Zalo sync if Zalo tag).

### TagManagement.vue (settings page)
Two tabs: CRM Tags | Zalo Tags. Table with name, color picker, usage count. Inline edit.

### AutoTagRules.vue (settings page)
List rules with on/off toggle. Modal builder: trigger event, condition (simple form: keyword contains | status in | score gte), target tag, dry-run preview.

## ConversationList.vue Changes
- Header slot: `<GroupViewSwitcher v-model="activeView" />`
- Row: if `activeView.kind === 'group-view'` → small account avatar (12px) bottom-right of contact avatar
- Reply: existing path (uses conversation.zaloAccountId) — no change

## Stores

```ts
// stores/groupView.ts
export const useGroupViewStore = defineStore('groupView', {
  state: () => ({ views: [] as GroupView[], active: null as GroupView | null }),
  actions: {
    async load() { this.views = await api.list(); },
    async create(payload) { ... },
    async setActive(id) { ... },
  },
});

// stores/tags.ts
export const useTagsStore = defineStore('tags', {
  state: () => ({ crmTags: [], zaloTags: [], rules: [] }),
  actions: { loadAll(), createTag(), assignToContact(), runRuleTest() },
});
```

## Steps
1. Build API clients (axios wrappers).
2. Build stores.
3. Build leaf components (TagBadgeList, DuplicateAlertBanner) in isolation; smoke test.
4. Build GroupViewSwitcher; integrate into ConversationList.
5. Build settings pages (TagManagement, AutoTagRules); add router entries.
6. Wire ChatContactPanel to mount banner + badges.
7. E2E manual: create group view, switch, send reply, verify correct account.

## Success Criteria
- [ ] Switcher lists user's group views; switching re-fetches list
- [ ] Group-view rows visibly tagged with originating account
- [ ] Reply from group view sends from correct account (verified via Network tab → URL contains correct conversationId)
- [ ] Duplicate banner shows on contacts with peers; hidden otherwise
- [ ] Banner links navigate to peer conversation only when accessible
- [ ] Tag badges render Zalo vs CRM with distinct icons/colors
- [ ] Adding/removing Zalo tag triggers backend queue (verified via DB)
- [ ] Auto-tag rule builder saves valid rule; dry-run returns expected match

## Risks
- ConversationList already complex — minimize edits, prefer slots/composition.
- Group view switcher state needs to coexist with existing tab/account filter; clarify precedence (group view overrides single-account filter).
- Tag picker UX on long lists — add search input + virtualize if >50 tags.
