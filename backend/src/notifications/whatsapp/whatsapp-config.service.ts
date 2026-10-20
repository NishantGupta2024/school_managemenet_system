import { Injectable, Logger } from '@nestjs/common';

export const SUPPORTED_WHATSAPP_PROVIDERS = ['memory', 'cloud_api'] as const;
export type SupportedWhatsAppProvider = (typeof SUPPORTED_WHATSAPP_PROVIDERS)[number];

export interface WhatsAppPlatformConfig {
  provider: SupportedWhatsAppProvider;
  phoneNumberId?: string;
  apiVersion: string;
  isDeliveryProvider: boolean;
  businessAccountId?: string;
  hasApiToken: boolean;
}

@Injectable()
export class WhatsAppConfigService {
  private readonly logger = new Logger(WhatsAppConfigService.name);
  private readonly config: WhatsAppPlatformConfig;
  private readonly rawApiToken?: string;

  constructor() {
    const { config, apiToken } = this.loadAndValidateConfig();
    this.config = config;
    this.rawApiToken = apiToken;
  }

  private loadAndValidateConfig(): { config: WhatsAppPlatformConfig; apiToken?: string } {
    const isProduction = process.env.NODE_ENV === 'production';
    const rawProvider = (process.env.WHATSAPP_PROVIDER || 'memory').trim().toLowerCase();

    if (!SUPPORTED_WHATSAPP_PROVIDERS.includes(rawProvider as SupportedWhatsAppProvider)) {
      throw new Error(
        `Unsupported or unconfigured WhatsApp provider '${rawProvider}'. Permitted registered providers: [${SUPPORTED_WHATSAPP_PROVIDERS.join(
          ', ',
        )}].`,
      );
    }

    const provider = rawProvider as SupportedWhatsAppProvider;

    if (isProduction && provider === 'memory' && process.env.WHATSAPP_ENABLED === 'true') {
      throw new Error(
        'Production safety violation: Cannot run with non-delivering "memory" WhatsApp provider in production environment when WhatsApp is enabled.',
      );
    }

    const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim() || undefined;
    const apiToken = process.env.WHATSAPP_API_TOKEN?.trim() || undefined;
    const apiVersion = (process.env.WHATSAPP_API_VERSION || 'v21.0').trim();
    const businessAccountId = (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim() || undefined;

    if (provider === 'cloud_api') {
      if (isProduction && !phoneNumberId) {
        throw new Error('WHATSAPP_PHONE_NUMBER_ID is required in production when WHATSAPP_PROVIDER=cloud_api');
      }
      if (isProduction && !apiToken) {
        throw new Error('WHATSAPP_API_TOKEN is required in production when WHATSAPP_PROVIDER=cloud_api');
      }
      if (phoneNumberId && !/^\d+$/.test(phoneNumberId)) {
        throw new Error('WHATSAPP_PHONE_NUMBER_ID must be a numeric string ID assigned by Meta');
      }
    }

    const config: WhatsAppPlatformConfig = {
      provider,
      phoneNumberId,
      apiVersion,
      isDeliveryProvider: provider !== 'memory',
      businessAccountId,
      hasApiToken: Boolean(apiToken),
    };

    return { config, apiToken };
  }

  getConfig(): WhatsAppPlatformConfig {
    return { ...this.config };
  }

  get provider(): SupportedWhatsAppProvider {
    return this.config.provider;
  }

  get isDeliveryProvider(): boolean {
    return this.config.isDeliveryProvider;
  }

  get phoneNumberId(): string | undefined {
    return this.config.phoneNumberId;
  }

  get apiVersion(): string {
    return this.config.apiVersion;
  }

  getApiToken(): string | undefined {
    return this.rawApiToken;
  }
}
