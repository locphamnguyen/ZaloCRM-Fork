/**
 * block-routes.ts — Fastify REST routes for Block CRUD, upload, and send.
 * Feature-flagged via BLOCKS_ENABLED=true env var (default OFF).
 *
 * Endpoints:
 *   GET    /api/blocks               list (paginated, filterable)
 *   GET    /api/blocks/:id           get single
 *   POST   /api/blocks               create
 *   PATCH  /api/blocks/:id           update
 *   DELETE /api/blocks/:id           soft-delete
 *   POST   /api/blocks/:id/attachments  upload file
 *   DELETE /api/blocks/:id/attachments/:attId  delete attachment
 *   POST   /api/blocks/:id/send      render + dispatch via zca-js
 *   POST   /api/blocks/:id/preview   return rendered preview JSON (no dispatch)
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Server } from 'socket.io';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { ValidationError, validateBlockContent, validateBlockType, validateBlockName } from './block-validator.js';
import { isMimeAllowed, writeAttachment, deleteAttachmentFile } from './block-storage.js';
import {
  listBlocks,
  getBlock,
  createBlock,
  updateBlock,
  softDeleteBlock,
  addAttachment,
  deleteAttachment,
  removeAttachmentRecord,
  sendBlockToConversation,
  previewBlock,
} from './block-service.js';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export async function blockRoutes(app: FastifyInstance): Promise<void> {
  if (process.env.BLOCKS_ENABLED !== 'true') {
    return;
  }

  app.addHook('preHandler', authMiddleware);

  // ── GET /api/blocks ──────────────────────────────────────────────────────
  app.get('/api/blocks', async (request: FastifyRequest) => {
    const user = request.user!;
    const q = request.query as Record<string, string | undefined>;
    const result = await listBlocks({
      orgId: user.orgId,
      type: q.type,
      q: q.q,
      page: q.page ? Number(q.page) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    });
    return result;
  });

  // ── GET /api/blocks/:id ──────────────────────────────────────────────────
  app.get('/api/blocks/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const block = await getBlock(id, user.orgId);
    if (!block) return reply.status(404).send({ error: 'not_found' });
    return { block };
  });

  // ── POST /api/blocks ─────────────────────────────────────────────────────
  app.post('/api/blocks', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = request.body as Record<string, unknown>;

    try {
      const name = validateBlockName(body.name);
      const type = validateBlockType(body.type);
      const content = validateBlockContent(type, body.content ?? {});

      const block = await createBlock(user.orgId, {
        name,
        type,
        content,
        isShared: typeof body.isShared === 'boolean' ? body.isShared : false,
        ownerUserId: user.id,
      });
      return reply.status(201).send({ block });
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.status(400).send({ error: err.message });
      }
      throw err;
    }
  });

  // ── PATCH /api/blocks/:id ────────────────────────────────────────────────
  app.patch('/api/blocks/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    try {
      const input: { name?: string; content?: unknown; isShared?: boolean } = {};

      if (body.name !== undefined) input.name = validateBlockName(body.name);

      // Validate content only if type is also provided or we can infer from existing block
      if (body.content !== undefined) {
        if (body.type !== undefined) {
          const type = validateBlockType(body.type);
          input.content = validateBlockContent(type, body.content);
        } else {
          // Fetch existing to get type for content validation
          const existing = await getBlock(id, user.orgId);
          if (!existing) return reply.status(404).send({ error: 'not_found' });
          const type = validateBlockType(existing.type);
          input.content = validateBlockContent(type, body.content);
        }
      }

      if (typeof body.isShared === 'boolean') input.isShared = body.isShared;

      const block = await updateBlock(id, user.orgId, input as Parameters<typeof updateBlock>[2]);
      if (!block) return reply.status(404).send({ error: 'not_found' });
      return { block };
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.status(400).send({ error: err.message });
      }
      throw err;
    }
  });

  // ── DELETE /api/blocks/:id ───────────────────────────────────────────────
  app.delete('/api/blocks/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const deleted = await softDeleteBlock(id, user.orgId);
    if (!deleted) return reply.status(404).send({ error: 'not_found' });
    return reply.status(204).send();
  });

  // ── POST /api/blocks/:id/attachments ─────────────────────────────────────
  // @fastify/multipart must be registered before this route is called.
  app.post(
    '/api/blocks/:id/attachments',
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id: blockId } = request.params as { id: string };

      // Verify block exists and belongs to org before touching disk
      const block = await getBlock(blockId, user.orgId);
      if (!block) return reply.status(404).send({ error: 'not_found' });

      let data: import('@fastify/multipart').MultipartFile;
      try {
        data = await (request as any).file();
        if (!data) return reply.status(400).send({ error: 'no_file' });
      } catch (err) {
        logger.error('[block-routes] multipart parse error', err);
        return reply.status(400).send({ error: 'multipart_parse_failed' });
      }

      const mimeType = data.mimetype;
      if (!isMimeAllowed(mimeType)) {
        return reply.status(415).send({ error: 'mime_not_allowed' });
      }

      // Buffer the entire file (limit enforced by @fastify/multipart plugin config)
      const buffer = await data.toBuffer();
      if (buffer.length > MAX_FILE_BYTES) {
        return reply.status(413).send({ error: 'file_too_large' });
      }
      if (buffer.length === 0) {
        return reply.status(400).send({ error: 'empty_file' });
      }

      // Determine attachment kind from MIME
      let kind = 'file';
      if (mimeType.startsWith('image/')) kind = 'image';
      else if (mimeType.startsWith('video/')) kind = 'video';

      const { storagePath, filename } = await writeAttachment(
        user.orgId,
        blockId,
        mimeType,
        buffer,
        data.filename || 'upload',
      );

      const att = await addAttachment(blockId, user.orgId, {
        kind,
        filename,
        mimeType,
        sizeBytes: buffer.length,
        storagePath,
      });

      return reply.status(201).send({ attachment: att });
    },
  );

  // ── DELETE /api/blocks/:id/attachments/:attId ────────────────────────────
  app.delete(
    '/api/blocks/:id/attachments/:attId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { attId } = request.params as { id: string; attId: string };

      const att = await deleteAttachment(attId, user.orgId);
      if (!att) return reply.status(404).send({ error: 'not_found' });

      // Remove from disk (non-fatal)
      try {
        await deleteAttachmentFile(att.storagePath);
      } catch (err) {
        logger.warn('[block-routes] failed to delete attachment file', { attId, err });
      }

      await removeAttachmentRecord(attId);
      return reply.status(204).send();
    },
  );

  // ── POST /api/blocks/:id/send ─────────────────────────────────────────────
  app.post(
    '/api/blocks/:id/send',
    { preHandler: requireZaloAccess('chat') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id: blockId } = request.params as { id: string };
      const body = request.body as Record<string, unknown>;

      if (!body.conversationId || typeof body.conversationId !== 'string') {
        return reply.status(400).send({ error: 'conversationId_required' });
      }

      const io = (app as any).io as Server | null;

      try {
        const result = await sendBlockToConversation(blockId, body.conversationId, user, io);
        return result;
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        if (e.status) return reply.status(e.status).send({ error: e.message });
        logger.error('[block-routes] send error', err);
        return reply.status(500).send({ error: 'send_failed' });
      }
    },
  );

  // ── POST /api/blocks/:id/preview ──────────────────────────────────────────
  app.post('/api/blocks/:id/preview', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id: blockId } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const contactId = typeof body.contactId === 'string' ? body.contactId : undefined;

    const result = await previewBlock(blockId, user.orgId, contactId);
    if (!result) return reply.status(404).send({ error: 'not_found' });
    return result;
  });
}
