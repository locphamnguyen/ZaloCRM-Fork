# Phase 02 — Group View Backend (FEATURE-04)

**Status:** pending | **Effort:** 4h | **Depends:** 01

## Context
Multi-nick unified inbox. CRUD on `ZaloGroupView` + read endpoint that merges conversations across selected accounts.

## Files
- Create: `backend/src/modules/zalo/group-view-routes.ts`
- Create: `backend/src/modules/zalo/group-view-service.ts`
- Modify: `backend/src/index.ts` (register routes)

## API

```
POST   /api/v1/group-views                       body { name, accountIds[], color? }
GET    /api/v1/group-views                       → user's own views
GET    /api/v1/group-views/:id
PATCH  /api/v1/group-views/:id                   body { name?, accountIds?, color? }
DELETE /api/v1/group-views/:id
GET    /api/v1/group-views/:id/conversations?cursor=&limit=&tab=main
```

## Service Logic (`group-view-service.ts`)

```ts
async function listConversations(viewId, user, { cursor, limit=30, tab='main' }) {
  const view = await prisma.zaloGroupView.findFirst({
    where: { id: viewId, orgId: user.orgId, userId: user.id },
  });
  if (!view) throw NotFound;

  // ACL filter — drop accounts user can't read (owner/admin bypass)
  const allowedIds = await filterAccessibleAccounts(view.accountIds, user);

  const where = {
    orgId: user.orgId,
    zaloAccountId: { in: allowedIds },
    tab,
    ...(cursor ? { lastMessageAt: { lt: new Date(cursor) } } : {}),
  };

  const conversations = await prisma.conversation.findMany({
    where,
    include: {
      zaloAccount: { select: { id: true, displayName: true, avatarUrl: true } },
      contact: { select: { id: true, fullName: true, crmName: true, avatarUrl: true, phone: true } },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: limit + 1,
  });

  const hasMore = conversations.length > limit;
  const items = conversations.slice(0, limit);
  return { items, nextCursor: hasMore ? items[items.length-1].lastMessageAt?.toISOString() : null };
}

async function filterAccessibleAccounts(accountIds, user) {
  if (['owner','admin'].includes(user.role)) return accountIds;
  const access = await prisma.zaloAccountAccess.findMany({
    where: { userId: user.id, zaloAccountId: { in: accountIds } },
    select: { zaloAccountId: true },
  });
  return access.map(a => a.zaloAccountId);
}
```

## Steps
1. Scaffold routes file with Zod schemas.
2. Implement service.
3. Register in `index.ts` after `zalo-routes`.
4. Add unit test for `filterAccessibleAccounts` (member with partial ACL).
5. Add integration test for `GET /:id/conversations` ACL filter.

## Success Criteria
- [ ] CRUD works
- [ ] List endpoint paginates correctly via cursor
- [ ] ACL excludes inaccessible account convs (test: member with read on 1/3)
- [ ] Each row has `zaloAccount` for source distinction in UI
- [ ] Reply path NOT modified (existing conversation send works)

## Risks
- Cursor drift if two convs share `lastMessageAt`. Mitigate: secondary sort by `id`.
- Large `accountIds` arrays: cap at 20 per view in Zod schema.
