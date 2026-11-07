import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  RawBodyRequest,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { RazorpayWebhookService } from './razorpay-webhook.service';

@SkipThrottle() // Webhooks are cryptographically authenticated via HMAC-SHA256 signature; do not rate-limit gateway callbacks
@Controller()
export class RazorpayWebhookController {
  constructor(
    private readonly webhookService: RazorpayWebhookService,
  ) {}

  /**
   * Primary Razorpay webhook listener.
   * Path: POST /api/v1/payments/online/webhook
   */
  @Post('payments/online/webhook')
  @HttpCode(HttpStatus.OK)
  async handleOnlinePaymentWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    const rawPayload = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const result = await this.webhookService.handleWebhook(rawPayload, signature);
    return {
      received: true,
      result,
    };
  }

  /**
   * Alias Razorpay webhook listener.
   * Path: POST /api/v1/webhooks/razorpay
   */
  @Post('webhooks/razorpay')
  @HttpCode(HttpStatus.OK)
  async handleRazorpayWebhookAlias(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    const rawPayload = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const result = await this.webhookService.handleWebhook(rawPayload, signature);
    return {
      received: true,
      result,
    };
  }
}
