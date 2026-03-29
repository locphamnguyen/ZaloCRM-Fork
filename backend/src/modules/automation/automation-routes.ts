import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { logger } from '../../shared/utils/logger.js';

const VALID_TRIGGERS = ['message_received', 'contact_created', 'status_changed'];

export async function automationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/automation/rules', async (request: FastifyRequest) => {
    const user = request.user!;
    const rules = await prisma.automationRule.findMany({
      where: { orgId: user.orgId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return { rules };
  });

  app.post('/api/v1/automation/rules', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = request.body as Record<string, any>;
      if (!body.name || typeof body.name !== 'string') return reply.status(400).send({ error: 'name is required' });
      if (!body.trigger || !VALID_TRIGGERS.includes(body.trigger)) return reply.status(400).send({ error: `trigger must be one of: ${VALID_TRIGGERS.join(', ')}` });
      const rule = await prisma.automationRule.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          name: body.name,
          description: body.description,
          trigger: body.trigger,
          conditions: Array.isArray(body.conditions) ? body.conditions : [],
          actions: Array.isArray(body.actions) ? body.actions : [],
          enabled: body.enabled ?? true,
          priority: Number(body.priority ?? 0),
        },
      });
      return reply.status(201).send(rule);
    } catch (error) {
      logger.error('[automation] Create rule error:', error);
      return reply.status(500).send({ error: 'Failed to create automation rule' });
    }
  });

  app.put('/api/v1/automation/rules/:id', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;
      if (body.trigger && !VALID_TRIGGERS.includes(body.trigger)) return reply.status(400).send({ error: `trigger must be one of: ${VALID_TRIGGERS.join(', ')}` });
      const existing = await prisma.automationRule.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Automation rule not found' });

      const rule = await prisma.automationRule.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description,
          trigger: body.trigger,
          conditions: Array.isArray(body.conditions) ? body.conditions : undefined,
          actions: Array.isArray(body.actions) ? body.actions : undefined,
          enabled: body.enabled,
          priority: body.priority !== undefined ? Number(body.priority) : undefined,
        },
      });
      return rule;
    } catch (error) {
      logger.error('[automation] Update rule error:', error);
      return reply.status(500).send({ error: 'Failed to update automation rule' });
    }
  });

  app.delete('/api/v1/automation/rules/:id', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const existing = await prisma.automationRule.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Automation rule not found' });
      await prisma.automationRule.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      logger.error('[automation] Delete rule error:', error);
      return reply.status(500).send({ error: 'Failed to delete automation rule' });
    }
  });
}
