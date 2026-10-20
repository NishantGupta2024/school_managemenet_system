import { EmailTemplateRenderer } from './email-template.renderer';
import { renderPaymentPendingEmail } from './payment-pending.template';
import { renderPaymentFailedEmail } from './payment-failed.template';
import { renderFeeDueReminderEmail } from './fee-due-reminder.template';
import {
  FeeReminderTemplateData,
  PaymentFailedTemplateData,
  PaymentPendingTemplateData,
} from './template.types';

describe('New Notification Templates & Rendering', () => {
  let renderer: EmailTemplateRenderer;

  beforeEach(() => {
    renderer = new EmailTemplateRenderer();
  });

  describe('renderPaymentPendingEmail', () => {
    const validData: PaymentPendingTemplateData = {
      schoolName: 'St. Mary High School',
      studentName: 'Rohan Verma',
      admissionNumber: 'ADM-2026-042',
      paymentNumber: 'PMT-CHQ-1001',
      paymentAmount: 15000,
      currency: 'INR',
      paymentMethod: 'CHEQUE',
      initiatedAt: '2026-10-20',
      verificationNotes: 'Cheque clearing in progress with HDFC Bank',
    };

    it('renders payment pending notification with accurate status and pending banner', () => {
      const rendered = renderPaymentPendingEmail(validData);

      expect(rendered.subject).toBe('Fee Payment Verification Pending - PMT-CHQ-1001 | St. Mary High School');
      expect(rendered.html).toContain('Fee Payment Status: Verification Pending');
      expect(rendered.html).toContain('ADM-2026-042');
      expect(rendered.html).toContain('INR 15000.00');
      expect(rendered.html).toContain('Cheque clearing in progress with HDFC Bank');
      expect(rendered.html).toContain('This is an acknowledgement of transaction submission, NOT an official fee receipt');
      // Must NOT contain success confirmation
      expect(rendered.html).not.toContain('Official Fee Payment Confirmation');
      expect(rendered.html).not.toContain('We have successfully received');

      expect(rendered.text).toContain('Fee Payment Status: Verification Pending');
      expect(rendered.text).toContain('Amount Under Verification: INR 15000.00');
      expect(rendered.text).toContain('NOTICE: This is an acknowledgement of submission, NOT an official fee receipt.');

      // Proves both html/htmlBody and text/textBody are populated
      expect(rendered.htmlBody).toBe(rendered.html);
      expect(rendered.textBody).toBe(rendered.text);
    });

    it('throws error if required fields are missing', () => {
      expect(() => renderPaymentPendingEmail({ ...validData, schoolName: '' })).toThrow('Missing required field: schoolName');
      expect(() => renderPaymentPendingEmail({ ...validData, studentName: '' })).toThrow('Missing required field: studentName');
      expect(() => renderPaymentPendingEmail({ ...validData, paymentNumber: '' })).toThrow('Missing required field: paymentNumber');
      expect(() => renderPaymentPendingEmail({ ...validData, paymentAmount: null as any })).toThrow('Missing required field: paymentAmount');
    });
  });

  describe('renderPaymentFailedEmail', () => {
    const validData: PaymentFailedTemplateData = {
      schoolName: 'St. Mary High School',
      studentName: 'Rohan Verma',
      admissionNumber: 'ADM-2026-042',
      paymentNumber: 'PMT-FAIL-9001',
      attemptedAmount: 15000,
      currency: 'INR',
      paymentMethod: 'UPI',
      failureReason: 'Bank network timeout; debit reversed',
      attemptedAt: '2026-10-20',
    };

    it('renders payment failed notification with accurate status and clear failure notice', () => {
      const rendered = renderPaymentFailedEmail(validData);

      expect(rendered.subject).toBe('Fee Payment Unsuccessful - PMT-FAIL-9001 | St. Mary High School');
      expect(rendered.html).toContain('Fee Payment Unsuccessful');
      expect(rendered.html).toContain('No funds have been credited');
      expect(rendered.html).toContain('Bank network timeout; debit reversed');
      expect(rendered.html).toContain('INR 15000.00');
      // Must NOT describe as successful
      expect(rendered.html).not.toContain('successfully received');
      expect(rendered.html).not.toContain('Official Fee Payment Confirmation');

      expect(rendered.text).toContain('Fee Payment Status: UNSUCCESSFUL');
      expect(rendered.text).toContain('Attempted Amount: INR 15000.00');
      expect(rendered.text).toContain('Failure Reason: Bank network timeout; debit reversed');

      expect(rendered.htmlBody).toBe(rendered.html);
      expect(rendered.textBody).toBe(rendered.text);
    });

    it('throws error if required fields are missing', () => {
      expect(() => renderPaymentFailedEmail({ ...validData, schoolName: '' })).toThrow('Missing required field: schoolName');
      expect(() => renderPaymentFailedEmail({ ...validData, studentName: '' })).toThrow('Missing required field: studentName');
      expect(() => renderPaymentFailedEmail({ ...validData, paymentNumber: '' })).toThrow('Missing required field: paymentNumber');
      expect(() => renderPaymentFailedEmail({ ...validData, attemptedAmount: null as any })).toThrow('Missing required field: attemptedAmount');
    });
  });

  describe('renderFeeDueReminderEmail', () => {
    const baseData: FeeReminderTemplateData = {
      schoolName: 'Delhi Heritage Public School',
      studentName: 'Ananya Sharma',
      admissionNumber: 'DHS-2026-108',
      gradeName: 'Class X',
      sectionName: 'A',
      academicYearName: '2026-2027',
      billingMonthName: 'October 2026',
      milestone: 'DUE_IN_7_DAYS',
      dueDate: '2026-10-27',
      totalFeeAmount: 25000,
      paidAmount: 5000,
      balanceDue: 20000,
      currency: 'INR',
      lineItems: [
        { feeHeadName: 'Tuition Fee', amount: 18000 },
        { feeHeadName: 'Lab Maintenance', amount: 2000 },
      ],
    };

    it('renders 7 days before due date reminder', () => {
      const rendered = renderFeeDueReminderEmail(baseData);

      expect(rendered.subject).toContain('Upcoming Fee Reminder: Due in 7 Days');
      expect(rendered.html).toContain('Upcoming Fee Reminder (7 Days Remaining)');
      expect(rendered.html).toContain('Class X - A');
      expect(rendered.html).toContain('INR 20000.00');
      expect(rendered.html).toContain('Tuition Fee');
      expect(rendered.html).toContain('Lab Maintenance');
      expect(rendered.text).toContain('Upcoming Fee Reminder (7 Days Remaining)');
      expect(rendered.text).toContain('Outstanding Balance Due: INR 20000.00');
    });

    it('renders 1 day before due date reminder', () => {
      const rendered = renderFeeDueReminderEmail({
        ...baseData,
        milestone: 'DUE_IN_1_DAY',
        dueDate: '2026-10-21',
      });

      expect(rendered.subject).toContain('Urgent Fee Reminder: Due Tomorrow');
      expect(rendered.html).toContain('Urgent Fee Reminder (Due Tomorrow)');
      expect(rendered.html).toContain('due tomorrow');
      expect(rendered.text).toContain('Urgent Fee Reminder (Due Tomorrow)');
    });

    it('renders on due date reminder', () => {
      const rendered = renderFeeDueReminderEmail({
        ...baseData,
        milestone: 'DUE_TODAY',
        dueDate: '2026-10-20',
      });

      expect(rendered.subject).toContain('Fee Payment Due Today');
      expect(rendered.html).toContain('Fee Payment Due Today');
      expect(rendered.html).toContain('due today');
    });

    it('renders overdue reminder with days overdue count', () => {
      const rendered = renderFeeDueReminderEmail({
        ...baseData,
        milestone: 'OVERDUE',
        dueDate: '2026-10-10',
        daysOverdue: 10,
      });

      expect(rendered.subject).toContain('Overdue Fee Notice: Immediate Payment Required (10 days overdue)');
      expect(rendered.html).toContain('Overdue Fee Notice');
      expect(rendered.html).toContain('is now overdue');
      expect(rendered.text).toContain('Overdue Fee Notice');
    });

    it('throws error if required fields are missing', () => {
      expect(() => renderFeeDueReminderEmail({ ...baseData, schoolName: '' })).toThrow('Missing required field: schoolName');
      expect(() => renderFeeDueReminderEmail({ ...baseData, studentName: '' })).toThrow('Missing required field: studentName');
      expect(() => renderFeeDueReminderEmail({ ...baseData, dueDate: '' })).toThrow('Missing required field: dueDate');
      expect(() => renderFeeDueReminderEmail({ ...baseData, balanceDue: null as any })).toThrow('Missing required field: balanceDue');
    });
  });

  describe('EmailTemplateRenderer Integration', () => {
    it('dispatches to all new template keys and returns both html/htmlBody and text/textBody', () => {
      const pending = renderer.render('PAYMENT_PENDING', {
        schoolName: 'Test School',
        studentName: 'Student A',
        admissionNumber: '101',
        paymentNumber: 'PMT-1',
        paymentAmount: 500,
        currency: 'INR',
        paymentMethod: 'UPI',
        initiatedAt: '2026-10-20',
      });
      expect(pending.subject).toContain('Payment Verification Pending');
      expect(pending.htmlBody).toBe(pending.html);
      expect(pending.textBody).toBe(pending.text);

      const failed = renderer.render('PAYMENT_FAILED', {
        schoolName: 'Test School',
        studentName: 'Student A',
        admissionNumber: '101',
        paymentNumber: 'PMT-1',
        attemptedAmount: 500,
        currency: 'INR',
        paymentMethod: 'UPI',
        failureReason: 'Insufficient funds',
        attemptedAt: '2026-10-20',
      });
      expect(failed.subject).toContain('Payment Unsuccessful');
      expect(failed.htmlBody).toBe(failed.html);
      expect(failed.textBody).toBe(failed.text);

      const reminder = renderer.render('FEE_DUE_REMINDER', {
        schoolName: 'Test School',
        studentName: 'Student A',
        admissionNumber: '101',
        milestone: 'DUE_IN_7_DAYS',
        dueDate: '2026-10-27',
        totalFeeAmount: 1000,
        balanceDue: 1000,
        currency: 'INR',
      });
      expect(reminder.subject).toContain('Upcoming Fee Reminder: Due in 7 Days');
      expect(reminder.htmlBody).toBe(reminder.html);
      expect(reminder.textBody).toBe(reminder.text);
    });

    it('renders all four milestones correctly when dispatched with canonical FEE_DUE_REMINDER key', () => {
      const baseData = {
        schoolName: 'Greenwood International',
        studentName: 'Aarav Patel',
        admissionNumber: 'ADM-902',
        dueDate: '2026-10-20',
        totalFeeAmount: 12000,
        balanceDue: 12000,
        currency: 'INR',
      };

      const rem7Days = renderer.render('FEE_DUE_REMINDER', {
        ...baseData,
        milestone: 'DUE_IN_7_DAYS',
        dueDate: '2026-10-27',
      });
      expect(rem7Days.subject).toBe('Upcoming Fee Reminder: Due in 7 Days | Greenwood International');
      expect(rem7Days.html).toContain('7 Days Remaining');

      const rem1Day = renderer.render('FEE_DUE_REMINDER', {
        ...baseData,
        milestone: 'DUE_IN_1_DAY',
        dueDate: '2026-10-21',
      });
      expect(rem1Day.subject).toBe('Urgent Fee Reminder: Due Tomorrow | Greenwood International');
      expect(rem1Day.html).toContain('Due Tomorrow');

      const remToday = renderer.render('FEE_DUE_REMINDER', {
        ...baseData,
        milestone: 'DUE_TODAY',
        dueDate: '2026-10-20',
      });
      expect(remToday.subject).toBe('Fee Payment Due Today | Greenwood International');
      expect(remToday.html).toContain('Fee Payment Due Today');

      const remOverdue = renderer.render('FEE_DUE_REMINDER', {
        ...baseData,
        milestone: 'OVERDUE',
        dueDate: '2026-10-15',
        daysOverdue: 5,
      });
      expect(remOverdue.subject).toBe('Overdue Fee Notice: Immediate Payment Required (5 days overdue) | Greenwood International');
      expect(remOverdue.html).toContain('Overdue Fee Notice');
    });
  });
});
