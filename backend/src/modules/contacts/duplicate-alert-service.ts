/**
 * duplicate-alert-service.ts — On-demand duplicate peer lookup for a single contact.
 * Returns sibling contacts in the same org that share the same phone or zaloUid.
 * Respects per-user ACL: conversationId is null when user lacks account access.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { Prisma } from '@prisma/client';
import { normalizePhone } from '../../shared/utils/phone.js';

interface JwtUser {
  id: string;
  email: string;
  role: string;
  orgId: string;
}

export interface DuplicatePeer {
  contactId: string;
  contactName: string | null;
  accountId: string;
  accountDisplayName: string | null;
  conversationId: string | null;
  lastMessageAt: Date | null;
  matchType: 'phone' | 'zalo_uid';
}

/** Throws a structured error object (caught by route handler). */
function notFound(): never {
  const err: { statusCode: number; error: string } & Error = Object.assign(
    new Error('Contact not found'),
    { statusCode: 404, error: 'not_found' },
  );
  throw err;
}

/**
 * Build a Set of zaloAccountIds the user can access.
 * - owner / admin → all accounts in org
 * - member → only accounts granted via ZaloAccountAccess
 */
async function getUserAccessibleAccountIds(user: JwtUser): Promise<Set<string>> {
  if (user.role === 'owner' || user.role === 'admin') {
    const accounts = await prisma.zaloAccount.findMany({
      where: { orgId: user.orgId },
      select: { id: true },
    });
    return new Set(accounts.map((a) => a.id));
  }

  const access = await prisma.zaloAccountAccess.findMany({
    where: { userId: user.id },
    select: { zaloAccountId: true },
  });
  return new Set(access.map((a) => a.zaloAccountId));
}

/**
 * Find all contacts in the same org that share phone or zaloUid with the given contact.
 * Returns an empty array when there are no matches — never 404 on missing peers.
 */
export async function findPeers(contactId: string, user: JwtUser): Promise<DuplicatePeer[]> {
  // Load target contact — org-scoped
  const target = await prisma.contact.findFirst({
    where: { id: contactId, orgId: user.orgId },
    select: { id: true, phone: true, zaloUid: true },
  });
  if (!target) notFound();

  const phoneNorm = target.phone ? normalizePhone(target.phone) : null;

  // Build OR conditions: match by normalized phone OR by zaloUid
  const orConditions: Prisma.ContactWhereInput[] = [];
  if (phoneNorm) orConditions.push({ phone: phoneNorm });
  if (target.zaloUid) orConditions.push({ zaloUid: target.zaloUid });

  // No matchable identifiers → no peers possible
  if (orConditions.length === 0) return [];

  const siblings = await prisma.contact.findMany({
    where: {
      orgId: user.orgId,
      id: { not: target.id },
      mergedInto: null,
      OR: orConditions,
    },
    select: {
      id: true,
      crmName: true,
      fullName: true,
      phone: true,
      zaloUid: true,
      conversations: {
        select: {
          id: true,
          zaloAccountId: true,
          lastMessageAt: true,
          zaloAccount: { select: { id: true, displayName: true } },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 1,
      },
    },
  });

  if (siblings.length === 0) return [];

  const accessibleIds = await getUserAccessibleAccountIds(user);

  const peers: DuplicatePeer[] = [];

  for (const sib of siblings) {
    if (sib.conversations.length === 0) {
      // Sibling has no conversations — still a peer, but no account link to show
      continue;
    }

    const conv = sib.conversations[0];
    const matchType: 'phone' | 'zalo_uid' =
      phoneNorm && sib.phone === phoneNorm ? 'phone' : 'zalo_uid';

    peers.push({
      contactId: sib.id,
      contactName: sib.crmName ?? sib.fullName ?? null,
      accountId: conv.zaloAccount.id,
      accountDisplayName: conv.zaloAccount.displayName ?? null,
      conversationId: accessibleIds.has(conv.zaloAccount.id) ? conv.id : null,
      lastMessageAt: conv.lastMessageAt ?? null,
      matchType,
    });
  }

  return peers;
}
