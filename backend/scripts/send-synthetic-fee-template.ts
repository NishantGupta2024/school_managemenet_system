/**
 * Standalone Synthetic Fee Notification Template Testing Script
 *
 * Purpose:
 * Strictly for rendering and controlled preview/dispatch of synthetic fee notification
 * templates to Mailtrap Email Sandbox.
 *
 * Safety Invariants:
 * 1. Uses purely in-memory synthetic payloads.
 * 2. Requires single explicit template identifier: receipt, failed, pending, reminder, overdue, reversal.
 * 3. Requires mandatory CLI flag: --confirm before dispatching.
 * 4. Without --confirm, renders a local terminal preview and exits with ZERO network calls.
 * 5. Dispatches strictly to STAGING_QA_RECIPIENT via SmtpEmailProvider.
 * 6. Validates EMAIL_PROVIDER=smtp and SMTP_HOST=sandbox.smtp.mailtrap.io.
 * 7. Zero database queries or outbox writes.
 * 8. Zero automatic retries.
 * 9. Secrets and recipient email masked across all outputs.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { EmailTemplateRenderer } from '../src/notifications/templates/email-template.renderer';
import { validateEmailAddress } from '../src/notifications/templates/template-sanitizer';
import { EmailConfigService } from '../src/notifications/email/email-config.service';
import { SmtpEmailProvider } from '../src/notifications/email/smtp-email.provider';
import {
  FeeReminderTemplateData,
  PaymentFailedTemplateData,
  PaymentPendingTemplateData,
  PaymentReversedTemplateData,
  ReceiptIssuedTemplateData,
  RenderedEmail,
} from '../src/notifications/templates/template.types';

// Load environment files deterministically
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

export const ALLOWED_TEMPLATES = [
  'receipt',
  'failed',
  'pending',
  'reminder',
  'overdue',
  'reversal',
] as const;

export type AllowedTemplateId = (typeof ALLOWED_TEMPLATES)[number];

export interface SyntheticScriptOptions {
  template?: string;
  confirm?: boolean;
  emailProvider?: string;
  smtpHost?: string;
  smtpPort?: string | number;
  smtpUser?: string;
  smtpPass?: string;
  fromAddress?: string;
  fromName?: string;
  qaRecipient?: string;
}

export interface SyntheticScriptResult {
  success: boolean;
  templateId?: AllowedTemplateId;
  previewOnly: boolean;
  rendered?: RenderedEmail;
  dispatched: boolean;
  messageId?: string;
  error?: string;
  details?: Record<string, any>;
}

export class SyntheticFeeTemplateTester {
  private readonly renderer = new EmailTemplateRenderer();

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
   * Masks email address for safe log output (e.g. j***e@domain.com).
   */
  public static redactEmail(email: string): string {
    if (!email || !email.includes('@')) return '***';
    const [user, domain] = email.split('@');
    if (user.length <= 2) return `${user[0]}***@${domain}`;
    return `${user[0]}***${user[user.length - 1]}@${domain}`;
  }

  /**
   * Builds synthetic payload for the chosen template ID.
   */
  public static getSyntheticPayload(templateId: AllowedTemplateId): {
    templateKey: string;
    payload: any;
  } {
    switch (templateId) {
      case 'receipt':
        return {
          templateKey: 'RECEIPT_ISSUED',
          payload: {
            schoolName: 'Oakridge International School (Synthetic)',
            studentName: 'Aarav Sharma',
            admissionNumber: 'ADM-2026-0042',
            receiptNumber: 'RCPT-2026-0881',
            paymentNumber: 'PAY-2026-0914',
            paymentDate: '02 Nov 2026',
            paymentMethod: 'ONLINE_RAZORPAY',
            totalAmount: 15000,
            currency: 'INR',
            academicYear: '2026-2027',
            lineItems: [
              { feeHeadName: 'Tuition Fee - Q3', amount: 12000 },
              { feeHeadName: 'Laboratory Fee', amount: 3000 },
            ],
          } as ReceiptIssuedTemplateData,
        };

      case 'failed':
        return {
          templateKey: 'PAYMENT_FAILED',
          payload: {
            schoolName: 'Oakridge International School (Synthetic)',
            studentName: 'Aarav Sharma',
            admissionNumber: 'ADM-2026-0042',
            paymentNumber: 'PAY-2026-0915-FAIL',
            attemptedAmount: 15000,
            currency: 'INR',
            paymentMethod: 'UPI',
            failureReason: 'Payment authorization timed out by issuing bank',
            attemptedAt: '02 Nov 2026, 08:30 PM IST',
          } as PaymentFailedTemplateData,
        };

      case 'pending':
        return {
          templateKey: 'PAYMENT_PENDING',
          payload: {
            schoolName: 'Oakridge International School (Synthetic)',
            studentName: 'Aarav Sharma',
            admissionNumber: 'ADM-2026-0042',
            paymentNumber: 'PAY-2026-0916-PEND',
            paymentAmount: 15000,
            currency: 'INR',
            paymentMethod: 'CHEQUE',
            initiatedAt: '02 Nov 2026, 02:15 PM IST',
            verificationNotes: 'Cheque #882190 deposited at bank; awaiting clearance.',
          } as PaymentPendingTemplateData,
        };

      case 'reminder':
        return {
          templateKey: 'FEE_DUE_REMINDER',
          payload: {
            schoolName: 'Oakridge International School (Synthetic)',
            studentName: 'Aarav Sharma',
            admissionNumber: 'ADM-2026-0042',
            gradeName: 'Grade 8',
            sectionName: 'Section A',
            academicYearName: '2026-2027',
            billingMonthName: 'November 2026',
            milestone: 'DUE_IN_7_DAYS',
            dueDate: '10 Nov 2026',
            totalFeeAmount: 25000,
            paidAmount: 10000,
            balanceDue: 15000,
            currency: 'INR',
            lineItems: [{ feeHeadName: 'Term Tuition Fee', amount: 15000 }],
          } as FeeReminderTemplateData,
        };

      case 'overdue':
        return {
          templateKey: 'FEE_DUE_REMINDER',
          payload: {
            schoolName: 'Oakridge International School (Synthetic)',
            studentName: 'Aarav Sharma',
            admissionNumber: 'ADM-2026-0042',
            gradeName: 'Grade 8',
            sectionName: 'Section A',
            academicYearName: '2026-2027',
            billingMonthName: 'October 2026',
            milestone: 'OVERDUE',
            dueDate: '25 Oct 2026',
            daysOverdue: 8,
            totalFeeAmount: 25000,
            paidAmount: 10000,
            balanceDue: 15000,
            currency: 'INR',
          } as FeeReminderTemplateData,
        };

      case 'reversal':
        return {
          templateKey: 'PAYMENT_REVERSED',
          payload: {
            schoolName: 'Oakridge International School (Synthetic)',
            studentName: 'Aarav Sharma',
            admissionNumber: 'ADM-2026-0042',
            reversalNumber: 'REV-2026-0012',
            reversalType: 'BOUNCE',
            reversedAmount: 15000,
            currency: 'INR',
            originalPaymentNumber: 'PAY-2026-0810',
            originalReceiptNumber: 'RCPT-2026-0790',
            reason: 'Cheque dishonored due to drawer signature mismatch',
            reversalDate: '02 Nov 2026',
          } as PaymentReversedTemplateData,
        };
    }
  }

  /**
   * Main execution method.
   */
  public async execute(options?: SyntheticScriptOptions): Promise<SyntheticScriptResult> {
    console.log('================================================================================');
    console.log('SCHOOL FEE SYSTEM — SYNTHETIC FEE NOTIFICATION TEMPLATE TESTER');
    console.log('================================================================================');

    // 1. Parse template identifier
    let rawTemplate = options?.template;
    if (!rawTemplate) {
      const templateArg = process.argv.find((arg) => arg.startsWith('--template='));
      if (templateArg) {
        rawTemplate = templateArg.split('=')[1]?.trim();
      }
    }

    if (!rawTemplate) {
      const errMsg = `TEMPLATE_IDENTIFIER_MISSING: Please specify a template with --template=<id>. Allowed: [${ALLOWED_TEMPLATES.join(', ')}]`;
      console.error(`[FAIL] ${errMsg}`);
      return { success: false, previewOnly: true, dispatched: false, error: errMsg };
    }

    const templateId = rawTemplate.toLowerCase() as AllowedTemplateId;
    if (!ALLOWED_TEMPLATES.includes(templateId)) {
      const errMsg = `UNKNOWN_TEMPLATE: '${rawTemplate}' is not recognized. Allowed: [${ALLOWED_TEMPLATES.join(', ')}]`;
      console.error(`[FAIL] ${errMsg}`);
      return { success: false, previewOnly: true, dispatched: false, error: errMsg };
    }

    // 2. Render Template with purely in-memory synthetic payload
    console.log(`[RENDER] Generating synthetic payload for template: '${templateId}'...`);
    const { templateKey, payload } = SyntheticFeeTemplateTester.getSyntheticPayload(templateId);
    let rendered: RenderedEmail;
    try {
      rendered = this.renderer.render(templateKey, payload);
      console.log(`[RENDER] Success: Subject: "${rendered.subject}"`);
      console.log(`[RENDER] Content: Text length = ${rendered.text?.length || 0} chars, HTML length = ${rendered.html?.length || 0} chars`);
    } catch (renderErr: any) {
      const errMsg = `TEMPLATE_RENDER_ERROR: Failed to render '${templateId}': ${renderErr.message}`;
      console.error(`[FAIL] ${errMsg}`);
      return { success: false, templateId, previewOnly: true, dispatched: false, error: errMsg };
    }

    // 3. Evaluate Confirmation Flag
    const isConfirmed = options?.confirm ?? process.argv.includes('--confirm');
    if (!isConfirmed) {
      console.log('--------------------------------------------------------------------------------');
      console.log(`[PREVIEW MODE] --confirm flag not detected. Exiting safely WITHOUT SMTP dispatch.`);
      console.log(`Preview of rendered plain text:`);
      console.log('--- START PREVIEW ---');
      console.log(rendered.text.slice(0, 500) + (rendered.text.length > 500 ? '\n...[truncated]' : ''));
      console.log('--- END PREVIEW ---');
      console.log(`To dispatch this synthetic template to Mailtrap Sandbox, rerun with:`);
      console.log(`  npx ts-node backend/scripts/send-synthetic-fee-template.ts --template=${templateId} --confirm`);
      console.log('================================================================================');
      return {
        success: true,
        templateId,
        previewOnly: true,
        rendered,
        dispatched: false,
      };
    }

    // 4. Validate Staging SMTP Preconditions before sending
    console.log('--------------------------------------------------------------------------------');
    console.log('[CONFIRM] Verification flag present. Performing preflight checks before dispatch...');

    const provider = (options?.emailProvider !== undefined ? options.emailProvider : (process.env.EMAIL_PROVIDER || '')).trim().toLowerCase();
    const host = (options?.smtpHost !== undefined ? options.smtpHost : (process.env.SMTP_HOST || '')).trim();
    const port = options?.smtpPort !== undefined ? options.smtpPort : (process.env.SMTP_PORT || '587');
    const user = options?.smtpUser !== undefined ? options.smtpUser : (process.env.SMTP_USER || '');
    const pass = options?.smtpPass !== undefined ? options.smtpPass : (process.env.SMTP_PASS || '');
    const fromAddress = (options?.fromAddress !== undefined ? options.fromAddress : (process.env.EMAIL_FROM_ADDRESS || '')).trim();
    const fromName = options?.fromName || process.env.EMAIL_DEFAULT_FROM_NAME || 'School Fee System (Synthetic Test)';
    const qaRecipient = (options?.qaRecipient !== undefined ? options.qaRecipient : (process.env.STAGING_QA_RECIPIENT || process.env.QA_RECIPIENT || '')).trim();

    if (qaRecipient.includes(',') || qaRecipient.includes(';') || qaRecipient.includes(' ') || qaRecipient.includes('\n')) {
      const errMsg = `PREFLIGHT_FAIL: Multiple recipients detected. Dispatches strictly to ONE QA address`;
      console.error(`[FAIL] ${errMsg}`);
      return { success: false, templateId, previewOnly: false, rendered, dispatched: false, error: errMsg };
    }

    if (provider !== 'smtp') {
      const errMsg = `PREFLIGHT_FAIL: EMAIL_PROVIDER must be 'smtp' (current: '${provider || 'unset'}')`;
      console.error(`[FAIL] ${errMsg}`);
      return { success: false, templateId, previewOnly: false, rendered, dispatched: false, error: errMsg };
    }

    if (host !== 'sandbox.smtp.mailtrap.io') {
      const errMsg = `PREFLIGHT_FAIL: SMTP_HOST must strictly be 'sandbox.smtp.mailtrap.io' for synthetic sandbox testing (current: '${host || 'unset'}')`;
      console.error(`[FAIL] ${errMsg}`);
      return { success: false, templateId, previewOnly: false, rendered, dispatched: false, error: errMsg };
    }

    if (!user || !pass) {
      const errMsg = `PREFLIGHT_FAIL: SMTP_USER and SMTP_PASS credentials must be configured`;
      console.error(`[FAIL] ${errMsg}`);
      return { success: false, templateId, previewOnly: false, rendered, dispatched: false, error: errMsg };
    }

    if (!qaRecipient || !validateEmailAddress(qaRecipient)) {
      const errMsg = `PREFLIGHT_FAIL: STAGING_QA_RECIPIENT is missing or invalid`;
      console.error(`[FAIL] ${errMsg}`);
      return { success: false, templateId, previewOnly: false, rendered, dispatched: false, error: errMsg };
    }

    console.log(`[DISPATCH] Target QA Recipient: ${SyntheticFeeTemplateTester.redactEmail(qaRecipient)}`);
    console.log(`[DISPATCH] Connecting to Mailtrap Sandbox ${host}:${port} (Single send, zero retries)...`);

    try {
      // Temporarily sync process.env for standard EmailConfigService
      process.env.EMAIL_PROVIDER = provider;
      process.env.SMTP_HOST = host;
      process.env.SMTP_PORT = String(port);
      if (user) process.env.SMTP_USER = user;
      if (pass) process.env.SMTP_PASS = pass;
      process.env.EMAIL_FROM_ADDRESS = fromAddress || 'staging-notifications@schoolfee-pilot.internal';
      process.env.EMAIL_DEFAULT_FROM_NAME = fromName;

      const emailConfigService = new EmailConfigService();
      const smtpProvider = new SmtpEmailProvider(emailConfigService);

      const sendResult = await smtpProvider.sendEmail({
        to: qaRecipient,
        subject: rendered.subject,
        htmlBody: rendered.html,
        textBody: rendered.text,
        fromEmail: fromAddress || 'staging-notifications@schoolfee-pilot.internal',
        fromName,
      });

      console.log(`[SUCCESS] Mailtrap Sandbox accepted synthetic template '${templateId}':`);
      console.log(`  - Accepted:           ${sendResult.accepted}`);
      console.log(`  - Provider Message-ID: ${sendResult.providerMessageId || '(none)'}`);
      console.log('================================================================================');

      return {
        success: true,
        templateId,
        previewOnly: false,
        rendered,
        dispatched: true,
        messageId: sendResult.providerMessageId,
        details: {
          recipientRedacted: SyntheticFeeTemplateTester.redactEmail(qaRecipient),
          messageId: sendResult.providerMessageId,
        },
      };
    } catch (sendErr: any) {
      const sanitized = SyntheticFeeTemplateTester.sanitizeString(sendErr.message || 'Unknown SMTP error');
      console.error(`[FAIL] Dispatch failed: ${sanitized}`);
      console.log('================================================================================');
      return {
        success: false,
        templateId,
        previewOnly: false,
        rendered,
        dispatched: false,
        error: sanitized,
      };
    }
  }
}

// Allow direct CLI invocation
if (require.main === module) {
  const tester = new SyntheticFeeTemplateTester();
  tester
    .execute()
    .then((result) => {
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error(`FATAL: Unhandled error in template tester: ${err.message}`);
      process.exit(1);
    });
}
