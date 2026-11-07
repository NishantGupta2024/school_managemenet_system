export enum BackupExecutionStatus {
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  INTEGRITY_FAILED = 'INTEGRITY_FAILED',
  RETENTION_PENDING = 'RETENTION_PENDING',
}

export enum BackupFailureCategory {
  NONE = 'NONE',
  CONFIGURATION_MISSING = 'CONFIGURATION_MISSING',
  ENCRYPTION_KEY_MISSING = 'ENCRYPTION_KEY_MISSING',
  DATABASE_CONNECTION_ERROR = 'DATABASE_CONNECTION_ERROR',
  DUMP_PROCESS_FAILED = 'DUMP_PROCESS_FAILED',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  CHECKSUM_MISMATCH = 'CHECKSUM_MISMATCH',
  RETENTION_ERROR = 'RETENTION_ERROR',
}

export enum RetentionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  PURGED = 'PURGED',
  RETAINED_LATEST = 'RETAINED_LATEST',
  DRY_RUN_ELIGIBLE = 'DRY_RUN_ELIGIBLE',
}

export interface BackupExecutionRecord {
  id: string;
  backupId: string;
  startedAt: Date;
  completedAt?: Date;
  status: BackupExecutionStatus;
  durationMs?: number;
  sizeBytes?: number;
  sha256?: string;
  isEncrypted: boolean;
  isFullSystem: boolean;
  schoolId?: string | null;
  backupPath?: string;
  metadataPath?: string;
  failureCategory?: BackupFailureCategory;
  errorMessage?: string;
  retentionStatus?: RetentionStatus;
  createdAt: Date;
}
