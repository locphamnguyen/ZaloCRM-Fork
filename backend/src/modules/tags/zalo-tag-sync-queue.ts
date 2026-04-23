/**
 * zalo-tag-sync-queue.ts — Enqueue/dedupe Zalo label add/remove operations.
 * Deduplication: if a pending item for same (accountId, contactZaloUid, labelName, action) exists,
 * skip creating a duplicate entry.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';

export async function enqueueAdd(
  zaloAccountId: string,
  contactZaloUid: string,
  labelName: string,
): Promise<void> {
  const existing = await prisma.zaloTagSyncQueue.findFirst({
    where: { zaloAccountId, contactZaloUid, labelName, action: 'add', status: 'pending' },
  });
  if (existing) return; // dedupe

  await prisma.zaloTagSyncQueue.create({
    data: {
      id: randomUUID(),
      zaloAccountId,
      contactZaloUid,
      action: 'add',
      labelName,
      status: 'pending',
    },
  });
}

export async function enqueueRemove(
  zaloAccountId: string,
  contactZaloUid: string,
  labelName: string,
): Promise<void> {
  const existing = await prisma.zaloTagSyncQueue.findFirst({
    where: { zaloAccountId, contactZaloUid, labelName, action: 'remove', status: 'pending' },
  });
  if (existing) return; // dedupe

  await prisma.zaloTagSyncQueue.create({
    data: {
      id: randomUUID(),
      zaloAccountId,
      contactZaloUid,
      action: 'remove',
      labelName,
      status: 'pending',
    },
  });
}
