import { escapeHtml, validateEmailAddress } from './template-sanitizer';
import { StudentAdmittedTemplateData, RenderedEmail } from './template.types';

export function renderStudentAdmittedEmail(data: StudentAdmittedTemplateData): RenderedEmail {
  const schoolName = escapeHtml(data.schoolName || 'Our School');
  const studentName = escapeHtml(data.studentName || 'Student');
  const admissionNumber = escapeHtml(data.admissionNumber || 'N/A');
  const gradeName = data.gradeName ? escapeHtml(data.gradeName) : 'N/A';
  const sectionName = data.sectionName ? escapeHtml(data.sectionName) : '';
  const academicYearName = data.academicYearName ? escapeHtml(data.academicYearName) : '';
  const admissionDate = escapeHtml(data.admissionDate || new Date().toISOString().split('T')[0]);
  const guardianName = data.guardianName ? escapeHtml(data.guardianName) : null;

  const subject = `Admission Confirmation — ${escapeHtml(data.studentName)} (${escapeHtml(data.admissionNumber)}) | ${schoolName}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 24px; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background-color: #1e40af; color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0 0 4px 0; font-size: 20px; }
    .header p { margin: 0; opacity: 0.9; font-size: 14px; }
    .content { padding: 24px; }
    .info-card { background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    .row:last-child { border-bottom: none; }
    .label { color: #6b7280; font-weight: 500; }
    .value { font-weight: 600; color: #111827; }
    .footer { padding: 16px 24px; background-color: #f3f4f6; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${schoolName}</h1>
      <p>Admission Confirmation</p>
    </div>
    <div class="content">
      <p>Dear ${guardianName ? guardianName : 'Parent/Guardian'},</p>
      <p>We are delighted to confirm that <strong>${studentName}</strong> has been successfully admitted to <strong>${schoolName}</strong>.</p>
      
      <div class="info-card">
        <div class="row"><span class="label">Student Name:</span><span class="value">${studentName}</span></div>
        <div class="row"><span class="label">Admission Number:</span><span class="value">${admissionNumber}</span></div>
        <div class="row"><span class="label">Class / Grade:</span><span class="value">${gradeName}${sectionName ? ` - ${sectionName}` : ''}</span></div>
        ${academicYearName ? `<div class="row"><span class="label">Academic Session:</span><span class="value">${academicYearName}</span></div>` : ''}
        <div class="row"><span class="label">Admission Date:</span><span class="value">${admissionDate}</span></div>
      </div>

      <p>Please preserve this email and the admission number for all future academic and financial correspondences.</p>
      <p>Warm regards,<br><strong>Admissions Office</strong><br>${schoolName}</p>
    </div>
    <div class="footer">
      This is an automated administrative notification sent from ${schoolName}.
    </div>
  </div>
</body>
</html>`;

  const text = `ADMISSION CONFIRMATION
${schoolName}
----------------------------------------
Dear ${guardianName ? guardianName : 'Parent/Guardian'},

We are delighted to confirm that ${data.studentName} has been successfully admitted to ${data.schoolName}.

ADMISSION DETAILS:
- Student Name: ${data.studentName}
- Admission Number: ${data.admissionNumber}
- Class/Grade: ${data.gradeName || 'N/A'}${data.sectionName ? ` - ${data.sectionName}` : ''}
${data.academicYearName ? `- Academic Session: ${data.academicYearName}\n` : ''}- Admission Date: ${admissionDate}

Please preserve this confirmation and the admission number for future academic and fee-related transactions.

Warm regards,
Admissions Office, ${data.schoolName}
`;

  return { subject, html, text, htmlBody: html, textBody: text };
}
