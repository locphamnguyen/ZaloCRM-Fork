# Phase 02 — Block Backend (CRUD, Upload, Send)

**Status:** pending | **Priority:** P1 | **Effort:** 8h | **Blocks:** 01

## Context
Backend module managing Block lifecycle: create/list/update/soft-delete, file upload for image/video/file/card-image, and send-to-conversation operation that resolves attachments + renders variables + dispatches via zca-js.

## Files to Create
- `backend/src/modules/blocks/block-routes.ts` — Fastify routes
- `backend/src/modules/blocks/block-service.ts` — business logic (CRUD, send orchestration)
- `backend/src/modules/blocks/block-renderer.ts` — type-specific render to zca-js calls
- `backend/src/modules/blocks/block-validator.ts` — Zod schemas per type
- `backend/src/modules/blocks/block-storage.ts` — file write/read with org-scoped paths
- `backend/src/modules/blocks/block-types.ts` — TS types for content shapes

## Files to Read (context)
- `backend/src/modules/automation/automation-service.ts` — AutomationContext usage
- `backend/src/modules/chat/*` — current sendMessage implementation, zca-js wrapper
- `backend/src/modules/automation/template-renderer.ts` — variable substitution

## Endpoints

| Method | Path | Auth | Body / Query |
|--------|------|------|--------------|
| GET | `/api/blocks` | JWT | `?type=&q=&page=` |
| GET | `/api/blocks/:id` | JWT | — |
| POST | `/api/blocks` | JWT | `{name, type, content, isShared}` |
| PATCH | `/api/blocks/:id` | JWT | partial |
| DELETE | `/api/blocks/:id` | JWT | (soft) |
| POST | `/api/blocks/:id/attachments` | JWT | multipart file upload |
| DELETE | `/api/blocks/:id/attachments/:attId` | JWT | — |
| POST | `/api/blocks/:id/send` | JWT | `{conversationId}` — render+dispatch |
| POST | `/api/blocks/:id/preview` | JWT | `{contactId}` — return rendered preview JSON |

## Validation Rules
- `name`: 1-200 chars
- `type`: enum
- `content` validated by Zod schema matching type (see `block-types.ts`)
- File upload: max 25MB, MIME allowlist (image/jpeg, image/png, image/webp, video/mp4, video/quicktime, application/pdf, application/zip, etc.), magic-byte sniff via `file-type` package
- Send: conversation must belong to user's org; block must belong to user's org and not soft-deleted

## Storage Layout
```
/var/lib/zalo-crm/files/
  <orgId>/
    blocks/
      <blockId>/
        <attachmentUuid>-<sanitized-filename>
```
- Sanitize filename: strip path separators, normalize unicode
- Store relative path in DB; absolute resolved at read time using `BLOCK_STORAGE_ROOT` env

## Send Flow (POST /api/blocks/:id/send)
1. Load block with attachments; verify org match
2. Load conversation + contact + zaloAccount
3. Build `AutomationTemplateContext` from contact (extend if needed for new variables — but extension is in P03)
4. Per block type:
   - **text**: render content.text → `zca.sendMessage(threadId, rendered)`
   - **html**: strip to plain text fallback (Zalo doesn't render HTML in chat — convert to formatted text); `sendMessage`
   - **image**: render caption; for each attachment → `zca.sendImage(threadId, absPath, {caption})`
   - **video**: similar via `sendVideo` if available, else `sendFile`
   - **file**: `sendFile(threadId, absPath)`
   - **link**: render → `sendMessage` with URL (Zalo auto-previews)
   - **card**: render fields → `sendBankCard` or equivalent (see researcher-260422-2312-zca-js-card-send.md for confirmed API)
5. Persist `Message` rows for each piece
6. Update `Conversation.lastMessageAt`
7. Emit WS event `chat.message.created`
8. Return `{messageIds: [...], rendered: {...}}`

## Implementation Steps
1. Scaffold module dir + register in `backend/src/app.ts`
2. Define Zod schemas in `block-validator.ts`
3. Implement CRUD in service + routes (use Prisma; org-scope every query via `req.user.orgId`)
4. Implement file upload using `@fastify/multipart` (already in deps — verify); enforce size + MIME
5. Implement `block-storage.ts` with `writeAttachment(orgId, blockId, file)` and `getAbsolutePath(att)`
6. Implement `block-renderer.ts` mapping type → zca-js dispatcher
7. Wire `/send` endpoint
8. Add unit tests: validator per type, renderer per type with mocked zca-js
9. Add integration tests: full send flow with test DB + mock zca-js client
10. Add feature flag `BLOCKS_ENABLED` env gate

## Success Criteria
- [ ] All 9 endpoints functional with org isolation enforced
- [ ] Upload rejects oversize, wrong MIME, path-traversal filenames
- [ ] Send produces actual Message rows + WS event
- [ ] Preview returns rendered text without dispatching
- [ ] Soft delete hides from list; hard delete blocked if referenced by drip step
- [ ] Tests >=80% line coverage on module

## Risks
- zca-js card API may not match docs — researcher report needed first
- Large video upload may exceed Fastify default body limit — set `bodyLimit: 26214400` for multipart route
- WS event shape must match existing chat event contract — read `backend/src/modules/chat/chat-ws.ts`

## Rollback
- Drop module dir, unregister routes
- Remove env flag
- Schema/files persist (no data loss); can re-enable later
