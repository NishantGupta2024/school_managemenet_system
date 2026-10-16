import { NotificationEventType } from '@prisma/client';
import {
  escapeHtml,
  sanitizeSenderDisplayName,
  formatAmount,
  validateEmailAddress,
  sanitizePlainText,
  sanitizeReasonText,
  maskSensitiveReference,
} from './template-sanitizer';
import { renderReceiptIssuedEmail } from './receipt-issued.template';
import { renderPaymentReversedEmail } from './payment-reversed.template';
import { renderRefundSucceededEmail } from './refund-succeeded.template';
import { renderRefundFailedEmail } from './refund-failed.template';
import { EmailTemplateRenderer } from './email-template.renderer';

describe('Email Templates & Sanitization', () => {
  describe('template-sanitizer', () => {
    it('should safely escape HTML special characters to prevent XSS', () => {
      const malicious = '<script>alert("xss & evil")</script>\'';
      const escaped = escapeHtml(malicious);
      expect(escaped).toBe('&lt;script&gt;alert(&quot;xss &amp; evil&quot;)&lt;/script&gt;&#039;');
      expect(escaped).not.toContain('<');
      expect(escaped).not.toContain('>');
      expect(escaped).not.toContain('"');
      expect(escaped).not.toContain('& ');
    });

    it('should return empty string for null or undefined input', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should sanitize sender display names and prevent header injection (CRLF attack)', () => {
      const rawHeaderInjection = 'School Bursar\r\nBcc: evil@hacker.com\nCc: fraud@target.com';
      const sanitized = sanitizeSenderDisplayName(rawHeaderInjection);
      expect(sanitized).not.toContain('\r');
      expect(sanitized).not.toContain('\n');
      expect(sanitized).toBe('School Bursar  Bcc: evil@hacker.com Cc: fraud@target.com');
    });

    it('should clamp sender display names to 100 characters', () => {
      const longName = 'A'.repeat(150);
      const sanitized = sanitizeSenderDisplayName(longName);
      expect(sanitized.length).toBe(100);
    });

    it('should fall back to safe default if sender display name is empty', () => {
      expect(sanitizeSenderDisplayName('')).toBe('School Fee System');
      expect(sanitizeSenderDisplayName(null)).toBe('School Fee System');
    });

    it('should format amounts properly', () => {
      expect(formatAmount(1250, 'INR')).toBe('INR 1250.00');
      expect(formatAmount('450.5', 'INR')).toBe('INR 450.50');
      expect(formatAmount('invalid', 'INR')).toBe('0.00');
    });

    it('should validate email addresses accurately', () => {
      expect(validateEmailAddress('bursar@stjude.edu')).toBe(true);
      expect(validateEmailAddress('parent.user+fee@domain.co.in')).toBe(true);
      expect(validateEmailAddress('invalid-email')).toBe(false);
      expect(validateEmailAddress('@nodomain.com')).toBe(false);
      expect(validateEmailAddress('noat.com')).toBe(false);
      expect(validateEmailAddress(null)).toBe(false);
      expect(validateEmailAddress('')).toBe(false);
    });

    it('should sanitize plain text by removing harmful control characters', () => {
      const textWithControls = 'Hello\x00World\x07Alert\x1B[31mRed\x1B[0m';
      const sanitized = sanitizePlainText(textWithControls);
      expect(sanitized).not.toContain('\x00');
      expect(sanitized).not.toContain('\x07');
      expect(sanitized).not.toContain('\x1B');
      expect(sanitized).toContain('HelloWorldAlert[31mRed[0m');
    });

    it('should sanitize and clamp reason text for parent communications', () => {
      const longReason = 'Staff note: ' + 'A'.repeat(300);
      const sanitized = sanitizeReasonText(longReason, 50);
      expect(sanitized.length).toBe(53); // 50 chars + '...'
      expect(sanitized.endsWith('...')).toBe(true);
      expect(sanitizeReasonText(null)).toBe('Administrative adjustment');
    });

    it('should mask sensitive 8+ digit bank account numbers while preserving standard alphanumeric UTRs', () => {
      // Sensitive full bank account number
      expect(maskSensitiveReference('50100234567890')).toBe('••••••••7890');
      // Standard alphanumeric UTR transaction reference
      expect(maskSensitiveReference('UTR123456789')).toBe('UTR123456789');
      // Short / null references
      expect(maskSensitiveReference(null)).toBe('N/A');
      expect(maskSensitiveReference('CASH')).toBe('CASH');
    });
  });

  describe('renderReceiptIssuedEmail', () => {
    const validData = {
      schoolName: 'Greenwood High School',
      studentName: 'Aarav Patel',
      admissionNumber: 'ADM-2026-0042',
      receiptNumber: 'RCT-202627-00104',
      paymentNumber: 'PAY-202627-00104',
      paymentDate: '2026-10-16',
      paymentMethod: 'UPI',
      totalAmount: 15000,
      currency: 'INR',
      academicYear: '2026-2027',
      lineItems: [
        { feeHeadName: 'Tuition Fee (Q1)', amount: 12000 },
        { feeHeadName: 'Computer Lab Fee', amount: 3000 },
      ],
    };

    it('should render receipt email with complete HTML and plain text', () => {
      const rendered = renderReceiptIssuedEmail(validData);

      expect(rendered.subject).toBe('Fee Payment Receipt - RCT-202627-00104 | Greenwood High School');
      expect(rendered.html).toContain('Greenwood High School');
      expect(rendered.html).toContain('Aarav Patel');
      expect(rendered.html).toContain('RCT-202627-00104');
      expect(rendered.html).toContain('INR 15000.00');
      expect(rendered.html).toContain('Tuition Fee (Q1)');
      expect(rendered.html).toContain('Computer Lab Fee');

      expect(rendered.text).toContain('Receipt Number: RCT-202627-00104');
      expect(rendered.text).toContain('Total Paid: INR 15000.00');
      expect(rendered.text).toContain('Tuition Fee (Q1): INR 12000.00');
    });

    it('should escape malicious input in student name and school name', () => {
      const maliciousData = {
        ...validData,
        studentName: 'Aarav <img src=x onerror=alert(1)>',
        schoolName: 'School & Academy <script>',
      };
      const rendered = renderReceiptIssuedEmail(maliciousData);

      expect(rendered.html).not.toContain('<script>');
      expect(rendered.html).toContain('School &amp; Academy &lt;script&gt;');
      expect(rendered.html).not.toContain('<img src=x onerror=alert(1)>');
      expect(rendered.html).toContain('Aarav &lt;img src=x onerror=alert(1)&gt;');
    });

    it('should throw an error if required fields are missing', () => {
      expect(() => renderReceiptIssuedEmail({ ...validData, receiptNumber: '' })).toThrow(
        'Missing required field: receiptNumber',
      );
      expect(() => renderReceiptIssuedEmail({ ...validData, totalAmount: null as any })).toThrow(
        'Missing required field: totalAmount',
      );
    });
  });

  describe('renderPaymentReversedEmail', () => {
    const validData = {
      schoolName: 'Greenwood High School',
      studentName: 'Aarav Patel',
      admissionNumber: 'ADM-2026-0042',
      reversalNumber: 'REV-202627-00001',
      reversalType: 'BOUNCE',
      reversedAmount: 15000,
      currency: 'INR',
      originalPaymentNumber: 'PAY-202627-00104',
      originalReceiptNumber: 'RCT-202627-00104',
      reason: 'Cheque returned unpaid by drawee bank due to insufficient funds',
      reversalDate: '2026-10-16',
    };

    it('should render reversal email with correct type label and financial reference', () => {
      const rendered = renderPaymentReversedEmail(validData);

      expect(rendered.subject).toBe('Fee Payment Reversal Notice - REV-202627-00001 | Greenwood High School');
      expect(rendered.html).toContain('REV-202627-00001');
      expect(rendered.html).toContain('Payment Dishonor / Bounce');
      expect(rendered.html).toContain('INR 15000.00');
      expect(rendered.html).toContain(validData.reason);

      expect(rendered.text).toContain('Reversal Number: REV-202627-00001');
      expect(rendered.text).toContain('Reversed Amount: INR 15000.00');
    });

    it('should escape reason text containing special characters', () => {
      const rendered = renderPaymentReversedEmail({
        ...validData,
        reason: 'Bank says: "Account Closed" & <insufficient balance>',
      });
      expect(rendered.html).toContain('Bank says: &quot;Account Closed&quot; &amp; &lt;insufficient balance&gt;');
    });

    it('should throw if reversalNumber is missing', () => {
      expect(() => renderPaymentReversedEmail({ ...validData, reversalNumber: '' })).toThrow(
        'Missing required field: reversalNumber',
      );
    });
  });

  describe('renderRefundSucceededEmail', () => {
    const validData = {
      schoolName: 'Greenwood High School',
      studentName: 'Aarav Patel',
      admissionNumber: 'ADM-2026-0042',
      refundReference: 'REF-202627-00005',
      originalPaymentNumber: 'PAY-202627-00104',
      refundAmount: 5000,
      currency: 'INR',
      mode: 'BANK_TRANSFER',
      referenceNumber: 'UTR-9876543210',
      reason: 'Excess payment returned upon mid-year concession approval',
      refundDate: '2026-10-16',
    };

    it('should render refund succeeded email with bank reference and amount', () => {
      const rendered = renderRefundSucceededEmail(validData);

      expect(rendered.subject).toBe('Fee Refund Processed - REF-202627-00005 | Greenwood High School');
      expect(rendered.html).toContain('REF-202627-00005');
      expect(rendered.html).toContain('UTR-9876543210');
      expect(rendered.html).toContain('INR 5000.00');
      expect(rendered.html).toContain('BANK_TRANSFER');

      expect(rendered.text).toContain('Refund Voucher / ID: REF-202627-00005');
      expect(rendered.text).toContain('Refunded Amount: INR 5000.00');
    });

    it('should mask 12-digit account numbers if passed in reference field', () => {
      const rendered = renderRefundSucceededEmail({
        ...validData,
        referenceNumber: '123456789012',
      });
      expect(rendered.html).toContain('••••••••9012');
      expect(rendered.text).toContain('••••••••9012');
    });

    it('should throw if refundReference is missing', () => {
      expect(() => renderRefundSucceededEmail({ ...validData, refundReference: '' })).toThrow(
        'Missing required field: refundReference',
      );
    });
  });

  describe('renderRefundFailedEmail', () => {
    const validData = {
      schoolName: 'Greenwood High School',
      studentName: 'Aarav Patel',
      admissionNumber: 'ADM-2026-0042',
      refundReference: 'REF-202627-00005',
      originalPaymentNumber: 'PAY-202627-00104',
      refundAmount: 5000,
      currency: 'INR',
      failureReason: 'Beneficiary bank account number is invalid or closed',
      attemptedDate: '2026-10-16',
    };

    it('should render refund failed advisory email with failure reason', () => {
      const rendered = renderRefundFailedEmail(validData);

      expect(rendered.subject).toBe('Fee Refund Processing Issue - REF-202627-00005 | Greenwood High School');
      expect(rendered.html).toContain('REF-202627-00005');
      expect(rendered.html).toContain('Beneficiary bank account number is invalid or closed');
      expect(rendered.html).toContain('INR 5000.00');

      expect(rendered.text).toContain('Refund Voucher / ID: REF-202627-00005');
      expect(rendered.text).toContain('Issue Description: Beneficiary bank account number is invalid or closed');
    });

    it('should throw if failureReason is missing or refundAmount missing', () => {
      expect(() => renderRefundFailedEmail({ ...validData, refundAmount: null as any })).toThrow(
        'Missing required field: refundAmount',
      );
    });
  });

  describe('EmailTemplateRenderer service', () => {
    let renderer: EmailTemplateRenderer;

    beforeEach(() => {
      renderer = new EmailTemplateRenderer();
    });

    it('should render RECEIPT_ISSUED via template dispatcher', () => {
      const rendered = renderer.render(NotificationEventType.RECEIPT_ISSUED, {
        schoolName: 'Delhi Public School',
        studentName: 'Rohan Sharma',
        admissionNumber: 'DPS-101',
        receiptNumber: 'RCT-001',
        paymentNumber: 'PAY-001',
        paymentDate: '2026-10-16',
        paymentMethod: 'CASH',
        totalAmount: 10000,
      });
      expect(rendered.subject).toContain('RCT-001');
    });

    it('should render PAYMENT_REVERSED via template dispatcher', () => {
      const rendered = renderer.render(NotificationEventType.PAYMENT_REVERSED, {
        schoolName: 'Delhi Public School',
        studentName: 'Rohan Sharma',
        admissionNumber: 'DPS-101',
        reversalNumber: 'REV-001',
        reversalType: 'VOID',
        reversedAmount: 10000,
        originalPaymentNumber: 'PAY-001',
        reason: 'Duplicate entry cancelled',
        reversalDate: '2026-10-16',
      });
      expect(rendered.subject).toContain('REV-001');
    });

    it('should throw for unrecognized template key', () => {
      expect(() => renderer.render('UNRECOGNIZED_EVENT' as any, {})).toThrow(
        'Unsupported or unrecognized template key',
      );
    });

    it('should throw if template data is null', () => {
      expect(() => renderer.render(NotificationEventType.RECEIPT_ISSUED, null)).toThrow(
        'Template data must be a valid non-null object',
      );
    });
  });
});
