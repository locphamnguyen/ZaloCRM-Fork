/**
 * tag-routes.ts — REST endpoints for CRM tags + contact-tag links.
 * Auth: authMiddleware on all; requireRole admin for tag CRUD; member can link/unlink.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import {
  listTags, createTag, updateTag, deleteTag,
  getContactTags, linkTagToContact, unlinkTagFromContact,
} from './tag-service.js';
import { enqueueAdd, enqueueRemove } from './zalo-tag-sync-queue.js';
import { prisma } from '../../shared/database/prisma-client.js';

const VALID_SOURCES = ['crm', 'zalo', 'all'];

export async function tagRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Tag CRUD ──────────────────────────────────────────────────────────────

  app.get('/api/v1/tags', async (request: FastifyRequest) => {
    const user = request.user!;
    const q = request.query as Record<string, string>;
    const source = VALID_SOURCES.includes(q.source) ? q.source : 'all';
    const tags = await listTags(user.orgId, source);
    return { tags };
  });

  app.post(
    '/api/v1/tags',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const body = request.body as Record<string, any>;
      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        return reply.status(400).send({ error: 'name_required' });
      }
      if (body.source && !['crm', 'zalo'].includes(body.source)) {
        return reply.status(400).send({ error: 'source_invalid' });
      }
      try {
        const tag = await createTag(user.orgId, {
          name: body.name,
          color: body.color,
          icon: body.icon,
          source: body.source,
        });
        return reply.status(201).send({ tag });
      } catch (err: any) {
        if (err?.code === 'P2002') return reply.status(409).send({ error: 'tag_name_exists' });
        throw err;
      }
    },
  );

  app.patch(
    '/api/v1/tags/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;
      const tag = await updateTag(user.orgId, id, {
        name: body.name,
        color: body.color,
        icon: body.icon,
      });
      if (!tag) return reply.status(404).send({ error: 'not_found' });
      return { tag };
    },
  );

  app.delete(
    '/api/v1/tags/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const deleted = await deleteTag(user.orgId, id);
      if (!deleted) return reply.status(404).send({ error: 'not_found' });
      return reply.status(204).send();
    },
  );

  // ── Contact-Tag Links ─────────────────────────────────────────────────────

  app.get('/api/v1/contacts/:id/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id: contactId } = request.params as { id: string };
    const result = await getContactTags(user.orgId, contactId);
    if (!result) return reply.status(404).send({ error: 'contact_not_found' });
    return { crm: result.crm, zalo: result.zalo };
  });

  app.post('/api/v1/contacts/:id/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id: contactId } = request.params as { id: string };
    const body = request.body as Record<string, any>;
    if (!body.tagId || typeof body.tagId !== 'string') {
      return reply.status(400).send({ error: 'tagId_required' });
    }
    const result = await linkTagToContact(user.orgId, contactId, {
      tagId: body.tagId,
      appliedBy: `user:${user.id}`,
    });
    if (!result) return reply.status(404).send({ error: 'contact_or_tag_not_found' });

    // If Zalo tag + new link → enqueue Zalo sync
    if (result.isNew && result.link.tag?.source === 'zalo') {
      await enqueueZaloSync(contactId, body.tagId, 'add');
    }

    return reply.status(result.isNew ? 201 : 200).send({ link: result.link, isNew: result.isNew });
  });

  app.delete(
    '/api/v1/contacts/:id/tags/:tagId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id: contactId, tagId } = request.params as { id: string; tagId: string };

      // Check if tag is Zalo-sourced before unlinking
      const tag = await prisma.crmTag.findFirst({
        where: { id: tagId, orgId: user.orgId },
        select: { source: true },
      });

      const unlinked = await unlinkTagFromContact(user.orgId, contactId, tagId);
      if (!unlinked) return reply.status(404).send({ error: 'not_found' });

      // Enqueue Zalo removal if Zalo tag
      if (tag?.source === 'zalo') {
        await enqueueZaloSync(contactId, tagId, 'remove');
      }

      return reply.status(204).send();
    },
  );
}

// Helper: look up contact's zaloUid and the tag's labelName, then enqueue
async function enqueueZaloSync(
  contactId: string,
  tagId: string,
  action: 'add' | 'remove',
): Promise<void> {
  try {
    const [contact, tag] = await Promise.all([
      prisma.contact.findUnique({ where: { id: contactId }, select: { zaloUid: true } }),
      prisma.crmTag.findUnique({ where: { id: tagId }, select: { name: true } }),
    ]);
    if (!contact?.zaloUid || !tag?.name) return;

    // Find connected Zalo accounts for this contact's org
    const conversation = await prisma.conversation.findFirst({
      where: { contactId, threadType: 'user' },
      select: { zaloAccountId: true },
    });
    if (!conversation?.zaloAccountId) return;

    if (action === 'add') {
      await enqueueAdd(conversation.zaloAccountId, contact.zaloUid, tag.name);
    } else {
      await enqueueRemove(conversation.zaloAccountId, contact.zaloUid, tag.name);
    }
  } catch {
    // Non-blocking — Zalo sync failure must not break the CRM link operation
  }
}
