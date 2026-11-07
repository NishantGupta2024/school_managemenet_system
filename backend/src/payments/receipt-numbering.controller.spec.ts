import { Test, TestingModule } from '@nestjs/testing';
import { UserRole, AcademicYearFormat } from '@prisma/client';
import { ReceiptNumberingController } from './receipt-numbering.controller';
import { ReceiptNumberingService } from './receipt-numbering.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';

describe('ReceiptNumberingController', () => {
  let controller: ReceiptNumberingController;
  let service: any;

  const mockAdminUser = {
    id: 'user-admin-1',
    schoolId: 'sch-1',
    role: UserRole.SCHOOL_ADMIN,
  };

  beforeEach(async () => {
    service = {
      getConfig: jest.fn().mockResolvedValue({
        schoolId: 'sch-1',
        prefix: 'RCT',
        yearFormat: AcademicYearFormat.SHORT_6DIGIT,
        paddingDigits: 5,
        separator: '-',
        previewSample: 'RCT-202627-00001',
        isCustomized: false,
      }),
      updateConfig: jest.fn().mockResolvedValue({
        schoolId: 'sch-1',
        prefix: 'DPMS',
        yearFormat: AcademicYearFormat.SHORT_6DIGIT,
        paddingDigits: 5,
        separator: '-',
        previewSample: 'DPMS-202627-00001',
        isCustomized: true,
      }),
      generatePreview: jest.fn().mockReturnValue({
        preview: 'DPMS-202627-00001',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReceiptNumberingController],
      providers: [{ provide: ReceiptNumberingService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReceiptNumberingController>(ReceiptNumberingController);
  });

  it('1. should call service.getConfig with request user', async () => {
    const req = { user: mockAdminUser };
    const result = await controller.getConfig(req);

    expect(service.getConfig).toHaveBeenCalledWith(mockAdminUser, undefined);
    expect(result.prefix).toBe('RCT');
  });

  it('2. should call service.updateConfig with request user and DTO', async () => {
    const req = { user: mockAdminUser };
    const dto = {
      prefix: 'DPMS',
      yearFormat: AcademicYearFormat.SHORT_6DIGIT,
      paddingDigits: 5,
      separator: '-',
    };
    const result = await controller.updateConfig(req, dto);

    expect(service.updateConfig).toHaveBeenCalledWith(mockAdminUser, dto, undefined);
    expect(result.prefix).toBe('DPMS');
    expect(result.isCustomized).toBe(true);
  });

  it('3. should call service.generatePreview without modifying database state', () => {
    const dto = {
      prefix: 'DPMS',
      yearFormat: AcademicYearFormat.SHORT_6DIGIT,
      paddingDigits: 5,
      separator: '-',
    };
    const result = controller.generatePreview(dto);

    expect(service.generatePreview).toHaveBeenCalledWith(dto);
    expect(result.preview).toBe('DPMS-202627-00001');
  });
});
