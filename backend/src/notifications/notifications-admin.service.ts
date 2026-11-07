import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSchoolNotificationSettingDto } from './dto/update-school-notification-setting.dto';
import { QueryNotificationLogsDto } from './dto/query-notification-logs.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class NotificationsAdminService {
  private readonly logger = new Logger(NotificationsAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieve notification settings for the specified school.
   * If not yet created, returns a standard default configuration object.
   * Defaults:
   * - Payments (receipts, reversals, refunds): true
   * - Student admission: true
   * - Examination schedule: true
   * - Examination results: true
   * - Attendance absence: false (opt-in)
   * - Fee reminders: false (opt-in)
   */
  async getSettings(schoolId: string) {
    const setting = await this.prisma.schoolNotificationSetting.findUnique({
      where: { schoolId },
    });

    if (!setting) {
      return {
        schoolId,
        receiptEmailEnabled: true,
        paymentReversalEmailEnabled: true,
        refundSuccessEmailEnabled: true,
        refundFailureEmailEnabled: true,
        feeReminderEmailEnabled: false,
        studentAdmissionEmailEnabled: true,
        attendanceAbsenceEmailEnabled: false,
        examScheduleEmailEnabled: true,
        examResultsEmailEnabled: true,
        senderDisplayName: null,
        replyToEmail: null,
        updatedAt: new Date(),
      };
    }

    return {
      id: setting.id,
      schoolId: setting.schoolId,
      receiptEmailEnabled: setting.receiptEmailEnabled,
      paymentReversalEmailEnabled: setting.paymentReversalEmailEnabled,
      refundSuccessEmailEnabled: setting.refundSuccessEmailEnabled,
      refundFailureEmailEnabled: setting.refundFailureEmailEnabled,
      feeReminderEmailEnabled: (setting as any).feeReminderEmailEnabled ?? false,
      studentAdmissionEmailEnabled: (setting as any).studentAdmissionEmailEnabled ?? true,
      attendanceAbsenceEmailEnabled: (setting as any).attendanceAbsenceEmailEnabled ?? false,
      examScheduleEmailEnabled: (setting as any).examScheduleEmailEnabled ?? true,
      examResultsEmailEnabled: (setting as any).examResultsEmailEnabled ?? true,
      senderDisplayName: setting.senderDisplayName,
      replyToEmail: setting.replyToEmail,
      updatedAt: setting.updatedAt,
    };
  }

  /**
   * Update notification settings for the specified school (idempotent upsert).
   */
  async updateSettings(schoolId: string, dto: UpdateSchoolNotificationSettingDto) {
    const updateData: Prisma.SchoolNotificationSettingUpdateInput = {};

    if (dto.receiptEmailEnabled !== undefined) {
      updateData.receiptEmailEnabled = dto.receiptEmailEnabled;
    }
    if (dto.paymentReversalEmailEnabled !== undefined) {
      updateData.paymentReversalEmailEnabled = dto.paymentReversalEmailEnabled;
    }
    if (dto.refundSuccessEmailEnabled !== undefined) {
      updateData.refundSuccessEmailEnabled = dto.refundSuccessEmailEnabled;
    }
    if (dto.refundFailureEmailEnabled !== undefined) {
      updateData.refundFailureEmailEnabled = dto.refundFailureEmailEnabled;
    }
    if (dto.feeReminderEmailEnabled !== undefined) {
      (updateData as any).feeReminderEmailEnabled = dto.feeReminderEmailEnabled;
    }
    if (dto.studentAdmissionEmailEnabled !== undefined) {
      (updateData as any).studentAdmissionEmailEnabled = dto.studentAdmissionEmailEnabled;
    }
    if (dto.attendanceAbsenceEmailEnabled !== undefined) {
      (updateData as any).attendanceAbsenceEmailEnabled = dto.attendanceAbsenceEmailEnabled;
    }
    if (dto.examScheduleEmailEnabled !== undefined) {
      (updateData as any).examScheduleEmailEnabled = dto.examScheduleEmailEnabled;
    }
    if (dto.examResultsEmailEnabled !== undefined) {
      (updateData as any).examResultsEmailEnabled = dto.examResultsEmailEnabled;
    }
    if (dto.senderDisplayName !== undefined) {
      updateData.senderDisplayName = dto.senderDisplayName?.trim() || null;
    }
    if (dto.replyToEmail !== undefined) {
      updateData.replyToEmail = dto.replyToEmail?.trim() || null;
    }

    const updated = await this.prisma.schoolNotificationSetting.upsert({
      where: { schoolId },
      create: {
        schoolId,
        receiptEmailEnabled: dto.receiptEmailEnabled ?? true,
        paymentReversalEmailEnabled: dto.paymentReversalEmailEnabled ?? true,
        refundSuccessEmailEnabled: dto.refundSuccessEmailEnabled ?? true,
        refundFailureEmailEnabled: dto.refundFailureEmailEnabled ?? true,
        feeReminderEmailEnabled: dto.feeReminderEmailEnabled ?? false,
        studentAdmissionEmailEnabled: dto.studentAdmissionEmailEnabled ?? true,
        attendanceAbsenceEmailEnabled: dto.attendanceAbsenceEmailEnabled ?? false,
        examScheduleEmailEnabled: dto.examScheduleEmailEnabled ?? true,
        examResultsEmailEnabled: dto.examResultsEmailEnabled ?? true,
        senderDisplayName: dto.senderDisplayName?.trim() || null,
        replyToEmail: dto.replyToEmail?.trim() || null,
      },
      update: updateData,
    });

    return {
      id: updated.id,
      schoolId: updated.schoolId,
      receiptEmailEnabled: updated.receiptEmailEnabled,
      paymentReversalEmailEnabled: updated.paymentReversalEmailEnabled,
      refundSuccessEmailEnabled: updated.refundSuccessEmailEnabled,
      refundFailureEmailEnabled: updated.refundFailureEmailEnabled,
      feeReminderEmailEnabled: (updated as any).feeReminderEmailEnabled ?? false,
      studentAdmissionEmailEnabled: (updated as any).studentAdmissionEmailEnabled ?? true,
      attendanceAbsenceEmailEnabled: (updated as any).attendanceAbsenceEmailEnabled ?? false,
      examScheduleEmailEnabled: (updated as any).examScheduleEmailEnabled ?? true,
      examResultsEmailEnabled: (updated as any).examResultsEmailEnabled ?? true,
      senderDisplayName: updated.senderDisplayName,
      replyToEmail: updated.replyToEmail,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Retrieve paginated notification logs strictly scoped to schoolId.
   */
  async findLogs(schoolId: string, query: QueryNotificationLogsDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationOutboxWhereInput = {
      schoolId,
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.eventType) {
      where.eventType = query.eventType;
    }
    if (query.channel) {
      where.channel = query.channel;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { recipientEmail: { contains: term, mode: 'insensitive' } },
        { recipientName: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, records] = await Promise.all([
      this.prisma.notificationOutbox.count({ where }),
      this.prisma.notificationOutbox.findMany({
        where,
        select: {
          id: true,
          channel: true,
          eventType: true,
          recipientEmail: true,
          recipientName: true,
          status: true,
          templateKey: true,
          attemptCount: true,
          sentAt: true,
          createdAt: true,
          lastErrorCode: true,
          lastErrorMessage: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const sanitizedRecords = records.map((record) => ({
      ...record,
      lastErrorMessage: this.sanitizeErrorMessage(record.lastErrorMessage),
    }));

    return {
      data: sanitizedRecords,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find detailed notification outbox log by id and schoolId.
   */
  async findLogById(schoolId: string, id: string) {
    const record = await this.prisma.notificationOutbox.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id,
        },
      },
      include: {
        deliveryAttempts: {
          select: {
            id: true,
            attemptNumber: true,
            startedAt: true,
            completedAt: true,
            outcome: true,
            errorCode: true,
            errorMessage: true,
            retryScheduled: true,
          },
          orderBy: { attemptNumber: 'asc' },
        },
      },
    });

    if (!record) {
      throw new NotFoundException(`Notification log not found`);
    }

    return {
      id: record.id,
      schoolId: record.schoolId,
      channel: record.channel,
      eventType: record.eventType,
      recipientEmail: record.recipientEmail,
      recipientName: record.recipientName,
      status: record.status,
      templateKey: record.templateKey,
      templateData: record.templateData,
      attemptCount: record.attemptCount,
      nextAttemptAt: record.nextAttemptAt,
      lastAttemptAt: record.lastAttemptAt,
      sentAt: record.sentAt,
      skippedAt: record.skippedAt,
      skipReason: record.skipReason,
      lastErrorCode: record.lastErrorCode,
      lastErrorMessage: this.sanitizeErrorMessage(record.lastErrorMessage),
      providerMessageId: record.providerMessageId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deliveryAttempts: record.deliveryAttempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        outcome: attempt.outcome,
        errorCode: attempt.errorCode,
        errorMessage: this.sanitizeErrorMessage(attempt.errorMessage),
        retryScheduled: attempt.retryScheduled,
      })),
    };
  }

  /**
   * Sanitizes error message to prevent exposure of passwords, internal tokens, or stack traces.
   */
  private sanitizeErrorMessage(msg?: string | null): string | null {
    if (!msg) {
      return null;
    }

    // Mask passwords or tokens if present
    let sanitized = msg.replace(/(password|pass|token|secret)\s*[:=]\s*[^\s,;]+/gi, (_match, group1) => {
      return `${group1}: [REDACTED]`;
    });
    // Truncate overly long error traces
    if (sanitized.length > 500) {
      sanitized = sanitized.substring(0, 497) + '...';
    }
    return sanitized;
  }
}
