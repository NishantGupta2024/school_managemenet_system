import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsAdminService } from '../notifications-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { NotificationStatus, NotificationEventType, NotificationChannel } from '@prisma/client';

describe('NotificationsAdminService', () => {
  let service: NotificationsAdminService;
  let prisma: {
    schoolNotificationSetting: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
    notificationOutbox: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  const schoolA = '00000000-0000-0000-0000-000000000001';
  const schoolB = '00000000-0000-0000-0000-000000000002';

  beforeEach(async () => {
    prisma = {
      schoolNotificationSetting: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      notificationOutbox: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsAdminService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<NotificationsAdminService>(NotificationsAdminService);
  });

  describe('getSettings', () => {
    it('returns default notification settings when no record exists for school', async () => {
      prisma.schoolNotificationSetting.findUnique.mockResolvedValue(null);

      const result = await service.getSettings(schoolA);

      expect(prisma.schoolNotificationSetting.findUnique).toHaveBeenCalledWith({
        where: { schoolId: schoolA },
      });
      expect(result).toMatchObject({
        schoolId: schoolA,
        receiptEmailEnabled: true,
        paymentReversalEmailEnabled: true,
        refundSuccessEmailEnabled: true,
        refundFailureEmailEnabled: true,
        senderDisplayName: null,
        replyToEmail: null,
      });
    });

    it('returns stored notification settings when record exists', async () => {
      const stored = {
        id: 'setting-1',
        schoolId: schoolA,
        receiptEmailEnabled: false,
        paymentReversalEmailEnabled: true,
        refundSuccessEmailEnabled: true,
        refundFailureEmailEnabled: false,
        feeReminderEmailEnabled: false,
        studentAdmissionEmailEnabled: true,
        attendanceAbsenceEmailEnabled: false,
        examScheduleEmailEnabled: true,
        examResultsEmailEnabled: true,
        senderDisplayName: 'Acme Academy',
        replyToEmail: 'billing@acme.edu',
        updatedAt: new Date('2026-11-01T10:00:00Z'),
      };
      prisma.schoolNotificationSetting.findUnique.mockResolvedValue(stored);

      const result = await service.getSettings(schoolA);

      expect(result).toEqual(stored);
    });
  });

  describe('updateSettings', () => {
    it('upserts notification settings for the given schoolId', async () => {
      const updated = {
        id: 'setting-1',
        schoolId: schoolA,
        receiptEmailEnabled: true,
        paymentReversalEmailEnabled: false,
        refundSuccessEmailEnabled: true,
        refundFailureEmailEnabled: true,
        feeReminderEmailEnabled: false,
        studentAdmissionEmailEnabled: true,
        attendanceAbsenceEmailEnabled: false,
        examScheduleEmailEnabled: true,
        examResultsEmailEnabled: true,
        senderDisplayName: 'New Name',
        replyToEmail: 'new@example.com',
        updatedAt: new Date('2026-11-01T11:00:00Z'),
      };
      prisma.schoolNotificationSetting.upsert.mockResolvedValue(updated);

      const result = await service.updateSettings(schoolA, {
        paymentReversalEmailEnabled: false,
        senderDisplayName: '  New Name  ',
        replyToEmail: '  new@example.com  ',
      });

      expect(prisma.schoolNotificationSetting.upsert).toHaveBeenCalledWith({
        where: { schoolId: schoolA },
        create: {
          schoolId: schoolA,
          receiptEmailEnabled: true,
          paymentReversalEmailEnabled: false,
          refundSuccessEmailEnabled: true,
          refundFailureEmailEnabled: true,
          feeReminderEmailEnabled: false,
          studentAdmissionEmailEnabled: true,
          attendanceAbsenceEmailEnabled: false,
          examScheduleEmailEnabled: true,
          examResultsEmailEnabled: true,
          senderDisplayName: 'New Name',
          replyToEmail: 'new@example.com',
        },
        update: {
          paymentReversalEmailEnabled: false,
          senderDisplayName: 'New Name',
          replyToEmail: 'new@example.com',
        },
      });
      expect(result).toEqual(updated);
    });
  });

  describe('findLogs', () => {
    it('scopes findMany and count queries strictly to schoolId', async () => {
      prisma.notificationOutbox.count.mockResolvedValue(1);
      prisma.notificationOutbox.findMany.mockResolvedValue([
        {
          id: 'outbox-1',
          channel: NotificationChannel.EMAIL,
          eventType: NotificationEventType.RECEIPT_ISSUED,
          recipientEmail: 'parent@example.com',
          recipientName: 'Parent One',
          status: NotificationStatus.SENT,
          templateKey: 'RECEIPT_ISSUED_EMAIL',
          attemptCount: 1,
          sentAt: new Date(),
          createdAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: 'Error with password=supersecret exposed in log',
        },
      ]);

      const result = await service.findLogs(schoolA, {
        page: 1,
        limit: 10,
        status: NotificationStatus.SENT,
      });

      expect(prisma.notificationOutbox.count).toHaveBeenCalledWith({
        where: {
          schoolId: schoolA,
          status: NotificationStatus.SENT,
        },
      });
      expect(prisma.notificationOutbox.findMany).toHaveBeenCalledWith({
        where: {
          schoolId: schoolA,
          status: NotificationStatus.SENT,
        },
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      // Sensitive data masking check: password pattern must be redacted
      expect(result.data[0].lastErrorMessage).toContain('password: [REDACTED]');
      expect(result.data[0].lastErrorMessage).not.toContain('supersecret');
    });

    it('enforces search filter on recipient email or name', async () => {
      prisma.notificationOutbox.count.mockResolvedValue(0);
      prisma.notificationOutbox.findMany.mockResolvedValue([]);

      await service.findLogs(schoolA, {
        search: 'sharma',
      });

      expect(prisma.notificationOutbox.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            schoolId: schoolA,
            OR: [
              { recipientEmail: { contains: 'sharma', mode: 'insensitive' } },
              { recipientName: { contains: 'sharma', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });
  });

  describe('findLogById', () => {
    it('returns log details with delivery attempts and masked error messages', async () => {
      const mockRecord = {
        id: 'outbox-1',
        schoolId: schoolA,
        channel: NotificationChannel.EMAIL,
        eventType: NotificationEventType.RECEIPT_ISSUED,
        recipientEmail: 'parent@example.com',
        recipientName: 'Parent One',
        status: NotificationStatus.FAILED,
        templateKey: 'RECEIPT_ISSUED_EMAIL',
        templateData: { receiptNumber: 'REC-001' },
        attemptCount: 2,
        nextAttemptAt: null,
        lastAttemptAt: new Date(),
        sentAt: null,
        skippedAt: null,
        skipReason: null,
        lastErrorCode: 'SMTP_TIMEOUT',
        lastErrorMessage: 'Host failed with secret=xyz123',
        providerMessageId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveryAttempts: [
          {
            id: 'attempt-1',
            attemptNumber: 1,
            startedAt: new Date(),
            completedAt: new Date(),
            outcome: 'FAILED',
            errorCode: 'AUTH_FAILED',
            errorMessage: 'token=bearersecret123 failed',
            retryScheduled: true,
          },
        ],
      };

      prisma.notificationOutbox.findUnique.mockResolvedValue(mockRecord);

      const result = await service.findLogById(schoolA, 'outbox-1');

      expect(prisma.notificationOutbox.findUnique).toHaveBeenCalledWith({
        where: {
          schoolId_id: {
            schoolId: schoolA,
            id: 'outbox-1',
          },
        },
        include: expect.any(Object),
      });

      expect(result.lastErrorMessage).toContain('secret: [REDACTED]');
      expect(result.deliveryAttempts[0].errorMessage).toContain('token: [REDACTED]');
    });

    it('throws NotFoundException when log belongs to another school or does not exist', async () => {
      prisma.notificationOutbox.findUnique.mockResolvedValue(null);

      await expect(service.findLogById(schoolA, 'foreign-log-id')).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.notificationOutbox.findUnique).toHaveBeenCalledWith({
        where: {
          schoolId_id: {
            schoolId: schoolA,
            id: 'foreign-log-id',
          },
        },
        include: expect.any(Object),
      });
    });
  });
});
