import { escapeHtml } from './template-sanitizer';
import { ExamScheduleTemplateData, RenderedEmail } from './template.types';

export function renderExamScheduleEmail(data: ExamScheduleTemplateData): RenderedEmail {
  const schoolName = escapeHtml(data.schoolName || 'Our School');
  const studentName = escapeHtml(data.studentName || 'Student');
  const assessmentTitle = escapeHtml(data.assessmentTitle);
  const subjectName = escapeHtml(data.subjectName);
  const gradeName = data.gradeName ? escapeHtml(data.gradeName) : 'N/A';
  const sectionName = data.sectionName ? escapeHtml(data.sectionName) : '';
  const startDate = data.startDate ? escapeHtml(data.startDate) : 'To be announced';
  const duration = data.durationMinutes ? `${data.durationMinutes} Minutes` : 'N/A';
  const totalMarks = data.totalMarks ?? 'N/A';
  const instructions = data.instructions ? escapeHtml(data.instructions) : null;

  const subject = `New Assessment Published: ${data.assessmentTitle} (${data.subjectName}) | ${data.schoolName}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 24px; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background-color: #4338ca; color: #ffffff; padding: 20px; text-align: center; }
    .header h1 { margin: 0 0 4px 0; font-size: 20px; }
    .header p { margin: 0; opacity: 0.9; font-size: 14px; }
    .content { padding: 24px; }
    .info-card { background-color: #eef2ff; border-left: 4px solid #6366f1; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e0e7ff; font-size: 14px; }
    .row:last-child { border-bottom: none; }
    .label { color: #3730a3; font-weight: 500; }
    .value { font-weight: 600; color: #1e1b4b; }
    .instructions-box { background: #fdf2f8; border: 1px dashed #f472b6; padding: 12px; margin-top: 16px; border-radius: 4px; font-size: 13px; }
    .footer { padding: 16px 24px; background-color: #f3f4f6; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${schoolName}</h1>
      <p>Examination Schedule Notice</p>
    </div>
    <div class="content">
      <p>Dear ${studentName} / Parent,</p>
      <p>A new examination has been scheduled and published for your class.</p>
      
      <div class="info-card">
        <div class="row"><span class="label">Assessment:</span><span class="value">${assessmentTitle}</span></div>
        <div class="row"><span class="label">Subject:</span><span class="value">${subjectName}</span></div>
        <div class="row"><span class="label">Target Class:</span><span class="value">${gradeName}${sectionName ? ` - ${sectionName}` : ''}</span></div>
        <div class="row"><span class="label">Scheduled Date:</span><span class="value">${startDate}</span></div>
        <div class="row"><span class="label">Duration:</span><span class="value">${duration}</span></div>
        <div class="row"><span class="label">Maximum Marks:</span><span class="value">${totalMarks}</span></div>
      </div>

      ${instructions ? `
      <div class="instructions-box">
        <strong>Special Instructions:</strong><br>
        ${instructions}
      </div>` : ''}

      <p>Please log in to the student examination portal to view comprehensive assessment guidelines.</p>
      <p>Best wishes,<br><strong>Examination Department</strong><br>${schoolName}</p>
    </div>
    <div class="footer">
      This is an official examination notice from ${schoolName}.
    </div>
  </div>
</body>
</html>`;

  const text = `EXAMINATION SCHEDULE NOTICE
${schoolName}
----------------------------------------
Dear ${data.studentName} / Parent,

A new examination has been scheduled:
- Assessment Title: ${data.assessmentTitle}
- Subject: ${data.subjectName}
- Class: ${data.gradeName || 'N/A'}${data.sectionName ? ` - ${data.sectionName}` : ''}
- Scheduled Date: ${startDate}
- Duration: ${duration}
- Max Marks: ${totalMarks}
${instructions ? `\nInstructions: ${instructions}\n` : ''}
Please log in to the student examination portal for full details.

Best wishes,
Examination Department, ${data.schoolName}
`;

  return { subject, html, text, htmlBody: html, textBody: text };
}
