export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
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
