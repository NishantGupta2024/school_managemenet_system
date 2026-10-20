import { escapeHtml, formatAmount, sanitizePlainText } from './template-sanitizer';
import { FeeReminderMilestone, FeeReminderTemplateData, RenderedEmail } from './template.types';

function getMilestoneMetadata(milestone: FeeReminderMilestone, dueDate: string, daysOverdue?: number) {
  switch (milestone) {
    case 'DUE_IN_7_DAYS':
      return {
        subjectPrefix: 'Upcoming Fee Reminder: Due in 7 Days',
        bannerTitle: 'Upcoming Fee Reminder (7 Days Remaining)',
        bannerColor: '#2563eb',
        accentBg: '#eff6ff',
        accentBorder: '#bfdbfe',
        statusText: `Payment is due on ${dueDate}. Please schedule your payment to ensure uninterrupted school services.`,
        urgencyNote: 'Advance reminder to assist with your monthly fee planning.',
      };
    case 'DUE_IN_1_DAY':
      return {
        subjectPrefix: 'Urgent Fee Reminder: Due Tomorrow',
        bannerTitle: 'Urgent Fee Reminder (Due Tomorrow)',
        bannerColor: '#d97706',
        accentBg: '#fffbeb',
        accentBorder: '#fde68a',
        statusText: `Payment is due tomorrow (${dueDate}). Prompt payment prevents any late fee assessments.`,
        urgencyNote: 'Please settle the balance by end of business tomorrow.',
      };
    case 'DUE_TODAY':
      return {
        subjectPrefix: 'Fee Payment Due Today',
        bannerTitle: 'Fee Payment Due Today',
        bannerColor: '#b45309',
        accentBg: '#fef3c7',
        accentBorder: '#fcd34d',
        statusText: `Payment is due today (${dueDate}). Please complete your payment today.`,
        urgencyNote: 'Final on-time payment notice for the current fee cycle.',
      };
    case 'OVERDUE':
    default:
      const overdueText = typeof daysOverdue === 'number' && daysOverdue > 0 ? ` (${daysOverdue} days overdue)` : '';
      return {
        subjectPrefix: `Overdue Fee Notice: Immediate Payment Required${overdueText}`,
        bannerTitle: 'Overdue Fee Notice',
        bannerColor: '#dc2626',
        accentBg: '#fef2f2',
        accentBorder: '#fecaca',
        statusText: `This fee obligation was due on ${dueDate} and is now overdue. Overdue accounts may be subject to statutory late fees.`,
        urgencyNote: 'Immediate payment is requested to regularize student records.',
      };
  }
}

export function renderFeeDueReminderEmail(data: FeeReminderTemplateData): RenderedEmail {
  if (!data.schoolName) throw new Error('Missing required field: schoolName');
  if (!data.studentName) throw new Error('Missing required field: studentName');
  if (!data.dueDate) throw new Error('Missing required field: dueDate');
  if (data.balanceDue === undefined || data.balanceDue === null) {
    throw new Error('Missing required field: balanceDue');
  }

  const currency = data.currency || 'INR';
  const meta = getMilestoneMetadata(data.milestone, data.dueDate, data.daysOverdue);
  const formattedBalance = formatAmount(data.balanceDue, currency);
  const formattedTotal = formatAmount(data.totalFeeAmount, currency);
  const formattedPaid = data.paidAmount !== undefined ? formatAmount(data.paidAmount, currency) : undefined;

  const subject = `${meta.subjectPrefix} | ${data.schoolName}`;

  const safeSchool = escapeHtml(data.schoolName);
  const safeStudent = escapeHtml(data.studentName);
  const safeAdmission = escapeHtml(data.admissionNumber);
  const safeDueDate = escapeHtml(data.dueDate);
  const safeAcademicYear = escapeHtml(data.academicYearName || 'Current Academic Year');
  const safeBillingMonth = escapeHtml(data.billingMonthName || '');
  const safeClass = escapeHtml([data.gradeName, data.sectionName].filter(Boolean).join(' - ') || 'N/A');

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
    <div style="border-bottom: 2px solid ${meta.bannerColor}; padding-bottom: 12px; margin-bottom: 20px;">
      <h2 style="color: ${meta.bannerColor}; margin: 0; font-size: 20px;">${safeSchool}</h2>
      <p style="color: #6b7280; margin: 4px 0 0 0; font-size: 13px;">${escapeHtml(meta.bannerTitle)}</p>
    </div>

    <p style="font-size: 15px;">Dear Parent / Guardian,</p>
    <p style="font-size: 14px;">${escapeHtml(meta.statusText)}</p>

    <div style="background-color: ${meta.accentBg}; border: 1px solid ${meta.accentBorder}; border-radius: 6px; padding: 16px; margin-bottom: 16px; font-size: 14px;">
      <p style="margin: 4px 0;"><strong>Student Name:</strong> ${safeStudent}</p>
      <p style="margin: 4px 0;"><strong>Admission Number:</strong> ${safeAdmission}</p>
      <p style="margin: 4px 0;"><strong>Class / Section:</strong> ${safeClass}</p>
      <p style="margin: 4px 0;"><strong>Academic Year:</strong> ${safeAcademicYear}</p>
      ${safeBillingMonth ? `<p style="margin: 4px 0;"><strong>Billing Period:</strong> ${safeBillingMonth}</p>` : ''}
      <p style="margin: 4px 0;"><strong>Due Date:</strong> <span style="font-weight: bold; color: ${meta.bannerColor};">${safeDueDate}</span></p>
      <p style="margin: 4px 0;"><strong>Total Invoice Amount:</strong> ${formattedTotal}</p>
      ${formattedPaid ? `<p style="margin: 4px 0;"><strong>Previously Paid:</strong> ${formattedPaid}</p>` : ''}
      <p style="margin: 8px 0 4px 0; font-size: 16px;"><strong>Outstanding Balance Due:</strong> <span style="color: ${meta.bannerColor}; font-weight: bold;">${formattedBalance}</span></p>
    </div>

    ${lineItemsHtml ? `<h4 style="margin: 16px 0 8px 0; font-size: 14px; color: #374151;">Fee Head Breakdown</h4>${lineItemsHtml}` : ''}

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-top: 16px; font-size: 13px; color: #475569;">
      <strong>Payment Guidance:</strong> ${escapeHtml(meta.urgencyNote)} Payments can be submitted via the school fee portal, UPI, bank transfer, or at the school accounts office.
    </div>

    <p style="font-size: 13px; color: #6b7280; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
      If you have already settled this balance within the last 24 hours, please disregard this notice while your payment reconciles. For questions, contact the bursar's office.
    </p>
  </div>
</body>
</html>`;

  const text = `
${sanitizePlainText(data.schoolName)}
${meta.bannerTitle}
--------------------------------------------------

Dear Parent / Guardian,

${meta.statusText}

Fee Obligation Details:
- Student Name: ${sanitizePlainText(data.studentName)}
- Admission Number: ${sanitizePlainText(data.admissionNumber)}
- Class / Section: ${sanitizePlainText([data.gradeName, data.sectionName].filter(Boolean).join(' - ') || 'N/A')}
- Academic Year: ${sanitizePlainText(data.academicYearName || 'Current Academic Year')}
${data.billingMonthName ? `- Billing Period: ${sanitizePlainText(data.billingMonthName)}\n` : ''}- Due Date: ${sanitizePlainText(data.dueDate)}
- Total Invoice Amount: ${formattedTotal}
${formattedPaid ? `- Previously Paid: ${formattedPaid}\n` : ''}- Outstanding Balance Due: ${formattedBalance}

${lineItemsText ? `Fee Head Breakdown:\n${lineItemsText}\n` : ''}
${meta.urgencyNote}
--------------------------------------------------
${sanitizePlainText(data.schoolName)} Accounts Office
`;

  return { subject, html, text: text.trim(), htmlBody: html, textBody: text.trim() };
}
