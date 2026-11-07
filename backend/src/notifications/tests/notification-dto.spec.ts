import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateSchoolNotificationSettingDto } from '../dto/update-school-notification-setting.dto';
import { QueryNotificationLogsDto } from '../dto/query-notification-logs.dto';
import { NotificationChannel, NotificationEventType, NotificationStatus } from '@prisma/client';

describe('Notification DTO Validation', () => {
  describe('UpdateSchoolNotificationSettingDto', () => {
    it('validates a correct payload', async () => {
      const dto = plainToInstance(UpdateSchoolNotificationSettingDto, {
        receiptEmailEnabled: true,
        paymentReversalEmailEnabled: false,
        refundSuccessEmailEnabled: true,
        refundFailureEmailEnabled: false,
        senderDisplayName: 'Acme School Billing',
        replyToEmail: 'billing@acme.edu',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects invalid email format for replyToEmail', async () => {
      const dto = plainToInstance(UpdateSchoolNotificationSettingDto, {
        replyToEmail: 'not-an-email',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('replyToEmail');
    });

    it('rejects overly long senderDisplayName (> 100 characters)', async () => {
      const dto = plainToInstance(UpdateSchoolNotificationSettingDto, {
        senderDisplayName: 'A'.repeat(101),
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('senderDisplayName');
    });

    it('rejects non-boolean flags', async () => {
      const dto = plainToInstance(UpdateSchoolNotificationSettingDto, {
        receiptEmailEnabled: 'true' as any,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('receiptEmailEnabled');
    });
  });

  describe('QueryNotificationLogsDto', () => {
    it('validates valid pagination and filter params', async () => {
      const dto = plainToInstance(QueryNotificationLogsDto, {
        page: 2,
        limit: 50,
        status: NotificationStatus.SENT,
        eventType: NotificationEventType.RECEIPT_ISSUED,
        channel: NotificationChannel.EMAIL,
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-31T23:59:59.000Z',
        search: 'sharma@example.com',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects page less than 1', async () => {
      const dto = plainToInstance(QueryNotificationLogsDto, {
        page: 0,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('page');
    });

    it('rejects limit greater than 100', async () => {
      const dto = plainToInstance(QueryNotificationLogsDto, {
        limit: 101,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('limit');
    });

    it('rejects invalid enum values', async () => {
      const dto = plainToInstance(QueryNotificationLogsDto, {
        status: 'INVALID_STATUS' as any,
        eventType: 'NON_EXISTENT_EVENT' as any,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThanOrEqual(2);
      const properties = errors.map((e) => e.property);
      expect(properties).toContain('status');
      expect(properties).toContain('eventType');
    });

    it('rejects non-date strings for startDate and endDate', async () => {
      const dto = plainToInstance(QueryNotificationLogsDto, {
        startDate: '2026-invalid-date',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('startDate');
    });
  });
});
