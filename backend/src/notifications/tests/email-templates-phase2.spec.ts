import { renderStudentAdmittedEmail } from '../templates/student-admitted.template';
import { renderAttendanceAbsentEmail } from '../templates/attendance-absent.template';
import { renderExamScheduleEmail } from '../templates/exam-schedule.template';
import { renderExamResultsEmail } from '../templates/exam-results.template';

describe('Phase 2 Email Templates', () => {
  describe('renderStudentAdmittedEmail', () => {
    it('renders admission confirmation with escaped HTML and plain text', () => {
      const email = renderStudentAdmittedEmail({
        schoolName: 'Greenwood High <script>',
        studentName: 'Aarav Sharma & Sister',
        admissionNumber: 'ADM-2026-001',
        gradeName: 'Grade 10',
        sectionName: 'A',
        academicYearName: '2026-2027',
        admissionDate: '2026-06-01',
        guardianName: 'Vikram Sharma',
      });

      expect(email.subject).toContain('Admission Confirmation');
      expect(email.subject).toContain('Aarav Sharma &amp; Sister');
      expect(email.html).toContain('Greenwood High &lt;script&gt;');
      expect(email.html).toContain('Aarav Sharma &amp; Sister');
      expect(email.html).not.toContain('<script>');
      expect(email.text).toContain('Greenwood High <script>');
      expect(email.text).toContain('ADM-2026-001');
    });
  });

  describe('renderAttendanceAbsentEmail', () => {
    it('renders daily absence notification with student details and date', () => {
      const email = renderAttendanceAbsentEmail({
        schoolName: 'Springfield Academy',
        studentName: 'Rohan Mehra',
        admissionNumber: 'STU-042',
        gradeName: 'Grade 8',
        sectionName: 'B',
        attendanceDate: '2026-11-01',
      });

      expect(email.subject).toContain('Student Absence Notification');
      expect(email.subject).toContain('Rohan Mehra');
      expect(email.subject).toContain('2026-11-01');
      expect(email.html).toContain('marked <strong>ABSENT</strong>');
      expect(email.text).toContain('marked ABSENT today (2026-11-01)');
    });
  });

  describe('renderExamScheduleEmail', () => {
    it('renders examination schedule with instructions and marks', () => {
      const email = renderExamScheduleEmail({
        schoolName: 'Apex International',
        studentName: 'Priya Verma',
        assessmentTitle: 'Term 1 Mathematics',
        subjectName: 'Mathematics',
        gradeName: 'Grade 9',
        sectionName: 'C',
        startDate: '2026-11-15',
        durationMinutes: 90,
        totalMarks: 100,
        instructions: 'Bring scientific calculator & blue pen <br>',
      });

      expect(email.subject).toContain('New Assessment Published: Term 1 Mathematics');
      expect(email.html).toContain('Apex International');
      expect(email.html).toContain('90 Minutes');
      expect(email.html).toContain('Bring scientific calculator &amp; blue pen &lt;br&gt;');
      expect(email.text).toContain('Duration: 90 Minutes');
    });
  });

  describe('renderExamResultsEmail', () => {
    it('renders examination result statement with scores and percentage', () => {
      const email = renderExamResultsEmail({
        schoolName: 'Apex International',
        studentName: 'Priya Verma',
        admissionNumber: 'ADM-99',
        assessmentTitle: 'Term 1 Mathematics',
        subjectName: 'Mathematics',
        gradeName: 'Grade 9',
        sectionName: 'C',
        score: 88,
        totalMarks: 100,
        percentage: 88,
        gradeAwarded: 'A',
        releasedAt: '2026-11-20',
      });

      expect(email.subject).toContain('Results Released: Term 1 Mathematics — Priya Verma');
      expect(email.html).toContain('88 / 100');
      expect(email.html).toContain('88%');
      expect(email.html).toContain('Grade Awarded:</span><span class="value">A</span>');
      expect(email.text).toContain('Score: 88 / 100');
    });
  });
});
