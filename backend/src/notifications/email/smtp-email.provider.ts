import { Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import * as net from 'net';
import * as tls from 'tls';
import { EmailProvider } from './email-provider.interface';
import { EmailConfigService, SmtpConfig } from './email-config.service';
import {
  EmailErrorCategory,
  EmailProviderError,
  EmailSendResult,
  SendEmailOptions,
} from './email.types';
import { EmailProviderException, normalizeEmailError } from './memory-email.provider';
import { validateEmailAddress } from '../templates/template-sanitizer';

export interface SmtpSessionClient {
  readGreeting(): Promise<string>;
  sendEhlo(domain: string): Promise<string[]>;
  startTls(): Promise<void>;
  authenticate(user: string, pass: string): Promise<void>;
  sendMailFrom(from: string): Promise<string>;
  sendRcptTo(to: string): Promise<string>;
  sendData(content: string): Promise<string>;
  sendQuit(): Promise<void>;
  close(): Promise<void>;
}

@Injectable()
export class SmtpEmailProvider extends EmailProvider {
  private readonly logger = new Logger(SmtpEmailProvider.name);

  constructor(
    private readonly configService: EmailConfigService,
    @Optional() private readonly sessionFactory?: (config: SmtpConfig) => SmtpSessionClient,
  ) {
    super();
  }

  isDeliveryProvider(): boolean {
    return true;
  }

  getProviderName(): string {
    return 'SMTP_DELIVERY_PROVIDER';
  }

  /**
   * Dispatches an email via SMTP with strict TLS / STARTTLS enforcement.
   */
  async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    if (!options.to || !validateEmailAddress(options.to)) {
      throw new EmailProviderException({
        category: EmailErrorCategory.PERMANENT,
        code: 'INVALID_RECIPIENT_EMAIL',
        message: `Recipient email '${options.to}' is missing or structurally invalid.`,
        isRetryable: false,
      });
    }

    const smtpConfig = this.configService.getConfig().smtp;
    if (!smtpConfig || !smtpConfig.host) {
      throw new EmailProviderException({
        category: EmailErrorCategory.CONFIGURATION,
        code: 'SMTP_CONFIG_MISSING',
        message: 'SMTP provider configuration is missing or incomplete (SMTP_HOST required).',
        isRetryable: false,
      });
    }

    const fromAddress = options.fromEmail || this.configService.fromAddress;
    const fromName = options.fromName || this.configService.defaultFromName;
    const messageId = `<${Date.now()}.${crypto.randomUUID()}@${smtpConfig.host || 'schoolfee.local'}>`;
    const boundary = `----=_Part_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    // Construct MIME multipart/alternative payload
    const headers = [
      `From: "${fromName.replace(/"/g, '')}" <${fromAddress}>`,
      `To: ${options.toName ? `"${options.toName.replace(/"/g, '')}" <${options.to}>` : options.to}`,
      `Subject: ${options.subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${messageId}`,
      options.replyTo ? `Reply-To: ${options.replyTo}` : null,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ].filter(Boolean);

    const bodyParts = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      options.textBody || '',
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      options.htmlBody || options.textBody || '',
      '',
      `--${boundary}--`,
    ];

    const emailContent = headers.join('\r\n') + '\r\n\r\n' + bodyParts.join('\r\n');

    try {
      const session = this.sessionFactory
        ? this.sessionFactory(smtpConfig)
        : new DefaultSmtpSessionClient(smtpConfig);

      try {
        await this.executeProtocolDialogue(session, smtpConfig, fromAddress, options.to, emailContent);
      } finally {
        await session.close();
      }

      return {
        providerMessageId: messageId,
        accepted: true,
        timestamp: new Date(),
      };
    } catch (err: any) {
      const classified = this.classifySmtpError(err);
      throw new EmailProviderException(classified);
    }
  }

  /**
   * Executes SMTP state machine with mandatory STARTTLS negotiation prior to auth.
   */
  async executeProtocolDialogue(
    session: SmtpSessionClient,
    config: SmtpConfig,
    fromAddress: string,
    toAddress: string,
    emailContent: string,
  ): Promise<void> {
    // 1. Initial 220 Greeting
    await session.readGreeting();

    // 2. Initial EHLO
    let capabilities = await session.sendEhlo('schoolfee.internal');

    // 3. TLS strategy: Port 465 (Implicit TLS) vs Port 587 (Explicit STARTTLS)
    let isTlsActive = config.secure;

    if (!isTlsActive) {
      const hasStartTls = capabilities.some((cap) => /STARTTLS/i.test(cap));

      // If requireTls is true (default for 587 / production), enforce STARTTLS before proceeding
      if (config.requireTls || config.port === 587) {
        if (!hasStartTls) {
          throw new EmailProviderException({
            category: EmailErrorCategory.CONFIGURATION,
            code: 'STARTTLS_NOT_SUPPORTED',
            message: `SMTP server at ${config.host}:${config.port} did not advertise STARTTLS. Refusing unencrypted connection.`,
            isRetryable: false,
          });
        }

        // Issue STARTTLS and upgrade socket
        await session.startTls();
        isTlsActive = true;

        // RFC 3207: Must re-issue EHLO after successful TLS upgrade
        capabilities = await session.sendEhlo('schoolfee.internal');
      }
    }

    // 4. Authentication (Strict rule: NEVER send credentials over unencrypted connection)
    if (config.user && config.pass) {
      if (!isTlsActive) {
        throw new EmailProviderException({
          category: EmailErrorCategory.CONFIGURATION,
          code: 'PLAINTEXT_AUTH_PROHIBITED',
          message: 'Plaintext authentication over unencrypted SMTP is strictly prohibited. TLS must be established first.',
          isRetryable: false,
        });
      }
      await session.authenticate(config.user, config.pass);
    }

    // 5. Transaction: MAIL FROM, RCPT TO, DATA, QUIT
    await session.sendMailFrom(fromAddress);
    await session.sendRcptTo(toAddress);
    await session.sendData(emailContent);
    await session.sendQuit();
  }

  /**
   * Classifies raw SMTP and connection errors into categorized EmailProviderError.
   */
  classifySmtpError(err: any): EmailProviderError {
    if (err instanceof EmailProviderException) {
      return err.providerError;
    }
    if (err?.providerError) {
      return err.providerError;
    }

    const rawMsg = typeof err?.message === 'string' ? err.message : 'Unknown SMTP failure';
    // Redact passwords, base64 strings, and auth tokens
    const sanitizedMessage = rawMsg
      .replace(/(password[:=]\s*)[^\s]+/gi, '$1[REDACTED]')
      .replace(/(auth\s+login\s+)[a-zA-Z0-9+/=]+/gi, '$1[REDACTED]')
      .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]+/gi, '$1[REDACTED]')
      .slice(0, 500);

    const smtpCode = err?.smtpCode || (typeof err?.message === 'string' && parseInt(err.message.slice(0, 3), 10));

    // Transient SMTP errors (4xx)
    if (smtpCode >= 400 && smtpCode < 500) {
      return {
        category: EmailErrorCategory.TRANSIENT,
        code: `SMTP_${smtpCode}`,
        message: sanitizedMessage,
        isRetryable: true,
      };
    }

    // Authentication failure (535)
    if (smtpCode === 535) {
      return {
        category: EmailErrorCategory.CONFIGURATION,
        code: 'SMTP_535_AUTH_FAILED',
        message: 'SMTP authentication failed. Check credentials.',
        isRetryable: false,
      };
    }

    // Permanent SMTP errors (5xx)
    if (smtpCode >= 500 && smtpCode < 600) {
      return {
        category: EmailErrorCategory.PERMANENT,
        code: `SMTP_${smtpCode}`,
        message: sanitizedMessage,
        isRetryable: false,
      };
    }

    // Network & connection level errors
    const normalized = normalizeEmailError(err);
    return {
      ...normalized,
      message: sanitizedMessage,
    };
  }
}

/**
 * Production implementation of SmtpSessionClient using raw net.Socket and tls.connect.
 */
export class DefaultSmtpSessionClient implements SmtpSessionClient {
  private socket: net.Socket | tls.TLSSocket;
  private buffer = '';
  private isClosed = false;

  constructor(private readonly config: SmtpConfig) {
    if (config.secure) {
      this.socket = tls.connect({
        host: config.host,
        port: config.port,
        timeout: config.timeoutMs || 15000,
        servername: config.host,
      });
    } else {
      this.socket = net.connect({
        host: config.host,
        port: config.port,
        timeout: config.timeoutMs || 15000,
      });
    }

    this.setupSocketTimeout();
  }

  private setupSocketTimeout() {
    this.socket.setTimeout(this.config.timeoutMs || 15000, () => {
      this.close();
      const err = new Error(`SMTP connection timed out after ${this.config.timeoutMs || 15000}ms to ${this.config.host}`);
      (err as any).code = 'ETIMEDOUT';
      throw err;
    });
  }

  async readGreeting(): Promise<string> {
    const line = await this.readLine();
    const code = parseInt(line.slice(0, 3), 10);
    if (code !== 220) {
      const err = new Error(`Invalid SMTP greeting from ${this.config.host}: ${line}`);
      (err as any).smtpCode = code;
      throw err;
    }
    return line;
  }

  async sendEhlo(domain: string): Promise<string[]> {
    this.socket.write(`EHLO ${domain}\r\n`);
    const capabilities: string[] = [];

    while (true) {
      const line = await this.readLine();
      const code = line.slice(0, 3);
      const separator = line.charAt(3);
      capabilities.push(line.slice(4).trim());

      if (code !== '250') {
        const err = new Error(`EHLO rejected by SMTP server: ${line}`);
        (err as any).smtpCode = parseInt(code, 10);
        throw err;
      }
      if (separator === ' ') {
        break; // End of multiline 250 response
      }
    }
    return capabilities;
  }

  async startTls(): Promise<void> {
    this.socket.write('STARTTLS\r\n');
    const line = await this.readLine();
    const code = parseInt(line.slice(0, 3), 10);
    if (code !== 220) {
      const err = new Error(`STARTTLS negotiation failed: ${line}`);
      (err as any).smtpCode = code;
      throw err;
    }

    // Upgrade the plaintext socket to TLS
    const rawSocket = this.socket as net.Socket;
    rawSocket.removeAllListeners('data');

    await new Promise<void>((resolve, reject) => {
      const upgraded = tls.connect(
        {
          socket: rawSocket,
          host: this.config.host,
          servername: this.config.host,
        },
        () => {
          this.socket = upgraded;
          this.setupSocketTimeout();
          resolve();
        },
      );
      upgraded.on('error', (err) => reject(err));
    });
  }

  async authenticate(user: string, pass: string): Promise<void> {
    this.socket.write('AUTH LOGIN\r\n');
    const res1 = await this.readLine();
    if (res1.slice(0, 3) !== '334') {
      const err = new Error(`AUTH LOGIN initiation rejected: ${res1}`);
      (err as any).smtpCode = parseInt(res1.slice(0, 3), 10);
      throw err;
    }

    this.socket.write(`${Buffer.from(user).toString('base64')}\r\n`);
    const res2 = await this.readLine();
    if (res2.slice(0, 3) !== '334') {
      const err = new Error(`SMTP user rejected: ${res2}`);
      (err as any).smtpCode = parseInt(res2.slice(0, 3), 10);
      throw err;
    }

    this.socket.write(`${Buffer.from(pass).toString('base64')}\r\n`);
    const res3 = await this.readLine();
    if (res3.slice(0, 3) !== '235') {
      const err = new Error(`SMTP authentication failed: ${res3}`);
      (err as any).smtpCode = parseInt(res3.slice(0, 3), 10);
      throw err;
    }
  }

  async sendMailFrom(from: string): Promise<string> {
    this.socket.write(`MAIL FROM:<${from}>\r\n`);
    const line = await this.readLine();
    const code = parseInt(line.slice(0, 3), 10);
    if (code !== 250) {
      const err = new Error(`MAIL FROM rejected: ${line}`);
      (err as any).smtpCode = code;
      throw err;
    }
    return line;
  }

  async sendRcptTo(to: string): Promise<string> {
    this.socket.write(`RCPT TO:<${to}>\r\n`);
    const line = await this.readLine();
    const code = parseInt(line.slice(0, 3), 10);
    if (code !== 250) {
      const err = new Error(`RCPT TO rejected: ${line}`);
      (err as any).smtpCode = code;
      throw err;
    }
    return line;
  }

  async sendData(content: string): Promise<string> {
    this.socket.write('DATA\r\n');
    const line1 = await this.readLine();
    if (line1.slice(0, 3) !== '354') {
      const err = new Error(`DATA command rejected: ${line1}`);
      (err as any).smtpCode = parseInt(line1.slice(0, 3), 10);
      throw err;
    }

    this.socket.write(`${content}\r\n.\r\n`);
    const line2 = await this.readLine();
    if (line2.slice(0, 3) !== '250') {
      const err = new Error(`DATA content submission rejected: ${line2}`);
      (err as any).smtpCode = parseInt(line2.slice(0, 3), 10);
      throw err;
    }
    return line2;
  }

  async sendQuit(): Promise<void> {
    try {
      this.socket.write('QUIT\r\n');
      await this.readLine();
    } catch {
      // Ignore clean shutdown response errors
    }
  }

  async close(): Promise<void> {
    if (!this.isClosed) {
      this.isClosed = true;
      this.socket.destroy();
    }
  }

  private readLine(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const checkBuffer = () => {
        const idx = this.buffer.indexOf('\r\n');
        if (idx !== -1) {
          const line = this.buffer.slice(0, idx);
          this.buffer = this.buffer.slice(idx + 2);
          return line;
        }
        return null;
      };

      const existing = checkBuffer();
      if (existing !== null) {
        return resolve(existing);
      }

      const onData = (data: Buffer) => {
        this.buffer += data.toString('utf-8');
        const line = checkBuffer();
        if (line !== null) {
          this.socket.removeListener('data', onData);
          this.socket.removeListener('error', onError);
          resolve(line);
        }
      };

      const onError = (err: Error) => {
        this.socket.removeListener('data', onData);
        this.socket.removeListener('error', onError);
        reject(err);
      };

      this.socket.on('data', onData);
      this.socket.on('error', onError);
    });
  }
}
