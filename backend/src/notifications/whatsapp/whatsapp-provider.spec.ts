import {
  normalizeWhatsAppPhoneNumber,
  WhatsAppCloudApiProvider,
} from './whatsapp-cloud-api.provider';
import { MemoryWhatsAppProvider, normalizeWhatsAppError } from './memory-whatsapp.provider';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { SendWhatsAppOptions, WhatsAppErrorCategory } from './whatsapp.types';

describe('WhatsApp Provider Architecture', () => {
  describe('normalizeWhatsAppPhoneNumber', () => {
    it('normalizes standard Indian 10-digit mobile numbers with default country code 91', () => {
      expect(normalizeWhatsAppPhoneNumber('9876543210')).toBe('919876543210');
      expect(normalizeWhatsAppPhoneNumber('8765432109')).toBe('918765432109');
    });

    it('strips leading + and formatting characters', () => {
      expect(normalizeWhatsAppPhoneNumber('+91 98765-43210')).toBe('919876543210');
      expect(normalizeWhatsAppPhoneNumber('+1 (415) 555-2671')).toBe('14155552671');
    });

    it('rejects numbers with alphabetic or special characters', () => {
      expect(() => normalizeWhatsAppPhoneNumber('98765abcde')).toThrow('contains non-numeric characters');
      expect(() => normalizeWhatsAppPhoneNumber('')).toThrow('Phone number must be a non-empty string');
    });

    it('rejects numbers that are too short or too long', () => {
      expect(() => normalizeWhatsAppPhoneNumber('12345')).toThrow('invalid length');
      expect(() => normalizeWhatsAppPhoneNumber('12345678901234567890')).toThrow('invalid length');
    });
  });

  describe('MemoryWhatsAppProvider', () => {
    let provider: MemoryWhatsAppProvider;

    beforeEach(() => {
      provider = new MemoryWhatsAppProvider();
      provider.clearSentMessages();
    });

    it('identifies as non-delivering mock provider', () => {
      expect(provider.isDeliveryProvider()).toBe(false);
      expect(provider.getProviderName()).toBe('MEMORY_WHATSAPP_NON_DELIVERING');
    });

    it('records dispatched message in memory and returns wamid', async () => {
      const options: SendWhatsAppOptions = {
        toPhone: '+919876543210',
        recipientName: 'Aarav Parent',
        templateName: 'fee_receipt_issued',
        languageCode: 'en',
        parameters: {
          student_name: 'Aarav Patel',
          receipt_number: 'RCP-2026-001',
          amount: '5000',
        },
      };

      const result = await provider.sendWhatsAppMessage(options);

      expect(result.accepted).toBe(true);
      expect(result.providerMessageId).toMatch(/^wamid\.mock_/);
      expect(provider.getSentMessages().length).toBe(1);
      expect(provider.getSentMessages()[0].templateName).toBe('fee_receipt_issued');
    });

    it('rejects missing recipient phone or template name', async () => {
      await expect(
        provider.sendWhatsAppMessage({ toPhone: '', templateName: 'test' }),
      ).rejects.toThrow('Recipient phone number is missing');

      await expect(
        provider.sendWhatsAppMessage({ toPhone: '+919876543210', templateName: '' }),
      ).rejects.toThrow('WhatsApp templateName is required');
    });

    it('handles simulated failure for testing failure resilience', async () => {
      provider.simulateFailure(new Error('Simulated network drop'));

      await expect(
        provider.sendWhatsAppMessage({
          toPhone: '+919876543210',
          templateName: 'fee_receipt_issued',
        }),
      ).rejects.toThrow('Simulated network drop');

      provider.simulateFailure(null);
      const res = await provider.sendWhatsAppMessage({
        toPhone: '+919876543210',
        templateName: 'fee_receipt_issued',
      });
      expect(res.accepted).toBe(true);
    });
  });

  describe('WhatsAppCloudApiProvider', () => {
    let mockConfigService: Partial<WhatsAppConfigService>;
    let capturedRequests: Array<{ url: string; options: any }>;

    beforeEach(() => {
      capturedRequests = [];
      mockConfigService = {
        getApiToken: jest.fn().mockReturnValue('EAAG_super_secret_meta_token_123'),
        phoneNumberId: '109876543210987',
        apiVersion: 'v21.0',
        isDeliveryProvider: true,
      };
    });

    it('constructs correct Meta Graph API payload and headers with zero external network activity', async () => {
      const mockDispatcher = jest.fn().mockImplementation(async (url: string, options: any) => {
        capturedRequests.push({ url, options });
        return {
          status: 200,
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            contacts: [{ input: '919876543210', wa_id: '919876543210' }],
            messages: [{ id: 'wamid.HBgLMTIzNDU2Nzg5MA==' }],
          }),
        };
      });

      const provider = new WhatsAppCloudApiProvider(
        mockConfigService as WhatsAppConfigService,
        mockDispatcher,
      );

      const result = await provider.sendWhatsAppMessage({
        toPhone: '+91 98765 43210',
        templateName: 'fee_payment_confirmation',
        languageCode: 'en_US',
        parameters: {
          student_name: 'Pooja Nair',
          receipt_number: 'RCP-099',
          amount: '12000',
        },
      });

      expect(result.accepted).toBe(true);
      expect(result.providerMessageId).toBe('wamid.HBgLMTIzNDU2Nzg5MA==');

      expect(capturedRequests.length).toBe(1);
      const req = capturedRequests[0];
      expect(req.url).toBe('https://graph.facebook.com/v21.0/109876543210987/messages');
      expect(req.options.headers.Authorization).toBe('Bearer EAAG_super_secret_meta_token_123');

      const parsedPayload = JSON.parse(req.options.body);
      expect(parsedPayload.messaging_product).toBe('whatsapp');
      expect(parsedPayload.to).toBe('919876543210');
      expect(parsedPayload.template.name).toBe('fee_payment_confirmation');
      expect(parsedPayload.template.language.code).toBe('en_US');
      expect(parsedPayload.template.components[0].parameters.length).toBe(3);
    });

    it('classifies Meta rate limiting error (code 17) as TRANSIENT and retryable', () => {
      const provider = new WhatsAppCloudApiProvider(mockConfigService as WhatsAppConfigService);
      const metaRateLimit = {
        code: 17,
        message: 'User request limit reached',
      };

      const classified = provider.classifyMetaApiError(400, metaRateLimit);
      expect(classified.category).toBe(WhatsAppErrorCategory.TRANSIENT);
      expect(classified.code).toBe('META_17');
      expect(classified.isRetryable).toBe(true);
    });

    it('classifies Meta OAuth token expiration (code 190) as CONFIGURATION', () => {
      const provider = new WhatsAppCloudApiProvider(mockConfigService as WhatsAppConfigService);
      const metaAuthError = {
        code: 190,
        message: 'Error validating access token: Session has expired',
      };

      const classified = provider.classifyMetaApiError(401, metaAuthError);
      expect(classified.category).toBe(WhatsAppErrorCategory.CONFIGURATION);
      expect(classified.code).toBe('META_190_CONFIG');
      expect(classified.isRetryable).toBe(false);
    });

    it('classifies unapproved template or template missing (code 131026) as PERMANENT', () => {
      const provider = new WhatsAppCloudApiProvider(mockConfigService as WhatsAppConfigService);
      const metaTemplateError = {
        code: 131026,
        message: 'Message template does not exist in the specified language',
      };

      const classified = provider.classifyMetaApiError(400, metaTemplateError);
      expect(classified.category).toBe(WhatsAppErrorCategory.PERMANENT);
      expect(classified.code).toBe('META_131026');
      expect(classified.isRetryable).toBe(false);
    });

    it('redacts Bearer tokens from error strings to prevent credential exposure in logs', () => {
      const provider = new WhatsAppCloudApiProvider(mockConfigService as WhatsAppConfigService);
      const errorWithToken = {
        code: 999,
        message: 'Upstream rejection for Bearer EAAG_super_secret_meta_token_123 on recipient dispatch',
      };

      const classified = provider.classifyMetaApiError(400, errorWithToken);
      expect(classified.message).not.toContain('EAAG_super_secret_meta_token_123');
      expect(classified.message).toContain('Bearer [REDACTED]');
    });
  });
});
