import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';

export interface AllocateReversalNumberOptions {
  academicYearId: string;
  user?: any;
  schoolId?: string;
  prefix?: string;
  tx?: Prisma.TransactionClient;
}

export interface AllocatedReversalNumber {
  sequenceNumber: number;
  reversalNumber: string;
  prefix: string;
  academicYearId: string;
  academicYearName: string;
  schoolId: string;
}

@Injectable()
export class ReversalSequenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  /**
   * Resolves the authoritative school ID from user session or server context.
   * Cross-tenant overrides by normal users are strictly forbidden.
   */
  public resolveSchoolContext(user?: any, explicitSchoolId?: string): string {
    const contextSchoolId = this.tenantContextService.getSchoolId();

    if (user) {
      if (user.role === UserRole.PLATFORM_SUPER_ADMIN) {
        const targetSchoolId = explicitSchoolId || contextSchoolId;
        if (!targetSchoolId) {
          throw new BadRequestException(
            'Tenant specification required: Platform super admin must provide target school context',
          );
        }
        return targetSchoolId;
      }

      if (!user.schoolId) {
        throw new ForbiddenException('User is not associated with any active school');
      }

      if (explicitSchoolId && explicitSchoolId !== user.schoolId) {
        throw new ForbiddenException(
          'Cross-tenant access forbidden: User membership does not match requested school',
        );
      }

      return user.schoolId;
    }

    const targetSchoolId = explicitSchoolId || contextSchoolId;
    if (!targetSchoolId) {
      throw new BadRequestException(
        'Tenant context missing: Valid school context must be established',
      );
    }

    return targetSchoolId;
  }

  /**
   * Formats a clean academic year token for the reversal string.
   * e.g., "2026-2027" -> "202627", "2026" -> "2026"
   */
  public formatAcademicYearToken(academicYearName: string): string {
    const trimmed = (academicYearName || '').trim();
    const standardMatch = trimmed.match(/^(\d{4})[-/](\d{4})$/);
    if (standardMatch) {
      return `${standardMatch[1]}${standardMatch[2].slice(-2)}`;
    }
    const alphanumeric = trimmed.replace(/[^0-9A-Za-z]/g, '');
    return alphanumeric.length > 0 ? alphanumeric.slice(0, 8) : 'GEN';
  }

  /**
   * Formats a complete human-readable reversal number.
   * Format: `${prefix}-${yearToken}-${paddedSequence}` e.g., "REV-202627-00001"
   */
  public formatReversalNumber(
    prefix: string,
    yearToken: string,
    sequenceNumber: number,
  ): string {
    const cleanPrefix = (prefix || 'REV').trim().toUpperCase();
    const cleanToken = yearToken.toUpperCase();
    const paddedSeq = String(sequenceNumber).padStart(5, '0');
    return `${cleanPrefix}-${cleanToken}-${paddedSeq}`;
  }

  /**
   * Allocates the next reversal sequence number atomically for a school and academic year.
   * Guarantees strict monotonicity, gapless sequencing, tenant isolation, and concurrency safety.
   * Compatible with external Prisma interactive transactions (passing `options.tx`).
   */
  async allocateNextReversalNumber(
    options: AllocateReversalNumberOptions,
  ): Promise<AllocatedReversalNumber> {
    const { academicYearId, user, schoolId, prefix, tx } = options;
    const db = tx || this.prisma;

    if (!academicYearId) {
      throw new BadRequestException('Academic year ID is required for reversal sequencing');
    }

    // 1. Resolve and validate trusted tenant context
    const effectiveSchoolId = this.resolveSchoolContext(user, schoolId);

    // 2. Validate that the target academic year exists and belongs to this school
    const academicYear = await db.academicYear.findUnique({
      where: {
        schoolId_id: {
          schoolId: effectiveSchoolId,
          id: academicYearId,
        },
      },
      select: {
        id: true,
        name: true,
        schoolId: true,
      },
    });

    if (!academicYear) {
      throw new NotFoundException(
        `Academic year ${academicYearId} not found in school ${effectiveSchoolId}`,
      );
    }

    const yearToken = this.formatAcademicYearToken(academicYear.name);
    const configuredPrefix = (prefix || 'REV').trim().toUpperCase();

    // 3. Concurrency-safe initialization:
    await db.$executeRaw`
      INSERT INTO "reversal_sequence_counters" (
        "id",
        "schoolId",
        "academicYearId",
        "prefix",
        "nextSequence",
        "updatedAt"
      )
      VALUES (
        gen_random_uuid()::text,
        ${effectiveSchoolId},
        ${academicYearId},
        ${configuredPrefix},
        1,
        NOW()
      )
      ON CONFLICT ("schoolId", "academicYearId") DO NOTHING;
    `;

    // 4. Atomic Increment and Retrieve:
    const result = await db.$queryRaw<Array<{ allocatedSequence: number | bigint; prefix: string }>>`
      UPDATE "reversal_sequence_counters"
      SET "nextSequence" = "nextSequence" + 1,
          "updatedAt" = NOW()
      WHERE "schoolId" = ${effectiveSchoolId} AND "academicYearId" = ${academicYearId}
      RETURNING "nextSequence" - 1 AS "allocatedSequence", "prefix";
    `;

    if (!result || result.length === 0) {
      throw new Error(
        `Failed to allocate reversal sequence for school ${effectiveSchoolId} and academic year ${academicYearId}`,
      );
    }

    const allocatedSequence = Number(result[0].allocatedSequence);
    const activePrefix = (result[0].prefix || configuredPrefix).trim().toUpperCase();
    const reversalNumber = this.formatReversalNumber(activePrefix, yearToken, allocatedSequence);

    return {
      sequenceNumber: allocatedSequence,
      reversalNumber,
      prefix: activePrefix,
      academicYearId: academicYear.id,
      academicYearName: academicYear.name,
      schoolId: effectiveSchoolId,
    };
  }
}
