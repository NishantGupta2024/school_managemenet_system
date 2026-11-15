import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateLibrarySettingDto } from '../dto/settings.dto';

@Injectable()
export class LibrarySettingsService {
  private readonly logger = new Logger(LibrarySettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves or lazily creates default library settings for a school.
   */
  async getOrCreateSettings(schoolId: string) {
    let settings = await this.prisma.librarySetting.findUnique({
      where: { schoolId },
    });

    if (!settings) {
      settings = await this.prisma.librarySetting.create({
        data: {
          schoolId,
          maxBooksStudent: 3,
          maxBooksTeacher: 10,
          loanDurationDaysStudent: 14,
          loanDurationDaysTeacher: 30,
          maxRenewals: 2,
          finePerDay: 2.0,
          gracePeriodDays: 2,
          allowRenewWithOverdue: false,
        },
      });
      this.logger.log(`Initialized default library settings for school ${schoolId}`);
    }

    return settings;
  }

  /**
   * Updates school library settings (policy).
   */
  async updateSettings(schoolId: string, dto: UpdateLibrarySettingDto) {
    // Ensure settings exist first
    await this.getOrCreateSettings(schoolId);

    const updated = await this.prisma.librarySetting.update({
      where: { schoolId },
      data: {
        ...(dto.maxBooksStudent !== undefined && { maxBooksStudent: dto.maxBooksStudent }),
        ...(dto.maxBooksTeacher !== undefined && { maxBooksTeacher: dto.maxBooksTeacher }),
        ...(dto.loanDurationDaysStudent !== undefined && {
          loanDurationDaysStudent: dto.loanDurationDaysStudent,
        }),
        ...(dto.loanDurationDaysTeacher !== undefined && {
          loanDurationDaysTeacher: dto.loanDurationDaysTeacher,
        }),
        ...(dto.maxRenewals !== undefined && { maxRenewals: dto.maxRenewals }),
        ...(dto.finePerDay !== undefined && { finePerDay: dto.finePerDay }),
        ...(dto.gracePeriodDays !== undefined && { gracePeriodDays: dto.gracePeriodDays }),
        ...(dto.allowRenewWithOverdue !== undefined && {
          allowRenewWithOverdue: dto.allowRenewWithOverdue,
        }),
      },
    });

    this.logger.log(`Updated library settings for school ${schoolId}`);
    return updated;
  }
}
