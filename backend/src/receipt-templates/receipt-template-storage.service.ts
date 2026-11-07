import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ReceiptTemplateStorageService {
  private readonly logger = new Logger(ReceiptTemplateStorageService.name);
  private readonly storageRoot: string;

  constructor() {
    this.storageRoot =
      process.env.RECEIPT_STORAGE_PATH ||
      process.env.APP_STORAGE_PATH ||
      path.join(process.cwd(), 'storage');

    // Ensure base storage root exists
    this.ensureDirectory(this.storageRoot);
    this.ensureDirectory(path.join(this.storageRoot, 'receipt-templates'));
    this.ensureDirectory(path.join(this.storageRoot, 'receipt-artifacts'));
  }

  public getStorageRoot(): string {
    return this.storageRoot;
  }

  /**
   * Verifies that the configured storage directories exist and are writable by the current process user.
   */
  public async verifyStorageWritable(): Promise<boolean> {
    const dirs = [
      this.storageRoot,
      path.join(this.storageRoot, 'receipt-templates'),
      path.join(this.storageRoot, 'receipt-artifacts'),
    ];
    for (const dir of dirs) {
      this.ensureDirectory(dir);
      await fs.promises.access(dir, fs.constants.R_OK | fs.constants.W_OK);
    }
    return true;
  }

  /**
   * Validates identifiers to prevent path traversal attacks.
   */
  private validateSegment(segment: string, name: string): void {
    if (!segment || typeof segment !== 'string') {
      throw new BadRequestException(`Invalid storage path segment: ${name} is required`);
    }
    // Only allow alphanumeric characters, hyphens, and underscores
    if (!/^[a-zA-Z0-9_\-]+$/.test(segment)) {
      throw new BadRequestException(`Security violation: Invalid characters in ${name}`);
    }
  }

  /**
   * Computes the SHA-256 hash of a buffer.
   */
  public computeSha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Stores a new immutable template version DOCX file.
   * Path: storage/receipt-templates/{schoolId}/{templateId}/v{versionNumber}_{checksumPrefix}.docx
   */
  public async storeTemplateVersionDocx(
    schoolId: string,
    templateId: string,
    versionNumber: number,
    buffer: Buffer,
  ): Promise<{ storagePath: string; checksumSha256: string; fileSize: number }> {
    this.validateSegment(schoolId, 'schoolId');
    this.validateSegment(templateId, 'templateId');

    if (!versionNumber || versionNumber < 1) {
      throw new BadRequestException('Version number must be a positive integer');
    }

    const checksumSha256 = this.computeSha256(buffer);
    const checksumPrefix = checksumSha256.slice(0, 12);
    const relativeDir = path.join('receipt-templates', schoolId, templateId);
    const absoluteDir = path.join(this.storageRoot, relativeDir);
    this.ensureDirectory(absoluteDir);

    const filename = `v${versionNumber}.docx`;
    const relativePath = path.join(relativeDir, filename).replace(/\\/g, '/');
    const absolutePath = path.join(this.storageRoot, relativePath);

    // Enforce write-once immutability & verify content hash parity
    if (fs.existsSync(absolutePath)) {
      const existingBuffer = await fs.promises.readFile(absolutePath);
      const existingChecksum = this.computeSha256(existingBuffer);

      if (existingChecksum === checksumSha256) {
        this.logger.log(`Template file already exists at ${relativePath} with matching checksum; returning verified existing metadata.`);
        return { storagePath: relativePath, checksumSha256, fileSize: existingBuffer.length };
      }

      this.logger.error(`Storage conflict at ${relativePath}: existing checksum ${existingChecksum.slice(0, 8)} != incoming ${checksumSha256.slice(0, 8)}`);
      throw new ConflictException(
        `Template version file already exists on disk at ${relativePath} with differing content. Re-upload to allocate the next version number.`,
      );
    }

    try {
      await fs.promises.writeFile(absolutePath, buffer, { mode: 0o600 });
      this.logger.log(`Stored template version ${versionNumber} for school ${schoolId} at ${relativePath}`);
      return {
        storagePath: relativePath,
        checksumSha256,
        fileSize: buffer.length,
      };
    } catch (err: any) {
      this.logger.error(`Failed writing template file: ${err.message}`, err.stack);
      throw new InternalServerErrorException('Failed persisting template file to private storage');
    }
  }

  /**
   * Reads a template file from private storage.
   */
  public async readTemplateDocx(storagePath: string): Promise<Buffer> {
    if (!storagePath || storagePath.includes('..')) {
      throw new BadRequestException('Security violation: Invalid storage path');
    }

    const absolutePath = path.join(this.storageRoot, storagePath);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException(`Template file not found at private storage path: ${storagePath}`);
    }

    try {
      return await fs.promises.readFile(absolutePath);
    } catch (err: any) {
      this.logger.error(`Failed reading template file: ${err.message}`, err.stack);
      throw new InternalServerErrorException('Failed reading template file from private storage');
    }
  }

  /**
   * Reads a receipt PDF artifact from private storage.
   */
  public async readReceiptArtifactPdf(storagePath: string): Promise<Buffer> {
    if (!storagePath || storagePath.includes('..')) {
      throw new BadRequestException('Security violation: Invalid storage path');
    }

    const absolutePath = path.join(this.storageRoot, storagePath);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException(`Receipt PDF artifact not found at: ${storagePath}`);
    }

    try {
      return await fs.promises.readFile(absolutePath);
    } catch (err: any) {
      this.logger.error(`Failed reading artifact: ${err.message}`, err.stack);
      throw new InternalServerErrorException('Failed reading receipt artifact from private storage');
    }
  }

  /**
   * Stores a generated PDF receipt artifact.
   * Path: storage/receipt-artifacts/{schoolId}/{academicYearId}/{receiptNumber}.pdf
   */
  public async storeReceiptArtifactPdf(
    schoolId: string,
    academicYearId: string,
    receiptNumber: string,
    pdfBuffer: Buffer,
  ): Promise<{ storagePath: string; checksumSha256: string; fileSize: number }> {
    this.validateSegment(schoolId, 'schoolId');
    this.validateSegment(academicYearId, 'academicYearId');
    this.validateSegment(receiptNumber.replace(/[^a-zA-Z0-9_\-]/g, '_'), 'receiptNumber');

    const checksumSha256 = this.computeSha256(pdfBuffer);
    const relativeDir = path.join('receipt-artifacts', schoolId, academicYearId);
    const absoluteDir = path.join(this.storageRoot, relativeDir);
    this.ensureDirectory(absoluteDir);

    const safeReceiptNumber = receiptNumber.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `${safeReceiptNumber}.pdf`;
    const relativePath = path.join(relativeDir, filename).replace(/\\/g, '/');
    const absolutePath = path.join(this.storageRoot, relativePath);

    // Atomic publish: write to a unique temp file then rename, so readers/concurrent
    // writers never observe a partially written PDF.
    const tmpPath = `${absolutePath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(tmpPath, pdfBuffer, { mode: 0o600 });
      await fs.promises.rename(tmpPath, absolutePath);
      return {
        storagePath: relativePath,
        checksumSha256,
        fileSize: pdfBuffer.length,
      };
    } catch (err: any) {
      await fs.promises.rm(tmpPath, { force: true }).catch(() => undefined);
      this.logger.error(`Failed writing receipt artifact: ${err.message}`, err.stack);
      throw new InternalServerErrorException('Failed saving receipt PDF artifact to private storage');
    }
  }

  private ensureDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      try {
        fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
      } catch (err: any) {
        this.logger.warn(`Could not create directory ${dirPath}: ${err.message}`);
      }
    }
  }
}
