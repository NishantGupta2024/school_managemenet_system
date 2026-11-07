/**
 * Standalone Staging SMTP Canary Dispatch Script
 *
 * Purpose:
 * Strictly for controlled single-recipient operational validation of the SMTP transport.
 * Bypasses web routes, database outbox queues, schedulers, and parent records.
 *
 * Safety Invariants:
 * 1. Requires explicit CLI flag: --confirm-canary
 * 2. Requires dedicated internal recipient: STAGING_QA_RECIPIENT
 * 3. Sends exactly ONE synthetic technical diagnostic message.
 * 4. Zero automatic retries.
 * 5. Zero database connections, queries, or outbox writes.
 * 6. Secret redaction enforced across all outputs.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { validateEmailAddress } from '../src/notifications/templates/template-sanitizer';
import { EmailConfigService } from '../src/notifications/email/email-config.service';
import { SmtpEmailProvider } from '../src/notifications/email/smtp-email.provider';

// Load environment files deterministically
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

export interface CanaryExecutionConfig {
  emailProvider?: string;
  smtpHost?: string;
  smtpPort?: string | number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: string | boolean;
  smtpRequireTls?: string | boolean;
  fromAddress?: string;
  fromName?: string;
  qaRecipient?: string;
  confirmFlag?: boolean;
}

export interface CanaryExecutionResult {
  success: boolean;
  preflightPassed: boolean;
  canaryDispatched: boolean;
  messageId?: string;
  accepted?: boolean;
  error?: string;
  details?: Record<string, any>;
}

export class StagingSmtpCanaryRunner {
  /**
   * Sanitizes strings to prevent SMTP passwords or tokens from leaking.
   */
  public static sanitizeString(input: string): string {
    if (!input) return '';
    return input
      .replace(/pass(?:word)?\s*=\s*[^\s;&]+/gi, 'password=***')
      .replace(/AUTH\s+LOGIN\s+[a-zA-Z0-9+/=]+/gi, 'AUTH LOGIN ***');
  }

  /**
   * Redacts email address for safe log output (e.g. j***e@domain.com).
   */
  public static redactEmail(email: string): string {
    if (!email || !email.includes('@')) return '***';
    const [user, domain] = email.split('@');
    if (user.length <= 2) return `${user[0]}***@${domain}`;
    return `${user[0]}***${user[user.length - 1]}@${domain}`;
  }

  /**
   * Runs the canary verification sequence.
   */
  public async execute(configOverride?: CanaryExecutionConfig): Promise<CanaryExecutionResult> {
    const rawProvider = (configOverride?.emailProvider ?? process.env.EMAIL_PROVIDER ?? '').trim().toLowerCase();
    const rawHost = (configOverride?.smtpHost ?? process.env.SMTP_HOST ?? '').trim();
    const rawPort = configOverride?.smtpPort ?? process.env.SMTP_PORT ?? '587';
    const rawUser = configOverride?.smtpUser ?? process.env.SMTP_USER ?? '';
    const rawPass = configOverride?.smtpPass ?? process.env.SMTP_PASS ?? '';
    const rawFrom = (configOverride?.fromAddress ?? process.env.EMAIL_FROM_ADDRESS ?? '').trim();
    const fromName = configOverride?.fromName ?? process.env.EMAIL_DEFAULT_FROM_NAME ?? 'School Fee System (Staging)';
    const qaRecipient = (configOverride?.qaRecipient ?? process.env.STAGING_QA_RECIPIENT ?? process.env.QA_RECIPIENT ?? '').trim();
    const confirmFlag = configOverride?.confirmFlag ?? process.argv.includes('--confirm-canary');

    console.log('================================================================================');
    console.log('SCHOOL FEE MANAGEMENT SYSTEM — STAGING SMTP CANARY HARNESS');
    console.log('================================================================================');

    // 1. Preflight Validation: Configuration existence
    // 1. Preflight Validation: Configuration existence
    if (qaRecipient.includes(',') || qaRecipient.includes(';') || qaRecipient.includes(' ') || qaRecipient.includes('\n')) {
      const errMsg = 'RECIPIENT_SAFETY_VIOLATION: Multiple recipients detected. Canary dispatches strictly to exactly ONE address.';
      console.error(`[FAIL] ${errMsg}`);
      return {
        success: false,
        preflightPassed: false,
        canaryDispatched: false,
        error: errMsg,
      };
    }

    const missingFields: string[] = [];
    if (!rawProvider || rawProvider !== 'smtp') missingFields.push('EMAIL_PROVIDER (must be "smtp")');
    if (!rawHost) missingFields.push('SMTP_HOST');
    if (!rawFrom || !validateEmailAddress(rawFrom)) missingFields.push('EMAIL_FROM_ADDRESS (must be a valid email)');
    if (!qaRecipient || !validateEmailAddress(qaRecipient)) missingFields.push('STAGING_QA_RECIPIENT (must be a valid single email)');

    if (missingFields.length > 0) {
      const errMsg = `PREFLIGHT_CONFIG_ERROR: Required staging configuration missing: [${missingFields.join(', ')}]`;
      console.error(`[FAIL] ${errMsg}`);
      return {
        success: false,
        preflightPassed: false,
        canaryDispatched: false,
        error: errMsg,
      };
    }

    // Print Preflight Summary (with safe redactions)
    console.log('[PREFLIGHT] Configuration Verified:');
    console.log(`  - Provider:         ${rawProvider}`);
    console.log(`  - SMTP Relay Host:  ${rawHost}:${rawPort}`);
    console.log(`  - SMTP Auth User:   ${rawUser ? rawUser[0] + '***' : '(anonymous)'}`);
    console.log(`  - SMTP Auth Pass:   ${rawPass ? '*** (Configured)' : '(none)'}`);
    console.log(`  - Sender (From):    ${rawFrom}`);
    console.log(`  - Target QA Recip:  ${StagingSmtpCanaryRunner.redactEmail(qaRecipient)}`);
    console.log(`  - Confirmation Flag: ${confirmFlag ? 'PRESENT (--confirm-canary)' : 'MISSING'}`);
    console.log('--------------------------------------------------------------------------------');

    // 2. Preflight Validation: Explicit confirmation flag
    if (!confirmFlag) {
      const infoMsg = 'CONFIRMATION_REQUIRED: Preflight passed, but --confirm-canary was not provided. Exiting safely without connecting.';
      console.log(`[DRY-RUN] ${infoMsg}`);
      console.log('To execute real delivery, rerun with:');
      console.log('  npx ts-node backend/scripts/verify-staging-smtp-canary.ts --confirm-canary');
      console.log('================================================================================');
      return {
        success: true,
        preflightPassed: true,
        canaryDispatched: false,
        details: { note: infoMsg },
      };
    }

    // 3. Construct Standalone SMTP Client via existing provider
    console.log('[EXECUTION] Preparing synthetic canary payload...');
    const executionTimestamp = new Date().toISOString();
    const subject = `School Fee System — SMTP Staging Canary — [${executionTimestamp}]`;
    const textBody = [
      '====================================================================',
      'SCHOOL FEE MANAGEMENT SYSTEM — STAGING SMTP CANARY DIAGNOSTIC',
      '====================================================================',
      `Timestamp:   ${executionTimestamp}`,
      `Environment: staging`,
      `Target QA:   ${qaRecipient}`,
      `Sender:      ${rawFrom}`,
      '',
      'This is an automated operational diagnostic message generated by the standalone',
      'canary test harness. It verifies network routing, STARTTLS encryption,',
      'and SMTP relay acceptance.',
      '',
      'CONFIRMATION STANDARD: Server acceptance (250 Ok) confirms delivery to relay.',
      '====================================================================',
    ].join('\n');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #2563eb; margin-top: 0;">School Fee System — SMTP Staging Canary</h2>
        <p style="color: #4b5563; font-size: 14px;">
          This is an automated operational diagnostic message verifying the staging SMTP transport.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
          <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; color: #6b7280; font-weight: bold;">Timestamp:</td><td style="padding: 6px 0; color: #111827;">${executionTimestamp}</td></tr>
          <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; color: #6b7280; font-weight: bold;">Environment:</td><td style="padding: 6px 0; color: #111827;">staging</td></tr>
          <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; color: #6b7280; font-weight: bold;">Sender:</td><td style="padding: 6px 0; color: #111827;">${rawFrom}</td></tr>
          <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 6px 0; color: #6b7280; font-weight: bold;">Target QA Recipient:</td><td style="padding: 6px 0; color: #111827;">${StagingSmtpCanaryRunner.redactEmail(qaRecipient)}</td></tr>
        </table>
        <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 10px; font-size: 12px; color: #15803d;">
          <strong>Notice:</strong> Synthetic staging test only. No financial transactions, receipts, or parent notifications were generated.
        </div>
      </div>
    `;

    try {
      // Temporarily ensure process.env matches for the standard EmailConfigService
      process.env.EMAIL_PROVIDER = rawProvider;
      process.env.SMTP_HOST = rawHost;
      process.env.SMTP_PORT = String(rawPort);
      if (rawUser) process.env.SMTP_USER = rawUser;
      if (rawPass) process.env.SMTP_PASS = rawPass;
      process.env.EMAIL_FROM_ADDRESS = rawFrom;
      process.env.EMAIL_DEFAULT_FROM_NAME = fromName;

      const emailConfigService = new EmailConfigService();
      const smtpProvider = new SmtpEmailProvider(emailConfigService);

      console.log(`[EXECUTION] Connecting to SMTP relay ${rawHost}:${rawPort} (Single attempt, zero retries)...`);
      const sendResult = await smtpProvider.sendEmail({
        to: qaRecipient,
        subject,
        textBody,
        htmlBody,
        fromEmail: rawFrom,
        fromName,
      });

      console.log('[SUCCESS] SMTP Relay Accepted Canary Message:');
      console.log(`  - Accepted:           ${sendResult.accepted}`);
      console.log(`  - Provider Message-ID: ${sendResult.providerMessageId || '(none)'}`);
      console.log('================================================================================');

      return {
        success: true,
        preflightPassed: true,
        canaryDispatched: true,
        messageId: sendResult.providerMessageId,
        accepted: sendResult.accepted,
        details: {
          timestamp: executionTimestamp,
          recipientRedacted: StagingSmtpCanaryRunner.redactEmail(qaRecipient),
          messageId: sendResult.providerMessageId,
        },
      };
    } catch (err: any) {
      const sanitized = StagingSmtpCanaryRunner.sanitizeString(err.message || 'Unknown SMTP error');
      console.error(`[FAIL] SMTP Canary delivery failed: ${sanitized}`);
      console.log('================================================================================');
      return {
        success: false,
        preflightPassed: true,
        canaryDispatched: false,
        error: sanitized,
      };
    }
  }
}

// Allow direct CLI invocation
if (require.main === module) {
  const runner = new StagingSmtpCanaryRunner();
  runner
    .execute()
    .then((result) => {
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error(`FATAL: Unhandled exception in canary runner: ${err.message}`);
      process.exit(1);
    });
}
