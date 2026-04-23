# Phase 03 — Duplicate Customer Alert (FEATURE-05)

**Status:** pending | **Effort:** 3h | **Depends:** 01

## Context
When viewing a conversation/contact, surface other contacts in same org sharing phone/zaloUid. Existing `duplicate-detector.ts` runs as batch — we need an **on-demand per-contact query** that respects ACL.

## Files
- Create: `backend/src/modules/contacts/duplicate-alert-service.ts`
- Modify: `backend/src/modules/contacts/contact-routes.ts` (add 1 GET endpoint)
- Reuse: `normPhone` helper from `duplicate-detector.ts` → extract to `shared/utils/phone.ts` and re-import in both files (DRY)

## API
```
GET /api/v1/contacts/:id/duplicate-peers
→ {
    peers: [
      {
        contactId: "...",
        contactName: "...",
        accountId: "...",
        accountDisplayName: "Zalo Sale Hương",
        conversationId: "..." | null,   // null = no ACL → name only, no link
        lastMessageAt: "...",
        matchType: "phone" | "zalo_uid"
      }
    ]
  }
```

## Service Logic

```ts
async function findPeers(contactId, user) {
  const c = await prisma.contact.findFirst({
    where: { id: contactId, orgId: user.orgId },
    select: { id: true, phone: true, zaloUid: true },
  });
  if (!c) throw NotFound;

  const phoneNorm = c.phone ? normalizePhone(c.phone) : null;

  // Find sibling contacts in org with matching phone or zaloUid
  const siblings = await prisma.contact.findMany({
    where: {
      orgId: user.orgId,
      id: { not: c.id },
      mergedInto: null,
      OR: [
        ...(phoneNorm ? [{ phone: phoneNorm }] : []),  // assumes phones stored normalized
        ...(c.zaloUid ? [{ zaloUid: c.zaloUid }] : []),
      ],
    },
    include: {
      conversations: {
        include: { zaloAccount: { select: { id: true, displayName: true } } },
        orderBy: { lastMessageAt: 'desc' },
        take: 1,
      },
    },
  });

  // ACL filter per conversation
  const accessibleAccountIds = await getUserAccessibleAccountIds(user);

  return siblings.flatMap(sib =>
    sib.conversations.map(conv => ({
      contactId: sib.id,
      contactName: sib.crmName || sib.fullName,
      accountId: conv.zaloAccount.id,
      accountDisplayName: conv.zaloAccount.displayName,
      conversationId: accessibleAccountIds.has(conv.zaloAccount.id) ? conv.id : null,
      lastMessageAt: conv.lastMessageAt,
      matchType: sib.phone === phoneNorm ? 'phone' : 'zalo_uid',
    }))
  );
}
```

## Phone Normalization (researcher B)
Common Vietnamese formats: `+84912345678`, `84912345678`, `0912345678`, `0912 345 678`, `0912.345.678`.
Normalize → strip non-digits, convert leading `84` → `0`, ensure 10 digits starting `0`.

## Steps
1. Extract `normPhone` from `duplicate-detector.ts` → `shared/utils/phone.ts` as `normalizePhone()` (richer logic per researcher B).
2. Update `duplicate-detector.ts` to import from shared.
3. Implement service.
4. Add route to `contact-routes.ts` (with `requireZaloAccess` NOT applicable — uses contact ACL via orgId scope).
5. Backfill: write one-time script to renormalize all existing `Contact.phone` (only if format inconsistencies found).
6. Tests: 3 contacts share phone, user has ACL on 1 → returns 3 peers, 1 with link, 2 without.

## Success Criteria
- [ ] Peers returned only within same org
- [ ] Conversations user can't access → name shown, link null
- [ ] Phone format variants matched (researcher B test cases)
- [ ] Endpoint <100ms with 10k contacts (indexed `(orgId, phone)`, `(orgId, zaloUid)` already exist)

## Risks
- Existing phones stored with mixed formats → matches miss. Mitigate: backfill normalization script.
- Performance on large orgs → index already covers query.
- Privacy: never expose contact name from another org. orgId scope mandatory.
