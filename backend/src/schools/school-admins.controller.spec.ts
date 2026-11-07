import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';

describe('SchoolsController — School Administrator Account Management Endpoints', () => {
  let controller: SchoolsController;
  let service: SchoolsService;

  const mockSchoolsService = {
    findAllAdmins: jest.fn(),
    findAdminProfile: jest.fn(),
    createAdminForSchool: jest.fn(),
    suspendAdmin: jest.fn(),
    activateAdmin: jest.fn(),
    initiatePasswordReset: jest.fn(),
  };

  const superAdminUser = { id: 'super-admin-1', role: UserRole.PLATFORM_SUPER_ADMIN };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchoolsController],
      providers: [
        {
          provide: SchoolsService,
          useValue: mockSchoolsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: (context: ExecutionContext) => true })
      .compile();

    controller = module.get<SchoolsController>(SchoolsController);
    service = module.get<SchoolsService>(SchoolsService);
  });

  it('delegates findAllAdmins with query parameters', async () => {
    mockSchoolsService.findAllAdmins.mockResolvedValue({ data: [], meta: { total: 0 } });
    const result = await controller.findAllAdmins({ page: 1, limit: 10, search: 'admin' });
    expect(service.findAllAdmins).toHaveBeenCalledWith({ page: 1, limit: 10, search: 'admin' });
    expect(result.meta.total).toBe(0);
  });

  it('delegates findAdminProfile by admin ID', async () => {
    mockSchoolsService.findAdminProfile.mockResolvedValue({ id: 'admin-1', name: 'Admin One' });
    const result = await controller.findAdminProfile('admin-1');
    expect(service.findAdminProfile).toHaveBeenCalledWith('admin-1');
    expect(result.id).toBe('admin-1');
  });

  it('delegates suspendAdmin with actor extraction', async () => {
    mockSchoolsService.suspendAdmin.mockResolvedValue({ message: 'Suspended' });
    const req = { user: superAdminUser };
    const result = await controller.suspendAdmin('admin-1', { reason: 'Violation' }, req);
    expect(service.suspendAdmin).toHaveBeenCalledWith('admin-1', { reason: 'Violation' }, 'super-admin-1');
    expect(result.message).toBe('Suspended');
  });

  it('delegates activateAdmin with actor extraction', async () => {
    mockSchoolsService.activateAdmin.mockResolvedValue({ message: 'Activated' });
    const req = { user: superAdminUser };
    const result = await controller.activateAdmin('admin-1', { reason: 'Restored' }, req);
    expect(service.activateAdmin).toHaveBeenCalledWith('admin-1', { reason: 'Restored' }, 'super-admin-1');
    expect(result.message).toBe('Activated');
  });

  it('delegates initiatePasswordReset with actor extraction', async () => {
    mockSchoolsService.initiatePasswordReset.mockResolvedValue({ success: true });
    const req = { user: superAdminUser };
    const result = await controller.initiatePasswordReset('admin-1', req);
    expect(service.initiatePasswordReset).toHaveBeenCalledWith('admin-1', 'super-admin-1');
    expect(result.success).toBe(true);
  });
});
