/**
 * duplicate-detector.ts — Detects duplicate contacts per org.
 * Groups by phone, zaloUid, or fuzzy name matching.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { normalizePhone } from '../../shared/utils/phone.js';

function levenshteinRatio(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0 && lb === 0) return 1;
  if (la === 0 || lb === 0) return 0;
  const dp: number[][] = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[la][lb] / Math.max(la, lb);
}

function normName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function saveGroup(
  orgId: string,
  contactIds: string[],
  matchType: string,
  confidence: number,
): Promise<void> {
  const sorted = [...contactIds].sort();
  const existing = await prisma.duplicateGroup.findFirst({
    where: { orgId, resolved: false, contactIds: { equals: sorted } },
  });
  if (existing) return;
  await prisma.duplicateGroup.create({
    data: { orgId, contactIds: sorted, matchType, confidence },
  });
}

export async function detectDuplicates(): Promise<void> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let totalGroups = 0;

  for (const org of orgs) {
    const contacts = await prisma.contact.findMany({
      where: { orgId: org.id, mergedInto: null },
      select: { id: true, phone: true, zaloUid: true, fullName: true },
    });

    // Group by normalized phone
    const byPhone = new Map<string, string[]>();
    for (const c of contacts) {
      if (!c.phone) continue;
      // normalizePhone returns null for invalid — skip those contacts
      const key = normalizePhone(c.phone);
      if (!key) continue;
      if (!byPhone.has(key)) byPhone.set(key, []);
      byPhone.get(key)!.push(c.id);
    }
    for (const ids of byPhone.values()) {
      if (ids.length >= 2) {
        await saveGroup(org.id, ids, 'phone', 1.0);
        totalGroups++;
      }
    }

    // Group by exact zaloUid
    const byZalo = new Map<string, string[]>();
    for (const c of contacts) {
      if (!c.zaloUid) continue;
      if (!byZalo.has(c.zaloUid)) byZalo.set(c.zaloUid, []);
      byZalo.get(c.zaloUid)!.push(c.id);
    }
    for (const ids of byZalo.values()) {
      if (ids.length >= 2) {
        await saveGroup(org.id, ids, 'zalo_uid', 1.0);
        totalGroups++;
      }
    }

    // Fuzzy name matching — only contacts with no phone AND no zaloUid
    const noIdContacts = contacts.filter((c) => !c.phone && !c.zaloUid && !!c.fullName);
    for (let i = 0; i < noIdContacts.length; i++) {
      for (let j = i + 1; j < noIdContacts.length; j++) {
        const nameA = normName(noIdContacts[i].fullName!);
        const nameB = normName(noIdContacts[j].fullName!);
        const ratio = levenshteinRatio(nameA, nameB);
        if (ratio > 0.9) {
          await saveGroup(org.id, [noIdContacts[i].id, noIdContacts[j].id], 'name', ratio);
          totalGroups++;
        }
      }
    }
  }

  logger.info(`[duplicate-detector] Detected ${totalGroups} new group(s) across ${orgs.length} org(s)`);
}
