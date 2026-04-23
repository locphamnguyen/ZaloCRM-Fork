/**
 * drip-scheduler.ts — cron tick orchestrator.
 * Every 60s: claim up to BATCH_SIZE due enrollments via FOR UPDATE SKIP LOCKED
 * and process each sequentially (rate limiter enforces burst protection).
 */
import cron from 'node-cron';
import { prisma } from '../../../shared/database/prisma-client.js';
import { logger } from '../../../shared/utils/logger.js';
import { processEnrollment } from './drip-worker.js';
import type { DripEnrollmentClaim } from './drip-types.js';

const BATCH_SIZE = 50;
let isTicking = false;

async function tick(): Promise<void> {
  if (isTicking) {
    logger.warn('[drip-scheduler] previous tick still running, skip');
    return;
  }
  isTicking = true;
  const start = Date.now();
  try {
    // Claim due enrollments with row-level lock; update status to keep them visible
    // but prevent other ticks from picking them up via scheduled_at nullification at end.
    const claimed = await prisma.$queryRaw<DripEnrollmentClaim[]>`
      SELECT id, campaign_id, contact_id, conversation_id, zalo_account_id, current_step, scheduled_at
      FROM drip_enrollments
      WHERE status = 'active'
        AND scheduled_at IS NOT NULL
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;

    if (claimed.length === 0) return;
    logger.info(`[drip-scheduler] claimed ${claimed.length} enrollments`);

    for (const claim of claimed) {
      try {
        await processEnrollment(claim);
      } catch (err) {
        logger.error('[drip-scheduler] processEnrollment error', {
          enrollmentId: claim.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    logger.error('[drip-scheduler] tick failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    isTicking = false;
    logger.info(`[drip-scheduler] tick done in ${Date.now() - start}ms`);
  }
}

export function startDripScheduler(): void {
  if (process.env.DRIP_ENGINE_ENABLED !== 'true') {
    logger.info('[drip-scheduler] disabled (DRIP_ENGINE_ENABLED != true)');
    return;
  }
  // Every minute
  cron.schedule('* * * * *', tick);
  logger.info('[drip-scheduler] started (every 60s)');
}
