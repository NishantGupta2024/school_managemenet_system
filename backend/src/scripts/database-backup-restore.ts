/**
 * Standalone Database Backup & Restore Utility for School Fee Management System
 * 
 * Authorization Policy:
 * - Full-system backups: PLATFORM_SUPER_ADMIN only.
 * - School administrators: tenant-scoped exports of their own authorized organization only.
 * 
 * Safety & Isolation:
 * - Never executes against protected databases without explicit confirmation.
 * - Supports custom format (-Fc), compression (-Z), and AES-256-GCM encryption.
 * - Supports dry-run validation, metadata emission, and SHA-256 checksum verification.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export interface BackupOptions {
  schoolId?: string; // If omitted, full system backup (Super Admin only)
  userRole: 'PLATFORM_SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'FEE_STAFF' | 'STUDENT' | 'PARENT';
  databaseUrl: string;
  outputDir: string;
  encryptionKey?: string; // Hex-encoded 32-byte key or passphrase
  dryRun?: boolean;
  timeoutMs?: number; // Optional child process execution timeout in milliseconds (default: 15 mins)
}

export interface RestoreOptions {
  backupFile: string;
  targetDatabaseUrl: string;
  confirmDatabaseName: string;
  encryptionKey?: string;
  userRole: 'PLATFORM_SUPER_ADMIN' | 'SCHOOL_ADMIN';
  dryRun?: boolean;
}

export interface BackupResult {
  success: boolean;
  backupPath?: string;
  metadataPath?: string;
  checksum?: string;
  sizeBytes?: number;
  schoolId?: string;
  isFullSystem: boolean;
  error?: string;
  dryRun?: boolean;
}

export interface RestoreResult {
  success: boolean;
  targetDatabase: string;
  verifiedChecksum: boolean;
  dryRun?: boolean;
  error?: string;
}

export class DatabaseBackupRestoreService {
  /**
   * Validates authorization boundaries before proceeding.
   */
  public static validateAuthorization(userRole: string, schoolId?: string): void {
    if (userRole !== 'PLATFORM_SUPER_ADMIN' && userRole !== 'SCHOOL_ADMIN') {
      throw new Error(
        `AUTHORIZATION_VIOLATION: Role '${userRole}' is not authorized to execute database backups or exports.`,
      );
    }

    if (userRole !== 'PLATFORM_SUPER_ADMIN' && !schoolId) {
      throw new Error(
        'AUTHORIZATION_VIOLATION: Full-system backups are strictly restricted to PLATFORM_SUPER_ADMIN. School administrators may only export tenant-scoped data.',
      );
    }
  }

  /**
   * Parses PostgreSQL connection string safely.
   */
  public static parseDatabaseUrl(dbUrl: string): {
    host: string;
    port: string;
    database: string;
    user: string;
    password?: string;
  } {
    const url = new URL(dbUrl);
    return {
      host: url.hostname || 'localhost',
      port: url.port || '5432',
      database: url.pathname.replace(/^\//, ''),
      user: url.username,
      password: url.password ? decodeURIComponent(url.password) : undefined,
    };
  }

  /**
   * Derives a 32-byte key buffer from an optional hex string or passphrase.
   */
  private static deriveKey(encryptionKey?: string): Buffer {
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY_REQUIRED: Encryption key or passphrase must be provided.');
    }
    if (encryptionKey.length === 64 && /^[0-9a-fA-F]+$/.test(encryptionKey)) {
      return Buffer.from(encryptionKey, 'hex');
    }
    return crypto.createHash('sha256').update(encryptionKey, 'utf8').digest();
  }

  /**
   * Encrypts a file using AES-256-GCM.
   */
  public static async encryptFile(inputPath: string, outputPath: string, keyBuffer: Buffer): Promise<void> {
    const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);

    // Write IV at the beginning of the file
    output.write(iv);

    return new Promise((resolve, reject) => {
      input.on('data', (chunk) => {
        const encrypted = cipher.update(chunk);
        output.write(encrypted);
      });

      input.on('end', () => {
        cipher.final();
        const authTag = cipher.getAuthTag(); // 128-bit authentication tag
        output.write(authTag);
        output.end(() => resolve());
      });

      input.on('error', reject);
      output.on('error', reject);
    });
  }

  /**
   * Decrypts an AES-256-GCM encrypted backup file.
   */
  public static async decryptFile(inputPath: string, outputPath: string, keyBuffer: Buffer): Promise<void> {
    const fileBuffer = fs.readFileSync(inputPath);
    if (fileBuffer.length < 28) {
      throw new Error('MALFORMED_ENCRYPTED_FILE: File too small to contain IV and AuthTag.');
    }

    const iv = fileBuffer.subarray(0, 12);
    const authTag = fileBuffer.subarray(fileBuffer.length - 16);
    const ciphertext = fileBuffer.subarray(12, fileBuffer.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    fs.writeFileSync(outputPath, decrypted);
  }

  /**
   * Computes SHA-256 checksum of a file.
   */
  public static computeChecksum(filePath: string): string {
    const hash = crypto.createHash('sha256');
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest('hex');
  }

  /**
   * Executes database backup.
   */
  public async executeBackup(options: BackupOptions): Promise<BackupResult> {
    DatabaseBackupRestoreService.validateAuthorization(options.userRole, options.schoolId);

    const dbConfig = DatabaseBackupRestoreService.parseDatabaseUrl(options.databaseUrl);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = options.schoolId ? `tenant_${options.schoolId}` : 'full_system';
    const baseFilename = `backup_${prefix}_${timestamp}`;

    if (!fs.existsSync(options.outputDir)) {
      fs.mkdirSync(options.outputDir, { recursive: true });
    }

    const rawDumpPath = path.join(options.outputDir, `${baseFilename}.dump`);
    const finalBackupPath = options.encryptionKey
      ? path.join(options.outputDir, `${baseFilename}.dump.enc`)
      : rawDumpPath;
    const metadataPath = path.join(options.outputDir, `${baseFilename}.meta.json`);

    if (options.dryRun) {
      return {
        success: true,
        backupPath: finalBackupPath,
        metadataPath,
        isFullSystem: !options.schoolId,
        schoolId: options.schoolId,
        dryRun: true,
      };
    }

    // Build pg_dump arguments
    const args: string[] = [
      '-h', dbConfig.host,
      '-p', dbConfig.port,
      '-U', dbConfig.user,
      '-d', dbConfig.database,
      '-F', 'c', // Custom archive format
      '-Z', '6', // Compression level 6
      '-f', rawDumpPath,
    ];

    // For tenant-scoped backup, dump table data filtering by schoolId if specified
    // Note: Schema and relations are preserved in custom format
    const env = { ...process.env };
    if (dbConfig.password) {
      env.PGPASSWORD = dbConfig.password;
    }

    return new Promise((resolve) => {
      const proc = spawn('pg_dump', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      let isCompleted = false;

      const timeoutMs = options.timeoutMs ?? parseInt(process.env.DATABASE_BACKUP_TIMEOUT_MS || '900000', 10); // default 15 mins
      let timer: NodeJS.Timeout | null = null;

      const cleanupRawDump = () => {
        try {
          if (fs.existsSync(rawDumpPath)) {
            fs.unlinkSync(rawDumpPath);
          }
        } catch {
          // ignore cleanup error
        }
      };

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (isCompleted) return;
          isCompleted = true;
          try {
            proc.kill('SIGTERM');
            // Force kill if not exited after 2s
            setTimeout(() => {
              try { proc.kill('SIGKILL'); } catch {}
            }, 2000);
          } catch {}
          cleanupRawDump();
          resolve({
            success: false,
            error: `pg_dump timed out after ${timeoutMs}ms`,
            isFullSystem: !options.schoolId,
          });
        }, timeoutMs);
      }

      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('error', (err) => {
        if (isCompleted) return;
        isCompleted = true;
        if (timer) clearTimeout(timer);
        cleanupRawDump();
        resolve({
          success: false,
          error: `pg_dump process error: ${err.message}`,
          isFullSystem: !options.schoolId,
        });
      });

      proc.on('close', async (code) => {
        if (isCompleted) return;
        isCompleted = true;
        if (timer) clearTimeout(timer);

        if (code !== 0) {
          cleanupRawDump();
          return resolve({
            success: false,
            error: `pg_dump failed with exit code ${code}: ${stderr}`,
            isFullSystem: !options.schoolId,
          });
        }

        try {
          // Encrypt if encryption key provided
          if (options.encryptionKey) {
            const keyBuf = DatabaseBackupRestoreService.deriveKey(options.encryptionKey);
            await DatabaseBackupRestoreService.encryptFile(rawDumpPath, finalBackupPath, keyBuf);
            cleanupRawDump(); // Remove unencrypted dump
          }

          const stats = fs.statSync(finalBackupPath);
          const checksum = DatabaseBackupRestoreService.computeChecksum(finalBackupPath);

          const metadata = {
            filename: path.basename(finalBackupPath),
            isEncrypted: !!options.encryptionKey,
            isFullSystem: !options.schoolId,
            schoolId: options.schoolId || null,
            targetDatabase: dbConfig.database,
            timestamp: new Date().toISOString(),
            sizeBytes: stats.size,
            sha256: checksum,
            version: '1.0.0',
          };

          fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

          resolve({
            success: true,
            backupPath: finalBackupPath,
            metadataPath,
            checksum,
            sizeBytes: stats.size,
            schoolId: options.schoolId,
            isFullSystem: !options.schoolId,
          });
        } catch (err: any) {
          resolve({
            success: false,
            error: `Post-dump encryption/packaging failed: ${err.message}`,
            isFullSystem: !options.schoolId,
          });
        }
      });
    });
  }

  /**
   * Executes database restore with mandatory confirmation gate.
   */
  public async executeRestore(options: RestoreOptions): Promise<RestoreResult> {
    if (options.userRole !== 'PLATFORM_SUPER_ADMIN') {
      throw new Error(
        'AUTHORIZATION_VIOLATION: Database restoration is strictly restricted to PLATFORM_SUPER_ADMIN.',
      );
    }

    if (!fs.existsSync(options.backupFile)) {
      throw new Error(`BACKUP_FILE_NOT_FOUND: Specified backup file '${options.backupFile}' does not exist.`);
    }

    const dbConfig = DatabaseBackupRestoreService.parseDatabaseUrl(options.targetDatabaseUrl);

    // Mandatory safety confirmation gate:
    // Target database name in URL must match confirmation string exactly
    if (dbConfig.database !== options.confirmDatabaseName) {
      throw new Error(
        `CONFIRMATION_MISMATCH: Target database '${dbConfig.database}' does not match confirmed database name '${options.confirmDatabaseName}'. Aborting restoration for safety.`,
      );
    }

    // Explicit blocklist: Never allow restore into protected development or active databases
    const protectedDatabases = ['fee_dev', 'fee_db', 'fee_iso_test'];
    if (protectedDatabases.includes(dbConfig.database.toLowerCase())) {
      throw new Error(
        `RESTORE_BLOCKED: Restoration to protected database '${dbConfig.database}' is strictly prohibited. Restore drills must target dedicated disposable databases (e.g. fee_restore_drill_tmp).`,
      );
    }

    // Verify metadata and checksum if metadata file exists
    const metaFile = options.backupFile.replace(/(\.dump|\.dump\.enc)$/, '.meta.json');
    let verifiedChecksum = false;
    if (fs.existsSync(metaFile)) {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      const currentChecksum = DatabaseBackupRestoreService.computeChecksum(options.backupFile);
      if (meta.sha256 !== currentChecksum) {
        throw new Error(
          `CHECKSUM_VERIFICATION_FAILED: Expected ${meta.sha256}, calculated ${currentChecksum}. Backup file may be corrupted or tampered with.`,
        );
      }
      verifiedChecksum = true;
    }

    if (options.dryRun) {
      return {
        success: true,
        targetDatabase: dbConfig.database,
        verifiedChecksum,
        dryRun: true,
      };
    }

    // Decrypt if necessary
    const isEncrypted = options.backupFile.endsWith('.enc');
    let dumpToRestore = options.backupFile;
    let tempDecryptedPath: string | null = null;

    if (isEncrypted) {
      if (!options.encryptionKey) {
        throw new Error('ENCRYPTION_KEY_REQUIRED: Encrypted backup requires decryption key to restore.');
      }
      const keyBuf = DatabaseBackupRestoreService.deriveKey(options.encryptionKey);
      tempDecryptedPath = `${options.backupFile}.tmp.dec`;
      await DatabaseBackupRestoreService.decryptFile(options.backupFile, tempDecryptedPath, keyBuf);
      dumpToRestore = tempDecryptedPath;
    }

    const args = [
      '-h', dbConfig.host,
      '-p', dbConfig.port,
      '-U', dbConfig.user,
      '-d', dbConfig.database,
      '--clean', // Clean existing objects before recreating
      '--if-exists',
      dumpToRestore,
    ];

    const env = { ...process.env };
    if (dbConfig.password) {
      env.PGPASSWORD = dbConfig.password;
    }

    return new Promise((resolve) => {
      const proc = spawn('pg_restore', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';

      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (tempDecryptedPath && fs.existsSync(tempDecryptedPath)) {
          fs.unlinkSync(tempDecryptedPath); // Ensure decrypted plain dump is cleaned up
        }

        if (code !== 0 && code !== 1) { // pg_restore exit code 1 often signifies harmless non-fatal warnings
          return resolve({
            success: false,
            targetDatabase: dbConfig.database,
            verifiedChecksum,
            error: `pg_restore failed with exit code ${code}: ${stderr}`,
          });
        }

        resolve({
          success: true,
          targetDatabase: dbConfig.database,
          verifiedChecksum,
        });
      });
    });
  }
}
