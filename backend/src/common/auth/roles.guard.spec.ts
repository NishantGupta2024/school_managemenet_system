import 'reflect-metadata';
import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';
import { TenantGuard } from '../tenant/tenant.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsController } from '../../payments/payments.controller';
import { SchoolsController } from '../../schools/schools.controller';
import { ExaminationAssessmentsController } from '../../examination/controllers/examination-assessments.controller';
import { StudentsController } from '../../students/students.controller';

describe('RolesGuard & Authorization Hardening (SEC-06)', () => {
  let rolesGuard: RolesGuard;
  let reflector: Reflector;
  let tenantGuard: TenantGuard;
  let mockPrisma: { school: { findUnique: jest.Mock } };

  const schoolA = {
    id: '00000000-0000-0000-0000-000000000001',
    code: 'SCH-A',
    name: 'Springfield Academy',
    status: 'ACTIVE',
  };
  const schoolBId = '00000000-0000-0000-0000-000000000002';

  const createMockContext = (
    req: any,
    handler: Function = jest.fn(),
    controllerClass: any = class DummyController {},
  ): ExecutionContext => ({
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: jest.fn(),
      getNext: jest.fn(),
    }),
    getHandler: () => handler,
    getClass: () => controllerClass,
    getArgs: jest.fn(),
    getArgByIndex: jest.fn(),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
    getType: jest.fn().mockReturnValue('http'),
  });

  beforeEach(() => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
    mockPrisma = {
      school: {
        findUnique: jest.fn().mockResolvedValue(schoolA),
      },
    };
    tenantGuard = new TenantGuard(mockPrisma as unknown as PrismaService);
  });

  it('1. Rejects unauthenticated request (missing user or missing role) with ForbiddenException', () => {
    const ctxNoUser = createMockContext({});
    expect(() => rolesGuard.canActivate(ctxNoUser)).toThrow(ForbiddenException);
    expect(() => rolesGuard.canActivate(ctxNoUser)).toThrow(
      /Authentication required for this resource/,
    );

    const ctxNoRole = createMockContext({ user: { id: 'u-1' } });
    expect(() => rolesGuard.canActivate(ctxNoRole)).toThrow(ForbiddenException);
  });

  it('2. Allows PLATFORM_SUPER_ADMIN on Platform Super Admin endpoints (SchoolsController)', () => {
    const ctx = createMockContext(
      { user: { id: 'sa-1', role: UserRole.PLATFORM_SUPER_ADMIN } },
      SchoolsController.prototype.findAll,
      SchoolsController,
    );

    expect(rolesGuard.canActivate(ctx)).toBe(true);
  });

  it('3. Rejects PLATFORM_SUPER_ADMIN on endpoints where PLATFORM_SUPER_ADMIN is NOT in @Roles (SEC-06 bypass eliminated)', () => {
    // ExaminationAssessmentsController.createDraft is restricted strictly to @Roles(UserRole.TEACHER)
    const ctxTeacherOnly = createMockContext(
      { user: { id: 'sa-1', role: UserRole.PLATFORM_SUPER_ADMIN } },
      ExaminationAssessmentsController.prototype.createDraft,
      ExaminationAssessmentsController,
    );

    expect(() => rolesGuard.canActivate(ctxTeacherOnly)).toThrow(
      ForbiddenException,
    );
    expect(() => rolesGuard.canActivate(ctxTeacherOnly)).toThrow(
      /Access denied: Requires one of \[TEACHER\] role/,
    );

    // StudentsController.getMyFeeStatement is restricted strictly to @Roles(UserRole.STUDENT, UserRole.PARENT)
    const ctxStudentParentOnly = createMockContext(
      { user: { id: 'sa-1', role: UserRole.PLATFORM_SUPER_ADMIN } },
      StudentsController.prototype.getMyFeeStatement,
      StudentsController,
    );

    expect(() => rolesGuard.canActivate(ctxStudentParentOnly)).toThrow(
      ForbiddenException,
    );
    expect(() => rolesGuard.canActivate(ctxStudentParentOnly)).toThrow(
      /Access denied: Requires one of \[STUDENT, PARENT\] role/,
    );
  });

  it('4. Allows SCHOOL_ADMIN on School Admin endpoints and rejects SCHOOL_ADMIN on Platform Super Admin endpoints', () => {
    const ctxAllowed = createMockContext(
      {
        user: {
          id: 'admin-1',
          role: UserRole.SCHOOL_ADMIN,
          schoolId: schoolA.id,
        },
      },
      PaymentsController.prototype.reversePayment,
      PaymentsController,
    );
    expect(rolesGuard.canActivate(ctxAllowed)).toBe(true);

    const ctxDeniedPlatform = createMockContext(
      {
        user: {
          id: 'admin-1',
          role: UserRole.SCHOOL_ADMIN,
          schoolId: schoolA.id,
        },
      },
      SchoolsController.prototype.create,
      SchoolsController,
    );
    expect(() => rolesGuard.canActivate(ctxDeniedPlatform)).toThrow(
      ForbiddenException,
    );
  });

  it('5. Enforces FEE_STAFF financial boundaries: allowed on collectPayment, denied on reversePayment and createRefund', () => {
    const feeStaffUser = {
      id: 'staff-1',
      role: UserRole.FEE_STAFF,
      schoolId: schoolA.id,
    };

    const ctxCollect = createMockContext(
      { user: feeStaffUser },
      PaymentsController.prototype.collectPayment,
      PaymentsController,
    );
    expect(rolesGuard.canActivate(ctxCollect)).toBe(true);

    const ctxReverse = createMockContext(
      { user: feeStaffUser },
      PaymentsController.prototype.reversePayment,
      PaymentsController,
    );
    expect(() => rolesGuard.canActivate(ctxReverse)).toThrow(ForbiddenException);
    expect(() => rolesGuard.canActivate(ctxReverse)).toThrow(
      /Access denied: Requires one of \[PLATFORM_SUPER_ADMIN, SCHOOL_ADMIN\] role/,
    );

    const ctxRefund = createMockContext(
      { user: feeStaffUser },
      PaymentsController.prototype.createRefund,
      PaymentsController,
    );
    expect(() => rolesGuard.canActivate(ctxRefund)).toThrow(ForbiddenException);
  });

  it('6. Enforces TEACHER, STUDENT, and PARENT boundaries and blocks unauthorized roles on financial mutation endpoints', () => {
    const teacherUser = {
      id: 'teacher-1',
      role: UserRole.TEACHER,
      schoolId: schoolA.id,
    };
    const studentUser = {
      id: 'student-1',
      role: UserRole.STUDENT,
      schoolId: schoolA.id,
    };
    const parentUser = {
      id: 'parent-1',
      role: UserRole.PARENT,
      schoolId: schoolA.id,
    };

    // TEACHER allowed on createDraft
    expect(
      rolesGuard.canActivate(
        createMockContext(
          { user: teacherUser },
          ExaminationAssessmentsController.prototype.createDraft,
          ExaminationAssessmentsController,
        ),
      ),
    ).toBe(true);

    // TEACHER, STUDENT, PARENT denied on collectPayment, reversePayment, createRefund
    for (const unprivileged of [teacherUser, studentUser, parentUser]) {
      expect(() =>
        rolesGuard.canActivate(
          createMockContext(
            { user: unprivileged },
            PaymentsController.prototype.collectPayment,
            PaymentsController,
          ),
        ),
      ).toThrow(ForbiddenException);

      expect(() =>
        rolesGuard.canActivate(
          createMockContext(
            { user: unprivileged },
            PaymentsController.prototype.reversePayment,
            PaymentsController,
          ),
        ),
      ).toThrow(ForbiddenException);

      expect(() =>
        rolesGuard.canActivate(
          createMockContext(
            { user: unprivileged },
            PaymentsController.prototype.createRefund,
            PaymentsController,
          ),
        ),
      ).toThrow(ForbiddenException);
    }

    // STUDENT and PARENT allowed on getMyFeeStatement
    expect(
      rolesGuard.canActivate(
        createMockContext(
          { user: studentUser },
          StudentsController.prototype.getMyFeeStatement,
          StudentsController,
        ),
      ),
    ).toBe(true);
    expect(
      rolesGuard.canActivate(
        createMockContext(
          { user: parentUser },
          StudentsController.prototype.getMyFeeStatement,
          StudentsController,
        ),
      ),
    ).toBe(true);
  });

  it('7. Preserves tenant isolation: cross-tenant access and missing Super Admin tenant header are rejected by TenantGuard', async () => {
    // School Admin from School A attempting to access School B
    const crossTenantCtx = createMockContext(
      {
        user: {
          id: 'admin-1',
          role: UserRole.SCHOOL_ADMIN,
          schoolId: schoolA.id,
        },
        headers: { 'x-school-id': schoolBId },
      },
      PaymentsController.prototype.collectPayment,
      PaymentsController,
    );
    await expect(tenantGuard.canActivate(crossTenantCtx)).rejects.toThrow(
      ForbiddenException,
    );

    // Platform Super Admin calling tenant-scoped endpoint without x-school-id header
    const superAdminMissingTenantCtx = createMockContext(
      {
        user: { id: 'sa-1', role: UserRole.PLATFORM_SUPER_ADMIN },
        headers: {},
      },
      PaymentsController.prototype.collectPayment,
      PaymentsController,
    );
    await expect(
      tenantGuard.canActivate(superAdminMissingTenantCtx),
    ).rejects.toThrow(BadRequestException);
  });
});
