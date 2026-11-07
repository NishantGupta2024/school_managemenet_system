import { ExecutionContext, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TenantGuard } from './tenant.guard';
import { PrismaService } from '../../prisma/prisma.service';

describe('TenantGuard (Unit / Mocked)', () => {
  let guard: TenantGuard;
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
    getClass: jest.fn(),
    getHandler: jest.fn(),
    getArgs: jest.fn(),
    getArgByIndex: jest.fn(),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
    getType: jest.fn().mockReturnValue('http'),
  });

  beforeEach(() => {
    prismaMock = {
      school: {
        findUnique: jest.fn().mockResolvedValue(activeSchool),
      },
    };
    guard = new TenantGuard(prismaMock as unknown as PrismaService);
  });

  it('1. should throw UnauthorizedException if req.user is missing', async () => {
    const context = createMockContext({ headers: {} });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('2. should require x-school-id header for PLATFORM_SUPER_ADMIN', async () => {
    const context = createMockContext({
      user: { id: 'admin-1', role: UserRole.PLATFORM_SUPER_ADMIN },
      headers: {},
    });
    await expect(guard.canActivate(context)).rejects.toThrow(BadRequestException);
    await expect(guard.canActivate(context)).rejects.toThrow(/Tenant specification required/);
  });

  it('3. should accept PLATFORM_SUPER_ADMIN with valid x-school-id and attach school to req.school', async () => {
    const req: any = {
      user: { id: 'admin-1', role: UserRole.PLATFORM_SUPER_ADMIN },
      headers: { 'x-school-id': validSchoolId },
    };
    const context = createMockContext(req);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req.school).toEqual(activeSchool);
    expect(prismaMock.school.findUnique).toHaveBeenCalledWith({
      where: { id: validSchoolId },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
      },
    });
  });

  it('4. should throw ForbiddenException if regular user has no schoolId', async () => {
    const context = createMockContext({
      user: { id: 'staff-1', role: UserRole.FEE_STAFF, schoolId: null },
      headers: {},
    });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow(/User is not associated with any active school/);
  });

  it('5. should throw ForbiddenException if regular user supplies mismatched x-school-id header', async () => {
    const context = createMockContext({
      user: { id: 'staff-1', role: UserRole.FEE_STAFF, schoolId: validSchoolId },
      headers: { 'x-school-id': otherSchoolId },
    });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow(/Cross-tenant access forbidden/);
  });

  it('6. should allow regular user when x-school-id matches user.schoolId', async () => {
    const req: any = {
      user: { id: 'staff-1', role: UserRole.FEE_STAFF, schoolId: validSchoolId },
      headers: { 'x-school-id': validSchoolId },
    };
    const context = createMockContext(req);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req.school).toEqual(activeSchool);
  });

  it('7. should allow regular user when x-school-id header is omitted', async () => {
    const req: any = {
      user: { id: 'student-1', role: UserRole.STUDENT, schoolId: validSchoolId },
      headers: {},
    };
    const context = createMockContext(req);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req.school).toEqual(activeSchool);
  });

  it('8. should reject malformed non-UUID tenant ID with BadRequestException', async () => {
    const context = createMockContext({
      user: { id: 'staff-1', role: UserRole.FEE_STAFF, schoolId: 'not-a-uuid' },
      headers: {},
    });
    await expect(guard.canActivate(context)).rejects.toThrow(BadRequestException);
    await expect(guard.canActivate(context)).rejects.toThrow(/Malformed tenant ID/);
  });

  it('9. should throw ForbiddenException if target school does not exist in DB', async () => {
    prismaMock.school.findUnique.mockResolvedValue(null);
    const context = createMockContext({
      user: { id: 'staff-1', role: UserRole.FEE_STAFF, schoolId: validSchoolId },
      headers: {},
    });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('10. should throw ForbiddenException if target school is SUSPENDED or INACTIVE', async () => {
    prismaMock.school.findUnique.mockResolvedValue({
      ...activeSchool,
      status: 'SUSPENDED',
    });
    const context = createMockContext({
      user: { id: 'staff-1', role: UserRole.FEE_STAFF, schoolId: validSchoolId },
      headers: {},
    });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('11. should preserve req.school assignment and not throw when ambient context is absent', async () => {
    const req: any = {
      user: { id: 'parent-1', role: UserRole.PARENT, schoolId: validSchoolId },
      headers: {},
    };
    const context = createMockContext(req);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req.school).toBeDefined();
    expect(req.school.id).toBe(validSchoolId);
  });
});
