import { Test, TestingModule } from '@nestjs/testing';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { RazorpayWebhookService } from './razorpay-webhook.service';

describe('RazorpayWebhookController (Phase G)', () => {
  let controller: RazorpayWebhookController;
  let service: any;

  beforeEach(async () => {
    service = {
      handleWebhook: jest.fn().mockResolvedValue({
        status: 'success',
        paymentId: 'pay-uuid-1',
        orderId: 'order-uuid-1',
        receiptNumber: 'REC-2026-00001',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RazorpayWebhookController],
      providers: [
        {
          provide: RazorpayWebhookService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<RazorpayWebhookController>(
      RazorpayWebhookController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates to RazorpayWebhookService with raw body buffer on primary endpoint (/payments/online/webhook)', async () => {
    const rawBuffer = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    const mockReq: any = {
      rawBody: rawBuffer,
      body: {},
    };
    const signature = 'mock_signature_hex';

    const response = await controller.handleOnlinePaymentWebhook(
      mockReq,
      signature,
    );

    expect(response).toEqual({
      received: true,
      result: expect.objectContaining({
        status: 'success',
        paymentId: 'pay-uuid-1',
      }),
    });
    expect(service.handleWebhook).toHaveBeenCalledWith(rawBuffer, signature);
  });

  it('delegates to RazorpayWebhookService on alias endpoint (/webhooks/razorpay)', async () => {
    const rawBuffer = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    const mockReq: any = {
      rawBody: rawBuffer,
      body: {},
    };
    const signature = 'mock_signature_hex_2';

    const response = await controller.handleRazorpayWebhookAlias(
      mockReq,
      signature,
    );

    expect(response).toEqual({
      received: true,
      result: expect.objectContaining({
        status: 'success',
      }),
    });
    expect(service.handleWebhook).toHaveBeenCalledWith(rawBuffer, signature);
  });

  it('falls back to string body if rawBody is not set on request', async () => {
    const mockReq: any = {
      body: { event: 'payment.captured' },
    };
    const signature = 'mock_signature_hex_3';

    await controller.handleOnlinePaymentWebhook(mockReq, signature);

    expect(service.handleWebhook).toHaveBeenCalledWith(
      JSON.stringify({ event: 'payment.captured' }),
      signature,
    );
  });
});
