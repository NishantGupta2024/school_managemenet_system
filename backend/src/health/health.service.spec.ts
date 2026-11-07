import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptTemplateStorageService } from '../receipt-templates/receipt-template-storage.service';
import { ExaminationStorageService } from '../examination/services/examination-storage.service';

describe('HealthService & HealthController (OPS-01, OPS-02, OPS-03)', () => {
  let service: HealthService;
  let controller: HealthController;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: {
            ping: jest.fn().mockResolvedValue(5),
          },
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    controller = module.get<HealthController>(HealthController);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(controller).toBeDefined();
  });

  it('should return minimal sanitized ok status when database responds', async () => {
    const result = await service.checkHealth();

    expect(result.status).toBe('ok');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('uptime');
    // Confirm no business or tenant data leakage
    expect((result as any).database).toBeUndefined();
    expect((result as any).tenantContext).toBeUndefined();
  });

  it('should return error status gracefully when database ping fails', async () => {
    jest.spyOn(prismaService, 'ping').mockRejectedValueOnce(new Error('Connection timeout'));

    const result = await service.checkHealth();

    expect(result.status).toBe('error');
    expect((result as any).database).toBeUndefined();
    expect((result as any).error).toBeUndefined();
  });

  describe('OPS-02 — HealthController HTTP Status Codes', () => {
    it('returns HTTP 200 payload on getHealth and getReadiness when PostgreSQL is healthy', async () => {
      const health = await controller.getHealth();
      expect(health.status).toBe('ok');

      const ready = await controller.getReadiness();
      expect(ready.status).toBe('ok');
    });

    it('throws ServiceUnavailableException (HTTP 503) on getHealth and getReadiness when PostgreSQL is unavailable', async () => {
      jest.spyOn(prismaService, 'ping').mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(controller.getHealth()).rejects.toThrow(ServiceUnavailableException);
      await expect(controller.getReadiness()).rejects.toThrow(ServiceUnavailableException);

      try {
        await controller.getReadiness();
      } catch (err: any) {
        expect(err.getStatus()).toBe(503);
        expect(err.getResponse()).toEqual(
          expect.objectContaining({ status: 'error' }),
        );
      }
    });

    it('returns HTTP 200 on getLiveness even when PostgreSQL is down', () => {
      const live = controller.getLiveness();
      expect(live.status).toBe('ok');
    });
  });

  describe('OPS-01 & OPS-03 — Dockerfile Invariants & Persistent Storage Durability', () => {
    it('verifies frontend/Dockerfile copies frontend/public and backend/Dockerfile installs postgresql-client and sets appuser permissions', () => {
      const repoRoot = path.resolve(__dirname, '../../..');
      const frontendDockerfile = fs.readFileSync(path.join(repoRoot, 'frontend/Dockerfile'), 'utf8');
      const backendDockerfile = fs.readFileSync(path.join(repoRoot, 'backend/Dockerfile'), 'utf8');
      const dockerComposeProd = fs.readFileSync(path.join(repoRoot, 'docker-compose.prod.yml'), 'utf8');

      // OPS-01: frontend/public copied into builder stage and cymbix-logo.png exists in public/
      expect(frontendDockerfile).toContain('COPY frontend/public ./frontend/public');
      expect(fs.existsSync(path.join(repoRoot, 'frontend/public/cymbix-logo.png'))).toBe(true);

      // OPS-01: postgresql-client installed in backend runner stage and backup/storage dirs chowned to appuser
      expect(backendDockerfile).toContain('postgresql-client');
      expect(backendDockerfile).toContain('/var/backups/fee_database');
      expect(backendDockerfile).toContain('/usr/src/app/storage');
      expect(backendDockerfile).toContain('chown -R appuser:appgroup');

      // OPS-03: app_storage_data volume mounted in docker-compose.prod.yml
      expect(dockerComposeProd).toContain('app_storage_data:/usr/src/app/storage');
      expect(dockerComposeProd).toContain('name: fee_prod_app_storage_data');
    });

    it('persists receipt templates, receipt artifacts, and examination images across service re-instantiation (container restart simulation)', async () => {
      const tempVolumeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cymbix-storage-vol-'));
      const prevAppStorage = process.env.APP_STORAGE_PATH;
      const prevReceiptStorage = process.env.RECEIPT_STORAGE_PATH;
      const prevExamStorage = process.env.EXAMINATION_STORAGE_PATH;

      try {
        process.env.APP_STORAGE_PATH = tempVolumeDir;
        delete process.env.RECEIPT_STORAGE_PATH;
        delete process.env.EXAMINATION_STORAGE_PATH;

        // Instance 1 (Before container restart): write template, receipt PDF, and exam image
        const receiptStorage1 = new ReceiptTemplateStorageService();
        const examStorage1 = new ExaminationStorageService();

        expect(await receiptStorage1.verifyStorageWritable()).toBe(true);
        expect(await examStorage1.verifyStorageWritable()).toBe(true);

        const schoolId = '11111111-1111-1111-1111-111111111111';
        const templateId = '22222222-2222-2222-2222-222222222222';
        const academicYearId = '33333333-3333-3333-3333-333333333333';

        const docxContent = Buffer.from('PK-mock-docx-template-binary');
        const pdfContent = Buffer.from('%PDF-1.4-mock-receipt-artifact');

        const storedDocx = await receiptStorage1.storeTemplateVersionDocx(schoolId, templateId, 1, docxContent);
        const storedPdf = await receiptStorage1.storeReceiptArtifactPdf(schoolId, academicYearId, 'REC-2026-0001', pdfContent);

        // Minimal valid 1x1 PNG buffer (24+ bytes with IHDR width=1, height=1)
        const pngHeader = Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
          0x00, 0x00, 0x00, 0x0d, // IHDR length
          0x49, 0x48, 0x44, 0x52, // 'IHDR'
          0x00, 0x00, 0x00, 0x01, // width = 1
          0x00, 0x00, 0x00, 0x01, // height = 1
          0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
        ]);
        const storedImg = await examStorage1.storeQuestionImage(
          schoolId,
          '44444444-4444-4444-4444-444444444444',
          '55555555-5555-5555-5555-555555555555',
          pngHeader,
          'diagram.png',
        );

        // Instance 2 (Simulating new container process mounting the same persistent volume):
        const receiptStorage2 = new ReceiptTemplateStorageService();
        const examStorage2 = new ExaminationStorageService();

        const retrievedDocx = await receiptStorage2.readTemplateDocx(storedDocx.storagePath);
        const retrievedPdf = await receiptStorage2.readReceiptArtifactPdf(storedPdf.storagePath);
        const retrievedImg = await examStorage2.readQuestionImage(storedImg.storagePath);

        expect(retrievedDocx.equals(docxContent)).toBe(true);
        expect(retrievedPdf.equals(pdfContent)).toBe(true);
        expect(retrievedImg.equals(pngHeader)).toBe(true);
      } finally {
        if (prevAppStorage === undefined) delete process.env.APP_STORAGE_PATH;
        else process.env.APP_STORAGE_PATH = prevAppStorage;
        if (prevReceiptStorage === undefined) delete process.env.RECEIPT_STORAGE_PATH;
        else process.env.RECEIPT_STORAGE_PATH = prevReceiptStorage;
        if (prevExamStorage === undefined) delete process.env.EXAMINATION_STORAGE_PATH;
        else process.env.EXAMINATION_STORAGE_PATH = prevExamStorage;
        fs.rmSync(tempVolumeDir, { recursive: true, force: true });
      }
    });
  });
});
