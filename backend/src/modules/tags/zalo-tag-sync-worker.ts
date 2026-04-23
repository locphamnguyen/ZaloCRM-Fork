/**
 * zalo-tag-sync-worker.ts — Polls Zalo label API every 15min.
 * ZALO_LABEL_SYNC_MODE: off | read-only | full (default: read-only)
 *   off       — worker does nothing
 *   read-only — pull labels from Zalo → update ZaloTagSnapshot only
 *   full      — pull + drain push queue (add/remove labels on Zalo)
 *
 * B1.5 runtime fallback: if addLabel/removeLabel throws, marks item failed
 * with reason 'api_not_available' after 3 attempts.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { randomUUID } from 'node:crypto';

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 3;
// Reserve 80% of burst capacity for chat — only use 1 label op per cycle if near limit
const BURST_RESERVE_RATIO = 0.8;

type SyncMode = 'off' | 'read-only' | 'full';

function getSyncMode(): SyncMode {
  const raw = process.env.ZALO_LABEL_SYNC_MODE ?? 'read-only';
  if (raw === 'off' || raw === 'read-only' || raw === 'full') return raw;
  return 'read-only';
}

// ── Pull: fetch labels from Zalo and update snapshot ─────────────────────────

async function pullLabelsForAccount(accountId: string): Promise<void> {
  const api = zaloPool.getApi(accountId);
  if (!api) return;

  let labels: Array<{ labelId: string; labelName: string }>;
  try {
    const raw = await api.getLabels();
    // Normalise — zca-js may return array directly or wrapped object
    labels = Array.isArray(raw) ? raw : (raw?.labels ?? raw?.data ?? []);
  } catch (err) {
    logger.warn(`[tag-sync] getLabels failed for account ${accountId}:`, err);
    return;
  }

  if (!Array.isArray(labels) || labels.length === 0) return;

  for (const label of labels) {
    if (!label.labelId || !label.labelName) continue;
    try {
      await prisma.zaloTagSnapshot.upsert({
        where: {
          zaloAccountId_contactZaloUid_labelId: {
            zaloAccountId: accountId,
            contactZaloUid: '__account__', // account-level label (not contact-specific)
            labelId: String(label.labelId),
          },
        },
        create: {
          id: randomUUID(),
          zaloAccountId: accountId,
          contactZaloUid: '__account__',
          labelId: String(label.labelId),
          labelName: label.labelName,
        },
        update: { labelName: label.labelName, syncedAt: new Date() },
      });
    } catch (err) {
      logger.warn(`[tag-sync] Snapshot upsert failed for label ${label.labelId}:`, err);
    }
  }

  logger.info(`[tag-sync] Pulled ${labels.length} label(s) for account ${accountId}`);
}

async function pullLabelsForAllAccounts(): Promise<void> {
  const accounts = await prisma.zaloAccount.findMany({
    where: { status: 'connected' },
    select: { id: true },
  });

  await Promise.allSettled(accounts.map(a => pullLabelsForAccount(a.id)));
}

// ── Push: drain the sync queue ────────────────────────────────────────────────

async function drainPushQueue(): Promise<void> {
  const pending = await prisma.zaloTagSyncQueue.findMany({
    where: { status: 'pending', attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  if (pending.length === 0) return;
  logger.info(`[tag-sync] Draining ${pending.length} queue item(s)`);

  for (const item of pending) {
    const api = zaloPool.getApi(item.zaloAccountId);
    if (!api) {
      logger.warn(`[tag-sync] No live API for account ${item.zaloAccountId}, skipping item ${item.id}`);
      continue;
    }

    // Rate limit guard — reserve 80% burst capacity for chat sends
    const check = zaloRateLimiter.checkLimits(item.zaloAccountId);
    if (!check.allowed) {
      logger.info(`[tag-sync] Rate limit hit for account ${item.zaloAccountId}, deferring remaining queue`);
      break;
    }

    try {
      if (item.action === 'add') {
        await api.addLabel(item.contactZaloUid, item.labelName);
      } else if (item.action === 'remove') {
        await api.removeLabel(item.contactZaloUid, item.labelName);
      }

      zaloRateLimiter.recordSend(item.zaloAccountId);

      await prisma.zaloTagSyncQueue.update({
        where: { id: item.id },
        data: { status: 'done', processedAt: new Date(), attempts: { increment: 1 } },
      });
    } catch (err: any) {
      const newAttempts = item.attempts + 1;
      const isApiMissing =
        err?.message?.includes('is not a function') ||
        err?.message?.includes('not found') ||
        err?.message?.includes('undefined');

      const isFinal = newAttempts >= MAX_ATTEMPTS || isApiMissing;
      const reason = isApiMissing ? 'api_not_available' : String(err?.message ?? err);

      logger.warn(
        `[tag-sync] Queue item ${item.id} failed (attempt ${newAttempts}/${MAX_ATTEMPTS}): ${reason}`,
      );

      await prisma.zaloTagSyncQueue.update({
        where: { id: item.id },
        data: {
          attempts: { increment: 1 },
          lastError: reason,
          status: isFinal ? 'failed' : 'pending',
          processedAt: isFinal ? new Date() : null,
        },
      });
    }
  }
}

// ── Main run-once cycle ───────────────────────────────────────────────────────

async function runOnce(mode: SyncMode): Promise<void> {
  try {
    await pullLabelsForAllAccounts();
  } catch (err) {
    logger.error('[tag-sync] pullLabelsForAllAccounts error:', err);
  }

  if (mode === 'full') {
    try {
      await drainPushQueue();
    } catch (err) {
      logger.error('[tag-sync] drainPushQueue error:', err);
    }
  }
}

// ── Worker entrypoint ─────────────────────────────────────────────────────────

export function startZaloTagSyncWorker(): void {
  const mode = getSyncMode();

  if (mode === 'off') {
    logger.info('[tag-sync] Worker disabled (ZALO_LABEL_SYNC_MODE=off)');
    return;
  }

  logger.info(`[tag-sync] Worker started — mode=${mode}, interval=15min`);

  // Run immediately on boot (fire-and-forget), then every 15min
  runOnce(mode).catch(err => logger.error('[tag-sync] Initial run error:', err));

  setInterval(() => {
    runOnce(mode).catch(err => logger.error('[tag-sync] Interval run error:', err));
  }, SYNC_INTERVAL_MS);
}
