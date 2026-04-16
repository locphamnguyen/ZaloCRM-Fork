/**
 * zalo-message-sync.ts — polling backup for group message history.
 * Runs periodically per connected account, calls getGroupChatHistory()
 * for active groups, and inserts any messages missing from the database.
 *
 * This is a safety net — the primary sync path is selfListen + old_messages.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { handleIncomingMessage } from '../chat/message-handler.js';
import { detectContentType } from './zalo-message-helpers.js';

const SYNC_INTERVAL_MS = 5 * 60_000; // 5 minutes
const MAX_GROUPS_PER_SYNC = 20;
const MESSAGES_PER_GROUP = 50;

// Track active sync intervals per account
const syncIntervals = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Sync recent group messages for one account.
 * Returns the number of newly inserted messages.
 */
async function syncGroupMessages(api: any, accountId: string): Promise<number> {
  const account = await prisma.zaloAccount.findUnique({
    where: { id: accountId },
    select: { orgId: true },
  });
  if (!account) return 0;

  // Get most recently active group conversations
  const groupConvs = await prisma.conversation.findMany({
    where: { zaloAccountId: accountId, threadType: 'group' },
    select: { id: true, externalThreadId: true },
    take: MAX_GROUPS_PER_SYNC,
    orderBy: { lastMessageAt: 'desc' },
  });

  let synced = 0;

  for (const conv of groupConvs) {
    try {
      const history = await api.getGroupChatHistory(conv.externalThreadId, MESSAGES_PER_GROUP);
      const messages = history?.groupMsgs || history?.data?.groupMsgs || [];

      // Collect all msgIds for batch dedup check
      const msgIdMap = new Map<string, any>();
      for (const msg of messages) {
        const zaloMsgId = String(msg.data?.msgId || msg.data?.cliMsgId || '');
        if (zaloMsgId) msgIdMap.set(zaloMsgId, msg);
      }
      if (msgIdMap.size === 0) continue;

      // Batch existence check — single query per group
      const existing = await prisma.message.findMany({
        where: { conversationId: conv.id, zaloMsgId: { in: [...msgIdMap.keys()] } },
        select: { zaloMsgId: true },
      });
      const existingIds = new Set(existing.map((m: any) => m.zaloMsgId));

      for (const [zaloMsgId, msg] of msgIdMap) {
        if (existingIds.has(zaloMsgId)) continue;

        const rawContent = msg.data?.content;
        const content =
          typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || '');

        const result = await handleIncomingMessage({
          accountId,
          senderUid: String(msg.data?.uidFrom || ''),
          senderName: msg.data?.dName || '',
          content,
          contentType: detectContentType(msg.data?.msgType, rawContent),
          msgId: zaloMsgId,
          timestamp: parseInt(msg.data?.ts || String(Date.now())),
          isSelf: msg.isSelf || false,
          threadId: conv.externalThreadId!,
          threadType: 'group',
          attachments: [],
          isBackfill: true,
        });

        if (result) synced++;
      }
    } catch (err) {
      logger.warn(`[sync:${accountId}] Group ${conv.externalThreadId} failed:`, err);
    }
  }

  return synced;
}

/** Start periodic group sync for an account. */
export function startMessageSync(api: any, accountId: string): void {
  // Don't start duplicate sync
  if (syncIntervals.has(accountId)) return;

  const interval = setInterval(async () => {
    try {
      const count = await syncGroupMessages(api, accountId);
      if (count > 0) {
        logger.info(`[sync:${accountId}] Backfilled ${count} group messages`);
      }
    } catch (err) {
      logger.warn(`[sync:${accountId}] Sync error:`, err);
    }
  }, SYNC_INTERVAL_MS);

  syncIntervals.set(accountId, interval);
  logger.info(`[sync:${accountId}] Started group message sync (every ${SYNC_INTERVAL_MS / 1000}s)`);
}

/** Stop periodic sync for an account. */
export function stopMessageSync(accountId: string): void {
  const interval = syncIntervals.get(accountId);
  if (interval) {
    clearInterval(interval);
    syncIntervals.delete(accountId);
    logger.info(`[sync:${accountId}] Stopped group message sync`);
  }
}
