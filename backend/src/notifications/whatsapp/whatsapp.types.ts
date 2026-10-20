export enum WhatsAppErrorCategory {
  TRANSIENT = 'TRANSIENT',
  PERMANENT = 'PERMANENT',
  CONFIGURATION = 'CONFIGURATION',
}

export interface WhatsAppProviderError {
  category: WhatsAppErrorCategory;
  code: string;
  message: string;
  isRetryable: boolean;
  retryAfterSeconds?: number;
  originalErrorName?: string;
}

export interface WhatsAppTemplateComponentParameter {
  type: 'text' | 'currency' | 'date_time';
  text?: string;
  currency?: {
    fallback_value: string;
    code: string;
    amount_1000: number;
  };
  date_time?: {
    fallback_value: string;
  };
}

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'quick_reply' | 'url';
  index?: number;
  parameters: WhatsAppTemplateComponentParameter[];
}

export interface SendWhatsAppOptions {
  toPhone: string;
  recipientName?: string;
  templateName: string;
  languageCode?: string; // Default: 'en'
  parameters?: Record<string, string | number> | WhatsAppTemplateComponent[];
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

export interface WhatsAppSendResult {
  providerMessageId: string;
  accepted: boolean;
  timestamp: Date;
}
