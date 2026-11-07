import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { FeeReminderService } from './fee-reminder.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Automated Fee Reminder Scheduler
 *
 * Runs a daily scan across all active schools to evaluate fee due milestones
 * (DUE_IN_7_DAYS, DUE_IN_1_DAY, DUE_TODAY, OVERDUE) and stage notification outbox records.
 *
 * Distributed Safety & Concurrency Architecture:
 * 1. Safe Transactional Staging: Only inserts outbox records within caller transactions.
 *    Does NOT send real emails or trigger network requests.
 * 2. Deterministic Idempotency: `FEE_REMINDER:${schoolId}:${invoiceId}:${milestone}:${targetDate}:${recipientKey}`
 *    guarantees that even if multiple application instances scan simultaneously or restart,
 *    `notification_outbox` @@unique([schoolId, idempotencyKey]) rejects duplicate rows.
 * 3. Overlapping Execution Guard: Uses in-process mutex flag `isScanInProgress` to prevent
 *    overlapping executions within the same instance.
 * 4. School Status & Timezone Scoping: Scans only schools where `status = 'ACTIVE'`.
 *    Computes milestone days relative to each school's configured timezone.
 * 5. Tenant Preference Guard: Bypasses schools where `feeReminderEmailEnabled === false`.
 */
@Injectable()
export class FeeReminderScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(FeeReminderScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private isScanInProgress = false;
  private isStopping = false;

  public readonly isEnabled: boolean;
  public readonly targetHourUtc: number; // Configurable hour for daily scan (0..23, e.g. 2 for ~08:00 AM IST)
  public readonly checkIntervalMs: number;
  private lastExecutedUtcDayKey: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly feeReminderService: FeeReminderService,
  ) {
    this.isEnabled = process.env.FEE_REMINDER_SCHEDULER_ENABLED === 'true';
    this.targetHourUtc = this.resolveTargetHourUtc(process.env.FEE_REMINDER_SCHEDULE_HOUR_UTC);
    const rawInterval = parseInt(process.env.FEE_REMINDER_CHECK_INTERVAL_MS || '3600000', 10);
    this.checkIntervalMs = Math.max(
      60000,
      Number.isFinite(rawInterval) ? rawInterval : 3600000,
    );
  }

  /**
   * Parses and validates FEE_REMINDER_SCHEDULE_HOUR_UTC within [0, 23].
   * Falls back safely to default hour 2 UTC if missing or invalid.
   */
  private resolveTargetHourUtc(rawValue?: string): number {
    const defaultHourUtc = 2;
    if (rawValue === undefined || rawValue.trim() === '') {
      return defaultHourUtc;
    }
    const trimmed = rawValue.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      this.logger.warn(
        `Invalid FEE_REMINDER_SCHEDULE_HOUR_UTC='${rawValue}' (must be an integer 0-23). Falling back to ${defaultHourUtc} UTC.`,
      );
      return defaultHourUtc;
    }
    const parsed = parseInt(trimmed, 10);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
      this.logger.warn(
        `Out-of-range FEE_REMINDER_SCHEDULE_HOUR_UTC='${rawValue}' (must be 0-23). Falling back to ${defaultHourUtc} UTC.`,
      );
      return defaultHourUtc;
    }
    return parsed;
  }

  onApplicationBootstrap() {
    if (!this.isEnabled) {
      this.logger.log('Fee reminder automated scheduler is DISABLED via configuration (FEE_REMINDER_SCHEDULER_ENABLED != true)');
      return;
    }

    this.logger.log(
      `Fee reminder automated scheduler initialized (targetHourUtc: ${this.targetHourUtc}, interval: ${this.checkIntervalMs}ms)`,
    );
    this.scheduleNextCheck();
  }

  onApplicationShutdown() {
    this.logger.log('Fee reminder automated scheduler shutting down gracefully...');
    this.isStopping = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextCheck() {
    if (this.isStopping) return;
    this.timer = setTimeout(async () => {
      try {
        await this.runScheduledScan({ enforceTargetHour: true, now: new Date() });
      } catch (err: any) {
        this.logger.error(`Unhandled error in fee reminder scheduler cycle: ${err.message}`, err.stack);
      } finally {
        this.scheduleNextCheck();
      }
    }, this.checkIntervalMs);
  }

  /**
   * Executes scheduled scan across all active schools.
   * When `options.enforceTargetHour` is true (used by periodic timer ticks), only executes
   * when `now.getUTCHours() === this.targetHourUtc` and at most once per UTC calendar day.
   * Can also be triggered programmatically in integration tests or on-demand admin runs.
   */
  async runScheduledScan(options?: {
    enforceTargetHour?: boolean;
    now?: Date;
  }): Promise<{
    schoolsScanned: number;
    totalEligibleInvoices: number;
    totalEnqueuedOutbox: number;
    totalSkipped: number;
    skippedReason?: string;
  }> {
    const referenceNow = options?.now ?? new Date();
    const enforceTargetHour = options?.enforceTargetHour === true;

    if (enforceTargetHour) {
      const currentHourUtc = referenceNow.getUTCHours();
      if (currentHourUtc !== this.targetHourUtc) {
        this.logger.debug(
          `Skipping fee reminder check: current UTC hour (${currentHourUtc}) != targetHourUtc (${this.targetHourUtc}).`,
        );
        return {
          schoolsScanned: 0,
          totalEligibleInvoices: 0,
          totalEnqueuedOutbox: 0,
          totalSkipped: 0,
          skippedReason: 'OUTSIDE_TARGET_HOUR_UTC',
        };
      }

      const utcDayKey = referenceNow.toISOString().slice(0, 10);
      if (this.lastExecutedUtcDayKey === utcDayKey) {
        this.logger.debug(
          `Skipping fee reminder check: daily scan already executed for UTC date ${utcDayKey}.`,
        );
        return {
          schoolsScanned: 0,
          totalEligibleInvoices: 0,
          totalEnqueuedOutbox: 0,
          totalSkipped: 0,
          skippedReason: 'ALREADY_EXECUTED_FOR_UTC_DATE',
        };
      }
    }

    if (this.isScanInProgress) {
      this.logger.warn('Fee reminder scan is already in progress. Skipping overlapping execution.');
      return {
        schoolsScanned: 0,
        totalEligibleInvoices: 0,
        totalEnqueuedOutbox: 0,
        totalSkipped: 0,
        skippedReason: 'SCAN_IN_PROGRESS',
      };
    }

    this.isScanInProgress = true;
    const summary = {
      schoolsScanned: 0,
      totalEligibleInvoices: 0,
      totalEnqueuedOutbox: 0,
      totalSkipped: 0,
    };

    try {
      this.logger.log('Starting automated fee reminder daily scan across active schools...');

      // Find all active schools
      const activeSchools = await this.prisma.school.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, timezone: true },
      });

      for (const school of activeSchools) {
        summary.schoolsScanned++;
        try {
          // Execute per-school reminder production within transaction
          await this.prisma.$transaction(async (tx) => {
            const result = await this.feeReminderService.produceReminders(
              tx,
              school.id,
              referenceNow,
              { dryRun: false, persistOutbox: true },
            );

            summary.totalEligibleInvoices += result.eligibleRemindersCount;
            summary.totalEnqueuedOutbox += result.enqueuedCount;
            summary.totalSkipped += result.skippedCount;

            if (result.enqueuedCount > 0) {
              this.logger.log(
                `School '${school.name}' (${school.id}): Staged ${result.enqueuedCount} fee reminder outbox records (${result.skippedCount} skipped, ${result.eligibleRemindersCount} eligible)`,
              );
            }
          });
        } catch (schoolErr: any) {
          this.logger.error(
            `Failed fee reminder scan for school '${school.name}' (${school.id}): ${schoolErr.message}`,
          );
        }
      }

      if (enforceTargetHour) {
        this.lastExecutedUtcDayKey = referenceNow.toISOString().slice(0, 10);
      }

      this.logger.log(
        `Completed fee reminder automated scan: Scanned ${summary.schoolsScanned} schools, Enqueued ${summary.totalEnqueuedOutbox} outbox records.`,
      );
      return summary;
    } finally {
      this.isScanInProgress = false;
    }
  }
}
