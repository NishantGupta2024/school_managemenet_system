import { Test, TestingModule } from '@nestjs/testing';
import {
  NotificationChannel,
  NotificationEventType,
  NotificationOutbox,
  NotificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailConfigService } from '../email/email-config.service';
import { EmailProvider } from '../email/email-provider.interface';
import { EmailErrorCategory, EmailProviderError, EmailSendResult } from '../email/email.types';
import { MemoryEmailProvider } from '../email/memory-email.provider';
import { EmailTemplateRenderer } from '../templates/email-template.renderer';
import { NotificationOutboxWorker } from './notification-outbox.worker';

describe('NotificationOutboxWorker', () => {
  let worker: NotificationOutboxWorker;
  let prisma: PrismaService;
  let emailProvider: EmailProvider;
  let emailConfigService: EmailConfigService;
  let templateRenderer: EmailTemplateRenderer;

  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.NOTIFICATION_WORKER_ENABLED;
    delete process.env.NOTIFICATION_WORKER_BATCH_SIZE;
    delete process.env.NOTIFICATION_WORKER_INTERVAL_MS;
    delete process.env.NOTIFICATION_WORKER_LOCK_DURATION_MS;
    delete process.env.NOTIFICATION_MAX_ATTEMPTS;

    const mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => {
        return await cb(mockPrisma);
      }),
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      notificationOutbox: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      notificationDeliveryAttempt: {
        create: jest.fn(),
      },
      schoolNotificationSetting: {
        findUnique: jest.fn(),
      },
    };

    const mockEmailProvider: Partial<EmailProvider> = {
      sendEmail: jest.fn(),
      isDeliveryProvider: jest.fn().mockReturnValue(true),
      getProviderName: jest.fn().mockReturnValue('mock-provider'),
    };

    const mockEmailConfigService = {
      defaultFromName: 'EdFee Notifications',
      fromAddress: 'notifications@edfee.test',
      providerType: 'mock',
      validateReplyTo: jest.fn().mockImplementation((email: string) => email),
    };

    const mockTemplateRenderer = {
      render: jest.fn().mockReturnValue({
        subject: 'Test Subject',
        htmlBody: '<p>Test Html</p>',
        textBody: 'Test Text',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationOutboxWorker,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailProvider, useValue: mockEmailProvider },
        { provide: EmailConfigService, useValue: mockEmailConfigService },
        { provide: EmailTemplateRenderer, useValue: mockTemplateRenderer },
      ],
    }).compile();

    worker = module.get<NotificationOutboxWorker>(NotificationOutboxWorker);
    prisma = module.get<PrismaService>(PrismaService);
    emailProvider = module.get<EmailProvider>(EmailProvider);
    emailConfigService = module.get<EmailConfigService>(EmailConfigService);
    templateRenderer = module.get<EmailTemplateRenderer>(EmailTemplateRenderer);
  });

  afterEach(async () => {
    await worker.onApplicationShutdown();
    process.env = originalEnv;
  });

  const createSampleOutboxRecord = (overrides: Partial<NotificationOutbox> = {}): NotificationOutbox => ({
    id: 'outbox-1',
    schoolId: 'school-1',
    channel: NotificationChannel.EMAIL,
    eventType: NotificationEventType.RECEIPT_ISSUED,
    recipientEmail: 'parent@example.com',
    recipientName: 'Parent Doe',
    templateKey: 'RECEIPT_ISSUED',
    templateData: { receiptNumber: 'REC-001', studentName: 'Alex Doe', amountFormatted: '₹5,000' },
    idempotencyKey: 'idemp-1',
    status: NotificationStatus.PROCESSING,
    attemptCount: 1,
    nextAttemptAt: new Date(),
    lockedAt: new Date('2026-10-17T00:00:00.000Z'),
    lastAttemptAt: null,
    providerMessageId: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    sentAt: null,
    skipReason: null,
    skippedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Configuration & Lifecycle', () => {
    it('initializes with default settings', () => {
      expect(worker.isEnabled).toBe(true);
      expect(worker.batchSize).toBe(10);
      expect(worker.intervalMs).toBe(5000);
      expect(worker.lockDurationMs).toBe(300000);
      expect(worker.maxAttempts).toBe(5);
    });

    it('respects custom environment configuration', () => {
      process.env.NOTIFICATION_WORKER_ENABLED = 'false';
      process.env.NOTIFICATION_WORKER_BATCH_SIZE = '25';
      process.env.NOTIFICATION_WORKER_INTERVAL_MS = '2000';
      process.env.NOTIFICATION_WORKER_LOCK_DURATION_MS = '60000';
      process.env.NOTIFICATION_MAX_ATTEMPTS = '3';

      const customWorker = new NotificationOutboxWorker(
        prisma,
        emailProvider,
        emailConfigService,
        templateRenderer,
      );

      expect(customWorker.isEnabled).toBe(false);
      expect(customWorker.batchSize).toBe(25);
      expect(customWorker.intervalMs).toBe(2000);
      expect(customWorker.lockDurationMs).toBe(60000);
      expect(customWorker.maxAttempts).toBe(3);
    });

    it('does not schedule tick on bootstrap if disabled', () => {
      process.env.NOTIFICATION_WORKER_ENABLED = 'false';
      const disabledWorker = new NotificationOutboxWorker(
        prisma,
        emailProvider,
        emailConfigService,
        templateRenderer,
      );

      const spy = jest.spyOn(global, 'setTimeout');
      disabledWorker.onApplicationBootstrap();
      expect(spy).not.toHaveBeenCalled();
    });

    it('clears timer and waits for active batch on shutdown', async () => {
      let resolveBatch: any;
      const batchPromise = new Promise<any>((resolve) => {
        resolveBatch = resolve;
      });

      jest.spyOn(worker as any, 'claimBatch').mockImplementation(() => batchPromise);

      // Start a batch
      const runPromise = worker.processBatch();

      // Initiate shutdown while batch is active
      const shutdownPromise = worker.onApplicationShutdown();

      // Resolve the active batch
      resolveBatch([]);
      await runPromise;
      await shutdownPromise;

      expect((worker as any).isStopping).toBe(true);
      expect((worker as any).timer).toBeNull();
    });
  });

  describe('Batch Claiming (claimBatch)', () => {
    it('claims candidate records using FOR UPDATE SKIP LOCKED and advances status to PROCESSING', async () => {
      const mockCandidateRows = [{ id: 'outbox-1' }, { id: 'outbox-2' }];
      (prisma.$queryRaw as jest.Mock).mockResolvedValue(mockCandidateRows);
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(2);

      const sampleRecords = [
        createSampleOutboxRecord({ id: 'outbox-1' }),
        createSampleOutboxRecord({ id: 'outbox-2' }),
      ];
      (prisma.notificationOutbox.findMany as jest.Mock).mockResolvedValue(sampleRecords);

      const claimed = await worker.claimBatch(10, 300000);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.notificationOutbox.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['outbox-1', 'outbox-2'] } },
      });
      expect(claimed).toEqual(sampleRecords);
    });

    it('returns empty array when no candidates match query', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const claimed = await worker.claimBatch(10, 300000);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(prisma.notificationOutbox.findMany).not.toHaveBeenCalled();
      expect(claimed).toEqual([]);
    });

    it('handles missing outbox table (42P01) gracefully without throwing', async () => {
      const missingTableError: any = new Error(
        'Raw query failed. Code: `42P01`. Message: `relation "notification_outbox" does not exist`',
      );
      missingTableError.code = 'P2010';
      missingTableError.meta = { code: '42P01' };

      (prisma.$transaction as jest.Mock).mockRejectedValueOnce(missingTableError);

      const claimed = await worker.claimBatch(10, 300000);
      expect(claimed).toEqual([]);
      expect((worker as any).hasWarnedTableMissing).toBe(true);
    });
  });

  describe('Single Record Processing (processSingleRecord)', () => {
    it('processes and delivers an email successfully outside transaction', async () => {
      const record = createSampleOutboxRecord();
      const mockResult: EmailSendResult = {
        accepted: true,
        providerMessageId: 'msg-abc-123',
        timestamp: new Date(),
      };
      (emailProvider.sendEmail as jest.Mock).mockResolvedValue(mockResult);
      (prisma.schoolNotificationSetting.findUnique as jest.Mock).mockResolvedValue({
        senderDisplayName: 'Springfield Academy',
        replyToEmail: 'billing@springfield.test',
      });
      (prisma.notificationOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.notificationDeliveryAttempt.create as jest.Mock).mockResolvedValue({ id: 'att-1' });

      const status = await worker.processSingleRecord(record);

      expect(status).toBe(NotificationStatus.SENT);
      expect(templateRenderer.render).toHaveBeenCalledWith(
        record.templateKey,
        record.templateData,
      );
      expect(emailProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'parent@example.com',
          fromName: 'Springfield Academy',
          replyTo: 'billing@springfield.test',
          subject: 'Test Subject',
          htmlBody: '<p>Test Html</p>',
          textBody: 'Test Text',
          idempotencyKey: 'idemp-1',
          metadata: expect.objectContaining({
            outboxId: 'outbox-1',
            schoolId: 'school-1',
            idempotencyKey: 'idemp-1',
          }),
        }),
      );
      expect(prisma.notificationOutbox.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'outbox-1',
          status: NotificationStatus.PROCESSING,
          lockedAt: record.lockedAt,
        },
        data: expect.objectContaining({
          status: NotificationStatus.SENT,
          providerMessageId: 'msg-abc-123',
          lockedAt: null,
        }),
      });
      expect(prisma.notificationDeliveryAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          notificationOutboxId: 'outbox-1',
          outcome: NotificationStatus.SENT,
          providerMessageId: 'msg-abc-123',
          retryScheduled: false,
        }),
      });
    });

    it('marks record as SKIPPED if recipient email is missing or empty', async () => {
      const record = createSampleOutboxRecord({ recipientEmail: '   ' });
      (prisma.notificationOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const status = await worker.processSingleRecord(record);

      expect(status).toBe(NotificationStatus.SKIPPED);
      expect(emailProvider.sendEmail).not.toHaveBeenCalled();
      expect(prisma.notificationOutbox.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'outbox-1',
          status: NotificationStatus.PROCESSING,
          lockedAt: record.lockedAt,
        },
        data: expect.objectContaining({
          status: NotificationStatus.SKIPPED,
          skipReason: 'NO_VALID_RECIPIENT_EMAIL',
          lockedAt: null,
        }),
      });
      expect(prisma.notificationDeliveryAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          outcome: NotificationStatus.SKIPPED,
          errorMessage: 'No valid recipient email address on record',
          retryScheduled: false,
        }),
      });
    });

    it('rejects non-delivering provider in production and fails closed without calling sendEmail', async () => {
      process.env.NODE_ENV = 'production';

      (emailProvider.isDeliveryProvider as jest.Mock).mockReturnValue(false);
      (prisma.notificationOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const record = createSampleOutboxRecord();
      const status = await worker.processSingleRecord(record);

      expect(status).toBe(NotificationStatus.FAILED);
      expect(emailProvider.sendEmail).not.toHaveBeenCalled();
      expect(prisma.notificationOutbox.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'outbox-1',
          status: NotificationStatus.PROCESSING,
          lockedAt: record.lockedAt,
        },
        data: expect.objectContaining({
          status: NotificationStatus.FAILED,
          lastErrorCode: 'NON_DELIVERING_PROVIDER_IN_PRODUCTION',
        }),
      });
      expect(prisma.notificationDeliveryAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          outcome: NotificationStatus.FAILED,
          errorCode: 'NON_DELIVERING_PROVIDER_IN_PRODUCTION',
          retryScheduled: false,
        }),
      });
    });

    it('strictly rejects non-delivering provider in production even if obsolete ALLOW_INSECURE_NON_DELIVERING_EMAIL=true is set', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_INSECURE_NON_DELIVERING_EMAIL = 'true';

      (emailProvider.isDeliveryProvider as jest.Mock).mockReturnValue(false);
      (prisma.notificationOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const record = createSampleOutboxRecord();
      const status = await worker.processSingleRecord(record);

      expect(status).toBe(NotificationStatus.FAILED);
      expect(emailProvider.sendEmail).not.toHaveBeenCalled();
      expect(prisma.notificationOutbox.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'outbox-1',
          status: NotificationStatus.PROCESSING,
          lockedAt: record.lockedAt,
        },
        data: expect.objectContaining({
          status: NotificationStatus.FAILED,
          lastErrorCode: 'NON_DELIVERING_PROVIDER_IN_PRODUCTION',
        }),
      });
    });

    it('fails closed if provider delivery capability check throws an error in production', async () => {
      process.env.NODE_ENV = 'production';

      (emailProvider.isDeliveryProvider as jest.Mock).mockImplementation(() => {
        throw new Error('Provider check crashed');
      });
      (prisma.notificationOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const record = createSampleOutboxRecord();
      const status = await worker.processSingleRecord(record);

      expect(status).toBe(NotificationStatus.FAILED);
      expect(emailProvider.sendEmail).not.toHaveBeenCalled();
      expect(prisma.notificationOutbox.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'outbox-1',
          status: NotificationStatus.PROCESSING,
          lockedAt: record.lockedAt,
        },
        data: expect.objectContaining({
          status: NotificationStatus.FAILED,
          lastErrorCode: 'NON_DELIVERING_PROVIDER_IN_PRODUCTION',
        }),
      });
    });

    it('marks record as FAILED and does not retry if template rendering fails', async () => {
      (templateRenderer.render as jest.Mock).mockImplementation(() => {
        throw new Error('Missing variable: studentName');
      });
      (prisma.notificationOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const record = createSampleOutboxRecord();
      const status = await worker.processSingleRecord(record);

      expect(status).toBe(NotificationStatus.FAILED);
      expect(emailProvider.sendEmail).not.toHaveBeenCalled();
      expect(prisma.notificationOutbox.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'outbox-1',
          status: NotificationStatus.PROCESSING,
          lockedAt: record.lockedAt,
        },
        data: expect.objectContaining({
          status: NotificationStatus.FAILED,
          lastErrorCode: 'TEMPLATE_RENDER_ERROR',
        }),
      });
      expect(prisma.notificationDeliveryAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          outcome: NotificationStatus.FAILED,
          errorCode: 'TEMPLATE_RENDER_ERROR',
          errorMessage: 'Missing variable: studentName',
          retryScheduled: false,
        }),
      });
    });

    it('handles transient provider error with retry scheduled using exponential backoff', async () => {
      const transientError: EmailProviderError = {
        category: EmailErrorCategory.TRANSIENT,
        code: 'NETWORK_TIMEOUT',
        message: 'Connection to SMTP server timed out',
        isRetryable: true,
      };
      (emailProvider.sendEmail as jest.Mock).mockRejectedValue(transientError);
      (prisma.notificationOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const record = createSampleOutboxRecord({ attemptCount: 1 });
      const status = await worker.processSingleRecord(record);

      expect(status).toBe(NotificationStatus.FAILED);
      expect(prisma.notificationOutbox.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'outbox-1',
          status: NotificationStatus.PROCESSING,
          lockedAt: record.lockedAt,
        },
        data: expect.objectContaining({
          status: NotificationStatus.FAILED,
          lastErrorCode: 'NETWORK_TIMEOUT',
          lastErrorMessage: 'Connection to SMTP server timed out',
          nextAttemptAt: expect.any(Date),
        }),
      });
      expect(prisma.notificationDeliveryAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          outcome: NotificationStatus.FAILED,
          errorCode: 'NETWORK_TIMEOUT',
          retryScheduled: true,
        }),
      });
    });

    it('handles rate limit error respecting Retry-After seconds', async () => {
      const rateLimitError: EmailProviderError = {
        category: EmailErrorCategory.TRANSIENT,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        isRetryable: true,
        retryAfterSeconds: 120, // 120 seconds
      };
      (emailProvider.sendEmail as jest.Mock).mockRejectedValue(rateLimitError);
      (prisma.notificationOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const before = Date.now();
      const record = createSampleOutboxRecord({ attemptCount: 2 });
      await worker.processSingleRecord(record);

      const updateCall = (prisma.notificationOutbox.updateMany as jest.Mock).mock.calls[0][0];
      const scheduledTime = updateCall.data.nextAttemptAt.getTime();
      const expectedMin = before + 119000;
      const expectedMax = before + 125000;

      expect(scheduledTime).toBeGreaterThanOrEqual(expectedMin);
      expect(scheduledTime).toBeLessThanOrEqual(expectedMax);
    });

    it('marks record as terminal FAILED when max attempts reached', async () => {
      const transientError: EmailProviderError = {
        category: EmailErrorCategory.TRANSIENT,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Down for maintenance',
        isRetryable: true,
      };
      (emailProvider.sendEmail as jest.Mock).mockRejectedValue(transientError);
      (prisma.notificationOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      // Max attempts is 5, record is on attempt 5
      const record = createSampleOutboxRecord({ attemptCount: 5 });
      const status = await worker.processSingleRecord(record);

      expect(status).toBe(NotificationStatus.FAILED);
      expect(prisma.notificationOutbox.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'outbox-1',
          status: NotificationStatus.PROCESSING,
          lockedAt: record.lockedAt,
        },
        data: expect.objectContaining({
          status: NotificationStatus.FAILED,
          lastErrorCode: 'SERVICE_UNAVAILABLE',
        }),
      });
      expect(prisma.notificationDeliveryAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          outcome: NotificationStatus.FAILED,
          retryScheduled: false,
        }),
      });
    });

    it('marks non-retryable provider error as terminal FAILED immediately', async () => {
      const permError: EmailProviderError = {
        category: EmailErrorCategory.PERMANENT,
        code: 'INVALID_RECIPIENT_ADDRESS',
        message: 'Recipient mailbox does not exist',
        isRetryable: false,
      };
      (emailProvider.sendEmail as jest.Mock).mockRejectedValue(permError);
      (prisma.notificationOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const record = createSampleOutboxRecord({ attemptCount: 1 });
      const status = await worker.processSingleRecord(record);

      expect(status).toBe(NotificationStatus.FAILED);
      expect(prisma.notificationDeliveryAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          outcome: NotificationStatus.FAILED,
          retryScheduled: false,
        }),
      });
    });

    it('handles database error during finalization leaving record in recoverable state', async () => {
      const record = createSampleOutboxRecord();
      (emailProvider.sendEmail as jest.Mock).mockResolvedValue({
        accepted: true,
        providerMessageId: 'msg-abc-123',
        timestamp: new Date(),
      });
      (prisma.$transaction as jest.Mock).mockRejectedValueOnce(
        new Error('Database connection reset during finalization'),
      );

      await expect(worker.processSingleRecord(record)).rejects.toThrow(
        /Database connection reset during finalization/,
      );
      expect(prisma.notificationDeliveryAttempt.create).not.toHaveBeenCalled();
    });

    it('renews lease via heartbeat during slow dispatch and completes with renewed lease', async () => {
      const record = createSampleOutboxRecord();
      const initialLockedAt = record.lockedAt!;
      const renewedLockedAt = new Date('2026-10-17T00:02:00.000Z');

      (prisma.notificationOutbox.updateMany as jest.Mock)
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });

      (emailProvider.sendEmail as jest.Mock).mockImplementation(async () => {
        await (prisma.notificationOutbox.updateMany as any)({
          where: { id: record.id, status: NotificationStatus.PROCESSING, lockedAt: initialLockedAt },
          data: { lockedAt: renewedLockedAt },
        });
        return {
          accepted: true,
          providerMessageId: 'msg-slow-123',
          timestamp: new Date(),
        };
      });

      const status = await worker.processSingleRecord(record);
      expect(status).toBe(NotificationStatus.SENT);
      expect(prisma.notificationOutbox.updateMany).toHaveBeenCalled();
    });
  });

  describe('Lease Ownership & Stale Worker Protection (finalizeRecord)', () => {
    it('discards outcome safely if lease ownership was lost (updateMany count === 0)', async () => {
      (prisma.notificationOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const record = createSampleOutboxRecord();
      const finalized = await worker.finalizeRecord(
        record.id,
        record.lockedAt!,
        NotificationStatus.SENT,
        { providerMessageId: 'msg-999' },
        {
          attemptNumber: 1,
          startedAt: new Date(),
          completedAt: new Date(),
          outcome: NotificationStatus.SENT,
          retryScheduled: false,
        },
      );

      expect(finalized).toBe(false);
      // Delivery attempt must NOT be created when lease was lost to prevent orphaned/duplicate audit logs
      expect(prisma.notificationDeliveryAttempt.create).not.toHaveBeenCalled();
    });

    it('prevents a slow stale worker from corrupting an already reclaimed and completed record', async () => {
      (prisma.notificationOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const record = createSampleOutboxRecord({
        id: 'outbox-competing',
        lockedAt: new Date('2026-10-17T00:00:00.000Z'),
      });

      const finalized = await worker.finalizeRecord(
        record.id,
        record.lockedAt!,
        NotificationStatus.SENT,
        { providerMessageId: 'msg-from-stale-worker' },
        {
          attemptNumber: 1,
          startedAt: new Date(),
          completedAt: new Date(),
          outcome: NotificationStatus.SENT,
          retryScheduled: false,
        },
      );

      expect(finalized).toBe(false);
      expect(prisma.notificationDeliveryAttempt.create).not.toHaveBeenCalled();
    });

    it('successfully commits outcome and attempt record when lease matches', async () => {
      (prisma.notificationOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.notificationDeliveryAttempt.create as jest.Mock).mockResolvedValue({ id: 'att-1' });

      const record = createSampleOutboxRecord();
      const finalized = await worker.finalizeRecord(
        record.id,
        record.lockedAt!,
        NotificationStatus.SENT,
        { providerMessageId: 'msg-999' },
        {
          attemptNumber: 1,
          startedAt: new Date(),
          completedAt: new Date(),
          outcome: NotificationStatus.SENT,
          retryScheduled: false,
        },
      );

      expect(finalized).toBe(true);
      expect(prisma.notificationDeliveryAttempt.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Backoff Calculation (calculateNextAttempt)', () => {
    it('uses exponential formula 2 ** (attempt - 1) * 30000 ms with positive jitter', () => {
      // Attempt 1: 2**0 * 30s = 30s (+ up to 6s jitter)
      const res1 = worker.calculateNextAttempt(1, {
        category: EmailErrorCategory.TRANSIENT,
        code: 'TIMEOUT',
        message: 'timeout',
        isRetryable: true,
      });
      expect(res1.retryScheduled).toBe(true);
      const delay1 = res1.nextAttemptAt!.getTime() - Date.now();
      expect(delay1).toBeGreaterThanOrEqual(29000);
      expect(delay1).toBeLessThanOrEqual(37000);

      // Attempt 2: 2**1 * 30s = 60s (+ up to 12s jitter)
      const res2 = worker.calculateNextAttempt(2, {
        category: EmailErrorCategory.TRANSIENT,
        code: 'TIMEOUT',
        message: 'timeout',
        isRetryable: true,
      });
      const delay2 = res2.nextAttemptAt!.getTime() - Date.now();
      expect(delay2).toBeGreaterThanOrEqual(59000);
      expect(delay2).toBeLessThanOrEqual(73000);

      // Attempt 3: 2**2 * 30s = 120s (+ up to 24s jitter)
      const res3 = worker.calculateNextAttempt(3, {
        category: EmailErrorCategory.TRANSIENT,
        code: 'TIMEOUT',
        message: 'timeout',
        isRetryable: true,
      });
      const delay3 = res3.nextAttemptAt!.getTime() - Date.now();
      expect(delay3).toBeGreaterThanOrEqual(119000);
      expect(delay3).toBeLessThanOrEqual(145000);
    });

    it('caps maximum delay at 1 hour (3600000ms + jitter)', () => {
      process.env.NOTIFICATION_MAX_ATTEMPTS = '20';
      const customWorker = new NotificationOutboxWorker(
        prisma,
        emailProvider,
        emailConfigService,
        templateRenderer,
      );
      // High attempt count
      const res = customWorker.calculateNextAttempt(15, {
        category: EmailErrorCategory.TRANSIENT,
        code: 'TIMEOUT',
        message: 'timeout',
        isRetryable: true,
      });
      expect(res.retryScheduled).toBe(true);
      const delay = res.nextAttemptAt!.getTime() - Date.now();
      // Base delay 3,600,000 + up to 20% jitter (720,000) = max 4,320,000
      expect(delay).toBeGreaterThanOrEqual(3590000);
      expect(delay).toBeLessThanOrEqual(4350000);
    });

    it('clamps excessively large Retry-After to 3600s (1 hour)', () => {
      const res = worker.calculateNextAttempt(1, {
        category: EmailErrorCategory.TRANSIENT,
        code: 'RATE_LIMIT',
        message: 'Too many requests',
        isRetryable: true,
        retryAfterSeconds: 999999,
      });
      expect(res.retryScheduled).toBe(true);
      const delay = res.nextAttemptAt!.getTime() - Date.now();
      expect(delay).toBeGreaterThanOrEqual(3590000);
      expect(delay).toBeLessThanOrEqual(3605000);
    });

    it('clamps fractional positive Retry-After to minimum 1s', () => {
      const res = worker.calculateNextAttempt(1, {
        category: EmailErrorCategory.TRANSIENT,
        code: 'RATE_LIMIT',
        message: 'Too many requests',
        isRetryable: true,
        retryAfterSeconds: 0.1,
      });
      expect(res.retryScheduled).toBe(true);
      const delay = res.nextAttemptAt!.getTime() - Date.now();
      expect(delay).toBeGreaterThanOrEqual(900);
      expect(delay).toBeLessThanOrEqual(2000);
    });

    it('falls back to exponential backoff when Retry-After is negative or non-finite', () => {
      const resNeg = worker.calculateNextAttempt(1, {
        category: EmailErrorCategory.TRANSIENT,
        code: 'ERROR',
        message: 'Negative retry after',
        isRetryable: true,
        retryAfterSeconds: -10,
      });
      expect(resNeg.retryScheduled).toBe(true);
      const delayNeg = resNeg.nextAttemptAt!.getTime() - Date.now();
      expect(delayNeg).toBeGreaterThanOrEqual(29000);
      expect(delayNeg).toBeLessThanOrEqual(37000);

      const resNaN = worker.calculateNextAttempt(1, {
        category: EmailErrorCategory.TRANSIENT,
        code: 'ERROR',
        message: 'NaN retry after',
        isRetryable: true,
        retryAfterSeconds: NaN,
      });
      expect(resNaN.retryScheduled).toBe(true);
      const delayNaN = resNaN.nextAttemptAt!.getTime() - Date.now();
      expect(delayNaN).toBeGreaterThanOrEqual(29000);
      expect(delayNaN).toBeLessThanOrEqual(37000);
    });
  });

  describe('Worker Batch Processing Loop (processBatch)', () => {
    it('processes all claimed records and returns accurate statistics', async () => {
      const records = [
        createSampleOutboxRecord({ id: 'outbox-1', recipientEmail: 'a@test.com' }),
        createSampleOutboxRecord({ id: 'outbox-2', recipientEmail: '' }), // Will skip
        createSampleOutboxRecord({ id: 'outbox-3', recipientEmail: 'b@test.com' }),
      ];

      jest.spyOn(worker, 'claimBatch').mockResolvedValue(records);
      (emailProvider.sendEmail as jest.Mock)
        .mockResolvedValueOnce({ accepted: true, providerMessageId: 'p-1', timestamp: new Date() })
        .mockRejectedValueOnce({
          category: EmailErrorCategory.PERMANENT,
          code: 'REJECTED',
          message: 'Invalid recipient',
          isRetryable: false,
        });
      (prisma.notificationOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await worker.processBatch();

      expect(result.claimedCount).toBe(3);
      expect(result.processedCount).toBe(3);
      expect(result.sentCount).toBe(1);
      expect(result.skippedCount).toBe(1);
      expect(result.failedCount).toBe(1);
    });

    it('returns existing in-flight promise if processBatch is called concurrently', async () => {
      let resolveClaim: any;
      const claimPromise = new Promise<NotificationOutbox[]>((resolve) => {
        resolveClaim = resolve;
      });

      jest.spyOn(worker, 'claimBatch').mockImplementation(() => claimPromise);

      const promise1 = worker.processBatch();
      const promise2 = worker.processBatch();

      expect(promise1).toBe(promise2);

      resolveClaim([]);
      const [res1, res2] = await Promise.all([promise1, promise2]);
      expect(res1).toEqual(res2);
    });
  });
});
