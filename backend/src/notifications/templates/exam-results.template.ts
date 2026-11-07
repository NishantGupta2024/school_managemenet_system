import { escapeHtml } from './template-sanitizer';
import { ExamResultsTemplateData, RenderedEmail } from './template.types';

export function renderExamResultsEmail(data: ExamResultsTemplateData): RenderedEmail {
  const schoolName = escapeHtml(data.schoolName || 'Our School');
  const studentName = escapeHtml(data.studentName || 'Student');
  const admissionNumber = escapeHtml(data.admissionNumber || 'N/A');
  const assessmentTitle = escapeHtml(data.assessmentTitle);
  const subjectName = escapeHtml(data.subjectName);
  const gradeName = data.gradeName ? escapeHtml(data.gradeName) : 'N/A';
  const sectionName = data.sectionName ? escapeHtml(data.sectionName) : '';
  const score = escapeHtml(String(data.score));
  const totalMarks = escapeHtml(String(data.totalMarks));
  const percentage = data.percentage !== undefined ? `${escapeHtml(String(data.percentage))}%` : 'N/A';
  const gradeAwarded = data.gradeAwarded ? escapeHtml(data.gradeAwarded) : 'N/A';
  const releasedAt = escapeHtml(data.releasedAt || new Date().toISOString().split('T')[0]);

  const subject = `Results Released: ${data.assessmentTitle} — ${data.studentName} | ${data.schoolName}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 24px; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background-color: #047857; color: #ffffff; padding: 20px; text-align: center; }
    .header h1 { margin: 0 0 4px 0; font-size: 20px; }
    .header p { margin: 0; opacity: 0.9; font-size: 14px; }
    .content { padding: 24px; }
    .score-card { background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #d1fae5; font-size: 14px; }
    .row:last-child { border-bottom: none; }
    .label { color: #065f46; font-weight: 500; }
    .value { font-weight: 600; color: #047857; }
    .footer { padding: 16px 24px; background-color: #f3f4f6; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${schoolName}</h1>
      <p>Official Examination Result Statement</p>
    </div>
    <div class="content">
      <p>Dear ${studentName} / Parent,</p>
      <p>The evaluation for <strong>${assessmentTitle}</strong> has been finalized and released.</p>
      
      <div class="score-card">
        <div class="row"><span class="label">Student:</span><span class="value">${studentName} (${admissionNumber})</span></div>
        <div class="row"><span class="label">Assessment:</span><span class="value">${assessmentTitle}</span></div>
        <div class="row"><span class="label">Subject:</span><span class="value">${subjectName}</span></div>
        <div class="row"><span class="label">Class:</span><span class="value">${gradeName}${sectionName ? ` - ${sectionName}` : ''}</span></div>
        <div class="row"><span class="label">Marks Scored:</span><span class="value"><strong>${score} / ${totalMarks}</strong></span></div>
        <div class="row"><span class="label">Percentage:</span><span class="value">${percentage}</span></div>
        <div class="row"><span class="label">Grade Awarded:</span><span class="value">${gradeAwarded}</span></div>
        <div class="row"><span class="label">Released Date:</span><span class="value">${releasedAt}</span></div>
      </div>

      <p>You can access complete section leaderboards and detailed question-level analytics on the student examination portal.</p>
      <p>Warm regards,<br><strong>Examination Department</strong><br>${schoolName}</p>
    </div>
    <div class="footer">
      Official academic statement issued by ${schoolName}.
    </div>
  </div>
</body>
</html>`;

  const text = `EXAMINATION RESULT STATEMENT
${schoolName}
----------------------------------------
Dear ${data.studentName} / Parent,

Results for ${data.assessmentTitle} (${data.subjectName}) have been released:

- Student: ${data.studentName} (${data.admissionNumber})
- Assessment: ${data.assessmentTitle}
- Subject: ${data.subjectName}
- Score: ${data.score} / ${data.totalMarks}
- Percentage: ${percentage}
- Grade Awarded: ${gradeAwarded}
- Date Released: ${releasedAt}

Detailed score breakdown is available in the student portal.

Warm regards,
Examination Department, ${data.schoolName}
`;

  return { subject, html, text, htmlBody: html, textBody: text };
}
