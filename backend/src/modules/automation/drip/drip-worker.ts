/**
 * drip-worker.ts — processes a single claimed enrollment: evaluate stop-conditions,
 * render template, check rate limit, send via zaloPool, persist Message + AutomationLog,
 * advance step or complete.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../shared/database/prisma-client.js';
import { zaloPool } from '../../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../../zalo/zalo-rate-limiter.js';
import { renderMessageTemplate, type AutomationTemplateContext } from '../template-renderer.js';
import { evaluateStopConditions } from './drip-conditions.js';
import { nextDayScheduledAt } from './drip-window.js';
import { logger } from '../../../shared/utils/logger.js';
import type { DripEnrollmentClaim, AutomationLogStatus } from './drip-types.js';

async function writeLog(
  orgId: string,
  enrollmentId: string,
  stepIndex: number,
  status: AutomationLogStatus,
  messageId: string | null,
  error: string | null,
): Promise<void> {
  await prisma.automationLog.create({
    data: {
      id: randomUUID(),
      orgId,
      enrollmentId,
      stepIndex,
      messageId,
      status,
      error,
    },
  });
}

/**
 * Process one enrollment. Caller is responsible for the row lock (FOR UPDATE SKIP LOCKED).
 */
export async function processEnrollment(claim: DripEnrollmentClaim): Promise<void> {
  // Load full context
  const enrollment = await prisma.dripEnrollment.findUnique({
    where: { id: claim.id },
    include: {
      campaign: {
        include: {
          steps: { orderBy: { stepIndex: 'asc' } },
        },
      },
      contact: true,
      conversation: { select: { id: true, externalThreadId: true, threadType: true } },
    },
  });
  if (!enrollment || enrollment.status !== 'active') return;

  const { campaign, contact, conversation } = enrollment;
  const orgId = campaign.orgId;
  const currentStep = campaign.steps.find((s) => s.stepIndex === enrollment.currentStep);

  if (!currentStep) {
    // No step at this index → campaign complete
    await prisma.dripEnrollment.update({
      where: { id: enrollment.id },
      data: { status: 'completed', completedAt: new Date(), scheduledAt: null },
    });
    return;
  }

  // Stop-condition check
  const stopReason = await evaluateStopConditions(
    {
      contactId: enrollment.contactId,
      conversationId: enrollment.conversationId,
      startedAt: enrollment.startedAt,
    },
    {
      stopOnReply: campaign.stopOnReply,
      stopOnTag: campaign.stopOnTag,
      stopOnInactiveDays: campaign.stopOnInactiveDays,
    },
  );
  if (stopReason) {
    await prisma.dripEnrollment.update({
      where: { id: enrollment.id },
      data: { status: 'completed', completedAt: new Date(), scheduledAt: null, failReason: `stopped:${stopReason}` },
    });
    await writeLog(orgId, enrollment.id, enrollment.currentStep, 'skipped', null, `stop:${stopReason}`);
    return;
  }

  // Rate limit check
  const limits = zaloRateLimiter.checkLimits(enrollment.zaloAccountId);
  if (!limits.allowed) {
    const next = nextDayScheduledAt(new Date(), campaign.windowStart, campaign.windowEnd, campaign.timezone);
    await prisma.dripEnrollment.update({
      where: { id: enrollment.id },
      data: { scheduledAt: next },
    });
    await writeLog(orgId, enrollment.id, enrollment.currentStep, 'rate_limited', null, limits.reason ?? null);
    return;
  }

  // Resolve content: template FK > inline
  let content = '';
  const ctx: AutomationTemplateContext = {
    org: { id: campaign.orgId, name: null },
    contact: {
      id: contact.id,
      fullName: contact.fullName,
      crmName: contact.crmName,
      phone: contact.phone,
      email: contact.email,
      status: contact.status,
      tags: contact.tags,
    },
    conversation: { id: conversation.id },
  };

  if (currentStep.templateId) {
    const tpl = await prisma.messageTemplate.findUnique({
      where: { id: currentStep.templateId },
      select: { content: true },
    });
    content = tpl ? renderMessageTemplate(tpl.content, ctx) : '';
  }
  if (!content && currentStep.content) {
    content = renderMessageTemplate(currentStep.content, ctx);
  }
  content = content.trim();

  if (!content) {
    await writeLog(orgId, enrollment.id, enrollment.currentStep, 'failed', null, 'empty_content');
    await advanceOrComplete(enrollment.id, campaign, enrollment.currentStep);
    return;
  }

  // Send
  const instance = zaloPool.getInstance(enrollment.zaloAccountId);
  if (!instance?.api || !conversation.externalThreadId) {
    await writeLog(orgId, enrollment.id, enrollment.currentStep, 'failed', null, 'no_instance_or_thread');
    return;
  }

  try {
    zaloRateLimiter.recordSend(enrollment.zaloAccountId);
    const threadType = conversation.threadType === 'group' ? 1 : 0;
    const sendResult = await instance.api.sendMessage(
      { msg: content },
      conversation.externalThreadId,
      threadType,
    );
    const zaloMsgId = String(
      (sendResult as { msgId?: string })?.msgId ||
        (sendResult as { data?: { msgId?: string } })?.data?.msgId ||
        '',
    );

    const message = await prisma.message.create({
      data: {
        id: randomUUID(),
        conversationId: conversation.id,
        zaloMsgId: zaloMsgId || null,
        senderType: 'self',
        senderUid: null,
        senderName: 'Drip',
        content,
        contentType: 'text',
        sentAt: new Date(),
      },
    });

    await writeLog(orgId, enrollment.id, enrollment.currentStep, 'sent', message.id, null);
    await advanceOrComplete(enrollment.id, campaign, enrollment.currentStep, new Date());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[drip-worker] send failed', { enrollmentId: enrollment.id, error: msg });
    await writeLog(orgId, enrollment.id, enrollment.currentStep, 'failed', null, msg);
    // No advance; cron will retry next tick if scheduledAt <= now. Prevent hot-loop by nudging +15min.
    await prisma.dripEnrollment.update({
      where: { id: enrollment.id },
      data: { scheduledAt: new Date(Date.now() + 15 * 60_000) },
    });
  }
}

async function advanceOrComplete(
  enrollmentId: string,
  campaign: { steps: { stepIndex: number }[]; windowStart: number; windowEnd: number; timezone: string },
  currentStepIndex: number,
  lastSentAt: Date | null = null,
): Promise<void> {
  const maxIndex = campaign.steps.reduce((m, s) => Math.max(m, s.stepIndex), -1);
  if (currentStepIndex >= maxIndex) {
    await prisma.dripEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'completed', completedAt: new Date(), scheduledAt: null, lastSentAt },
    });
    return;
  }
  const next = nextDayScheduledAt(new Date(), campaign.windowStart, campaign.windowEnd, campaign.timezone);
  await prisma.dripEnrollment.update({
    where: { id: enrollmentId },
    data: { currentStep: currentStepIndex + 1, scheduledAt: next, lastSentAt: lastSentAt ?? undefined },
  });
}
