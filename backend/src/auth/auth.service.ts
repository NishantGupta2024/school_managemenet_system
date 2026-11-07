import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SmtpEmailProvider } from '../notifications/email/smtp-email.provider';
import { UserRole } from '@prisma/client';

export interface ClientContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly maxFailedAttempts = 5;
  private readonly lockoutDurationMinutes = 15;
  private readonly refreshTokenTtlDays = 7;
  private readonly resetTokenTtlMinutes = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailProvider: SmtpEmailProvider,
  ) {}

  /**
   * Hashes a token using SHA-256 for secure database storage.
   */
  public hashToken(token: string): string {
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  }

  /**
   * Generates a high-entropy random token.
   */
  public generateSecureToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Records security audit log.
   */
  private async recordAuditLog(
    email: string,
    eventType: string,
    userId?: string | null,
    schoolId?: string | null,
    context?: ClientContext,
    details?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.authAuditLog.create({
        data: {
          email,
          eventType,
          userId: userId || null,
          schoolId: schoolId || null,
          ipAddress: context?.ipAddress || null,
          userAgent: context?.userAgent || null,
          details: details ?? undefined,
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `[AUDIT] Failed to persist audit log (${eventType} for ${email}): ${err?.message || 'unknown error'}`,
      );
    }
  }

  /**
   * Authenticates user, enforces lockout counter, creates a session, and issues tokens.
   */
  async login(loginDto: LoginDto, context?: ClientContext) {
    const normalizedEmail = loginDto.email.trim().toLowerCase();
    const { password } = loginDto;
    const schoolId = loginDto.schoolId?.trim() || undefined;

    // 1. Find user by normalized email and optional schoolId
    let user = await this.prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        ...(schoolId ? { schoolId } : {}),
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

    const now = new Date();

    // 1b. Deterministic Multi-Tenant Disambiguation when schoolId is not specified
    if (!schoolId && typeof (this.prisma.user as any).findMany === 'function') {
      const matchingUsers = await this.prisma.user.findMany({
        where: { email: normalizedEmail },
        include: {
          school: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (matchingUsers && matchingUsers.length > 1) {
        // Verify password against matching accounts first so wrong passwords never leak tenant membership
        let anyPasswordValid = false;
        for (const candidate of matchingUsers) {
          const matches = await bcrypt.compare(password, candidate.passwordHash);
          if (matches) {
            anyPasswordValid = true;
          }
        }

        if (!anyPasswordValid) {
          await this.recordAuditLog(
            normalizedEmail,
            'LOGIN_FAILED_AMBIGUOUS_TENANT_BAD_PASSWORD',
            null,
            null,
            context,
          );
          throw new UnauthorizedException('Invalid email or password credentials');
        }

        await this.recordAuditLog(
          normalizedEmail,
          'LOGIN_REJECTED_TENANT_AMBIGUOUS',
          null,
          null,
          context,
          { matchingTenantCount: matchingUsers.length },
        );

        throw new BadRequestException({
          statusCode: 400,
          code: 'TENANT_SELECTION_REQUIRED',
          message:
            'Multiple school accounts share this email address. Please select your school (schoolId) to sign in.',
          requiresSchoolSelection: true,
          schools: matchingUsers
            .filter((u) => u.school)
            .map((u) => ({
              id: u.school!.id,
              name: u.school!.name,
              status: u.school!.status,
            })),
        });
      }

      if (!user && matchingUsers && matchingUsers.length === 1) {
        user = matchingUsers[0];
      }
    }

    // Constant-time dummy comparison if user not found to prevent timing-based enumeration
    if (!user) {
      await bcrypt.compare(password, '$2b$10$abcdefghijklmnopqrstuvwxyz123456789012345678901234567890');
      await this.recordAuditLog(normalizedEmail, 'LOGIN_FAILED_USER_NOT_FOUND', null, schoolId, context);
      throw new UnauthorizedException('Invalid email or password credentials');
    }

    // 2. Check if account is currently locked
    if (user.lockedUntil && new Date(user.lockedUntil) > now) {
      const remainingMinutes = Math.ceil((new Date(user.lockedUntil).getTime() - now.getTime()) / 60000);
      await this.recordAuditLog(user.email, 'LOGIN_REJECTED_ACCOUNT_LOCKED', user.id, user.schoolId, context);
      throw new UnauthorizedException(
        `Account is temporarily locked due to excessive failed attempts. Please try again in ${remainingMinutes} minute(s).`,
      );
    }

    if (user.status !== 'ACTIVE') {
      await this.recordAuditLog(user.email, 'LOGIN_REJECTED_ACCOUNT_INACTIVE', user.id, user.schoolId, context);
      throw new UnauthorizedException('User account is inactive or disabled');
    }

    // 3. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      const currentFailures = (user.failedLoginAttempts || 0) + 1;
      const isLocking = currentFailures >= this.maxFailedAttempts;
      const lockedUntil = isLocking
        ? new Date(now.getTime() + this.lockoutDurationMinutes * 60000)
        : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: currentFailures,
          lockedUntil,
        },
      });

      if (isLocking) {
        await this.recordAuditLog(user.email, 'ACCOUNT_LOCKED', user.id, user.schoolId, context, { currentFailures });
        throw new UnauthorizedException(
          `Account has been temporarily locked for ${this.lockoutDurationMinutes} minutes due to multiple failed login attempts.`,
        );
      } else {
        await this.recordAuditLog(user.email, 'LOGIN_FAILED_BAD_PASSWORD', user.id, user.schoolId, context, {
          attempt: currentFailures,
        });
        throw new UnauthorizedException('Invalid email or password credentials');
      }
    }

    // 4. Verify school status
    if (user.schoolId && user.school && user.school.status !== 'ACTIVE') {
      throw new UnauthorizedException(`School tenant is currently ${user.school.status}`);
    }

    // 5. Successful login: reset failed attempts counter
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
      },
    });

    // 6. Generate Session and Refresh Token
    const rawRefreshToken = this.generateSecureToken(40);
    const refreshTokenHash = this.hashToken(rawRefreshToken);
    const tokenFamily = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    await this.prisma.userSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        schoolId: user.schoolId,
        tokenFamily,
        refreshTokenHash,
        deviceInfo: context?.userAgent ? context.userAgent.substring(0, 255) : null,
        ipAddress: context?.ipAddress ? context.ipAddress.substring(0, 64) : null,
        expiresAt,
        lastUsedAt: now,
        isRevoked: false,
      },
    });

    // 7. Sign Access Token (15m default)
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      sessionId,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });

    await this.recordAuditLog(user.email, 'LOGIN_SUCCESS', user.id, user.schoolId, context, { sessionId });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: '15m',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        schoolId: user.schoolId,
        schoolName: user.school?.name || 'Platform Admin',
      },
    };
  }

  /**
   * Refreshes an access token using a valid refresh token.
   * Enforces token rotation, reuse detection, and family invalidation.
   */
  async refresh(dto: RefreshTokenDto, context?: ClientContext) {
    const { refreshToken } = dto;
    const tokenHash = this.hashToken(refreshToken);
    const now = new Date();

    // 1. Query matching session by token hash
    const session = await this.prisma.userSession.findFirst({
      where: { refreshTokenHash: tokenHash },
      include: { user: { include: { school: true } } },
    });

    // 2. Token Reuse Detection: If not found by active hash, reject
    if (!session) {
      await this.recordAuditLog('UNKNOWN', 'TOKEN_REFRESH_INVALID_TOKEN', null, null, context);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 3. If session is already revoked -> REUSE ATTACK DETECTED!
    if (session.isRevoked) {
      // Invalidate the entire token family
      await this.prisma.userSession.updateMany({
        where: { tokenFamily: session.tokenFamily },
        data: {
          isRevoked: true,
          revokedAt: now,
          revokedReason: 'TOKEN_REUSE_DETECTED_FAMILY_PURGE',
        },
      });

      await this.recordAuditLog(
        session.user.email,
        'TOKEN_REUSE_DETECTED',
        session.userId,
        session.schoolId,
        context,
        { tokenFamily: session.tokenFamily },
      );

      throw new UnauthorizedException('Security alert: Refresh token reuse detected. All sessions in this family have been terminated.');
    }

    // 4. Check session expiration
    if (new Date(session.expiresAt) <= now) {
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { isRevoked: true, revokedAt: now, revokedReason: 'EXPIRED' },
      });
      throw new UnauthorizedException('Refresh token has expired. Please login again.');
    }

    // 5. Check user status
    if (session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is inactive or disabled');
    }

    // 6. Rotate Token: Generate new raw refresh token
    const newRawRefreshToken = this.generateSecureToken(40);
    const newRefreshTokenHash = this.hashToken(newRawRefreshToken);

    // Atomic conditional update: only the first concurrent request matching the exact
    // active refreshTokenHash, id, and isRevoked=false will update count=1.
    // Any second/third concurrent request with the same token will match 0 records.
    const updateResult = await this.prisma.userSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: tokenHash,
        isRevoked: false,
      },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        lastUsedAt: now,
      },
    });

    if (updateResult && updateResult.count === 0) {
      // Concurrency conflict / race condition detected!
      // Another concurrent worker consumed this token in the exact same moment.
      // Purge token family to mitigate potential race attack.
      await this.prisma.userSession.updateMany({
        where: { tokenFamily: session.tokenFamily },
        data: {
          isRevoked: true,
          revokedAt: now,
          revokedReason: 'CONCURRENT_REFRESH_RACE_DETECTED',
        },
      });

      await this.recordAuditLog(
        session.user.email,
        'TOKEN_REFRESH_CONCURRENCY_CONFLICT',
        session.userId,
        session.schoolId,
        context,
        { tokenFamily: session.tokenFamily },
      );

      throw new UnauthorizedException('Security alert: Concurrent refresh collision detected. Session terminated.');
    }

    // 7. Issue new 15m access token
    const newAccessToken = this.jwtService.sign(
      {
        sub: session.user.id,
        email: session.user.email,
        role: session.user.role,
        schoolId: session.user.schoolId,
        sessionId: session.id,
      },
      { expiresIn: '15m' },
    );

    await this.recordAuditLog(session.user.email, 'TOKEN_REFRESH_SUCCESS', session.userId, session.schoolId, context);

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: '15m',
    };
  }

  /**
   * Logs out the current session.
   */
  async logout(user: any, dto?: RefreshTokenDto, context?: ClientContext) {
    const now = new Date();
    if (dto?.refreshToken) {
      const tokenHash = this.hashToken(dto.refreshToken);
      await this.prisma.userSession.updateMany({
        where: { refreshTokenHash: tokenHash, userId: user.id },
        data: { isRevoked: true, revokedAt: now, revokedReason: 'USER_LOGOUT' },
      });
    } else if (user.sessionId) {
      await this.prisma.userSession.updateMany({
        where: { id: user.sessionId, userId: user.id },
        data: { isRevoked: true, revokedAt: now, revokedReason: 'USER_LOGOUT' },
      });
    }

    await this.recordAuditLog(user.email, 'LOGOUT_SUCCESS', user.id, user.schoolId, context);
    return { success: true, message: 'Successfully logged out' };
  }

  /**
   * Logs out all sessions for the authenticated user.
   */
  async logoutAll(user: any, context?: ClientContext) {
    const now = new Date();
    await this.prisma.userSession.updateMany({
      where: { userId: user.id, isRevoked: false },
      data: { isRevoked: true, revokedAt: now, revokedReason: 'LOGOUT_ALL_SESSIONS' },
    });

    await this.recordAuditLog(user.email, 'LOGOUT_ALL_SUCCESS', user.id, user.schoolId, context);
    return { success: true, message: 'All active sessions have been terminated' };
  }

  /**
   * Requests a password reset link. Returns generic response to prevent account enumeration.
   */
  async forgotPassword(dto: ForgotPasswordDto, context?: ClientContext) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const schoolId = dto.schoolId?.trim() || undefined;
    const genericResponse = {
      message: 'If an active account exists with this email address, password reset instructions have been sent.',
    };

    if (!schoolId && typeof (this.prisma.user as any).findMany === 'function') {
      const matchingUsers = await this.prisma.user.findMany({
        where: { email: normalizedEmail, status: 'ACTIVE' },
        include: { school: true },
      });
      if (matchingUsers && matchingUsers.length > 1) {
        await this.recordAuditLog(
          normalizedEmail,
          'PASSWORD_RESET_AMBIGUOUS_TENANT',
          null,
          null,
          context,
          { matchingTenantCount: matchingUsers.length },
        );
        return genericResponse;
      }
    }

    const user = await this.prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        status: 'ACTIVE',
        ...(schoolId ? { schoolId } : {}),
      },
      include: { school: true },
    });

    if (!user) {
      await this.recordAuditLog(normalizedEmail, 'PASSWORD_RESET_REQUEST_NONEXISTENT_EMAIL', null, schoolId, context);
      return genericResponse;
    }

    // Invalidate existing unused tokens for this user
    const now = new Date();
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });

    // Generate single-use cryptographic token
    const rawResetToken = this.generateSecureToken(32);
    const tokenHash = this.hashToken(rawResetToken);
    const expiresAt = new Date(now.getTime() + this.resetTokenTtlMinutes * 60000);

    await this.prisma.passwordResetToken.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // Dispatch email via SmtpEmailProvider
    try {
      const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${rawResetToken}`;
      await this.emailProvider.sendEmail({
        to: user.email,
        subject: `Password Reset Request | ${user.school?.name || 'School Fee System'}`,
        htmlBody: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Password Reset Request</h2>
            <p>Hello ${user.name},</p>
            <p>A password reset was requested for your account. Click the button below to reset your password. This link is valid for 30 minutes.</p>
            <p style="margin: 20px 0;">
              <a href="${resetLink}" style="background-color: #2563eb; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
            </p>
            <p>If you did not request this, you can safely ignore this email.</p>
          </div>
        `,
        textBody: `Hello ${user.name},\n\nA password reset was requested for your account. Visit the following link within 30 minutes to reset your password:\n${resetLink}\n\nIf you did not request this, please ignore this email.`,
      });
    } catch (emailErr: any) {
      this.logger.error(`Failed to dispatch password reset email to ${user.email}: ${emailErr.message}`);
    }

    await this.recordAuditLog(user.email, 'PASSWORD_RESET_LINK_DISPATCHED', user.id, user.schoolId, context);
    return genericResponse;
  }

  /**
   * Completes a password reset using a valid single-use token.
   */
  async resetPassword(dto: ResetPasswordDto, context?: ClientContext) {
    const { token, newPassword } = dto;
    const tokenHash = this.hashToken(token);
    const now = new Date();

    const resetRecord = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
      include: { user: true },
    });

    if (!resetRecord || !resetRecord.user) {
      throw new BadRequestException('Invalid, expired, or already used password reset token');
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    // Update password, mark token used, and revoke all sessions
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetRecord.userId },
        data: {
          passwordHash: newHash,
          passwordChangedAt: now,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      await tx.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: now },
      });

      await tx.userSession.updateMany({
        where: { userId: resetRecord.userId, isRevoked: false },
        data: { isRevoked: true, revokedAt: now, revokedReason: 'PASSWORD_RESET_REVOCATION' },
      });
    });

    await this.recordAuditLog(resetRecord.user.email, 'PASSWORD_RESET_COMPLETED', resetRecord.userId, resetRecord.user.schoolId, context);
    return { success: true, message: 'Password has been successfully reset. Please log in with your new password.' };
  }

  /**
   * Authenticated password change for currently logged-in user.
   */
  async changePassword(user: any, dto: ChangePasswordDto, context?: ClientContext) {
    const { currentPassword, newPassword } = dto;

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) {
      throw new UnauthorizedException('User account no longer exists');
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, dbUser.passwordHash);
    if (!isCurrentValid) {
      await this.recordAuditLog(dbUser.email, 'PASSWORD_CHANGE_FAILED_WRONG_CURRENT', dbUser.id, dbUser.schoolId, context);
      throw new BadRequestException('Current password does not match');
    }

    const isSamePassword = await bcrypt.compare(newPassword, dbUser.passwordHash);
    if (isSamePassword) {
      throw new BadRequestException('New password cannot be identical to the current password');
    }

    const now = new Date();
    const newHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newHash,
          passwordChangedAt: now,
        },
      });

      // Revoke all other sessions for this user
      await tx.userSession.updateMany({
        where: {
          userId: user.id,
          isRevoked: false,
          ...(user.sessionId ? { id: { not: user.sessionId } } : {}),
        },
        data: { isRevoked: true, revokedAt: now, revokedReason: 'PASSWORD_CHANGE_REVOCATION' },
      });
    });

    await this.recordAuditLog(dbUser.email, 'PASSWORD_CHANGED_SUCCESSFULLY', dbUser.id, dbUser.schoolId, context);
    return { success: true, message: 'Password changed successfully' };
  }

  // Helper method for generating test tokens (including expired or custom)
  generateCustomToken(
    user: { id: string; email: string; role: UserRole; schoolId: string | null },
    expiresIn: string = '1h',
  ) {
    return this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
      },
      { expiresIn: expiresIn as any },
    );
  }
}
