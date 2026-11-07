import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import {
  NotificationEventType,
  NotificationOutbox,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailConfigService } from '../email/email-config.service';
import { EmailProvider } from '../email/email-provider.interface';
import {
  EmailErrorCategory,
  EmailProviderError,
  EmailSendResult,
} from '../email/email.types';
import { normalizeEmailError } from '../email/memory-email.provider';
import { EmailTemplateRenderer } from '../templates/email-template.renderer';
import { RenderedEmail } from '../templates/template.types';
import { sanitizeSenderDisplayName } from '../templates/template-sanitizer';
import { WhatsAppProvider } from '../whatsapp/whatsapp-provider.interface';
import { normalizeWhatsAppError } from '../whatsapp/memory-whatsapp.provider';
import { normalizeWhatsAppPhoneNumber } from '../whatsapp/whatsapp-cloud-api.provider';
import { EmailRateLimiter, MailtrapRateLimiter } from '../email/mailtrap-rate-limiter';

export interface WorkerBatchResult {
  claimedCount: number;
  processedCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  staleRecoveredCount: number;
}

@Injectable()
export class NotificationOutboxWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(NotificationOutboxWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private isStopping = false;
  private activeBatchPromise: Promise<WorkerBatchResult> | null = null;

  public readonly isEnabled: boolean;
  public readonly batchSize: number;
  public readonly intervalMs: number;
  public readonly lockDurationMs: number;
  public readonly maxAttempts: number;
  public readonly rateLimiter: EmailRateLimiter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailProvider: EmailProvider,
    private readonly emailConfigService: EmailConfigService,
    private readonly templateRenderer: EmailTemplateRenderer,
    @Optional() private readonly whatsappProvider?: WhatsAppProvider,
    @Optional() rateLimiter?: EmailRateLimiter,
  ) {
    this.isEnabled = process.env.NOTIFICATION_WORKER_ENABLED === 'true';
    this.batchSize = Math.max(
      1,
      Math.min(100, parseInt(process.env.NOTIFICATION_WORKER_BATCH_SIZE || '10', 10)),
    );
    this.intervalMs = Math.max(
      500,
      parseInt(process.env.NOTIFICATION_WORKER_INTERVAL_MS || '5000', 10),
    );
    this.lockDurationMs = Math.max(
      60000,
      parseInt(process.env.NOTIFICATION_WORKER_LOCK_DURATION_MS || '300000', 10),
    ); // Default 5 minutes
    this.maxAttempts = Math.max(
      1,
      parseInt(process.env.NOTIFICATION_MAX_ATTEMPTS || '5', 10),
    );
    this.rateLimiter = rateLimiter || new MailtrapRateLimiter();
  }

  onApplicationBootstrap() {
    if (!this.isEnabled) {
      this.logger.log('Notification outbox worker is DISABLED via configuration');
      return;
    }
    this.logger.log(
      `Notification outbox worker initialized (batchSize: ${this.batchSize}, interval: ${this.intervalMs}ms, maxAttempts: ${this.maxAttempts})`,
    );
    this.scheduleNextTick();
  }

  async onApplicationShutdown() {
    this.logger.log('Notification outbox worker shutting down gracefully...');
    this.isStopping = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.activeBatchPromise) {
      this.logger.log('Waiting for active outbox worker batch to finalize...');
      try {
        await this.activeBatchPromise;
      } catch (err: any) {
        this.logger.error(`Error waiting for active batch during shutdown: ${err.message}`);
      }
    }
    this.logger.log('Notification outbox worker shutdown complete.');
  }

  private hasWarnedTableMissing = false;

  private scheduleNextTick() {
    if (this.isStopping || !this.isEnabled) {
      return;
    }
    const delay = this.hasWarnedTableMissing ? 60000 : this.intervalMs;
    this.timer = setTimeout(async () => {
      try {
        await this.processBatch();
      } catch (err: any) {
        this.logger.error(`Error during outbox worker processing tick: ${err.message}`);
      } finally {
        this.scheduleNextTick();
      }
    }, delay);
  }

  /**
   * Main execution unit: claims a batch atomically and processes each claimed record.
   * Public to allow direct invocation in scheduled ticks, manual triggers, and tests.
   */
  processBatch(): Promise<WorkerBatchResult> {
    if (this.activeBatchPromise) {
      return this.activeBatchPromise;
    }

    const currentPromise = this.executeBatch().finally(() => {
      if (this.activeBatchPromise === currentPromise) {
        this.activeBatchPromise = null;
      }
    });

    this.activeBatchPromise = currentPromise;
    return currentPromise;
  }

  private async executeBatch(): Promise<WorkerBatchResult> {
    const result: WorkerBatchResult = {
      claimedCount: 0,
      processedCount: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      staleRecoveredCount: 0,
    };

    // 1. Claim batch in a short transaction
    const claimedRecords = await this.claimBatch(this.batchSize, this.lockDurationMs);
    result.claimedCount = claimedRecords.length;

    if (claimedRecords.length === 0) {
      return result;
    }

    // 2. Process each claimed record strictly OUTSIDE any database transaction
    for (const record of claimedRecords) {
      if (this.isStopping) {
        this.logger.warn(`Shutdown initiated; stopping processing of remaining batch items.`);
        break;
      }

      result.processedCount++;
      try {
        const itemResult = await this.processSingleRecord(record);
        if (itemResult === NotificationStatus.SENT) {
          result.sentCount++;
        } else if (itemResult === NotificationStatus.FAILED) {
          result.failedCount++;
        } else if (itemResult === NotificationStatus.SKIPPED) {
          result.skippedCount++;
        }
      } catch (err: any) {
        this.logger.error(
          `Unhandled failure while processing outbox record ${record.id}: ${err.message}`,
        );
        result.failedCount++;
      }
    }

    return result;
  }

  /**
   * Atomically claims due PENDING, retryable FAILED, or stale PROCESSING outbox records.
   * Runs in a short database transaction using FOR UPDATE SKIP LOCKED where available.
   */
  async claimBatch(
    batchSize: number = this.batchSize,
    lockDurationMs: number = this.lockDurationMs,
  ): Promise<NotificationOutbox[]> {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - lockDurationMs);

    try {
      const records = await this.prisma.$transaction(
        async (tx) => {
          // Query candidate record IDs with row locks
          const candidateRows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "notification_outbox"
            WHERE (
              (status = 'PENDING'::"NotificationStatus" AND "nextAttemptAt" <= ${now})
              OR (status = 'FAILED'::"NotificationStatus" AND "attemptCount" < ${this.maxAttempts} AND "nextAttemptAt" <= ${now})
              OR (status = 'PROCESSING'::"NotificationStatus" AND "lockedAt" <= ${staleThreshold})
            )
            ORDER BY "nextAttemptAt" ASC
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED;
          `;

          if (!candidateRows || candidateRows.length === 0) {
            return [];
          }

          const claimIds = candidateRows.map((r) => r.id);

          // Advance claimed rows to PROCESSING with active lease lock and increment attemptCount
          await tx.$executeRaw`
            UPDATE "notification_outbox"
            SET status = 'PROCESSING'::"NotificationStatus",
                "lockedAt" = ${now},
                "attemptCount" = "attemptCount" + 1,
                "updatedAt" = ${now}
            WHERE id = ANY(${claimIds}::text[]);
          `;

          // Fetch full claimed records to return
          return await tx.notificationOutbox.findMany({
            where: { id: { in: claimIds } },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 10000,
        },
      );

      // If successful after previous table missing warning, reset flag
      if (this.hasWarnedTableMissing) {
        this.logger.log('Notification outbox table detected; normal worker polling resumed.');
        this.hasWarnedTableMissing = false;
      }

      return records;
    } catch (err: any) {
      if (this.isTableMissingError(err)) {
        if (!this.hasWarnedTableMissing) {
          this.logger.warn(
            'Notification outbox table "notification_outbox" does not exist in the database (migration pending). Worker polling is paused for 60s. Apply the notification migration or set NOTIFICATION_WORKER_ENABLED=false.',
          );
          this.hasWarnedTableMissing = true;
        }
        return [];
      }
      throw err;
    }
  }

  private isTableMissingError(err: any): boolean {
    const msg = String(err?.message || '');
    const metaCode = String(err?.meta?.code || '');
    const code = String(err?.code || '');
    return (
      code === '42P01' ||
      metaCode === '42P01' ||
      msg.includes('42P01') ||
      msg.includes('relation "notification_outbox" does not exist') ||
      msg.includes('does not exist in the current database')
    );
  }

  /**
   * Processes a single claimed outbox record outside database transactions.
   * Routes by channel (EMAIL vs WHATSAPP) and verifies lease ownership before committing outcome.
   */
  async processSingleRecord(record: NotificationOutbox): Promise<NotificationStatus> {
    const claimedLockedAt = record.lockedAt || new Date();
    const startedAt = new Date();

    const rawChannel = String((record as any).channel || 'EMAIL').trim().toUpperCase();

    if (rawChannel === 'EMAIL') {
      return await this.processEmailRecord(record, claimedLockedAt, startedAt);
    } else if (rawChannel === 'WHATSAPP') {
      return await this.processWhatsAppRecord(record, claimedLockedAt, startedAt);
    } else {
      this.logger.warn(`Unsupported notification channel '${rawChannel}' for outbox record ${record.id}`);
      await this.finalizeRecord(
        record.id,
        claimedLockedAt,
        NotificationStatus.SKIPPED,
        {
          skipReason: `UNSUPPORTED_NOTIFICATION_CHANNEL:${rawChannel}`,
          skippedAt: new Date(),
        },
        {
          attemptNumber: record.attemptCount,
          startedAt,
          completedAt: new Date(),
          outcome: NotificationStatus.SKIPPED,
          errorMessage: `Unsupported notification channel '${rawChannel}'`,
          retryScheduled: false,
        },
      );
      return NotificationStatus.SKIPPED;
    }
  }

  /**
   * Handles EMAIL channel dispatch.
   */
  private async processEmailRecord(
    record: NotificationOutbox,
    claimedLockedAt: Date,
    startedAt: Date,
  ): Promise<NotificationStatus> {
    // 1. Check for missing recipient email
    if (!record.recipientEmail || record.recipientEmail.trim() === '') {
      await this.finalizeRecord(
        record.id,
        claimedLockedAt,
        NotificationStatus.SKIPPED,
        {
          skipReason: 'NO_VALID_RECIPIENT_EMAIL',
          skippedAt: new Date(),
        },
        {
          attemptNumber: record.attemptCount,
          startedAt,
          completedAt: new Date(),
          outcome: NotificationStatus.SKIPPED,
          errorMessage: 'No valid recipient email address on record',
          retryScheduled: false,
        },
      );
      return NotificationStatus.SKIPPED;
    }

    // 2. Production safety: verify provider is a real delivery provider in production. Fail closed.
    const isProduction = process.env.NODE_ENV === 'production';
    let isDeliveryCapable = false;
    try {
      isDeliveryCapable =
        Boolean(this.emailProvider) &&
        typeof this.emailProvider.isDeliveryProvider === 'function' &&
        this.emailProvider.isDeliveryProvider() === true;
    } catch {
      isDeliveryCapable = false;
    }

    if (isProduction && !isDeliveryCapable) {
      const configError: EmailProviderError = {
        category: EmailErrorCategory.CONFIGURATION,
        code: 'NON_DELIVERING_PROVIDER_IN_PRODUCTION',
        message:
          'Cannot deliver emails: Configured email provider is non-delivering and cannot be used in production.',
        isRetryable: false,
      };

      await this.finalizeRecord(
        record.id,
        claimedLockedAt,
        NotificationStatus.FAILED,
        {
          lastErrorCode: configError.code,
          lastErrorMessage: configError.message,
        },
        {
          attemptNumber: record.attemptCount,
          startedAt,
          completedAt: new Date(),
          outcome: NotificationStatus.FAILED,
          errorCode: configError.code,
          errorMessage: configError.message,
          retryScheduled: false,
        },
      );
      return NotificationStatus.FAILED;
    }

    // 3. Render template
    let rendered: RenderedEmail;
    try {
      rendered = this.templateRenderer.render(
        record.templateKey as NotificationEventType,
        record.templateData,
      );
    } catch (renderErr: any) {
      const renderError = {
        code: 'TEMPLATE_RENDER_ERROR',
        message: renderErr.message || 'Failed to render email template',
      };
      this.logger.error(`Template rendering failed for outbox record ${record.id}: ${renderError.message}`);

      await this.finalizeRecord(
        record.id,
        claimedLockedAt,
        NotificationStatus.FAILED,
        {
          lastErrorCode: renderError.code,
          lastErrorMessage: renderError.message,
        },
        {
          attemptNumber: record.attemptCount,
          startedAt,
          completedAt: new Date(),
          outcome: NotificationStatus.FAILED,
          errorCode: renderError.code,
          errorMessage: renderError.message,
          retryScheduled: false,
        },
      );
      return NotificationStatus.FAILED;
    }

    // 4. Resolve sender configuration and tenant preferences
    let senderName = this.emailConfigService.defaultFromName;
    let replyTo: string | undefined = undefined;

    try {
      const setting = await this.prisma.schoolNotificationSetting.findUnique({
        where: { schoolId: record.schoolId },
      });
      if (setting?.senderDisplayName) {
        senderName = sanitizeSenderDisplayName(setting.senderDisplayName);
      }
      if (setting?.replyToEmail) {
        const validReplyTo = this.emailConfigService.validateReplyTo(setting.replyToEmail);
        if (validReplyTo) {
          replyTo = validReplyTo;
        }
      }
    } catch (err: any) {
      // Non-fatal fallback to defaults if school settings read fails
      this.logger.warn(`Could not load tenant notification settings for school ${record.schoolId}: ${err.message}`);
    }

    // 5. Send email through provider OUTSIDE any database transaction
    // Acquire rate-limiting slot prior to network transmission outside DB transaction.
    // If distributed rate limiting fails closed (e.g. Redis outage), handle as transient error
    // so the record remains safe for retry rather than unsafely bypassing provider rate limits.
    try {
      const waitMs = await this.rateLimiter.acquireSlot();
      if (waitMs > 100) {
        this.logger.debug(`[RateLimiter] Paced dispatch for record ${record.id} by ${waitMs}ms`);
      }
    } catch (limiterErr: any) {
      this.logger.error(
        `[RateLimiter Failed-Closed] Cannot dispatch record ${record.id}: ${limiterErr.message}. Preserving record for retry.`,
      );

      const completedAt = new Date();
      const providerError = normalizeEmailError(limiterErr);
      const retryPolicy = this.calculateNextAttempt(record.attemptCount, providerError);

      await this.finalizeRecord(
        record.id,
        claimedLockedAt,
        NotificationStatus.FAILED,
        {
          lastErrorCode: providerError.code,
          lastErrorMessage: providerError.message,
          nextAttemptAt: retryPolicy.nextAttemptAt,
        },
        {
          attemptNumber: record.attemptCount,
          startedAt,
          completedAt,
          outcome: NotificationStatus.FAILED,
          errorCode: providerError.code,
          errorMessage: providerError.message,
          retryScheduled: retryPolicy.retryScheduled,
        },
      );

      return NotificationStatus.FAILED;
    }

    // Setup lease renewal heartbeat for slow dispatches
    let currentLockedAt = claimedLockedAt;
    let leaseLost = false;
    const heartbeatIntervalMs = Math.max(5000, Math.floor(this.lockDurationMs / 3));

    const heartbeatTimer = setInterval(async () => {
      if (leaseLost || this.isStopping) return;
      try {
        const renewedAt = new Date();
        const updateResult = await this.prisma.notificationOutbox.updateMany({
          where: {
            id: record.id,
            status: NotificationStatus.PROCESSING,
            lockedAt: currentLockedAt,
          },
          data: {
            lockedAt: renewedAt,
            updatedAt: renewedAt,
          },
        });
        if (updateResult.count > 0) {
          currentLockedAt = renewedAt;
        } else {
          leaseLost = true;
          this.logger.warn(
            `[Lease Heartbeat] Lost lease ownership for record ${record.id} during active dispatch.`,
          );
        }
      } catch (heartbeatErr: any) {
        this.logger.warn(
          `[Lease Heartbeat] Error renewing lease for record ${record.id}: ${heartbeatErr.message}`,
        );
      }
    }, heartbeatIntervalMs);

    let sendResult: EmailSendResult;
    try {
      sendResult = await this.emailProvider.sendEmail({
        to: record.recipientEmail,
        toName: record.recipientName || undefined,
        fromEmail: this.emailConfigService.fromAddress,
        fromName: senderName,
        replyTo,
        subject: rendered.subject,
        htmlBody: rendered.htmlBody ?? rendered.html,
        textBody: rendered.textBody ?? rendered.text,
        idempotencyKey: record.idempotencyKey,
        metadata: {
          outboxId: record.id,
          schoolId: record.schoolId,
          idempotencyKey: record.idempotencyKey,
          eventType: record.eventType,
        },
      });
    } catch (err: any) {
      clearInterval(heartbeatTimer);
      const providerError = normalizeEmailError(err);
      const completedAt = new Date();

      // Calculate retry timing according to retry policy
      const retryPolicy = this.calculateNextAttempt(record.attemptCount, providerError);

      this.logger.warn(
        `Delivery failure for outbox record ${record.id} to ${this.maskEmail(
          record.recipientEmail,
        )} (attempt ${record.attemptCount}/${this.maxAttempts}): [${providerError.code}] ${
          providerError.message
        }${retryPolicy.retryScheduled ? ` (retry scheduled at ${retryPolicy.nextAttemptAt?.toISOString()})` : ' (terminal failure)'}`,
      );

      await this.finalizeRecord(
        record.id,
        currentLockedAt,
        NotificationStatus.FAILED,
        {
          lastErrorCode: providerError.code,
          lastErrorMessage: providerError.message,
          nextAttemptAt: retryPolicy.nextAttemptAt,
        },
        {
          attemptNumber: record.attemptCount,
          startedAt,
          completedAt,
          outcome: NotificationStatus.FAILED,
          errorCode: providerError.code,
          errorMessage: providerError.message,
          retryScheduled: retryPolicy.retryScheduled,
        },
      );

      return NotificationStatus.FAILED;
    } finally {
      clearInterval(heartbeatTimer);
    }

    // 6. Finalize successful outcome
    // Note: SENT indicates upstream provider acceptance (HTTP 200/202 or SMTP 250 OK), not guaranteed inbox delivery.
    const completedAt = new Date();
    this.logger.log(
      `Provider accepted outbox record ${record.id} for ${this.maskEmail(record.recipientEmail)} (msgId: ${
        sendResult.providerMessageId
      })`,
    );

    await this.finalizeRecord(
      record.id,
      currentLockedAt,
      NotificationStatus.SENT,
      {
        providerMessageId: sendResult.providerMessageId,
        sentAt: completedAt,
      },
      {
        attemptNumber: record.attemptCount,
        startedAt,
        completedAt,
        outcome: NotificationStatus.SENT,
        providerMessageId: sendResult.providerMessageId,
        retryScheduled: false,
      },
    );

    return NotificationStatus.SENT;
  }

  /**
   * Handles WHATSAPP channel dispatch.
   */
  private async processWhatsAppRecord(
    record: NotificationOutbox,
    claimedLockedAt: Date,
    startedAt: Date,
  ): Promise<NotificationStatus> {
    // 1. Resolve recipient phone number
    const recipientPhone =
      (record as any).recipientPhone?.trim() ||
      (record.templateData as any)?.recipientPhone?.trim() ||
      (record.templateData as any)?.guardianPhone?.trim();

    if (!recipientPhone) {
      await this.finalizeRecord(
        record.id,
        claimedLockedAt,
        NotificationStatus.SKIPPED,
        {
          skipReason: 'NO_VALID_RECIPIENT_PHONE',
          skippedAt: new Date(),
        },
        {
          attemptNumber: record.attemptCount,
          startedAt,
          completedAt: new Date(),
          outcome: NotificationStatus.SKIPPED,
          errorMessage: 'No valid recipient phone number on record',
          retryScheduled: false,
        },
      );
      return NotificationStatus.SKIPPED;
    }

    // 2. Validate WhatsAppProvider presence
    if (!this.whatsappProvider) {
      const errorMsg = 'WhatsApp provider is not injected or configured in outbox worker';
      this.logger.error(`Failed to process WhatsApp record ${record.id}: ${errorMsg}`);
      await this.finalizeRecord(
        record.id,
        claimedLockedAt,
        NotificationStatus.FAILED,
        {
          lastErrorCode: 'WHATSAPP_PROVIDER_UNAVAILABLE',
          lastErrorMessage: errorMsg,
        },
        {
          attemptNumber: record.attemptCount,
          startedAt,
          completedAt: new Date(),
          outcome: NotificationStatus.FAILED,
          errorCode: 'WHATSAPP_PROVIDER_UNAVAILABLE',
          errorMessage: errorMsg,
          retryScheduled: false,
        },
      );
      return NotificationStatus.FAILED;
    }

    // 3. Production delivery check
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && !this.whatsappProvider.isDeliveryProvider()) {
      const errorMsg = 'Cannot deliver WhatsApp message: Configured WhatsApp provider is non-delivering in production.';
      await this.finalizeRecord(
        record.id,
        claimedLockedAt,
        NotificationStatus.FAILED,
        {
          lastErrorCode: 'NON_DELIVERING_PROVIDER_IN_PRODUCTION',
          lastErrorMessage: errorMsg,
        },
        {
          attemptNumber: record.attemptCount,
          startedAt,
          completedAt: new Date(),
          outcome: NotificationStatus.FAILED,
          errorCode: 'NON_DELIVERING_PROVIDER_IN_PRODUCTION',
          errorMessage: errorMsg,
          retryScheduled: false,
        },
      );
      return NotificationStatus.FAILED;
    }

    // 4. Verify tenant WhatsApp preference from school notification settings (fail closed)
    let isWhatsAppEnabled = false;
    try {
      const setting = await this.prisma.schoolNotificationSetting.findUnique({
        where: { schoolId: record.schoolId },
      });
      if (setting && (setting as any).whatsappEnabled === true) {
        isWhatsAppEnabled = true;
      }
    } catch (err: any) {
      this.logger.warn(`Could not verify WhatsApp settings for school ${record.schoolId}: ${err.message}`);
    }

    if (!isWhatsAppEnabled) {
      const errorMsg =
        'WhatsApp dispatch rejected: School has not enabled WhatsApp notifications or schema lacks verified tenant setting.';
      this.logger.warn(`WhatsApp dispatch blocked for record ${record.id}: ${errorMsg}`);
      await this.finalizeRecord(
        record.id,
        claimedLockedAt,
        NotificationStatus.FAILED,
        {
          lastErrorCode: 'WHATSAPP_TENANT_PREFERENCE_UNVERIFIED',
          lastErrorMessage: errorMsg,
        },
        {
          attemptNumber: record.attemptCount,
          startedAt,
          completedAt: new Date(),
          outcome: NotificationStatus.FAILED,
          errorCode: 'WHATSAPP_TENANT_PREFERENCE_UNVERIFIED',
          errorMessage: errorMsg,
          retryScheduled: false,
        },
      );
      return NotificationStatus.FAILED;
    }

    // 5. Setup lease renewal heartbeat for slow dispatches
    let currentLockedAt = claimedLockedAt;
    let leaseLost = false;
    const heartbeatIntervalMs = Math.max(5000, Math.floor(this.lockDurationMs / 3));

    const heartbeatTimer = setInterval(async () => {
      if (leaseLost || this.isStopping) return;
      try {
        const renewedAt = new Date();
        const updateResult = await this.prisma.notificationOutbox.updateMany({
          where: {
            id: record.id,
            status: NotificationStatus.PROCESSING,
            lockedAt: currentLockedAt,
          },
          data: {
            lockedAt: renewedAt,
            updatedAt: renewedAt,
          },
        });
        if (updateResult.count > 0) {
          currentLockedAt = renewedAt;
        } else {
          leaseLost = true;
          this.logger.warn(`[Lease Heartbeat] Lost lease ownership for WhatsApp record ${record.id}`);
        }
      } catch (heartbeatErr: any) {
        this.logger.warn(`[Lease Heartbeat] Error renewing lease for WhatsApp record ${record.id}: ${heartbeatErr.message}`);
      }
    }, heartbeatIntervalMs);

    let sendResult: any;
    try {
      const templateName =
        (record.templateData as any)?.whatsappTemplateName ||
        record.templateKey.toLowerCase().replace(/[^a-z0-9_]/g, '_');

      sendResult = await this.whatsappProvider.sendWhatsAppMessage({
        toPhone: recipientPhone,
        recipientName: record.recipientName || undefined,
        templateName,
        languageCode: (record.templateData as any)?.languageCode || 'en',
        parameters: (record.templateData as any)?.whatsappParameters || record.templateData,
        idempotencyKey: record.idempotencyKey,
        metadata: {
          outboxId: record.id,
          schoolId: record.schoolId,
          channel: 'WHATSAPP',
          idempotencyKey: record.idempotencyKey,
        },
      });
    } catch (err: any) {
      clearInterval(heartbeatTimer);
      const providerError = normalizeWhatsAppError(err);
      const completedAt = new Date();
      const retryPolicy = this.calculateNextAttempt(record.attemptCount, providerError as any);

      this.logger.warn(
        `WhatsApp delivery failure for record ${record.id} to ${this.maskPhone(recipientPhone)} (attempt ${record.attemptCount}/${this.maxAttempts}): [${providerError.code}] ${providerError.message}`,
      );

      await this.finalizeRecord(
        record.id,
        currentLockedAt,
        NotificationStatus.FAILED,
        {
          lastErrorCode: providerError.code,
          lastErrorMessage: providerError.message,
          nextAttemptAt: retryPolicy.nextAttemptAt,
        },
        {
          attemptNumber: record.attemptCount,
          startedAt,
          completedAt,
          outcome: NotificationStatus.FAILED,
          errorCode: providerError.code,
          errorMessage: providerError.message,
          retryScheduled: retryPolicy.retryScheduled,
        },
      );
      return NotificationStatus.FAILED;
    } finally {
      clearInterval(heartbeatTimer);
    }

    const completedAt = new Date();
    this.logger.log(
      `WhatsApp provider accepted outbox record ${record.id} for ${this.maskPhone(recipientPhone)} (msgId: ${sendResult.providerMessageId})`,
    );

    await this.finalizeRecord(
      record.id,
      currentLockedAt,
      NotificationStatus.SENT,
      {
        providerMessageId: sendResult.providerMessageId,
        sentAt: completedAt,
      },
      {
        attemptNumber: record.attemptCount,
        startedAt,
        completedAt,
        outcome: NotificationStatus.SENT,
        providerMessageId: sendResult.providerMessageId,
        retryScheduled: false,
      },
    );

    return NotificationStatus.SENT;
  }

  /**
   * Finalizes an outbox item outcome with optimistic lease verification.
   * Prevents stale workers from overwriting a reclaimed lease.
   */
  async finalizeRecord(
    recordId: string,
    claimedLockedAt: Date,
    status: NotificationStatus,
    outboxData: {
      providerMessageId?: string | null;
      lastErrorCode?: string | null;
      lastErrorMessage?: string | null;
      nextAttemptAt?: Date | null;
      sentAt?: Date | null;
      skipReason?: string | null;
      skippedAt?: Date | null;
    },
    attemptDetails: {
      attemptNumber: number;
      startedAt: Date;
      completedAt: Date;
      outcome: NotificationStatus;
      errorCode?: string | null;
      errorMessage?: string | null;
      providerMessageId?: string | null;
      retryScheduled: boolean;
    },
  ): Promise<boolean> {
    return await this.prisma.$transaction(
      async (tx) => {
        // 1. Verify lease ownership: only update if still in PROCESSING and lockedAt matches our claim
        const updateResult = await tx.notificationOutbox.updateMany({
          where: {
            id: recordId,
            status: NotificationStatus.PROCESSING,
            lockedAt: claimedLockedAt,
          },
          data: {
            status,
            providerMessageId: outboxData.providerMessageId || null,
            lastErrorCode: outboxData.lastErrorCode || null,
            lastErrorMessage: outboxData.lastErrorMessage || null,
            nextAttemptAt: outboxData.nextAttemptAt || undefined,
            sentAt: outboxData.sentAt || null,
            skipReason: outboxData.skipReason || null,
            skippedAt: outboxData.skippedAt || null,
            lockedAt: null, // Release lease lock
            lastAttemptAt: attemptDetails.completedAt,
          },
        });

        if (updateResult.count === 0) {
          this.logger.warn(
            `[Lease Lost] Outbox record ${recordId} was reclaimed by another worker or lease expired. Discarding outcome to prevent stale state corruption.`,
          );
          return false;
        }

        // 2. Insert append-only delivery attempt record
        await tx.notificationDeliveryAttempt.create({
          data: {
            notificationOutboxId: recordId,
            attemptNumber: attemptDetails.attemptNumber,
            startedAt: attemptDetails.startedAt,
            completedAt: attemptDetails.completedAt,
            outcome: attemptDetails.outcome,
            errorCode: attemptDetails.errorCode || null,
            errorMessage: attemptDetails.errorMessage || null,
            providerMessageId: attemptDetails.providerMessageId || null,
            retryScheduled: attemptDetails.retryScheduled,
          },
        });

        return true;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 10000,
      },
    );
  }

  /**
   * Bounded Exponential Backoff with Jitter calculation:
   * Formula: delay = min(maxDelay, baseDelay * (2 ** (attempt - 1))) + jitter
   * Strictly uses `**`, never TypeScript `^` (which is bitwise XOR).
   */
  calculateNextAttempt(
    attemptCount: number,
    error?: EmailProviderError,
  ): { nextAttemptAt: Date | null; retryScheduled: boolean } {
    // 1. Permanent or Configuration errors are non-retryable
    if (error && !error.isRetryable) {
      return { nextAttemptAt: null, retryScheduled: false };
    }

    // 2. Maximum attempts exhausted
    if (attemptCount >= this.maxAttempts) {
      return { nextAttemptAt: null, retryScheduled: false };
    }

    // 3. Respect provider Retry-After header if present, bounded to safe range [1s, 3600s]
    if (
      typeof error?.retryAfterSeconds === 'number' &&
      Number.isFinite(error.retryAfterSeconds) &&
      error.retryAfterSeconds > 0
    ) {
      const MIN_RETRY_AFTER_SECONDS = 1;
      const MAX_RETRY_AFTER_SECONDS = 3600; // 1 hour cap
      const clampedSeconds = Math.max(
        MIN_RETRY_AFTER_SECONDS,
        Math.min(MAX_RETRY_AFTER_SECONDS, Math.round(error.retryAfterSeconds)),
      );
      const delayMs = clampedSeconds * 1000;
      return {
        nextAttemptAt: new Date(Date.now() + delayMs),
        retryScheduled: true,
      };
    }

    // 4. Exponential backoff with jitter
    const baseDelayMs = 30000; // 30 seconds
    const maxDelayMs = 3600000; // 1 hour cap
    const exponent = Math.max(0, attemptCount - 1);
    const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * (2 ** exponent));

    // Jitter: random between 0 and 20% of exponentialDelay
    const jitter = Math.floor(Math.random() * (exponentialDelay * 0.2));
    const totalDelayMs = exponentialDelay + jitter;

    return {
      nextAttemptAt: new Date(Date.now() + totalDelayMs),
      retryScheduled: true,
    };
  }

  /**
   * Sanitizes email addresses for logging without exposing recipient PII.
   */
  private maskEmail(email?: string | null): string {
    if (!email) return 'N/A';
    const parts = email.split('@');
    if (parts.length !== 2) return '[REDACTED]';
    const user = parts[0];
    const domain = parts[1];
    const maskedUser =
      user.length > 2
        ? `${user[0]}***${user[user.length - 1]}`
        : `${user[0]}***`;
    return `${maskedUser}@${domain}`;
  }

  /**
   * Sanitizes phone numbers for logging without exposing recipient PII.
   */
  private maskPhone(phone?: string | null): string {
    if (!phone) return 'N/A';
    const clean = phone.replace(/[\s\-\(\)\+]/g, '');
    if (clean.length < 4) return '[REDACTED]';
    return `+${clean.slice(0, 2)}••••${clean.slice(-4)}`;
  }
}
