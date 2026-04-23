---
title: "Phase 2b — B2: Content Blocks + Custom Attributes"
description: "Reusable content Block library + custom contact attributes exposed via public REST API"
status: pending
priority: P2
effort: 32h
branch: locphamnguyen/b2-blocks-custom-attrs
tags: [blocks, custom-attrs, public-api, automation, templates]
created: 2026-04-22
---

# Plan — B2: Content Blocks + Custom Attributes

## Goal
Ship two interlinked features extending the templating/automation system:
- **FEATURE-12 Block Library** — reusable content units (Text/HTML/Image/Video/File/Link/Card) used in drip flows AND sent ad-hoc from chat
- **FEATURE-08 Custom Attributes + Public API** — system + Zalo + custom contact attrs, exposed via API-key REST endpoints for n8n/Zapier

## Branch
`locphamnguyen/b2-blocks-custom-attrs` — branched from `main` AFTER B1 (drip campaign) merges its `template-renderer.ts` changes.

## Dependency on B1
B1 owns the **first** modification of `template-renderer.ts` (drip variables). B2 must:
1. Wait for B1 PR to merge OR
2. Use **additive-only** edits to `template-renderer.ts` (only append entries to `TEMPLATE_VARIABLES`, never modify existing keys; never re-type `AutomationTemplateContext` — extend it)

If B1 lands first → straight-forward. If parallel → coordinate via Slack and additive convention.

## Phase Map

| # | Phase | Effort | Blocks | Files Owner |
|---|-------|--------|--------|-------------|
| 01 | Schema & migrations | 4h | — | `backend/prisma/*` |
| 02 | Block backend (CRUD, upload, send) | 8h | 01 | `backend/src/modules/blocks/*` |
| 03 | Custom attrs + template renderer ext | 6h | 01 | `backend/src/modules/contacts/custom-attrs/*`, `template-renderer.ts` (additive) |
| 04 | Public API (api-key auth) | 6h | 01, 03 | `backend/src/modules/public-api/*` |
| 05 | Frontend block library + picker + attrs UI | 8h | 02, 03 | `frontend/src/views/Blocks/*`, `frontend/src/components/Chat/BlockPicker.vue`, `frontend/src/views/Settings/CustomAttrs.vue` |

Critical path: 01 → 02 → 04 → 05 (~ 26h serial). 03 runs parallel with 02 after 01.

## File Ownership (no overlap)
- **Schema**: `backend/prisma/schema.prisma` (owned by P01 only; later phases create migration files in `backend/prisma/migrations/`)
- **Block module**: `backend/src/modules/blocks/` — new dir
- **Custom attrs module**: `backend/src/modules/contacts/custom-attrs/` — new dir
- **Public API**: `backend/src/modules/public-api/` — new dir
- **Template renderer**: `template-renderer.ts` — additive only (P03)
- **Frontend block UI**: `frontend/src/views/Blocks/`, `frontend/src/components/Chat/BlockPicker.vue` — new
- **Frontend attrs UI**: `frontend/src/views/Settings/CustomAttrs.vue` — new
- **API client**: `frontend/src/api/blocks.ts`, `frontend/src/api/custom-attrs.ts` — new

## Data Flow Summary

### Block send (manual, from chat)
```
User clicks Block in BlockPicker → POST /api/blocks/:id/send {conversationId}
  → backend renders block content with template vars (contact ctx)
  → for each attachment: read file from /var/lib/zalo-crm/files/<orgId>/blocks/<blockId>/<filename>
  → call zca-js sendMessage / sendImage / sendFile / sendBankCard
  → persist Message rows
  → emit WS event to update chat
```

### Public API attribute fetch
```
External (n8n) → GET /api/v1/contacts/:id (X-API-Key header)
  → ApiKey middleware validates key, resolves orgId
  → query Contact + custom_attrs JSONB + computed attrs (last_message_date)
  → return JSON with system + zalo + custom attrs
```

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| File upload abuse (large files / wrong MIME) | M | H | Per-file 25MB cap, MIME allowlist, magic-byte sniff, per-org quota |
| Public API key leak | M | H | Hash key at rest (sha256), prefix display only, rate-limit per key, revoke endpoint |
| Custom attr schema drift across org | H | M | Per-org schema definition table; validate writes against schema; reject unknown keys with strict mode flag |
| zca-js sendBankCard signature change | L | H | Wrap in adapter `sendCardBlock()`; pin zca-js version; integration test on staging |
| `template-renderer.ts` merge conflict with B1 | M | M | Additive convention; rebase early; reviewer checks for accidental modifications |
| JSONB indexing perf on large contact tables | M | M | GIN index on `custom_attrs`; document attribute lookup query patterns |
| Block deletion while in use by drip flow | M | M | Soft-delete (`deletedAt`); reject hard delete if referenced; show "in use" count in UI |

## Backwards Compatibility
- Existing `MessageTemplate` rows untouched; Block is new model, separate table.
- `Contact.metadata` JSONB already exists — custom attrs go into NEW dedicated `custom_attrs` JSONB column to avoid clobbering existing metadata usage. Migration sets default `'{}'`.
- `template-renderer.ts` additions only; existing `{{contact.fullName}}` style tokens unchanged. New short-form tokens `{crm_name}`, `{phone}` added as ALIASES (resolve to same source).
- Public API is net-new; no legacy clients.

## Test Matrix

| Layer | Coverage |
|-------|----------|
| Unit | template-renderer alias resolution; custom-attr schema validator; api-key hash/verify; block content renderer per type |
| Integration | block CRUD with org isolation; file upload + storage path; send-block end-to-end against zca-js mock; custom-attr write rejects unknown keys; public-api authn + scopes |
| E2E | Frontend: create block → send from chat → message appears; create custom attr → set on contact → use in template → preview; create API key → call /api/v1/contacts → 200 with attrs |
| Security | API key brute force (rate limit triggers); cross-org block access denied; file path traversal blocked; SQL injection on JSONB keys |

## Rollback Plan
- **Phase 01**: `prisma migrate resolve --rolled-back`; new tables drop cleanly (no FK from existing tables → these new ones except as nullable).
- **Phase 02-04**: feature-flag `BLOCKS_ENABLED`, `PUBLIC_API_ENABLED` env vars wrap routes; flip false to disable without redeploy code.
- **Phase 03**: template-renderer additions are pure additions; remove additions to revert (no behavior change for old tokens).
- **Phase 05**: hide nav entries via feature flag; bundle still ships safely.

## Success Criteria (Observable)
- [ ] Sale user creates Block "Bảng giá 2PN" with image+text+CTA → sends to KH from chat in <3 clicks → KH receives message in Zalo
- [ ] Admin defines custom attr `nhu_cau` (enum: mua/thuê/đầu tư) → assigns value to contact → uses `{nhu_cau}` in drip template → renders correctly
- [ ] External n8n workflow: GET /api/v1/contacts?tag=hot returns paginated JSON with all attrs incl. custom; PATCH updates `nhu_cau`; both auth via X-API-Key
- [ ] All migrations reversible; no prod data loss
- [ ] OpenAPI spec generated and accessible at `/api/v1/docs`
- [ ] Unit + integration tests green; coverage >=80% on new modules

## Unresolved Questions
1. **Block versioning** — when block is edited mid-drip, do already-queued sends use old or new version? (proposal: snapshot at queue time; needs UX decision)
2. **Custom attr deletion** — hard delete attribute definition with existing values? (proposal: soft-delete + 30-day grace)
3. **Public API rate limits** — per-key or per-org? Default RPS? (proposal: 10 RPS per key, 100 RPS per org; configurable)
4. **Card block CTA action** — only URL, or also "open mini-app", "call phone"? (Phase 2b: URL only; defer mini-app)
5. **Variable substitution in HTML block** — sanitize after substitution to prevent XSS via custom-attr values? (proposal: yes, DOMPurify on server before send)
6. **File storage quota** — per-org cap or global? (proposal: per-org 5GB default; metric exposed)
7. **Webhook outbound** (n8n trigger) — in scope? Spec mentions "webhook bên ngoài" but ambiguous. (proposal: defer to B3)

## References
- Feature spec: `.context/attachments/ZaloCRM-Feature-Requests.md` lines 156-180, 243-268
- Existing renderer: `backend/src/modules/automation/template-renderer.ts`
- Existing schema: `backend/prisma/schema.prisma` (Contact L114, MessageTemplate L361)
- Research reports: `plans/reports/researcher-260422-2312-*.md`
