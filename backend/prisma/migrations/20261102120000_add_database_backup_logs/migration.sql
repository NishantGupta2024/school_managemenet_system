-- Migration: Add Database Backup Execution Logs Table
-- Target: PostgreSQL
-- Safety: New standalone table only. Zero modifications to existing financial or academic tables.

CREATE TABLE IF NOT EXISTS "database_backup_logs" (
  "id" TEXT NOT NULL,
  "backupId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL, -- 'RUNNING', 'SUCCESS', 'FAILED', 'INTEGRITY_FAILED', 'RETENTION_PENDING'
  "durationMs" INTEGER,
  "sizeBytes" BIGINT,
  "sha256" TEXT,
  "isEncrypted" BOOLEAN NOT NULL DEFAULT true,
  "isFullSystem" BOOLEAN NOT NULL DEFAULT true,
  "schoolId" TEXT,
  "backupPath" TEXT,
  "metadataPath" TEXT,
  "failureCategory" TEXT,
  "errorMessage" TEXT,
  "retentionStatus" TEXT, -- 'ACTIVE', 'EXPIRED', 'PURGED', 'RETAINED_LATEST', 'DRY_RUN_ELIGIBLE'
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "database_backup_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "database_backup_logs_backupId_key" ON "database_backup_logs"("backupId");
CREATE INDEX IF NOT EXISTS "database_backup_logs_startedAt_idx" ON "database_backup_logs"("startedAt");
CREATE INDEX IF NOT EXISTS "database_backup_logs_status_idx" ON "database_backup_logs"("status");
CREATE INDEX IF NOT EXISTS "database_backup_logs_retentionStatus_idx" ON "database_backup_logs"("retentionStatus");
