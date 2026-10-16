import {
  escapeHtml,
  formatAmount,
  sanitizePlainText,
  sanitizeReasonText,
} from './template-sanitizer';
import { RefundFailedTemplateData, RenderedEmail } from './template.types';

export function renderRefundFailedEmail(data: RefundFailedTemplateData): RenderedEmail {
  if (!data.schoolName) throw new Error('Missing required field: schoolName');
  if (!data.studentName) throw new Error('Missing required field: studentName');
  if (!data.refundReference) throw new Error('Missing required field: refundReference');
  if (data.refundAmount === undefined || data.refundAmount === null) {
    throw new Error('Missing required field: refundAmount');
  }

  const currency = data.currency || 'INR';
  const formattedAmount = formatAmount(data.refundAmount, currency);
  const subject = `Fee Refund Processing Issue - ${data.refundReference} | ${data.schoolName}`;

  const cleanFailureReason = sanitizeReasonText(data.failureReason);

  const safeSchool = escapeHtml(data.schoolName);
  const safeStudent = escapeHtml(data.studentName);
  const safeAdmission = escapeHtml(data.admissionNumber);
  const safeRefundRef = escapeHtml(data.refundReference);
  const safePaymentNumber = escapeHtml(data.originalPaymentNumber);
  const safeFailureReason = escapeHtml(cleanFailureReason);
  const safeAttemptedDate = escapeHtml(data.attemptedDate);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 20px; background-color: #f9fafb;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 24px;">
    <div style="border-bottom: 2px solid #ea580c; padding-bottom: 12px; margin-bottom: 20px;">
      <h2 style="color: #c2410c; margin: 0; font-size: 20px;">${safeSchool}</h2>
      <p style="color: #6b7280; margin: 4px 0 0 0; font-size: 13px;">Fee Refund Payout Advisory</p>
    </div>

    <p style="font-size: 15px;">Dear Parent / Guardian,</p>
    <p style="font-size: 14px;">We regret to inform you that an automated attempt to disburse your fee refund encountered an issue and could not be completed by the banking network.</p>

    <div style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 16px; margin-bottom: 16px; font-size: 14px;">
      <p style="margin: 4px 0;"><strong>Student Name:</strong> ${safeStudent}</p>
      <p style="margin: 4px 0;"><strong>Admission Number:</strong> ${safeAdmission}</p>
      <p style="margin: 4px 0;"><strong>Refund Voucher / ID:</strong> <span style="font-family: monospace; font-weight: bold; color: #c2410c;">${safeRefundRef}</span></p>
      <p style="margin: 4px 0;"><strong>Original Payment Number:</strong> ${safePaymentNumber}</p>
      <p style="margin: 4px 0;"><strong>Attempt Date:</strong> ${safeAttemptedDate}</p>
      <p style="margin: 8px 0 4px 0; font-size: 16px;"><strong>Refund Amount:</strong> <span style="color: #ea580c; font-weight: bold;">${formattedAmount}</span></p>
      <p style="margin: 6px 0 0 0; color: #9a3412;"><strong>Issue Description:</strong> ${safeFailureReason}</p>
    </div>

    <p style="font-size: 14px;">
      <strong>Next Steps:</strong> Your funds remain secure and have not been forfeited. The school accounts office has been notified and will verify your banking details or arrange an alternative disbursement method.
    </p>

    <p style="font-size: 13px; color: #6b7280; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
      Please contact the accounts office quoting refund reference <strong>${safeRefundRef}</strong> if you need to provide updated beneficiary bank details.
    </p>
  </div>
</body>
</html>`;

  const text = `
${sanitizePlainText(data.schoolName)}
Fee Refund Payout Advisory
--------------------------------------------------

Dear Parent / Guardian,

An automated attempt to disburse your fee refund could not be completed.

Details:
- Student Name: ${sanitizePlainText(data.studentName)}
- Admission Number: ${sanitizePlainText(data.admissionNumber)}
- Refund Voucher / ID: ${sanitizePlainText(data.refundReference)}
- Original Payment: ${sanitizePlainText(data.originalPaymentNumber)}
- Attempt Date: ${sanitizePlainText(data.attemptedDate)}
- Refund Amount: ${formattedAmount}
- Issue Description: ${sanitizePlainText(cleanFailureReason)}

Your funds remain secure. The accounts office will verify your banking details or arrange an alternative disbursement.
Please contact the accounts office quoting refund reference ${sanitizePlainText(data.refundReference)}.
--------------------------------------------------
${sanitizePlainText(data.schoolName)} Accounts Office
`;

  return { subject, html, text: text.trim() };
}
