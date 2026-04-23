/**
 * drip-conditions.ts — Stop-condition evaluator for drip enrollments.
 * v1 supports: stopOnReply, stopOnInactiveDays. Tag-based conditions deferred.
 */
import { prisma } from '../../../shared/database/prisma-client.js';
import type { StopReason } from './drip-types.js';

interface CampaignStopRules {
  stopOnReply: boolean;
  stopOnTag: string | null;
  stopOnInactiveDays: number | null;
}

interface EnrollmentCtx {
  contactId: string;
  conversationId: string;
  startedAt: Date;
}

/**
 * Returns the stop reason if any stop-condition met, else null.
 * Queries are scoped to enrollment.startedAt to avoid counting old replies.
 */
export async function evaluateStopConditions(
  enrollment: EnrollmentCtx,
  rules: CampaignStopRules,
): Promise<StopReason | null> {
  // stopOnReply: any contact-sent message after enrollment started
  if (rules.stopOnReply) {
    const reply = await prisma.message.findFirst({
      where: {
        conversationId: enrollment.conversationId,
        senderType: 'contact',
        sentAt: { gt: enrollment.startedAt },
      },
      select: { id: true },
    });
    if (reply) return 'replied';
  }

  // stopOnInactiveDays: contact has no activity in N days
  if (rules.stopOnInactiveDays && rules.stopOnInactiveDays > 0) {
    const threshold = new Date(Date.now() - rules.stopOnInactiveDays * 86400_000);
    const contact = await prisma.contact.findUnique({
      where: { id: enrollment.contactId },
      select: { lastActivity: true },
    });
    if (!contact?.lastActivity || contact.lastActivity < threshold) {
      return 'inactive';
    }
  }

  // stopOnTag: tag-based conditions — deferred to future phase (requires tag system from B3)
  // For v1, skip even if rules.stopOnTag is set.

  return null;
}
