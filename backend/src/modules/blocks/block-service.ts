/**
 * block-service.ts — CRUD operations and send orchestration for Blocks.
 * All operations are org-scoped via user.orgId.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { renderBlockForSend } from './block-renderer.js';
import type { BlockType, AnyBlockContent } from './block-types.js';
import type { AutomationTemplateContext } from '../automation/template-renderer.js';
import type { Server } from 'socket.io';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BlockCreateInput {
  name: string;
  type: BlockType;
  content: AnyBlockContent;
  isShared?: boolean;
  ownerUserId?: string;
}

export interface BlockUpdateInput {
  name?: string;
  content?: AnyBlockContent;
  isShared?: boolean;
}

export interface BlockListOptions {
  orgId: string;
  type?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface SendBlockResult {
  messageIds: string[];
  rendered: { items: { kind: string; text: string }[] };
}

// ── CRUD ───────────────────────────────────────────────────────────────────

export async function listBlocks(opts: BlockListOptions) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const where: Record<string, unknown> = { orgId: opts.orgId, deletedAt: null };
  if (opts.type) where.type = opts.type;
  if (opts.q) where.name = { contains: opts.q, mode: 'insensitive' };

  const [blocks, total] = await Promise.all([
    prisma.block.findMany({
      where,
      include: { attachments: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.block.count({ where }),
  ]);

  return { blocks, total, page, limit };
}

export async function getBlock(id: string, orgId: string) {
  return prisma.block.findFirst({
    where: { id, orgId, deletedAt: null },
    include: { attachments: { orderBy: { position: 'asc' } } },
  });
}

export async function createBlock(orgId: string, input: BlockCreateInput) {
  return prisma.block.create({
    data: {
      id: randomUUID(),
      orgId,
      ownerUserId: input.ownerUserId ?? null,
      name: input.name,
      type: input.type,
      content: input.content as object,
      isShared: input.isShared ?? false,
    },
    include: { attachments: true },
  });
}

export async function updateBlock(id: string, orgId: string, input: BlockUpdateInput) {
  // Verify ownership first
  const existing = await prisma.block.findFirst({ where: { id, orgId, deletedAt: null } });
  if (!existing) return null;

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.content !== undefined) data.content = input.content as object;
  if (input.isShared !== undefined) data.isShared = input.isShared;

  return prisma.block.update({
    where: { id },
    data,
    include: { attachments: { orderBy: { position: 'asc' } } },
  });
}

export async function softDeleteBlock(id: string, orgId: string): Promise<boolean> {
  const existing = await prisma.block.findFirst({ where: { id, orgId, deletedAt: null } });
  if (!existing) return false;
  await prisma.block.update({ where: { id }, data: { deletedAt: new Date() } });
  return true;
}

// ── Attachments ────────────────────────────────────────────────────────────

export async function addAttachment(
  blockId: string,
  orgId: string,
  params: {
    kind: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
    position?: number;
  },
) {
  const block = await prisma.block.findFirst({ where: { id: blockId, orgId, deletedAt: null } });
  if (!block) return null;

  // Determine next position if not provided
  const position = params.position ?? (await prisma.blockAttachment.count({ where: { blockId } }));

  return prisma.blockAttachment.create({
    data: {
      id: randomUUID(),
      blockId,
      orgId,
      kind: params.kind,
      filename: params.filename,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      storagePath: params.storagePath,
      position,
    },
  });
}

export async function deleteAttachment(attId: string, orgId: string) {
  return prisma.blockAttachment.findFirst({ where: { id: attId, orgId } });
}

export async function removeAttachmentRecord(attId: string) {
  return prisma.blockAttachment.delete({ where: { id: attId } });
}

// ── Send ───────────────────────────────────────────────────────────────────

export async function sendBlockToConversation(
  blockId: string,
  conversationId: string,
  user: { id: string; orgId: string },
  io: Server | null,
): Promise<SendBlockResult> {
  // 1. Load block + attachments (org-scoped)
  const block = await prisma.block.findFirst({
    where: { id: blockId, orgId: user.orgId, deletedAt: null },
    include: { attachments: { orderBy: { position: 'asc' } } },
  });
  if (!block) throw Object.assign(new Error('block_not_found'), { status: 404 });

  // 2. Load conversation + contact + zaloAccount
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId: user.orgId },
    include: {
      contact: true,
      zaloAccount: true,
    },
  });
  if (!conversation) throw Object.assign(new Error('conversation_not_found'), { status: 404 });
  if (!conversation.externalThreadId) {
    throw Object.assign(new Error('conversation_has_no_thread'), { status: 400 });
  }

  // 3. Build template context
  const ctx: AutomationTemplateContext = {
    org: { id: user.orgId, name: null },
    contact: conversation.contact
      ? {
          id: conversation.contact.id,
          fullName: conversation.contact.fullName,
          crmName: conversation.contact.crmName,
          phone: conversation.contact.phone,
          email: null,
          status: conversation.contact.status,
          tags: conversation.contact.tags,
        }
      : null,
    conversation: { id: conversationId },
  };

  // 4. Render block items
  const rendered = renderBlockForSend(
    block.type as BlockType,
    block.content as AnyBlockContent,
    block.attachments,
    ctx,
  );

  // 5. Get zalo instance
  const instance = zaloPool.getInstance(conversation.zaloAccountId);
  if (!instance?.api) {
    throw Object.assign(new Error('zalo_not_connected'), { status: 400 });
  }

  // Rate limit check
  const limits = zaloRateLimiter.checkLimits(conversation.zaloAccountId);
  if (!limits.allowed) {
    throw Object.assign(new Error(limits.reason ?? 'rate_limited'), { status: 429 });
  }

  const threadId = conversation.externalThreadId;
  const threadType = conversation.threadType === 'group' ? 1 : 0;
  const messageIds: string[] = [];

  // 6. Dispatch each rendered item
  for (const item of rendered.items) {
    try {
      zaloRateLimiter.recordSend(conversation.zaloAccountId);

      let sendResult: unknown;
      if (item.kind === 'text' || !item.absPath) {
        // Text or fallback: sendMessage
        sendResult = await instance.api.sendMessage({ msg: item.text || '' }, threadId, threadType);
      } else if (item.kind === 'image' && typeof instance.api.sendImage === 'function') {
        sendResult = await instance.api.sendImage(threadId, item.absPath, { caption: item.text });
      } else if (item.kind === 'file' && typeof instance.api.sendFile === 'function') {
        sendResult = await instance.api.sendFile(threadId, item.absPath);
      } else {
        // Fallback: send filename as text if binary send API unavailable
        const fallbackText = item.text || (item.absPath ? item.absPath.split('/').pop() : '') || '';
        sendResult = await instance.api.sendMessage({ msg: fallbackText }, threadId, threadType);
      }

      const zaloMsgId = String(
        (sendResult as { msgId?: string })?.msgId ||
          (sendResult as { data?: { msgId?: string } })?.data?.msgId ||
          '',
      );

      // 7. Persist Message row
      const message = await prisma.message.create({
        data: {
          id: randomUUID(),
          conversationId,
          zaloMsgId: zaloMsgId || null,
          senderType: 'self',
          senderUid: conversation.zaloAccount?.zaloUid ?? '',
          senderName: 'Staff',
          content: item.text || '[attachment]',
          contentType: item.kind === 'text' ? 'text' : item.kind,
          sentAt: new Date(),
          repliedByUserId: user.id,
        },
      });

      messageIds.push(message.id);

      // 8. Emit WS event (mirror chat-routes pattern)
      io?.emit('chat:message', {
        accountId: conversation.zaloAccountId,
        message,
        conversationId,
      });
    } catch (err) {
      logger.error('[block-service] send item failed', {
        blockId,
        conversationId,
        kind: item.kind,
        error: err instanceof Error ? err.message : String(err),
      });
      throw Object.assign(new Error('send_failed'), { status: 500, cause: err });
    }
  }

  // 9. Update conversation.lastMessageAt
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
  });

  return {
    messageIds,
    rendered: { items: rendered.items.map((i) => ({ kind: i.kind, text: i.text })) },
  };
}

// ── Preview ────────────────────────────────────────────────────────────────

export async function previewBlock(
  blockId: string,
  orgId: string,
  contactId: string | undefined,
) {
  const block = await prisma.block.findFirst({
    where: { id: blockId, orgId, deletedAt: null },
    include: { attachments: { orderBy: { position: 'asc' } } },
  });
  if (!block) return null;

  let ctx: AutomationTemplateContext = { org: { id: orgId, name: null } };

  if (contactId) {
    const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId } });
    if (contact) {
      ctx = {
        ...ctx,
        contact: {
          id: contact.id,
          fullName: contact.fullName,
          crmName: contact.crmName,
          phone: contact.phone,
          email: null,
          status: contact.status,
          tags: contact.tags,
        },
      };
    }
  }

  const rendered = renderBlockForSend(
    block.type as BlockType,
    block.content as AnyBlockContent,
    block.attachments,
    ctx,
  );

  return { block, rendered };
}
