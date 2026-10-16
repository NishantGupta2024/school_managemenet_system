import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { EmailProvider } from './email-provider.interface';
import {
  EmailErrorCategory,
  EmailProviderError,
  EmailSendResult,
  SendEmailOptions,
} from './email.types';

export class EmailProviderException extends Error {
  public readonly providerError: EmailProviderError;

  constructor(providerError: EmailProviderError) {
    super(providerError.message);
    this.name = 'EmailProviderException';
    this.providerError = providerError;
  }
}

/**
 * Normalizes and sanitizes any raw provider exception into a classified, safe EmailProviderError.
 * Ensures credentials, tokens, or raw network dumps never leak into logs or audit entries.
 */
export function normalizeEmailError(err: any): EmailProviderError {
  if (err instanceof EmailProviderException) {
    return err.providerError;
  }
  if (err?.providerError) {
    return err.providerError;
  }
  if (err?.category && err?.code && typeof err?.isRetryable === 'boolean') {
    return err;
  }

  const rawMsg = typeof err?.message === 'string' ? err.message : 'Unknown provider error';
  // Strip any accidental bearer tokens or authorization headers
  const sanitizedMessage = rawMsg
    .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]+/gi, '$1[REDACTED]')
    .replace(/(api[_\-]?key[:=]\s*)[a-zA-Z0-9_\-\.]+/gi, '$1[REDACTED]')
    .slice(0, 500);

  const rawCode = String(err?.code || err?.status || err?.statusCode || 'UNKNOWN');

  // Classification logic
  if (
    rawCode === 'ECONNRESET' ||
    rawCode === 'ETIMEDOUT' ||
    rawCode === 'ENOTFOUND' ||
    rawCode === '429' ||
    rawCode === '500' ||
    rawCode === '502' ||
    rawCode === '503' ||
    rawCode === '504' ||
    /rate\s*limit/i.test(sanitizedMessage) ||
    /timeout/i.test(sanitizedMessage)
  ) {
    return {
      category: EmailErrorCategory.TRANSIENT,
      code: rawCode,
      message: sanitizedMessage,
      isRetryable: true,
      retryAfterSeconds:
        typeof err?.retryAfterSeconds === 'number'
          ? err.retryAfterSeconds
          : typeof err?.retryAfter === 'number'
          ? err.retryAfter
          : undefined,
      originalErrorName: err?.name,
    };
  }

  if (
    rawCode === '401' ||
    rawCode === '403' ||
    /unauthorized/i.test(sanitizedMessage) ||
    /forbidden/i.test(sanitizedMessage) ||
    /invalid.*api.*key/i.test(sanitizedMessage)
  ) {
    return {
      category: EmailErrorCategory.CONFIGURATION,
      code: rawCode,
      message: 'Email provider authentication or configuration failed (check platform credentials)',
      isRetryable: false,
      originalErrorName: err?.name,
    };
  }

  // Default to PERMANENT for bad recipient, unverified domain, syntax rejection, etc.
  return {
    category: EmailErrorCategory.PERMANENT,
    code: rawCode,
    message: sanitizedMessage,
    isRetryable: false,
    originalErrorName: err?.name,
  };
}

@Injectable()
export class MemoryEmailProvider extends EmailProvider {
  private readonly logger = new Logger(MemoryEmailProvider.name);
  private sentEmails: Array<SendEmailOptions & { result: EmailSendResult }> = [];
  private simulatedError: Error | null = null;

  async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    if (this.simulatedError) {
      const err = this.simulatedError;
      this.logger.warn(`Simulating provider failure: ${err.message}`);
      throw new EmailProviderException(normalizeEmailError(err));
    }

    // Basic recipient email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!options.to || !emailRegex.test(options.to)) {
      throw new EmailProviderException({
        category: EmailErrorCategory.PERMANENT,
        code: 'INVALID_RECIPIENT_EMAIL',
        message: `Recipient email format is invalid`,
        isRetryable: false,
      });
    }

    const result: EmailSendResult = {
      providerMessageId: `msg_${crypto.randomUUID()}`,
      accepted: true,
      timestamp: new Date(),
    };

    this.sentEmails.push({ ...options, result });
    this.logger.debug(`[MemoryEmailProvider] Dispatched email to ${options.to} (id: ${result.providerMessageId})`);

    return result;
  }

  isDeliveryProvider(): boolean {
    return false;
  }

  getProviderName(): string {
    return 'MEMORY_NON_DELIVERING';
  }

  getSentEmails() {
    return [...this.sentEmails];
  }

  clearSentEmails() {
    this.sentEmails = [];
  }

  simulateFailure(err: Error | null) {
    this.simulatedError = err;
  }
}
