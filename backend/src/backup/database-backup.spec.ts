import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DatabaseBackupService } from './database-backup.service';
import { DatabaseBackupScheduler } from './database-backup.scheduler';
import { BackupExecutionLogService } from './backup-execution-log.service';
import { BackupAlertService } from './backup-alert.service';
import { BackupRetentionService } from './backup-retention.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmtpEmailProvider } from '../notifications/email/smtp-email.provider';
import { BackupExecutionStatus, BackupFailureCategory } from './backup.types';
import { DatabaseBackupRestoreService } from '../scripts/database-backup-restore';

describe('Automated Database Backup Operations', () => {
  let backupService: DatabaseBackupService;
  let scheduler: DatabaseBackupScheduler;
  let logService: BackupExecutionLogService;
  let alertService: BackupAlertService;
  let retentionService: BackupRetentionService;
  let emailProvider: { sendEmail: jest.Mock };

  const testDir = path.resolve('D:/fee/tmp_backup_test');
  const dummyKey = crypto.randomBytes(32).toString('hex');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    emailProvider = {
      sendEmail: jest.fn().mockResolvedValue({ accepted: true, providerMessageId: 'msg-alert' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseBackupService,
        DatabaseBackupScheduler,
        BackupExecutionLogService,
        BackupAlertService,
        BackupRetentionService,
        { provide: PrismaService, useValue: {} },
        { provide: SmtpEmailProvider, useValue: emailProvider },
      ],
    }).compile();

    backupService = module.get<DatabaseBackupService>(DatabaseBackupService);
    scheduler = module.get<DatabaseBackupScheduler>(DatabaseBackupScheduler);
    logService = module.get<BackupExecutionLogService>(BackupExecutionLogService);
    alertService = module.get<BackupAlertService>(BackupAlertService);
    retentionService = module.get<BackupRetentionService>(BackupRetentionService);
  });

  describe('Phase 1 & 2: Backup Service & Safety Guards', () => {
    it('fails closed and dispatches alert when DATABASE_URL is missing', async () => {
      process.env.DATABASE_BACKUP_ALERT_EMAIL = 'admin@schoolerp.internal';
      const result = await backupService.executeAutomatedBackup({
        databaseUrl: '',
        encryptionKey: dummyKey,
        backupDir: testDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('DATABASE_URL configuration is missing');
      expect(emailProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@schoolerp.internal',
          subject: expect.stringContaining('CONFIGURATION_MISSING'),
        }),
      );
    });

    it('fails closed and dispatches alert when encryption key is missing', async () => {
      process.env.DATABASE_BACKUP_ALERT_EMAIL = 'admin@schoolerp.internal';
      const result = await backupService.executeAutomatedBackup({
        databaseUrl: 'postgresql://postgres:pass@localhost:5432/fee_dev',
        encryptionKey: undefined,
        backupDir: testDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('BACKUP_ENCRYPTION_KEY is missing');
      expect(emailProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@schoolerp.internal',
          subject: expect.stringContaining('ENCRYPTION_KEY_MISSING'),
        }),
      );
    });

    it('successfully executes backup, verifies SHA-256 manifest, and logs SUCCESS', async () => {
      // Mock underlying executeBackup to return a synthetic dump and meta
      const syntheticDumpPath = path.join(testDir, 'backup_mock.dump.enc');
      const syntheticMetaPath = path.join(testDir, 'backup_mock.meta.json');
      fs.writeFileSync(syntheticDumpPath, 'SYNTHETIC_ENCRYPTED_DUMP_BYTES');
      const hash = DatabaseBackupRestoreService.computeChecksum(syntheticDumpPath);
      fs.writeFileSync(syntheticMetaPath, JSON.stringify({ sha256: hash, timestamp: new Date().toISOString() }));

      jest.spyOn((backupService as any).backupUtility, 'executeBackup').mockResolvedValue({
        success: true,
        backupPath: syntheticDumpPath,
        metadataPath: syntheticMetaPath,
        sizeBytes: 31,
        isFullSystem: true,
      });

      const result = await backupService.executeAutomatedBackup({
        databaseUrl: 'postgresql://postgres:pass@localhost:5432/mock_db',
        encryptionKey: dummyKey,
        backupDir: testDir,
      });

      expect(result.success).toBe(true);
      const logs = await logService.listLogs(1);
      expect(logs[0].status).toBe(BackupExecutionStatus.SUCCESS);
      expect(logs[0].sha256).toBe(hash);
      expect(emailProvider.sendEmail).not.toHaveBeenCalled();
    });

    it('detects SHA-256 manifest mismatch, marks INTEGRITY_FAILED, and dispatches alert', async () => {
      process.env.DATABASE_BACKUP_ALERT_EMAIL = 'admin@schoolerp.internal';
      const syntheticDumpPath = path.join(testDir, 'backup_corrupt.dump.enc');
      const syntheticMetaPath = path.join(testDir, 'backup_corrupt.meta.json');
      fs.writeFileSync(syntheticDumpPath, 'VALID_BYTES');
      fs.writeFileSync(syntheticMetaPath, JSON.stringify({ sha256: 'CORRUPTED_HASH', timestamp: new Date().toISOString() }));

      jest.spyOn((backupService as any).backupUtility, 'executeBackup').mockResolvedValue({
        success: true,
        backupPath: syntheticDumpPath,
        metadataPath: syntheticMetaPath,
        sizeBytes: 11,
        isFullSystem: true,
      });

      const result = await backupService.executeAutomatedBackup({
        databaseUrl: 'postgresql://postgres:pass@localhost:5432/mock_db',
        encryptionKey: dummyKey,
        backupDir: testDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('checksum mismatch');
      expect(emailProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@schoolerp.internal',
          subject: expect.stringContaining('CHECKSUM_MISMATCH'),
        }),
      );
    });
  });

  describe('Phase 1: Scheduler Overlap & Concurrency Guard', () => {
    it('prevents overlapping backup execution while a backup is in progress', async () => {
      // Simulate long running backup
      let resolveLongBackup: any;
      const longBackupPromise = new Promise((resolve) => { resolveLongBackup = resolve; });
      jest.spyOn(backupService, 'executeAutomatedBackup').mockImplementation(async () => {
        await longBackupPromise;
        return { success: true, isFullSystem: true };
      });

      // Start first execution
      const trigger1 = scheduler.triggerBackupExecution();
      expect(scheduler.getStatus().isBackupInProgress).toBe(true);

      // Attempt second execution while first is in progress
      const trigger2 = await scheduler.triggerBackupExecution();
      expect(trigger2).toBe(false);

      // Complete first
      resolveLongBackup();
      await trigger1;
      expect(scheduler.getStatus().isBackupInProgress).toBe(false);
    });

    it('respects scheduler disabled configuration', () => {
      delete process.env.DATABASE_BACKUP_ENABLED;
      const disabledScheduler = new DatabaseBackupScheduler(backupService);
      expect(disabledScheduler.isEnabled).toBe(false);
    });

    it('parses DATABASE_BACKUP_CRON_SCHEDULE and converts IST to UTC', () => {
      process.env.DATABASE_BACKUP_CRON_SCHEDULE = '0 2 * * *';
      process.env.DATABASE_BACKUP_TIMEZONE = 'Asia/Kolkata';
      const scheduledScheduler = new DatabaseBackupScheduler(backupService);
      // 02:00 IST = 20:30 UTC previous day
      expect(scheduledScheduler.targetHourUtc).toBe(20);
      expect(scheduledScheduler.targetMinuteUtc).toBe(30);
    });

    it('parses custom cron schedule for UTC timezone', () => {
      process.env.DATABASE_BACKUP_CRON_SCHEDULE = '15 4 * * *';
      process.env.DATABASE_BACKUP_TIMEZONE = 'UTC';
      const scheduledScheduler = new DatabaseBackupScheduler(backupService);
      expect(scheduledScheduler.targetHourUtc).toBe(4);
      expect(scheduledScheduler.targetMinuteUtc).toBe(15);
    });
  });

  describe('Phase 2.1: Environment Variable Aliases & Precedence', () => {
    afterEach(() => {
      delete process.env.DATABASE_BACKUP_DIRECTORY;
      delete process.env.DATABASE_BACKUP_DIR;
      delete process.env.DATABASE_BACKUP_ENCRYPTION_KEY;
      delete process.env.BACKUP_ENCRYPTION_KEY;
    });

    it('supports DATABASE_BACKUP_DIR alias when DATABASE_BACKUP_DIRECTORY is unset', async () => {
      process.env.DATABASE_BACKUP_DIR = testDir;
      process.env.DATABASE_BACKUP_ENCRYPTION_KEY = dummyKey;

      const spy = jest.spyOn((backupService as any).backupUtility, 'executeBackup').mockResolvedValue({
        success: true,
        backupPath: path.join(testDir, 'b.dump.enc'),
        metadataPath: path.join(testDir, 'b.meta.json'),
        sizeBytes: 10,
        isFullSystem: true,
      });

      fs.writeFileSync(path.join(testDir, 'b.dump.enc'), 'DUMP');
      const hash = DatabaseBackupRestoreService.computeChecksum(path.join(testDir, 'b.dump.enc'));
      fs.writeFileSync(path.join(testDir, 'b.meta.json'), JSON.stringify({ sha256: hash }));

      await backupService.executeAutomatedBackup({
        databaseUrl: 'postgresql://user:pass@localhost:5432/test_db',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          outputDir: testDir,
          encryptionKey: dummyKey,
        }),
      );
    });

    it('prioritizes DATABASE_BACKUP_ENCRYPTION_KEY over BACKUP_ENCRYPTION_KEY', async () => {
      const primaryKey = 'a'.repeat(64);
      const secondaryKey = 'b'.repeat(64);
      process.env.DATABASE_BACKUP_ENCRYPTION_KEY = primaryKey;
      process.env.BACKUP_ENCRYPTION_KEY = secondaryKey;

      const spy = jest.spyOn((backupService as any).backupUtility, 'executeBackup').mockResolvedValue({
        success: true,
        backupPath: path.join(testDir, 'b2.dump.enc'),
        metadataPath: path.join(testDir, 'b2.meta.json'),
        sizeBytes: 10,
        isFullSystem: true,
      });

      fs.writeFileSync(path.join(testDir, 'b2.dump.enc'), 'DUMP');
      const hash = DatabaseBackupRestoreService.computeChecksum(path.join(testDir, 'b2.dump.enc'));
      fs.writeFileSync(path.join(testDir, 'b2.meta.json'), JSON.stringify({ sha256: hash }));

      await backupService.executeAutomatedBackup({
        databaseUrl: 'postgresql://user:pass@localhost:5432/test_db',
        backupDir: testDir,
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          encryptionKey: primaryKey,
        }),
      );
    });
  });

  describe('Phase 4: Retention Policy & Safety Invariants', () => {
    beforeEach(() => {
      // Clean testDir between tests
      const files = fs.readdirSync(testDir);
      for (const f of files) {
        fs.rmSync(path.join(testDir, f), { recursive: true, force: true });
      }
    });

    it('preserves the latest backup even if older than retention limit', async () => {
      const dummyBackup = path.join(testDir, 'backup_full_system_old.dump.enc');
      const dummyMeta = path.join(testDir, 'backup_full_system_old.meta.json');
      fs.writeFileSync(dummyBackup, 'OLD_BACKUP');
      // Set timestamp 100 days ago
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      fs.writeFileSync(dummyMeta, JSON.stringify({ timestamp: oldDate, sha256: 'abc' }));

      const res = await retentionService.evaluateAndPruneBackups(testDir, {
        dailyRetentionDays: 30,
        dryRun: false,
      });

      // Index 0 is the newest backup -> must be preserved by invariant
      expect(res.auditLog[0].actionTaken).toBe('KEPT_LATEST');
      expect(fs.existsSync(dummyBackup)).toBe(true);
    });

    it('runs in dry-run mode by default and does not delete files', async () => {
      // Create two backups: latest and an older expired one
      const newestDump = path.join(testDir, 'backup_full_system_2026-11-02.dump.enc');
      const newestMeta = path.join(testDir, 'backup_full_system_2026-11-02.meta.json');
      fs.writeFileSync(newestDump, 'NEW');
      fs.writeFileSync(newestMeta, JSON.stringify({ timestamp: new Date().toISOString(), sha256: 'new' }));

      const expiredDump = path.join(testDir, 'backup_full_system_2026-08-01.dump.enc');
      const expiredMeta = path.join(testDir, 'backup_full_system_2026-08-01.meta.json');
      fs.writeFileSync(expiredDump, 'EXPIRED');
      const expiredDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days old
      fs.writeFileSync(expiredMeta, JSON.stringify({ timestamp: expiredDate, sha256: 'exp' }));

      const res = await retentionService.evaluateAndPruneBackups(testDir, {
        dailyRetentionDays: 30,
        dryRun: true,
      });

      expect(res.dryRun).toBe(true);
      expect(res.prunedCount).toBe(0);
      expect(fs.existsSync(expiredDump)).toBe(true);
      const expiredItem = res.auditLog.find((x) => x.filename.includes('2026-08-01'));
      expect(expiredItem?.actionTaken).toBe('DRY_RUN_PRESERVED');
    });

    it('preserves files with missing or corrupt manifests without throwing', async () => {
      // Create a dummy newer backup so corruptDump is not index 0 (which is automatically protected as KEPT_LATEST)
      const newestDump = path.join(testDir, 'backup_full_system_z_latest.dump.enc');
      const newestMeta = path.join(testDir, 'backup_full_system_z_latest.meta.json');
      fs.writeFileSync(newestDump, 'LATEST');
      fs.writeFileSync(newestMeta, JSON.stringify({ timestamp: new Date().toISOString(), sha256: 'valid' }));

      const corruptDump = path.join(testDir, 'backup_full_system_a_corrupt_manifest.dump.enc');
      fs.writeFileSync(corruptDump, 'DATA');
      // No meta file created

      const res = await retentionService.evaluateAndPruneBackups(testDir, { dryRun: false });
      const item = res.auditLog.find((x) => x.filename.includes('a_corrupt_manifest'));
      expect(item?.actionTaken).toBe('INVALID_MANIFEST');
      expect(fs.existsSync(corruptDump)).toBe(true);
    });
  });

  describe('Phase 5: Alerting Redaction & Throttling', () => {
    it('redacts database passwords and keys in error messages', () => {
      const dirty = 'Error connecting to postgresql://postgres:MySecretPassword123@db.example.com:5432/fee_db with key=SecretKey99';
      const clean = logService.sanitizeErrorMessage(dirty);

      expect(clean).not.toContain('MySecretPassword123');
      expect(clean).not.toContain('SecretKey99');
      expect(clean).toContain('postgresql://***:***@');
    });

    it('throttles duplicate failure alerts within cooldown window', async () => {
      process.env.DATABASE_BACKUP_ALERT_EMAIL = 'admin@schoolerp.internal';
      // First alert
      const res1 = await alertService.sendFailureAlert({
        backupId: 'id-1',
        failureCategory: BackupFailureCategory.DATABASE_CONNECTION_ERROR,
        sanitizedErrorMessage: 'Connection timeout',
        targetDatabase: 'fee_dev',
        timestamp: new Date(),
      });
      expect(res1.sent).toBe(true);

      // Immediate duplicate
      const res2 = await alertService.sendFailureAlert({
        backupId: 'id-2',
        failureCategory: BackupFailureCategory.DATABASE_CONNECTION_ERROR,
        sanitizedErrorMessage: 'Connection timeout again',
        targetDatabase: 'fee_dev',
        timestamp: new Date(),
      });
      expect(res2.sent).toBe(false);
      expect(res2.reason).toBe('COOLDOWN_ACTIVE');
    });
  });
});
