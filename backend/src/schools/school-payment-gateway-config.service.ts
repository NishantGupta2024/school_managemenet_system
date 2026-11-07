import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GatewayEnvironment,
  GatewayProvider,
  GatewayStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import {
  ConfigurePaymentGatewayDto,
  PaymentGatewayConfigResponseDto,
  VerifyGatewayResultDto,
} from './dto/payment-gateway-config.dto';
import { validateRazorpayKeyEnvironment } from '../payments/razorpay-mode.validator';

@Injectable()
export class SchoolPaymentGatewayConfigService {
  private readonly logger = new Logger(SchoolPaymentGatewayConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {}

  /**
   * Fetches the sanitized gateway configuration for a school tenant.
   * Plaintext secrets and ciphertexts are NEVER returned.
   */
  async getConfig(
    schoolId: string,
  ): Promise<PaymentGatewayConfigResponseDto | null> {
    const config = await this.prisma.schoolPaymentGatewayConfig.findUnique({
      where: { schoolId },
    });

    if (!config) {
      return null;
    }

    return this.sanitizeConfigResponse(config);
  }

  /**
   * Creates or updates a school's Razorpay gateway configuration.
   * Re-encrypts secrets using AES-256-GCM.
   * If secret is omitted on update, preserves the existing encrypted secret.
   */
  async configure(
    schoolId: string,
    user: any,
    dto: ConfigurePaymentGatewayDto,
  ): Promise<PaymentGatewayConfigResponseDto> {
    // 1. Check for existing configuration so omitted environment on update preserves current environment
    const existing = await this.prisma.schoolPaymentGatewayConfig.findUnique({
      where: { schoolId },
    });

    const targetEnv: GatewayEnvironment =
      dto.environment || existing?.environment || GatewayEnvironment.TEST;

    // 2. Mandatory Safeguard: Validate Key ID against target Environment and check ALLOW_LIVE_PAYMENT_GATEWAY flag
    validateRazorpayKeyEnvironment(targetEnv, dto.keyId);

    // 3. Verify Crypto Service is properly configured with 256-bit master key
    if (!this.cryptoService.isConfigured()) {
      throw new InternalServerErrorException(
        'Payment gateway configuration service is unavailable: Encryption engine is not configured.',
      );
    }

    const isMaskedPlaceholder = (val?: string) =>
      !val || val.includes('••••') || val.trim().length === 0;

    let encryptedKeySecret: string;
    let keySecretIv: string;
    let keySecretAuthTag: string;

    let encryptedWebhookSecret: string | null = null;
    let webhookSecretIv: string | null = null;
    let webhookSecretAuthTag: string | null = null;

    let statusToSet: GatewayStatus = dto.status || GatewayStatus.PENDING_VERIFICATION;

    if (!existing) {
      // First-time configuration: keySecret is mandatory
      if (isMaskedPlaceholder(dto.keySecret)) {
        throw new BadRequestException(
          'Key Secret is required when configuring the payment gateway for the first time.',
        );
      }

      const encKey = this.cryptoService.encrypt(dto.keySecret!.trim());
      encryptedKeySecret = encKey.ciphertext;
      keySecretIv = encKey.iv;
      keySecretAuthTag = encKey.authTag;

      if (dto.webhookSecret && !isMaskedPlaceholder(dto.webhookSecret)) {
        const encWebhook = this.cryptoService.encrypt(dto.webhookSecret.trim());
        encryptedWebhookSecret = encWebhook.ciphertext;
        webhookSecretIv = encWebhook.iv;
        webhookSecretAuthTag = encWebhook.authTag;
      }
    } else {
      // Update existing configuration
      // A. Key Secret handling:
      if (dto.keySecret && !isMaskedPlaceholder(dto.keySecret)) {
        const encKey = this.cryptoService.encrypt(dto.keySecret.trim());
        encryptedKeySecret = encKey.ciphertext;
        keySecretIv = encKey.iv;
        keySecretAuthTag = encKey.authTag;
        // Secret replacement requires re-verification
        statusToSet = GatewayStatus.PENDING_VERIFICATION;
      } else {
        // Preserve existing encrypted key secret
        encryptedKeySecret = existing.encryptedKeySecret;
        keySecretIv = existing.keySecretIv;
        keySecretAuthTag = existing.keySecretAuthTag;
      }

      // If keyId or environment changed, force status back to PENDING_VERIFICATION
      if (existing.keyId !== dto.keyId || existing.environment !== targetEnv) {
        statusToSet = GatewayStatus.PENDING_VERIFICATION;
      }

      // B. Webhook Secret handling:
      if (dto.webhookSecret && !isMaskedPlaceholder(dto.webhookSecret)) {
        const encWebhook = this.cryptoService.encrypt(dto.webhookSecret.trim());
        encryptedWebhookSecret = encWebhook.ciphertext;
        webhookSecretIv = encWebhook.iv;
        webhookSecretAuthTag = encWebhook.authTag;
      } else {
        encryptedWebhookSecret = existing.encryptedWebhookSecret;
        webhookSecretIv = existing.webhookSecretIv;
        webhookSecretAuthTag = existing.webhookSecretAuthTag;
      }
    }

    const saved = await this.prisma.schoolPaymentGatewayConfig.upsert({
      where: { schoolId },
      create: {
        schoolId,
        provider: GatewayProvider.RAZORPAY,
        merchantName: dto.merchantName || null,
        keyId: dto.keyId,
        encryptedKeySecret,
        keySecretIv,
        keySecretAuthTag,
        encryptedWebhookSecret,
        webhookSecretIv,
        webhookSecretAuthTag,
        environment: targetEnv,
        status: statusToSet,
        lastVerifiedAt: statusToSet === GatewayStatus.PENDING_VERIFICATION ? null : existing?.lastVerifiedAt,
        lastVerificationError: statusToSet === GatewayStatus.PENDING_VERIFICATION ? null : existing?.lastVerificationError,
      },
      update: {
        merchantName: dto.merchantName !== undefined ? dto.merchantName : existing.merchantName,
        keyId: dto.keyId,
        encryptedKeySecret,
        keySecretIv,
        keySecretAuthTag,
        encryptedWebhookSecret,
        webhookSecretIv,
        webhookSecretAuthTag,
        environment: targetEnv,
        status: statusToSet,
        lastVerifiedAt: statusToSet === GatewayStatus.PENDING_VERIFICATION ? null : existing.lastVerifiedAt,
        lastVerificationError: statusToSet === GatewayStatus.PENDING_VERIFICATION ? null : existing.lastVerificationError,
      },
    });

    this.logger.log(
      `Gateway configuration updated for school ${schoolId} by user ${user?.id}. Status: ${saved.status}`,
    );

    return this.sanitizeConfigResponse(saved);
  }

  /**
   * Safely verifies Razorpay TEST credentials by executing a read-only API query.
   * Updates status to ACTIVE on success, or records error on failure.
   */
  async verify(schoolId: string, user: any): Promise<VerifyGatewayResultDto> {
    const config = await this.prisma.schoolPaymentGatewayConfig.findUnique({
      where: { schoolId },
    });

    if (!config) {
      throw new NotFoundException(
        'No payment gateway configuration found for this school.',
      );
    }

    validateRazorpayKeyEnvironment(config.environment, config.keyId);

    let keySecret: string;
    try {
      keySecret = this.cryptoService.decrypt({
        ciphertext: config.encryptedKeySecret,
        iv: config.keySecretIv,
        authTag: config.keySecretAuthTag,
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to decrypt gateway credentials for school ${schoolId}`,
      );
      throw new InternalServerErrorException(
        'Corrupted gateway credentials: Decryption failed. Please re-enter your Key Secret.',
      );
    }

    // Execute read-only verification call to Razorpay
    const verificationOutcome = await this.executeRazorpayVerification(
      config.keyId,
      keySecret,
    );

    const testedAt = new Date();

    if (verificationOutcome.success) {
      await this.prisma.schoolPaymentGatewayConfig.update({
        where: { schoolId },
        data: {
          status: GatewayStatus.ACTIVE,
          lastVerifiedAt: testedAt,
          lastVerificationError: null,
        },
      });

      this.logger.log(
        `Payment gateway verified successfully for school ${schoolId}. Status: ACTIVE.`,
      );

      return {
        success: true,
        status: GatewayStatus.ACTIVE,
        message: 'Successfully connected and verified Razorpay credentials',
        testedAt,
        error: null,
      };
    } else {
      await this.prisma.schoolPaymentGatewayConfig.update({
        where: { schoolId },
        data: {
          status: GatewayStatus.PENDING_VERIFICATION,
          lastVerifiedAt: testedAt,
          lastVerificationError: verificationOutcome.error || 'Authentication failed',
        },
      });

      this.logger.warn(
        `Payment gateway verification failed for school ${schoolId}: ${verificationOutcome.error}`,
      );

      return {
        success: false,
        status: GatewayStatus.PENDING_VERIFICATION,
        message: 'Verification failed: Authentication rejected by Razorpay',
        testedAt,
        error: verificationOutcome.error,
      };
    }
  }

  /**
   * Disables or disconnects the payment gateway for a school.
   */
  async disconnect(
    schoolId: string,
    user: any,
  ): Promise<{ success: boolean; message: string }> {
    const config = await this.prisma.schoolPaymentGatewayConfig.findUnique({
      where: { schoolId },
    });

    if (!config) {
      throw new NotFoundException(
        'No payment gateway configuration found for this school.',
      );
    }

    await this.prisma.schoolPaymentGatewayConfig.update({
      where: { schoolId },
      data: {
        status: GatewayStatus.DISABLED,
      },
    });

    this.logger.log(
      `Payment gateway disabled for school ${schoolId} by user ${user?.id}.`,
    );

    return {
      success: true,
      message: 'Payment gateway has been disabled successfully.',
    };
  }

  /**
   * Internal helper for downstream payment and webhook services to retrieve decrypted keys.
   * Strictly internal; NEVER exposed over HTTP endpoints.
   */
  async decryptCredentialsForInternalUse(schoolId: string): Promise<{
    keyId: string;
    keySecret: string;
    webhookSecret?: string;
    environment: GatewayEnvironment;
    status: GatewayStatus;
  }> {
    const config = await this.prisma.schoolPaymentGatewayConfig.findUnique({
      where: { schoolId },
    });

    if (!config) {
      throw new NotFoundException(
        'Payment gateway is not configured for this school.',
      );
    }

    if (config.status !== GatewayStatus.ACTIVE) {
      throw new BadRequestException(
        `Payment gateway is currently ${config.status}. Only ACTIVE gateways can process payments.`,
      );
    }

    const keySecret = this.cryptoService.decrypt({
      ciphertext: config.encryptedKeySecret,
      iv: config.keySecretIv,
      authTag: config.keySecretAuthTag,
    });

    let webhookSecret: string | undefined;
    if (
      config.encryptedWebhookSecret &&
      config.webhookSecretIv &&
      config.webhookSecretAuthTag
    ) {
      webhookSecret = this.cryptoService.decrypt({
        ciphertext: config.encryptedWebhookSecret,
        iv: config.webhookSecretIv,
        authTag: config.webhookSecretAuthTag,
      });
    }

    return {
      keyId: config.keyId,
      keySecret,
      webhookSecret,
      environment: config.environment,
      status: config.status,
    };
  }

  /**
   * Executes a read-only HTTP GET to Razorpay API with timeout.
   * Mockable during automated tests.
   */
  protected async executeRazorpayVerification(
    keyId: string,
    keySecret: string,
  ): Promise<{ success: boolean; error?: string }> {
    const endpoint = 'https://api.razorpay.com/v1/payments?count=1';
    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          'User-Agent': 'SchoolFeeManagementSaaS/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 200) {
        return { success: true };
      }

      if (response.status === 401) {
        return {
          success: false,
          error: 'Invalid Key ID or Key Secret for Razorpay TEST account',
        };
      }

      const statusText = response.statusText || `HTTP ${response.status}`;
      return {
        success: false,
        error: `Razorpay API returned error: ${statusText}`,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return {
          success: false,
          error: 'Connection to Razorpay API timed out after 7 seconds',
        };
      }
      return {
        success: false,
        error: 'Unable to reach Razorpay API: Network or DNS failure',
      };
    }
  }

  /**
   * Formats database entity into sanitized response DTO.
   */
  private sanitizeConfigResponse(
    entity: any,
  ): PaymentGatewayConfigResponseDto {
    let keySecretMasked = '••••••••••••••••';
    try {
      const decrypted = this.cryptoService.decrypt({
        ciphertext: entity.encryptedKeySecret,
        iv: entity.keySecretIv,
        authTag: entity.keySecretAuthTag,
      });
      keySecretMasked = this.cryptoService.maskSecret(decrypted);
    } catch {
      keySecretMasked = '••••••••••••••••';
    }

    let webhookSecretMasked: string | null = null;
    if (
      entity.encryptedWebhookSecret &&
      entity.webhookSecretIv &&
      entity.webhookSecretAuthTag
    ) {
      try {
        const decryptedWh = this.cryptoService.decrypt({
          ciphertext: entity.encryptedWebhookSecret,
          iv: entity.webhookSecretIv,
          authTag: entity.webhookSecretAuthTag,
        });
        webhookSecretMasked = this.cryptoService.maskSecret(decryptedWh);
      } catch {
        webhookSecretMasked = '••••••••••••••••';
      }
    }

    return {
      id: entity.id,
      schoolId: entity.schoolId,
      provider: entity.provider,
      merchantName: entity.merchantName,
      keyId: entity.keyId,
      keySecretMasked,
      hasKeySecret: true,
      hasWebhookSecret: !!entity.encryptedWebhookSecret,
      webhookSecretMasked,
      environment: entity.environment,
      status: entity.status,
      lastVerifiedAt: entity.lastVerifiedAt,
      lastVerificationError: entity.lastVerificationError,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
