import {
  escapeHtml,
  formatAmount,
  sanitizePlainText,
  sanitizeReasonText,
} from './template-sanitizer';
import { PaymentReversedTemplateData, RenderedEmail } from './template.types';

export function renderPaymentReversedEmail(data: PaymentReversedTemplateData): RenderedEmail {
  if (!data.schoolName) throw new Error('Missing required field: schoolName');
  if (!data.studentName) throw new Error('Missing required field: studentName');
  if (!data.reversalNumber) throw new Error('Missing required field: reversalNumber');
  if (data.reversedAmount === undefined || data.reversedAmount === null) {
    throw new Error('Missing required field: reversedAmount');
  }

  const currency = data.currency || 'INR';
  const formattedAmount = formatAmount(data.reversedAmount, currency);
  const reversalTypeLabel =
    data.reversalType === 'BOUNCE'
      ? 'Payment Dishonor / Bounce'
      : data.reversalType === 'CORRECTION'
        ? 'Allocation Adjustment'
        : 'Payment Void / Cancellation';

  const subject = `Fee Payment Reversal Notice - ${data.reversalNumber} | ${data.schoolName}`;

  const cleanReason = sanitizeReasonText(data.reason);
  const safeSchool = escapeHtml(data.schoolName);
  const safeStudent = escapeHtml(data.studentName);
  const safeAdmission = escapeHtml(data.admissionNumber);
  const safeReversalNumber = escapeHtml(data.reversalNumber);
  const safePaymentNumber = escapeHtml(data.originalPaymentNumber);
  const safeReceiptNumber = escapeHtml(data.originalReceiptNumber || 'N/A');
  const safeReason = escapeHtml(cleanReason);
  const safeReversalDate = escapeHtml(data.reversalDate);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 20px; background-color: #f9fafb;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 24px;">
    <div style="border-bottom: 2px solid #dc2626; padding-bottom: 12px; margin-bottom: 20px;">
      <h2 style="color: #991b1b; margin: 0; font-size: 20px;">${safeSchool}</h2>
      <p style="color: #6b7280; margin: 4px 0 0 0; font-size: 13px;">Notice of Fee Payment Reversal</p>
    </div>

    <p style="font-size: 15px;">Dear Parent / Guardian,</p>
    <p style="font-size: 14px;">Please be advised that an accounting reversal has been recorded against a prior fee transaction for your ward. The affected student invoice balances have been adjusted accordingly.</p>

    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 16px; margin-bottom: 16px; font-size: 14px;">
      <p style="margin: 4px 0;"><strong>Student Name:</strong> ${safeStudent}</p>
      <p style="margin: 4px 0;"><strong>Admission Number:</strong> ${safeAdmission}</p>
      <p style="margin: 4px 0;"><strong>Reversal Number:</strong> <span style="font-family: monospace; font-weight: bold; color: #991b1b;">${safeReversalNumber}</span></p>
      <p style="margin: 4px 0;"><strong>Reversal Type:</strong> ${reversalTypeLabel}</p>
      <p style="margin: 4px 0;"><strong>Original Payment:</strong> ${safePaymentNumber}</p>
      <p style="margin: 4px 0;"><strong>Original Receipt:</strong> ${safeReceiptNumber}</p>
      <p style="margin: 4px 0;"><strong>Date of Reversal:</strong> ${safeReversalDate}</p>
      <p style="margin: 8px 0 4px 0; font-size: 16px;"><strong>Reversed Amount:</strong> <span style="color: #dc2626; font-weight: bold;">${formattedAmount}</span></p>
      <p style="margin: 6px 0 0 0; color: #7f1d1d;"><strong>Reason for Reversal:</strong> ${safeReason}</p>
    </div>

    <p style="font-size: 13px; color: #6b7280; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
      If this reversal was due to an instrument dishonor or void, the associated fee invoice balance has returned to outstanding status. Please contact the school accounts office or check your student portal to settle any remaining balance.
    </p>
  </div>
</body>
</html>`;

  const text = `
${sanitizePlainText(data.schoolName)}
Notice of Fee Payment Reversal
--------------------------------------------------

Dear Parent / Guardian,

Please be advised that an accounting reversal has been recorded against a prior fee transaction for your ward.

Reversal Details:
- Student Name: ${sanitizePlainText(data.studentName)}
- Admission Number: ${sanitizePlainText(data.admissionNumber)}
- Reversal Number: ${sanitizePlainText(data.reversalNumber)}
- Reversal Type: ${reversalTypeLabel}
- Original Payment: ${sanitizePlainText(data.originalPaymentNumber)}
- Original Receipt: ${sanitizePlainText(data.originalReceiptNumber || 'N/A')}
- Date of Reversal: ${sanitizePlainText(data.reversalDate)}
- Reversed Amount: ${formattedAmount}
- Reason: ${sanitizePlainText(cleanReason)}

The associated fee invoice balances have been adjusted accordingly. Please contact the accounts office to clear any outstanding obligations.
--------------------------------------------------
${sanitizePlainText(data.schoolName)} Accounts Office
`;

  return { subject, html, text: text.trim() };
}
