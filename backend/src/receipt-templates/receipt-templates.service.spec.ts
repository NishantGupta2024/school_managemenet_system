import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptTemplatesService } from './receipt-templates.service';
import { DocxValidatorService } from './docx-validator.service';
import { DocxPopulationService } from './docx-population.service';
import { ReceiptTemplateStorageService } from './receipt-template-storage.service';
import { ReceiptPdfEngineService } from './receipt-pdf-engine.service';
import {
  ReceiptTemplateStatus,
  TemplateVersionStatus,
  UserRole,
} from '@prisma/client';

describe('ReceiptTemplatesService', () => {
  let service: ReceiptTemplatesService;
  let prisma: any;
  let validator: any;
  let storage: any;
  let pdfEngine: any;

  const mockAdminUser = {
    id: 'user-admin-1',
    schoolId: 'school-alpha',
    role: UserRole.SCHOOL_ADMIN,
    name: 'Alpha Admin',
  };

  const mockSuperUser = {
    id: 'user-super-1',
    schoolId: null,
    role: UserRole.PLATFORM_SUPER_ADMIN,
    name: 'Super Admin',
  };

  const mockStaffUser = {
    id: 'user-staff-1',
    schoolId: 'school-alpha',
    role: UserRole.FEE_STAFF,
    name: 'Fee Staff',
  };

  beforeEach(async () => {
    prisma = {
      school: {
        update: jest.fn(),
      },
      receiptTemplate: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      receiptTemplateVersion: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    validator = {
      validateDocx: jest.fn(),
    };

    const docxPopulation = {
      populateTemplate: jest.fn().mockReturnValue(Buffer.from('populated docx bytes')),
    };

    storage = {
      storeTemplateVersionDocx: jest.fn(),
      readTemplateDocx: jest.fn(),
    };

    pdfEngine = {
      isEngineAvailable: jest.fn().mockResolvedValue(true),
      getActiveEngine: jest.fn().mockResolvedValue({ engineName: 'GOTENBERG_HTTP_SERVICE' }),
      convertToPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock pdf bytes')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptTemplatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: DocxValidatorService, useValue: validator },
        { provide: DocxPopulationService, useValue: docxPopulation },
        { provide: ReceiptTemplateStorageService, useValue: storage },
        { provide: ReceiptPdfEngineService, useValue: pdfEngine },
      ],
    }).compile();

    service = module.get<ReceiptTemplatesService>(ReceiptTemplatesService);
  });

  describe('Authorization and Tenant Isolation', () => {
    it('allows SCHOOL_ADMIN to create template in their own school', async () => {
      prisma.receiptTemplate.findUnique.mockResolvedValue(null);
      prisma.receiptTemplate.create.mockResolvedValue({
        id: 'tpl-1',
        schoolId: 'school-alpha',
        name: 'Tuition Fee Receipt',
        description: 'Standard receipt format',
        status: ReceiptTemplateStatus.DRAFT,
        activeVersionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.createTemplate('school-alpha', mockAdminUser, {
        name: 'Tuition Fee Receipt',
        description: 'Standard receipt format',
      });

      expect(res.id).toBe('tpl-1');
      expect(res.status).toBe(ReceiptTemplateStatus.DRAFT);
    });

    it('rejects cross-tenant access attempt by SCHOOL_ADMIN', async () => {
      await expect(
        service.createTemplate('school-beta', mockAdminUser, { name: 'Attempted Hijack' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects unauthorized roles (FEE_STAFF, STUDENT)', async () => {
      await expect(
        service.createTemplate('school-alpha', mockStaffUser, { name: 'Staff Attempt' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows PLATFORM_SUPER_ADMIN to manage templates across schools', async () => {
      prisma.receiptTemplate.findUnique.mockResolvedValue(null);
      prisma.receiptTemplate.create.mockResolvedValue({
        id: 'tpl-2',
        schoolId: 'school-beta',
        name: 'Super Admin Created',
        description: null,
        status: ReceiptTemplateStatus.DRAFT,
        activeVersionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.createTemplate('school-beta', mockSuperUser, {
        name: 'Super Admin Created',
      });

      expect(res.id).toBe('tpl-2');
    });
  });

  describe('Template Creation & Version Upload', () => {
    it('rejects duplicate template name within the same school', async () => {
      prisma.receiptTemplate.findUnique.mockResolvedValue({
        id: 'existing-id',
        name: 'Standard Receipt',
      });

      await expect(
        service.createTemplate('school-alpha', mockAdminUser, { name: 'Standard Receipt' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('uploads a valid DOCX and increments version number monotonically', async () => {
      prisma.receiptTemplate.findUnique.mockResolvedValue({
        id: 'tpl-1',
        schoolId: 'school-alpha',
      });

      // Existing latest version is 2
      prisma.receiptTemplateVersion.findFirst.mockResolvedValue({
        versionNumber: 2,
      });

      validator.validateDocx.mockReturnValue({
        isValid: true,
        placeholdersDetected: ['receipt.number', 'payment.amount', '#allocations', '/allocations'],
        diagnostics: { errors: [], warnings: [], hasRepeatingAllocations: true },
      });

      storage.storeTemplateVersionDocx.mockResolvedValue({
        storagePath: 'receipt-templates/school-alpha/tpl-1/v3.docx',
        checksumSha256: 'mock-sha-256',
        fileSize: 1024,
      });

      prisma.receiptTemplateVersion.create.mockResolvedValue({
        id: 'ver-3',
        templateId: 'tpl-1',
        versionNumber: 3,
        fileName: 'receipt_v3.docx',
        fileSize: 1024,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        checksumSha256: 'mock-sha-256',
        placeholdersDetected: ['receipt.number', 'payment.amount'],
        status: TemplateVersionStatus.PENDING_PREVIEW,
        uploadedByUserId: mockAdminUser.id,
        activatedByUserId: null,
        activatedAt: null,
        createdAt: new Date(),
      });

      const mockFile = {
        buffer: Buffer.from('mock docx bytes'),
        originalname: 'receipt_v3.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      } as Express.Multer.File;

      const result = await service.uploadVersion('school-alpha', mockAdminUser, 'tpl-1', mockFile);

      expect(result.version.versionNumber).toBe(3);
      expect(result.version.status).toBe(TemplateVersionStatus.PENDING_PREVIEW);
      expect(result.validation.canActivate).toBe(true);
      expect(storage.storeTemplateVersionDocx).toHaveBeenCalledWith(
        'school-alpha',
        'tpl-1',
        3,
        mockFile.buffer,
      );
    });

    it('marks version as REJECTED when placeholders or package fail validation', async () => {
      prisma.receiptTemplate.findUnique.mockResolvedValue({
        id: 'tpl-1',
        schoolId: 'school-alpha',
      });

      prisma.receiptTemplateVersion.findFirst.mockResolvedValue(null); // version 1

      validator.validateDocx.mockReturnValue({
        isValid: false,
        placeholdersDetected: ['unknown.field'],
        diagnostics: {
          errors: ['Unsupported placeholders detected: {unknown.field}'],
          warnings: [],
          hasRepeatingAllocations: false,
        },
      });

      storage.storeTemplateVersionDocx.mockResolvedValue({
        storagePath: 'receipt-templates/school-alpha/tpl-1/v1.docx',
        checksumSha256: 'sha-bad',
        fileSize: 500,
      });

      prisma.receiptTemplateVersion.create.mockResolvedValue({
        id: 'ver-1',
        templateId: 'tpl-1',
        versionNumber: 1,
        fileName: 'bad.docx',
        fileSize: 500,
        mimeType: 'application/octet-stream',
        checksumSha256: 'sha-bad',
        placeholdersDetected: ['unknown.field'],
        status: TemplateVersionStatus.REJECTED,
        uploadedByUserId: mockAdminUser.id,
        activatedByUserId: null,
        activatedAt: null,
        createdAt: new Date(),
      });

      const mockFile = {
        buffer: Buffer.from('bad docx'),
        originalname: 'bad.docx',
      } as Express.Multer.File;

      const result = await service.uploadVersion('school-alpha', mockAdminUser, 'tpl-1', mockFile);

      expect(result.version.status).toBe(TemplateVersionStatus.REJECTED);
      expect(result.validation.canActivate).toBe(false);
      expect(result.validation.isValid).toBe(false);
    });
  });

  describe('Synthetic Preview & Zero Financial Side-Effects', () => {
    it('generates a synthetic preview PDF without touching database payments or receipts', async () => {
      prisma.receiptTemplateVersion.findUnique.mockResolvedValue({
        id: 'ver-1',
        templateId: 'tpl-1',
        versionNumber: 1,
        storagePath: 'receipt-templates/school-alpha/tpl-1/v1.docx',
        school: {
          id: 'school-alpha',
          code: 'SCH_ALPHA',
          name: 'Alpha Academy',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
        },
      });

      storage.readTemplateDocx.mockResolvedValue(Buffer.from('sample docx'));
      pdfEngine.convertToPdf.mockResolvedValue(Buffer.from('%PDF-1.4 preview content'));

      const preview = await service.generateSyntheticPreview(
        'school-alpha',
        mockAdminUser,
        'tpl-1',
        'ver-1',
      );

      expect(preview.pdfBuffer.toString()).toContain('%PDF-1.4 preview content');
      expect(preview.fileName).toBe('preview_v1_sample.pdf');

      // Crucial: No financial writes were executed!
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.receiptTemplate.create).not.toHaveBeenCalled();
    });

    it('blocks preview generation if PDF engine is unavailable', async () => {
      prisma.receiptTemplateVersion.findUnique.mockResolvedValue({
        id: 'ver-1',
        templateId: 'tpl-1',
        school: { id: 'school-alpha' },
      });

      pdfEngine.isEngineAvailable.mockResolvedValue(false);

      await expect(
        service.generateSyntheticPreview('school-alpha', mockAdminUser, 'tpl-1', 'ver-1'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('Template Activation Pre-flight Gate', () => {
    it('blocks activation if the conversion engine is not operational', async () => {
      prisma.receiptTemplateVersion.findUnique.mockResolvedValue({
        id: 'ver-1',
        templateId: 'tpl-1',
        status: TemplateVersionStatus.VALIDATED,
      });

      // Engine is down
      pdfEngine.isEngineAvailable.mockResolvedValue(false);

      await expect(
        service.activateVersion('school-alpha', mockAdminUser, 'tpl-1', 'ver-1'),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('blocks activation if template version is in PENDING_PREVIEW without successful preview', async () => {
      prisma.receiptTemplateVersion.findUnique.mockResolvedValue({
        id: 'ver-1',
        templateId: 'tpl-1',
        status: TemplateVersionStatus.PENDING_PREVIEW,
      });

      pdfEngine.isEngineAvailable.mockResolvedValue(true);

      await expect(
        service.activateVersion('school-alpha', mockAdminUser, 'tpl-1', 'ver-1'),
      ).rejects.toThrow(/must be successfully previewed and validated before activation/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('blocks activation of a REJECTED template version', async () => {
      prisma.receiptTemplateVersion.findUnique.mockResolvedValue({
        id: 'ver-1',
        templateId: 'tpl-1',
        status: TemplateVersionStatus.REJECTED,
      });

      pdfEngine.isEngineAvailable.mockResolvedValue(true);

      await expect(
        service.activateVersion('school-alpha', mockAdminUser, 'tpl-1', 'ver-1'),
      ).rejects.toThrow(/Cannot activate a rejected template version/);
    });

    it('blocks activation if the template version belongs to another school or does not exist for the school', async () => {
      // Prisma lookup by composite key { schoolId, id } returns null for a foreign school version
      prisma.receiptTemplateVersion.findUnique.mockResolvedValue(null);

      await expect(
        service.activateVersion('school-alpha', mockAdminUser, 'tpl-1', 'ver-foreign-school'),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.receiptTemplateVersion.findUnique).toHaveBeenCalledWith({
        where: {
          schoolId_id: {
            schoolId: 'school-alpha',
            id: 'ver-foreign-school',
          },
        },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('atomically activates version, supersedes prior active version, updates template, and sets school default', async () => {
      prisma.receiptTemplateVersion.findUnique.mockResolvedValue({
        id: 'ver-2',
        templateId: 'tpl-1',
        versionNumber: 2,
        status: TemplateVersionStatus.VALIDATED,
      });

      prisma.receiptTemplate.findUnique.mockResolvedValue({
        id: 'tpl-1',
        schoolId: 'school-alpha',
        name: 'Official Template',
        status: ReceiptTemplateStatus.ACTIVE,
        activeVersionId: 'ver-2',
        versions: [],
      });

      pdfEngine.isEngineAvailable.mockResolvedValue(true);

      await service.activateVersion('school-alpha', mockAdminUser, 'tpl-1', 'ver-2');

      // Verified atomic transaction updates
      expect(prisma.receiptTemplateVersion.updateMany).toHaveBeenCalledWith({
        where: {
          schoolId: 'school-alpha',
          templateId: 'tpl-1',
          status: TemplateVersionStatus.ACTIVE,
        },
        data: { status: TemplateVersionStatus.SUPERSEDED },
      });

      expect(prisma.receiptTemplateVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ver-2' },
          data: expect.objectContaining({
            status: TemplateVersionStatus.ACTIVE,
            activatedByUserId: mockAdminUser.id,
          }),
        }),
      );

      expect(prisma.receiptTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
        data: {
          status: ReceiptTemplateStatus.ACTIVE,
          activeVersionId: 'ver-2',
        },
      });

      expect(prisma.school.update).toHaveBeenCalledWith({
        where: { id: 'school-alpha' },
        data: {
          defaultReceiptTemplateId: 'tpl-1',
        },
      });
    });
  });

  describe('Template Archival', () => {
    it('soft-archives template without deleting versions', async () => {
      prisma.receiptTemplate.findUnique.mockResolvedValue({
        id: 'tpl-1',
        schoolId: 'school-alpha',
        name: 'To Archive',
        status: ReceiptTemplateStatus.ACTIVE,
        versions: [],
      });

      await service.archiveTemplate('school-alpha', mockAdminUser, 'tpl-1');

      expect(prisma.receiptTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
        data: { status: ReceiptTemplateStatus.ARCHIVED },
      });
    });
  });
});
