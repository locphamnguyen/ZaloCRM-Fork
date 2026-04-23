# Phase 05 — Frontend: Block Library, Block Picker, Custom Attrs UI

**Status:** pending | **Priority:** P1 | **Effort:** 8h | **Blocks:** 02, 03

## Context
Vue 3 + Vuetify UIs for: Block library management, in-chat Block picker, custom attribute schema admin, contact attr editor.

## Files to Create
- `frontend/src/views/Blocks/BlockLibraryView.vue` — list + search + filters
- `frontend/src/views/Blocks/BlockEditor.vue` — type-aware form (text/html/image/.../card)
- `frontend/src/components/Blocks/BlockTypeSelector.vue`
- `frontend/src/components/Blocks/BlockPreview.vue` — render with sample contact
- `frontend/src/components/Chat/BlockPicker.vue` — popover in chat input
- `frontend/src/views/Settings/CustomAttrsView.vue` — list/create/edit defs
- `frontend/src/components/Contacts/CustomAttrsEditor.vue` — embedded in contact detail
- `frontend/src/views/Settings/ApiKeysView.vue` — manage public API keys
- `frontend/src/api/blocks.ts`, `frontend/src/api/custom-attrs.ts`, `frontend/src/api/api-keys.ts`
- `frontend/src/stores/blocks.ts` (Pinia), `frontend/src/stores/custom-attrs.ts`

## Files to Modify
- `frontend/src/router/index.ts` — add routes `/blocks`, `/settings/custom-attrs`, `/settings/api-keys`
- `frontend/src/layouts/MainLayout.vue` (or nav file) — add nav entries
- Existing chat input component (find in `frontend/src/views/Chat/` or `components/Chat/`) — add Block picker button next to template picker

## UI Specs

### BlockLibraryView
- Toolbar: search, filter by type (chips), "+ New Block"
- Grid/list of cards: icon (per type), name, type badge, last updated, actions (edit/duplicate/delete)
- Empty state with CTA

### BlockEditor (type-aware)
- Common: name, isShared toggle
- Per type:
  - text: textarea + variable insert dropdown
  - html: rich editor (reuse existing if any; else `v-textarea` with HTML preview pane)
  - image/video/file: dropzone (multi for image/file, single for video), thumbnail strip, caption textarea
  - link: URL input + auto-fetch title/thumbnail (server endpoint optional; defer to manual entry)
  - card: image upload, title input, description textarea, CTA text + URL
- Variable picker chip-list: `{crm_name}` `{phone}` `{date}` + custom attrs from store
- Live preview pane (calls `POST /api/blocks/:id/preview` with selected sample contact)

### BlockPicker (in chat)
- Floating button "📦 Block" next to template picker
- Popover: search + recent + categories
- Click block → show preview with current contact's data → "Send" confirm
- On send: `POST /api/blocks/:id/send {conversationId}` → optimistic message append → WS confirms

### CustomAttrsView
- Table: key | label | dataType | required | actions
- Modal "+ New Attr": key (snake_case validated), label, dataType select, enum values (chip input when enum), required toggle
- Edit: label/required/enumValues editable; key + dataType readonly with tooltip
- Delete: confirm + warning if values exist on contacts

### CustomAttrsEditor (in contact detail)
- Render input per dataType: text, number, date picker, switch, select (enum)
- Save on blur (debounced) → `PATCH /api/contacts/:id/custom-attrs`
- Show validation errors inline

### ApiKeysView
- Table: name | prefix | createdAt | lastUsedAt | actions (revoke)
- "+ Create": name input → returns full key in modal with copy button + warning "Save now, won't show again"
- Revoke: confirm dialog

## Implementation Steps
1. Scaffold routes + nav entries
2. Build api clients (`api/blocks.ts` etc.) — Axios with bearer token
3. Build Pinia stores for blocks + custom-attrs (load once per session, refresh on mutation)
4. Build BlockLibraryView with list + search
5. Build BlockEditor with type-aware sections (one component per type or v-if branches)
6. Build file upload component reused by image/video/file/card types
7. Build BlockPicker, integrate into chat input
8. Build CustomAttrsView + Editor
9. Build CustomAttrsEditor for contact detail page (find page, embed)
10. Build ApiKeysView
11. Add feature flag check (read from app config endpoint)
12. Manual E2E smoke: create block → send → message appears in Zalo (live test on staging account)

## Success Criteria
- [ ] User creates "Bảng giá 2PN" card block in <60s
- [ ] User sends block to KH from chat in <3 clicks
- [ ] Preview matches what KH receives
- [ ] Custom attr changes reflect in template preview live
- [ ] Created API key copyable + warned about one-time display
- [ ] Mobile-responsive (Vuetify breakpoints)
- [ ] No console errors in production build

## Risks
- HTML block rendering parity (Zalo strips HTML) — set expectation in UI: "HTML hiển thị dạng văn bản trên Zalo"
- File upload UX during slow networks — show progress + cancel
- Block picker popover z-index conflicts with chat — test thoroughly
- Custom attrs UI may overwhelm contact detail page — collapse into tab/accordion

## Rollback
- Hide nav entries via feature flag (env `VITE_BLOCKS_ENABLED=false`)
- Routes still defined but unreachable from UI
- Bundle ships safely; backend already gated independently
