import {
  escapeHtml,
  formatAmount,
  maskSensitiveReference,
  sanitizePlainText,
  sanitizeReasonText,
} from './template-sanitizer';
import { RefundSucceededTemplateData, RenderedEmail } from './template.types';

export function renderRefundSucceededEmail(data: RefundSucceededTemplateData): RenderedEmail {
  if (!data.schoolName) throw new Error('Missing required field: schoolName');
  if (!data.studentName) throw new Error('Missing required field: studentName');
  if (!data.refundReference) throw new Error('Missing required field: refundReference');
  if (data.refundAmount === undefined || data.refundAmount === null) {
    throw new Error('Missing required field: refundAmount');
  }

  const currency = data.currency || 'INR';
  const formattedAmount = formatAmount(data.refundAmount, currency);
  const subject = `Fee Refund Processed - ${data.refundReference} | ${data.schoolName}`;

  const cleanReason = sanitizeReasonText(data.reason);
  const cleanBankRef = maskSensitiveReference(data.referenceNumber);

  const safeSchool = escapeHtml(data.schoolName);
  const safeStudent = escapeHtml(data.studentName);
  const safeAdmission = escapeHtml(data.admissionNumber);
  const safeRefundRef = escapeHtml(data.refundReference);
  const safePaymentNumber = escapeHtml(data.originalPaymentNumber);
  const safeMode = escapeHtml(data.mode || 'Direct Transfer');
  const safeBankRef = escapeHtml(cleanBankRef);
  const safeReason = escapeHtml(cleanReason);
  const safeRefundDate = escapeHtml(data.refundDate);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 20px; background-color: #f9fafb;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 24px;">
    <div style="border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 20px;">
      <h2 style="color: #065f46; margin: 0; font-size: 20px;">${safeSchool}</h2>
      <p style="color: #6b7280; margin: 4px 0 0 0; font-size: 13px;">Fee Refund Confirmation</p>
    </div>

    <p style="font-size: 15px;">Dear Parent / Guardian,</p>
    <p style="font-size: 14px;">We are pleased to inform you that your fee refund has been successfully confirmed and disbursed. Transaction details are provided below:</p>

    <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 16px; margin-bottom: 16px; font-size: 14px;">
      <p style="margin: 4px 0;"><strong>Student Name:</strong> ${safeStudent}</p>
      <p style="margin: 4px 0;"><strong>Admission Number:</strong> ${safeAdmission}</p>
      <p style="margin: 4px 0;"><strong>Refund Voucher / ID:</strong> <span style="font-family: monospace; font-weight: bold; color: #047857;">${safeRefundRef}</span></p>
      <p style="margin: 4px 0;"><strong>Original Payment Number:</strong> ${safePaymentNumber}</p>
      <p style="margin: 4px 0;"><strong>Refund Disbursed Date:</strong> ${safeRefundDate}</p>
      <p style="margin: 4px 0;"><strong>Disbursement Mode:</strong> ${safeMode}</p>
      <p style="margin: 4px 0;"><strong>Bank Reference / UTR:</strong> ${safeBankRef}</p>
      <p style="margin: 8px 0 4px 0; font-size: 16px;"><strong>Refund Amount:</strong> <span style="color: #059669; font-weight: bold;">${formattedAmount}</span></p>
      <p style="margin: 6px 0 0 0; color: #064e3b;"><strong>Reason for Refund:</strong> ${safeReason}</p>
    </div>

    <p style="font-size: 13px; color: #6b7280; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
      Depending on your banking institution, electronic refunds may take 2 to 5 business days to reflect in your source account. Please preserve your refund reference <strong>${safeRefundRef}</strong> for any queries.
    </p>
  </div>
</body>
</html>`;

  const text = `
${sanitizePlainText(data.schoolName)}
Fee Refund Confirmation
--------------------------------------------------

Dear Parent / Guardian,

Your fee refund has been successfully confirmed and disbursed.

Refund Details:
- Student Name: ${sanitizePlainText(data.studentName)}
- Admission Number: ${sanitizePlainText(data.admissionNumber)}
- Refund Voucher / ID: ${sanitizePlainText(data.refundReference)}
- Original Payment: ${sanitizePlainText(data.originalPaymentNumber)}
- Refund Date: ${sanitizePlainText(data.refundDate)}
- Disbursement Mode: ${sanitizePlainText(data.mode || 'Direct Transfer')}
- Bank Reference / UTR: ${sanitizePlainText(cleanBankRef)}
- Refunded Amount: ${formattedAmount}
- Reason: ${sanitizePlainText(cleanReason)}

Depending on your bank, electronic refunds may take 2-5 business days to appear.
--------------------------------------------------
${sanitizePlainText(data.schoolName)} Accounts Office
`;

  return { subject, html, text: text.trim() };
}
