import { Injectable, BadRequestException } from '@nestjs/common';
import { NotificationEventType } from '@prisma/client';
import { renderReceiptIssuedEmail } from './receipt-issued.template';
import { renderPaymentReversedEmail } from './payment-reversed.template';
import { renderRefundSucceededEmail } from './refund-succeeded.template';
import { renderRefundFailedEmail } from './refund-failed.template';
import { renderPaymentPendingEmail } from './payment-pending.template';
import { renderPaymentFailedEmail } from './payment-failed.template';
import { renderFeeDueReminderEmail } from './fee-due-reminder.template';
import {
  FeeReminderTemplateData,
  PaymentFailedTemplateData,
  PaymentPendingTemplateData,
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

    let rendered: RenderedEmail;

    switch (templateKey) {
      case NotificationEventType.RECEIPT_ISSUED:
      case 'RECEIPT_ISSUED':
        rendered = renderReceiptIssuedEmail(data as ReceiptIssuedTemplateData);
        break;

      case NotificationEventType.PAYMENT_REVERSED:
      case 'PAYMENT_REVERSED':
        rendered = renderPaymentReversedEmail(data as PaymentReversedTemplateData);
        break;

      case NotificationEventType.REFUND_SUCCEEDED:
      case 'REFUND_SUCCEEDED':
        rendered = renderRefundSucceededEmail(data as RefundSucceededTemplateData);
        break;

      case NotificationEventType.REFUND_FAILED:
      case 'REFUND_FAILED':
        rendered = renderRefundFailedEmail(data as RefundFailedTemplateData);
        break;

      case 'PAYMENT_PENDING':
        rendered = renderPaymentPendingEmail(data as PaymentPendingTemplateData);
        break;

      case 'PAYMENT_FAILED':
        rendered = renderPaymentFailedEmail(data as PaymentFailedTemplateData);
        break;

      case 'FEE_DUE_IN_7_DAYS':
      case 'FEE_DUE_IN_1_DAY':
      case 'FEE_DUE_TODAY':
      case 'FEE_OVERDUE':
      case 'DUE_IN_7_DAYS':
      case 'DUE_IN_1_DAY':
      case 'DUE_TODAY':
      case 'OVERDUE':
      case 'FEE_DUE_REMINDER':
        rendered = renderFeeDueReminderEmail(data as FeeReminderTemplateData);
        break;

      default:
        throw new BadRequestException(`Unsupported or unrecognized template key: ${templateKey}`);
    }

    return {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      htmlBody: rendered.htmlBody ?? rendered.html,
      textBody: rendered.textBody ?? rendered.text,
    };
  }
}
