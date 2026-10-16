import {
  EmailErrorCategory,
  SendEmailOptions,
} from './email.types';
import {
  MemoryEmailProvider,
  normalizeEmailError,
  EmailProviderException,
} from './memory-email.provider';
import { EmailConfigService } from './email-config.service';

describe('Email Provider & Configuration', () => {
  describe('MemoryEmailProvider', () => {
    let provider: MemoryEmailProvider;

    beforeEach(() => {
      provider = new MemoryEmailProvider();
      provider.clearSentEmails();
    });

    it('should explicitly identify as non-delivering adapter', () => {
      expect(provider.isDeliveryProvider()).toBe(false);
      expect(provider.getProviderName()).toBe('MEMORY_NON_DELIVERING');
    });

    it('should successfully record sent email in memory and return provider message ID', async () => {
      const options: SendEmailOptions = {
        to: 'parent@example.com',
        toName: 'Parent User',
        fromName: 'St. Jude Academy',
        fromEmail: 'notifications@stjude.edu',
        subject: 'Fee Receipt Confirmation',
        htmlBody: '<p>Thank you for your payment.</p>',
        textBody: 'Thank you for your payment.',
      };

      const result = await provider.sendEmail(options);

      expect(result.accepted).toBe(true);
      expect(result.providerMessageId).toMatch(/^msg_[0-9a-f\-]+$/);
      expect(result.timestamp).toBeInstanceOf(Date);

      const sent = provider.getSentEmails();
      expect(sent.length).toBe(1);
      expect(sent[0].to).toBe('parent@example.com');
      expect(sent[0].subject).toBe('Fee Receipt Confirmation');
    });

    it('should reject invalid recipient email format with permanent error', async () => {
      const options: SendEmailOptions = {
        to: 'invalid-email-address',
        subject: 'Test',
        htmlBody: '<p>Test</p>',
        textBody: 'Test',
      };

      await expect(provider.sendEmail(options)).rejects.toThrow(EmailProviderException);

      try {
        await provider.sendEmail(options);
      } catch (err: any) {
        expect(err.providerError.category).toBe(EmailErrorCategory.PERMANENT);
        expect(err.providerError.code).toBe('INVALID_RECIPIENT_EMAIL');
        expect(err.providerError.isRetryable).toBe(false);
      }
    });

    it('should handle simulated failure and throw classified EmailProviderException', async () => {
      const networkError = new Error('getaddrinfo ENOTFOUND smtp.provider.com');
      (networkError as any).code = 'ENOTFOUND';
      provider.simulateFailure(networkError);

      await expect(
        provider.sendEmail({
          to: 'parent@example.com',
          subject: 'Test',
          htmlBody: 'test',
          textBody: 'test',
        }),
      ).rejects.toThrow(EmailProviderException);

      provider.simulateFailure(null);
      const res = await provider.sendEmail({
        to: 'parent@example.com',
        subject: 'Test',
        htmlBody: 'test',
        textBody: 'test',
      });
      expect(res.accepted).toBe(true);
    });
  });

  describe('normalizeEmailError', () => {
    it('should classify connection timeouts and network resets as TRANSIENT and retryable', () => {
      const err = new Error('Connection timed out');
      (err as any).code = 'ETIMEDOUT';

      const normalized = normalizeEmailError(err);
      expect(normalized.category).toBe(EmailErrorCategory.TRANSIENT);
      expect(normalized.isRetryable).toBe(true);
      expect(normalized.code).toBe('ETIMEDOUT');
    });

    it('should classify rate limit 429 as TRANSIENT and preserve retryAfter seconds', () => {
      const err = new Error('Rate limit exceeded');
      (err as any).status = 429;
      (err as any).retryAfter = 60;

      const normalized = normalizeEmailError(err);
      expect(normalized.category).toBe(EmailErrorCategory.TRANSIENT);
      expect(normalized.isRetryable).toBe(true);
      expect(normalized.retryAfterSeconds).toBe(60);
    });

    it('should classify authentication/authorization failure as CONFIGURATION and non-retryable', () => {
      const err = new Error('Invalid API key provided');
      (err as any).statusCode = 401;

      const normalized = normalizeEmailError(err);
      expect(normalized.category).toBe(EmailErrorCategory.CONFIGURATION);
      expect(normalized.isRetryable).toBe(false);
      expect(normalized.message).toContain('Email provider authentication or configuration failed');
    });

    it('should redact Bearer tokens and API keys from error messages', () => {
      const err = new Error(
        'Failed to authorize with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret and api_key=abc123secretkey',
      );
      const normalized = normalizeEmailError(err);

      expect(normalized.message).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret');
      expect(normalized.message).not.toContain('abc123secretkey');
      expect(normalized.message).toContain('[REDACTED]');
    });
  });

  describe('EmailConfigService', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.NODE_ENV;
      delete process.env.EMAIL_PROVIDER;
      delete process.env.EMAIL_FROM_ADDRESS;
      delete process.env.EMAIL_DEFAULT_FROM_NAME;
      delete process.env.ALLOW_INSECURE_NON_DELIVERING_EMAIL;
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should initialize with safe defaults in test/development environment', () => {
      const configService = new EmailConfigService();
      expect(configService.provider).toBe('memory');
      expect(configService.fromAddress).toBe('notifications@schoolfee.internal');
      expect(configService.defaultFromName).toBe('School Fee Notification');
      expect(configService.isDeliveryProvider).toBe(false);
    });

    it('should fail clearly on unsupported provider names (e.g. smtp, custom, resend) instead of silent fallback', () => {
      process.env.EMAIL_PROVIDER = 'smtp';
      expect(() => new EmailConfigService()).toThrow(
        /Unsupported or unconfigured email provider 'smtp'/,
      );

      process.env.EMAIL_PROVIDER = 'custom';
      expect(() => new EmailConfigService()).toThrow(
        /Unsupported or unconfigured email provider 'custom'/,
      );

      process.env.EMAIL_PROVIDER = 'unsupported_vendor';
      expect(() => new EmailConfigService()).toThrow(
        /Unsupported or unconfigured email provider 'unsupported_vendor'/,
      );
    });

    it('should enforce production safety and reject non-delivering memory provider in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'memory';
      process.env.EMAIL_FROM_ADDRESS = 'bursar@stjude.edu';

      expect(() => new EmailConfigService()).toThrow(
        /Production safety violation: Cannot run with non-delivering "memory" email provider/,
      );
    });

    it('should reject memory provider in production even if obsolete ALLOW_INSECURE_NON_DELIVERING_EMAIL flag is set', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'memory';
      process.env.EMAIL_FROM_ADDRESS = 'bursar@stjude.edu';
      process.env.ALLOW_INSECURE_NON_DELIVERING_EMAIL = 'true';

      expect(() => new EmailConfigService()).toThrow(
        /Production safety violation: Cannot run with non-delivering "memory" email provider/,
      );
    });

    it('should validate tenant-provided reply-to address', () => {
      const configService = new EmailConfigService();
      expect(configService.validateReplyTo('valid.bursar@school.edu')).toBe('valid.bursar@school.edu');
      expect(configService.validateReplyTo('invalid-email-string')).toBeNull();
      expect(configService.validateReplyTo(null)).toBeNull();
      expect(configService.validateReplyTo('')).toBeNull();
    });
  });
});
