import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma, TenantStatus, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SmtpEmailProvider } from '../notifications/email/smtp-email.provider';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { UpdateSchoolStatusDto } from './dto/update-school-status.dto';
import { ListSchoolsDto } from './dto/list-schools.dto';
import { ProvisionSchoolAdminDto } from './dto/provision-school-admin.dto';
import { ListSchoolAdminsDto } from './dto/list-school-admins.dto';
import { SuspendSchoolAdminDto } from './dto/suspend-school-admin.dto';
import { ActivateSchoolAdminDto } from './dto/activate-school-admin.dto';
import { CreateSchoolAdminDto } from './dto/create-school-admin.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SAFE_SCHOOL_SELECT = {
  id: true,
  code: true,
  name: true,
  address: true,
  city: true,
  state: true,
  country: true,
  currency: true,
  timezone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const SAFE_ADMIN_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  lastLoginAt: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
  school: {
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
    },
  },
} as const;

@Injectable()
export class SchoolsService {
  private readonly logger = new Logger(SchoolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailProvider: SmtpEmailProvider,
  ) {}

  /**
   * Creates a new school tenant.
   * Enforces code uniqueness and initializes status as ACTIVE.
   */
  async create(dto: CreateSchoolDto) {
    const existing = await this.prisma.school.findUnique({
      where: { code: dto.code },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(`School with code '${dto.code}' already exists`);
    }

    return this.prisma.school.create({
      data: {
        id: crypto.randomUUID(),
        code: dto.code,
        name: dto.name,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        state: dto.state?.trim() || null,
        country: dto.country || 'IN',
        currency: dto.currency || 'INR',
        timezone: dto.timezone || 'Asia/Kolkata',
        status: TenantStatus.ACTIVE,
      },
      select: SAFE_SCHOOL_SELECT,
    });
  }

  /**
   * Lists schools with pagination, search, and status filtering.
   * Returns school records along with summary entity counts.
   */
  async findAll(query: ListSchoolsDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.SchoolWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { code: { contains: term, mode: 'insensitive' } },
        { city: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.school.count({ where }),
      this.prisma.school.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          address: true,
          city: true,
          state: true,
          country: true,
          currency: true,
          timezone: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              users: true,
              students: true,
              invoices: true,
              payments: true,
            },
          },
          users: {
            where: { role: UserRole.SCHOOL_ADMIN },
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
            },
            take: 1,
          },
        },
      }),
    ]);

    const enrichedData = data.map((school) => {
      const admin = school.users && school.users.length > 0 ? school.users[0] : null;
      return {
        ...school,
        hasAdmin: Boolean(admin),
        admin,
      };
    });

    return {
      data: enrichedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single school details with full domain summary counts.
   */
  async findOne(id: string) {
    if (!id || !UUID_REGEX.test(id)) {
      throw new BadRequestException('Malformed school ID: Must be a valid UUID');
    }

    const school = await this.prisma.school.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        address: true,
        city: true,
        state: true,
        country: true,
        currency: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            students: true,
            invoices: true,
            payments: true,
            grades: true,
            academicYears: true,
            feeStructures: true,
          },
        },
      },
    });

    if (!school) {
      throw new NotFoundException(`School with ID '${id}' not found`);
    }

    return school;
  }

  /**
   * Updates allowlisted school profile and configuration fields.
   * Protected fields (id, code, status, createdAt) cannot be modified here.
   */
  async update(id: string, dto: UpdateSchoolDto) {
    if (!id || !UUID_REGEX.test(id)) {
      throw new BadRequestException('Malformed school ID: Must be a valid UUID');
    }

    const school = await this.prisma.school.findUnique({
      where: { id },
      select: SAFE_SCHOOL_SELECT,
    });

    if (!school) {
      throw new NotFoundException(`School with ID '${id}' not found`);
    }

    return this.prisma.school.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
      },
      select: SAFE_SCHOOL_SELECT,
    });
  }

  /**
   * Updates school lifecycle status (ACTIVE, INACTIVE, SUSPENDED).
   * All historical invoices, payments, receipts, and allocations remain strictly preserved.
   */
  async updateStatus(id: string, dto: UpdateSchoolStatusDto) {
    if (!id || !UUID_REGEX.test(id)) {
      throw new BadRequestException('Malformed school ID: Must be a valid UUID');
    }

    const school = await this.prisma.school.findUnique({
      where: { id },
      select: SAFE_SCHOOL_SELECT,
    });

    if (!school) {
      throw new NotFoundException(`School with ID '${id}' not found`);
    }

    return this.prisma.school.update({
      where: { id },
      data: { status: dto.status },
      select: SAFE_SCHOOL_SELECT,
    });
  }

  /**
   * Provisions the initial School Admin for an eligible school.
   * Strictly restricted to Platform Super Admin.
   * Validates uniqueness, prevents duplicate administrators, hashes password,
   * and binds the user record directly to the school tenant.
   */
  async provisionInitialAdmin(id: string, dto: ProvisionSchoolAdminDto) {
    if (!id || !UUID_REGEX.test(id)) {
      throw new BadRequestException('Malformed school ID: Must be a valid UUID');
    }

    const school = await this.prisma.school.findUnique({
      where: { id },
      select: SAFE_SCHOOL_SELECT,
    });

    if (!school) {
      throw new NotFoundException(`School with ID '${id}' not found`);
    }

    if (school.status !== TenantStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot provision administrator for school in '${school.status}' status. School must be ACTIVE.`,
      );
    }

    // Check if an administrator already exists for this school
    const existingAdmin = await this.prisma.user.findFirst({
      where: {
        schoolId: id,
        role: UserRole.SCHOOL_ADMIN,
      },
    });

    if (existingAdmin) {
      throw new ConflictException(
        `School '${school.name}' already has an administrator provisioned (${existingAdmin.email}). Use account management to manage credentials.`,
      );
    }

    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check if email is already taken in this school
    const existingUser = await this.prisma.user.findFirst({
      where: {
        schoolId: id,
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      throw new ConflictException(
        `An account with email '${normalizedEmail}' already exists in this school`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: UserRole.SCHOOL_ADMIN,
        schoolId: id,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        schoolId: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: 'Initial School Administrator successfully provisioned',
      user,
    };
  }

  /**
   * Helper: Hash token using SHA-256 for secure database lookup
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  }

  /**
   * Helper: Record security event in auth_audit_logs safely
   */
  private async recordAuditLog(
    email: string,
    eventType: string,
    userId?: string | null,
    schoolId?: string | null,
    actorId?: string | null,
    details?: any,
  ): Promise<void> {
    try {
      await this.prisma.authAuditLog.create({
        data: {
          email,
          eventType,
          userId: userId || null,
          schoolId: schoolId || null,
          details: details ? { ...details, actorId: actorId || 'SUPER_ADMIN' } : { actorId: actorId || 'SUPER_ADMIN' },
        },
      });
    } catch {
      this.logger.log(`[AUDIT] ${eventType} for ${email} by ${actorId || 'SUPER_ADMIN'}`);
    }
  }

  /**
   * Lists school administrator accounts platform-wide with pagination, search, and filtering.
   * Strictly restricted to Platform Super Admin. Never selects password hashes or secrets.
   */
  async findAllAdmins(query: ListSchoolAdminsDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: query.role || UserRole.SCHOOL_ADMIN,
    };

    if (query.schoolId) {
      where.schoolId = query.schoolId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { school: { name: { contains: term, mode: 'insensitive' } } },
        { school: { code: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: SAFE_ADMIN_SELECT,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single administrator profile with school details and recent audit history.
   */
  async findAdminProfile(adminId: string) {
    if (!adminId || !UUID_REGEX.test(adminId)) {
      throw new BadRequestException('Malformed administrator ID: Must be a valid UUID');
    }

    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: SAFE_ADMIN_SELECT,
    });

    if (!admin) {
      throw new NotFoundException(`Administrator with ID '${adminId}' not found`);
    }

    // Retrieve recent security and account audit events
    const auditLogs = await this.prisma.authAuditLog.findMany({
      where: {
        OR: [
          { userId: adminId },
          { email: admin.email },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true,
        eventType: true,
        details: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
      },
    });

    return {
      ...admin,
      auditHistory: auditLogs,
    };
  }

  /**
   * Provisions an additional School Administrator for a registered school.
   * Enables multiple administrators per school.
   */
  async createAdminForSchool(schoolId: string, dto: CreateSchoolAdminDto, actorId: string) {
    if (!schoolId || !UUID_REGEX.test(schoolId)) {
      throw new BadRequestException('Malformed school ID: Must be a valid UUID');
    }

    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: SAFE_SCHOOL_SELECT,
    });

    if (!school) {
      throw new NotFoundException(`School with ID '${schoolId}' not found`);
    }

    if (school.status !== TenantStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot add administrator for school in '${school.status}' status. School must be ACTIVE.`,
      );
    }

    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check if email already taken in this school
    const existing = await this.prisma.user.findFirst({
      where: {
        schoolId,
        email: normalizedEmail,
      },
    });

    if (existing) {
      throw new ConflictException(
        `An account with email '${normalizedEmail}' already exists in school '${school.name}'`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: UserRole.SCHOOL_ADMIN,
        schoolId,
        status: UserStatus.ACTIVE,
      },
      select: SAFE_ADMIN_SELECT,
    });

    await this.recordAuditLog(
      user.email,
      'ADMIN_ACCOUNT_CREATED',
      user.id,
      schoolId,
      actorId,
      { schoolName: school.name },
    );

    return {
      message: 'School Administrator account successfully created',
      user,
    };
  }

  /**
   * Suspends a School Administrator account.
   * Enforces status change to INACTIVE, immediately revokes all active sessions in user_sessions,
   * records mandatory reason in audit log.
   */
  async suspendAdmin(adminId: string, dto: SuspendSchoolAdminDto, actorId: string) {
    if (!adminId || !UUID_REGEX.test(adminId)) {
      throw new BadRequestException('Malformed administrator ID: Must be a valid UUID');
    }

    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: SAFE_ADMIN_SELECT,
    });

    if (!admin) {
      throw new NotFoundException(`Administrator with ID '${adminId}' not found`);
    }

    if (admin.role === UserRole.PLATFORM_SUPER_ADMIN) {
      throw new BadRequestException('Cannot suspend a Platform Super Admin account through this endpoint');
    }

    if (admin.status === UserStatus.INACTIVE) {
      throw new BadRequestException('Administrator account is already suspended');
    }

    const now = new Date();

    // Atomic update status and revoke all sessions
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: adminId },
        data: {
          status: UserStatus.INACTIVE,
        },
        select: SAFE_ADMIN_SELECT,
      });

      // Invalidate all active sessions for this user immediately
      await tx.userSession.updateMany({
        where: { userId: adminId, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: now,
          revokedReason: `SUPER_ADMIN_SUSPENDED: ${dto.reason}`,
        },
      });

      return user;
    });

    await this.recordAuditLog(
      admin.email,
      'ADMIN_SUSPENDED',
      admin.id,
      admin.school?.id || null,
      actorId,
      { reason: dto.reason },
    );

    return {
      message: 'Administrator account suspended successfully. All active sessions have been revoked.',
      user: updated,
    };
  }

  /**
   * Activates/Restores a suspended School Administrator account.
   * Restores status to ACTIVE and clears any temporary lockout counters.
   */
  async activateAdmin(adminId: string, dto: ActivateSchoolAdminDto, actorId: string) {
    if (!adminId || !UUID_REGEX.test(adminId)) {
      throw new BadRequestException('Malformed administrator ID: Must be a valid UUID');
    }

    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: SAFE_ADMIN_SELECT,
    });

    if (!admin) {
      throw new NotFoundException(`Administrator with ID '${adminId}' not found`);
    }

    if (admin.status === UserStatus.ACTIVE) {
      throw new BadRequestException('Administrator account is already active');
    }

    const updated = await this.prisma.user.update({
      where: { id: adminId },
      data: {
        status: UserStatus.ACTIVE,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      select: SAFE_ADMIN_SELECT,
    });

    await this.recordAuditLog(
      admin.email,
      'ADMIN_ACTIVATED',
      admin.id,
      admin.school?.id || null,
      actorId,
      { reason: dto.reason || 'Restored by Super Admin' },
    );

    return {
      message: 'Administrator account activated successfully',
      user: updated,
    };
  }

  /**
   * Initiates a secure password reset for a School Administrator.
   * Generates a 32-byte cryptographic token, stores SHA-256 hash, dispatches reset email,
   * and NEVER returns the token or hash to the Super Admin or in the API response.
   */
  async initiatePasswordReset(adminId: string, actorId: string) {
    if (!adminId || !UUID_REGEX.test(adminId)) {
      throw new BadRequestException('Malformed administrator ID: Must be a valid UUID');
    }

    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: SAFE_ADMIN_SELECT,
    });

    if (!admin) {
      throw new NotFoundException(`Administrator with ID '${adminId}' not found`);
    }

    if (admin.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Cannot initiate password reset for an inactive or suspended account');
    }

    const now = new Date();
    // 1. Invalidate any existing unused reset tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: adminId, usedAt: null },
      data: { usedAt: now },
    });

    // 2. Generate high-entropy 32-byte token and hash it
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawResetToken);
    const expiresAt = new Date(now.getTime() + 30 * 60000); // 30 minutes TTL

    await this.prisma.passwordResetToken.create({
      data: {
        id: crypto.randomUUID(),
        userId: adminId,
        tokenHash,
        expiresAt,
      },
    });

    // 3. Dispatch secure password reset email
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/reset-password?token=${rawResetToken}`;

    try {
      await this.emailProvider.sendEmail({
        to: admin.email,
        subject: `Password Reset Request | ${admin.school?.name || 'CYMBIX ERP'}`,
        htmlBody: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #1e293b;">Password Reset Initiated</h2>
            <p>Hello ${admin.name},</p>
            <p>A password reset has been initiated for your School Administrator account for <strong>${admin.school?.name || 'CYMBIX ERP'}</strong> by the Platform Super Admin.</p>
            <p>Please click the button below to establish a new password. This link is single-use and will expire in 30 minutes.</p>
            <p style="margin: 24px 0;">
              <a href="${resetLink}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset My Password</a>
            </p>
            <p style="color: #64748b; font-size: 13px;">If you did not expect this request, please contact your Platform Super Administrator immediately.</p>
          </div>
        `,
        textBody: `Hello ${admin.name},\n\nA password reset was initiated for your School Administrator account (${admin.school?.name || 'CYMBIX ERP'}).\n\nPlease visit the link below within 30 minutes to reset your password:\n${resetLink}\n`,
      });
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch reset email to ${admin.email}: ${err?.message}`);
    }

    // 4. Record privileged audit log
    await this.recordAuditLog(
      admin.email,
      'ADMIN_PASSWORD_RESET_INITIATED',
      admin.id,
      admin.school?.id || null,
      actorId,
    );

    return {
      success: true,
      message: `Password reset link has been dispatched to the administrator's registered email (${admin.email})`,
    };
  }
}
