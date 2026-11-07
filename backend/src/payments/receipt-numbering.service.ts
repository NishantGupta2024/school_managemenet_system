import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AcademicYearFormat, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { UpdateReceiptNumberConfigDto } from './dto/update-receipt-number-config.dto';
import { ReceiptNumberConfigResponseDto } from './dto/receipt-number-config-response.dto';
import { PreviewReceiptNumberDto } from './dto/preview-receipt-number.dto';

export const DEFAULT_RECEIPT_CONFIG = {
  prefix: 'RCT',
  yearFormat: AcademicYearFormat.SHORT_6DIGIT,
  paddingDigits: 5,
  separator: '-',
};

@Injectable()
export class ReceiptNumberingService {
  private readonly logger = new Logger(ReceiptNumberingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  /**
   * Resolves trusted school ID from user session or tenant context.
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
      throw new BadRequestException('Tenant context missing: Valid school context must be established');
    }
    return targetSchoolId;
  }

  /**
   * Formats academic year token according to configured format.
   */
  public formatAcademicYearToken(academicYearName: string, format: AcademicYearFormat): string {
    if (format === AcademicYearFormat.NONE) {
      return '';
    }

    const trimmed = (academicYearName || '').trim();
    const standardMatch = trimmed.match(/^(\d{4})[-/](\d{4})$/);

    if (standardMatch) {
      if (format === AcademicYearFormat.SHORT_6DIGIT) {
        // "2026-2027" -> "202627"
        return `${standardMatch[1]}${standardMatch[2].slice(-2)}`;
      }
      if (format === AcademicYearFormat.FULL_8DIGIT) {
        // "2026-2027" -> "20262027"
        return `${standardMatch[1]}${standardMatch[2]}`;
      }
      if (format === AcademicYearFormat.START_YEAR_4DIGIT) {
        // "2026-2027" -> "2026"
        return standardMatch[1];
      }
    }

    const alphanumeric = trimmed.replace(/[^0-9A-Za-z]/g, '');
    return alphanumeric.length > 0 ? alphanumeric.slice(0, 8) : 'GEN';
  }

  /**
   * Formats a complete human-readable receipt number.
   */
  public formatReceiptNumber(params: {
    prefix: string;
    yearToken: string;
    sequenceNumber: number;
    paddingDigits: number;
    separator: string;
  }): string {
    const { prefix, yearToken, sequenceNumber, paddingDigits, separator } = params;
    const cleanPrefix = (prefix || DEFAULT_RECEIPT_CONFIG.prefix).trim().toUpperCase();
    const cleanToken = (yearToken || '').trim().toUpperCase();
    const paddedSeq = String(sequenceNumber).padStart(paddingDigits, '0');

    const parts = [cleanPrefix, cleanToken, paddedSeq].filter((p) => p.length > 0);
    return parts.join(separator);
  }

  /**
   * Fetches the active configuration for a school.
   * If table exists and row is not found, returns standard default values (isCustomized: false).
   * If database query encounters an unexpected error, throws InternalServerErrorException.
   */
  async getConfig(user: any, explicitSchoolId?: string): Promise<ReceiptNumberConfigResponseDto> {
    const schoolId = this.resolveSchoolContext(user, explicitSchoolId);

    // Verify school exists
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true },
    });
    if (!school) {
      throw new NotFoundException(`School ${schoolId} not found`);
    }

    try {
      const config = await this.prisma.schoolReceiptNumberConfig.findUnique({
        where: { schoolId },
      });

      if (!config) {
        // Table exists, query succeeded, but school has no customized row -> defaults
        const previewSample = this.formatReceiptNumber({
          prefix: DEFAULT_RECEIPT_CONFIG.prefix,
          yearToken: '202627',
          sequenceNumber: 1,
          paddingDigits: DEFAULT_RECEIPT_CONFIG.paddingDigits,
          separator: DEFAULT_RECEIPT_CONFIG.separator,
        });

        return {
          schoolId,
          prefix: DEFAULT_RECEIPT_CONFIG.prefix,
          yearFormat: DEFAULT_RECEIPT_CONFIG.yearFormat,
          paddingDigits: DEFAULT_RECEIPT_CONFIG.paddingDigits,
          separator: DEFAULT_RECEIPT_CONFIG.separator,
          previewSample,
          isCustomized: false,
        };
      }

      const yearToken = this.formatAcademicYearToken('2026-2027', config.yearFormat);
      const previewSample = this.formatReceiptNumber({
        prefix: config.prefix,
        yearToken,
        sequenceNumber: 1,
        paddingDigits: config.paddingDigits,
        separator: config.separator,
      });

      return {
        id: config.id,
        schoolId: config.schoolId,
        prefix: config.prefix,
        yearFormat: config.yearFormat,
        paddingDigits: config.paddingDigits,
        separator: config.separator,
        previewSample,
        isCustomized: true,
        updatedAt: config.updatedAt,
      };
    } catch (err: any) {
      // Do NOT silently fall back on unexpected query or schema errors
      this.logger.error(
        `Failed to retrieve receipt numbering config for school ${schoolId}: ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException(
        `Failed to retrieve receipt numbering configuration: ${err.message}`,
      );
    }
  }

  /**
   * Updates or creates the custom receipt numbering configuration for a school.
   * Enforces tenant-boundary checks and input validation.
   */
  async updateConfig(
    user: any,
    dto: UpdateReceiptNumberConfigDto,
    explicitSchoolId?: string,
  ): Promise<ReceiptNumberConfigResponseDto> {
    const schoolId = this.resolveSchoolContext(user, explicitSchoolId);

    // Verify school exists
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true },
    });
    if (!school) {
      throw new NotFoundException(`School ${schoolId} not found`);
    }

    try {
      const cleanPrefix = dto.prefix.trim().toUpperCase();

      const config = await this.prisma.schoolReceiptNumberConfig.upsert({
        where: { schoolId },
        create: {
          schoolId,
          prefix: cleanPrefix,
          yearFormat: dto.yearFormat,
          paddingDigits: dto.paddingDigits,
          separator: dto.separator,
        },
        update: {
          prefix: cleanPrefix,
          yearFormat: dto.yearFormat,
          paddingDigits: dto.paddingDigits,
          separator: dto.separator,
        },
      });

      const yearToken = this.formatAcademicYearToken('2026-2027', config.yearFormat);
      const previewSample = this.formatReceiptNumber({
        prefix: config.prefix,
        yearToken,
        sequenceNumber: 1,
        paddingDigits: config.paddingDigits,
        separator: config.separator,
      });

      this.logger.log(
        `Updated receipt numbering config for school ${schoolId} by user ${user?.id || 'SYSTEM'}: Prefix=${cleanPrefix}, Format=${dto.yearFormat}, Padding=${dto.paddingDigits}, Separator="${dto.separator}"`,
      );

      return {
        id: config.id,
        schoolId: config.schoolId,
        prefix: config.prefix,
        yearFormat: config.yearFormat,
        paddingDigits: config.paddingDigits,
        separator: config.separator,
        previewSample,
        isCustomized: true,
        updatedAt: config.updatedAt,
      };
    } catch (err: any) {
      this.logger.error(
        `Failed to update receipt numbering config for school ${schoolId}: ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException(
        `Failed to update receipt numbering configuration: ${err.message}`,
      );
    }
  }

  /**
   * Generates a live preview formatted string without modifying database state.
   */
  generatePreview(dto: PreviewReceiptNumberDto): { preview: string } {
    const yearToken = this.formatAcademicYearToken(
      dto.sampleYearName || '2026-2027',
      dto.yearFormat,
    );
    const preview = this.formatReceiptNumber({
      prefix: dto.prefix,
      yearToken,
      sequenceNumber: dto.sampleSequence || 1,
      paddingDigits: dto.paddingDigits,
      separator: dto.separator,
    });
    return { preview };
  }
}
