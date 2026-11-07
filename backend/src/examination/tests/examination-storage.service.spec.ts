import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ExaminationStorageService } from '../services/examination-storage.service';

describe('ExaminationStorageService', () => {
  let service: ExaminationStorageService;

  beforeAll(() => {
    service = new ExaminationStorageService();
  });

  afterAll(async () => {
    // Clean up any test artifacts created in storage
    try {
      const parent = path.resolve(process.cwd(), 'storage/examination-question-images/school-test-01');
      if (fs.existsSync(parent)) {
        await fs.promises.rm(parent, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  // Helper to create a minimal valid PNG buffer with given width and height
  function createValidPngBuffer(width = 100, height = 100): Buffer {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdrChunk = Buffer.alloc(4 + 4 + 13 + 4);
    ihdrChunk.writeUInt32BE(13, 0); // Length
    ihdrChunk.write('IHDR', 4, 'ascii'); // Type
    ihdrChunk.writeUInt32BE(width, 8); // Width
    ihdrChunk.writeUInt32BE(height, 12); // Height
    ihdrChunk[16] = 8; // Bit depth
    ihdrChunk[17] = 2; // Color type (RGB)
    ihdrChunk[18] = 0; // Compression
    ihdrChunk[19] = 0; // Filter
    ihdrChunk[20] = 0; // Interlace
    ihdrChunk.writeUInt32BE(0, 21); // Dummy CRC

    const iendChunk = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
    return Buffer.concat([pngHeader, ihdrChunk, iendChunk]);
  }

  // Helper to create a minimal valid JPEG buffer
  function createValidJpegBuffer(width = 120, height = 80): Buffer {
    const soi = Buffer.from([0xff, 0xd8]);
    const sof0 = Buffer.alloc(2 + 2 + 1 + 2 + 2);
    sof0.writeUInt8(0xff, 0);
    sof0.writeUInt8(0xc0, 1); // SOF0 marker
    sof0.writeUInt16BE(7, 2); // Length
    sof0.writeUInt8(8, 4); // Precision
    sof0.writeUInt16BE(height, 5); // Height
    sof0.writeUInt16BE(width, 7); // Width
    const eoi = Buffer.from([0xff, 0xd9]);
    return Buffer.concat([soi, sof0, eoi]);
  }

  // Helper to create a minimal valid WebP buffer
  function createValidWebpBuffer(): Buffer {
    const riff = Buffer.alloc(12);
    riff.write('RIFF', 0, 'ascii');
    riff.writeUInt32LE(30, 4);
    riff.write('WEBP', 8, 'ascii');

    const vp8 = Buffer.alloc(18);
    vp8.write('VP8 ', 0, 'ascii');
    vp8.writeUInt32LE(10, 4); // Chunk size

    return Buffer.concat([riff, vp8]);
  }

  describe('validateSegment()', () => {
    it('accepts valid alphanumeric identifiers with hyphens and underscores', () => {
      expect(() => (service as any).validateSegment('school-123_abc', 'test')).not.toThrow();
      expect(() => (service as any).validateSegment('uuid-550e8400-e29b-41d4-a716-446655440000', 'test')).not.toThrow();
    });

    it('rejects path traversal attempts with ../', () => {
      expect(() => (service as any).validateSegment('../etc/passwd', 'test')).toThrow(BadRequestException);
      expect(() => (service as any).validateSegment('..', 'test')).toThrow(BadRequestException);
    });

    it('rejects slashes, spaces, and null bytes', () => {
      expect(() => (service as any).validateSegment('foo/bar', 'test')).toThrow(BadRequestException);
      expect(() => (service as any).validateSegment('foo\\bar', 'test')).toThrow(BadRequestException);
      expect(() => (service as any).validateSegment('foo bar', 'test')).toThrow(BadRequestException);
      expect(() => (service as any).validateSegment('foo\0bar', 'test')).toThrow(BadRequestException);
    });
  });

  describe('validateImageBuffer()', () => {
    it('accepts valid PNG buffer within size and dimension limits', () => {
      const png = createValidPngBuffer(800, 600);
      const res = service.validateImageBuffer(png, 'diagram.png');
      expect(res.mimeType).toBe('image/png');
      expect(res.width).toBe(800);
      expect(res.height).toBe(600);
    });

    it('accepts valid JPEG buffer within size and dimension limits', () => {
      const jpeg = createValidJpegBuffer(1024, 768);
      const res = service.validateImageBuffer(jpeg, 'diagram.jpg');
      expect(res.mimeType).toBe('image/jpeg');
      expect(res.width).toBe(1024);
      expect(res.height).toBe(768);
    });

    it('accepts valid WebP buffer within size and format constraints', () => {
      const webp = createValidWebpBuffer();
      const res = service.validateImageBuffer(webp, 'diagram.webp');
      expect(res.mimeType).toBe('image/webp');
      expect(res.extension).toBe('webp');
    });

    it('rejects empty buffer', () => {
      expect(() => service.validateImageBuffer(Buffer.alloc(0), 'empty.png')).toThrow(
        /Uploaded image file is empty/,
      );
    });

    it('rejects buffer exceeding 5MB', () => {
      const hugeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
      expect(() => service.validateImageBuffer(hugeBuffer, 'huge.png')).toThrow(
        /Image exceeds maximum allowed size of 5 MB/,
      );
    });

    it('actively rejects SVG images', () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
      expect(() => service.validateImageBuffer(svg, 'image.svg')).toThrow(
        /Active-content and SVG images are strictly forbidden for security/,
      );
    });

    it('actively rejects buffers with script tags or active code', () => {
      const malicious = Buffer.from('<script>alert("xss")</script>');
      expect(() => service.validateImageBuffer(malicious, 'image.png')).toThrow(
        /Active-content and SVG images are strictly forbidden for security/,
      );
    });

    it('rejects non-image random binary buffers', () => {
      const random = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a]);
      expect(() => service.validateImageBuffer(random, 'binary.bin')).toThrow(
        /Invalid file format. Only valid PNG, JPEG, and WebP images are permitted/,
      );
    });

    it('rejects PNG with dimensions exceeding maximum limits', () => {
      const oversizedPng = createValidPngBuffer(20000, 20000);
      expect(() => service.validateImageBuffer(oversizedPng, 'large.png')).toThrow(
        /Invalid or excessive PNG image dimensions/,
      );
    });
  });

  describe('storeQuestionImage(), readQuestionImage(), and deleteFileSafe()', () => {
    const schoolId = 'school-test-01';
    const assessmentId = 'assessment-test-01';
    const questionId = 'question-test-01';

    it('stores an image atomically, computes correct SHA-256, reads it back, and safely deletes it', async () => {
      const pngBuffer = createValidPngBuffer(200, 200);
      const expectedSha256 = crypto.createHash('sha256').update(pngBuffer).digest('hex');

      // 1. Store image
      const result = await service.storeQuestionImage(
        schoolId,
        assessmentId,
        questionId,
        pngBuffer,
        'my diagram.png',
      );

      expect(result.fileName).toBe('my_diagram.png');
      expect(result.mimeType).toBe('image/png');
      expect(result.fileSize).toBe(pngBuffer.length);
      expect(result.checksumSha256).toBe(expectedSha256);
      expect(result.storagePath).toContain('examination-question-images');

      const fullPath = path.join(process.cwd(), 'storage', result.storagePath);
      expect(fs.existsSync(fullPath)).toBe(true);

      // 2. Read image back
      const readBuffer = await service.readQuestionImage(result.storagePath);
      expect(readBuffer.equals(pngBuffer)).toBe(true);

      // 3. Delete image safely
      const deleted = await service.deleteFileSafe(result.storagePath);
      expect(deleted).toBe(true);
      expect(fs.existsSync(fullPath)).toBe(false);
    });

    it('generates unique storage paths for identical image uploads', async () => {
      const pngBuffer = createValidPngBuffer(150, 150);

      const res1 = await service.storeQuestionImage(
        schoolId,
        assessmentId,
        questionId,
        pngBuffer,
        'diagram1.png',
      );
      const res2 = await service.storeQuestionImage(
        schoolId,
        assessmentId,
        questionId,
        pngBuffer,
        'diagram2.png',
      );

      expect(res1.checksumSha256).toBe(res2.checksumSha256);
      expect(res1.storagePath).not.toBe(res2.storagePath);

      // Clean up both files
      await service.deleteFileSafe(res1.storagePath);
      await service.deleteFileSafe(res2.storagePath);
    });

    it('rejects storagePath traversal on read', async () => {
      await expect(
        service.readQuestionImage('../../../etc/passwd'),
      ).rejects.toThrow(BadRequestException);
    });

    it('safely rejects storagePath traversal on delete returning false', async () => {
      const res = await service.deleteFileSafe('../../package.json');
      expect(res).toBe(false);
    });
  });
});
