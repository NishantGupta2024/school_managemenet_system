import * as fs from 'fs';
import * as path from 'path';
import {
  DisasterRecoveryRestoreDrill,
  PROTECTED_DATABASES,
  RestoreDrillConfig,
} from './disaster-recovery-restore-drill';

describe('DisasterRecoveryRestoreDrill (Isolated Safety Unit Tests)', () => {
  let drill: DisasterRecoveryRestoreDrill;
  const dummyBackupPath = path.join(__dirname, 'dummy_test_backup.dump');

  beforeAll(() => {
    drill = new DisasterRecoveryRestoreDrill();
    fs.writeFileSync(dummyBackupPath, 'DUMMY_PG_DUMP_CONTENT');
  });

  afterAll(() => {
    if (fs.existsSync(dummyBackupPath)) {
      fs.unlinkSync(dummyBackupPath);
    }
  });

  describe('1. Role Authorization & Least Privilege', () => {
    it('fails closed when non-super-admin userRole attempts restore drill', async () => {
      const result = await drill.executeDrill({
        backupFile: dummyBackupPath,
        targetDatabaseUrl: 'postgresql://postgres:pass@localhost:5432/fee_restore_tmp',
        confirmDatabaseName: 'fee_restore_tmp',
        userRole: 'SCHOOL_ADMIN',
        dryRun: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('AUTHORIZATION_VIOLATION');
    });

    it('rejects STUDENT or PARENT role', async () => {
      const result = await drill.executeDrill({
        backupFile: dummyBackupPath,
        targetDatabaseUrl: 'postgresql://postgres:pass@localhost:5432/fee_restore_tmp',
        confirmDatabaseName: 'fee_restore_tmp',
        userRole: 'STUDENT' as any,
        dryRun: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('AUTHORIZATION_VIOLATION');
    });
  });

  describe('2. Confirmation Mismatch Gate', () => {
    it('fails closed when target database in URL does not match confirmDatabaseName', async () => {
      const result = await drill.executeDrill({
        backupFile: dummyBackupPath,
        targetDatabaseUrl: 'postgresql://postgres:pass@localhost:5432/fee_restore_tmp',
        confirmDatabaseName: 'different_db_name',
        userRole: 'PLATFORM_SUPER_ADMIN',
        dryRun: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('CONFIRMATION_MISMATCH');
    });
  });

  describe('3. Protected Database Blocklist Enforcement', () => {
    it.each(PROTECTED_DATABASES)(
      'strictly blocks restoration targeting protected database %s',
      async (protectedDb) => {
        const result = await drill.executeDrill({
          backupFile: dummyBackupPath,
          targetDatabaseUrl: `postgresql://postgres:pass@localhost:5432/${protectedDb}`,
          confirmDatabaseName: protectedDb,
          userRole: 'PLATFORM_SUPER_ADMIN',
          dryRun: true,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('RESTORE_BLOCKED');
        expect(result.error).toContain(protectedDb);
      },
    );
  });

  describe('4. Backup File Validation & Missing Files', () => {
    it('fails closed when backup file does not exist on disk', async () => {
      const result = await drill.executeDrill({
        backupFile: path.join(__dirname, 'non_existent_file.dump'),
        targetDatabaseUrl: 'postgresql://postgres:pass@localhost:5432/fee_restore_tmp',
        confirmDatabaseName: 'fee_restore_tmp',
        userRole: 'PLATFORM_SUPER_ADMIN',
        dryRun: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('BACKUP_FILE_NOT_FOUND');
    });
  });

  describe('5. Dry-Run Verification without Execution', () => {
    it('passes dry-run without executing pg_restore when parameters are valid', async () => {
      const result = await drill.executeDrill({
        backupFile: dummyBackupPath,
        targetDatabaseUrl: 'postgresql://postgres:pass@localhost:5432/fee_disposable_drill_db',
        confirmDatabaseName: 'fee_disposable_drill_db',
        userRole: 'PLATFORM_SUPER_ADMIN',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.targetDatabase).toBe('fee_disposable_drill_db');
    });
  });

  describe('6. Redaction & Credential Scrubbing', () => {
    it('redacts database passwords and user tokens in error messages', () => {
      const raw = 'Failed to connect: postgresql://my_user:super_secret_password@db.cloud.internal:5432/mydb password=my_secret';
      const sanitized = DisasterRecoveryRestoreDrill.sanitizeString(raw);

      expect(sanitized).not.toContain('super_secret_password');
      expect(sanitized).not.toContain('my_secret');
      expect(sanitized).toContain('[REDACTED_PASSWORD]');
    });
  });
});
