import { escapeHtml, formatAmount, sanitizePlainText, sanitizeReasonText } from './template-sanitizer';
import { PaymentFailedTemplateData, RenderedEmail } from './template.types';

export function renderPaymentFailedEmail(data: PaymentFailedTemplateData): RenderedEmail {
  if (!data.schoolName) throw new Error('Missing required field: schoolName');
  if (!data.studentName) throw new Error('Missing required field: studentName');
  if (!data.paymentNumber) throw new Error('Missing required field: paymentNumber');
  if (data.attemptedAmount === undefined || data.attemptedAmount === null) {
    throw new Error('Missing required field: attemptedAmount');
  }

  const currency = data.currency || 'INR';
  const formattedAmount = formatAmount(data.attemptedAmount, currency);
  const subject = `Fee Payment Unsuccessful - ${data.paymentNumber} | ${data.schoolName}`;

  const safeSchool = escapeHtml(data.schoolName);
  const safeStudent = escapeHtml(data.studentName);
  const safeAdmission = escapeHtml(data.admissionNumber);
  const safePaymentNumber = escapeHtml(data.paymentNumber);
  const safePaymentMethod = escapeHtml(data.paymentMethod);
  const safeAttemptedAt = escapeHtml(data.attemptedAt);
  const safeReason = escapeHtml(sanitizeReasonText(data.failureReason || 'Transaction rejected by banking partner'));

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
      <p style="color: #dc2626; margin: 4px 0 0 0; font-size: 13px; font-weight: bold;">Fee Payment Unsuccessful</p>
    </div>

    <p style="font-size: 15px;">Dear Parent / Guardian,</p>
    <p style="font-size: 14px;">
      We regret to inform you that your recent fee payment attempt could <strong>not be processed</strong>. No funds have been credited towards the student's fee obligation.
    </p>

    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 16px; margin-bottom: 16px; font-size: 14px;">
      <p style="margin: 4px 0;"><strong>Student Name:</strong> ${safeStudent}</p>
      <p style="margin: 4px 0;"><strong>Admission Number:</strong> ${safeAdmission}</p>
      <p style="margin: 4px 0;"><strong>Transaction Attempt:</strong> <span style="font-family: monospace; font-weight: bold; color: #991b1b;">${safePaymentNumber}</span></p>
      <p style="margin: 4px 0;"><strong>Payment Method:</strong> ${safePaymentMethod}</p>
      <p style="margin: 4px 0;"><strong>Attempted At:</strong> ${safeAttemptedAt}</p>
      <p style="margin: 8px 0 4px 0; font-size: 16px;"><strong>Attempted Amount:</strong> <span style="color: #991b1b; font-weight: bold;">${formattedAmount}</span></p>
      <p style="margin: 8px 0 0 0; font-size: 13px; color: #7f1d1d;"><strong>Reason for Failure:</strong> ${safeReason}</p>
    </div>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 13px; color: #334155;">
      <strong>Action Required:</strong> If any funds were deducted from your bank account, they are typically reversed by your banking partner within 3-5 business days. Please retry payment through the student fee portal or contact the school accounts office to prevent late fee assessments.
    </div>

    <p style="font-size: 13px; color: #6b7280; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
      For queries regarding this failed attempt, please quote reference number <strong>${safePaymentNumber}</strong> when contacting the bursar.
    </p>
  </div>
</body>
</html>`;

  const text = `
${sanitizePlainText(data.schoolName)}
Fee Payment Status: UNSUCCESSFUL
--------------------------------------------------

Dear Parent / Guardian,

Your recent fee payment attempt could NOT be processed. No funds have been credited towards the student fee account.

Attempt Details:
- Student Name: ${sanitizePlainText(data.studentName)}
- Admission Number: ${sanitizePlainText(data.admissionNumber)}
- Transaction Attempt: ${sanitizePlainText(data.paymentNumber)}
- Payment Method: ${sanitizePlainText(data.paymentMethod)}
- Attempted At: ${sanitizePlainText(data.attemptedAt)}
- Attempted Amount: ${formattedAmount}
- Failure Reason: ${sanitizePlainText(safeReason)}

Action Required:
If funds were deducted from your account, they will typically be reversed by your bank. Please retry payment or contact the school accounts office.
--------------------------------------------------
${sanitizePlainText(data.schoolName)} Accounts Office
`;

  return { subject, html, text: text.trim(), htmlBody: html, textBody: text.trim() };
}
