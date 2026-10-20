export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  htmlBody?: string;
  textBody?: string;
}

export interface ReceiptLineItemSnapshot {
  feeHeadName: string;
  amount: number | string;
}

export interface ReceiptIssuedTemplateData {
  schoolName: string;
  studentName: string;
  admissionNumber: string;
  receiptNumber: string;
  paymentNumber: string;
  paymentDate: string;
  paymentMethod: string;
  totalAmount: number | string;
  currency?: string;
  lineItems?: ReceiptLineItemSnapshot[];
  academicYear?: string;
}

export interface PaymentReversedTemplateData {
  schoolName: string;
  studentName: string;
  admissionNumber: string;
  reversalNumber: string;
  reversalType: string; // 'VOID' | 'BOUNCE' | 'CORRECTION'
  reversedAmount: number | string;
  currency?: string;
  originalPaymentNumber: string;
  originalReceiptNumber?: string;
  reason: string;
  reversalDate: string;
}

export interface RefundSucceededTemplateData {
  schoolName: string;
  studentName: string;
  admissionNumber: string;
  refundReference: string;
  originalPaymentNumber: string;
  refundAmount: number | string;
  currency?: string;
  mode?: string;
  referenceNumber?: string;
  reason: string;
  refundDate: string;
}

export interface RefundFailedTemplateData {
  schoolName: string;
  studentName: string;
  admissionNumber: string;
  refundReference: string;
  originalPaymentNumber: string;
  refundAmount: number | string;
  currency?: string;
  failureReason: string;
  attemptedDate: string;
}

export interface PaymentPendingTemplateData {
  schoolName: string;
  studentName: string;
  admissionNumber: string;
  paymentNumber: string;
  paymentAmount: number | string;
  currency?: string;
  paymentMethod: string;
  initiatedAt: string;
  verificationNotes?: string;
}

export interface PaymentFailedTemplateData {
  schoolName: string;
  studentName: string;
  admissionNumber: string;
  paymentNumber: string;
  attemptedAmount: number | string;
  currency?: string;
  paymentMethod: string;
  failureReason: string;
  attemptedAt: string;
}

export type FeeReminderMilestone =
  | 'DUE_IN_7_DAYS'
  | 'DUE_IN_1_DAY'
  | 'DUE_TODAY'
  | 'OVERDUE';

export interface FeeReminderLineItem {
  feeHeadName: string;
  amount: number | string;
}

export interface FeeReminderTemplateData {
  schoolName: string;
  studentName: string;
  admissionNumber: string;
  gradeName?: string;
  sectionName?: string;
  academicYearName?: string;
  billingMonthName?: string;
  milestone: FeeReminderMilestone;
  dueDate: string;
  totalFeeAmount: number | string;
  paidAmount?: number | string;
  balanceDue: number | string;
  currency?: string;
  lineItems?: FeeReminderLineItem[];
  daysOverdue?: number;
}
