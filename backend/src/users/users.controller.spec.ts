import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UserRole, UserStatus } from '@prisma/client';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RolesGuard } from '../common/auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersController (FEE-P2B)', () => {
  let controller: UsersController;
  let mockUsersService: any;
  let rolesGuard: RolesGuard;

  const schoolId = '00000000-0000-0000-0000-000000000001';
  const mockUser = {
    id: 'admin-user-id',
    role: UserRole.SCHOOL_ADMIN,
    schoolId,
  };

  const mockRequest = {
    school: { id: schoolId },
    user: mockUser,
  };

  beforeEach(async () => {
    mockUsersService = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'user-1' }),
      createStaff: jest.fn().mockResolvedValue({ id: 'staff-1', role: UserRole.FEE_STAFF }),
      updateUser: jest.fn().mockResolvedValue({ id: 'user-1', name: 'Updated' }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'user-1', status: UserStatus.INACTIVE }),
      getUnlinkedStudents: jest.fn().mockResolvedValue([]),
      provisionStudentAccount: jest.fn().mockResolvedValue({ message: 'Success' }),
      createParent: jest.fn().mockResolvedValue({ id: 'parent-1' }),
      listParents: jest.fn().mockResolvedValue([]),
      linkParentStudent: jest.fn().mockResolvedValue({ id: 'rel-1' }),
      unlinkParentStudent: jest.fn().mockResolvedValue({ message: 'Success' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: PrismaService,
          useValue: {
            school: { findUnique: jest.fn() },
          },
        },
        Reflector,
        RolesGuard,
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    rolesGuard = module.get<RolesGuard>(RolesGuard);
  });

  describe('Endpoint Delegations & Tenant Scope', () => {
    it('findAll passes server-validated schoolId to service', async () => {
      await controller.findAll(mockRequest, {});
      expect(mockUsersService.findAll).toHaveBeenCalledWith(schoolId, {});
    });

    it('createStaff passes schoolId and dto to service', async () => {
      const dto = {
        name: 'Accountant',
        email: 'acc@school.edu',
        password: 'Password123!',
      };
      await controller.createStaff(mockRequest, dto);
      expect(mockUsersService.createStaff).toHaveBeenCalledWith(schoolId, dto);
    });

    it('provisionStudentAccount passes schoolId, studentId, and dto', async () => {
      const dto = { email: 'student@school.edu', password: 'Password123!' };
      await controller.provisionStudentAccount(mockRequest, 'student-uuid', dto);
      expect(mockUsersService.provisionStudentAccount).toHaveBeenCalledWith(
        schoolId,
        'student-uuid',
        dto,
      );
    });

    it('createParent passes schoolId and dto', async () => {
      const dto = { name: 'Parent', email: 'parent@school.edu', password: 'Password123!' };
      await controller.createParent(mockRequest, dto);
      expect(mockUsersService.createParent).toHaveBeenCalledWith(schoolId, dto);
    });

    it('updateStatus passes caller userId to enforce self-deactivation protection', async () => {
      const dto = { status: UserStatus.INACTIVE };
      await controller.updateStatus(mockRequest, 'target-user-id', dto);
      expect(mockUsersService.updateStatus).toHaveBeenCalledWith(
        schoolId,
        'target-user-id',
        'admin-user-id',
        dto,
      );
    });
  });

  describe('Role-based Access Enforcement via RolesGuard', () => {
    it('allows SCHOOL_ADMIN to access createStaff', () => {
      const context: any = {
        getHandler: () => controller.createStaff,
        getClass: () => UsersController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: UserRole.SCHOOL_ADMIN } }),
        }),
      };
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('denies FEE_STAFF from accessing createStaff', () => {
      const context: any = {
        getHandler: () => controller.createStaff,
        getClass: () => UsersController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: UserRole.FEE_STAFF } }),
        }),
      };
      expect(() => rolesGuard.canActivate(context)).toThrow(/Access denied/);
    });

    it('denies STUDENT from accessing user management', () => {
      const context: any = {
        getHandler: () => controller.findAll,
        getClass: () => UsersController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: UserRole.STUDENT } }),
        }),
      };
      expect(() => rolesGuard.canActivate(context)).toThrow(/Access denied/);
    });

    it('denies PARENT from accessing user management', () => {
      const context: any = {
        getHandler: () => controller.findAll,
        getClass: () => UsersController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: UserRole.PARENT } }),
        }),
      };
      expect(() => rolesGuard.canActivate(context)).toThrow(/Access denied/);
    });
  });
});
