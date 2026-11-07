export interface ReceiptSnapshot {
  receiptNumber: string;
  sequenceNumber: number;
  paymentNumber: string;
  paymentDate: Date | string;
  amount: number;
  paymentMethod: string;
  referenceNumber: string | null;
  chequeNumber: string | null;
  chequeDate: Date | string | null;
  bankName: string | null;
  notes: string | null;
  chequeDisclaimer: string | null;
  school: {
    id: string;
    code: string;
    name: string;
    currency: string;
    timezone: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  };
  student: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    grade?: string | null;
    section?: string | null;
  };
  academicYear: {
    id: string;
    name: string;
  };
  allocations: Array<{
    id: string;
    invoiceId: string;
    invoiceItemId?: string | null;
    assessedFineId?: string | null;
    allocationType: string;
    allocatedAmount: number;
    feeHeadNameSnapshot?: string;
    period?: string | null;
  }>;
  collector?: {
    id: string;
    name: string;
    role: string;
  } | null;
  issuedAt: string;
}

export function createSyntheticReceiptSnapshot(
  schoolContext?: {
    id: string;
    code: string;
    name: string;
    currency?: string;
    timezone?: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  },
  collectorContext?: {
    id: string;
    name: string;
    role: string;
  },
): ReceiptSnapshot {
  const currency = schoolContext?.currency || 'INR';
  const schoolName = schoolContext?.name || 'Sample Educational Academy';
  const schoolCode = schoolContext?.code || 'SCH_SAMPLE';

  return {
    receiptNumber: 'RCT-202627-SAMPLE',
    sequenceNumber: 1,
    paymentNumber: 'PAY-202627-SAMPLE',
    paymentDate: new Date('2026-10-22T10:30:00.000Z'),
    amount: 8000.00,
    paymentMethod: 'UPI',
    referenceNumber: 'SAMPLE-UPI-REF-998877',
    chequeNumber: null,
    chequeDate: null,
    bankName: 'Sample Commercial Bank',
    notes: 'Quarter 3 Fee Installment',
    chequeDisclaimer: null,
    school: {
      id: schoolContext?.id || 'sample-school-id',
      code: schoolCode,
      name: schoolName,
      currency,
      timezone: schoolContext?.timezone || 'Asia/Kolkata',
      address: schoolContext?.address || '123 Education Boulevard',
      city: schoolContext?.city || 'Bengaluru',
      state: schoolContext?.state || 'Karnataka',
    },
    student: {
      id: 'sample-student-uuid',
      admissionNumber: 'ADM-2026-SAMPLE',
      firstName: 'Aarav',
      lastName: 'Sharma',
      fullName: 'Aarav Sharma',
      grade: 'Grade 10',
      section: 'Section A',
    },
    academicYear: {
      id: 'sample-academic-year-uuid',
      name: '2026-2027',
    },
    allocations: [
      {
        id: 'sample-alloc-1',
        invoiceId: 'sample-inv-1',
        invoiceItemId: 'sample-item-1',
        assessedFineId: null,
        allocationType: 'PRINCIPAL',
        allocatedAmount: 6000.00,
        feeHeadNameSnapshot: 'Tuition Fee (Q3)',
      },
      {
        id: 'sample-alloc-2',
        invoiceId: 'sample-inv-1',
        invoiceItemId: 'sample-item-2',
        assessedFineId: null,
        allocationType: 'PRINCIPAL',
        allocatedAmount: 1500.00,
        feeHeadNameSnapshot: 'Laboratory & Computer Fee',
      },
      {
        id: 'sample-alloc-3',
        invoiceId: 'sample-inv-1',
        invoiceItemId: null,
        assessedFineId: 'sample-fine-1',
        allocationType: 'FINE',
        allocatedAmount: 500.00,
        feeHeadNameSnapshot: 'Late Payment Fine',
      },
    ],
    collector: {
      id: collectorContext?.id || 'sample-collector-id',
      name: collectorContext?.name || 'Administrator',
      role: collectorContext?.role || 'SCHOOL_ADMIN',
    },
    issuedAt: new Date('2026-10-22T10:30:00.000Z').toISOString(),
  };
}
