import { StagingSmtpCanaryRunner } from '../../../scripts/verify-staging-smtp-canary';
import { SmtpEmailProvider } from '../email/smtp-email.provider';

describe('StagingSmtpCanaryRunner (Isolated Safety Unit Tests)', () => {
  let runner: StagingSmtpCanaryRunner;
  let sendEmailSpy: jest.SpyInstance;

  beforeEach(() => {
    runner = new StagingSmtpCanaryRunner();
    // Spy on SmtpEmailProvider to strictly disallow real network/socket calls
    sendEmailSpy = jest.spyOn(SmtpEmailProvider.prototype, 'sendEmail').mockResolvedValue({
      accepted: true,
      providerMessageId: 'canary-mock-msg-12345',
      timestamp: new Date(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Preflight & Missing Configuration Validation', () => {
    it('fails closed when EMAIL_PROVIDER is not smtp', async () => {
      const result = await runner.execute({
        emailProvider: 'memory',
        smtpHost: 'smtp.staging.local',
        fromAddress: 'notifications@school.test',
        qaRecipient: 'qa@school.test',
        confirmFlag: true,
      });

      expect(result.preflightPassed).toBe(false);
      expect(result.canaryDispatched).toBe(false);
      expect(result.error).toContain('EMAIL_PROVIDER');
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it('fails closed when SMTP_HOST is missing', async () => {
      const result = await runner.execute({
        emailProvider: 'smtp',
        smtpHost: '',
        fromAddress: 'notifications@school.test',
        qaRecipient: 'qa@school.test',
        confirmFlag: true,
      });

      expect(result.preflightPassed).toBe(false);
      expect(result.canaryDispatched).toBe(false);
      expect(result.error).toContain('SMTP_HOST');
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it('fails closed when STAGING_QA_RECIPIENT is missing or invalid', async () => {
      const result = await runner.execute({
        emailProvider: 'smtp',
        smtpHost: 'smtp.staging.local',
        fromAddress: 'notifications@school.test',
        qaRecipient: '',
        confirmFlag: true,
      });

      expect(result.preflightPassed).toBe(false);
      expect(result.canaryDispatched).toBe(false);
      expect(result.error).toContain('STAGING_QA_RECIPIENT');
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it('rejects multiple recipients (comma/semicolon separated) for safety', async () => {
      const result = await runner.execute({
        emailProvider: 'smtp',
        smtpHost: 'smtp.staging.local',
        fromAddress: 'notifications@school.test',
        qaRecipient: 'qa1@school.test, qa2@school.test',
        confirmFlag: true,
      });

      expect(result.preflightPassed).toBe(false);
      expect(result.canaryDispatched).toBe(false);
      expect(result.error).toContain('Multiple recipients detected');
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });
  });

  describe('Confirmation Gate (--confirm-canary)', () => {
    it('passes preflight dry-run but exits WITHOUT dispatching when --confirm-canary is omitted', async () => {
      const result = await runner.execute({
        emailProvider: 'smtp',
        smtpHost: 'smtp.staging.local',
        fromAddress: 'notifications@school.test',
        qaRecipient: 'qa-single@school.test',
        confirmFlag: false, // flag omitted
      });

      expect(result.preflightPassed).toBe(true);
      expect(result.canaryDispatched).toBe(false);
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it('executes single dispatch when --confirm-canary is provided', async () => {
      const result = await runner.execute({
        emailProvider: 'smtp',
        smtpHost: 'smtp.staging.local',
        fromAddress: 'notifications@school.test',
        qaRecipient: 'qa-single@school.test',
        confirmFlag: true,
      });

      expect(result.preflightPassed).toBe(true);
      expect(result.canaryDispatched).toBe(true);
      expect(result.messageId).toBe('canary-mock-msg-12345');
      // Assert exactly one send call
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      expect(sendEmailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'qa-single@school.test',
          subject: expect.stringContaining('School Fee System — SMTP Staging Canary'),
        }),
      );
    });
  });

  describe('Secret Sanitization & Recipient Redaction', () => {
    it('redacts email addresses correctly in logs', () => {
      expect(StagingSmtpCanaryRunner.redactEmail('john.doe@example.com')).toBe('j***e@example.com');
      expect(StagingSmtpCanaryRunner.redactEmail('qa@domain.com')).toBe('q***@domain.com');
    });

    it('scrubs passwords and tokens from error strings', () => {
      const dirty = 'Error: SMTP connection failed with password=superSecretPassword123 and AUTH LOGIN dXNlcjpwYXNz';
      const clean = StagingSmtpCanaryRunner.sanitizeString(dirty);
      expect(clean).not.toContain('superSecretPassword123');
      expect(clean).toContain('password=***');
      expect(clean).toContain('AUTH LOGIN ***');
    });

    it('does not retry when SMTP dispatch throws an exception', async () => {
      sendEmailSpy.mockRejectedValueOnce(new Error('SMTP connection refused: 550 Invalid Auth password=secret123'));

      const result = await runner.execute({
        emailProvider: 'smtp',
        smtpHost: 'smtp.staging.local',
        fromAddress: 'notifications@school.test',
        qaRecipient: 'qa-single@school.test',
        confirmFlag: true,
      });

      expect(result.success).toBe(false);
      expect(result.canaryDispatched).toBe(false);
      expect(result.error).not.toContain('secret123');
      expect(result.error).toContain('password=***');
      // Verify NO retry took place
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    });
  });
});
