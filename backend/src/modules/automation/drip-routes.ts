/**
 * drip-routes.ts — REST API for drip campaign management + enrollment lifecycle.
 * Auth: authMiddleware on all; role gate on destructive ops; zalo-access on send-capable ops.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { enrollContactsBatch } from './drip/drip-enroller.js';
import { nextDayScheduledAt } from './drip/drip-window.js';

const VALID_TRIGGERS = ['manual', 'webhook', 'tag'];

interface StepInput {
  templateId?: string | null;
  content?: string | null;
  dayOffset?: number;
}

function validateSteps(steps: unknown): StepInput[] | null {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const out: StepInput[] = [];
  for (const s of steps) {
    if (!s || typeof s !== 'object') return null;
    const step = s as StepInput;
    if (!step.templateId && (!step.content || typeof step.content !== 'string' || !step.content.trim())) return null;
    out.push(step);
  }
  return out;
}

export async function dripRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ─── Campaigns ─────────────────────────────────────────────────────
  app.get('/api/v1/drip/campaigns', async (request: FastifyRequest) => {
    const user = request.user!;
    const campaigns = await prisma.dripCampaign.findMany({
      where: { orgId: user.orgId },
      include: {
        _count: { select: { enrollments: true, steps: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { campaigns };
  });

  app.get('/api/v1/drip/campaigns/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const campaign = await prisma.dripCampaign.findFirst({
      where: { id, orgId: user.orgId },
      include: {
        steps: { orderBy: { stepIndex: 'asc' } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!campaign) return reply.status(404).send({ error: 'not_found' });
    return { campaign };
  });

  app.post('/api/v1/drip/campaigns', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = request.body as Record<string, any>;
    if (!body.name || typeof body.name !== 'string') return reply.status(400).send({ error: 'name_required' });
    const windowStart = Number.isInteger(body.windowStart) ? body.windowStart : 8;
    const windowEnd = Number.isInteger(body.windowEnd) ? body.windowEnd : 11;
    if (windowEnd <= windowStart || windowStart < 0 || windowEnd > 23) {
      return reply.status(400).send({ error: 'invalid_window' });
    }
    const steps = validateSteps(body.steps);
    if (!steps) return reply.status(400).send({ error: 'steps_invalid' });
    const startTrigger = VALID_TRIGGERS.includes(body.startTrigger) ? body.startTrigger : 'manual';

    const campaign = await prisma.dripCampaign.create({
      data: {
        id: randomUUID(),
        orgId: user.orgId,
        name: body.name,
        description: body.description ?? null,
        enabled: body.enabled !== false,
        windowStart,
        windowEnd,
        timezone: body.timezone ?? 'Asia/Ho_Chi_Minh',
        startTrigger,
        startTag: body.startTag ?? null,
        stopOnReply: body.stopOnReply !== false,
        stopOnTag: body.stopOnTag ?? null,
        stopOnInactiveDays: body.stopOnInactiveDays ?? null,
        createdBy: user.id,
        steps: {
          create: steps.map((s, idx) => ({
            id: randomUUID(),
            stepIndex: idx,
            templateId: s.templateId ?? null,
            content: s.content ?? null,
            dayOffset: s.dayOffset ?? idx,
          })),
        },
      },
      include: { steps: true },
    });
    return reply.status(201).send({ campaign });
  });

  app.put('/api/v1/drip/campaigns/:id', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;
    const existing = await prisma.dripCampaign.findFirst({ where: { id, orgId: user.orgId } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });

    const data: any = {};
    if (typeof body.name === 'string') data.name = body.name;
    if (typeof body.description === 'string' || body.description === null) data.description = body.description;
    if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
    if (Number.isInteger(body.windowStart)) data.windowStart = body.windowStart;
    if (Number.isInteger(body.windowEnd)) data.windowEnd = body.windowEnd;
    if (typeof body.stopOnReply === 'boolean') data.stopOnReply = body.stopOnReply;
    if (body.stopOnTag !== undefined) data.stopOnTag = body.stopOnTag;
    if (body.stopOnInactiveDays !== undefined) data.stopOnInactiveDays = body.stopOnInactiveDays;

    const campaign = await prisma.dripCampaign.update({ where: { id }, data });
    return { campaign };
  });

  app.delete('/api/v1/drip/campaigns/:id', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const existing = await prisma.dripCampaign.findFirst({ where: { id, orgId: user.orgId } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });
    await prisma.dripCampaign.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ─── Enrollments ───────────────────────────────────────────────────
  app.get('/api/v1/drip/enrollments', async (request: FastifyRequest) => {
    const user = request.user!;
    const q = request.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
    const where: any = { campaign: { orgId: user.orgId } };
    if (q.campaignId) where.campaignId = q.campaignId;
    if (q.status) where.status = q.status;
    if (q.contactId) where.contactId = q.contactId;

    const [items, total] = await Promise.all([
      prisma.dripEnrollment.findMany({
        where,
        include: {
          contact: { select: { id: true, fullName: true, crmName: true, phone: true } },
          campaign: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.dripEnrollment.count({ where }),
    ]);
    return { items, total, page, limit };
  });

  app.post('/api/v1/drip/campaigns/:id/enroll', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id: campaignId } = request.params as { id: string };
    const body = request.body as { contactIds?: string[] };
    if (!Array.isArray(body.contactIds) || body.contactIds.length === 0) {
      return reply.status(400).send({ error: 'contactIds_required' });
    }
    const campaign = await prisma.dripCampaign.findFirst({ where: { id: campaignId, orgId: user.orgId } });
    if (!campaign) return reply.status(404).send({ error: 'campaign_not_found' });

    const result = await enrollContactsBatch(campaignId, body.contactIds);
    return result;
  });

  async function getOwnedEnrollment(userOrgId: string, enrollmentId: string) {
    return prisma.dripEnrollment.findFirst({
      where: { id: enrollmentId, campaign: { orgId: userOrgId } },
      include: { campaign: { select: { windowStart: true, windowEnd: true, timezone: true } } },
    });
  }

  app.post('/api/v1/drip/enrollments/:id/pause', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const e = await getOwnedEnrollment(user.orgId, id);
    if (!e) return reply.status(404).send({ error: 'not_found' });
    if (e.status !== 'active') return reply.status(400).send({ error: 'invalid_transition' });
    const updated = await prisma.dripEnrollment.update({
      where: { id },
      data: { status: 'paused', scheduledAt: null },
    });
    return { enrollment: updated };
  });

  app.post('/api/v1/drip/enrollments/:id/resume', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const e = await getOwnedEnrollment(user.orgId, id);
    if (!e) return reply.status(404).send({ error: 'not_found' });
    if (e.status !== 'paused') return reply.status(400).send({ error: 'invalid_transition' });
    const next = nextDayScheduledAt(new Date(), e.campaign.windowStart, e.campaign.windowEnd, e.campaign.timezone);
    const updated = await prisma.dripEnrollment.update({
      where: { id },
      data: { status: 'active', scheduledAt: next },
    });
    return { enrollment: updated };
  });

  app.post('/api/v1/drip/enrollments/:id/cancel', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const e = await getOwnedEnrollment(user.orgId, id);
    if (!e) return reply.status(404).send({ error: 'not_found' });
    if (e.status === 'completed' || e.status === 'cancelled') {
      return reply.status(400).send({ error: 'invalid_transition' });
    }
    const updated = await prisma.dripEnrollment.update({
      where: { id },
      data: { status: 'cancelled', scheduledAt: null, completedAt: new Date() },
    });
    return { enrollment: updated };
  });

  app.get('/api/v1/drip/enrollments/:id/logs', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const e = await getOwnedEnrollment(user.orgId, id);
    if (!e) return reply.status(404).send({ error: 'not_found' });
    const logs = await prisma.automationLog.findMany({
      where: { enrollmentId: id },
      orderBy: { sentAt: 'desc' },
    });
    return { logs };
  });

  // ─── Bulk ─────────────────────────────────────────────────────────
  app.post('/api/v1/drip/campaigns/:id/bulk', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id: campaignId } = request.params as { id: string };
    const body = request.body as { action?: string; filter?: { status?: string } };
    if (!body.action || !['pause', 'resume', 'cancel'].includes(body.action)) {
      return reply.status(400).send({ error: 'action_invalid' });
    }
    if (!body.filter?.status) return reply.status(400).send({ error: 'filter_status_required' });
    const campaign = await prisma.dripCampaign.findFirst({
      where: { id: campaignId, orgId: user.orgId },
      select: { id: true, windowStart: true, windowEnd: true, timezone: true },
    });
    if (!campaign) return reply.status(404).send({ error: 'not_found' });

    const where = { campaignId, status: body.filter.status };
    let result;
    if (body.action === 'pause') {
      result = await prisma.dripEnrollment.updateMany({
        where: { ...where, status: 'active' },
        data: { status: 'paused', scheduledAt: null },
      });
    } else if (body.action === 'cancel') {
      result = await prisma.dripEnrollment.updateMany({
        where: { ...where, status: { in: ['active', 'paused', 'failed'] } },
        data: { status: 'cancelled', scheduledAt: null, completedAt: new Date() },
      });
    } else {
      const next = nextDayScheduledAt(new Date(), campaign.windowStart, campaign.windowEnd, campaign.timezone);
      result = await prisma.dripEnrollment.updateMany({
        where: { ...where, status: 'paused' },
        data: { status: 'active', scheduledAt: next },
      });
    }
    return { affected: result.count };
  });

  // ─── Per-Contact history (Card Log tab) ────────────────────────────
  app.get('/api/v1/contacts/:id/drip-history', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id: contactId } = request.params as { id: string };
    const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: user.orgId }, select: { id: true } });
    if (!contact) return reply.status(404).send({ error: 'not_found' });

    const enrollments = await prisma.dripEnrollment.findMany({
      where: { contactId },
      include: {
        campaign: { select: { id: true, name: true, steps: { select: { id: true } } } },
        logs: { orderBy: { sentAt: 'desc' }, take: 5 },
      },
      orderBy: { startedAt: 'desc' },
    });
    return {
      enrollments: enrollments.map((e) => ({
        id: e.id,
        campaignId: e.campaignId,
        campaignName: e.campaign.name,
        currentStep: e.currentStep,
        totalSteps: e.campaign.steps.length,
        status: e.status,
        nextSendAt: e.scheduledAt,
        lastSentAt: e.lastSentAt,
        startedAt: e.startedAt,
        logs: e.logs,
      })),
    };
  });
}
