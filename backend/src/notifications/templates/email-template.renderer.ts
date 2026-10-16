import { Injectable, BadRequestException } from '@nestjs/common';
import { NotificationEventType } from '@prisma/client';
import { renderReceiptIssuedEmail } from './receipt-issued.template';
import { renderPaymentReversedEmail } from './payment-reversed.template';
import { renderRefundSucceededEmail } from './refund-succeeded.template';
import { renderRefundFailedEmail } from './refund-failed.template';
import {
  PaymentReversedTemplateData,
  ReceiptIssuedTemplateData,
  RefundFailedTemplateData,
  RefundSucceededTemplateData,
  RenderedEmail,
} from './template.types';

@Injectable()
export class EmailTemplateRenderer {
  /**
   * Renders the specified email template using explicit template input data.
   */
  render(templateKey: string | NotificationEventType, data: any): RenderedEmail {
    if (!data || typeof data !== 'object') {
      throw new BadRequestException('Template data must be a valid non-null object');
    }

    switch (templateKey) {
      case NotificationEventType.RECEIPT_ISSUED:
      case 'RECEIPT_ISSUED':
        return renderReceiptIssuedEmail(data as ReceiptIssuedTemplateData);

      case NotificationEventType.PAYMENT_REVERSED:
      case 'PAYMENT_REVERSED':
        return renderPaymentReversedEmail(data as PaymentReversedTemplateData);

      case NotificationEventType.REFUND_SUCCEEDED:
      case 'REFUND_SUCCEEDED':
        return renderRefundSucceededEmail(data as RefundSucceededTemplateData);

      case NotificationEventType.REFUND_FAILED:
      case 'REFUND_FAILED':
        return renderRefundFailedEmail(data as RefundFailedTemplateData);

      default:
        throw new BadRequestException(`Unsupported or unrecognized template key: ${templateKey}`);
    }
  }
}
