-- Migration: 20261024010000_add_receipt_templates
-- Phase R1: Custom Receipt Templates & Rendered Artifact Registry
-- Pre-Migration Safety: Additive only. Existing receipts, sequences, and snapshots preserved.

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE "ReceiptTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "TemplateVersionStatus" AS ENUM ('PENDING_PREVIEW', 'VALIDATED', 'ACTIVE', 'SUPERSEDED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReceiptArtifactStatus" AS ENUM ('PENDING', 'READY', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create Receipt Template Master Table
CREATE TABLE IF NOT EXISTS "receipt_templates" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Default Receipt Template',
  "description" TEXT,
  "status" "ReceiptTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "activeVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "receipt_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receipt_templates_schoolId_name_key" UNIQUE ("schoolId", "name"),
  CONSTRAINT "receipt_templates_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "receipt_templates_activeVersionId_key" UNIQUE ("activeVersionId"),
  CONSTRAINT "receipt_templates_schoolId_activeVersionId_key" UNIQUE ("schoolId", "activeVersionId")
);

-- 3. Create Receipt Template Versions Table
CREATE TABLE IF NOT EXISTS "receipt_template_versions" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "placeholdersDetected" JSONB NOT NULL,
  "validationDiagnostics" JSONB,
  "status" "TemplateVersionStatus" NOT NULL DEFAULT 'PENDING_PREVIEW',
  "uploadedByUserId" TEXT,
  "activatedByUserId" TEXT,
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "receipt_template_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receipt_template_versions_schoolId_templateId_versionNumber_key" UNIQUE ("schoolId", "templateId", "versionNumber"),
  CONSTRAINT "receipt_template_versions_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "chk_template_version_number_positive" CHECK ("versionNumber" > 0),
  CONSTRAINT "chk_template_file_size_positive" CHECK ("fileSize" > 0)
);

-- 4. Alter Existing schools and receipts Tables (Additive columns)
ALTER TABLE "schools"
  ADD COLUMN IF NOT EXISTS "defaultReceiptTemplateId" TEXT;

ALTER TABLE "receipts"
  ADD COLUMN IF NOT EXISTS "templateVersionId" TEXT;

-- 5. Create Receipt Artifacts Table
CREATE TABLE IF NOT EXISTS "receipt_artifacts" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "templateVersionId" TEXT,
  "status" "ReceiptArtifactStatus" NOT NULL DEFAULT 'PENDING',
  "storagePath" TEXT,
  "fileSize" INTEGER,
  "checksumSha256" TEXT,
  "generationAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "receipt_artifacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receipt_artifacts_receiptId_key" UNIQUE ("receiptId"),
  CONSTRAINT "receipt_artifacts_schoolId_receiptId_key" UNIQUE ("schoolId", "receiptId"),
  CONSTRAINT "receipt_artifacts_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "chk_artifact_generation_attempts_non_negative" CHECK ("generationAttempts" >= 0)
);

-- 6. Indexes for Multi-Tenant Scoping and Performance
CREATE UNIQUE INDEX IF NOT EXISTS "schools_id_defaultReceiptTemplateId_key" ON "schools"("id", "defaultReceiptTemplateId");
CREATE UNIQUE INDEX IF NOT EXISTS "receipt_templates_schoolId_activeVersionId_key" ON "receipt_templates"("schoolId", "activeVersionId");
CREATE INDEX IF NOT EXISTS "receipt_templates_schoolId_idx" ON "receipt_templates"("schoolId");
CREATE INDEX IF NOT EXISTS "receipt_template_versions_schoolId_idx" ON "receipt_template_versions"("schoolId");
CREATE INDEX IF NOT EXISTS "receipt_template_versions_templateId_idx" ON "receipt_template_versions"("templateId");
CREATE INDEX IF NOT EXISTS "receipt_artifacts_schoolId_idx" ON "receipt_artifacts"("schoolId");
CREATE INDEX IF NOT EXISTS "receipt_artifacts_receiptId_idx" ON "receipt_artifacts"("receiptId");
CREATE INDEX IF NOT EXISTS "receipts_templateVersionId_idx" ON "receipts"("templateVersionId");

-- 7. Foreign Key Constraints (Tenant-Safe & Referential Integrity)
ALTER TABLE "receipt_templates"
  DROP CONSTRAINT IF EXISTS "receipt_templates_schoolId_fkey",
  ADD CONSTRAINT "receipt_templates_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "receipt_template_versions"
  DROP CONSTRAINT IF EXISTS "receipt_template_versions_schoolId_fkey",
  ADD CONSTRAINT "receipt_template_versions_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "receipt_template_versions"
  DROP CONSTRAINT IF EXISTS "receipt_template_versions_schoolId_templateId_fkey",
  ADD CONSTRAINT "receipt_template_versions_schoolId_templateId_fkey"
  FOREIGN KEY ("schoolId", "templateId") REFERENCES "receipt_templates"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "receipt_templates"
  DROP CONSTRAINT IF EXISTS "receipt_templates_activeVersionId_fkey",
  DROP CONSTRAINT IF EXISTS "receipt_templates_schoolId_activeVersionId_fkey",
  ADD CONSTRAINT "receipt_templates_schoolId_activeVersionId_fkey"
  FOREIGN KEY ("schoolId", "activeVersionId") REFERENCES "receipt_template_versions"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receipt_template_versions"
  DROP CONSTRAINT IF EXISTS "receipt_template_versions_uploadedByUserId_fkey",
  ADD CONSTRAINT "receipt_template_versions_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receipt_template_versions"
  DROP CONSTRAINT IF EXISTS "receipt_template_versions_activatedByUserId_fkey",
  ADD CONSTRAINT "receipt_template_versions_activatedByUserId_fkey"
  FOREIGN KEY ("activatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "schools"
  DROP CONSTRAINT IF EXISTS "schools_defaultReceiptTemplateId_fkey",
  DROP CONSTRAINT IF EXISTS "schools_id_defaultReceiptTemplateId_fkey",
  ADD CONSTRAINT "schools_id_defaultReceiptTemplateId_fkey"
  FOREIGN KEY ("id", "defaultReceiptTemplateId") REFERENCES "receipt_templates"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receipts"
  DROP CONSTRAINT IF EXISTS "receipts_schoolId_templateVersionId_fkey",
  ADD CONSTRAINT "receipts_schoolId_templateVersionId_fkey"
  FOREIGN KEY ("schoolId", "templateVersionId") REFERENCES "receipt_template_versions"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receipt_artifacts"
  DROP CONSTRAINT IF EXISTS "receipt_artifacts_schoolId_fkey",
  ADD CONSTRAINT "receipt_artifacts_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "receipt_artifacts"
  DROP CONSTRAINT IF EXISTS "receipt_artifacts_schoolId_receiptId_fkey",
  ADD CONSTRAINT "receipt_artifacts_schoolId_receiptId_fkey"
  FOREIGN KEY ("schoolId", "receiptId") REFERENCES "receipts"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "receipt_artifacts"
  DROP CONSTRAINT IF EXISTS "receipt_artifacts_schoolId_templateVersionId_fkey",
  ADD CONSTRAINT "receipt_artifacts_schoolId_templateVersionId_fkey"
  FOREIGN KEY ("schoolId", "templateVersionId") REFERENCES "receipt_template_versions"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
