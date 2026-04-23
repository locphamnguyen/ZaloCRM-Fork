# Phase 03 — Custom Attributes + Template Renderer Extension

**Status:** pending | **Priority:** P1 | **Effort:** 6h | **Blocks:** 01

## Context
Per-org custom attribute schema definitions; validation on contact write; expose all attrs (system + zalo + custom) through rendering layer for templates and Block content.

## Files to Create
- `backend/src/modules/contacts/custom-attrs/attr-def-routes.ts` — CRUD definitions
- `backend/src/modules/contacts/custom-attrs/attr-def-service.ts`
- `backend/src/modules/contacts/custom-attrs/attr-validator.ts` — validate value against definition
- `backend/src/modules/contacts/custom-attrs/attr-resolver.ts` — read all attrs for contact (system + zalo + custom)

## Files to Modify
- `backend/src/modules/contacts/contact-service.ts` — on write (create/update), validate `customAttrs` against org definitions
- `backend/src/modules/automation/template-renderer.ts` — **ADDITIVE ONLY** (see B1 conflict note in plan.md)

## Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/custom-attrs` | JWT | list defs for org |
| POST | `/api/custom-attrs` | JWT admin | `{key, label, dataType, enumValues, required}` |
| PATCH | `/api/custom-attrs/:id` | JWT admin | label/required/enumValues editable; key + dataType immutable after creation |
| DELETE | `/api/custom-attrs/:id` | JWT admin | soft-delete |
| PATCH | `/api/contacts/:id/custom-attrs` | JWT | `{key1: value, key2: value}` — partial merge |

## Validation Logic (attr-validator.ts)
```
validateCustomAttrs(orgId, payload) -> {ok, errors}
  - load all defs for org (cache 60s)
  - for each key in payload:
      if key not in defs (and strict mode) -> error "unknown_key"
      validate value matches dataType:
        string: typeof === string, max 1000 chars
        number: finite number
        date: ISO 8601 parseable
        boolean: typeof === boolean
        enum: value in def.enumValues
  - for each required def not in payload AND not in existing -> error "required_missing"
```
Strict mode default: ON. Override per-org via setting `CUSTOM_ATTR_STRICT=false`.

## Template Renderer Extension (additive)

Append to `TEMPLATE_VARIABLES` (do NOT remove/modify existing keys):
```
// Short-form aliases (FEATURE-08 spec uses {crm_name} not {{contact.crmName}})
'crm_name': (ctx) => ctx.contact?.crmName ?? ctx.contact?.fullName ?? '',
'zalo_name': (ctx) => ctx.contact?.zaloName ?? '',
'phone': (ctx) => ctx.contact?.phone ?? '',
'email': (ctx) => ctx.contact?.email ?? '',
'tag': (ctx) => Array.isArray(ctx.contact?.tags) ? (ctx.contact.tags as string[]).join(', ') : '',
'pipeline_status': (ctx) => ctx.contact?.status ?? '',
'created_date': (ctx) => ctx.contact?.createdAt ? new Intl.DateTimeFormat('vi-VN').format(ctx.contact.createdAt) : '',
'last_message_date': (ctx) => ctx.contact?.lastMessageAt ? new Intl.DateTimeFormat('vi-VN').format(ctx.contact.lastMessageAt) : '',
'date': () => new Intl.DateTimeFormat('vi-VN').format(new Date()),
'zalo_avatar': (ctx) => ctx.contact?.avatarUrl ?? '',
'zalo_gender': (ctx) => ctx.contact?.zaloGender ?? '',
'zalo_dob': (ctx) => ctx.contact?.zaloDob ?? '',
```

**Extend (additive) `AutomationTemplateContext`** to optionally include `createdAt`, `lastMessageAt`, `zaloGender`, `zaloDob`, `customAttrs?: Record<string, unknown>`. Extend regex matcher to ALSO accept single-brace `{key}` AND fall back to custom attr lookup:

```
// Pseudocode addition to renderMessageTemplate (pure addition, new exported fn):
export function renderTemplateWithAttrs(content, ctx) {
  // First pass: existing {{contact.x}} via renderMessageTemplate
  let out = renderMessageTemplate(content, ctx);
  // Second pass: short-form {key} → resolver OR custom attr
  out = out.replace(/\{([a-z][a-z0-9_]*)\}/g, (m, key) => {
    if (TEMPLATE_VARIABLES[key]) return TEMPLATE_VARIABLES[key](ctx);
    if (ctx.contact?.customAttrs && key in ctx.contact.customAttrs) {
      return String(ctx.contact.customAttrs[key] ?? '');
    }
    return m; // leave unmatched literal
  });
  return out;
}
```
Callers in B2 (block-renderer, drip-sender) use `renderTemplateWithAttrs`. Existing callers untouched.

## attr-resolver.ts
`getAllAttrs(contactId)` returns flat object `{crm_name, phone, ..., custom: {nhu_cau: ...}}` — used by public-api in P04.

## Implementation Steps
1. Build attr-def CRUD endpoints + service
2. Build validator with caching
3. Wire validator into `contact-service.ts` create/update paths
4. Add `customAttrs` partial-update endpoint
5. Extend template-renderer additively + export `renderTemplateWithAttrs`
6. Update `block-renderer` (P02) to call `renderTemplateWithAttrs`
7. Tests: validator (every dataType + edge cases), renderer (alias resolution, custom attr fallback, unmatched preservation), unique-key enforcement per org

## Success Criteria
- [ ] Admin defines attr "nhu_cau" enum [mua, thue, dau_tu] → assigns to contact → API GET returns it
- [ ] Writing unknown key in strict mode rejected with 400
- [ ] Template `Xin chào {crm_name}, nhu cầu {nhu_cau}` renders correctly with custom attr
- [ ] No regression on existing `{{contact.fullName}}` style tokens
- [ ] No B1 merge conflict (verified via `git diff main` showing only additions to template-renderer.ts)

## Risks
- B1 may rename `AutomationTemplateContext` fields → coordinate via Slack; rebase early
- Adding fields to context may break unrelated callers if not optional → all new fields `?`
- Regex `\{([a-z]...)\}` could collide with literal braces in user content — document; offer escape `\{` (defer if not blocking)

## Rollback
- Remove additive functions; existing renderer untouched
- Drop attr-def tables (Phase 01 rollback)
- Remove validator wiring from contact-service
