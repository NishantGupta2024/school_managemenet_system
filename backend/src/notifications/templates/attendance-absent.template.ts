import { escapeHtml } from './template-sanitizer';
import { AttendanceAbsentTemplateData, RenderedEmail } from './template.types';

export function renderAttendanceAbsentEmail(data: AttendanceAbsentTemplateData): RenderedEmail {
  const schoolName = escapeHtml(data.schoolName || 'Our School');
  const studentName = escapeHtml(data.studentName || 'Student');
  const admissionNumber = escapeHtml(data.admissionNumber || 'N/A');
  const gradeName = data.gradeName ? escapeHtml(data.gradeName) : 'N/A';
  const sectionName = data.sectionName ? escapeHtml(data.sectionName) : '';
  const attendanceDate = escapeHtml(data.attendanceDate);

  const subject = `Student Absence Notification — ${data.studentName} on ${data.attendanceDate} | ${data.schoolName}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 24px; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background-color: #dc2626; color: #ffffff; padding: 20px; text-align: center; }
    .header h1 { margin: 0 0 4px 0; font-size: 20px; }
    .header p { margin: 0; opacity: 0.9; font-size: 14px; }
    .content { padding: 24px; }
    .alert-card { background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #fee2e2; font-size: 14px; }
    .row:last-child { border-bottom: none; }
    .label { color: #7f1d1d; font-weight: 500; }
    .value { font-weight: 600; color: #991b1b; }
    .footer { padding: 16px 24px; background-color: #f3f4f6; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${schoolName}</h1>
      <p>Daily Attendance Alert</p>
    </div>
    <div class="content">
      <p>Dear Parent / Guardian,</p>
      <p>This is to inform you that your child <strong>${studentName}</strong> was marked <strong>ABSENT</strong> during roll call today.</p>
      
      <div class="alert-card">
        <div class="row"><span class="label">Student Name:</span><span class="value">${studentName}</span></div>
        <div class="row"><span class="label">Admission Number:</span><span class="value">${admissionNumber}</span></div>
        <div class="row"><span class="label">Class / Section:</span><span class="value">${gradeName}${sectionName ? ` - ${sectionName}` : ''}</span></div>
        <div class="row"><span class="label">Date of Absence:</span><span class="value">${attendanceDate}</span></div>
        <div class="row"><span class="label">Status:</span><span class="value">ABSENT</span></div>
      </div>

      <p>If you believe this record is in error, or if an absence request was already submitted, please contact the school office.</p>
      <p>Sincerely,<br><strong>Attendance Office</strong><br>${schoolName}</p>
    </div>
    <div class="footer">
      This is an automated attendance alert sent from ${schoolName}.
    </div>
  </div>
</body>
</html>`;

  const text = `STUDENT ABSENCE NOTIFICATION
${schoolName}
----------------------------------------
Dear Parent / Guardian,

This is to notify you that your child ${data.studentName} (Admission No: ${data.admissionNumber}) was marked ABSENT today (${data.attendanceDate}) in Class ${data.gradeName || 'N/A'}${data.sectionName ? ` - ${data.sectionName}` : ''}.

If this absence is unexplained or in error, please contact the school administration immediately.

Sincerely,
Attendance Office, ${data.schoolName}
`;

  return { subject, html, text, htmlBody: html, textBody: text };
}
