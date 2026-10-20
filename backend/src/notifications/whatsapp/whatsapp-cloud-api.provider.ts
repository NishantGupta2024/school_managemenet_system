import { Injectable, Logger, Optional } from '@nestjs/common';
import { WhatsAppProvider } from './whatsapp-provider.interface';
import { WhatsAppConfigService } from './whatsapp-config.service';
import {
  SendWhatsAppOptions,
  WhatsAppErrorCategory,
  WhatsAppProviderError,
  WhatsAppSendResult,
  WhatsAppTemplateComponent,
} from './whatsapp.types';
import { normalizeWhatsAppError, WhatsAppProviderException } from './memory-whatsapp.provider';

export type HttpDispatcher = (
  url: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body: string;
    timeoutMs?: number;
  },
) => Promise<{ status: number; body: string }>;

/**
 * Normalizes phone numbers to Meta WhatsApp Cloud API format (E.164 digits without leading '+').
 * e.g., "+91 98765 43210" -> "919876543210".
 */
export function normalizeWhatsAppPhoneNumber(phone: string, defaultCountryCode = '91'): string {
  if (!phone || typeof phone !== 'string') {
    throw new Error('Phone number must be a non-empty string');
  }

  // Remove whitespace, dashes, brackets, and leading '+'
  const cleaned = phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');

  if (!/^\d+$/.test(cleaned)) {
    throw new Error(`Invalid phone number '${phone}': contains non-numeric characters`);
  }

  // If 10 digits (standard Indian mobile starting with 6, 7, 8, or 9), prepend defaultCountryCode
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    return `${defaultCountryCode}${cleaned}`;
  }

  // Validate E.164 length (between 8 and 15 digits)
  if (cleaned.length < 8 || cleaned.length > 15) {
    throw new Error(`Phone number '${phone}' has invalid length (${cleaned.length} digits). Expected 8-15 digits.`);
  }

  return cleaned;
}

@Injectable()
export class WhatsAppCloudApiProvider extends WhatsAppProvider {
  private readonly logger = new Logger(WhatsAppCloudApiProvider.name);

  constructor(
    private readonly configService: WhatsAppConfigService,
    @Optional() private readonly httpDispatcher?: HttpDispatcher,
  ) {
    super();
  }

  isDeliveryProvider(): boolean {
    return true;
  }

  getProviderName(): string {
    return 'META_WHATSAPP_CLOUD_API';
  }

  /**
   * Constructs and dispatches a template message via Meta WhatsApp Business Cloud API.
   * Completely isolated in test environments via injected httpDispatcher.
   */
  async sendWhatsAppMessage(options: SendWhatsAppOptions): Promise<WhatsAppSendResult> {
    const apiToken = this.configService.getApiToken();
    const phoneNumberId = this.configService.phoneNumberId;
    const apiVersion = this.configService.apiVersion;

    if (!apiToken || !phoneNumberId) {
      throw new WhatsAppProviderException({
        category: WhatsAppErrorCategory.CONFIGURATION,
        code: 'WHATSAPP_CONFIG_INCOMPLETE',
        message: 'WhatsApp Cloud API configuration is missing (WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID).',
        isRetryable: false,
      });
    }

    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeWhatsAppPhoneNumber(options.toPhone);
    } catch (phoneErr: any) {
      throw new WhatsAppProviderException({
        category: WhatsAppErrorCategory.PERMANENT,
        code: 'INVALID_RECIPIENT_PHONE',
        message: phoneErr.message || 'Structurally invalid recipient phone number',
        isRetryable: false,
      });
    }

    if (!options.templateName || !options.templateName.trim()) {
      throw new WhatsAppProviderException({
        category: WhatsAppErrorCategory.PERMANENT,
        code: 'MISSING_TEMPLATE_NAME',
        message: 'WhatsApp templateName is required for outbound business notifications.',
        isRetryable: false,
      });
    }

    // Build Meta Cloud API request payload
    const components = this.buildComponentsPayload(options.parameters);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: options.templateName,
        language: {
          code: options.languageCode || 'en',
        },
        ...(components.length > 0 ? { components } : {}),
      },
    };

    const endpointUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    if (!this.httpDispatcher) {
      // In production without injected mock dispatcher, safety check ensures no real external HTTP requests during offline audits
      throw new WhatsAppProviderException({
        category: WhatsAppErrorCategory.CONFIGURATION,
        code: 'HTTP_DISPATCHER_UNCONFIGURED',
        message: 'HTTP transport dispatcher is not configured. Live outbound WhatsApp dispatch is paused.',
        isRetryable: false,
      });
    }

    let response: { status: number; body: string };
    try {
      response = await this.httpDispatcher(endpointUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        timeoutMs: 15000,
      });
    } catch (netErr: any) {
      const normalized = normalizeWhatsAppError(netErr);
      throw new WhatsAppProviderException(normalized);
    }

    let parsedBody: any;
    try {
      parsedBody = JSON.parse(response.body);
    } catch {
      parsedBody = { raw: response.body };
    }

    if (response.status >= 400 || parsedBody?.error) {
      const classified = this.classifyMetaApiError(response.status, parsedBody?.error);
      throw new WhatsAppProviderException(classified);
    }

    const messageId = parsedBody?.messages?.[0]?.id || `wamid.unknown_${Date.now()}`;

    return {
      providerMessageId: messageId,
      accepted: true,
      timestamp: new Date(),
    };
  }

  /**
   * Formats key-value parameters or structured components into Meta's components array.
   */
  private buildComponentsPayload(parameters?: Record<string, string | number> | WhatsAppTemplateComponent[]) {
    if (!parameters) return [];
    if (Array.isArray(parameters)) return parameters;

    // Convert Record<string, string | number> to body parameters
    const bodyParams = Object.values(parameters).map((val) => ({
      type: 'text' as const,
      text: String(val),
    }));

    return [
      {
        type: 'body' as const,
        parameters: bodyParams,
      },
    ];
  }

  /**
   * Classifies Meta Graph API error response codes into structured WhatsAppProviderError.
   */
  classifyMetaApiError(status: number, errorObj?: any): WhatsAppProviderError {
    const code = errorObj?.code || status;
    const subcode = errorObj?.error_subcode;
    const rawMessage = errorObj?.message || `HTTP ${status} error from Meta Graph API`;

    // Redact tokens or internal parameters
    const sanitizedMessage = String(rawMessage)
      .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]+/gi, '$1[REDACTED]')
      .replace(/(access_token=)[a-zA-Z0-9_\-\.]+/gi, '$1[REDACTED]')
      .slice(0, 500);

    // Rate limiting or temporary server outages
    if (code === 1 || code === 2 || code === 4 || code === 17 || code === 341 || code === 368 || status === 429 || status >= 500) {
      return {
        category: WhatsAppErrorCategory.TRANSIENT,
        code: `META_${code}${subcode ? `_${subcode}` : ''}`,
        message: sanitizedMessage,
        isRetryable: true,
      };
    }

    // Authentication or permission configuration errors
    if (code === 190 || code === 100 || code === 200 || status === 401 || status === 403) {
      return {
        category: WhatsAppErrorCategory.CONFIGURATION,
        code: `META_${code}_CONFIG`,
        message: 'WhatsApp Cloud API authentication or permission failed (check Meta API token and app permissions)',
        isRetryable: false,
      };
    }

    // Permanent rejections: invalid template, unregistered phone, blocked
    return {
      category: WhatsAppErrorCategory.PERMANENT,
      code: `META_${code}${subcode ? `_${subcode}` : ''}`,
      message: sanitizedMessage,
      isRetryable: false,
    };
  }
}
