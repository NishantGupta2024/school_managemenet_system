import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { WhatsAppProvider } from './whatsapp-provider.interface';
import {
  SendWhatsAppOptions,
  WhatsAppErrorCategory,
  WhatsAppProviderError,
  WhatsAppSendResult,
} from './whatsapp.types';

export class WhatsAppProviderException extends Error {
  public readonly providerError: WhatsAppProviderError;

  constructor(providerError: WhatsAppProviderError) {
    super(providerError.message);
    this.name = 'WhatsAppProviderException';
    this.providerError = providerError;
  }
}

export function normalizeWhatsAppError(err: any): WhatsAppProviderError {
  if (err instanceof WhatsAppProviderException) {
    return err.providerError;
  }
  if (err?.providerError) {
    return err.providerError;
  }
  if (err?.category && err?.code && typeof err?.isRetryable === 'boolean') {
    return err;
  }

  const rawMsg = typeof err?.message === 'string' ? err.message : 'Unknown WhatsApp provider error';
  // Redact bearer tokens or api tokens
  const sanitizedMessage = rawMsg
    .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]+/gi, '$1[REDACTED]')
    .replace(/(token[:=]\s*)[a-zA-Z0-9_\-\.]+/gi, '$1[REDACTED]')
    .slice(0, 500);

  const rawCode = String(err?.code || err?.status || err?.statusCode || 'UNKNOWN');

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
      category: WhatsAppErrorCategory.TRANSIENT,
      code: rawCode,
      message: sanitizedMessage,
      isRetryable: true,
      retryAfterSeconds: typeof err?.retryAfter === 'number' ? err.retryAfter : undefined,
      originalErrorName: err?.name,
    };
  }

  if (
    rawCode === '401' ||
    rawCode === '403' ||
    rawCode === '190' ||
    /unauthorized/i.test(sanitizedMessage) ||
    /invalid.*token/i.test(sanitizedMessage)
  ) {
    return {
      category: WhatsAppErrorCategory.CONFIGURATION,
      code: rawCode,
      message: 'WhatsApp provider authentication or configuration failed (check API token / phone ID)',
      isRetryable: false,
      originalErrorName: err?.name,
    };
  }

  return {
    category: WhatsAppErrorCategory.PERMANENT,
    code: rawCode,
    message: sanitizedMessage,
    isRetryable: false,
    originalErrorName: err?.name,
  };
}

@Injectable()
export class MemoryWhatsAppProvider extends WhatsAppProvider {
  private sentMessages: Array<SendWhatsAppOptions & { messageId: string; timestamp: Date }> = [];
  private simulatedFailure: Error | null = null;

  isDeliveryProvider(): boolean {
    return false;
  }

  getProviderName(): string {
    return 'MEMORY_WHATSAPP_NON_DELIVERING';
  }

  async sendWhatsAppMessage(options: SendWhatsAppOptions): Promise<WhatsAppSendResult> {
    if (this.simulatedFailure) {
      throw this.simulatedFailure;
    }

    if (!options.toPhone || !options.toPhone.trim()) {
      throw new WhatsAppProviderException({
        category: WhatsAppErrorCategory.PERMANENT,
        code: 'INVALID_RECIPIENT_PHONE',
        message: 'Recipient phone number is missing or empty',
        isRetryable: false,
      });
    }

    if (!options.templateName || !options.templateName.trim()) {
      throw new WhatsAppProviderException({
        category: WhatsAppErrorCategory.PERMANENT,
        code: 'MISSING_TEMPLATE_NAME',
        message: 'WhatsApp templateName is required for outbound business notifications',
        isRetryable: false,
      });
    }

    const messageId = `wamid.mock_${Date.now()}_${crypto.randomUUID()}`;
    const timestamp = new Date();

    this.sentMessages.push({
      ...options,
      messageId,
      timestamp,
    });

    return {
      providerMessageId: messageId,
      accepted: true,
      timestamp,
    };
  }

  getSentMessages() {
    return [...this.sentMessages];
  }

  clearSentMessages() {
    this.sentMessages = [];
  }

  simulateFailure(error: Error | null) {
    this.simulatedFailure = error;
  }
}
