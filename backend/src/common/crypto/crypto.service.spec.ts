import {
  CryptoService,
  CryptoConfigurationError,
  CryptoDecryptionError,
} from './crypto.service';
import { ConfigService } from '@nestjs/config';

describe('CryptoService (AES-256-GCM)', () => {
  // 32-byte test key formatted as 64-character hex string
  const VALID_HEX_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const ALTERNATE_HEX_KEY =
    'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

  describe('Key Configuration & Validation', () => {
    it('should initialize successfully with a valid 64-character hex key', () => {
      const service = new CryptoService(undefined, VALID_HEX_KEY);
      expect(service.isConfigured()).toBe(true);
    });

    it('should initialize successfully with a valid 32-byte base64 key', () => {
      // 32 bytes in base64: 44 chars ending in '='
      const base64Key = Buffer.from(VALID_HEX_KEY, 'hex').toString('base64');
      const service = new CryptoService(undefined, base64Key);
      expect(service.isConfigured()).toBe(true);
    });

    it('should throw CryptoConfigurationError if key is too short', () => {
      const shortKey = '0123456789abcdef'; // 16 hex chars = 8 bytes
      expect(() => new CryptoService(undefined, shortKey)).toThrow(
        CryptoConfigurationError,
      );
    });

    it('should throw CryptoConfigurationError if key is not configured and encrypt is called', () => {
      const originalEnv = process.env.GATEWAY_ENCRYPTION_KEY;
      delete process.env.GATEWAY_ENCRYPTION_KEY;

      const mockConfigService = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      const service = new CryptoService(mockConfigService);
      expect(service.isConfigured()).toBe(false);
      expect(() => service.encrypt('my_secret')).toThrow(
        CryptoConfigurationError,
      );

      process.env.GATEWAY_ENCRYPTION_KEY = originalEnv;
    });
  });

  describe('Encryption & Decryption Round-Trip', () => {
    let service: CryptoService;

    beforeEach(() => {
      service = new CryptoService(undefined, VALID_HEX_KEY);
    });

    it('should successfully encrypt and decrypt a plaintext secret', () => {
      const plaintext = 'rzp_live_secret_key_99887766554433221100';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('authTag');

      expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex characters
      expect(encrypted.authTag).toHaveLength(32); // 16 bytes = 32 hex characters
      expect(encrypted.ciphertext).not.toBe(plaintext);

      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should generate unique IVs for every encryption call (semantic security)', () => {
      const plaintext = 'same_secret_string';
      const enc1 = service.encrypt(plaintext);
      const enc2 = service.encrypt(plaintext);

      // Unique initialization vectors prevent pattern leakage
      expect(enc1.iv).not.toBe(enc2.iv);
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);

      // Both decrypt to the same plaintext
      expect(service.decrypt(enc1)).toBe(plaintext);
      expect(service.decrypt(enc2)).toBe(plaintext);
    });

    it('should reject empty or invalid plaintext on encrypt', () => {
      expect(() => service.encrypt('')).toThrow(
        'Plaintext must be a non-empty string',
      );
      expect(() => service.encrypt(null as any)).toThrow();
    });
  });

  describe('Integrity & Tamper Rejection (AEAD GCM)', () => {
    let service: CryptoService;

    beforeEach(() => {
      service = new CryptoService(undefined, VALID_HEX_KEY);
    });

    it('should reject tampered ciphertext with CryptoDecryptionError', () => {
      const encrypted = service.encrypt('sensitive_api_secret');

      // Invert the first character of the ciphertext to guarantee tamper
      const firstChar = encrypted.ciphertext[0];
      const tamperedFirstChar = firstChar === 'a' ? 'b' : 'a';
      const tamperedCiphertext =
        tamperedFirstChar + encrypted.ciphertext.slice(1);

      expect(() =>
        service.decrypt({
          ...encrypted,
          ciphertext: tamperedCiphertext,
        }),
      ).toThrow(CryptoDecryptionError);
    });

    it('should reject tampered IV with CryptoDecryptionError', () => {
      const encrypted = service.encrypt('sensitive_api_secret');

      // Alter 1 character in IV
      const tamperedIv =
        'ff' + encrypted.iv.substring(2);

      expect(() =>
        service.decrypt({
          ...encrypted,
          iv: tamperedIv,
        }),
      ).toThrow(CryptoDecryptionError);
    });

    it('should reject tampered authentication tag with CryptoDecryptionError', () => {
      const encrypted = service.encrypt('sensitive_api_secret');

      // Alter 1 character in AuthTag
      const tamperedTag =
        encrypted.authTag.slice(0, -2) + '00';

      expect(() =>
        service.decrypt({
          ...encrypted,
          authTag: tamperedTag,
        }),
      ).toThrow(CryptoDecryptionError);
    });

    it('should reject decryption when using a different encryption key', () => {
      const serviceA = new CryptoService(undefined, VALID_HEX_KEY);
      const serviceB = new CryptoService(undefined, ALTERNATE_HEX_KEY);

      const encrypted = serviceA.encrypt('secret_for_school_alpha');

      expect(() => serviceB.decrypt(encrypted)).toThrow(
        CryptoDecryptionError,
      );
    });

    it('should reject missing or malformed EncryptedData fields', () => {
      expect(() =>
        service.decrypt({ ciphertext: '', iv: 'abc', authTag: 'def' }),
      ).toThrow();
      expect(() =>
        service.decrypt({ ciphertext: 'abc', iv: '', authTag: 'def' }),
      ).toThrow();
      expect(() =>
        service.decrypt({ ciphertext: 'abc', iv: 'def', authTag: '' }),
      ).toThrow();
    });
  });

  describe('Secret Masking Helper', () => {
    let service: CryptoService;

    beforeEach(() => {
      service = new CryptoService(undefined, VALID_HEX_KEY);
    });

    it('should mask full secret leaving last 4 characters visible', () => {
      const masked = service.maskSecret('rzp_test_sec_9918273645');
      expect(masked).toBe('••••••••••••••••3645');
      expect(masked).not.toContain('rzp_test_sec');
    });

    it('should completely mask short secrets', () => {
      const masked = service.maskSecret('123');
      expect(masked).toBe('••••••••••••••••');
    });

    it('should handle null or undefined safely without throwing', () => {
      expect(service.maskSecret(null)).toBe('••••••••••••••••');
      expect(service.maskSecret(undefined)).toBe('••••••••••••••••');
    });
  });
});
