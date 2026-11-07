import { BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { SchoolPaymentGatewayConfigService } from './school-payment-gateway-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { GatewayEnvironment, GatewayProvider, GatewayStatus } from '@prisma/client';

describe('SchoolPaymentGatewayConfigService', () => {
  let service: SchoolPaymentGatewayConfigService;
  let prisma: any;
  let cryptoService: CryptoService;

  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const SCHOOL_ID = 'school-alpha-uuid-1111';
  const USER = { id: 'user-admin-1', role: 'SCHOOL_ADMIN' };

  beforeEach(() => {
    cryptoService = new CryptoService(undefined, TEST_KEY);

    prisma = {
      schoolPaymentGatewayConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new SchoolPaymentGatewayConfigService(prisma as PrismaService, cryptoService);
  });

  describe('getConfig', () => {
    it('should return null when school has no configuration', async () => {
      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue(null);

      const result = await service.getConfig(SCHOOL_ID);
      expect(result).toBeNull();
      expect(prisma.schoolPaymentGatewayConfig.findUnique).toHaveBeenCalledWith({
        where: { schoolId: SCHOOL_ID },
      });
    });

    it('should return sanitized and masked configuration without plaintext secrets or ciphertexts', async () => {
      const encrypted = cryptoService.encrypt('rzp_test_secret_99887766');
      const mockRecord = {
        id: 'cfg-1',
        schoolId: SCHOOL_ID,
        provider: GatewayProvider.RAZORPAY,
        merchantName: 'Greenwood High',
        keyId: 'rzp_test_51AbcDef',
        encryptedKeySecret: encrypted.ciphertext,
        keySecretIv: encrypted.iv,
        keySecretAuthTag: encrypted.authTag,
        encryptedWebhookSecret: null,
        webhookSecretIv: null,
        webhookSecretAuthTag: null,
        environment: GatewayEnvironment.TEST,
        status: GatewayStatus.ACTIVE,
        lastVerifiedAt: new Date('2026-10-22T00:00:00Z'),
        lastVerificationError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue(mockRecord);

      const result = await service.getConfig(SCHOOL_ID);

      expect(result).not.toBeNull();
      expect(result!.keyId).toBe('rzp_test_51AbcDef');
      expect(result!.keySecretMasked).toBe('••••••••••••••••7766');
      expect(result!.hasKeySecret).toBe(true);
      expect(result!.hasWebhookSecret).toBe(false);
      expect(result!.status).toBe(GatewayStatus.ACTIVE);

      // Verify sensitive ciphertext fields are completely stripped from response DTO
      expect((result as any).encryptedKeySecret).toBeUndefined();
      expect((result as any).keySecretIv).toBeUndefined();
      expect((result as any).keySecretAuthTag).toBeUndefined();
    });
  });

  describe('configure', () => {
    it('should reject LIVE mode configuration in this phase', async () => {
      await expect(
        service.configure(SCHOOL_ID, USER, {
          keyId: 'rzp_live_51AbcDef123',
          environment: GatewayEnvironment.LIVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should require Key Secret on initial configuration', async () => {
      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue(null);

      await expect(
        service.configure(SCHOOL_ID, USER, {
          keyId: 'rzp_test_51AbcDef123',
          keySecret: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create new configuration and encrypt credentials using AES-256-GCM', async () => {
      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue(null);
      prisma.schoolPaymentGatewayConfig.upsert.mockImplementation(({ create }: any) => ({
        ...create,
        id: 'new-cfg-uuid',
      }));

      const result = await service.configure(SCHOOL_ID, USER, {
        merchantName: 'Greenwood High Fees',
        keyId: 'rzp_test_51AbcDef123',
        keySecret: 'secret_value_12345678',
        webhookSecret: 'wh_secret_998877',
        environment: GatewayEnvironment.TEST,
      });

      expect(result.keyId).toBe('rzp_test_51AbcDef123');
      expect(result.status).toBe(GatewayStatus.PENDING_VERIFICATION);
      expect(result.keySecretMasked).toBe('••••••••••••••••5678');
      expect(result.hasWebhookSecret).toBe(true);

      const upsertCall = prisma.schoolPaymentGatewayConfig.upsert.mock.calls[0][0];
      expect(upsertCall.create.encryptedKeySecret).toBeDefined();
      expect(upsertCall.create.encryptedKeySecret).not.toBe('secret_value_12345678');
      expect(upsertCall.create.keySecretIv).toHaveLength(24); // 12 bytes = 24 hex chars
      expect(upsertCall.create.keySecretAuthTag).toHaveLength(32); // 16 bytes = 32 hex chars
    });

    it('should preserve existing key secret when secret is omitted on update', async () => {
      const existingEnc = cryptoService.encrypt('original_secret_11223344');
      const existingRecord = {
        id: 'cfg-1',
        schoolId: SCHOOL_ID,
        provider: GatewayProvider.RAZORPAY,
        merchantName: 'Old Name',
        keyId: 'rzp_test_51AbcDef123',
        encryptedKeySecret: existingEnc.ciphertext,
        keySecretIv: existingEnc.iv,
        keySecretAuthTag: existingEnc.authTag,
        encryptedWebhookSecret: null,
        webhookSecretIv: null,
        webhookSecretAuthTag: null,
        environment: GatewayEnvironment.TEST,
        status: GatewayStatus.ACTIVE,
        lastVerifiedAt: new Date(),
        lastVerificationError: null,
      };

      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue(existingRecord);
      prisma.schoolPaymentGatewayConfig.upsert.mockImplementation(({ update }: any) => ({
        ...existingRecord,
        ...update,
      }));

      const result = await service.configure(SCHOOL_ID, USER, {
        merchantName: 'Updated Name',
        keyId: 'rzp_test_51AbcDef123',
        keySecret: '', // Omitted / blank
      });

      expect(result.merchantName).toBe('Updated Name');
      expect(result.keySecretMasked).toBe('••••••••••••••••3344'); // Still decrypts to original

      const upsertCall = prisma.schoolPaymentGatewayConfig.upsert.mock.calls[0][0];
      expect(upsertCall.update.encryptedKeySecret).toBe(existingEnc.ciphertext);
      expect(upsertCall.update.keySecretIv).toBe(existingEnc.iv);
    });

    it('should reset status to PENDING_VERIFICATION when keyId or keySecret is replaced', async () => {
      const existingEnc = cryptoService.encrypt('original_secret_11223344');
      const existingRecord = {
        id: 'cfg-1',
        schoolId: SCHOOL_ID,
        provider: GatewayProvider.RAZORPAY,
        merchantName: 'Old Name',
        keyId: 'rzp_test_old_111111',
        encryptedKeySecret: existingEnc.ciphertext,
        keySecretIv: existingEnc.iv,
        keySecretAuthTag: existingEnc.authTag,
        status: GatewayStatus.ACTIVE,
      };

      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue(existingRecord);
      prisma.schoolPaymentGatewayConfig.upsert.mockImplementation(({ update }: any) => ({
        ...existingRecord,
        ...update,
      }));

      const result = await service.configure(SCHOOL_ID, USER, {
        keyId: 'rzp_test_new_222222', // Changed keyId
        keySecret: 'new_secret_99887766',
      });

      expect(result.status).toBe(GatewayStatus.PENDING_VERIFICATION);
      expect(result.lastVerifiedAt).toBeNull();
    });
  });

  describe('verify', () => {
    it('should throw NotFoundException if no gateway is configured', async () => {
      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue(null);

      await expect(service.verify(SCHOOL_ID, USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should mark status as ACTIVE when Razorpay verification succeeds', async () => {
      const encrypted = cryptoService.encrypt('valid_test_secret_1234');
      const mockRecord = {
        id: 'cfg-1',
        schoolId: SCHOOL_ID,
        keyId: 'rzp_test_valid_key',
        encryptedKeySecret: encrypted.ciphertext,
        keySecretIv: encrypted.iv,
        keySecretAuthTag: encrypted.authTag,
        environment: GatewayEnvironment.TEST,
        status: GatewayStatus.PENDING_VERIFICATION,
      };

      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue(mockRecord);
      prisma.schoolPaymentGatewayConfig.update.mockResolvedValue({});

      // Mock the protected HTTP verification call
      jest
        .spyOn(service as any, 'executeRazorpayVerification')
        .mockResolvedValue({ success: true });

      const outcome = await service.verify(SCHOOL_ID, USER);

      expect(outcome.success).toBe(true);
      expect(outcome.status).toBe(GatewayStatus.ACTIVE);
      expect(prisma.schoolPaymentGatewayConfig.update).toHaveBeenCalledWith({
        where: { schoolId: SCHOOL_ID },
        data: expect.objectContaining({
          status: GatewayStatus.ACTIVE,
          lastVerificationError: null,
        }),
      });
    });

    it('should keep status PENDING_VERIFICATION and record error when Razorpay rejects credentials', async () => {
      const encrypted = cryptoService.encrypt('bad_test_secret_1234');
      const mockRecord = {
        id: 'cfg-1',
        schoolId: SCHOOL_ID,
        keyId: 'rzp_test_invalid_key',
        encryptedKeySecret: encrypted.ciphertext,
        keySecretIv: encrypted.iv,
        keySecretAuthTag: encrypted.authTag,
        environment: GatewayEnvironment.TEST,
        status: GatewayStatus.PENDING_VERIFICATION,
      };

      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue(mockRecord);
      prisma.schoolPaymentGatewayConfig.update.mockResolvedValue({});

      jest
        .spyOn(service as any, 'executeRazorpayVerification')
        .mockResolvedValue({
          success: false,
          error: 'Invalid Key ID or Key Secret for Razorpay TEST account',
        });

      const outcome = await service.verify(SCHOOL_ID, USER);

      expect(outcome.success).toBe(false);
      expect(outcome.status).toBe(GatewayStatus.PENDING_VERIFICATION);
      expect(outcome.error).toContain('Invalid Key ID');

      expect(prisma.schoolPaymentGatewayConfig.update).toHaveBeenCalledWith({
        where: { schoolId: SCHOOL_ID },
        data: expect.objectContaining({
          status: GatewayStatus.PENDING_VERIFICATION,
          lastVerificationError: 'Invalid Key ID or Key Secret for Razorpay TEST account',
        }),
      });
    });
  });

  describe('disconnect', () => {
    it('should set status to DISABLED', async () => {
      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue({
        id: 'cfg-1',
        schoolId: SCHOOL_ID,
        status: GatewayStatus.ACTIVE,
      });
      prisma.schoolPaymentGatewayConfig.update.mockResolvedValue({});

      const result = await service.disconnect(SCHOOL_ID, USER);

      expect(result.success).toBe(true);
      expect(prisma.schoolPaymentGatewayConfig.update).toHaveBeenCalledWith({
        where: { schoolId: SCHOOL_ID },
        data: { status: GatewayStatus.DISABLED },
      });
    });
  });

  describe('decryptCredentialsForInternalUse', () => {
    it('should successfully return decrypted credentials when gateway is ACTIVE', async () => {
      const encryptedKey = cryptoService.encrypt('my_active_key_secret');
      const encryptedWh = cryptoService.encrypt('my_webhook_secret');

      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue({
        id: 'cfg-1',
        schoolId: SCHOOL_ID,
        keyId: 'rzp_test_active_key',
        encryptedKeySecret: encryptedKey.ciphertext,
        keySecretIv: encryptedKey.iv,
        keySecretAuthTag: encryptedKey.authTag,
        encryptedWebhookSecret: encryptedWh.ciphertext,
        webhookSecretIv: encryptedWh.iv,
        webhookSecretAuthTag: encryptedWh.authTag,
        environment: GatewayEnvironment.TEST,
        status: GatewayStatus.ACTIVE,
      });

      const creds = await service.decryptCredentialsForInternalUse(SCHOOL_ID);

      expect(creds.keyId).toBe('rzp_test_active_key');
      expect(creds.keySecret).toBe('my_active_key_secret');
      expect(creds.webhookSecret).toBe('my_webhook_secret');
    });

    it('should throw BadRequestException if gateway is not ACTIVE', async () => {
      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue({
        id: 'cfg-1',
        schoolId: SCHOOL_ID,
        status: GatewayStatus.DISABLED,
      });

      await expect(
        service.decryptCredentialsForInternalUse(SCHOOL_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('FIN-01 — Razorpay LIVE & TEST Environment Persistence', () => {
    const originalAllowLive = process.env.ALLOW_LIVE_PAYMENT_GATEWAY;

    afterEach(() => {
      if (originalAllowLive === undefined) {
        delete process.env.ALLOW_LIVE_PAYMENT_GATEWAY;
      } else {
        process.env.ALLOW_LIVE_PAYMENT_GATEWAY = originalAllowLive;
      }
    });

    it('rejects LIVE mode when ALLOW_LIVE_PAYMENT_GATEWAY is not true', async () => {
      process.env.ALLOW_LIVE_PAYMENT_GATEWAY = 'false';
      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue(null);

      await expect(
        service.configure(SCHOOL_ID, USER, {
          keyId: 'rzp_live_51AbcDef123456',
          keySecret: 'live_secret_12345678',
          environment: GatewayEnvironment.LIVE,
        }),
      ).rejects.toThrow(/LIVE payment gateway mode is not enabled/);
    });

    it('rejects invalid key prefix when rzp_test_ key is supplied for LIVE environment', async () => {
      process.env.ALLOW_LIVE_PAYMENT_GATEWAY = 'true';
      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue(null);

      await expect(
        service.configure(SCHOOL_ID, USER, {
          keyId: 'rzp_test_51AbcDef123456',
          keySecret: 'test_secret_12345678',
          environment: GatewayEnvironment.LIVE,
        }),
      ).rejects.toThrow(/Key ID must be a Razorpay LIVE key/);
    });

    it('rejects invalid key prefix when rzp_live_ key is supplied for TEST environment', async () => {
      process.env.ALLOW_LIVE_PAYMENT_GATEWAY = 'true';
      prisma.schoolPaymentGatewayConfig.findUnique.mockResolvedValue(null);

      await expect(
        service.configure(SCHOOL_ID, USER, {
          keyId: 'rzp_live_51AbcDef123456',
          keySecret: 'live_secret_12345678',
          environment: GatewayEnvironment.TEST,
        }),
      ).rejects.toThrow(/Key ID must be a Razorpay TEST key/);
    });

    it('correctly persists GatewayEnvironment.LIVE on both create and update and verifies LIVE credentials', async () => {
      process.env.ALLOW_LIVE_PAYMENT_GATEWAY = 'true';

      let persistedRecord: any = null;
      prisma.schoolPaymentGatewayConfig.findUnique.mockImplementation(async () => persistedRecord);
      prisma.schoolPaymentGatewayConfig.upsert.mockImplementation(async ({ create, update }: any) => {
        if (!persistedRecord) {
          persistedRecord = { id: 'live-cfg-1', ...create, createdAt: new Date(), updatedAt: new Date() };
        } else {
          persistedRecord = { ...persistedRecord, ...update, updatedAt: new Date() };
        }
        return persistedRecord;
      });
      prisma.schoolPaymentGatewayConfig.update.mockImplementation(async ({ data }: any) => {
        persistedRecord = { ...persistedRecord, ...data };
        return persistedRecord;
      });

      // 1. Create LIVE configuration
      const created = await service.configure(SCHOOL_ID, USER, {
        merchantName: 'Greenwood High LIVE',
        keyId: 'rzp_live_51ProdKey998877',
        keySecret: 'live_prod_secret_4455',
        webhookSecret: 'live_wh_secret_1122',
        environment: GatewayEnvironment.LIVE,
      });

      expect(created.environment).toBe(GatewayEnvironment.LIVE);
      expect(persistedRecord.environment).toBe(GatewayEnvironment.LIVE);
      expect(created.keySecretMasked).toBe('••••••••••••••••4455');
      expect((created as any).encryptedKeySecret).toBeUndefined();

      // 2. Update LIVE configuration (without re-sending environment or keySecret)
      const updated = await service.configure(SCHOOL_ID, USER, {
        merchantName: 'Greenwood High LIVE Updated',
        keyId: 'rzp_live_51ProdKey998877',
      });

      expect(updated.environment).toBe(GatewayEnvironment.LIVE);
      expect(persistedRecord.environment).toBe(GatewayEnvironment.LIVE);
      expect(updated.merchantName).toBe('Greenwood High LIVE Updated');

      // 3. Verify LIVE configuration succeeds without environment/prefix mismatch
      jest.spyOn(service as any, 'executeRazorpayVerification').mockResolvedValue({ success: true });
      const verifyResult = await service.verify(SCHOOL_ID, USER);
      expect(verifyResult.success).toBe(true);
      expect(verifyResult.status).toBe(GatewayStatus.ACTIVE);
    });
  });
});
