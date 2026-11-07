import { DatabaseBackupRestoreService, BackupOptions, RestoreOptions } from './database-backup-restore';
import * as fs from 'fs';
import * as path from 'path';

describe('DatabaseBackupRestoreService (Isolated Unit Test)', () => {
  const service = new DatabaseBackupRestoreService();
  const testOutputDir = path.join(__dirname, '../../test_tmp_backup');

  afterAll(() => {
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });

  describe('Authorization Validation', () => {
    it('should allow PLATFORM_SUPER_ADMIN to request full-system backup', () => {
      expect(() => {
        DatabaseBackupRestoreService.validateAuthorization('PLATFORM_SUPER_ADMIN');
      }).not.toThrow();
    });

    it('should reject SCHOOL_ADMIN requesting full-system backup without schoolId', () => {
      expect(() => {
        DatabaseBackupRestoreService.validateAuthorization('SCHOOL_ADMIN');
      }).toThrow('AUTHORIZATION_VIOLATION');
    });

    it('should allow SCHOOL_ADMIN to request tenant-scoped export with valid schoolId', () => {
      expect(() => {
        DatabaseBackupRestoreService.validateAuthorization('SCHOOL_ADMIN', 'school-123');
      }).not.toThrow();
    });

    it('should reject unauthorized roles from initiating backups', () => {
      expect(() => {
        DatabaseBackupRestoreService.validateAuthorization('FEE_STAFF', 'school-123');
      }).toThrow('AUTHORIZATION_VIOLATION');

      expect(() => {
        DatabaseBackupRestoreService.validateAuthorization('PARENT');
      }).toThrow('AUTHORIZATION_VIOLATION');
    });
  });

  describe('Database URL Parsing & Isolation Guard', () => {
    it('should correctly parse PostgreSQL connection string components', () => {
      const parsed = DatabaseBackupRestoreService.parseDatabaseUrl(
        'postgresql://admin:superSecret@db.internal:5432/fee_production?sslmode=require',
      );
      expect(parsed.host).toBe('db.internal');
      expect(parsed.port).toBe('5432');
      expect(parsed.database).toBe('fee_production');
      expect(parsed.user).toBe('admin');
      expect(parsed.password).toBe('superSecret');
    });

    it('should block restoration into protected development or production database names', async () => {
      const protectedNames = ['fee_dev', 'fee_db', 'fee_iso_test'];
      const dummyFile = path.join(testOutputDir, 'dummy_exist.dump');
      fs.writeFileSync(dummyFile, 'DUMMY_RESTORE_BYTES');

      for (const name of protectedNames) {
        await expect(
          service.executeRestore({
            backupFile: dummyFile,
            targetDatabaseUrl: `postgresql://user:pass@localhost:5432/${name}`,
            confirmDatabaseName: name,
            userRole: 'PLATFORM_SUPER_ADMIN',
          }),
        ).rejects.toThrow('RESTORE_BLOCKED');
      }
    });

    it('should fail restore if target database does not match confirmation gate', async () => {
      const dummyFile = path.join(testOutputDir, 'dummy_exist.dump');
      fs.writeFileSync(dummyFile, 'DUMMY_RESTORE_BYTES');

      await expect(
        service.executeRestore({
          backupFile: dummyFile,
          targetDatabaseUrl: 'postgresql://user:pass@localhost:5432/target_db',
          confirmDatabaseName: 'different_db_name',
          userRole: 'PLATFORM_SUPER_ADMIN',
        }),
      ).rejects.toThrow('CONFIRMATION_MISMATCH');
    });
  });

  describe('Encryption & Decryption Roundtrip with AES-256-GCM', () => {
    const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    beforeEach(() => {
      if (!fs.existsSync(testOutputDir)) {
        fs.mkdirSync(testOutputDir, { recursive: true });
      }
    });

    it('should encrypt and decrypt a synthetic dump file without byte loss', async () => {
      const originalPath = path.join(testOutputDir, 'original.sql');
      const encryptedPath = path.join(testOutputDir, 'encrypted.enc');
      const decryptedPath = path.join(testOutputDir, 'decrypted.sql');

      const syntheticData = Buffer.from('INSERT INTO students (id, name) VALUES (1, "Alice"); -- SECRET FINANCIAL DATA');
      fs.writeFileSync(originalPath, syntheticData);

      const keyBuf = Buffer.from(testKey, 'hex');

      // Encrypt
      await DatabaseBackupRestoreService.encryptFile(originalPath, encryptedPath, keyBuf);
      expect(fs.existsSync(encryptedPath)).toBe(true);

      const encryptedBytes = fs.readFileSync(encryptedPath);
      expect(encryptedBytes.includes(syntheticData)).toBe(false);

      // Decrypt
      await DatabaseBackupRestoreService.decryptFile(encryptedPath, decryptedPath, keyBuf);
      expect(fs.existsSync(decryptedPath)).toBe(true);

      const decryptedBytes = fs.readFileSync(decryptedPath);
      expect(decryptedBytes.equals(syntheticData)).toBe(true);
    });

    it('should reject decryption when authentication tag or ciphertext is tampered', async () => {
      const originalPath = path.join(testOutputDir, 'original_tamper.sql');
      const encryptedPath = path.join(testOutputDir, 'encrypted_tamper.enc');
      const decryptedPath = path.join(testOutputDir, 'decrypted_tamper.sql');

      fs.writeFileSync(originalPath, Buffer.from('CRITICAL UNTAMPERED LEDGER DATA'));
      const keyBuf = Buffer.from(testKey, 'hex');

      await DatabaseBackupRestoreService.encryptFile(originalPath, encryptedPath, keyBuf);

      // Tamper 1 byte in ciphertext
      const bytes = fs.readFileSync(encryptedPath);
      bytes[15] = bytes[15] ^ 0xff; // flip bits
      fs.writeFileSync(encryptedPath, bytes);

      await expect(
        DatabaseBackupRestoreService.decryptFile(encryptedPath, decryptedPath, keyBuf),
      ).rejects.toThrow();
    });

    it('should verify SHA-256 checksum consistency', () => {
      const testFile = path.join(testOutputDir, 'checksum_test.dat');
      fs.writeFileSync(testFile, 'PRECISE INTEGRITY CHECK');

      const checksum1 = DatabaseBackupRestoreService.computeChecksum(testFile);
      const checksum2 = DatabaseBackupRestoreService.computeChecksum(testFile);

      expect(checksum1).toBe(checksum2);
      expect(checksum1).toHaveLength(64);
    });

    it('enforces execution timeout when dump hangs', async () => {
      const slowService = new DatabaseBackupRestoreService();
      // Test timeout by setting timeoutMs to 1ms
      const result = await slowService.executeBackup({
        userRole: 'PLATFORM_SUPER_ADMIN',
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/mock_timeout_db',
        outputDir: testOutputDir,
        encryptionKey: testKey,
        timeoutMs: 1, // 1 ms will immediately timeout
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/pg_dump (timed out|failed)/);
    });
  });
});
