/**
 * auto-tag-rule-routes.ts — REST endpoints for auto-tag rules + dry-run test.
 * Auth: authMiddleware on all; requireRole admin on create/update/delete.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { matchesCondition } from './auto-tag-engine.js';

const VALID_EVENTS = ['message_received', 'contact_updated', 'tag_applied'];

export async function autoTagRuleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── List ──────────────────────────────────────────────────────────────────

  app.get('/api/v1/auto-tag-rules', async (request: FastifyRequest) => {
    const user = request.user!;
    const rules = await prisma.autoTagRule.findMany({
      where: { orgId: user.orgId },
      include: { tag: { select: { id: true, name: true, color: true, source: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { rules };
  });

  // ── Create ────────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/auto-tag-rules',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const body = request.body as Record<string, any>;

      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        return reply.status(400).send({ error: 'name_required' });
      }
      if (!body.event || !VALID_EVENTS.includes(body.event)) {
        return reply.status(400).send({ error: 'event_invalid', valid: VALID_EVENTS });
      }
      if (!body.condition || typeof body.condition !== 'object') {
        return reply.status(400).send({ error: 'condition_required' });
      }
      if (!body.tagId || typeof body.tagId !== 'string') {
        return reply.status(400).send({ error: 'tagId_required' });
      }

      // Verify tag belongs to this org
      const tag = await prisma.crmTag.findFirst({ where: { id: body.tagId, orgId: user.orgId } });
      if (!tag) return reply.status(404).send({ error: 'tag_not_found' });

      const rule = await prisma.autoTagRule.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          name: body.name.trim(),
          event: body.event,
          condition: body.condition,
          tagId: body.tagId,
          enabled: body.enabled !== false,
        },
        include: { tag: { select: { id: true, name: true, color: true, source: true } } },
      });
      return reply.status(201).send({ rule });
    },
  );

  // ── Update ────────────────────────────────────────────────────────────────

  app.patch(
    '/api/v1/auto-tag-rules/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;

      const existing = await prisma.autoTagRule.findFirst({ where: { id, orgId: user.orgId } });
      if (!existing) return reply.status(404).send({ error: 'not_found' });

      const data: any = {};
      if (typeof body.name === 'string') data.name = body.name.trim();
      if (body.event && VALID_EVENTS.includes(body.event)) data.event = body.event;
      if (body.condition && typeof body.condition === 'object') data.condition = body.condition;
      if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
      if (typeof body.tagId === 'string') {
        const tag = await prisma.crmTag.findFirst({ where: { id: body.tagId, orgId: user.orgId } });
        if (!tag) return reply.status(404).send({ error: 'tag_not_found' });
        data.tagId = body.tagId;
      }

      const rule = await prisma.autoTagRule.update({
        where: { id },
        data,
        include: { tag: { select: { id: true, name: true, color: true, source: true } } },
      });
      return { rule };
    },
  );

  // ── Delete ────────────────────────────────────────────────────────────────

  app.delete(
    '/api/v1/auto-tag-rules/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const existing = await prisma.autoTagRule.findFirst({ where: { id, orgId: user.orgId } });
      if (!existing) return reply.status(404).send({ error: 'not_found' });
      await prisma.autoTagRule.delete({ where: { id } });
      return reply.status(204).send();
    },
  );

  // ── Dry-run Test ──────────────────────────────────────────────────────────

  app.post(
    '/api/v1/auto-tag-rules/:id/test',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as { sampleEventPayload?: Record<string, any> };

      const rule = await prisma.autoTagRule.findFirst({
        where: { id, orgId: user.orgId },
        include: { tag: { select: { id: true, name: true, color: true, source: true } } },
      });
      if (!rule) return reply.status(404).send({ error: 'not_found' });

      const payload = body.sampleEventPayload ?? {};
      const matched = matchesCondition(rule.condition as any, payload);
      return { matched, rule: { id: rule.id, name: rule.name, event: rule.event }, payload };
    },
  );
}
