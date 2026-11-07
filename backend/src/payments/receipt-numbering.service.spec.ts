import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AcademicYearFormat, UserRole } from '@prisma/client';
import { ReceiptNumberingService } from './receipt-numbering.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';

describe('ReceiptNumberingService — School-Wise Configuration Engine', () => {
  let service: ReceiptNumberingService;
  let prisma: any;
  let tenantContext: any;

  const mockSchoolId = 'sch-greenwood-001';
  const mockSchoolAdmin = {
    id: 'user-admin-1',
    schoolId: mockSchoolId,
    role: UserRole.SCHOOL_ADMIN,
  };
  const mockSuperAdmin = {
    id: 'user-super-1',
    schoolId: null,
    role: UserRole.PLATFORM_SUPER_ADMIN,
  };

  beforeEach(async () => {
    prisma = {
      school: {
        findUnique: jest.fn().mockResolvedValue({ id: mockSchoolId, name: 'Greenwood High' }),
      },
      schoolReceiptNumberConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    tenantContext = {
      getSchoolId: jest.fn().mockReturnValue(mockSchoolId),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptNumberingService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContextService, useValue: tenantContext },
      ],
    }).compile();

    service = module.get<ReceiptNumberingService>(ReceiptNumberingService);
  });

  describe('Tenant Context Resolution & RBAC', () => {
    it('1. should allow school admin within their own school context', () => {
      const resolved = service.resolveSchoolContext(mockSchoolAdmin);
      expect(resolved).toBe(mockSchoolId);
    });

    it('2. should reject cross-tenant spoofing by school admin (403 Forbidden)', () => {
      expect(() =>
        service.resolveSchoolContext(mockSchoolAdmin, 'sch-other-999'),
      ).toThrow(ForbiddenException);
    });

    it('3. should allow platform super admin with explicit target school context', () => {
      const resolved = service.resolveSchoolContext(mockSuperAdmin, 'sch-target-002');
      expect(resolved).toBe('sch-target-002');
    });

    it('4. should reject platform super admin without explicit target school context if context is empty', () => {
      tenantContext.getSchoolId.mockReturnValue(null);
      expect(() => service.resolveSchoolContext(mockSuperAdmin)).toThrow(BadRequestException);
    });
  });

  describe('Configuration Retrieval & Rule 1 Error Safeguard', () => {
    it('5. should return configured settings when school record exists', async () => {
      prisma.schoolReceiptNumberConfig.findUnique.mockResolvedValue({
        id: 'cfg-1',
        schoolId: mockSchoolId,
        prefix: 'DPMS',
        yearFormat: AcademicYearFormat.FULL_8DIGIT,
        paddingDigits: 6,
        separator: '/',
        updatedAt: new Date('2026-10-27T10:00:00.000Z'),
      });

      const result = await service.getConfig(mockSchoolAdmin);

      expect(result.prefix).toBe('DPMS');
      expect(result.yearFormat).toBe(AcademicYearFormat.FULL_8DIGIT);
      expect(result.paddingDigits).toBe(6);
      expect(result.separator).toBe('/');
      expect(result.isCustomized).toBe(true);
      expect(result.previewSample).toBe('DPMS/20262027/000001');
    });

    it('6. should return standard defaults when table exists but school has no row (isCustomized: false)', async () => {
      prisma.schoolReceiptNumberConfig.findUnique.mockResolvedValue(null);

      const result = await service.getConfig(mockSchoolAdmin);

      expect(result.prefix).toBe('RCT');
      expect(result.yearFormat).toBe(AcademicYearFormat.SHORT_6DIGIT);
      expect(result.paddingDigits).toBe(5);
      expect(result.separator).toBe('-');
      expect(result.isCustomized).toBe(false);
      expect(result.previewSample).toBe('RCT-202627-00001');
    });

    it('7. Rule 1 Safeguard: should NOT silently fall back to default when query throws unexpected DB error', async () => {
      prisma.schoolReceiptNumberConfig.findUnique.mockRejectedValue(
        new Error('PostgreSQL connection terminated unexpectedly or table missing'),
      );

      await expect(service.getConfig(mockSchoolAdmin)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('8. should throw 404 when target school does not exist', async () => {
      prisma.school.findUnique.mockResolvedValue(null);

      await expect(service.getConfig(mockSchoolAdmin)).rejects.toThrow(NotFoundException);
    });
  });

  describe('Configuration Updating', () => {
    it('9. should uppercase and trim prefix and persist configuration', async () => {
      prisma.schoolReceiptNumberConfig.upsert.mockResolvedValue({
        id: 'cfg-new',
        schoolId: mockSchoolId,
        prefix: 'ABC',
        yearFormat: AcademicYearFormat.START_YEAR_4DIGIT,
        paddingDigits: 4,
        separator: '-',
        updatedAt: new Date(),
      });

      const result = await service.updateConfig(mockSchoolAdmin, {
        prefix: ' abc ',
        yearFormat: AcademicYearFormat.START_YEAR_4DIGIT,
        paddingDigits: 4,
        separator: '-',
      });

      expect(prisma.schoolReceiptNumberConfig.upsert).toHaveBeenCalledWith({
        where: { schoolId: mockSchoolId },
        create: {
          schoolId: mockSchoolId,
          prefix: 'ABC',
          yearFormat: AcademicYearFormat.START_YEAR_4DIGIT,
          paddingDigits: 4,
          separator: '-',
        },
        update: {
          prefix: 'ABC',
          yearFormat: AcademicYearFormat.START_YEAR_4DIGIT,
          paddingDigits: 4,
          separator: '-',
        },
      });

      expect(result.prefix).toBe('ABC');
      expect(result.previewSample).toBe('ABC-2026-0001');
    });

    it('10. should fail safely with 500 when database update fails', async () => {
      prisma.schoolReceiptNumberConfig.upsert.mockRejectedValue(
        new Error('Unique constraint violation or foreign key error'),
      );

      await expect(
        service.updateConfig(mockSchoolAdmin, {
          prefix: 'XYZ',
          yearFormat: AcademicYearFormat.SHORT_6DIGIT,
          paddingDigits: 5,
          separator: '-',
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('Format Matrix & Interactive Preview', () => {
    it('11. should format SHORT_6DIGIT with hyphen: "DPMS-202627-00001"', () => {
      const { preview } = service.generatePreview({
        prefix: 'DPMS',
        yearFormat: AcademicYearFormat.SHORT_6DIGIT,
        paddingDigits: 5,
        separator: '-',
      });
      expect(preview).toBe('DPMS-202627-00001');
    });

    it('12. should format FULL_8DIGIT with slash: "ABC/20262027/000001"', () => {
      const { preview } = service.generatePreview({
        prefix: 'ABC',
        yearFormat: AcademicYearFormat.FULL_8DIGIT,
        paddingDigits: 6,
        separator: '/',
      });
      expect(preview).toBe('ABC/20262027/000001');
    });

    it('13. should format START_YEAR_4DIGIT with hyphen: "SCH-2026-0001"', () => {
      const { preview } = service.generatePreview({
        prefix: 'SCH',
        yearFormat: AcademicYearFormat.START_YEAR_4DIGIT,
        paddingDigits: 4,
        separator: '-',
      });
      expect(preview).toBe('SCH-2026-0001');
    });

    it('14. should format NONE format without year token: "FEE-00001"', () => {
      const { preview } = service.generatePreview({
        prefix: 'FEE',
        yearFormat: AcademicYearFormat.NONE,
        paddingDigits: 5,
        separator: '-',
      });
      expect(preview).toBe('FEE-00001');
    });

    it('15. should format empty separator cleanly: "RCT20262700001"', () => {
      const { preview } = service.generatePreview({
        prefix: 'RCT',
        yearFormat: AcademicYearFormat.SHORT_6DIGIT,
        paddingDigits: 5,
        separator: '',
      });
      expect(preview).toBe('RCT20262700001');
    });
  });
});
