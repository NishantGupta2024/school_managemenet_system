import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseBackupRestoreService, BackupResult } from '../scripts/database-backup-restore';
import { BackupExecutionLogService } from './backup-execution-log.service';
import { BackupAlertService } from './backup-alert.service';
import { BackupRetentionService } from './backup-retention.service';
import { BackupExecutionStatus, BackupFailureCategory } from './backup.types';

export interface AutomatedBackupConfig {
  backupDir: string;
  encryptionKey?: string;
  databaseUrl: string;
}

@Injectable()
export class DatabaseBackupService {
  private readonly logger = new Logger(DatabaseBackupService.name);
  private readonly backupUtility = new DatabaseBackupRestoreService();

  constructor(
    private readonly logService: BackupExecutionLogService,
    private readonly alertService: BackupAlertService,
    private readonly retentionService: BackupRetentionService,
  ) {}

  /**
   * Executes a full system encrypted backup with complete observability,
   * manifest validation, error categorization, and failure alerting.
   */
  async executeAutomatedBackup(config?: Partial<AutomatedBackupConfig>): Promise<BackupResult> {
    // Determine backup directory with precedence: explicit config -> DATABASE_BACKUP_DIRECTORY -> DATABASE_BACKUP_DIR -> default
    const backupDir =
      config?.backupDir ||
      process.env.DATABASE_BACKUP_DIRECTORY ||
      process.env.DATABASE_BACKUP_DIR ||
      './backups';

    // Determine encryption key with precedence: explicit config -> DATABASE_BACKUP_ENCRYPTION_KEY -> BACKUP_ENCRYPTION_KEY
    const encryptionKey =
      config?.encryptionKey !== undefined
        ? config.encryptionKey
        : process.env.DATABASE_BACKUP_ENCRYPTION_KEY || process.env.BACKUP_ENCRYPTION_KEY;

    const databaseUrl = config?.databaseUrl !== undefined ? config.databaseUrl : process.env.DATABASE_URL;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `backup_full_system_${timestamp}`;

    this.logger.log(`Starting automated full-system backup (${backupId})...`);
    await this.logService.startLog(backupId, true);

    // 1. Fail Closed: Check required configuration
    if (!databaseUrl) {
      const errMsg = 'DATABASE_URL configuration is missing. Cannot determine source database.';
      this.logger.error(errMsg);
      await this.logService.markFailure(backupId, BackupFailureCategory.CONFIGURATION_MISSING, errMsg);
      await this.alertService.sendFailureAlert({
        backupId,
        failureCategory: BackupFailureCategory.CONFIGURATION_MISSING,
        sanitizedErrorMessage: errMsg,
        targetDatabase: 'UNKNOWN',
        timestamp: new Date(),
      });
      return { success: false, error: errMsg, isFullSystem: true };
    }

    if (!encryptionKey) {
      const errMsg = 'DATABASE_BACKUP_ENCRYPTION_KEY / BACKUP_ENCRYPTION_KEY is missing. Unencrypted automated backups are strictly prohibited.';
      this.logger.error(errMsg);
      await this.logService.markFailure(backupId, BackupFailureCategory.ENCRYPTION_KEY_MISSING, errMsg);
      await this.alertService.sendFailureAlert({
        backupId,
        failureCategory: BackupFailureCategory.ENCRYPTION_KEY_MISSING,
        sanitizedErrorMessage: errMsg,
        targetDatabase: this.extractDatabaseName(databaseUrl),
        timestamp: new Date(),
      });
      return { success: false, error: errMsg, isFullSystem: true };
    }

    const tStart = Date.now();

    try {
      // 2. Execute pg_dump and AES-256-GCM encryption
      const result = await this.backupUtility.executeBackup({
        userRole: 'PLATFORM_SUPER_ADMIN',
        databaseUrl,
        outputDir: backupDir,
        encryptionKey,
        dryRun: false,
      });

      if (!result.success || !result.backupPath || !result.metadataPath) {
        throw new Error(result.error || 'Backup utility returned unsuccessful without error details');
      }

      // 3. Post-Backup Integrity & Checksum Verification
      const calculatedChecksum = DatabaseBackupRestoreService.computeChecksum(result.backupPath);
      const meta = JSON.parse(fs.readFileSync(result.metadataPath, 'utf8'));

      if (calculatedChecksum !== meta.sha256) {
        const checksumErr = `Post-backup checksum mismatch! Expected ${meta.sha256}, calculated ${calculatedChecksum}.`;
        this.logger.error(checksumErr);
        await this.logService.markFailure(
          backupId,
          BackupFailureCategory.CHECKSUM_MISMATCH,
          checksumErr,
          BackupExecutionStatus.INTEGRITY_FAILED,
        );
        await this.alertService.sendFailureAlert({
          backupId,
          failureCategory: BackupFailureCategory.CHECKSUM_MISMATCH,
          sanitizedErrorMessage: checksumErr,
          targetDatabase: this.extractDatabaseName(databaseUrl),
          timestamp: new Date(),
        });
        return { success: false, error: checksumErr, isFullSystem: true };
      }

      const durationMs = Date.now() - tStart;
      this.logger.log(
        `Automated backup succeeded in ${durationMs}ms: ${path.basename(result.backupPath)} (Size: ${result.sizeBytes} bytes)`,
      );

      // 4. Mark success in audit log
      await this.logService.markSuccess(backupId, {
        durationMs,
        sizeBytes: result.sizeBytes || 0,
        sha256: calculatedChecksum,
        backupPath: result.backupPath,
        metadataPath: result.metadataPath,
      });

      // 5. Evaluate retention policy
      try {
        await this.retentionService.evaluateAndPruneBackups(backupDir);
      } catch (retentionErr: any) {
        this.logger.warn(`Retention evaluation encountered non-fatal error: ${retentionErr.message}`);
      }

      return result;
    } catch (err: any) {
      const sanitizedErr = this.logService.sanitizeErrorMessage(err.message);
      this.logger.error(`Automated backup failed: ${sanitizedErr}`);

      await this.logService.markFailure(backupId, BackupFailureCategory.DUMP_PROCESS_FAILED, sanitizedErr);
      await this.alertService.sendFailureAlert({
        backupId,
        failureCategory: BackupFailureCategory.DUMP_PROCESS_FAILED,
        sanitizedErrorMessage: sanitizedErr,
        targetDatabase: this.extractDatabaseName(databaseUrl),
        timestamp: new Date(),
      });

      return { success: false, error: sanitizedErr, isFullSystem: true };
    }
  }

  private extractDatabaseName(dbUrl: string): string {
    try {
      const url = new URL(dbUrl);
      return url.pathname.replace(/^\//, '');
    } catch {
      return 'UNKNOWN';
    }
  }
}
