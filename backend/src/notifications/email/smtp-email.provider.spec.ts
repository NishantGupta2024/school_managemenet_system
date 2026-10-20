import { SmtpEmailProvider, SmtpSessionClient } from './smtp-email.provider';
import { EmailConfigService, SmtpConfig } from './email-config.service';
import { EmailErrorCategory, SendEmailOptions } from './email.types';
import { EmailProviderException } from './memory-email.provider';

describe('SmtpEmailProvider — TLS Strategy & Protocol Security', () => {
  let provider: SmtpEmailProvider;
  let mockConfigService: Partial<EmailConfigService>;
  let mockSession: SmtpSessionClient;
  let executedProtocolActions: string[];

  const createMockSession = (overrides: Partial<SmtpSessionClient> = {}): SmtpSessionClient => {
    return {
      readGreeting: jest.fn().mockImplementation(async () => {
        executedProtocolActions.push('READ_GREETING');
        return '220 smtp.test.internal ESMTP Service Ready';
      }),
      sendEhlo: jest.fn().mockImplementation(async (domain: string) => {
        executedProtocolActions.push(`EHLO ${domain}`);
        return ['PIPELINING', 'STARTTLS', 'AUTH LOGIN PLAIN'];
      }),
      startTls: jest.fn().mockImplementation(async () => {
        executedProtocolActions.push('STARTTLS');
      }),
      authenticate: jest.fn().mockImplementation(async (user: string, pass: string) => {
        executedProtocolActions.push(`AUTH_LOGIN:${user}`);
      }),
      sendMailFrom: jest.fn().mockImplementation(async (from: string) => {
        executedProtocolActions.push(`MAIL_FROM:${from}`);
        return '250 OK';
      }),
      sendRcptTo: jest.fn().mockImplementation(async (to: string) => {
        executedProtocolActions.push(`RCPT_TO:${to}`);
        return '250 OK';
      }),
      sendData: jest.fn().mockImplementation(async (content: string) => {
        executedProtocolActions.push('DATA');
        return '250 OK: Message accepted';
      }),
      sendQuit: jest.fn().mockImplementation(async () => {
        executedProtocolActions.push('QUIT');
      }),
      close: jest.fn().mockImplementation(async () => {
        executedProtocolActions.push('CLOSE');
      }),
      ...overrides,
    };
  };

  beforeEach(() => {
    executedProtocolActions = [];
    mockConfigService = {
      getConfig: jest.fn().mockReturnValue({
        provider: 'smtp',
        fromAddress: 'bursar@school.internal',
        defaultFromName: 'Bursar Office',
        isDeliveryProvider: true,
        smtp: {
          host: 'smtp.mailtrap.io',
          port: 587,
          secure: false,
          requireTls: true,
          user: 'smtp_user',
          pass: 'super_secret_password',
          timeoutMs: 5000,
        },
      }),
      fromAddress: 'bursar@school.internal',
      defaultFromName: 'Bursar Office',
    };

    mockSession = createMockSession();
    provider = new SmtpEmailProvider(
      mockConfigService as EmailConfigService,
      (_config: SmtpConfig) => mockSession,
    );
  });

  it('identifies as delivery-capable provider', () => {
    expect(provider.isDeliveryProvider()).toBe(true);
    expect(provider.getProviderName()).toBe('SMTP_DELIVERY_PROVIDER');
  });

  it('correctly executes STARTTLS handshake on port 587 before authentication', async () => {
    const options: SendEmailOptions = {
      to: 'parent@example.com',
      toName: 'Parent User',
      subject: 'Fee Receipt Confirmation',
      htmlBody: '<p>Thank you for your payment.</p>',
      textBody: 'Thank you for your payment.',
    };

    const result = await provider.sendEmail(options);

    expect(result.accepted).toBe(true);
    expect(result.providerMessageId).toMatch(/^<[0-9\.]+\.[a-f0-9\-]+@smtp\.mailtrap\.io>$/);

    // Verify exact ordering: GREETING -> EHLO -> STARTTLS -> EHLO (post-TLS) -> AUTH -> MAIL -> RCPT -> DATA -> QUIT
    expect(executedProtocolActions).toEqual([
      'READ_GREETING',
      'EHLO schoolfee.internal',
      'STARTTLS',
      'EHLO schoolfee.internal',
      'AUTH_LOGIN:smtp_user',
      'MAIL_FROM:bursar@school.internal',
      'RCPT_TO:parent@example.com',
      'DATA',
      'QUIT',
      'CLOSE',
    ]);
  });

  it('fails closed and refuses authentication if server on port 587 does not advertise STARTTLS', async () => {
    mockSession = createMockSession({
      sendEhlo: jest.fn().mockImplementation(async (domain: string) => {
        executedProtocolActions.push(`EHLO ${domain}`);
        return ['PIPELINING', 'AUTH LOGIN PLAIN']; // Notice: NO STARTTLS!
      }),
    });

    provider = new SmtpEmailProvider(
      mockConfigService as EmailConfigService,
      () => mockSession,
    );

    const options: SendEmailOptions = {
      to: 'parent@example.com',
      subject: 'Test',
      htmlBody: 'test',
      textBody: 'test',
    };

    await expect(provider.sendEmail(options)).rejects.toThrow(EmailProviderException);

    // Proves authentication was NEVER sent!
    expect(executedProtocolActions).not.toContain('STARTTLS');
    expect(executedProtocolActions).not.toContain('AUTH_LOGIN:smtp_user');
    expect(mockSession.authenticate).not.toHaveBeenCalled();
    expect(mockSession.close).toHaveBeenCalledTimes(1);

    try {
      await provider.sendEmail(options);
    } catch (err: any) {
      expect(err.providerError.category).toBe(EmailErrorCategory.CONFIGURATION);
      expect(err.providerError.code).toBe('STARTTLS_NOT_SUPPORTED');
    }
  });

  it('supports implicit TLS on port 465 without STARTTLS negotiation', async () => {
    mockConfigService.getConfig = jest.fn().mockReturnValue({
      provider: 'smtp',
      fromAddress: 'bursar@school.internal',
      defaultFromName: 'Bursar Office',
      isDeliveryProvider: true,
      smtp: {
        host: 'smtp.mailtrap.io',
        port: 465,
        secure: true,
        requireTls: true,
        user: 'smtp_user',
        pass: 'super_secret_password',
        timeoutMs: 5000,
      },
    });

    provider = new SmtpEmailProvider(
      mockConfigService as EmailConfigService,
      () => mockSession,
    );

    const options: SendEmailOptions = {
      to: 'parent@example.com',
      subject: 'Test',
      htmlBody: 'test',
      textBody: 'test',
    };

    await provider.sendEmail(options);

    // Port 465 does implicit TLS at connect: no STARTTLS command needed
    expect(executedProtocolActions).not.toContain('STARTTLS');
    expect(executedProtocolActions).toContain('AUTH_LOGIN:smtp_user');
  });

  it('rejects invalid recipient email with PERMANENT exception without establishing session', async () => {
    const options: SendEmailOptions = {
      to: 'invalid-email',
      subject: 'Test',
      htmlBody: 'test',
      textBody: 'test',
    };

    await expect(provider.sendEmail(options)).rejects.toThrow(EmailProviderException);
    expect(mockSession.readGreeting).not.toHaveBeenCalled();
  });

  it('classifies 4xx SMTP response codes as TRANSIENT and retryable', () => {
    const error451 = { smtpCode: 451, message: '451 4.3.0 Mailbox busy; try again later' };
    const classified = provider.classifySmtpError(error451);

    expect(classified.category).toBe(EmailErrorCategory.TRANSIENT);
    expect(classified.code).toBe('SMTP_451');
    expect(classified.isRetryable).toBe(true);
  });

  it('classifies 535 SMTP authentication failure as CONFIGURATION', () => {
    const error535 = { smtpCode: 535, message: '535 5.7.8 Authentication credentials invalid' };
    const classified = provider.classifySmtpError(error535);

    expect(classified.category).toBe(EmailErrorCategory.CONFIGURATION);
    expect(classified.code).toBe('SMTP_535_AUTH_FAILED');
    expect(classified.isRetryable).toBe(false);
  });

  it('redacts sensitive password strings from error traces', () => {
    const rawError = new Error('SMTP connection error with password=super_secret_password and user=admin');
    const classified = provider.classifySmtpError(rawError);

    expect(classified.message).not.toContain('super_secret_password');
    expect(classified.message).toContain('password=[REDACTED]');
  });
});
