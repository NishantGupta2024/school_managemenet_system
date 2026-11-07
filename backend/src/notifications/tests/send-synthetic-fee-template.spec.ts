import {
  SyntheticFeeTemplateTester,
  ALLOWED_TEMPLATES,
  AllowedTemplateId,
} from '../../../scripts/send-synthetic-fee-template';
import { SmtpEmailProvider } from '../email/smtp-email.provider';

describe('SyntheticFeeTemplateTester (Isolated Safety Unit Tests)', () => {
  let tester: SyntheticFeeTemplateTester;
  let sendEmailSpy: jest.SpyInstance;

  beforeEach(() => {
    tester = new SyntheticFeeTemplateTester();
    // Strictly mock SmtpEmailProvider to prevent network/socket calls
    sendEmailSpy = jest.spyOn(SmtpEmailProvider.prototype, 'sendEmail').mockResolvedValue({
      accepted: true,
      providerMessageId: 'mailtrap-synthetic-msg-999',
      timestamp: new Date(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Template Inventory & Rendering Coverage', () => {
    ALLOWED_TEMPLATES.forEach((tplId: AllowedTemplateId) => {
      it(`renders allowed template '${tplId}' cleanly in preview mode`, async () => {
        const result = await tester.execute({
          template: tplId,
          confirm: false, // preview mode
        });

        expect(result.success).toBe(true);
        expect(result.templateId).toBe(tplId);
        expect(result.previewOnly).toBe(true);
        expect(result.dispatched).toBe(false);
        expect(result.rendered).toBeDefined();
        expect(result.rendered?.subject).toBeTruthy();
        expect(result.rendered?.html).toBeTruthy();
        expect(result.rendered?.text).toBeTruthy();
        // Assert zero SMTP calls in preview mode
        expect(sendEmailSpy).not.toHaveBeenCalled();
      });
    });

    it('rejects unknown template identifier', async () => {
      const result = await tester.execute({
        template: 'unknown_invoice_template',
        confirm: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("UNKNOWN_TEMPLATE: 'unknown_invoice_template' is not recognized");
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it('fails closed when template identifier is missing', async () => {
      const result = await tester.execute({
        template: '',
        confirm: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('TEMPLATE_IDENTIFIER_MISSING');
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });
  });

  describe('Preflight & Security Guardrails upon Confirmed Dispatch', () => {
    const validConfig = {
      template: 'receipt',
      confirm: true,
      emailProvider: 'smtp',
      smtpHost: 'sandbox.smtp.mailtrap.io',
      smtpPort: 587,
      smtpUser: 'valid_user_sandbox',
      smtpPass: 'valid_pass_sandbox',
      qaRecipient: 'qa-tester@school.internal',
    };

    it('rejects non-Mailtrap SMTP host for synthetic testing safety', async () => {
      const result = await tester.execute({
        ...validConfig,
        smtpHost: 'smtp.sendgrid.net', // Not allowed for synthetic testing
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("SMTP_HOST must strictly be 'sandbox.smtp.mailtrap.io'");
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it('fails closed when QA recipient is missing or invalid', async () => {
      const result = await tester.execute({
        ...validConfig,
        qaRecipient: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('STAGING_QA_RECIPIENT is missing or invalid');
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it('rejects multiple recipients separated by comma or semicolon', async () => {
      const result = await tester.execute({
        ...validConfig,
        qaRecipient: 'qa1@school.internal, qa2@school.internal',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Multiple recipients detected');
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it('fails closed when SMTP credentials are missing', async () => {
      const result = await tester.execute({
        ...validConfig,
        smtpUser: '',
        smtpPass: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('SMTP_USER and SMTP_PASS credentials must be configured');
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it('fails closed when EMAIL_PROVIDER is not smtp', async () => {
      const result = await tester.execute({
        ...validConfig,
        emailProvider: 'memory',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("EMAIL_PROVIDER must be 'smtp'");
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });
  });

  describe('Execution & Redaction Invariants', () => {
    it('executes single dispatch strictly to QA recipient when confirm is true', async () => {
      const result = await tester.execute({
        template: 'reminder',
        confirm: true,
        emailProvider: 'smtp',
        smtpHost: 'sandbox.smtp.mailtrap.io',
        smtpPort: 587,
        smtpUser: 'test_user',
        smtpPass: 'test_pass',
        qaRecipient: 'dedicated-qa@pilot-school.internal',
      });

      expect(result.success).toBe(true);
      expect(result.dispatched).toBe(true);
      expect(result.messageId).toBe('mailtrap-synthetic-msg-999');
      // Exactly 1 call
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      expect(sendEmailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'dedicated-qa@pilot-school.internal',
          subject: expect.stringContaining('Upcoming Fee Reminder'),
        }),
      );
    });

    it('redacts email and sanitizes credentials properly', () => {
      expect(SyntheticFeeTemplateTester.redactEmail('admin.testing@school.edu')).toBe('a***g@school.edu');
      const scrubbed = SyntheticFeeTemplateTester.sanitizeString(
        'Connection rejected with password=SuperSecretMailtrapPass99 and AUTH LOGIN dXNlcjpwYXNz',
      );
      expect(scrubbed).not.toContain('SuperSecretMailtrapPass99');
      expect(scrubbed).toContain('password=***');
      expect(scrubbed).toContain('AUTH LOGIN ***');
    });

    it('does not retry when SMTP dispatch throws an exception', async () => {
      sendEmailSpy.mockRejectedValueOnce(new Error('Connection timeout to Mailtrap sandbox'));

      const result = await tester.execute({
        template: 'overdue',
        confirm: true,
        emailProvider: 'smtp',
        smtpHost: 'sandbox.smtp.mailtrap.io',
        smtpPort: 587,
        smtpUser: 'test_user',
        smtpPass: 'test_pass',
        qaRecipient: 'qa@pilot-school.internal',
      });

      expect(result.success).toBe(false);
      expect(result.dispatched).toBe(false);
      expect(result.error).toContain('Connection timeout to Mailtrap sandbox');
      // Verify zero automatic retries
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    });
  });
});
