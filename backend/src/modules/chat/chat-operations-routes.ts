/**
 * chat-operations-routes.ts — Extended chat operations: reactions, typing, delete/undo/edit,
 * forward, pin/unpin, sticker, link, card. All ported from openzca CLI capabilities.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { zaloOps, ZaloOpError } from '../../shared/zalo-operations.js';
import { eventBuffer } from '../../shared/event-buffer.js';
import { logger } from '../../shared/utils/logger.js';

// Emoji aliases for reactions
const REACTION_MAP: Record<string, string> = {
  heart: '❤️',
  like: '👍',
  haha: '😆',
  wow: '😮',
  sad: '😭',
  angry: '😡',
};

function mapReaction(r: string): string {
  return REACTION_MAP[r.toLowerCase()] ?? r;
}

// Shared conversation lookup — returns 404 reply when missing
async function getConversation(id: string, orgId: string, reply: FastifyReply) {
  const conv = await prisma.conversation.findFirst({ where: { id, orgId } });
  if (!conv) { reply.status(404).send({ error: 'Conversation not found' }); return null; }
  return conv;
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof ZaloOpError) return reply.status(err.statusCode).send({ error: err.message });
  logger.error('[chat-ops] Unexpected error:', err);
  return reply.status(500).send({ error: 'Internal server error' });
}

export async function chatOperationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  const chatAccess = { preHandler: requireZaloAccess('chat') };

  // ── POST /reactions ──────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/reactions', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { msgId, cliMsgId, reaction } = request.body as { msgId: string; cliMsgId?: string; reaction: string };

    if (!msgId || !reaction) return reply.status(400).send({ error: 'msgId and reaction required' });

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      const result = await zaloOps.addReaction(
        conv.zaloAccountId,
        mapReaction(reaction),
        { msgId, cliMsgId, threadId: conv.externalThreadId || '', threadType },
      );
      eventBuffer.recordReaction(id, msgId, user.id, user.email, reaction, 'add');
      // Persist reaction to database so it survives page reload
      await prisma.messageReaction.upsert({
        where: { messageId_reactorId: { messageId: msgId, reactorId: user.id } },
        update: { emoji: mapReaction(reaction) },
        create: {
          id: randomUUID(),
          messageId: msgId,
          reactorId: user.id,
          emoji: mapReaction(reaction),
        },
      });
      return { success: true, result };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /typing ─────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/typing', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      await zaloOps.sendTypingEvent(conv.zaloAccountId, conv.externalThreadId || '', threadType);
      eventBuffer.recordTyping(id, user.id, user.email);
      return { success: true };
    } catch (err) { return handleError(err, reply); }
  });

  // ── DELETE /messages/:msgId ──────────────────────────────────────────────────
  app.delete('/api/v1/conversations/:id/messages/:msgId', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, msgId } = request.params as { id: string; msgId: string };
    const { cliMsgId, ownerId: ownerIdParam, onlyMe = false } = (request.body ?? {}) as { cliMsgId?: string; ownerId?: string; onlyMe?: boolean };

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      let ownerId = ownerIdParam ?? '';
      if (!ownerId) {
        const msg = await prisma.message.findFirst({ where: { id: msgId }, select: { senderUid: true } });
        ownerId = msg?.senderUid || '';
      }

      const threadType = conv.threadType === 'group' ? 1 : 0;
      await zaloOps.deleteMessage(conv.zaloAccountId, msgId, cliMsgId || '', ownerId, conv.externalThreadId || '', threadType, onlyMe);

      if (!onlyMe) {
        await prisma.message.update({ where: { id: msgId }, data: { isDeleted: true, deletedAt: new Date() } });
      }

      const io = (app as any).io as Server;
      io?.emit('chat:deleted', { conversationId: id, msgId });
      return { success: true };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /messages/:msgId/undo ───────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/messages/:msgId/undo', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, msgId } = request.params as { id: string; msgId: string };
    const { cliMsgId } = (request.body ?? {}) as { cliMsgId?: string };

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      const msg = await prisma.message.findFirst({ where: { id: msgId }, select: { senderUid: true } });
      const ownerId = msg?.senderUid || '';
      const threadType = conv.threadType === 'group' ? 1 : 0;

      await zaloOps.undoMessage(conv.zaloAccountId, msgId, cliMsgId || '', ownerId, conv.externalThreadId || '', threadType);
      await prisma.message.update({ where: { id: msgId }, data: { isDeleted: true, deletedAt: new Date() } });

      const io = (app as any).io as Server;
      io?.emit('chat:deleted', { conversationId: id, msgId });
      return { success: true };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /messages/:msgId/edit ───────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/messages/:msgId/edit', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, msgId } = request.params as { id: string; msgId: string };
    const { content, cliMsgId } = request.body as { content: string; cliMsgId?: string };

    if (!content?.trim()) return reply.status(400).send({ error: 'content required' });

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      // Verify the message belongs to the requesting user
      const msg = await prisma.message.findFirst({ where: { id: msgId, conversationId: id }, select: { repliedByUserId: true } });
      if (!msg) return reply.status(404).send({ error: 'Message not found' });
      if (msg.repliedByUserId !== user.id) return reply.status(403).send({ error: 'Can only edit your own messages' });

      const threadType = conv.threadType === 'group' ? 1 : 0;
      await zaloOps.editMessage(conv.zaloAccountId, msgId, cliMsgId || '', content, conv.externalThreadId || '', threadType);
      await prisma.message.update({ where: { id: msgId }, data: { content, updatedAt: new Date() } });

      const io = (app as any).io as Server;
      io?.emit('chat:message-edited', { conversationId: id, msgId, content });
      return { success: true };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /forward ────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/forward', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { msgId, targetConversationIds } = request.body as { msgId: string; targetConversationIds: string[] };

    if (!msgId || !targetConversationIds?.length) {
      return reply.status(400).send({ error: 'msgId and targetConversationIds required' });
    }

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      // Batch-fetch all targets to avoid N+1 queries
      const targets = await prisma.conversation.findMany({
        where: { id: { in: targetConversationIds }, orgId: user.orgId },
        select: { id: true, threadType: true, externalThreadId: true },
      });

      let forwarded = 0;
      for (const target of targets) {
        const threadType = target.threadType === 'group' ? 1 : 0;
        await zaloOps.forwardMessage(conv.zaloAccountId, msgId, target.externalThreadId || '', threadType);
        forwarded++;
      }
      return { success: true, forwarded };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /pin ────────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/pin', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      const result = await zaloOps.pinConversation(conv.zaloAccountId, true, conv.externalThreadId || '', threadType);
      const io = (app as any).io as Server;
      io?.emit('chat:pinned', { conversationId: id });
      return { success: true, result };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /unpin ──────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/unpin', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      const result = await zaloOps.pinConversation(conv.zaloAccountId, false, conv.externalThreadId || '', threadType);
      const io = (app as any).io as Server;
      io?.emit('chat:unpinned', { conversationId: id });
      return { success: true, result };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /sticker ────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/sticker', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { stickerId } = request.body as { stickerId: number };

    if (!stickerId) return reply.status(400).send({ error: 'stickerId required' });

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      const result = await zaloOps.sendSticker(conv.zaloAccountId, stickerId, conv.externalThreadId || '', threadType);

      await prisma.message.create({
        data: {
          id: randomUUID(),
          conversationId: id,
          senderType: 'self',
          senderUid: '',
          senderName: 'Staff',
          content: String(stickerId),
          contentType: 'sticker',
          sentAt: new Date(),
          repliedByUserId: user.id,
        },
      });

      return { success: true, result };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /link ───────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/link', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { url } = request.body as { url: string };

    if (!url?.trim()) return reply.status(400).send({ error: 'url required' });

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      const result = await zaloOps.sendLink(conv.zaloAccountId, conv.externalThreadId || '', threadType, { link: url });

      await prisma.message.create({
        data: {
          id: randomUUID(),
          conversationId: id,
          senderType: 'self',
          senderUid: '',
          senderName: 'Staff',
          content: url,
          contentType: 'link',
          sentAt: new Date(),
          repliedByUserId: user.id,
        },
      });

      return { success: true, result };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /card ───────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/card', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { contactId } = request.body as { contactId: string };

    if (!contactId?.trim()) return reply.status(400).send({ error: 'contactId required' });

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      const result = await zaloOps.sendCard(conv.zaloAccountId, conv.externalThreadId || '', threadType, contactId);

      await prisma.message.create({
        data: {
          id: randomUUID(),
          conversationId: id,
          senderType: 'self',
          senderUid: '',
          senderName: 'Staff',
          content: contactId,
          contentType: 'contact_card',
          sentAt: new Date(),
          repliedByUserId: user.id,
        },
      });

      return { success: true, result };
    } catch (err) { return handleError(err, reply); }
  });
}
