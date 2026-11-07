import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AcademicYearFormat, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';

export interface AllocateReceiptNumberOptions {
  academicYearId: string;
  user?: any;
  schoolId?: string;
  prefix?: string;
  yearFormat?: AcademicYearFormat;
  paddingDigits?: number;
  separator?: string;
  tx?: Prisma.TransactionClient;
}

export interface GetCurrentSequenceOptions {
  academicYearId: string;
  user?: any;
  schoolId?: string;
  tx?: Prisma.TransactionClient;
}

export interface AllocatedReceiptNumber {
  sequenceNumber: number;
  receiptNumber: string;
  prefix: string;
  yearToken: string;
  paddedSequence: string;
  separator: string;
  academicYearId: string;
  academicYearName: string;
  schoolId: string;
}

export interface SequenceCounterStatus {
  currentSequence: number;
  nextSequence: number;
  prefix: string;
  schoolId: string;
  academicYearId: string;
}

export interface FormatReceiptNumberParams {
  prefix: string;
  yearToken?: string;
  sequenceNumber: number;
  paddingDigits?: number;
  separator?: string;
}

@Injectable()
export class ReceiptSequenceService {
  private readonly logger = new Logger(ReceiptSequenceService.name);

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
        // Super Admin must specify target school context
        const targetSchoolId = explicitSchoolId || contextSchoolId;
        if (!targetSchoolId) {
          throw new BadRequestException(
            'Tenant specification required: Platform super admin must provide target school context',
          );
        }
        return targetSchoolId;
      }

      // Normal school staff/admin/student/parent:
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

    // Direct service invocation with server context
    const targetSchoolId = explicitSchoolId || contextSchoolId;
    if (!targetSchoolId) {
      throw new BadRequestException(
        'Tenant context missing: Valid school context must be established',
      );
    }

    return targetSchoolId;
  }

  /**
   * Resolves the school's configured receipt numbering options.
   * - If customized row exists, uses it.
   * - If query succeeds but row does not exist, uses standard defaults.
   * - If query encounters an unexpected database error, fails safely and clearly.
   */
  async resolveSchoolReceiptConfig(
    schoolId: string,
    db: Prisma.TransactionClient | PrismaService,
  ): Promise<{
    prefix: string;
    yearFormat: AcademicYearFormat;
    paddingDigits: number;
    separator: string;
  }> {
    try {
      const config = await (db as any).schoolReceiptNumberConfig?.findUnique({
        where: { schoolId },
      });

      if (config) {
        return {
          prefix: config.prefix,
          yearFormat: config.yearFormat,
          paddingDigits: config.paddingDigits,
          separator: config.separator,
        };
      }

      // Query succeeded, row does not exist -> standard defaults
      return {
        prefix: 'RCT',
        yearFormat: AcademicYearFormat.SHORT_6DIGIT,
        paddingDigits: 5,
        separator: '-',
      };
    } catch (err: any) {
      // Do NOT silently swallow unexpected database or query errors
      this.logger.error(
        `Database query error resolving receipt numbering configuration for school ${schoolId}: ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException(
        `Failed to resolve receipt numbering configuration: ${err.message}`,
      );
    }
  }

  /**
   * Formats a clean academic year token for the receipt string according to format enum.
   * e.g., "2026-2027" + SHORT_6DIGIT -> "202627"
   *       "2026-2027" + FULL_8DIGIT  -> "20262027"
   *       "2026-2027" + START_YEAR_4DIGIT -> "2026"
   *       "2026-2027" + NONE -> ""
   */
  public formatAcademicYearToken(
    academicYearName: string,
    format: AcademicYearFormat = AcademicYearFormat.SHORT_6DIGIT,
  ): string {
    if (format === AcademicYearFormat.NONE) {
      return '';
    }

    const trimmed = (academicYearName || '').trim();
    const standardMatch = trimmed.match(/^(\d{4})[-/](\d{4})$/);
    if (standardMatch) {
      if (format === AcademicYearFormat.SHORT_6DIGIT) {
        return `${standardMatch[1]}${standardMatch[2].slice(-2)}`;
      }
      if (format === AcademicYearFormat.FULL_8DIGIT) {
        return `${standardMatch[1]}${standardMatch[2]}`;
      }
      if (format === AcademicYearFormat.START_YEAR_4DIGIT) {
        return standardMatch[1];
      }
    }
    const alphanumeric = trimmed.replace(/[^0-9A-Za-z]/g, '');
    return alphanumeric.length > 0 ? alphanumeric.slice(0, 8) : 'GEN';
  }

  /**
   * Formats a complete human-readable receipt number.
   * Supports both object-parameter invocation and legacy (prefix, yearToken, sequenceNumber) invocation.
   */
  public formatReceiptNumber(
    paramsOrPrefix: FormatReceiptNumberParams | string,
    yearTokenArg?: string,
    sequenceNumberArg?: number,
  ): string {
    if (typeof paramsOrPrefix === 'object') {
      const cleanPrefix = (paramsOrPrefix.prefix || 'RCT').trim().toUpperCase();
      const cleanToken = (paramsOrPrefix.yearToken || '').trim().toUpperCase();
      const padding = paramsOrPrefix.paddingDigits ?? 5;
      const separator = paramsOrPrefix.separator !== undefined ? paramsOrPrefix.separator : '-';
      const paddedSeq = String(paramsOrPrefix.sequenceNumber).padStart(padding, '0');

      const parts = [cleanPrefix, cleanToken, paddedSeq].filter((p) => p.length > 0);
      return parts.join(separator);
    }

    // Backward-compatible overload: formatReceiptNumber(prefix, yearToken, sequenceNumber)
    const cleanPrefix = (paramsOrPrefix || 'RCT').trim().toUpperCase();
    const cleanToken = (yearTokenArg || '').trim().toUpperCase();
    const paddedSeq = String(sequenceNumberArg || 1).padStart(5, '0');
    const parts = [cleanPrefix, cleanToken, paddedSeq].filter((p) => p.length > 0);
    return parts.join('-');
  }

  /**
   * Allocates the next receipt sequence number atomically for a school and academic year.
   * Guarantees strict monotonicity, tenant isolation, and concurrency safety.
   * When yearFormat is NONE, guarantees cross-academic-year receiptNumber uniqueness.
   */
  async allocateNextReceiptNumber(
    options: AllocateReceiptNumberOptions,
  ): Promise<AllocatedReceiptNumber> {
    const { academicYearId, user, schoolId, prefix, yearFormat, paddingDigits, separator, tx } =
      options;
    const db = tx || this.prisma;

    if (!academicYearId) {
      throw new BadRequestException('Academic year ID is required for receipt sequencing');
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

    // 3. Resolve active configuration (options override school config, which overrides system defaults)
    const schoolConfig = await this.resolveSchoolReceiptConfig(effectiveSchoolId, db);
    const activePrefix = (prefix || schoolConfig.prefix || 'RCT').trim().toUpperCase();
    const activeYearFormat = yearFormat || schoolConfig.yearFormat || AcademicYearFormat.SHORT_6DIGIT;
    const activePadding = paddingDigits ?? schoolConfig.paddingDigits ?? 5;
    const activeSeparator = separator !== undefined ? separator : (schoolConfig.separator ?? '-');

    const yearToken = this.formatAcademicYearToken(academicYear.name, activeYearFormat);

    // 4. Concurrency-safe initialization:
    // If the counter does not exist for this (schoolId, academicYearId), calculate initial nextSequence.
    // If yearFormat is NONE, ensure sequence starts after all previously issued sequences in this school.
    let initialSequence = 1;
    if (activeYearFormat === AcademicYearFormat.NONE) {
      const maxReceipt = await db.receipt.aggregate({
        where: { schoolId: effectiveSchoolId },
        _max: { receiptSequence: true },
      });
      const maxExisting = maxReceipt._max.receiptSequence ?? 0;
      initialSequence = maxExisting + 1;
    }

    await db.$executeRaw`
      INSERT INTO "receipt_sequence_counters" (
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
        ${activePrefix},
        ${initialSequence},
        NOW()
      )
      ON CONFLICT ("schoolId", "academicYearId") DO NOTHING;
    `;

    // 5. Atomic Increment and Retrieve:
    // In PostgreSQL, UPDATE ... RETURNING takes an exclusive row-level lock on this specific counter row.
    const result = await db.$queryRaw<Array<{ allocatedSequence: number | bigint; prefix: string }>>`
      UPDATE "receipt_sequence_counters"
      SET "nextSequence" = "nextSequence" + 1,
          "prefix" = ${activePrefix},
          "updatedAt" = NOW()
      WHERE "schoolId" = ${effectiveSchoolId} AND "academicYearId" = ${academicYearId}
      RETURNING "nextSequence" - 1 AS "allocatedSequence", "prefix";
    `;

    if (!result || result.length === 0) {
      throw new Error(
        `Failed to allocate receipt sequence for school ${effectiveSchoolId} and academic year ${academicYearId}`,
      );
    }

    let allocatedSequence = Number(result[0].allocatedSequence);
    let paddedSequence = String(allocatedSequence).padStart(activePadding, '0');

    let receiptNumber = this.formatReceiptNumber({
      prefix: activePrefix,
      yearToken,
      sequenceNumber: allocatedSequence,
      paddingDigits: activePadding,
      separator: activeSeparator,
    });

    // 6. Safeguard: Guarantee cross-academic-year receiptNumber uniqueness when yearFormat is NONE
    if (activeYearFormat === AcademicYearFormat.NONE) {
      const existingCollision = await db.receipt.findFirst({
        where: {
          schoolId: effectiveSchoolId,
          receiptNumber,
        },
        select: { id: true, receiptSequence: true },
      });

      if (existingCollision) {
        // Find highest sequence across the school and advance counter past it
        const maxAgg = await db.receipt.aggregate({
          where: { schoolId: effectiveSchoolId },
          _max: { receiptSequence: true },
        });
        const safeSequence = (maxAgg._max.receiptSequence ?? allocatedSequence) + 1;

        await db.$executeRaw`
          UPDATE "receipt_sequence_counters"
          SET "nextSequence" = ${safeSequence + 1},
              "updatedAt" = NOW()
          WHERE "schoolId" = ${effectiveSchoolId} AND "academicYearId" = ${academicYearId};
        `;

        allocatedSequence = safeSequence;
        paddedSequence = String(allocatedSequence).padStart(activePadding, '0');
        receiptNumber = this.formatReceiptNumber({
          prefix: activePrefix,
          yearToken,
          sequenceNumber: allocatedSequence,
          paddingDigits: activePadding,
          separator: activeSeparator,
        });
      }
    }

    return {
      sequenceNumber: allocatedSequence,
      receiptNumber,
      prefix: activePrefix,
      yearToken,
      paddedSequence,
      separator: activeSeparator,
      academicYearId: academicYear.id,
      academicYearName: academicYear.name,
      schoolId: effectiveSchoolId,
    };
  }

  /**
   * Inspects the current sequence status without incrementing it.
   */
  async getCurrentSequence(
    options: GetCurrentSequenceOptions,
  ): Promise<SequenceCounterStatus> {
    const { academicYearId, user, schoolId, tx } = options;
    const db = tx || this.prisma;

    const effectiveSchoolId = this.resolveSchoolContext(user, schoolId);

    const counter = await db.receiptSequenceCounter.findUnique({
      where: {
        schoolId_academicYearId: {
          schoolId: effectiveSchoolId,
          academicYearId,
        },
      },
    });

    if (!counter) {
      return {
        currentSequence: 0,
        nextSequence: 1,
        prefix: 'RCT',
        schoolId: effectiveSchoolId,
        academicYearId,
      };
    }

    return {
      currentSequence: Math.max(0, counter.nextSequence - 1),
      nextSequence: counter.nextSequence,
      prefix: counter.prefix,
      schoolId: effectiveSchoolId,
      academicYearId,
    };
  }
}
