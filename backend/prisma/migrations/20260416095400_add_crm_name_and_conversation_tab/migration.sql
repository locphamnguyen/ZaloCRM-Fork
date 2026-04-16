-- AlterTable: Add crm_name to contacts
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "crm_name" TEXT;

-- AlterTable: Add tab to conversations with default 'main'
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "tab" TEXT NOT NULL DEFAULT 'main';

-- CreateIndex: Composite index for tab-based queries
CREATE INDEX IF NOT EXISTS "conversations_org_id_tab_last_message_at_idx" ON "conversations"("org_id", "tab", "last_message_at");
