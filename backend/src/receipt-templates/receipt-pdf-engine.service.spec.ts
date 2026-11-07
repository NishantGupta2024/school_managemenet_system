import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DisabledPdfEngine,
  GotenbergPdfEngine,
  ReceiptPdfEngineService,
} from './receipt-pdf-engine.service';

describe('ReceiptPdfEngineService and Adapters', () => {
  let service: ReceiptPdfEngineService;

  beforeEach(() => {
    service = new ReceiptPdfEngineService();
  });

  describe('DisabledPdfEngine', () => {
    it('reports engine as unavailable and rejects conversion requests', async () => {
      const disabled = new DisabledPdfEngine();
      expect(await disabled.isAvailable()).toBe(false);
      await expect(disabled.convertDocxToPdf()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('GotenbergPdfEngine', () => {
    it('reports unavailable when GOTENBERG_URL is not set', async () => {
      delete process.env.GOTENBERG_URL;
      const gotenberg = new GotenbergPdfEngine();
      expect(await gotenberg.isAvailable()).toBe(false);
      await expect(gotenberg.convertDocxToPdf(Buffer.from('test'))).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('ReceiptPdfEngineService Validation', () => {
    it('accepts a valid PDF buffer with %PDF- header and sufficient length', () => {
      const validPdf = Buffer.concat([
        Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'),
        Buffer.alloc(600, 0x20),
        Buffer.from('%%EOF\n'),
      ]);

      expect(() => service.validatePdfBuffer(validPdf)).not.toThrow();
    });

    it('rejects a buffer shorter than 500 bytes', () => {
      const shortPdf = Buffer.from('%PDF-1.4\nshort');
      expect(() => service.validatePdfBuffer(shortPdf)).toThrow(
        InternalServerErrorException,
      );
      expect(() => service.validatePdfBuffer(shortPdf)).toThrow(
        /Generated PDF is truncated or empty/,
      );
    });

    it('rejects a buffer without standard %PDF- header', () => {
      const invalidHeaderPdf = Buffer.alloc(600, 0x41); // 'AAAA...'
      expect(() => service.validatePdfBuffer(invalidHeaderPdf)).toThrow(
        InternalServerErrorException,
      );
      expect(() => service.validatePdfBuffer(invalidHeaderPdf)).toThrow(
        /Generated output is missing standard %PDF- header/,
      );
    });

    it('throws ServiceUnavailableException when convertToPdf is called with no active engine', async () => {
      delete process.env.GOTENBERG_URL;
      await expect(service.convertToPdf(Buffer.from('dummy docx'))).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
