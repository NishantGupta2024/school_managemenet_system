import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  BackupExecutionRecord,
  BackupExecutionStatus,
  BackupFailureCategory,
  RetentionStatus,
} from './backup.types';

@Injectable()
export class BackupExecutionLogService {
  private readonly logger = new Logger(BackupExecutionLogService.name);
  // In-memory ring buffer of recent logs (fallback when table is not yet migrated in test/dev)
  private readonly inMemoryLogs: Map<string, BackupExecutionRecord> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Starts a new backup execution log.
   */
  async startLog(backupId: string, isFullSystem: boolean, schoolId?: string): Promise<BackupExecutionRecord> {
    const record: BackupExecutionRecord = {
      id: crypto.randomUUID(),
      backupId,
      startedAt: new Date(),
      status: BackupExecutionStatus.RUNNING,
      isEncrypted: true,
      isFullSystem,
      schoolId: schoolId || null,
      retentionStatus: RetentionStatus.ACTIVE,
      createdAt: new Date(),
    };

    this.inMemoryLogs.set(backupId, record);

    try {
      const delegate = (this.prisma as any).databaseBackupLog;
      if (delegate && typeof delegate.create === 'function') {
        await delegate.create({ data: record });
      }
    } catch {
      // Table unmigrated; in-memory fallback active
    }

    return record;
  }

  /**
   * Marks a backup execution as SUCCESS with verified metrics.
   */
  async markSuccess(
    backupId: string,
    metrics: {
      durationMs: number;
      sizeBytes: number;
      sha256: string;
      backupPath: string;
      metadataPath: string;
    },
  ): Promise<BackupExecutionRecord | null> {
    const now = new Date();
    const existing = this.inMemoryLogs.get(backupId);
    if (existing) {
      existing.completedAt = now;
      existing.status = BackupExecutionStatus.SUCCESS;
      existing.durationMs = metrics.durationMs;
      existing.sizeBytes = metrics.sizeBytes;
      existing.sha256 = metrics.sha256;
      existing.backupPath = metrics.backupPath;
      existing.metadataPath = metrics.metadataPath;
    }

    try {
      const delegate = (this.prisma as any).databaseBackupLog;
      if (delegate && typeof delegate.update === 'function') {
        await delegate.update({
          where: { backupId },
          data: {
            completedAt: now,
            status: BackupExecutionStatus.SUCCESS,
            durationMs: metrics.durationMs,
            sizeBytes: metrics.sizeBytes,
            sha256: metrics.sha256,
            backupPath: metrics.backupPath,
            metadataPath: metrics.metadataPath,
          },
        });
      }
    } catch {
      // Table unmigrated
    }

    return existing || null;
  }

  /**
   * Marks a backup execution as FAILED or INTEGRITY_FAILED without recording sensitive data.
   */
  async markFailure(
    backupId: string,
    failureCategory: BackupFailureCategory,
    rawErrorMessage: string,
    status: BackupExecutionStatus = BackupExecutionStatus.FAILED,
  ): Promise<BackupExecutionRecord | null> {
    const now = new Date();
    // Sanitize error message to ensure no connection strings, passwords, or keys leak
    const sanitizedError = this.sanitizeErrorMessage(rawErrorMessage);

    const existing = this.inMemoryLogs.get(backupId);
    if (existing) {
      existing.completedAt = now;
      existing.status = status;
      existing.failureCategory = failureCategory;
      existing.errorMessage = sanitizedError;
      existing.durationMs = now.getTime() - existing.startedAt.getTime();
    }

    try {
      const delegate = (this.prisma as any).databaseBackupLog;
      if (delegate && typeof delegate.update === 'function') {
        await delegate.update({
          where: { backupId },
          data: {
            completedAt: now,
            status,
            failureCategory,
            errorMessage: sanitizedError,
            durationMs: existing ? now.getTime() - existing.startedAt.getTime() : undefined,
          },
        });
      }
    } catch {
      // Table unmigrated
    }

    return existing || null;
  }

  /**
   * Retrieves log by backupId.
   */
  async getLog(backupId: string): Promise<BackupExecutionRecord | null> {
    try {
      const delegate = (this.prisma as any).databaseBackupLog;
      if (delegate && typeof delegate.findUnique === 'function') {
        const found = await delegate.findUnique({ where: { backupId } });
        if (found) return found;
      }
    } catch {
      // fallback
    }
    return this.inMemoryLogs.get(backupId) || null;
  }

  /**
   * Retrieves all execution records (for platform super admin oversight).
   */
  async listLogs(limit = 50): Promise<BackupExecutionRecord[]> {
    try {
      const delegate = (this.prisma as any).databaseBackupLog;
      if (delegate && typeof delegate.findMany === 'function') {
        return await delegate.findMany({
          orderBy: { startedAt: 'desc' },
          take: limit,
        });
      }
    } catch {
      // fallback
    }
    return Array.from(this.inMemoryLogs.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Sanitizes error message to prevent database credentials, tokens, or encryption keys from leaking.
   */
  public sanitizeErrorMessage(msg: string): string {
    if (!msg) return 'Unknown error';
    return msg
      .replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://***:***@')
      .replace(/password=[^\s;&]+/gi, 'password=***')
      .replace(/key=[^\s;&]+/gi, 'key=***')
      .substring(0, 500);
  }
}
