import { Injectable, Logger } from '@nestjs/common';
import { validateEmailAddress } from '../templates/template-sanitizer';

export const SUPPORTED_EMAIL_PROVIDERS = ['memory', 'smtp'] as const;
export type SupportedEmailProvider = (typeof SUPPORTED_EMAIL_PROVIDERS)[number];

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user?: string;
  pass?: string;
  timeoutMs: number;
}

export interface EmailPlatformConfig {
  provider: SupportedEmailProvider;
  fromAddress: string;
  defaultFromName: string;
  isDeliveryProvider: boolean;
  smtp?: SmtpConfig;
}

@Injectable()
export class EmailConfigService {
  private readonly logger = new Logger(EmailConfigService.name);
  private readonly config: EmailPlatformConfig;

  constructor() {
    this.config = this.loadAndValidateConfig();
  }

  private loadAndValidateConfig(): EmailPlatformConfig {
    const isProduction = process.env.NODE_ENV === 'production';
    const rawProvider = (process.env.EMAIL_PROVIDER || 'memory').trim().toLowerCase();

    // 1. Strict validation: only registered, implemented providers can be selected
    if (!SUPPORTED_EMAIL_PROVIDERS.includes(rawProvider as SupportedEmailProvider)) {
      throw new Error(
        `Unsupported or unconfigured email provider '${rawProvider}'. Permitted registered providers: [${SUPPORTED_EMAIL_PROVIDERS.join(
          ', ',
        )}]. Third-party providers (such as SMTP or cloud APIs) must have a registered adapter before use.`,
      );
    }

    const provider = rawProvider as SupportedEmailProvider;

    // 2. Production safety: prevent non-delivering providers in production
    if (isProduction && provider === 'memory') {
      throw new Error(
        'Production safety violation: Cannot run with non-delivering "memory" email provider in production environment. A real production delivery adapter must be configured.',
      );
    }

    // 3. Sender address validation
    const fromAddress = (process.env.EMAIL_FROM_ADDRESS || 'notifications@schoolfee.internal').trim();
    if (!validateEmailAddress(fromAddress)) {
      if (isProduction) {
        throw new Error('EMAIL_FROM_ADDRESS must be a valid email address in production environment');
      }
      this.logger.warn(
        `Invalid EMAIL_FROM_ADDRESS '${fromAddress}'. Falling back to safe default 'notifications@schoolfee.internal' for non-production environment.`,
      );
    }

    const defaultFromName = (process.env.EMAIL_DEFAULT_FROM_NAME || 'School Fee Notification').trim();

    // 4. SMTP configuration validation when provider is smtp
    let smtpConfig: SmtpConfig | undefined = undefined;
    if (provider === 'smtp') {
      const host = (process.env.SMTP_HOST || '').trim();
      const rawPort = parseInt(process.env.SMTP_PORT || '587', 10);
      const port = isNaN(rawPort) || rawPort <= 0 || rawPort > 65535 ? 587 : rawPort;
      const secure = process.env.SMTP_SECURE === 'true' || port === 465;
      const requireTls = process.env.SMTP_REQUIRE_TLS !== 'false'; // Enabled by default for port 587/STARTTLS
      const user = (process.env.SMTP_USER || '').trim() || undefined;
      const pass = process.env.SMTP_PASS || undefined;
      const timeoutMs = Math.max(1000, parseInt(process.env.SMTP_TIMEOUT_MS || '15000', 10));

      if (!host && isProduction) {
        throw new Error('SMTP_HOST is required in production when EMAIL_PROVIDER=smtp');
      }

      smtpConfig = {
        host: host || 'localhost',
        port,
        secure,
        requireTls,
        user,
        pass,
        timeoutMs,
      };
    }

    return {
      provider,
      fromAddress: validateEmailAddress(fromAddress) ? fromAddress : 'notifications@schoolfee.internal',
      defaultFromName: defaultFromName || 'School Fee Notification',
      isDeliveryProvider: provider !== 'memory',
      smtp: smtpConfig,
    };
  }

  getConfig(): EmailPlatformConfig {
    return { ...this.config };
  }

  get fromAddress(): string {
    return this.config.fromAddress;
  }

  get defaultFromName(): string {
    return this.config.defaultFromName;
  }

  get provider(): SupportedEmailProvider {
    return this.config.provider;
  }

  get isDeliveryProvider(): boolean {
    return this.config.isDeliveryProvider;
  }

  /**
   * Validates a tenant-supplied reply-to address before use in email headers.
   */
  validateReplyTo(replyTo?: string | null): string | null {
    if (!replyTo) {
      return null;
    }
    const trimmed = replyTo.trim();
    if (!validateEmailAddress(trimmed)) {
      this.logger.warn(`Rejected invalid reply-to email address: ${trimmed}`);
      return null;
    }
    return trimmed;
  }
}
