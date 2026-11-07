import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export class CryptoConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoConfigurationError';
  }
}

export class CryptoDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoDecryptionError';
  }
}

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLengthBytes = 12; // 96 bits recommended for GCM
  private readonly authTagLengthBytes = 16; // 128 bits standard GCM tag
  private masterKeyBuffer: Buffer | null = null;

  constructor(
    @Optional()
    private readonly configService?: ConfigService,
    @Optional()
    @Inject('EXPLICIT_CRYPTO_KEY')
    explicitKey?: string,
  ) {
    const rawKey =
      explicitKey ||
      this.configService?.get<string>('GATEWAY_ENCRYPTION_KEY') ||
      process.env.GATEWAY_ENCRYPTION_KEY;

    if (rawKey) {
      this.masterKeyBuffer = this.parseAndValidateKey(rawKey);
    }
  }

  /**
   * Validates and parses the 256-bit encryption key.
   * Accepts 64-char hex, 44-char base64, or 32-byte raw utf-8 strings.
   */
  private parseAndValidateKey(rawKey: string): Buffer {
    const trimmed = rawKey.trim();
    let keyBuf: Buffer;

    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      // 64-character hex string = 32 bytes
      keyBuf = Buffer.from(trimmed, 'hex');
    } else if (
      /^[A-Za-z0-9+/]{43}=$/.test(trimmed) ||
      /^[A-Za-z0-9+/]{42}==$/.test(trimmed)
    ) {
      // 44-character base64 string = 32 bytes
      keyBuf = Buffer.from(trimmed, 'base64');
    } else {
      keyBuf = Buffer.from(trimmed, 'utf8');
    }

    if (keyBuf.length !== 32) {
      throw new CryptoConfigurationError(
        `GATEWAY_ENCRYPTION_KEY must be exactly 32 bytes (256 bits). Received ${keyBuf.length} bytes.`,
      );
    }

    return keyBuf;
  }

  /**
   * Returns true if a valid master encryption key is configured.
   */
  public isConfigured(): boolean {
    if (!this.masterKeyBuffer) {
      const rawKey =
        this.configService?.get<string>('GATEWAY_ENCRYPTION_KEY') ||
        process.env.GATEWAY_ENCRYPTION_KEY;

      if (rawKey) {
        try {
          this.masterKeyBuffer = this.parseAndValidateKey(rawKey);
        } catch {
          return false;
        }
      }
    }
    return this.masterKeyBuffer !== null && this.masterKeyBuffer.length === 32;
  }

  /**
   * Resolves the active master key or throws an explicit configuration exception.
   */
  private getMasterKey(): Buffer {
    if (!this.masterKeyBuffer) {
      // Attempt late reload in case env was updated
      const rawKey =
        this.configService?.get<string>('GATEWAY_ENCRYPTION_KEY') ||
        process.env.GATEWAY_ENCRYPTION_KEY;

      if (rawKey) {
        this.masterKeyBuffer = this.parseAndValidateKey(rawKey);
      }
    }

    if (!this.masterKeyBuffer) {
      throw new CryptoConfigurationError(
        'GATEWAY_ENCRYPTION_KEY is not configured. Sensitive gateway credentials cannot be encrypted or decrypted.',
      );
    }

    return this.masterKeyBuffer;
  }

  /**
   * Encrypts plaintext using AES-256-GCM.
   * Generates a cryptographically random 12-byte IV for every invocation.
   *
   * @param plaintext Sensitive credential string to encrypt
   * @returns EncryptedData containing ciphertext, iv, and authTag (all hex encoded)
   */
  public encrypt(plaintext: string): EncryptedData {
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
      throw new Error('Plaintext must be a non-empty string');
    }

    const key = this.getMasterKey();
    const iv = crypto.randomBytes(this.ivLengthBytes);

    const cipher = crypto.createCipheriv(this.algorithm, key, iv, {
      authTagLength: this.authTagLengthBytes,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Decrypts ciphertext using AES-256-GCM and verifies the authentication tag.
   *
   * @param data EncryptedData object containing ciphertext, iv, and authTag (hex)
   * @returns Decrypted plaintext string
   * @throws CryptoDecryptionError if ciphertext, IV, or authTag was altered or key is invalid
   */
  public decrypt(data: EncryptedData): string {
    if (!data || !data.ciphertext || !data.iv || !data.authTag) {
      throw new Error(
        'EncryptedData must contain non-empty ciphertext, iv, and authTag',
      );
    }

    const key = this.getMasterKey();

    try {
      const iv = Buffer.from(data.iv, 'hex');
      const authTag = Buffer.from(data.authTag, 'hex');
      const ciphertext = Buffer.from(data.ciphertext, 'hex');

      if (iv.length !== this.ivLengthBytes) {
        throw new CryptoDecryptionError(
          `Invalid IV length: expected ${this.ivLengthBytes} bytes, got ${iv.length}`,
        );
      }

      if (authTag.length !== this.authTagLengthBytes) {
        throw new CryptoDecryptionError(
          `Invalid AuthTag length: expected ${this.authTagLengthBytes} bytes, got ${authTag.length}`,
        );
      }

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv, {
        authTagLength: this.authTagLengthBytes,
      });

      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (err: any) {
      // Never log or leak the key or partial plaintext
      this.logger.error(
        `Decryption failed: Authentication tag verification failed or ciphertext corrupted`,
      );
      throw new CryptoDecryptionError(
        'Failed to decrypt sensitive credential: Authentication tag mismatch or corrupted data',
      );
    }
  }

  /**
   * Masks sensitive credentials for UI and API responses.
   * Never displays the raw secret.
   *
   * @param secret The secret to mask
   * @param visibleTail Number of trailing characters to leave unmasked (default 4)
   * @returns Masked string like "••••••••••••••••" or "••••••••1234"
   */
  public maskSecret(secret?: string | null, visibleTail = 4): string {
    if (!secret || typeof secret !== 'string') {
      return '••••••••••••••••';
    }
    const trimmed = secret.trim();
    if (trimmed.length <= visibleTail) {
      return '••••••••••••••••';
    }
    const tail = trimmed.slice(-visibleTail);
    return `••••••••••••••••${tail}`;
  }
}
