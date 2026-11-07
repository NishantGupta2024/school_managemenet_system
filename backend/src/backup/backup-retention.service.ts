import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { RetentionStatus } from './backup.types';

export interface RetentionPolicyConfig {
  dailyRetentionDays: number;   // Default 30 days
  weeklyRetentionDays: number;  // Default 90 days
  monthlyRetentionDays: number; // Default 365 days
  dryRun: boolean;             // Default true
}

export interface RetentionAuditItem {
  filename: string;
  backupAgeDays: number;
  retentionTier: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  eligibleForDeletion: boolean;
  reason: string;
  actionTaken: 'DELETED' | 'DRY_RUN_PRESERVED' | 'KEPT_LATEST' | 'KEPT_WITHIN_RETENTION' | 'INVALID_MANIFEST';
}

@Injectable()
export class BackupRetentionService {
  private readonly logger = new Logger(BackupRetentionService.name);

  /**
   * Applies the retention policy strictly within the designated backup directory.
   * Path traversal, symlinks, and deletion of the latest successful backup are blocked.
   */
  async evaluateAndPruneBackups(
    backupDir: string,
    policyConfig: Partial<RetentionPolicyConfig> = {},
  ): Promise<{
    dryRun: boolean;
    scannedCount: number;
    prunedCount: number;
    preservedCount: number;
    auditLog: RetentionAuditItem[];
  }> {
    const config: RetentionPolicyConfig = {
      dailyRetentionDays: policyConfig.dailyRetentionDays ?? 30,
      weeklyRetentionDays: policyConfig.weeklyRetentionDays ?? 90,
      monthlyRetentionDays: policyConfig.monthlyRetentionDays ?? 365,
      dryRun: policyConfig.dryRun ?? (process.env.DATABASE_BACKUP_RETENTION_DRY_RUN !== 'false'),
    };

    const resolvedBackupDir = path.resolve(backupDir);
    if (!fs.existsSync(resolvedBackupDir)) {
      this.logger.warn(`Backup directory does not exist for retention evaluation: ${resolvedBackupDir}`);
      return { dryRun: config.dryRun, scannedCount: 0, prunedCount: 0, preservedCount: 0, auditLog: [] };
    }

    const files = fs.readdirSync(resolvedBackupDir);
    const backupFiles = files.filter((f) => f.endsWith('.dump.enc') || f.endsWith('.dump'));

    // Sort descending by name/timestamp so index 0 is always the newest
    backupFiles.sort((a, b) => b.localeCompare(a));

    const auditLog: RetentionAuditItem[] = [];
    const now = Date.now();
    let prunedCount = 0;
    let preservedCount = 0;

    for (let i = 0; i < backupFiles.length; i++) {
      const filename = backupFiles[i];
      const fullPath = path.resolve(resolvedBackupDir, filename);

      // Path traversal security check: ensure canonical path is strictly inside backupDir
      if (!fullPath.startsWith(resolvedBackupDir)) {
        this.logger.error(`Security violation: File path ${fullPath} is outside backup directory. Skipping.`);
        continue;
      }

      // Symlink protection: never follow symlinks
      const lstat = fs.lstatSync(fullPath);
      if (lstat.isSymbolicLink()) {
        this.logger.warn(`Symlink detected at ${fullPath}. Skipping for safety.`);
        continue;
      }

      // INVARIANT 1: Never delete the most recent backup
      if (i === 0) {
        auditLog.push({
          filename,
          backupAgeDays: 0,
          retentionTier: 'DAILY',
          eligibleForDeletion: false,
          reason: 'LATEST_VERIFIED_BACKUP_PROTECTION',
          actionTaken: 'KEPT_LATEST',
        });
        preservedCount++;
        continue;
      }

      // Read adjacent manifest
      const metaFilename = filename.replace(/(\.dump|\.dump\.enc)$/, '.meta.json');
      const metaPath = path.resolve(resolvedBackupDir, metaFilename);

      if (!fs.existsSync(metaPath)) {
        auditLog.push({
          filename,
          backupAgeDays: -1,
          retentionTier: 'DAILY',
          eligibleForDeletion: false,
          reason: 'MANIFEST_MISSING',
          actionTaken: 'INVALID_MANIFEST',
        });
        preservedCount++;
        continue;
      }

      let meta: any;
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {
        auditLog.push({
          filename,
          backupAgeDays: -1,
          retentionTier: 'DAILY',
          eligibleForDeletion: false,
          reason: 'MANIFEST_CORRUPT',
          actionTaken: 'INVALID_MANIFEST',
        });
        preservedCount++;
        continue;
      }

      const backupDate = new Date(meta.timestamp || lstat.mtime);
      const ageDays = (now - backupDate.getTime()) / (1000 * 60 * 60 * 24);

      // Determine retention tier
      // A backup is "Weekly" if created on Sunday (day 0)
      // A backup is "Monthly" if created on 1st of month (date 1)
      const isMonthly = backupDate.getUTCDate() === 1;
      const isWeekly = backupDate.getUTCDay() === 0;

      let maxAllowedAgeDays = config.dailyRetentionDays;
      let tier: 'DAILY' | 'WEEKLY' | 'MONTHLY' = 'DAILY';

      if (isMonthly) {
        maxAllowedAgeDays = config.monthlyRetentionDays;
        tier = 'MONTHLY';
      } else if (isWeekly) {
        maxAllowedAgeDays = config.weeklyRetentionDays;
        tier = 'WEEKLY';
      }

      const isExpired = ageDays > maxAllowedAgeDays;

      if (!isExpired) {
        auditLog.push({
          filename,
          backupAgeDays: Math.floor(ageDays),
          retentionTier: tier,
          eligibleForDeletion: false,
          reason: `WITHIN_RETENTION_WINDOW_${tier}_MAX_${maxAllowedAgeDays}D`,
          actionTaken: 'KEPT_WITHIN_RETENTION',
        });
        preservedCount++;
      } else {
        // Backup is eligible for pruning
        if (config.dryRun) {
          auditLog.push({
            filename,
            backupAgeDays: Math.floor(ageDays),
            retentionTier: tier,
            eligibleForDeletion: true,
            reason: `EXPIRED_${tier}_AGE_${Math.floor(ageDays)}D_GT_${maxAllowedAgeDays}D`,
            actionTaken: 'DRY_RUN_PRESERVED',
          });
          preservedCount++;
        } else {
          // Actual deletion mode
          try {
            fs.unlinkSync(fullPath);
            if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
            auditLog.push({
              filename,
              backupAgeDays: Math.floor(ageDays),
              retentionTier: tier,
              eligibleForDeletion: true,
              reason: `PURGED_${tier}_AGE_${Math.floor(ageDays)}D`,
              actionTaken: 'DELETED',
            });
            prunedCount++;
            this.logger.log(`Retention purged expired backup: ${filename} (Age: ${Math.floor(ageDays)} days)`);
          } catch (err: any) {
            this.logger.error(`Failed to delete expired backup file ${fullPath}: ${err.message}`);
          }
        }
      }
    }

    return {
      dryRun: config.dryRun,
      scannedCount: backupFiles.length,
      prunedCount,
      preservedCount,
      auditLog,
    };
  }
}
