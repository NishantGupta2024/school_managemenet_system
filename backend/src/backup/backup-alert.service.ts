import { Injectable, Logger } from '@nestjs/common';
import { SmtpEmailProvider } from '../notifications/email/smtp-email.provider';
import { BackupFailureCategory } from './backup.types';

@Injectable()
export class BackupAlertService {
  private readonly logger = new Logger(BackupAlertService.name);
  private lastAlertTimestamp: Map<string, number> = new Map();
  private readonly alertCooldownMs = 15 * 60 * 1000; // 15-minute cooldown between duplicate alerts

  constructor(private readonly emailProvider: SmtpEmailProvider) {}

  /**
   * Dispatches an operational failure alert email strictly to platform administrators.
   * Excludes any sensitive database credentials, passwords, or encryption keys.
   */
  async sendFailureAlert(details: {
    backupId: string;
    failureCategory: BackupFailureCategory;
    sanitizedErrorMessage: string;
    targetDatabase: string;
    timestamp: Date;
  }): Promise<{ sent: boolean; reason?: string }> {
    const alertRecipient = process.env.DATABASE_BACKUP_ALERT_EMAIL;

    if (!alertRecipient) {
      this.logger.warn(
        `Backup failure alert skipped: DATABASE_BACKUP_ALERT_EMAIL is not configured. (Category: ${details.failureCategory}, Backup: ${details.backupId})`,
      );
      return { sent: false, reason: 'RECIPIENT_NOT_CONFIGURED' };
    }

    // Duplicate alert throttling: prevent email storms if consecutive failures occur rapidly
    const lastSent = this.lastAlertTimestamp.get(details.failureCategory);
    const now = Date.now();
    if (lastSent && now - lastSent < this.alertCooldownMs) {
      this.logger.warn(
        `Suppressed duplicate backup failure alert for '${details.failureCategory}' (Cooldown active: ${Math.round((this.alertCooldownMs - (now - lastSent)) / 1000)}s remaining)`,
      );
      return { sent: false, reason: 'COOLDOWN_ACTIVE' };
    }

    const subject = `[URGENT] Database Backup Operation Failed | ${details.failureCategory}`;
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fee2e2; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #dc2626; margin-top: 0;">Automated Backup Failure Alert</h2>
        <p style="color: #4b5563; font-size: 15px;">
          An automated database backup operation has failed on the School Fee Management System.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Backup ID:</td>
            <td style="padding: 8px 0; color: #111827; font-family: monospace;">${details.backupId}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Failure Category:</td>
            <td style="padding: 8px 0; color: #dc2626; font-weight: 600;">${details.failureCategory}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Target Database:</td>
            <td style="padding: 8px 0; color: #111827;">${details.targetDatabase}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Failure Timestamp:</td>
            <td style="padding: 8px 0; color: #111827;">${details.timestamp.toISOString()}</td>
          </tr>
        </table>
        <div style="background-color: #fef2f2; padding: 12px; border-left: 4px solid #ef4444; border-radius: 4px; margin-bottom: 20px;">
          <strong style="color: #991b1b;">Error Details:</strong>
          <p style="color: #b91c1c; font-family: monospace; font-size: 13px; margin: 6px 0 0 0; word-break: break-all;">
            ${details.sanitizedErrorMessage}
          </p>
        </div>
        <p style="color: #6b7280; font-size: 12px; margin-bottom: 0;">
          This is an automated operational system alert. No sensitive database contents, connection passwords, or encryption keys are transmitted in alerts.
        </p>
      </div>
    `;

    const textBody = `AUTOMATED BACKUP FAILURE ALERT\n\nBackup ID: ${details.backupId}\nCategory: ${details.failureCategory}\nTarget Database: ${details.targetDatabase}\nTimestamp: ${details.timestamp.toISOString()}\n\nError: ${details.sanitizedErrorMessage}\n\nPlease check server logs immediately.`;

    // Attempt delivery with single retry
    try {
      await this.emailProvider.sendEmail({
        to: alertRecipient,
        subject,
        htmlBody,
        textBody,
      });
      this.lastAlertTimestamp.set(details.failureCategory, now);
      this.logger.log(`Dispatched backup failure alert to ${alertRecipient}`);
      return { sent: true };
    } catch (err: any) {
      this.logger.error(
        `Failed to send backup failure email to ${alertRecipient}: ${err.message}. Retrying once...`,
      );
      try {
        await this.emailProvider.sendEmail({
          to: alertRecipient,
          subject: `${subject} [RETRY]`,
          htmlBody,
          textBody,
        });
        this.lastAlertTimestamp.set(details.failureCategory, now);
        return { sent: true };
      } catch (retryErr: any) {
        this.logger.error(
          `Backup alert retry failed: ${retryErr.message}. Alert dropped without blocking application.`,
        );
        return { sent: false, reason: `SMTP_RETRY_FAILED: ${retryErr.message}` };
      }
    }
  }
}
