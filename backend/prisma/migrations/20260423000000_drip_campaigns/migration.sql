-- DripCampaign + DripStep + DripEnrollment + AutomationLog

CREATE TABLE IF NOT EXISTS "drip_campaigns" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "window_start" INTEGER NOT NULL DEFAULT 8,
  "window_end" INTEGER NOT NULL DEFAULT 11,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  "start_trigger" TEXT NOT NULL DEFAULT 'manual',
  "start_tag" TEXT,
  "stop_on_reply" BOOLEAN NOT NULL DEFAULT true,
  "stop_on_tag" TEXT,
  "stop_on_inactive_days" INTEGER,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drip_campaigns_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "drip_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "drip_campaigns_org_id_enabled_idx" ON "drip_campaigns"("org_id", "enabled");

CREATE TABLE IF NOT EXISTS "drip_steps" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "campaign_id" TEXT NOT NULL,
  "step_index" INTEGER NOT NULL,
  "template_id" TEXT,
  "content" TEXT,
  "day_offset" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "drip_steps_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "drip_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "drip_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "drip_steps_campaign_id_step_index_key" ON "drip_steps"("campaign_id", "step_index");

CREATE TABLE IF NOT EXISTS "drip_enrollments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "campaign_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "zalo_account_id" TEXT NOT NULL,
  "current_step" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "scheduled_at" TIMESTAMP(3),
  "last_sent_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "fail_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drip_enrollments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "drip_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "drip_enrollments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "drip_enrollments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "drip_enrollments_zalo_account_id_fkey" FOREIGN KEY ("zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "drip_enrollments_status_scheduled_at_idx" ON "drip_enrollments"("status", "scheduled_at");
CREATE INDEX IF NOT EXISTS "drip_enrollments_contact_id_campaign_id_status_idx" ON "drip_enrollments"("contact_id", "campaign_id", "status");
-- Partial unique index: prevent duplicate active/paused enrollment for same contact+campaign
CREATE UNIQUE INDEX IF NOT EXISTS "drip_enrollments_campaign_contact_active_unique"
  ON "drip_enrollments"("campaign_id", "contact_id") WHERE "status" IN ('active', 'paused');

CREATE TABLE IF NOT EXISTS "automation_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "enrollment_id" TEXT NOT NULL,
  "step_index" INTEGER NOT NULL,
  "message_id" TEXT,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "automation_logs_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "drip_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "automation_logs_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "automation_logs_enrollment_id_sent_at_idx" ON "automation_logs"("enrollment_id", "sent_at");
CREATE INDEX IF NOT EXISTS "automation_logs_org_id_sent_at_idx" ON "automation_logs"("org_id", "sent_at");
