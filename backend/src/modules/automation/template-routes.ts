import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { logger } from '../../shared/utils/logger.js';

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/automation/templates', async (request: FastifyRequest) => {
    const user = request.user!;
    const templates = await prisma.messageTemplate.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'desc' },
    });
    return { templates };
  });

  app.post('/api/v1/automation/templates', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = request.body as Record<string, any>;
      if (!body.name || typeof body.name !== 'string') return reply.status(400).send({ error: 'name is required' });
      if (!body.content || typeof body.content !== 'string') return reply.status(400).send({ error: 'content is required' });
      const template = await prisma.messageTemplate.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          name: body.name,
          content: body.content,
          category: body.category || null,
        },
      });
      return reply.status(201).send(template);
    } catch (error) {
      logger.error('[automation] Create template error:', error);
      return reply.status(500).send({ error: 'Failed to create message template' });
    }
  });

  app.put('/api/v1/automation/templates/:id', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;
      const existing = await prisma.messageTemplate.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Message template not found' });

      const template = await prisma.messageTemplate.update({
        where: { id },
        data: { name: body.name, content: body.content, category: body.category || null },
      });
      return template;
    } catch (error) {
      logger.error('[automation] Update template error:', error);
      return reply.status(500).send({ error: 'Failed to update message template' });
    }
  });

  app.delete('/api/v1/automation/templates/:id', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const existing = await prisma.messageTemplate.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Message template not found' });
      await prisma.messageTemplate.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      logger.error('[automation] Delete template error:', error);
      return reply.status(500).send({ error: 'Failed to delete message template' });
    }
  });
}
