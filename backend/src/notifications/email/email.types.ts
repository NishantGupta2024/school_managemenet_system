export enum EmailErrorCategory {
  TRANSIENT = 'TRANSIENT',
  PERMANENT = 'PERMANENT',
  CONFIGURATION = 'CONFIGURATION',
}

export interface EmailProviderError {
  category: EmailErrorCategory;
  code: string;
  message: string;
  isRetryable: boolean;
  retryAfterSeconds?: number;
  originalErrorName?: string;
}

export interface SendEmailOptions {
  to: string;
  toName?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

export interface EmailSendResult {
  providerMessageId: string;
  accepted: boolean;
  timestamp: Date;
}
