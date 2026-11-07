import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from '../notifications.controller';
import { NotificationsAdminService } from '../notifications-admin.service';
import { ExecutionContext, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Reflector } from '@nestjs/core';

describe('NotificationsController & Security Integration', () => {
  let controller: NotificationsController;
  let service: jest.Mocked<NotificationsAdminService>;
  let tenantGuard: TenantGuard;
  let rolesGuard: RolesGuard;
  let prismaMock: { school: { findUnique: jest.Mock } };

  const validSchoolId = '00000000-0000-0000-0000-000000000001';
  const otherSchoolId = '00000000-0000-0000-0000-000000000002';
  const activeSchool = {
    id: validSchoolId,
    code: 'SCH-A',
    name: 'Greenwood High',
    status: 'ACTIVE',
  };

  const createMockContext = (req: any): ExecutionContext => ({
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: jest.fn(),
      getNext: jest.fn(),
    }),
    getClass: (() => NotificationsController) as any,
    getHandler: (() => jest.fn()) as any,
    getArgs: jest.fn(),
    getArgByIndex: jest.fn(),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
    getType: jest.fn().mockReturnValue('http'),
  });

  beforeEach(async () => {
    service = {
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
      findLogs: jest.fn(),
      findLogById: jest.fn(),
    } as any;

    prismaMock = {
      school: {
        findUnique: jest.fn().mockResolvedValue(activeSchool),
      },
    };

    tenantGuard = new TenantGuard(prismaMock as unknown as PrismaService);
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.SCHOOL_ADMIN, UserRole.PLATFORM_SUPER_ADMIN]);
    rolesGuard = new RolesGuard(reflector);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsAdminService,
          useValue: service,
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        TenantGuard,
        RolesGuard,
        JwtAuthGuard,
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  describe('Tenant & Roles Guard Security Layer', () => {
    it('1. should reject unauthenticated request without valid user', async () => {
      const context = createMockContext({ headers: {} });
      await expect(tenantGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('2. Super Admin without selected school context throws BadRequestException', async () => {
      const context = createMockContext({
        user: { id: 'admin-1', role: UserRole.PLATFORM_SUPER_ADMIN },
        headers: {},
      });
      await expect(tenantGuard.canActivate(context)).rejects.toThrow(BadRequestException);
      await expect(tenantGuard.canActivate(context)).rejects.toThrow(/Tenant specification required/);
      expect(prismaMock.school.findUnique).not.toHaveBeenCalled();
    });

    it('3. Super Admin with valid authorized school context attaches school to req.school and passes', async () => {
      const req: any = {
        user: { id: 'admin-1', role: UserRole.PLATFORM_SUPER_ADMIN },
        headers: { 'x-school-id': validSchoolId },
      };
      const context = createMockContext(req);

      const tenantAllowed = await tenantGuard.canActivate(context);
      const roleAllowed = rolesGuard.canActivate(context);

      expect(tenantAllowed).toBe(true);
      expect(roleAllowed).toBe(true);
      expect(req.school).toEqual(activeSchool);
      expect(prismaMock.school.findUnique).toHaveBeenCalledWith({
        where: { id: validSchoolId },
        select: expect.any(Object),
      });
    });

    it('4. Super Admin with non-existent school ID throws ForbiddenException', async () => {
      prismaMock.school.findUnique.mockResolvedValue(null);
      const req: any = {
        user: { id: 'admin-1', role: UserRole.PLATFORM_SUPER_ADMIN },
        headers: { 'x-school-id': otherSchoolId },
      };
      const context = createMockContext(req);

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(tenantGuard.canActivate(context)).rejects.toThrow(/Target school tenant does not exist/);
    });

    it('5. Super Admin targeting inactive / suspended school throws ForbiddenException', async () => {
      prismaMock.school.findUnique.mockResolvedValue({
        ...activeSchool,
        status: 'SUSPENDED',
      });
      const req: any = {
        user: { id: 'admin-1', role: UserRole.PLATFORM_SUPER_ADMIN },
        headers: { 'x-school-id': validSchoolId },
      };
      const context = createMockContext(req);

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(tenantGuard.canActivate(context)).rejects.toThrow(/School tenant is currently SUSPENDED/);
    });

    it('6. Super Admin with malformed tenant ID throws BadRequestException', async () => {
      const req: any = {
        user: { id: 'admin-1', role: UserRole.PLATFORM_SUPER_ADMIN },
        headers: { 'x-school-id': 'malformed-not-uuid' },
      };
      const context = createMockContext(req);

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(BadRequestException);
      await expect(tenantGuard.canActivate(context)).rejects.toThrow(/Malformed tenant ID/);
    });

    it('7. School Admin normal access succeeds using authenticated user.schoolId', async () => {
      const req: any = {
        user: { id: 'admin-user', role: UserRole.SCHOOL_ADMIN, schoolId: validSchoolId },
        headers: {},
      };
      const context = createMockContext(req);

      const tenantAllowed = await tenantGuard.canActivate(context);
      const roleAllowed = rolesGuard.canActivate(context);

      expect(tenantAllowed).toBe(true);
      expect(roleAllowed).toBe(true);
      expect(req.school).toEqual(activeSchool);
    });

    it('8. School Admin attempting cross-tenant access via header manipulation is rejected', async () => {
      const req: any = {
        user: { id: 'admin-user', role: UserRole.SCHOOL_ADMIN, schoolId: validSchoolId },
        headers: { 'x-school-id': otherSchoolId }, // Mismatched school
      };
      const context = createMockContext(req);

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(tenantGuard.canActivate(context)).rejects.toThrow(/Cross-tenant access forbidden/);
    });

    it('9. School Admin missing schoolId association is rejected', async () => {
      const req: any = {
        user: { id: 'orphan-admin', role: UserRole.SCHOOL_ADMIN, schoolId: null },
        headers: {},
      };
      const context = createMockContext(req);

      await expect(tenantGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(tenantGuard.canActivate(context)).rejects.toThrow(/User is not associated with any active school/);
    });

    it('10. Header manipulation with unprivileged roles is rejected by RolesGuard', () => {
      const unprivilegedRoles = [
        UserRole.STUDENT,
        UserRole.PARENT,
        UserRole.TEACHER,
        UserRole.FEE_STAFF,
      ];

      for (const role of unprivilegedRoles) {
        const req: any = {
          user: { id: 'user-id', role, schoolId: validSchoolId },
          headers: { 'x-school-id': validSchoolId },
        };
        const context = createMockContext(req);

        expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
      }
    });
  });

  describe('Controller Endpoints Scoping', () => {
    it('getSettings delegates to service with validated req.school.id', async () => {
      const req = { school: { id: validSchoolId } };
      service.getSettings.mockResolvedValue({ schoolId: validSchoolId } as any);

      const result = await controller.getSettings(req);

      expect(service.getSettings).toHaveBeenCalledWith(validSchoolId);
      expect(result).toEqual({ schoolId: validSchoolId });
    });

    it('updateSettings delegates to service with validated req.school.id and DTO', async () => {
      const req = { school: { id: validSchoolId } };
      const dto = { receiptEmailEnabled: false };
      service.updateSettings.mockResolvedValue({ schoolId: validSchoolId, ...dto } as any);

      const result = await controller.updateSettings(req, dto);

      expect(service.updateSettings).toHaveBeenCalledWith(validSchoolId, dto);
      expect(result).toEqual({ schoolId: validSchoolId, receiptEmailEnabled: false });
    });

    it('getLogs delegates to service with validated req.school.id and query', async () => {
      const req = { school: { id: validSchoolId } };
      const query = { page: 2, limit: 15 };
      service.findLogs.mockResolvedValue({ data: [], meta: { total: 0, page: 2, limit: 15, totalPages: 0 } });

      const result = await controller.getLogs(req, query);

      expect(service.findLogs).toHaveBeenCalledWith(validSchoolId, query);
      expect(result.meta.page).toBe(2);
    });

    it('getLogById delegates to service with validated req.school.id and log id', async () => {
      const req = { school: { id: validSchoolId } };
      const logId = 'log-uuid-123';
      service.findLogById.mockResolvedValue({ id: logId, schoolId: validSchoolId } as any);

      const result = await controller.getLogById(req, logId);

      expect(service.findLogById).toHaveBeenCalledWith(validSchoolId, logId);
      expect(result.id).toBe(logId);
    });
  });
});
