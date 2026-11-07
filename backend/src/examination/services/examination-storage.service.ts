import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface StoredImageMetadata {
  storagePath: string;
  checksumSha256: string;
  fileSize: number;
  mimeType: string;
  fileName: string;
  width?: number;
  height?: number;
}

@Injectable()
export class ExaminationStorageService {
  private readonly logger = new Logger(ExaminationStorageService.name);
  private readonly storageRoot: string;
  private readonly canonicalRoot: string;

  constructor() {
    this.storageRoot =
      process.env.EXAMINATION_STORAGE_PATH ||
      process.env.APP_STORAGE_PATH ||
      path.join(process.cwd(), 'storage');

    this.ensureDirectory(this.storageRoot);
    this.canonicalRoot = path.resolve(this.storageRoot);
    this.ensureDirectory(path.join(this.storageRoot, 'examination-question-images'));
  }

  public getStorageRoot(): string {
    return this.storageRoot;
  }

  /**
   * Verifies that the configured examination image storage directory exists and is writable.
   */
  public async verifyStorageWritable(): Promise<boolean> {
    const imgDir = path.join(this.storageRoot, 'examination-question-images');
    this.ensureDirectory(imgDir);
    await fs.promises.access(imgDir, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  }

  /**
   * Validates path identifiers to prevent path traversal attacks.
   */
  public validateSegment(segment: string, name: string): void {
    if (!segment || typeof segment !== 'string') {
      throw new BadRequestException(`Invalid storage path segment: ${name} is required`);
    }
    // Only allow alphanumeric characters, hyphens, and underscores (e.g. UUIDs)
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
   * Validates image buffer signatures, dimensions, and ensures no active content.
   * Allowed formats: PNG, JPEG, WebP.
   * Prohibited: SVG, HTML, script tags, executables.
   */
  public validateImageBuffer(
    buffer: Buffer,
    originalFilename?: string,
  ): { mimeType: string; extension: string; width?: number; height?: number } {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Uploaded image file is empty');
    }

    const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
    if (buffer.length > MAX_IMAGE_SIZE) {
      throw new BadRequestException('Image exceeds maximum allowed size of 5 MB');
    }

    // Active content & SVG check (scan up to first and last 2048 bytes)
    const scanChunk = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('ascii').toLowerCase();
    const tailChunk = buffer.length > 2048
      ? buffer.subarray(buffer.length - 1024).toString('ascii').toLowerCase()
      : '';
    const combinedScan = `${scanChunk} ${tailChunk}`;

    if (
      combinedScan.includes('<svg') ||
      combinedScan.includes('<?xml') ||
      combinedScan.includes('<!doctype') ||
      combinedScan.includes('<!entity') ||
      combinedScan.includes('xmlns') ||
      combinedScan.includes('<script') ||
      combinedScan.includes('<html') ||
      combinedScan.includes('<?php')
    ) {
      throw new BadRequestException(
        'Active-content and SVG images are strictly forbidden for security',
      );
    }

    // 1. PNG Verification
    // Signature: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer.length >= 24 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      // Verify IHDR chunk header
      const chunkType = buffer.subarray(12, 16).toString('ascii');
      if (chunkType !== 'IHDR') {
        throw new BadRequestException('Corrupt PNG image: Missing IHDR chunk');
      }
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      if (width <= 0 || height <= 0 || width > 16384 || height > 16384) {
        throw new BadRequestException('Invalid or excessive PNG image dimensions');
      }
      return { mimeType: 'image/png', extension: 'png', width, height };
    }

    // 2. JPEG Verification
    // Signature: FF D8 FF
    if (
      buffer.length >= 10 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      // Scan for Start of Frame (SOF0 = FF C0, SOF2 = FF C2) to extract dimensions
      let width: number | undefined;
      let height: number | undefined;
      let offset = 2;

      while (offset < buffer.length - 8) {
        if (buffer[offset] === 0xff) {
          const marker = buffer[offset + 1];
          // SOF0 (baseline) or SOF2 (progressive)
          if (marker === 0xc0 || marker === 0xc2) {
            height = buffer.readUInt16BE(offset + 5);
            width = buffer.readUInt16BE(offset + 7);
            break;
          }
          // Skip marker segment
          if (marker !== 0xd8 && marker !== 0xd9 && marker !== 0x00 && marker !== 0xff) {
            const length = buffer.readUInt16BE(offset + 2);
            offset += length + 2;
            continue;
          }
        }
        offset++;
      }

      // Check for End of Image (EOI = FF D9) within trailing 1024 bytes
      const searchTail = buffer.subarray(Math.max(0, buffer.length - 1024));
      let hasEoi = false;
      for (let i = 0; i < searchTail.length - 1; i++) {
        if (searchTail[i] === 0xff && searchTail[i + 1] === 0xd9) {
          hasEoi = true;
          break;
        }
      }

      if (!hasEoi) {
        throw new BadRequestException('Corrupt JPEG image: Missing EOI terminator');
      }

      if (width !== undefined && height !== undefined) {
        if (width <= 0 || height <= 0 || width > 16384 || height > 16384) {
          throw new BadRequestException('Invalid or excessive JPEG image dimensions');
        }
      }

      return { mimeType: 'image/jpeg', extension: 'jpg', width, height };
    }

    // 3. WebP Verification
    // Signature: RIFF....WEBP
    if (
      buffer.length >= 16 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      const chunkType = buffer.subarray(12, 16).toString('ascii');
      if (chunkType !== 'VP8 ' && chunkType !== 'VP8L' && chunkType !== 'VP8X') {
        throw new BadRequestException('Unsupported or corrupt WebP format');
      }
      return { mimeType: 'image/webp', extension: 'webp' };
    }

    throw new BadRequestException(
      'Invalid file format. Only valid PNG, JPEG, and WebP images are permitted',
    );
  }

  /**
   * Persists an image file atomically to private storage.
   * Path: storage/examination-question-images/{schoolId}/{assessmentId}/{questionId}_{checksumPrefix}.{ext}
   */
  public async storeQuestionImage(
    schoolId: string,
    assessmentId: string,
    questionId: string,
    buffer: Buffer,
    originalFilename: string,
  ): Promise<StoredImageMetadata> {
    this.validateSegment(schoolId, 'schoolId');
    this.validateSegment(assessmentId, 'assessmentId');
    this.validateSegment(questionId, 'questionId');

    const validation = this.validateImageBuffer(buffer, originalFilename);
    const checksumSha256 = this.computeSha256(buffer);
    const checksumPrefix = checksumSha256.slice(0, 12);
    const uploadNonce = crypto.randomUUID().replace(/-/g, '');

    const relativeDir = path.join('examination-question-images', schoolId, assessmentId);
    const absoluteDir = path.join(this.storageRoot, relativeDir);

    // Enforce path containment
    const resolvedDir = path.resolve(absoluteDir);
    if (!resolvedDir.startsWith(this.canonicalRoot)) {
      throw new BadRequestException('Security violation: Storage path containment breach');
    }
    this.ensureDirectory(resolvedDir);

    const filename = `${questionId}_${uploadNonce}_${checksumPrefix}.${validation.extension}`;
    const relativePath = path.join(relativeDir, filename).replace(/\\/g, '/');
    const absolutePath = path.join(this.storageRoot, relativePath);

    const resolvedFile = path.resolve(absolutePath);
    if (!resolvedFile.startsWith(this.canonicalRoot)) {
      throw new BadRequestException('Security violation: File containment breach');
    }

    // Sanitize original filename for client display
    const sanitizedFileName = (originalFilename || `image.${validation.extension}`)
      .replace(/[^a-zA-Z0-9._\-]/g, '_')
      .slice(0, 100);

    // Atomic write via temp file
    const tmpPath = `${absolutePath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(tmpPath, buffer, { mode: 0o600 });
      await fs.promises.rename(tmpPath, absolutePath);
      this.logger.log(`Stored question image for ${questionId} at ${relativePath}`);
      return {
        storagePath: relativePath,
        checksumSha256,
        fileSize: buffer.length,
        mimeType: validation.mimeType,
        fileName: sanitizedFileName,
        width: validation.width,
        height: validation.height,
      };
    } catch (err: any) {
      await fs.promises.rm(tmpPath, { force: true }).catch(() => undefined);
      this.logger.error(`Failed persisting question image: ${err.message}`, err.stack);
      throw new InternalServerErrorException('Failed persisting question image to private storage');
    }
  }

  /**
   * Reads a question image from private storage.
   */
  public async readQuestionImage(storagePath: string): Promise<Buffer> {
    if (!storagePath || storagePath.includes('..')) {
      throw new BadRequestException('Security violation: Invalid storage path');
    }

    const absolutePath = path.join(this.storageRoot, storagePath);
    const resolvedPath = path.resolve(absolutePath);

    if (!resolvedPath.startsWith(this.canonicalRoot)) {
      throw new BadRequestException('Security violation: Storage path containment breach');
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new NotFoundException('Question image file not found on private storage');
    }

    try {
      return await fs.promises.readFile(resolvedPath);
    } catch (err: any) {
      this.logger.error(`Failed reading question image: ${err.message}`, err.stack);
      throw new InternalServerErrorException('Failed reading question image from private storage');
    }
  }

  /**
   * Safely unlinks a physical file from disk.
   */
  public async deleteFileSafe(storagePath: string): Promise<boolean> {
    if (!storagePath || storagePath.includes('..')) {
      return false;
    }

    const absolutePath = path.join(this.storageRoot, storagePath);
    const resolvedPath = path.resolve(absolutePath);

    if (!resolvedPath.startsWith(this.canonicalRoot)) {
      return false;
    }

    try {
      if (fs.existsSync(resolvedPath)) {
        await fs.promises.unlink(resolvedPath);
        this.logger.log(`Unlinked image file: ${storagePath}`);
        return true;
      }
      return false;
    } catch (err: any) {
      this.logger.warn(`Failed unlinking image file ${storagePath}: ${err.message}`);
      return false;
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
