import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus, TenantStatus } from '@prisma/client';
import { SchoolsService } from './schools.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmtpEmailProvider } from '../notifications/email/smtp-email.provider';

describe('SchoolsService — School Administrator Account Management', () => {
  let service: SchoolsService;
  let mockPrisma: any;
  let mockEmailProvider: any;

  const validSchoolId = '11111111-1111-1111-1111-111111111111';
  const validAdminId = '22222222-2222-2222-2222-222222222222';
  const superAdminId = '99999999-9999-9999-9999-999999999999';

  const sampleAdmin = {
    id: validAdminId,
    name: 'Principal John Doe',
    email: 'admin.john@greenwood.internal',
    role: UserRole.SCHOOL_ADMIN,
    status: UserStatus.ACTIVE,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    lastLoginAt: new Date('2026-02-01T08:30:00Z'),
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: null,
    school: {
      id: validSchoolId,
      name: 'Greenwood High School',
      code: 'GWH001',
      status: TenantStatus.ACTIVE,
    },
  };

  beforeEach(async () => {
    mockPrisma = {
      school: {
        findUnique: jest.fn(),
      },
      user: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      userSession: {
        updateMany: jest.fn(),
      },
      passwordResetToken: {
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      authAuditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    mockEmailProvider = {
      sendEmail: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchoolsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SmtpEmailProvider, useValue: mockEmailProvider },
      ],
    }).compile();

    service = module.get<SchoolsService>(SchoolsService);
  });

  describe('findAllAdmins', () => {
    it('returns paginated list of school administrators', async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.user.findMany.mockResolvedValue([sampleAdmin]);

      const result = await service.findAllAdmins({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].email).toBe('admin.john@greenwood.internal');
      expect(result.data[0].role).toBe(UserRole.SCHOOL_ADMIN);
      expect(result.meta.total).toBe(1);
      expect(mockPrisma.user.findMany).toHaveBeenCalled();
    });

    it('filters by search term across name, email, and school', async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.user.findMany.mockResolvedValue([sampleAdmin]);

      await service.findAllAdmins({ search: 'greenwood' });
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: 'greenwood', mode: 'insensitive' } },
              { email: { contains: 'greenwood', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });
  });

  describe('findAdminProfile', () => {
    it('returns administrator profile with audit history', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(sampleAdmin);
      mockPrisma.authAuditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          eventType: 'LOGIN_SUCCESS',
          details: { sessionId: 'sess-1' },
          createdAt: new Date(),
        },
      ]);

      const result = await service.findAdminProfile(validAdminId);
      expect(result.id).toBe(validAdminId);
      expect(result.auditHistory).toHaveLength(1);
      expect(result.auditHistory[0].eventType).toBe('LOGIN_SUCCESS');
    });

    it('rejects malformed administrator UUID', async () => {
      await expect(service.findAdminProfile('invalid-uuid')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if administrator does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findAdminProfile(validAdminId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('suspendAdmin', () => {
    it('suspends administrator account and immediately revokes all active sessions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(sampleAdmin);
      mockPrisma.user.update.mockResolvedValue({
        ...sampleAdmin,
        status: UserStatus.INACTIVE,
      });

      const result = await service.suspendAdmin(
        validAdminId,
        { reason: 'Security policy compliance review' },
        superAdminId,
      );

      expect(result.user.status).toBe(UserStatus.INACTIVE);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: validAdminId },
          data: { status: UserStatus.INACTIVE },
        }),
      );
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: validAdminId, isRevoked: false },
          data: expect.objectContaining({
            isRevoked: true,
            revokedReason: expect.stringContaining('Security policy compliance review'),
          }),
        }),
      );
      expect(mockPrisma.authAuditLog.create).toHaveBeenCalled();
    });

    it('rejects suspending an account that is already inactive', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...sampleAdmin,
        status: UserStatus.INACTIVE,
      });

      await expect(
        service.suspendAdmin(validAdminId, { reason: 'Test reason' }, superAdminId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('activateAdmin', () => {
    it('activates suspended administrator account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...sampleAdmin,
        status: UserStatus.INACTIVE,
      });
      mockPrisma.user.update.mockResolvedValue({
        ...sampleAdmin,
        status: UserStatus.ACTIVE,
      });

      const result = await service.activateAdmin(
        validAdminId,
        { reason: 'Verification complete' },
        superAdminId,
      );

      expect(result.user.status).toBe(UserStatus.ACTIVE);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: validAdminId },
          data: expect.objectContaining({
            status: UserStatus.ACTIVE,
          }),
        }),
      );
      expect(mockPrisma.authAuditLog.create).toHaveBeenCalled();
    });
  });

  describe('initiatePasswordReset', () => {
    it('generates secure expiring reset token and dispatches email without exposing token in response', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(sampleAdmin);

      const result = await service.initiatePasswordReset(validAdminId, superAdminId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('admin.john@greenwood.internal');
      expect((result as any).token).toBeUndefined();
      expect((result as any).tokenHash).toBeUndefined();
      expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: validAdminId,
            tokenHash: expect.any(String),
          }),
        }),
      );
      expect(mockEmailProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin.john@greenwood.internal',
          subject: expect.stringContaining('Password Reset Request'),
        }),
      );
      expect(mockPrisma.authAuditLog.create).toHaveBeenCalled();
    });

    it('rejects password reset for suspended/inactive account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...sampleAdmin,
        status: UserStatus.INACTIVE,
      });

      await expect(service.initiatePasswordReset(validAdminId, superAdminId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
