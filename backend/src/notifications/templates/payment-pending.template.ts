import { escapeHtml, formatAmount, sanitizePlainText } from './template-sanitizer';
import { PaymentPendingTemplateData, RenderedEmail } from './template.types';

export function renderPaymentPendingEmail(data: PaymentPendingTemplateData): RenderedEmail {
  if (!data.schoolName) throw new Error('Missing required field: schoolName');
  if (!data.studentName) throw new Error('Missing required field: studentName');
  if (!data.paymentNumber) throw new Error('Missing required field: paymentNumber');
  if (data.paymentAmount === undefined || data.paymentAmount === null) {
    throw new Error('Missing required field: paymentAmount');
  }

  const currency = data.currency || 'INR';
  const formattedAmount = formatAmount(data.paymentAmount, currency);
  const subject = `Fee Payment Verification Pending - ${data.paymentNumber} | ${data.schoolName}`;

  const safeSchool = escapeHtml(data.schoolName);
  const safeStudent = escapeHtml(data.studentName);
  const safeAdmission = escapeHtml(data.admissionNumber);
  const safePaymentNumber = escapeHtml(data.paymentNumber);
  const safePaymentMethod = escapeHtml(data.paymentMethod);
  const safeInitiatedAt = escapeHtml(data.initiatedAt);
  const safeNotes = escapeHtml(data.verificationNotes || 'Payment is undergoing banking clearance or manual reconciliation.');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 20px; background-color: #f9fafb;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 24px;">
    <div style="border-bottom: 2px solid #d97706; padding-bottom: 12px; margin-bottom: 20px;">
      <h2 style="color: #92400e; margin: 0; font-size: 20px;">${safeSchool}</h2>
      <p style="color: #6b7280; margin: 4px 0 0 0; font-size: 13px;">Fee Payment Status: Verification Pending</p>
    </div>

    <p style="font-size: 15px;">Dear Parent / Guardian,</p>
    <p style="font-size: 14px;">
      We have received your payment initiation details. The transaction is currently <strong>awaiting verification and banking clearance</strong>. Details of the pending transaction:
    </p>

    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 16px; margin-bottom: 16px; font-size: 14px;">
      <p style="margin: 4px 0;"><strong>Student Name:</strong> ${safeStudent}</p>
      <p style="margin: 4px 0;"><strong>Admission Number:</strong> ${safeAdmission}</p>
      <p style="margin: 4px 0;"><strong>Transaction Reference:</strong> <span style="font-family: monospace; font-weight: bold; color: #92400e;">${safePaymentNumber}</span></p>
      <p style="margin: 4px 0;"><strong>Payment Method:</strong> ${safePaymentMethod}</p>
      <p style="margin: 4px 0;"><strong>Initiated At:</strong> ${safeInitiatedAt}</p>
      <p style="margin: 8px 0 4px 0; font-size: 16px;"><strong>Amount Under Verification:</strong> <span style="color: #b45309; font-weight: bold;">${formattedAmount}</span></p>
      <p style="margin: 8px 0 0 0; font-size: 13px; color: #78350f;"><strong>Status Note:</strong> ${safeNotes}</p>
    </div>

    <div style="background-color: #f3f4f6; border-radius: 6px; padding: 12px; font-size: 13px; color: #4b5563;">
      <strong>Important Notice:</strong> This is an acknowledgement of transaction submission, NOT an official fee receipt. Once the funds are cleared and verified by the school accounts office, an authoritative receipt will be issued and your student ledger updated.
    </div>

    <p style="font-size: 13px; color: #6b7280; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
      If you did not initiate this transaction or require assistance, please contact the accounts department with reference <strong>${safePaymentNumber}</strong>.
    </p>
  </div>
</body>
</html>`;

  const text = `
${sanitizePlainText(data.schoolName)}
Fee Payment Status: Verification Pending
--------------------------------------------------

Dear Parent / Guardian,

We have received your payment initiation details. The transaction is currently awaiting verification and banking clearance.

Transaction Details:
- Student Name: ${sanitizePlainText(data.studentName)}
- Admission Number: ${sanitizePlainText(data.admissionNumber)}
- Transaction Reference: ${sanitizePlainText(data.paymentNumber)}
- Payment Method: ${sanitizePlainText(data.paymentMethod)}
- Initiated At: ${sanitizePlainText(data.initiatedAt)}
- Amount Under Verification: ${formattedAmount}
- Status Note: ${sanitizePlainText(data.verificationNotes || 'Payment is undergoing banking clearance or manual reconciliation.')}

NOTICE: This is an acknowledgement of submission, NOT an official fee receipt. Once funds are confirmed, an official receipt will be issued.
--------------------------------------------------
${sanitizePlainText(data.schoolName)} Accounts Office
`;

  return { subject, html, text: text.trim(), htmlBody: html, textBody: text.trim() };
}
