import { escapeHtml, formatAmount, sanitizePlainText } from './template-sanitizer';
import { ReceiptIssuedTemplateData, RenderedEmail } from './template.types';

export function renderReceiptIssuedEmail(data: ReceiptIssuedTemplateData): RenderedEmail {
  if (!data.schoolName) throw new Error('Missing required field: schoolName');
  if (!data.studentName) throw new Error('Missing required field: studentName');
  if (!data.receiptNumber) throw new Error('Missing required field: receiptNumber');
  if (data.totalAmount === undefined || data.totalAmount === null) {
    throw new Error('Missing required field: totalAmount');
  }

  const currency = data.currency || 'INR';
  const formattedTotal = formatAmount(data.totalAmount, currency);
  const subject = `Fee Payment Receipt - ${data.receiptNumber} | ${data.schoolName}`;

  const safeSchool = escapeHtml(data.schoolName);
  const safeStudent = escapeHtml(data.studentName);
  const safeAdmission = escapeHtml(data.admissionNumber);
  const safeReceiptNumber = escapeHtml(data.receiptNumber);
  const safePaymentNumber = escapeHtml(data.paymentNumber);
  const safePaymentDate = escapeHtml(data.paymentDate);
  const safePaymentMethod = escapeHtml(data.paymentMethod);
  const safeAcademicYear = escapeHtml(data.academicYear || 'Current Academic Year');

  let lineItemsHtml = '';
  let lineItemsText = '';

  if (Array.isArray(data.lineItems) && data.lineItems.length > 0) {
    lineItemsHtml = `
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
        <thead>
          <tr style="background-color: #f3f4f6; text-align: left;">
            <th style="padding: 8px 12px; border: 1px solid #e5e7eb;">Fee Head</th>
            <th style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${data.lineItems
            .map(
              (item) => `
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${escapeHtml(item.feeHeadName)}</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: right;">${formatAmount(item.amount, currency)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>`;

    lineItemsText = data.lineItems
      .map((item) => `  - ${item.feeHeadName}: ${formatAmount(item.amount, currency)}`)
      .join('\n');
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 20px; background-color: #f9fafb;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 24px;">
    <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px;">
      <h2 style="color: #1e3a8a; margin: 0; font-size: 20px;">${safeSchool}</h2>
      <p style="color: #6b7280; margin: 4px 0 0 0; font-size: 13px;">Official Fee Payment Confirmation</p>
    </div>

    <p style="font-size: 15px;">Dear Parent / Guardian,</p>
    <p style="font-size: 14px;">We have successfully received and processed your fee payment. Details of the transaction are summarized below:</p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 16px; font-size: 14px;">
      <p style="margin: 4px 0;"><strong>Student Name:</strong> ${safeStudent}</p>
      <p style="margin: 4px 0;"><strong>Admission Number:</strong> ${safeAdmission}</p>
      <p style="margin: 4px 0;"><strong>Academic Year:</strong> ${safeAcademicYear}</p>
      <p style="margin: 4px 0;"><strong>Receipt Number:</strong> <span style="font-family: monospace; font-weight: bold; color: #1e40af;">${safeReceiptNumber}</span></p>
      <p style="margin: 4px 0;"><strong>Payment Date:</strong> ${safePaymentDate}</p>
      <p style="margin: 4px 0;"><strong>Payment Method:</strong> ${safePaymentMethod}</p>
      <p style="margin: 8px 0 4px 0; font-size: 16px;"><strong>Total Paid:</strong> <span style="color: #15803d; font-weight: bold;">${formattedTotal}</span></p>
    </div>

    ${lineItemsHtml ? `<h4 style="margin: 16px 0 8px 0; font-size: 14px; color: #374151;">Fee Head Breakdown</h4>${lineItemsHtml}` : ''}

    <p style="font-size: 13px; color: #6b7280; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
      This is an electronically generated notification. Please preserve your receipt number <strong>${safeReceiptNumber}</strong> for any future correspondence with the school accounts office.
    </p>
  </div>
</body>
</html>`;

  const text = `
${sanitizePlainText(data.schoolName)}
Official Fee Payment Confirmation
--------------------------------------------------

Dear Parent / Guardian,

We have successfully received and processed your fee payment.

Transaction Summary:
- Student Name: ${sanitizePlainText(data.studentName)}
- Admission Number: ${sanitizePlainText(data.admissionNumber)}
- Academic Year: ${sanitizePlainText(data.academicYear || 'Current Academic Year')}
- Receipt Number: ${sanitizePlainText(data.receiptNumber)}
- Payment Number: ${sanitizePlainText(data.paymentNumber)}
- Payment Date: ${sanitizePlainText(data.paymentDate)}
- Payment Method: ${sanitizePlainText(data.paymentMethod)}
- Total Paid: ${formattedTotal}

${lineItemsText ? `Fee Head Breakdown:\n${lineItemsText}\n` : ''}
Please preserve your receipt number ${sanitizePlainText(data.receiptNumber)} for any future correspondence.
--------------------------------------------------
${sanitizePlainText(data.schoolName)} Accounts Office
`;

  return { subject, html, text: text.trim() };
}
