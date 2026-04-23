import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { AVAILABLE_VARIABLES } from './template-renderer.js';

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // GET /templates/variables — must be registered before /:id route to avoid shadowing
  app.get('/api/v1/automation/templates/variables', async () => {
    return { variables: AVAILABLE_VARIABLES };
  });

  // GET /templates — list templates visible to current user (team + personal)
  app.get('/api/v1/automation/templates', async (request: FastifyRequest) => {
    const user = request.user!;
    const query = request.query as Record<string, string>;
    const { search, category } = query;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      orgId: user.orgId,
      OR: [
        { ownerUserId: null },       // team templates
        { ownerUserId: user.id },    // my personal templates
      ],
    };

    if (search) {
      where.AND = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
        ],
      };
    }
    if (category) {
      where.category = category;
    }

    const templates = await prisma.messageTemplate.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        content: true,
        category: true,
        ownerUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      templates: templates.map((t) => ({
        ...t,
        isPersonal: t.ownerUserId !== null,
      })),
    };
  });

  app.post('/api/v1/automation/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = request.body as Record<string, unknown>;
      if (!body.name || typeof body.name !== 'string') {
        return reply.status(400).send({ error: 'name is required' });
      }
      if (!body.content || typeof body.content !== 'string') {
        return reply.status(400).send({ error: 'content is required' });
      }

      // ownerUserId: null = team template (admin+), value = personal (any user)
      const isPersonal = body.isPersonal === true;
      const canCreateTeam = ['owner', 'admin'].includes(user.role);
      if (!isPersonal && !canCreateTeam) {
        return reply.status(403).send({ error: 'Only admin/owner can create team templates' });
      }

      const template = await prisma.messageTemplate.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          ownerUserId: isPersonal ? user.id : null,
          name: body.name,
          content: body.content,
          category: typeof body.category === 'string' ? body.category : null,
        },
      });
      return reply.status(201).send({ ...template, isPersonal });
    } catch (error) {
      logger.error('[automation] Create template error:', error);
      return reply.status(500).send({ error: 'Failed to create message template' });
    }
  });

  app.put('/api/v1/automation/templates/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, unknown>;

      const existing = await prisma.messageTemplate.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true, ownerUserId: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Message template not found' });

      // Owner of personal template OR admin/owner can edit team templates
      const isPersonalOwner = existing.ownerUserId === user.id;
      const canEditTeam = ['owner', 'admin'].includes(user.role);
      if (!isPersonalOwner && !canEditTeam) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const template = await prisma.messageTemplate.update({
        where: { id },
        data: {
          name: typeof body.name === 'string' ? body.name : undefined,
          content: typeof body.content === 'string' ? body.content : undefined,
          category: typeof body.category === 'string' ? body.category : null,
        },
      });
      return { ...template, isPersonal: template.ownerUserId !== null };
    } catch (error) {
      logger.error('[automation] Update template error:', error);
      return reply.status(500).send({ error: 'Failed to update message template' });
    }
  });

  app.delete('/api/v1/automation/templates/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const existing = await prisma.messageTemplate.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true, ownerUserId: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Message template not found' });

      const isPersonalOwner = existing.ownerUserId === user.id;
      const canDeleteTeam = ['owner', 'admin'].includes(user.role);
      if (!isPersonalOwner && !canDeleteTeam) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      await prisma.messageTemplate.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      logger.error('[automation] Delete template error:', error);
      return reply.status(500).send({ error: 'Failed to delete message template' });
    }
  });
}
