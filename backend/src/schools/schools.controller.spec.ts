import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';
import { RolesGuard } from '../common/auth/roles.guard';
import { ROLES_KEY } from '../common/auth/roles.decorator';

describe('SchoolsController (FEE-P2A)', () => {
  let controller: SchoolsController;
  let mockSchoolsService: any;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  const sampleSchoolId = '00000000-0000-0000-0000-000000000001';

  beforeEach(async () => {
    mockSchoolsService = {
      create: jest.fn().mockResolvedValue({ id: sampleSchoolId, code: 'SCH001', name: 'Greenwood' }),
      findAll: jest.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } }),
      findOne: jest.fn().mockResolvedValue({ id: sampleSchoolId, name: 'Greenwood' }),
      update: jest.fn().mockResolvedValue({ id: sampleSchoolId, name: 'Greenwood Updated' }),
      updateStatus: jest.fn().mockResolvedValue({ id: sampleSchoolId, status: 'SUSPENDED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchoolsController],
      providers: [
        {
          provide: SchoolsService,
          useValue: mockSchoolsService,
        },
        Reflector,
        RolesGuard,
      ],
    }).compile();

    controller = module.get<SchoolsController>(SchoolsController);
    rolesGuard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('Authorization Metadata & Role Protection', () => {
    it('restricts entire SchoolsController class to PLATFORM_SUPER_ADMIN role', () => {
      const requiredRoles = reflector.get<UserRole[]>(ROLES_KEY, SchoolsController);
      expect(requiredRoles).toEqual([UserRole.PLATFORM_SUPER_ADMIN]);
    });

    it('RolesGuard allows PLATFORM_SUPER_ADMIN to access endpoints', () => {
      const mockExecutionContext: any = {
        getHandler: () => controller.findAll,
        getClass: () => SchoolsController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'super-admin-id', role: UserRole.PLATFORM_SUPER_ADMIN },
          }),
        }),
      };

      expect(rolesGuard.canActivate(mockExecutionContext)).toBe(true);
    });

    it('RolesGuard strictly rejects SCHOOL_ADMIN (403 Forbidden)', () => {
      const mockExecutionContext: any = {
        getHandler: () => controller.create,
        getClass: () => SchoolsController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'school-admin-id', role: UserRole.SCHOOL_ADMIN, schoolId: sampleSchoolId },
          }),
        }),
      };

      expect(() => rolesGuard.canActivate(mockExecutionContext)).toThrow(
        /Access denied: Requires one of \[PLATFORM_SUPER_ADMIN\] role/,
      );
    });

    it('RolesGuard strictly rejects FEE_STAFF (403 Forbidden)', () => {
      const mockExecutionContext: any = {
        getHandler: () => controller.findAll,
        getClass: () => SchoolsController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'fee-staff-id', role: UserRole.FEE_STAFF, schoolId: sampleSchoolId },
          }),
        }),
      };

      expect(() => rolesGuard.canActivate(mockExecutionContext)).toThrow(
        /Access denied: Requires one of \[PLATFORM_SUPER_ADMIN\] role/,
      );
    });

    it('RolesGuard strictly rejects STUDENT (403 Forbidden)', () => {
      const mockExecutionContext: any = {
        getHandler: () => controller.findOne,
        getClass: () => SchoolsController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'student-id', role: UserRole.STUDENT, schoolId: sampleSchoolId },
          }),
        }),
      };

      expect(() => rolesGuard.canActivate(mockExecutionContext)).toThrow(
        /Access denied: Requires one of \[PLATFORM_SUPER_ADMIN\] role/,
      );
    });

    it('RolesGuard strictly rejects PARENT (403 Forbidden)', () => {
      const mockExecutionContext: any = {
        getHandler: () => controller.updateStatus,
        getClass: () => SchoolsController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'parent-id', role: UserRole.PARENT, schoolId: sampleSchoolId },
          }),
        }),
      };

      expect(() => rolesGuard.canActivate(mockExecutionContext)).toThrow(
        /Access denied: Requires one of \[PLATFORM_SUPER_ADMIN\] role/,
      );
    });
  });

  describe('Controller Endpoint Delegations', () => {
    it('create calls schoolsService.create', async () => {
      const dto: any = { code: 'SCH001', name: 'Greenwood' };
      const res = await controller.create(dto);
      expect(mockSchoolsService.create).toHaveBeenCalledWith(dto);
      expect(res.code).toBe('SCH001');
    });

    it('findAll calls schoolsService.findAll', async () => {
      const query: any = { page: 1, limit: 10 };
      await controller.findAll(query);
      expect(mockSchoolsService.findAll).toHaveBeenCalledWith(query);
    });

    it('findOne calls schoolsService.findOne', async () => {
      await controller.findOne(sampleSchoolId);
      expect(mockSchoolsService.findOne).toHaveBeenCalledWith(sampleSchoolId);
    });

    it('update calls schoolsService.update', async () => {
      const dto: any = { name: 'Greenwood Updated' };
      await controller.update(sampleSchoolId, dto);
      expect(mockSchoolsService.update).toHaveBeenCalledWith(sampleSchoolId, dto);
    });

    it('updateStatus calls schoolsService.updateStatus', async () => {
      const dto: any = { status: 'SUSPENDED' };
      await controller.updateStatus(sampleSchoolId, dto);
      expect(mockSchoolsService.updateStatus).toHaveBeenCalledWith(sampleSchoolId, dto);
    });

    it('provisionAdmin calls schoolsService.provisionInitialAdmin', async () => {
      mockSchoolsService.provisionInitialAdmin = jest
        .fn()
        .mockResolvedValue({ message: 'Success', user: { id: 'admin-id' } });
      const dto: any = {
        name: 'Principal',
        email: 'admin@school.com',
        password: 'Password123!',
      };
      const res = await controller.provisionAdmin(sampleSchoolId, dto);
      expect(mockSchoolsService.provisionInitialAdmin).toHaveBeenCalledWith(sampleSchoolId, dto);
      expect(res.user.id).toBe('admin-id');
    });
  });
});
