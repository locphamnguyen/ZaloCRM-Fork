-- B2 Phase 01: Blocks, Block Attachments, Custom Attribute Definitions, API Keys, API Key Usage
-- Additive only — no existing tables or columns are modified (except Contact.custom_attrs addition)

-- AlterTable: Add custom_attrs JSONB column to contacts
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "custom_attrs" JSONB NOT NULL DEFAULT '{}';

-- CreateTable: blocks
CREATE TABLE IF NOT EXISTS "blocks" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: block_attachments
CREATE TABLE IF NOT EXISTS "block_attachments" (
    "id" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "block_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: custom_attribute_definitions
CREATE TABLE IF NOT EXISTS "custom_attribute_definitions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data_type" TEXT NOT NULL,
    "enum_values" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_attribute_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: api_keys
CREATE TABLE IF NOT EXISTS "api_keys" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '["read"]',
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable: api_key_usage
CREATE TABLE IF NOT EXISTS "api_key_usage" (
    "id" TEXT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "api_key_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: blocks
CREATE INDEX IF NOT EXISTS "blocks_org_id_type_deleted_at_idx" ON "blocks"("org_id", "type", "deleted_at");
CREATE INDEX IF NOT EXISTS "blocks_org_id_owner_user_id_idx" ON "blocks"("org_id", "owner_user_id");

-- CreateIndex: block_attachments
CREATE INDEX IF NOT EXISTS "block_attachments_block_id_position_idx" ON "block_attachments"("block_id", "position");

-- CreateIndex: custom_attribute_definitions
CREATE UNIQUE INDEX IF NOT EXISTS "custom_attribute_definitions_org_id_key_key" ON "custom_attribute_definitions"("org_id", "key");

-- CreateIndex: api_keys
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX IF NOT EXISTS "api_keys_org_id_revoked_at_idx" ON "api_keys"("org_id", "revoked_at");

-- CreateIndex: api_key_usage
CREATE UNIQUE INDEX IF NOT EXISTS "api_key_usage_api_key_id_bucket_key" ON "api_key_usage"("api_key_id", "bucket");

-- GIN index on contacts.custom_attrs for fast JSONB path queries
CREATE INDEX IF NOT EXISTS idx_contacts_custom_attrs_gin ON contacts USING gin (custom_attrs jsonb_path_ops);

-- AddForeignKey: blocks
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: block_attachments
ALTER TABLE "block_attachments" ADD CONSTRAINT "block_attachments_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: custom_attribute_definitions
ALTER TABLE "custom_attribute_definitions" ADD CONSTRAINT "custom_attribute_definitions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: api_keys
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
