import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { StudentAllocationsController } from './student-allocations.controller';
import { StudentAllocationsService } from './student-allocations.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../common/auth/roles.guard';
import { ROLES_KEY } from '../common/auth/roles.decorator';

describe('StudentAllocationsController (Role Protection & Endpoint Delegations)', () => {
  let controller: StudentAllocationsController;
  let mockService: any;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  const sampleSchoolId = '00000000-0000-0000-0000-000000000001';
  const sampleUserId = 'user-admin-1';

  beforeEach(async () => {
    mockService = {
      create: jest.fn().mockResolvedValue({ id: 'alloc-1' }),
      bulkCreate: jest.fn().mockResolvedValue({
        totalRequested: 2,
        allocatedCount: 2,
        skippedCount: 0,
        failedCount: 0,
        results: [],
      }),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'alloc-1' }),
      update: jest.fn().mockResolvedValue({ id: 'alloc-1' }),
      remove: jest.fn().mockResolvedValue({ id: 'alloc-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentAllocationsController],
      providers: [
        {
          provide: StudentAllocationsService,
          useValue: mockService,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        Reflector,
        RolesGuard,
      ],
    }).compile();

    controller = module.get<StudentAllocationsController>(StudentAllocationsController);
    rolesGuard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('Role Protection Metadata', () => {
    it('restricts POST bulkCreate to PLATFORM_SUPER_ADMIN and SCHOOL_ADMIN', () => {
      const requiredRoles = reflector.get<UserRole[]>(ROLES_KEY, controller.bulkCreate);
      expect(requiredRoles).toEqual([UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN]);
    });

    it('RolesGuard allows SCHOOL_ADMIN to call bulkCreate', () => {
      const mockExecutionContext: any = {
        getHandler: () => controller.bulkCreate,
        getClass: () => StudentAllocationsController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: sampleUserId, role: UserRole.SCHOOL_ADMIN },
          }),
        }),
      };
      expect(rolesGuard.canActivate(mockExecutionContext)).toBe(true);
    });

    it('RolesGuard rejects STUDENT from calling bulkCreate', () => {
      const mockExecutionContext: any = {
        getHandler: () => controller.bulkCreate,
        getClass: () => StudentAllocationsController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'student-id', role: UserRole.STUDENT },
          }),
        }),
      };
      expect(() => rolesGuard.canActivate(mockExecutionContext)).toThrow();
    });
  });

  describe('Endpoint Delegations', () => {
    it('bulkCreate delegates to studentAllocationsService.bulkCreate with schoolId and userId', async () => {
      const req = {
        school: { id: sampleSchoolId },
        user: { id: sampleUserId },
      };
      const dto: any = {
        academicYearId: 'ay-1',
        feeStructureId: 'struct-1',
        studentIds: ['st-1', 'st-2'],
      };

      const result = await controller.bulkCreate(req, dto);

      expect(mockService.bulkCreate).toHaveBeenCalledWith(sampleSchoolId, sampleUserId, dto);
      expect(result.allocatedCount).toBe(2);
    });
  });
});
