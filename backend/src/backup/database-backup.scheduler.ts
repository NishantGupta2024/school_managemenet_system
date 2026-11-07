import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { DatabaseBackupService } from './database-backup.service';

@Injectable()
export class DatabaseBackupScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseBackupScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private isBackupInProgress = false;
  private isStopping = false;

  public readonly isEnabled: boolean;
  public readonly targetHourUtc: number;     // e.g. 20:30 UTC for 02:00 AM IST (UTC+5:30)
  public readonly targetMinuteUtc: number;
  public readonly checkIntervalMs: number;
  public readonly timezone: string;

  private lastRunDay: string | null = null;

  constructor(private readonly backupService: DatabaseBackupService) {
    this.isEnabled = process.env.DATABASE_BACKUP_ENABLED === 'true';
    this.timezone = process.env.DATABASE_BACKUP_TIMEZONE || 'Asia/Kolkata';

    // Support standard 02:00 AM daily cron expression or direct UTC target offsets.
    // If DATABASE_BACKUP_CRON_SCHEDULE is supplied (e.g. "0 2 * * *"), parse minute and hour.
    const cronSchedule = process.env.DATABASE_BACKUP_CRON_SCHEDULE?.trim();
    if (cronSchedule) {
      const parts = cronSchedule.split(/\s+/);
      if (parts.length >= 2) {
        const cronMinute = parseInt(parts[0], 10);
        const cronHour = parseInt(parts[1], 10);
        if (!isNaN(cronMinute) && !isNaN(cronHour)) {
          // If timezone is Asia/Kolkata (UTC+5:30), convert local hour/min to UTC
          if (this.timezone === 'Asia/Kolkata' || this.timezone === 'IST') {
            const totalMinutes = cronHour * 60 + cronMinute - 330;
            const normalizedMinutes = (totalMinutes + 1440) % 1440;
            this.targetHourUtc = Math.floor(normalizedMinutes / 60);
            this.targetMinuteUtc = normalizedMinutes % 60;
          } else {
            // Default to parsed values directly as UTC if non-IST timezone or explicitly configured
            this.targetHourUtc = cronHour;
            this.targetMinuteUtc = cronMinute;
          }
        } else {
          this.targetHourUtc = parseInt(process.env.DATABASE_BACKUP_TARGET_HOUR_UTC || '20', 10);
          this.targetMinuteUtc = parseInt(process.env.DATABASE_BACKUP_TARGET_MINUTE_UTC || '30', 10);
        }
      } else {
        this.targetHourUtc = parseInt(process.env.DATABASE_BACKUP_TARGET_HOUR_UTC || '20', 10);
        this.targetMinuteUtc = parseInt(process.env.DATABASE_BACKUP_TARGET_MINUTE_UTC || '30', 10);
      }
    } else {
      // Pilot default: 02:00 AM IST (which is 20:30 UTC of previous day)
      this.targetHourUtc = parseInt(process.env.DATABASE_BACKUP_TARGET_HOUR_UTC || '20', 10);
      this.targetMinuteUtc = parseInt(process.env.DATABASE_BACKUP_TARGET_MINUTE_UTC || '30', 10);
    }

    // Interval to poll if target time has arrived (default: every 60 seconds)
    this.checkIntervalMs = Math.max(
      10000,
      parseInt(process.env.DATABASE_BACKUP_CHECK_INTERVAL_MS || '60000', 10),
    );
  }

  onApplicationBootstrap() {
    if (!this.isEnabled) {
      this.logger.log('Database automated backup scheduler is DISABLED via configuration (DATABASE_BACKUP_ENABLED != true)');
      return;
    }

    this.logger.log(
      `Database automated backup scheduler initialized (Target: 02:00 ${this.timezone}, Check Interval: ${this.checkIntervalMs}ms)`,
    );
    this.scheduleNextTick();
  }

  onApplicationShutdown() {
    this.logger.log('Database backup scheduler shutting down gracefully...');
    this.isStopping = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextTick() {
    if (this.isStopping) return;
    this.timer = setTimeout(async () => {
      try {
        await this.checkAndTriggerScheduledBackup();
      } catch (err: any) {
        this.logger.error(`Error in database backup scheduler tick: ${err.message}`, err.stack);
      } finally {
        this.scheduleNextTick();
      }
    }, this.checkIntervalMs);
  }

  /**
   * Evaluates current time and triggers backup once daily during the target window.
   */
  async checkAndTriggerScheduledBackup(): Promise<boolean> {
    const now = new Date();
    const currentUtcHour = now.getUTCHours();
    const currentUtcMinute = now.getUTCMinutes();
    const todayKey = now.toISOString().split('T')[0];

    // Check if within the target execution minute window (±2 minutes) and hasn't run today
    const isHourMatch = currentUtcHour === this.targetHourUtc;
    const isMinuteMatch = Math.abs(currentUtcMinute - this.targetMinuteUtc) <= 2;

    if (isHourMatch && isMinuteMatch && this.lastRunDay !== todayKey) {
      this.logger.log(`Target scheduled backup time reached for ${todayKey}. Triggering automated backup.`);
      const success = await this.triggerBackupExecution();
      if (success) {
        this.lastRunDay = todayKey;
      }
      return success;
    }

    return false;
  }

  /**
   * Concurrency-safe execution trigger with mutual exclusion lock.
   */
  async triggerBackupExecution(): Promise<boolean> {
    if (this.isBackupInProgress) {
      this.logger.warn('Automated backup is already in progress. Skipping overlapping execution trigger.');
      return false;
    }

    this.isBackupInProgress = true;
    try {
      const result = await this.backupService.executeAutomatedBackup();
      return result.success;
    } catch (err: any) {
      this.logger.error(`Automated backup execution threw unhandled exception: ${err.message}`, err.stack);
      return false;
    } finally {
      this.isBackupInProgress = false;
    }
  }

  /**
   * Exposes lock status for observability and health endpoints.
   */
  public getStatus(): { isEnabled: boolean; isBackupInProgress: boolean; lastRunDay: string | null } {
    return {
      isEnabled: this.isEnabled,
      isBackupInProgress: this.isBackupInProgress,
      lastRunDay: this.lastRunDay,
    };
  }
}
