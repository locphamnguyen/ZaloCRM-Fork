# Phase 01 — Schema Migrations

**Status:** pending | **Effort:** 2h | **Blocks:** 02, 03, 04

## Context
Add tables for group views, CRM tags, tag links, sync queue/snapshot, auto-tag rules. Additive only.

## New Models (Prisma)

```prisma
model ZaloGroupView {
  id         String   @id @default(uuid())
  orgId      String   @map("org_id")
  userId     String   @map("user_id")           // owner — user-scoped
  name       String
  accountIds String[] @map("account_ids")       // ZaloAccount.id list
  color      String?
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@index([orgId, userId])
  @@map("zalo_group_views")
}

model CrmTag {
  id        String   @id @default(uuid())
  orgId     String   @map("org_id")
  name      String
  color     String   @default("#888")
  icon      String?
  source    String   @default("crm")            // crm | zalo
  createdAt DateTime @default(now()) @map("created_at")

  links ContactTagLink[]
  rules AutoTagRule[]

  @@unique([orgId, name, source])
  @@index([orgId, source])
  @@map("crm_tags")
}

model ContactTagLink {
  id        String   @id @default(uuid())
  contactId String   @map("contact_id")
  tagId     String   @map("tag_id")
  source    String   @default("crm")            // crm | zalo
  appliedBy String?  @map("applied_by")         // user id | "auto-rule:<ruleId>" | "zalo-sync"
  createdAt DateTime @default(now()) @map("created_at")

  tag CrmTag @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([contactId, tagId])
  @@index([contactId])
  @@index([tagId])
  @@map("contact_tag_links")
}

model AutoTagRule {
  id          String   @id @default(uuid())
  orgId       String   @map("org_id")
  name        String
  event       String                              // message_received | message_sent | status_changed
  condition   Json                                // DSL: { keywordMatch?, hasReplied?, scoreGte?, ... }
  tagId       String   @map("tag_id")
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")

  tag CrmTag @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@index([orgId, event, enabled])
  @@map("auto_tag_rules")
}

model ZaloTagSnapshot {
  id            String   @id @default(uuid())
  zaloAccountId String   @map("zalo_account_id")
  contactZaloUid String  @map("contact_zalo_uid")
  labelId       String   @map("label_id")
  labelName     String   @map("label_name")
  syncedAt      DateTime @default(now()) @map("synced_at")

  @@unique([zaloAccountId, contactZaloUid, labelId])
  @@index([zaloAccountId])
  @@map("zalo_tag_snapshots")
}

model ZaloTagSyncQueue {
  id            String   @id @default(uuid())
  zaloAccountId String   @map("zalo_account_id")
  contactZaloUid String  @map("contact_zalo_uid")
  action        String                            // add | remove
  labelName     String   @map("label_name")
  status        String   @default("pending")      // pending | done | failed
  attempts      Int      @default(0)
  lastError     String?  @map("last_error")
  createdAt     DateTime @default(now()) @map("created_at")
  processedAt   DateTime? @map("processed_at")

  @@index([status, createdAt])
  @@map("zalo_tag_sync_queue")
}
```

Add `Contact.tagLinks ContactTagLink[]` relation (no FK on ContactTagLink.contactId for now to keep it loose; add `@relation` if needed).

## Files
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_b3_multi_account_intel/migration.sql`
- Create: `backend/scripts/migrate-existing-tags.ts` (one-shot: copy `Contact.tags` JSON → `CrmTag` + `ContactTagLink`)

## Steps
1. Append models above to `schema.prisma`.
2. Run `npx prisma migrate dev --name b3_multi_account_intel`.
3. Write `migrate-existing-tags.ts`: per org, dedupe existing `Contact.tags` strings → create `CrmTag(source=crm)` rows → link.
4. Run script in dev DB; verify counts.
5. Commit migration + schema.

## Success Criteria
- [ ] `prisma migrate dev` clean
- [ ] `prisma generate` produces typed client
- [ ] Migration script idempotent (re-run safe)
- [ ] No FK violations against existing data

## Risks
- Existing `Contact.tags` JSON has unexpected shape → script defensive (skip non-string entries, log).
- Concurrent prod migration: index creation blocking. Use `CONCURRENTLY` in raw SQL if needed.
