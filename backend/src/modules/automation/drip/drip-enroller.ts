/**
 * drip-enroller.ts — enroll / unenroll / batch-enroll contacts into drip campaigns.
 * Enforces DB-level dedup via partial unique index on (campaign_id, contact_id) WHERE status in ('active','paused').
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../shared/database/prisma-client.js';
import { nextScheduledAt } from './drip-window.js';

interface EnrollInput {
  campaignId: string;
  contactId: string;
  zaloAccountId?: string; // if omitted, uses contact's most-recent conversation account
}

interface EnrollResult {
  enrolled: boolean;
  reason?: string;
  enrollmentId?: string;
}

/** Enroll single contact. Returns {enrolled:false} if already active or no conversation found. */
export async function enrollContact(input: EnrollInput): Promise<EnrollResult> {
  const campaign = await prisma.dripCampaign.findUnique({
    where: { id: input.campaignId },
    select: { id: true, enabled: true, windowStart: true, windowEnd: true, timezone: true },
  });
  if (!campaign) return { enrolled: false, reason: 'campaign_not_found' };
  if (!campaign.enabled) return { enrolled: false, reason: 'campaign_disabled' };

  // Find target conversation (use specific account if provided, else pick most recent)
  const conversation = await prisma.conversation.findFirst({
    where: {
      contactId: input.contactId,
      ...(input.zaloAccountId ? { zaloAccountId: input.zaloAccountId } : {}),
    },
    orderBy: { lastMessageAt: 'desc' },
    select: { id: true, zaloAccountId: true },
  });
  if (!conversation) return { enrolled: false, reason: 'no_conversation' };

  // Immediate first-step send window: today if still before window_end, else tomorrow
  const scheduledAt = nextScheduledAt(null, campaign.windowStart, campaign.windowEnd, campaign.timezone);

  try {
    const enrollment = await prisma.dripEnrollment.create({
      data: {
        id: randomUUID(),
        campaignId: input.campaignId,
        contactId: input.contactId,
        conversationId: conversation.id,
        zaloAccountId: conversation.zaloAccountId,
        currentStep: 0,
        status: 'active',
        scheduledAt,
      },
    });
    return { enrolled: true, enrollmentId: enrollment.id };
  } catch (err: unknown) {
    // Unique constraint violation → already enrolled
    const code = (err as { code?: string })?.code;
    if (code === 'P2002') return { enrolled: false, reason: 'already_enrolled' };
    throw err;
  }
}

/** Batch enroll. Returns summary of successes/failures. */
export async function enrollContactsBatch(
  campaignId: string,
  contactIds: string[],
): Promise<{ enrolled: number; skipped: number; reasons: Record<string, number> }> {
  let enrolled = 0;
  let skipped = 0;
  const reasons: Record<string, number> = {};

  for (const contactId of contactIds) {
    const res = await enrollContact({ campaignId, contactId });
    if (res.enrolled) enrolled++;
    else {
      skipped++;
      const key = res.reason || 'unknown';
      reasons[key] = (reasons[key] ?? 0) + 1;
    }
  }
  return { enrolled, skipped, reasons };
}

/** Mark enrollments completed when contact replies (called by reply hook). */
export async function markEnrollmentsOnReply(contactId: string): Promise<number> {
  const result = await prisma.dripEnrollment.updateMany({
    where: {
      contactId,
      status: 'active',
      campaign: { stopOnReply: true },
    },
    data: {
      status: 'completed',
      completedAt: new Date(),
      scheduledAt: null,
    },
  });
  return result.count;
}
