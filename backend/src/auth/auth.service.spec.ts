import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { resolveJwtSecret } from './jwt-secret.util';
import { PrismaService } from '../prisma/prisma.service';
import { SmtpEmailProvider } from '../notifications/email/smtp-email.provider';
import { UserRole, TenantStatus } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: {
    sign: jest.Mock;
    verify: jest.Mock;
  };
  let emailProvider: {
    sendEmail: jest.Mock;
    getProviderName: jest.Mock;
    isDeliveryProvider: jest.Mock;
  };

  const mockPasswordHash = '$2b$10$mockHashedPasswordValue1234567890';

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      userSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      passwordResetToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      authAuditLog: {
        create: jest.fn(),
      },
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mock.jwt.token'),
      verify: jest.fn(),
    };

    emailProvider = {
      sendEmail: jest.fn().mockResolvedValue({
        providerMessageId: 'msg-123',
        accepted: true,
        timestamp: new Date(),
      }),
      getProviderName: jest.fn().mockReturnValue('smtp'),
      isDeliveryProvider: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: SmtpEmailProvider, useValue: emailProvider },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login - query structure & regression guard', () => {
    it('queries user with explicit school selection (id, name, status) and never requests wild-card school: true', async () => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'admin@greenwood.edu',
        passwordHash: mockPasswordHash,
        name: 'Dr. Jane Sterling',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-1',
        status: 'ACTIVE',
        failedLoginAttempts: 0,
        lockedUntil: null,
        school: {
          id: 'school-1',
          name: 'Greenwood High School',
          status: TenantStatus.ACTIVE,
        },
      });
      prisma.user.update.mockResolvedValue({});
      prisma.userSession.create.mockResolvedValue({ id: 'sess-1' });

      await service.login({
        email: 'admin@greenwood.edu',
        password: 'Password123!',
      });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          email: 'admin@greenwood.edu',
        },
        include: {
          school: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
      });

      const actualInclude = prisma.user.findFirst.mock.calls[0][0].include;
      expect(actualInclude.school).not.toBe(true);
      expect(actualInclude.school.select).toBeDefined();
    });

    it('successfully logs in an active user and returns accessToken, refreshToken, and schoolName', async () => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'admin@greenwood.edu',
        passwordHash: mockPasswordHash,
        name: 'Dr. Jane Sterling',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-1',
        status: 'ACTIVE',
        failedLoginAttempts: 0,
        lockedUntil: null,
        school: {
          id: 'school-1',
          name: 'Greenwood High School',
          status: TenantStatus.ACTIVE,
        },
      });
      prisma.user.update.mockResolvedValue({});
      prisma.userSession.create.mockResolvedValue({ id: 'sess-1' });

      const result = await service.login({
        email: 'admin@greenwood.edu',
        password: 'Password123!',
      });

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe('admin@greenwood.edu');
      expect(result.user.schoolName).toBe('Greenwood High School');
      expect(result.user.role).toBe(UserRole.SCHOOL_ADMIN);
      expect(jwtService.sign).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: null }),
        }),
      );
    });

    it('rejects login when password does not match and increments failedLoginAttempts', async () => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'admin@greenwood.edu',
        passwordHash: mockPasswordHash,
        name: 'Dr. Jane Sterling',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-1',
        status: 'ACTIVE',
        failedLoginAttempts: 2,
        lockedUntil: null,
        school: {
          id: 'school-1',
          name: 'Greenwood High School',
          status: TenantStatus.ACTIVE,
        },
      });
      prisma.user.update.mockResolvedValue({});

      await expect(
        service.login({
          email: 'admin@greenwood.edu',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ failedLoginAttempts: 3 }),
        }),
      );
    });

    it('locks account when failed attempts reach threshold of 5', async () => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'admin@greenwood.edu',
        passwordHash: mockPasswordHash,
        name: 'Dr. Jane Sterling',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-1',
        status: 'ACTIVE',
        failedLoginAttempts: 4,
        lockedUntil: null,
        school: {
          id: 'school-1',
          name: 'Greenwood High School',
          status: TenantStatus.ACTIVE,
        },
      });
      prisma.user.update.mockResolvedValue({});

      await expect(
        service.login({
          email: 'admin@greenwood.edu',
          password: 'WrongPasswordAgain!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            failedLoginAttempts: 5,
            lockedUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('rejects login immediately if user account is currently locked', async () => {
      const lockFuture = new Date(Date.now() + 10 * 60 * 1000);
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'admin@greenwood.edu',
        passwordHash: mockPasswordHash,
        name: 'Dr. Jane Sterling',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-1',
        status: 'ACTIVE',
        failedLoginAttempts: 5,
        lockedUntil: lockFuture,
        school: {
          id: 'school-1',
          name: 'Greenwood High School',
          status: TenantStatus.ACTIVE,
        },
      });

      await expect(
        service.login({
          email: 'admin@greenwood.edu',
          password: 'Password123!',
        }),
      ).rejects.toThrow(/Account is temporarily locked/);
    });

    it('rejects login when user status is not ACTIVE', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'admin@greenwood.edu',
        passwordHash: mockPasswordHash,
        name: 'Dr. Jane Sterling',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-1',
        status: 'INACTIVE',
        failedLoginAttempts: 0,
        lockedUntil: null,
      });

      await expect(
        service.login({
          email: 'admin@greenwood.edu',
          password: 'Password123!',
        }),
      ).rejects.toThrow(/User account is inactive or disabled/);
    });

    it('rejects login when school status is not ACTIVE', async () => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'admin@greenwood.edu',
        passwordHash: mockPasswordHash,
        name: 'Dr. Jane Sterling',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-1',
        status: 'ACTIVE',
        failedLoginAttempts: 0,
        lockedUntil: null,
        school: {
          id: 'school-1',
          name: 'Greenwood High School',
          status: TenantStatus.SUSPENDED,
        },
      });

      await expect(
        service.login({
          email: 'admin@greenwood.edu',
          password: 'Password123!',
        }),
      ).rejects.toThrow(/School tenant is currently SUSPENDED/);
    });
  });

  describe('refresh token & token rotation', () => {
    it('successfully rotates refresh token and returns new token pair', async () => {
      const rawOldToken = 'raw-refresh-token-valid';
      const oldHash = crypto.createHash('sha256').update(rawOldToken).digest('hex');

      prisma.userSession.findFirst.mockResolvedValue({
        id: 'sess-123',
        userId: 'user-1',
        tokenFamily: 'family-abc',
        refreshTokenHash: oldHash,
        expiresAt: new Date(Date.now() + 1000000),
        isRevoked: false,
        user: {
          id: 'user-1',
          email: 'admin@greenwood.edu',
          name: 'Dr. Jane',
          role: UserRole.SCHOOL_ADMIN,
          schoolId: 'school-1',
          status: 'ACTIVE',
          school: {
            id: 'school-1',
            name: 'Greenwood High School',
            status: TenantStatus.ACTIVE,
          },
        },
      });
      prisma.userSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.refresh(
        { refreshToken: rawOldToken },
        { ipAddress: '127.0.0.1', userAgent: 'Jest' },
      );

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(rawOldToken);
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'sess-123',
            refreshTokenHash: oldHash,
            isRevoked: false,
          },
          data: expect.objectContaining({
            refreshTokenHash: expect.any(String),
          }),
        }),
      );
    });

    it('detects refresh token reuse and revokes entire token family', async () => {
      const rawReusedToken = 'raw-stolen-token';
      const reusedHash = crypto.createHash('sha256').update(rawReusedToken).digest('hex');

      prisma.userSession.findFirst.mockResolvedValue({
        id: 'sess-reused',
        tokenFamily: 'family-compromised',
        refreshTokenHash: reusedHash,
        userId: 'user-1',
        isRevoked: true,
        user: {
          email: 'compromised@domain.com',
          status: 'ACTIVE',
        },
      });
      prisma.userSession.updateMany.mockResolvedValue({ count: 2 });

      await expect(
        service.refresh({ refreshToken: rawReusedToken }),
      ).rejects.toThrow(/Refresh token reuse detected/);

      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { tokenFamily: 'family-compromised' },
        data: expect.objectContaining({ isRevoked: true }),
      });
    });

    it('handles concurrent refresh race condition by permitting exactly one update and revoking on collision', async () => {
      const rawToken = 'raw-concurrent-token';
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

      prisma.userSession.findFirst.mockResolvedValue({
        id: 'sess-race',
        userId: 'user-1',
        tokenFamily: 'family-race',
        refreshTokenHash: hash,
        expiresAt: new Date(Date.now() + 1000000),
        isRevoked: false,
        user: {
          id: 'user-1',
          email: 'admin@greenwood.edu',
          status: 'ACTIVE',
        },
      });

      // First call wins the atomic conditional update
      prisma.userSession.updateMany.mockResolvedValueOnce({ count: 1 });
      const winnerResult = await service.refresh({ refreshToken: rawToken });
      expect(winnerResult.accessToken).toBeDefined();

      // Second concurrent call fails the atomic conditional update (count: 0)
      prisma.userSession.updateMany.mockResolvedValueOnce({ count: 0 }); // update attempt
      prisma.userSession.updateMany.mockResolvedValueOnce({ count: 1 }); // family purge

      await expect(
        service.refresh({ refreshToken: rawToken }),
      ).rejects.toThrow(/Concurrent refresh collision detected/);

      // Verify token family purge was invoked for loser
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenFamily: 'family-race' },
          data: expect.objectContaining({ isRevoked: true, revokedReason: 'CONCURRENT_REFRESH_RACE_DETECTED' }),
        }),
      );
    });

    it('rejects three simultaneous refresh requests allowing strictly only the first winner', async () => {
      const rawToken = 'raw-three-way-token';
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

      prisma.userSession.findFirst.mockResolvedValue({
        id: 'sess-three',
        userId: 'user-1',
        tokenFamily: 'family-three',
        refreshTokenHash: hash,
        expiresAt: new Date(Date.now() + 1000000),
        isRevoked: false,
        user: {
          id: 'user-1',
          email: 'admin@greenwood.edu',
          status: 'ACTIVE',
        },
      });

      // Simulation: Request 1 succeeds (count: 1); Request 2 fails (count: 0); Request 3 fails (session already revoked)
      prisma.userSession.updateMany.mockResolvedValueOnce({ count: 1 }); // Req 1 update
      const req1 = await service.refresh({ refreshToken: rawToken });
      expect(req1.accessToken).toBe('mock.jwt.token');

      // Req 2 hits atomic collision
      prisma.userSession.updateMany.mockResolvedValueOnce({ count: 0 }); // Req 2 update fails
      prisma.userSession.updateMany.mockResolvedValueOnce({ count: 1 }); // Req 2 family purge
      await expect(service.refresh({ refreshToken: rawToken })).rejects.toThrow(/Concurrent refresh collision detected/);

      // Req 3 now encounters revoked session
      prisma.userSession.findFirst.mockResolvedValueOnce({
        id: 'sess-three',
        userId: 'user-1',
        tokenFamily: 'family-three',
        refreshTokenHash: hash,
        expiresAt: new Date(Date.now() + 1000000),
        isRevoked: true, // Now revoked!
        user: {
          email: 'admin@greenwood.edu',
          status: 'ACTIVE',
        },
      });
      prisma.userSession.updateMany.mockResolvedValueOnce({ count: 1 });
      await expect(service.refresh({ refreshToken: rawToken })).rejects.toThrow(/Refresh token reuse detected/);
    });

    it('rejects an expired refresh token', async () => {
      const rawExpiredToken = 'raw-expired-token';
      const hash = crypto.createHash('sha256').update(rawExpiredToken).digest('hex');

      prisma.userSession.findFirst.mockResolvedValue({
        id: 'sess-expired',
        userId: 'user-1',
        tokenFamily: 'family-expired',
        refreshTokenHash: hash,
        expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
        isRevoked: false,
        user: { id: 'user-1', email: 'admin@greenwood.edu', status: 'ACTIVE' },
      });
      prisma.userSession.update.mockResolvedValue({});

      await expect(
        service.refresh({ refreshToken: rawExpiredToken }),
      ).rejects.toThrow(/Refresh token has expired/);

      expect(prisma.userSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sess-expired' },
          data: expect.objectContaining({ isRevoked: true, revokedReason: 'EXPIRED' }),
        }),
      );
    });

    it('rejects a revoked session on refresh attempt', async () => {
      const rawRevokedToken = 'raw-revoked-token';
      const hash = crypto.createHash('sha256').update(rawRevokedToken).digest('hex');

      prisma.userSession.findFirst.mockResolvedValue({
        id: 'sess-revoked',
        userId: 'user-1',
        tokenFamily: 'family-revoked',
        refreshTokenHash: hash,
        expiresAt: new Date(Date.now() + 50000),
        isRevoked: true, // Revoked!
        user: { id: 'user-1', email: 'admin@greenwood.edu', status: 'ACTIVE' },
      });
      prisma.userSession.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.refresh({ refreshToken: rawRevokedToken }),
      ).rejects.toThrow(/Refresh token reuse detected/);
    });
  });

  describe('logout & session revocation', () => {
    it('revokes specific session on logout', async () => {
      const rawToken = 'raw-token-to-logout';
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

      prisma.userSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.logout(
        { id: 'user-1', email: 'admin@greenwood.edu', sessionId: 'sess-1' },
        { refreshToken: rawToken },
      );

      expect(result.success).toBe(true);
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { refreshTokenHash: hash, userId: 'user-1' },
        data: expect.objectContaining({ isRevoked: true }),
      });
    });

    it('revokes all user sessions on logoutAll', async () => {
      prisma.userSession.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.logoutAll({
        id: 'user-1',
        email: 'admin@greenwood.edu',
      });

      expect(result.success).toBe(true);
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRevoked: false },
        data: expect.objectContaining({ isRevoked: true }),
      });
    });
  });

  describe('forgotPassword & resetPassword', () => {
    it('returns generic success message even if user does not exist (prevents enumeration)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'nonexistent@domain.com',
      });

      expect(result.message).toContain('If an active account exists');
      expect(emailProvider.sendEmail).not.toHaveBeenCalled();
    });

    it('generates token and dispatches reset email when user exists', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'admin@greenwood.edu',
        name: 'Dr. Jane',
        status: 'ACTIVE',
        school: { name: 'Greenwood High' },
      });
      prisma.passwordResetToken.create.mockResolvedValue({});

      const result = await service.forgotPassword({
        email: 'admin@greenwood.edu',
      });

      expect(result.message).toContain('If an active account exists');
      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
      expect(emailProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@greenwood.edu',
          subject: expect.stringContaining('Password Reset Request'),
        }),
      );
    });

    it('resets password, updates hash, marks token used, and revokes sessions', async () => {
      const rawToken = 'valid-reset-token';
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

      prisma.passwordResetToken.findFirst.mockResolvedValue({
        id: 'token-entry-1',
        userId: 'user-1',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 100000),
        usedAt: null,
        user: { id: 'user-1', email: 'admin@greenwood.edu', status: 'ACTIVE' },
      });
      prisma.passwordResetToken.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});
      prisma.userSession.updateMany.mockResolvedValue({ count: 2 });
      jest.spyOn(bcrypt, 'hash').mockImplementation(async () => 'newHashedPassword123');

      const result = await service.resetPassword({
        token: rawToken,
        newPassword: 'NewSecurePassword123!',
      });

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            passwordHash: 'newHashedPassword123',
            failedLoginAttempts: 0,
            lockedUntil: null,
          }),
        }),
      );
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'token-entry-1' },
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      });
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRevoked: false },
        data: expect.objectContaining({ isRevoked: true }),
      });
    });

    it('rejects expired or used reset token', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'invalid-or-used-token',
          newPassword: 'NewSecurePassword123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('changePassword', () => {
    it('verifies current password, rejects same-password reuse, and updates hash', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@greenwood.edu',
        passwordHash: mockPasswordHash,
        status: 'ACTIVE',
      });
      jest
        .spyOn(bcrypt, 'compare')
        .mockImplementation(async (plain: string, hash: string) => {
          if (plain === 'CurrentPassword123!') return true;
          return false;
        });
      jest.spyOn(bcrypt, 'hash').mockImplementation(async () => 'updatedHashedPassword456');
      prisma.user.update.mockResolvedValue({});
      prisma.userSession.updateMany.mockResolvedValue({});

      const result = await service.changePassword(
        { id: 'user-1', sessionId: 'active-sess-id' },
        {
          currentPassword: 'CurrentPassword123!',
          newPassword: 'NewStrongPassword456!',
        },
      );

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            passwordHash: 'updatedHashedPassword456',
          }),
        }),
      );
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          isRevoked: false,
          id: { not: 'active-sess-id' },
        },
        data: expect.objectContaining({ isRevoked: true }),
      });
    });

      it('rejects change password when new password is identical to current password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@greenwood.edu',
        passwordHash: mockPasswordHash,
        status: 'ACTIVE',
      });
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      await expect(
        service.changePassword(
          { id: 'user-1', sessionId: 'active-sess-id' },
          {
            currentPassword: 'SamePassword123!',
            newPassword: 'SamePassword123!',
          },
        ),
      ).rejects.toThrow(/New password cannot be identical to the current password/);
    });
  });

  describe('SEC-01 / DB-01 — End-to-End Session Lifecycle, Lockout & JwtStrategy Revocation', () => {
    it('executes Login -> Refresh -> Logout and rejects revoked session in JwtStrategy.validate', async () => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      // 1. Login creates an active session
      const sessionStore: Record<string, any> = {};
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'admin@greenwood.edu',
        passwordHash: mockPasswordHash,
        name: 'Dr. Jane',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-1',
        status: 'ACTIVE',
        failedLoginAttempts: 0,
        lockedUntil: null,
        school: { id: 'school-1', name: 'Greenwood High', status: TenantStatus.ACTIVE },
      });
      prisma.user.update.mockResolvedValue({});
      prisma.userSession.create.mockImplementation(async ({ data }: any) => {
        sessionStore[data.id] = {
          ...data,
          user: {
            id: 'user-1',
            email: 'admin@greenwood.edu',
            name: 'Dr. Jane',
            role: UserRole.SCHOOL_ADMIN,
            schoolId: 'school-1',
            status: 'ACTIVE',
            school: { id: 'school-1', name: 'Greenwood High', status: TenantStatus.ACTIVE },
          },
        };
        return sessionStore[data.id];
      });

      const loginRes = await service.login({
        email: 'admin@greenwood.edu',
        password: 'Password123!',
      });
      expect(loginRes.refreshToken).toBeDefined();

      const createdSessionId = Object.keys(sessionStore)[0];
      expect(createdSessionId).toBeDefined();

      // 2. Refresh rotates the refresh token
      prisma.userSession.findFirst.mockImplementation(async ({ where }: any) => {
        return Object.values(sessionStore).find((s: any) => s.refreshTokenHash === where.refreshTokenHash) || null;
      });
      prisma.userSession.updateMany.mockImplementation(async ({ where, data }: any) => {
        let count = 0;
        for (const s of Object.values(sessionStore) as any[]) {
          const matchesId = !where.id || s.id === where.id;
          const matchesHash = !where.refreshTokenHash || s.refreshTokenHash === where.refreshTokenHash;
          const matchesUser = !where.userId || s.userId === where.userId;
          const matchesRevoked = where.isRevoked === undefined || s.isRevoked === where.isRevoked;
          if (matchesId && matchesHash && matchesUser && matchesRevoked) {
            Object.assign(s, data);
            count++;
          }
        }
        return { count };
      });

      const refreshRes = await service.refresh({ refreshToken: loginRes.refreshToken });
      expect(refreshRes.refreshToken).not.toBe(loginRes.refreshToken);

      // 3. JwtStrategy validates active session successfully
      const strategy = new JwtStrategy(prisma as PrismaService);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@greenwood.edu',
        name: 'Dr. Jane',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-1',
        status: 'ACTIVE',
      });
      prisma.userSession.findUnique.mockImplementation(async ({ where }: any) => sessionStore[where.id] || null);

      const validatedUser = await strategy.validate({
        sub: 'user-1',
        email: 'admin@greenwood.edu',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-1',
        sessionId: createdSessionId,
      });
      expect(validatedUser.id).toBe('user-1');

      // 4. Logout revokes the session
      await service.logout(
        { id: 'user-1', email: 'admin@greenwood.edu', schoolId: 'school-1', sessionId: createdSessionId },
        { refreshToken: refreshRes.refreshToken },
      );
      expect(sessionStore[createdSessionId].isRevoked).toBe(true);

      // 5. JwtStrategy now rejects requests carrying the revoked sessionId
      await expect(
        strategy.validate({
          sub: 'user-1',
          email: 'admin@greenwood.edu',
          role: UserRole.SCHOOL_ADMIN,
          schoolId: 'school-1',
          sessionId: createdSessionId,
        }),
      ).rejects.toThrow(/Session has been revoked or expired/);
    });

    it('enforces 5 consecutive failed login attempts and locks the account on the 5th failure', async () => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      let failedLoginAttempts = 0;
      let lockedUntil: Date | null = null;

      prisma.user.findFirst.mockImplementation(async () => ({
        id: 'user-lock-1',
        email: 'staff@greenwood.edu',
        passwordHash: mockPasswordHash,
        name: 'Fee Staff',
        role: UserRole.FEE_STAFF,
        schoolId: 'school-1',
        status: 'ACTIVE',
        failedLoginAttempts,
        lockedUntil,
        school: { id: 'school-1', name: 'Greenwood High', status: TenantStatus.ACTIVE },
      }));

      prisma.user.update.mockImplementation(async ({ data }: any) => {
        failedLoginAttempts = data.failedLoginAttempts;
        lockedUntil = data.lockedUntil;
        return {};
      });

      // Attempts 1 to 4: standard invalid credentials error
      for (let i = 1; i <= 4; i++) {
        await expect(
          service.login({ email: 'staff@greenwood.edu', password: 'WrongPassword!' }),
        ).rejects.toThrow('Invalid email or password credentials');
        expect(failedLoginAttempts).toBe(i);
        expect(lockedUntil).toBeNull();
      }

      // Attempt 5: locks the account for 15 minutes
      await expect(
        service.login({ email: 'staff@greenwood.edu', password: 'WrongPassword!' }),
      ).rejects.toThrow(/Account has been temporarily locked for 15 minutes/);
      expect(failedLoginAttempts).toBe(5);
      expect(lockedUntil).toBeInstanceOf(Date);

      // Attempt 6 (even with correct password): rejected while lockedUntil is in the future
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
      await expect(
        service.login({ email: 'staff@greenwood.edu', password: 'CorrectPassword123!' }),
      ).rejects.toThrow(/Account is temporarily locked/);
    });
  });

  describe('SEC-02 — JWT Secret Validation (Production Fail-Closed)', () => {
    it('throws fatal error in production when JWT_SECRET is missing', () => {
      expect(() =>
        resolveJwtSecret({ NODE_ENV: 'production' } as any),
      ).toThrow(/JWT_SECRET environment variable is required in production/);
    });

    it('throws fatal error in production when JWT_SECRET is shorter than 32 characters', () => {
      expect(() =>
        resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'too-short-secret-123' } as any),
      ).toThrow(/JWT_SECRET is too weak/);
    });

    it('throws fatal error in production when JWT_SECRET uses the legacy development placeholder', () => {
      expect(() =>
        resolveJwtSecret({
          NODE_ENV: 'production',
          JWT_SECRET: 'super-secret-key-for-development-phase1-school-fee-mgmt',
        } as any),
      ).toThrow(/JWT_SECRET is too weak or uses a known default placeholder/);
    });

    it('accepts a cryptographically strong 32+ character secret in production', () => {
      const strongSecret = 'a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8';
      expect(
        resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: strongSecret } as any),
      ).toBe(strongSecret);
    });

    it('provides non-production fallback in test environment when JWT_SECRET is unset', () => {
      const secret = resolveJwtSecret({ NODE_ENV: 'test' } as any);
      expect(secret).toBeDefined();
      expect(secret.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('SEC-03 — Email Normalization & Multi-Tenant Login Disambiguation', () => {
    it('normalizes mixed-case and whitespace-padded email on login', async () => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'admin@greenwood.edu',
        passwordHash: mockPasswordHash,
        name: 'Dr. Jane',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-1',
        status: 'ACTIVE',
        failedLoginAttempts: 0,
        lockedUntil: null,
        school: { id: 'school-1', name: 'Greenwood High', status: TenantStatus.ACTIVE },
      });
      prisma.user.update.mockResolvedValue({});
      prisma.userSession.create.mockResolvedValue({ id: 'sess-1' });

      await service.login({
        email: '  Admin@Greenwood.EDU  ',
        password: 'Password123!',
      });

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'admin@greenwood.edu' },
        }),
      );
    });

    it('rejects ambiguous login when duplicate email exists across two schools and schoolId is omitted', async () => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      const schoolAUser = {
        id: 'user-school-a',
        email: 'shared.admin@edu.org',
        passwordHash: mockPasswordHash,
        name: 'Shared Admin A',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-a',
        status: 'ACTIVE',
        school: { id: 'school-a', name: 'Alpha Academy', status: TenantStatus.ACTIVE },
      };
      const schoolBUser = {
        id: 'user-school-b',
        email: 'shared.admin@edu.org',
        passwordHash: mockPasswordHash,
        name: 'Shared Admin B',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-b',
        status: 'ACTIVE',
        school: { id: 'school-b', name: 'Beta International', status: TenantStatus.ACTIVE },
      };

      prisma.user.findFirst.mockResolvedValue(schoolAUser);
      prisma.user.findMany = jest.fn().mockResolvedValue([schoolAUser, schoolBUser]);

      await expect(
        service.login({
          email: 'Shared.Admin@edu.org',
          password: 'Password123!',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('does not disclose tenant list when duplicate email across two schools is submitted with an invalid password', async () => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      const schoolAUser = {
        id: 'user-school-a',
        email: 'shared.admin@edu.org',
        passwordHash: mockPasswordHash,
        schoolId: 'school-a',
        status: 'ACTIVE',
        school: { id: 'school-a', name: 'Alpha Academy', status: TenantStatus.ACTIVE },
      };
      const schoolBUser = {
        id: 'user-school-b',
        email: 'shared.admin@edu.org',
        passwordHash: mockPasswordHash,
        schoolId: 'school-b',
        status: 'ACTIVE',
        school: { id: 'school-b', name: 'Beta International', status: TenantStatus.ACTIVE },
      };

      prisma.user.findFirst.mockResolvedValue(schoolAUser);
      prisma.user.findMany = jest.fn().mockResolvedValue([schoolAUser, schoolBUser]);

      await expect(
        service.login({
          email: 'shared.admin@edu.org',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('authenticates the exact target tenant when schoolId is explicitly selected for a duplicate email', async () => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      const schoolBUser = {
        id: 'user-school-b',
        email: 'shared.admin@edu.org',
        passwordHash: mockPasswordHash,
        name: 'Shared Admin B',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-b',
        status: 'ACTIVE',
        failedLoginAttempts: 0,
        lockedUntil: null,
        school: { id: 'school-b', name: 'Beta International', status: TenantStatus.ACTIVE },
      };

      prisma.user.findFirst.mockResolvedValue(schoolBUser);
      prisma.user.update.mockResolvedValue({});
      prisma.userSession.create.mockResolvedValue({ id: 'sess-b' });

      const result = await service.login({
        email: 'Shared.Admin@EDU.org',
        password: 'Password123!',
        schoolId: 'school-b',
      });

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            email: 'shared.admin@edu.org',
            schoolId: 'school-b',
          },
        }),
      );
      expect(result.user.schoolId).toBe('school-b');
      expect(result.user.schoolName).toBe('Beta International');
    });

    it('normalizes email in forgotPassword and prevents arbitrary tenant reset when email is ambiguous', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'admin@greenwood.edu',
        name: 'Dr. Jane',
        status: 'ACTIVE',
        schoolId: 'school-1',
        school: { name: 'Greenwood High' },
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({});

      await service.forgotPassword({ email: '  Admin@Greenwood.EDU  ' });

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: 'admin@greenwood.edu',
            status: 'ACTIVE',
          }),
        }),
      );

      // Ambiguous case: 2 schools share the same email and no schoolId is provided
      emailProvider.sendEmail.mockClear();
      prisma.passwordResetToken.create.mockClear();
      prisma.user.findMany = jest.fn().mockResolvedValue([
        { id: 'u1', email: 'shared@edu.org', schoolId: 's1' },
        { id: 'u2', email: 'shared@edu.org', schoolId: 's2' },
      ]);

      const res = await service.forgotPassword({ email: 'Shared@EDU.org' });
      expect(res.message).toContain('If an active account exists');
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailProvider.sendEmail).not.toHaveBeenCalled();
    });
  });
});
