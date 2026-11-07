import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ReceiptTemplateStorageService } from './receipt-template-storage.service';

describe('ReceiptTemplateStorageService', () => {
  let service: ReceiptTemplateStorageService;
  let testStorageRoot: string;

  beforeEach(() => {
    testStorageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-storage-test-'));
    process.env.RECEIPT_STORAGE_PATH = testStorageRoot;
    service = new ReceiptTemplateStorageService();
  });

  afterEach(() => {
    try {
      fs.rmSync(testStorageRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('computes accurate SHA-256 hash', () => {
    const data = Buffer.from('HelloWorld');
    const hash = service.computeSha256(data);
    expect(hash).toBe('872e4e50ce9990d8b041330c47c9ddd11bec6b503ae9386a99da8584e9bb12c4');
  });

  it('rejects path traversal attempts in schoolId and templateId', async () => {
    const dummy = Buffer.from('test');
    await expect(
      service.storeTemplateVersionDocx('../school-attack', 'tpl-1', 1, dummy),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.storeTemplateVersionDocx('school-1', '../../template-attack', 1, dummy),
    ).rejects.toThrow(BadRequestException);
  });

  it('stores a new template version DOCX file and allows reading it back', async () => {
    const fileContent = Buffer.from('MOCK_DOCX_FILE_DATA');
    const result = await service.storeTemplateVersionDocx(
      'school-alpha',
      'tpl-101',
      1,
      fileContent,
    );

    expect(result.fileSize).toBe(fileContent.length);
    expect(result.storagePath).toBe('receipt-templates/school-alpha/tpl-101/v1.docx');
    expect(result.checksumSha256).toBe(service.computeSha256(fileContent));

    const readBack = await service.readTemplateDocx(result.storagePath);
    expect(readBack.toString()).toBe('MOCK_DOCX_FILE_DATA');
  });

  it('handles idempotent retries for identical content and rejects conflicting mutations with ConflictException', async () => {
    const fileContent = Buffer.from('ORIGINAL_DATA');
    const res1 = await service.storeTemplateVersionDocx('school-1', 'tpl-1', 1, fileContent);

    // 1. Idempotent retry with IDENTICAL content returns verified metadata
    const resIdentical = await service.storeTemplateVersionDocx('school-1', 'tpl-1', 1, fileContent);
    expect(resIdentical.storagePath).toBe(res1.storagePath);
    expect(resIdentical.checksumSha256).toBe(res1.checksumSha256);

    // 2. Conflicting retry with MUTATED content throws ConflictException
    await expect(
      service.storeTemplateVersionDocx('school-1', 'tpl-1', 1, Buffer.from('MUTATED_CONTENT')),
    ).rejects.toThrow(ConflictException);

    // The original content on disk must remain intact and unmutated
    const current = await service.readTemplateDocx(res1.storagePath);
    expect(current.toString()).toBe('ORIGINAL_DATA');
  });

  it('throws NotFoundException when reading non-existent template file', async () => {
    await expect(
      service.readTemplateDocx('receipt-templates/school-1/tpl-1/nonexistent.docx'),
    ).rejects.toThrow(NotFoundException);
  });

  it('stores and reads receipt artifact PDF correctly', async () => {
    const pdfData = Buffer.from('%PDF-1.4 mock artifact');
    const stored = await service.storeReceiptArtifactPdf(
      'school-alpha',
      'ay-2026',
      'RCT-202627-00001',
      pdfData,
    );

    expect(stored.storagePath).toContain('receipt-artifacts/school-alpha/ay-2026/RCT-202627-00001.pdf');
    const read = await service.readReceiptArtifactPdf(stored.storagePath);
    expect(read.toString()).toBe('%PDF-1.4 mock artifact');
  });
});
