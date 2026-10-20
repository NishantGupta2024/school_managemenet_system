import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PaymentsView, {
  getPendingPaymentOperation,
  classifyRecoveryRecord,
  savePendingPaymentOperation,
  clearPendingPaymentOperation,
  isAmbiguousPaymentError,
  evaluateRefundLookup,
} from '../components/PaymentsView';
import { paymentsApi, feeStatementApi, metaApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

// Mock AuthContext
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock API service
vi.mock('../services/api', () => ({
  UserRole: {
    PLATFORM_SUPER_ADMIN: 'PLATFORM_SUPER_ADMIN',
    SCHOOL_ADMIN: 'SCHOOL_ADMIN',
    FEE_STAFF: 'FEE_STAFF',
    STUDENT: 'STUDENT',
    PARENT: 'PARENT',
  },
  metaApi: {
    getAccessibleStudents: vi.fn(),
    getAcademicYears: vi.fn(),
  },
  feeStatementApi: {
    getStatement: vi.fn(),
  },
  paymentsApi: {
    collect: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    getReceiptByNumber: vi.fn(),
    reverse: vi.fn(),
    refund: vi.fn(),
    getRefunds: vi.fn(),
    lookupIdempotency: vi.fn(),
  },
}));

describe('PaymentsView Component', () => {
  const mockStudents = [
    {
      id: 'student-1',
      admissionNumber: 'ADM-101',
      firstName: 'Aarav',
      lastName: 'Sharma',
      grade: { id: 'g-10', name: 'Grade 10' },
      section: { id: 'sec-a', name: 'A' },
    },
    {
      id: 'student-2',
      admissionNumber: 'ADM-102',
      firstName: 'Diya',
      lastName: 'Patel',
      grade: { id: 'g-9', name: 'Grade 9' },
      section: { id: 'sec-b', name: 'B' },
    },
  ];

  const mockAcademicYears = [
    { id: 'ay-2026', name: '2026-2027', isCurrent: true },
    { id: 'ay-2025', name: '2025-2026', isCurrent: false },
  ];

  const mockStatement = {
    student: {
      id: 'student-1',
      admissionNumber: 'ADM-101',
      firstName: 'Aarav',
      lastName: 'Sharma',
      fullName: 'Aarav Sharma',
      grade: 'Grade 10',
      section: 'A',
      status: 'ACTIVE',
    },
    academicYear: { id: 'ay-2026', name: '2026-2027' },
    allocation: {
      feeStructureName: 'Grade 10 Annual Fee',
      concessionType: 'NONE',
      concessionValue: 0,
    },
    summary: {
      totalGrossAmount: 60000,
      totalDiscountAmount: 0,
      totalNetAmount: 60000,
      totalPaidAmount: 15000,
      totalRemainingAmount: 45000,
      invoiceCount: 12,
      statusBreakdown: {
        UPCOMING: 8,
        DUE: 1,
        OVERDUE: 0,
        PAID: 3,
        PARTIALLY_PAID: 0,
        VOID: 0,
      },
    },
    invoices: [
      {
        id: 'inv-1',
        monthName: 'April 2026',
        dueDate: '2026-04-10',
        grossAmount: 5000,
        discountAmount: 0,
        netAmount: 5000,
        paidAmount: 5000,
        remainingBalance: 0,
        status: 'PAID',
        items: [],
      },
      {
        id: 'inv-4',
        monthName: 'July 2026',
        dueDate: '2026-07-10',
        grossAmount: 5000,
        discountAmount: 0,
        netAmount: 5000,
        paidAmount: 0,
        remainingBalance: 5000,
        status: 'DUE',
        items: [],
      },
    ],
  };

  const mockPaymentsList = {
    data: [
      {
        id: 'pay-1',
        paymentNumber: 'PAY-2026-0001',
        paymentDate: '2026-05-10T10:00:00.000Z',
        amount: 5000,
        paymentMethod: 'CASH',
        referenceNumber: 'CASH-REF-01',
        status: 'COMPLETED',
        student: {
          id: 'student-1',
          admissionNumber: 'ADM-101',
          firstName: 'Aarav',
          lastName: 'Sharma',
        },
        receipt: {
          id: 'rec-1',
          receiptNumber: 'REC-2026-0001',
          totalAmount: 5000,
          status: 'ACTIVE',
          receiptSnapshot: {
            receiptNumber: 'REC-2026-0001',
            sequenceNumber: 1,
            paymentNumber: 'PAY-2026-0001',
            paymentDate: '2026-05-10T10:00:00.000Z',
            amount: 5000,
            paymentMethod: 'CASH',
            school: { name: 'Greenwood Academy' },
            student: {
              admissionNumber: 'ADM-101',
              fullName: 'Aarav Sharma',
              grade: 'Grade 10',
              section: 'A',
            },
            academicYear: { name: '2026-2027' },
            allocations: [
              {
                id: 'alloc-1',
                feeHeadNameSnapshot: 'Tuition Fee (April)',
                allocationType: 'PRINCIPAL',
                allocatedAmount: 5000,
              },
            ],
            collector: { name: 'Admin Cashier' },
          },
        },
      },
    ],
    meta: { page: 1, limit: 15, total: 1, totalPages: 1 },
  };

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: {
        id: 'u-admin',
        name: 'School Admin',
        role: 'SCHOOL_ADMIN',
        schoolId: 'sch-001',
      },
    });

    (metaApi.getAccessibleStudents as any).mockResolvedValue(mockStudents);
    (metaApi.getAcademicYears as any).mockResolvedValue(mockAcademicYears);
    (feeStatementApi.getStatement as any).mockResolvedValue(mockStatement);
    (paymentsApi.list as any).mockResolvedValue(mockPaymentsList);
  });

  it('renders cashier collection view for staff roles', async () => {
    render(<PaymentsView />);

    expect(await screen.findByText(/Fee Payments & Official Receipts/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Collect Payment/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /Payment History & Receipts/i })).toBeInTheDocument();
    expect(screen.getByText(/Counter Fee Collection/i)).toBeInTheDocument();
  });

  it('populates students and academic years dropdowns and renders live obligation preview', async () => {
    render(<PaymentsView />);

    await waitFor(() => {
      expect(metaApi.getAccessibleStudents).toHaveBeenCalled();
      expect(metaApi.getAcademicYears).toHaveBeenCalled();
      expect(feeStatementApi.getStatement).toHaveBeenCalledWith('student-1', 'ay-2026');
    });

    expect(await screen.findByText(/Live Student Obligation Preview/i)).toBeInTheDocument();
    expect(screen.getByText(/Remaining Dues/i)).toBeInTheDocument();
    // 45,000 remaining dues
    expect(screen.getAllByText(/45,000/).length).toBeGreaterThanOrEqual(1);
  });

  it('submits payment collection with idempotency protection', async () => {
    (paymentsApi.collect as any).mockResolvedValue({
      payment: mockPaymentsList.data[0],
      receipt: mockPaymentsList.data[0].receipt,
      allocations: [],
      isIdempotentReplay: false,
    });

    render(<PaymentsView />);

    await screen.findByText(/Counter Fee Collection/i);
    await screen.findByText(/Invoice Schedule/i);

    // Enter payment amount
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '5000' } });

    // Submit payment
    const collectBtn = screen.getByRole('button', { name: /Collect ₹5,000.00/i });
    expect(collectBtn).not.toBeDisabled();
    fireEvent.click(collectBtn);

    await waitFor(() => {
      expect(paymentsApi.collect).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 'student-1',
          academicYearId: 'ay-2026',
          amount: 5000,
          paymentMethod: 'CASH',
        }),
        expect.any(String), // idempotency key header
      );
    });

    // Expect success modal
    expect(await screen.findByText(/Payment Collected Successfully/i)).toBeInTheDocument();
    expect(screen.getByText(/REC-2026-0001/i)).toBeInTheDocument();
  });

  it('switches to Payment History tab and renders transactions', async () => {
    render(<PaymentsView />);

    const historyTabBtn = await screen.findByRole('button', { name: /Payment History & Receipts/i });
    fireEvent.click(historyTabBtn);

    await waitFor(() => {
      expect(paymentsApi.list).toHaveBeenCalled();
    });

    expect(await screen.findByText('REC-2026-0001')).toBeInTheDocument();
    expect(screen.getAllByText(/Completed/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/CASH-REF-01/)).toBeInTheDocument();
  });

  it('opens receipt modal when Receipt button is clicked', async () => {
    render(<PaymentsView />);

    const historyTabBtn = await screen.findByRole('button', { name: /Payment History & Receipts/i });
    fireEvent.click(historyTabBtn);

    const receiptBtn = await screen.findByRole('button', { name: /^Receipt$/i });
    fireEvent.click(receiptBtn);

    expect(await screen.findByText(/Official Fee Receipt/i)).toBeInTheDocument();
    expect(screen.getByText(/Greenwood Academy/i)).toBeInTheDocument();
    expect(screen.getByText(/RECEIPT #: REC-2026-0001/i)).toBeInTheDocument();
    expect(screen.getByText(/Tuition Fee \(April\)/i)).toBeInTheDocument();
  });

  it('enforces 10-character reason validation when reversing a payment', async () => {
    render(<PaymentsView />);

    const historyTabBtn = await screen.findByRole('button', { name: /Payment History & Receipts/i });
    fireEvent.click(historyTabBtn);

    const reverseBtn = await screen.findByRole('button', { name: /Reverse/i });
    fireEvent.click(reverseBtn);

    expect(await screen.findByText(/Reverse Fee Payment/i)).toBeInTheDocument();
    expect(screen.getByText(/Irreversible Action Warning/i)).toBeInTheDocument();

    const reasonInput = screen.getByPlaceholderText(/Provide detailed compliance audit justification/i);
    const confirmBtn = screen.getByRole('button', { name: /Confirm Reversal/i });

    // Initially disabled because reason < 10 characters
    expect(confirmBtn).toBeDisabled();

    // Type 5 characters
    fireEvent.change(reasonInput, { target: { value: 'Short' } });
    expect(confirmBtn).toBeDisabled();

    // Type valid reason >= 10 characters
    fireEvent.change(reasonInput, { target: { value: 'Entered incorrect student account by clerical mistake' } });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('hides cashier collection tab and reversal/refund buttons for student and parent roles', async () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'u-stud',
        name: 'Aarav Sharma',
        role: 'STUDENT',
        schoolId: 'sch-001',
      },
    });

    render(<PaymentsView />);

    // Cashier tab is not rendered
    expect(screen.queryByRole('button', { name: /Collect Payment/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Counter Fee Collection/i)).not.toBeInTheDocument();

    // History is loaded by default
    await waitFor(() => {
      expect(paymentsApi.list).toHaveBeenCalled();
    });

    // Reversal and Refund action buttons must NOT be rendered for student
    expect(screen.queryByRole('button', { name: /Reverse/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Refund/i })).not.toBeInTheDocument();
  });

  it('Finding 1 (F-03): clears selectedStudentId, form fields, and statement when search term excludes current student, requiring explicit selection', async () => {
    const mockStatementStudent2 = {
      ...mockStatement,
      student: {
        ...mockStatement.student,
        id: 'student-2',
        admissionNumber: 'ADM-102',
        firstName: 'Diya',
        lastName: 'Patel',
        fullName: 'Diya Patel',
      },
    };

    (feeStatementApi.getStatement as any).mockImplementation((studentId: string) => {
      if (studentId === 'student-2') return Promise.resolve(mockStatementStudent2);
      return Promise.resolve(mockStatement);
    });

    (paymentsApi.collect as any).mockResolvedValue({
      payment: mockPaymentsList.data[0],
      receipt: mockPaymentsList.data[0].receipt,
      allocations: [],
      isIdempotentReplay: false,
    });

    render(<PaymentsView />);

    await screen.findByText(/Invoice Schedule/i);

    const studentSelect = screen.getByLabelText(/Select Student/i) as HTMLSelectElement;
    expect(studentSelect.value).toBe('student-1');

    // Populate payment form fields for student-1
    const amountInput = screen.getByPlaceholderText('0.00') as HTMLInputElement;
    const notesInput = screen.getByPlaceholderText(/Optional internal remarks for fee counter records/i) as HTMLTextAreaElement;
    fireEvent.change(amountInput, { target: { value: '1500' } });
    fireEvent.change(notesInput, { target: { value: 'First student note' } });
    expect(amountInput.value).toBe('1500');
    expect(notesInput.value).toBe('First student note');

    // Type search term matching only student-2 (Diya) -> excludes student-1
    const searchInput = screen.getByPlaceholderText(/Quick search by name/i);
    fireEvent.change(searchInput, { target: { value: 'Diya' } });

    // Selection MUST be cleared to '' (never silently switched to student-2), and form values + statement cleared
    await waitFor(() => {
      expect(studentSelect.value).toBe('');
    });
    expect(amountInput.value).toBe('');
    expect(notesInput.value).toBe('');
    expect(screen.getByText(/Select a student above to inspect fee obligations/i)).toBeInTheDocument();

    // Collection button must be disabled until a student is explicitly selected
    const disabledCollectBtns = screen.getAllByRole('button', { name: /Collect Payment/i });
    const submitBtn = disabledCollectBtns.find((btn) => btn.getAttribute('type') === 'submit');
    expect(submitBtn).toBeDisabled();

    // Explicitly select student-2 (Diya)
    fireEvent.change(studentSelect, { target: { value: 'student-2' } });
    await screen.findByText(/Diya Patel/i);

    fireEvent.change(amountInput, { target: { value: '1000' } });
    const collectBtn = screen.getByRole('button', { name: /Collect ₹1,000.00/i });
    expect(collectBtn).not.toBeDisabled();
    fireEvent.click(collectBtn);

    await waitFor(() => {
      expect(paymentsApi.collect).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 'student-2',
          amount: 1000,
        }),
        expect.any(String),
      );
    });
  });

  it('Finding 1: blocks payment submission while statement is loading or when statement fetch fails', async () => {
    let resolveStatement: (val: any) => void;
    (feeStatementApi.getStatement as any).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStatement = resolve;
        }),
    );

    render(<PaymentsView />);

    await screen.findByText(/Counter Fee Collection/i);
    expect(await screen.findByText(/Loading statement/i)).toBeInTheDocument();

    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '2000' } });

    // While loading, submit button is disabled
    const loadingBtn = screen.getByRole('button', { name: /Collect ₹2,000.00/i });
    expect(loadingBtn).toBeDisabled();

    // Now test statement failure
    (feeStatementApi.getStatement as any).mockRejectedValueOnce({
      response: { data: { message: 'Statement service unavailable' } },
    });
    resolveStatement!(mockStatement);

    await screen.findByText(/Invoice Schedule/i);

    // Switch student to trigger failing statement fetch
    const studentSelect = screen.getByLabelText(/Select Student/i);
    fireEvent.change(studentSelect, { target: { value: 'student-2' } });

    expect(await screen.findByText(/Unable to verify student obligation/i)).toBeInTheDocument();
    expect(screen.getByText(/Statement service unavailable/i)).toBeInTheDocument();

    fireEvent.change(amountInput, { target: { value: '2000' } });
    const collectBtnAfterFail = screen.getByRole('button', { name: /Collect ₹2,000.00/i });
    expect(collectBtnAfterFail).toBeDisabled();
    expect(paymentsApi.collect).not.toHaveBeenCalled();
  });

  it('F-04: reversal modal only offers VOID and BOUNCE, not unsupported CORRECTION', async () => {
    render(<PaymentsView />);

    const historyTabBtn = await screen.findByRole('button', { name: /Payment History & Receipts/i });
    fireEvent.click(historyTabBtn);

    const reverseBtn = await screen.findByRole('button', { name: /Reverse/i });
    fireEvent.click(reverseBtn);

    expect(await screen.findByText(/Reverse Fee Payment/i)).toBeInTheDocument();

    const reversalSelect = screen.getByLabelText(/Reversal Type/i) as HTMLSelectElement;
    const optionValues = Array.from(reversalSelect.options).map((opt) => opt.value);

    expect(optionValues).toContain('VOID');
    expect(optionValues).toContain('BOUNCE');
    expect(optionValues).not.toContain('CORRECTION');
  });

  it('Finding 2 (F-06): preserves idempotency key across retries and rerenders, regenerates on any collection field change, and offers Verify & Refresh Obligation on uncertain failure', async () => {
    let callCount = 0;
    const capturedKeys: string[] = [];

    (paymentsApi.collect as any).mockImplementation((_payload: any, idempotencyHeader: string) => {
      callCount++;
      capturedKeys.push(idempotencyHeader);
      if (callCount <= 2) {
        return Promise.reject(new Error('Network glitch on attempt'));
      }
      return Promise.resolve({
        payment: mockPaymentsList.data[0],
        receipt: mockPaymentsList.data[0].receipt,
        allocations: [],
        isIdempotentReplay: false,
      });
    });

    render(<PaymentsView />);

    await screen.findByText(/Invoice Schedule/i);

    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '2500' } });

    const collectBtn = screen.getByRole('button', { name: /Collect ₹2,500.00/i });

    // First attempt -> fails with network glitch
    fireEvent.click(collectBtn);

    await waitFor(() => {
      expect(callCount).toBe(1);
    });

    // Uncertain outcome banner and retry action appear; fields are locked
    expect(await screen.findByText(/Payment Outcome Uncertain — Form Locked for Safety/i)).toBeInTheDocument();
    expect(amountInput).toBeDisabled();

    // Retry without changing inputs -> must send identical idempotency key
    const retryBtn = screen.getByRole('button', { name: /Retry with Same Key/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(callCount).toBe(2);
    });

    expect(capturedKeys[0]).toBeDefined();
    expect(capturedKeys[1]).toBe(capturedKeys[0]);

    // Check outcome -> returns not found -> Discard is NOT offered; fields remain locked to prevent duplicate charge
    (paymentsApi.lookupIdempotency as any).mockResolvedValue({ found: false });
    const checkOutcomeBtn = screen.getByRole('button', { name: /Check Payment Outcome/i });
    fireEvent.click(checkOutcomeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Server confirmed: No.*payment was recorded/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /Discard Attempt/i })).not.toBeInTheDocument();
    expect(amountInput).toBeDisabled();

    // Retrying continues to use the original idempotency key
    fireEvent.click(screen.getByRole('button', { name: /Retry with Same Key/i }));
    await waitFor(() => {
      expect(callCount).toBe(3);
    });
    expect(capturedKeys[2]).toBe(capturedKeys[0]);
  });

  it('Finding 2: freezes fields during uncertainty, reuses key on retry, and rotates key only after explicit resolution', async () => {
    (paymentsApi.lookupIdempotency as any).mockResolvedValue({ found: false });

    const reversalKeys: string[] = [];
    (paymentsApi.reverse as any).mockImplementation((_id: string, payload: any) => {
      reversalKeys.push(payload.idempotencyKey);
      return Promise.reject(new Error('Gateway timeout during reversal'));
    });

    const refundKeys: string[] = [];
    (paymentsApi.refund as any).mockImplementation((_id: string, payload: any) => {
      refundKeys.push(payload.idempotencyKey);
      return Promise.reject(new Error('Gateway timeout during refund'));
    });

    render(<PaymentsView />);

    const historyTabBtn = await screen.findByRole('button', { name: /Payment History & Receipts/i });
    fireEvent.click(historyTabBtn);

    // 1. Test Reversal modal idempotency key lifecycle
    const reverseBtn = await screen.findByRole('button', { name: /Reverse/i });
    fireEvent.click(reverseBtn);

    const reversalReasonInput = await screen.findByPlaceholderText(/Provide detailed compliance audit justification/i);
    fireEvent.change(reversalReasonInput, { target: { value: 'Duplicate entry posted by cashier' } });

    const confirmReversalBtn = screen.getByRole('button', { name: /Confirm Reversal/i });
    fireEvent.click(confirmReversalBtn);
    await waitFor(() => expect(reversalKeys.length).toBe(1));

    // Verify fields are now locked during uncertainty
    expect(reversalReasonInput).toBeDisabled();
    expect(screen.getByLabelText(/Reversal Type/i)).toBeDisabled();

    // Retry sends the exact same key
    const retryReversalBtn = screen.getByRole('button', { name: /Retry with Same Key/i });
    fireEvent.click(retryReversalBtn);
    await waitFor(() => expect(reversalKeys.length).toBe(2));
    expect(reversalKeys[0]).toBeDefined();
    expect(reversalKeys[1]).toBe(reversalKeys[0]);

    // Explicit resolution via checkOutcome finding the reversal on backend
    (paymentsApi.lookupIdempotency as any).mockResolvedValueOnce({
      found: true,
      operationType: 'REVERSAL',
    });
    const checkOutcomeBtn = screen.getByRole('button', { name: /Check Reversal Outcome/i });
    fireEvent.click(checkOutcomeBtn);

    // Modal closes upon explicit resolution
    await waitFor(() => {
      expect(screen.queryByText(/Confirm Reversal/i)).not.toBeInTheDocument();
    });

    // Reopen reversal with new reason -> new key is generated
    const freshReverseBtn = await screen.findByRole('button', { name: /Reverse/i });
    fireEvent.click(freshReverseBtn);
    const newReversalReasonInput = await screen.findByPlaceholderText(/Provide detailed compliance audit justification/i);
    fireEvent.change(newReversalReasonInput, { target: { value: 'Different error posted by bank bounce' } });
    const newConfirmBtn = screen.getByRole('button', { name: /Confirm Reversal/i });
    fireEvent.click(newConfirmBtn);
    await waitFor(() => expect(reversalKeys.length).toBe(3));
    expect(reversalKeys[2]).not.toBe(reversalKeys[0]);

    // Explicit resolution for second reversal
    (paymentsApi.lookupIdempotency as any).mockResolvedValueOnce({
      found: true,
      operationType: 'REVERSAL',
    });
    const checkOutcomeBtn2 = screen.getByRole('button', { name: /Check Reversal Outcome/i });
    fireEvent.click(checkOutcomeBtn2);
    await waitFor(() => {
      expect(screen.queryByText(/Confirm Reversal/i)).not.toBeInTheDocument();
    });

    // 2. Test Refund modal idempotency key lifecycle
    const freshRefundBtn = await screen.findByRole('button', { name: /Refund/i });
    fireEvent.click(freshRefundBtn);

    const refundAmountInput = await screen.findByPlaceholderText('0.00');
    fireEvent.change(refundAmountInput, { target: { value: '1000' } });

    const refundReasonInput = await screen.findByPlaceholderText(/Provide audit justification for fee refund/i);
    fireEvent.change(refundReasonInput, { target: { value: 'Overpayment refund requested by parent' } });

    const confirmRefundBtn = screen.getByRole('button', { name: /Confirm Refund/i });
    expect(confirmRefundBtn).not.toBeDisabled();
    fireEvent.click(confirmRefundBtn);
    await waitFor(() => expect(refundKeys.length).toBe(1));

    // Verify fields are locked during uncertainty
    expect(refundAmountInput).toBeDisabled();
    expect(refundReasonInput).toBeDisabled();

    // Retry unchanged refund -> exact same key
    const retryRefundBtn = screen.getByRole('button', { name: /Retry with Same Key/i });
    fireEvent.click(retryRefundBtn);
    await waitFor(() => expect(refundKeys.length).toBe(2));
    expect(refundKeys[0]).toBeDefined();
    expect(refundKeys[1]).toBe(refundKeys[0]);

    // Explicit resolution via checkOutcome finding the refund on backend with SUCCEEDED status
    (paymentsApi.lookupIdempotency as any).mockResolvedValueOnce({
      found: true,
      operationType: 'REFUND',
      status: 'SUCCEEDED',
      refund: { paymentId: 'pay-1', refundAmount: 1000, status: 'SUCCEEDED' },
    });
    const checkRefundOutcomeBtn = screen.getByRole('button', { name: /Check Refund Outcome/i });
    fireEvent.click(checkRefundOutcomeBtn);
    await waitFor(() => {
      expect(screen.queryByText(/Issue Fee Refund/i)).not.toBeInTheDocument();
    });

    // Reopen refund with different amount -> new key
    const freshRefundBtn2 = await screen.findByRole('button', { name: /Refund/i });
    fireEvent.click(freshRefundBtn2);
    const newRefundAmountInput = await screen.findByPlaceholderText('0.00');
    fireEvent.change(newRefundAmountInput, { target: { value: '2000' } });
    const newRefundReasonInput = await screen.findByPlaceholderText(/Provide audit justification for fee refund/i);
    fireEvent.change(newRefundReasonInput, { target: { value: 'Different refund reason requested' } });
    const newConfirmRefundBtn = screen.getByRole('button', { name: /Confirm Refund/i });
    fireEvent.click(newConfirmRefundBtn);
    await waitFor(() => expect(refundKeys.length).toBe(3));
    expect(refundKeys[2]).not.toBe(refundKeys[0]);
  });

  it('Finding 3: displays Net Principal, Assessed Fines, Total Paid, and Remaining Dues in obligation preview', async () => {
    (feeStatementApi.getStatement as any).mockResolvedValue({
      ...mockStatement,
      summary: {
        ...mockStatement.summary,
        totalNetAmount: 60000,
        totalAssessedFineAmount: 750,
        totalGrossAssessedFineAmount: 1000,
        totalWaivedFineAmount: 250,
        totalPaidAmount: 15000,
        totalRemainingAmount: 45750,
      },
      invoices: [
        mockStatement.invoices[0],
        {
          ...mockStatement.invoices[1],
          assessedFineAmount: 750,
          remainingBalance: 5750,
        },
      ],
    });

    render(<PaymentsView />);

    await screen.findByText(/Invoice Schedule/i);

    expect(screen.getByText(/Net Principal/i)).toBeInTheDocument();
    expect(screen.getByText(/Assessed Fines/i)).toBeInTheDocument();
    expect(screen.getAllByText(/45,750.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/\+₹750.00 Assessed Fine/i)).toBeInTheDocument();
  });

  it('Finding 4: isolates receipt modal for printing by marking background containers print:hidden', async () => {
    render(<PaymentsView />);

    const historyTabBtn = await screen.findByRole('button', { name: /Payment History & Receipts/i });
    fireEvent.click(historyTabBtn);

    const historyContainer = await screen.findByTestId('history-tab-container');
    expect(historyContainer).not.toHaveAttribute('data-print-hide-when-receipt');
    expect(historyContainer.className).not.toContain('print:hidden');

    const receiptBtn = await screen.findByRole('button', { name: /^Receipt$/i });
    fireEvent.click(receiptBtn);

    const printableModal = await screen.findByTestId('printable-receipt-modal');
    expect(printableModal).toBeInTheDocument();
    expect(printableModal.className).toContain('print:static');

    // Background tab container is now hidden for print
    expect(historyContainer).toHaveAttribute('data-print-hide-when-receipt', 'true');
    expect(historyContainer.className).toContain('print:hidden');
  });

  it('F-07: handles payment history safely when meta is empty or student has no linked profile', async () => {
    (paymentsApi.list as any).mockResolvedValue({
      data: [],
      meta: {
        page: 1,
        limit: 15,
        total: 0,
        totalPages: 0,
      },
    });

    render(<PaymentsView />);

    const historyTabBtn = await screen.findByRole('button', { name: /Payment History & Receipts/i });
    fireEvent.click(historyTabBtn);

    await waitFor(() => {
      expect(paymentsApi.list).toHaveBeenCalled();
    });

    expect(await screen.findByText(/No payment transactions found/i)).toBeInTheDocument();
  });

  describe('Task 5 Regression Tests: Safe Payment Outcome Recovery (FEE-P0-003-FIX-4)', () => {
    beforeEach(() => {
      sessionStorage.clear();
      vi.clearAllMocks();
      (metaApi.getAccessibleStudents as any).mockResolvedValue(mockStudents);
      (metaApi.getAcademicYears as any).mockResolvedValue(mockAcademicYears);
      (feeStatementApi.getStatement as any).mockResolvedValue(mockStatement);
      (paymentsApi.list as any).mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 15, total: 0, totalPages: 0 },
      });
    });

    it('1 & 2: when collection response is lost after commit, checking original key finds the committed operation and shows receipt', async () => {
      let dispatchedKey = '';
      (paymentsApi.collect as any).mockImplementation((_payload: any, key: string) => {
        dispatchedKey = key;
        const err = new Error('Network timeout after backend commit');
        (err as any).code = 'ECONNABORTED';
        return Promise.reject(err);
      });

      render(<PaymentsView />);

      const amountInput = await screen.findByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '5000' } });

      const collectBtn = screen.getByRole('button', { name: /Collect ₹5,000.00/i });
      fireEvent.click(collectBtn);

      await waitFor(() => {
        expect(screen.getByText(/Payment Outcome Uncertain — Form Locked for Safety/i)).toBeInTheDocument();
      });

      // Inputs are locked
      expect(amountInput).toBeDisabled();
      expect(screen.getByLabelText(/Select Student/i)).toBeDisabled();

      // Mock lookupIdempotency returning the committed payment and receipt
      (paymentsApi.lookupIdempotency as any).mockResolvedValue({
        found: true,
        operationType: 'COLLECTION',
        status: 'COMPLETED',
        payment: { id: 'pay-committed-1', amount: 5000 },
        receipt: { id: 'rcpt-1', receiptNumber: 'RCT-2026-0099', totalAmount: 5000, receiptSnapshot: {} },
      });

      const checkOutcomeBtn = screen.getByRole('button', { name: /Check Payment Outcome/i });
      fireEvent.click(checkOutcomeBtn);

      await waitFor(() => {
        expect(paymentsApi.lookupIdempotency).toHaveBeenCalledWith(dispatchedKey);
      });

      // Shows confirmed success receipt and clears uncertainty lock
      await waitFor(() => {
        expect(screen.getByText(/RCT-2026-0099/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/Payment Outcome Uncertain/i)).not.toBeInTheDocument();
    });

    it('3 & 4: a not-found lookup keeps fields locked; retrying sends exact same key without creating duplicate attempt', async () => {
      const dispatchedKeys: string[] = [];
      (paymentsApi.collect as any).mockImplementation((_payload: any, key: string) => {
        dispatchedKeys.push(key);
        const err = new Error('Connection reset');
        (err as any).code = 'ECONNRESET';
        return Promise.reject(err);
      });

      (paymentsApi.lookupIdempotency as any).mockResolvedValue({
        found: false,
      });

      render(<PaymentsView />);

      const amountInput = await screen.findByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '4000' } });

      const collectBtn = screen.getByRole('button', { name: /Collect ₹4,000.00/i });
      fireEvent.click(collectBtn);

      await waitFor(() => expect(dispatchedKeys.length).toBe(1));
      expect(screen.getByText(/Payment Outcome Uncertain/i)).toBeInTheDocument();

      // Check outcome -> server reports not found
      const checkOutcomeBtn = screen.getByRole('button', { name: /Check Payment Outcome/i });
      fireEvent.click(checkOutcomeBtn);

      await waitFor(() => {
        expect(screen.getByText(/Server confirmed: No.*payment was recorded/i)).toBeInTheDocument();
      });

      // Fields remain locked; discard button is never offered
      expect(amountInput).toBeDisabled();
      expect(screen.queryByRole('button', { name: /Discard Attempt/i })).not.toBeInTheDocument();

      // Retry submission -> dispatches with the exact same key
      const retryBtn = screen.getByRole('button', { name: /Retry with Same Key/i });
      fireEvent.click(retryBtn);

      await waitFor(() => expect(dispatchedKeys.length).toBe(2));
      expect(dispatchedKeys[1]).toBe(dispatchedKeys[0]);
    });

    it('5: fields affecting request fingerprint remain strictly locked during uncertainty', async () => {
      (paymentsApi.collect as any).mockRejectedValue(new Error('Network error'));

      render(<PaymentsView />);

      const amountInput = await screen.findByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '3500' } });

      const collectBtn = screen.getByRole('button', { name: /Collect ₹3,500.00/i });
      fireEvent.click(collectBtn);

      await waitFor(() => {
        expect(screen.getByText(/Payment Outcome Uncertain/i)).toBeInTheDocument();
      });

      // Assert all fingerprint fields are disabled
      expect(screen.getByLabelText(/Select Student/i)).toBeDisabled();
      expect(screen.getByPlaceholderText(/Quick search/i)).toBeDisabled();
      expect(screen.getByLabelText(/Academic Session/i)).toBeDisabled();
      expect(screen.getByPlaceholderText('0.00')).toBeDisabled();
      expect(screen.getByLabelText(/Payment Method/i)).toBeDisabled();
      expect(screen.getByPlaceholderText(/e.g. UTR/i)).toBeDisabled();
      expect(screen.getByPlaceholderText(/e.g. State Bank/i)).toBeDisabled();
      expect(screen.getByPlaceholderText(/Optional internal remarks/i)).toBeDisabled();
    });

    it('6: pending operation context survives simulated page reload via sessionStorage', async () => {
      const storedKey = 'uuid-pending-restore-test';
      sessionStorage.setItem(
        'fee_pending_payment_op',
        JSON.stringify({
          operationType: 'COLLECTION',
          idempotencyKey: storedKey,
          fingerprint: 'test-fingerprint',
          createdAt: Date.now(),
          context: {
            studentId: 'student-2',
            academicYearId: 'ay-2026',
            amount: 7500,
            paymentMethod: 'UPI',
            referenceNumber: 'UPI-RELOAD-123',
          },
        }),
      );

      (paymentsApi.lookupIdempotency as any).mockResolvedValue({
        found: false,
      });

      render(<PaymentsView />);

      // Restores locked banner and warning
      await waitFor(() => {
        expect(screen.getByText(/Restored an unresolved payment collection attempt/i)).toBeInTheDocument();
      });

      // Inputs restored with stored context and locked
      const amountInput = screen.getByPlaceholderText('0.00') as HTMLInputElement;
      expect(amountInput.value).toBe('7500');
      expect(amountInput).toBeDisabled();

      // Verified with server
      expect(paymentsApi.lookupIdempotency).toHaveBeenCalledWith(storedKey);
    });

    it('8: reversal timeout recovery locks modal and allows safe retry with identical key', async () => {
      const reversalKeys: string[] = [];
      (paymentsApi.list as any).mockResolvedValue({
        data: [
          {
            id: 'pay-rev-test-1',
            paymentNumber: 'PAY-2026-0001',
            amount: 5000,
            status: 'COMPLETED',
            paymentDate: '2026-04-15',
            paymentMethod: 'CASH',
            student: mockStudents[0],
            academicYear: mockAcademicYears[0],
          },
        ],
        meta: { page: 1, limit: 15, total: 1, totalPages: 1 },
      });

      (paymentsApi.reverse as any).mockImplementation((_id: string, payload: any) => {
        reversalKeys.push(payload.idempotencyKey);
        const err = new Error('Reversal network timeout');
        (err as any).code = 'ECONNABORTED';
        return Promise.reject(err);
      });

      render(<PaymentsView />);

      const historyTabBtn = await screen.findByRole('button', { name: /Payment History & Receipts/i });
      fireEvent.click(historyTabBtn);

      const reverseBtn = await screen.findByRole('button', { name: /Reverse/i });
      fireEvent.click(reverseBtn);

      const reversalReasonInput = await screen.findByPlaceholderText(/Provide detailed compliance audit justification/i);
      fireEvent.change(reversalReasonInput, { target: { value: 'Entered incorrect cheque number by mistake' } });

      const confirmBtn = screen.getByRole('button', { name: /Confirm Reversal/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => expect(reversalKeys.length).toBe(1));
      expect(screen.getByText(/Reversal Outcome Uncertain — Fields Locked/i)).toBeInTheDocument();

      // Retry sends same key
      const retryBtn = screen.getByRole('button', { name: /Retry with Same Key/i });
      fireEvent.click(retryBtn);

      await waitFor(() => expect(reversalKeys.length).toBe(2));
      expect(reversalKeys[1]).toBe(reversalKeys[0]);
    });

    it('9: partial-refund verification accepts PARTIALLY_REFUNDED when specific refund record is confirmed', async () => {
      (paymentsApi.list as any).mockResolvedValue({
        data: [
          {
            id: 'pay-refund-test-1',
            paymentNumber: 'PAY-2026-0002',
            amount: 10000,
            status: 'COMPLETED',
            paymentDate: '2026-04-15',
            paymentMethod: 'BANK_TRANSFER',
            student: mockStudents[0],
            academicYear: mockAcademicYears[0],
          },
        ],
        meta: { page: 1, limit: 15, total: 1, totalPages: 1 },
      });

      let refundKey = '';
      (paymentsApi.refund as any).mockImplementation((_id: string, payload: any) => {
        refundKey = payload.idempotencyKey;
        const err = new Error('Timeout during partial refund');
        (err as any).code = 'ECONNABORTED';
        return Promise.reject(err);
      });

      render(<PaymentsView />);

      const historyTabBtn = await screen.findByRole('button', { name: /Payment History & Receipts/i });
      fireEvent.click(historyTabBtn);

      const refundBtn = await screen.findByRole('button', { name: /Refund/i });
      fireEvent.click(refundBtn);

      const refundAmountInput = await screen.findByPlaceholderText('0.00');
      fireEvent.change(refundAmountInput, { target: { value: '2500' } });

      const refundReasonInput = await screen.findByPlaceholderText(/Provide audit justification/i);
      fireEvent.change(refundReasonInput, { target: { value: 'Authorized fee concession partial refund' } });

      const confirmBtn = screen.getByRole('button', { name: /Confirm Refund/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText(/Refund Outcome Uncertain — Fields Locked/i)).toBeInTheDocument();
      });

      // Mock lookupIdempotency returning the confirmed partial refund
      (paymentsApi.lookupIdempotency as any).mockResolvedValue({
        found: true,
        operationType: 'REFUND',
        status: 'SUCCEEDED',
        refund: {
          id: 'ref-1',
          paymentId: 'pay-refund-test-1',
          refundAmount: 2500,
          status: 'SUCCEEDED',
        },
      });

      const checkRefundBtn = screen.getByRole('button', { name: /Check Refund Outcome/i });
      fireEvent.click(checkRefundBtn);

      await waitFor(() => {
        expect(paymentsApi.lookupIdempotency).toHaveBeenCalledWith(refundKey);
      });

      // Modal closes cleanly upon confirmation
      await waitFor(() => {
        expect(screen.queryByText(/Issue Fee Refund/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('FEE-P0-003-FIX-5 Regression Tests: Resolved Payment Uncertainty Audit Findings', () => {
    afterEach(() => {
      sessionStorage.clear();
      vi.clearAllMocks();
    });

    it('Finding 1 (HIGH): earlier partial refund with same amount does not falsely confirm a new timed-out refund when lookup returns found: false', async () => {
      // 1. Payment has an earlier partial refund of 2500 recorded under a different key
      (paymentsApi.list as any).mockResolvedValue({
        data: [
          {
            id: 'pay-multi-refund-1',
            paymentNumber: 'PAY-2026-MULTI',
            amount: 10000,
            status: 'PARTIALLY_REFUNDED',
            paymentDate: '2026-04-15',
            paymentMethod: 'BANK_TRANSFER',
            student: mockStudents[0],
            academicYear: mockAcademicYears[0],
          },
        ],
        meta: { page: 1, limit: 15, total: 1, totalPages: 1 },
      });

      // getRefunds returns the earlier refund record with same amount 2500 but old idempotencyKey
      (paymentsApi.getRefunds as any).mockResolvedValue([
        {
          id: 'ref-earlier-1',
          paymentId: 'pay-multi-refund-1',
          amount: 2500,
          status: 'SUCCEEDED',
          idempotencyKey: 'prior-refund-key-0001',
          createdAt: '2026-04-16T10:00:00Z',
        },
      ]);

      let dispatchedKey = '';
      (paymentsApi.refund as any).mockImplementation((_id: string, payload: any) => {
        dispatchedKey = payload.idempotencyKey;
        const err = new Error('Timeout during refund');
        (err as any).code = 'ECONNABORTED';
        return Promise.reject(err);
      });

      render(<PaymentsView />);

      const historyTabBtn = await screen.findByRole('button', { name: /Payment History & Receipts/i });
      fireEvent.click(historyTabBtn);

      const refundBtn = await screen.findByRole('button', { name: /Refund/i });
      fireEvent.click(refundBtn);

      const refundAmountInput = await screen.findByPlaceholderText('0.00');
      fireEvent.change(refundAmountInput, { target: { value: '2500' } });

      const refundReasonInput = await screen.findByPlaceholderText(/Provide audit justification/i);
      fireEvent.change(refundReasonInput, { target: { value: 'Second installment partial refund' } });

      const confirmBtn = screen.getByRole('button', { name: /Confirm Refund/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText(/Refund Outcome Uncertain — Fields Locked/i)).toBeInTheDocument();
      });

      // Idempotency lookup returns found: false for the new key
      (paymentsApi.lookupIdempotency as any).mockResolvedValue({
        found: false,
      });

      const checkRefundBtn = screen.getByRole('button', { name: /Check Refund Outcome/i });
      fireEvent.click(checkRefundBtn);

      await waitFor(() => {
        expect(paymentsApi.lookupIdempotency).toHaveBeenCalledWith(dispatchedKey);
      });

      // Crucial: The earlier refund of 2500 must NOT falsely confirm this operation!
      // Modal MUST remain open, fields MUST remain locked, and error message MUST show unresolved status
      expect(screen.getByText(/Issue Fee Refund/i)).toBeInTheDocument();
      expect(screen.getByText(/Refund Outcome Uncertain — Fields Locked/i)).toBeInTheDocument();
      expect(
        screen.getAllByText(/Server has no refund recorded with this key yet.*remains unresolved/i).length,
      ).toBeGreaterThan(0);
      expect(refundAmountInput).toBeDisabled();
      expect(refundReasonInput).toBeDisabled();
    });

    it('Finding 2 (MEDIUM): uncertain collection cannot be discarded or unlocked on found: false, and retry continues with original key', async () => {
      const dispatchedKeys: string[] = [];
      (paymentsApi.collect as any).mockImplementation((_payload: any, key: string) => {
        dispatchedKeys.push(key);
        const err = new Error('Gateway timeout');
        (err as any).code = 'ETIMEDOUT';
        return Promise.reject(err);
      });

      (paymentsApi.lookupIdempotency as any).mockResolvedValue({
        found: false,
      });

      render(<PaymentsView />);

      const amountInput = await screen.findByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '5500' } });

      const collectBtn = screen.getByRole('button', { name: /Collect ₹5,500.00/i });
      fireEvent.click(collectBtn);

      await waitFor(() => expect(dispatchedKeys.length).toBe(1));
      expect(screen.getByText(/Payment Outcome Uncertain — Form Locked for Safety/i)).toBeInTheDocument();

      // Check outcome -> returns found: false
      const checkOutcomeBtn = screen.getByRole('button', { name: /Check Payment Outcome/i });
      fireEvent.click(checkOutcomeBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Server confirmed: No.*payment was recorded/i),
        ).toBeInTheDocument();
      });

      // Operational notice is visible explaining why discard is disabled
      expect(screen.getByText(/Discarding uncertain payments is disabled/i)).toBeInTheDocument();

      // Form fields remain locked; no discard or cancel button is available
      expect(amountInput).toBeDisabled();
      expect(screen.queryByRole('button', { name: /Discard Attempt/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Cancel Attempt/i })).not.toBeInTheDocument();

      // Retry continues with the original key
      const retryBtn = screen.getByRole('button', { name: /Retry with Same Key/i });
      fireEvent.click(retryBtn);

      await waitFor(() => expect(dispatchedKeys.length).toBe(2));
      expect(dispatchedKeys[1]).toBe(dispatchedKeys[0]);
    });

    it('Finding 3 (MEDIUM): reload recovery restores pending refund from sessionStorage, shows persistent banner on History tab, disables other actions, and retries with same key', async () => {
      const storedPendingRefund = {
        operationType: 'REFUND',
        idempotencyKey: 'restored-refund-key-777',
        requestFingerprint: 'fp-refund-777',
        createdAt: Date.now() - 60000,
        context: {
          paymentId: 'pay-history-1',
          paymentNumber: 'PAY-2026-0001',
          refundAmount: 1800,
          refundReason: 'Concession refund pending confirmation',
          refundMode: 'BANK_TRANSFER',
        },
      };
      sessionStorage.setItem('fee_pending_payment_op', JSON.stringify(storedPendingRefund));

      // On initial mount, auto-query returns found: false
      (paymentsApi.lookupIdempotency as any).mockResolvedValue({
        found: false,
      });

      const refundCalls: any[] = [];
      (paymentsApi.refund as any).mockImplementation((paymentId: string, payload: any) => {
        refundCalls.push({ paymentId, payload });
        return Promise.resolve({ success: true });
      });

      render(<PaymentsView />);

      const historyTabBtn = await screen.findByRole('button', { name: /Payment History & Receipts/i });
      fireEvent.click(historyTabBtn);

      // Verify persistent banner on Payment History tab
      expect(await screen.findByText(/Pending Refund Awaiting Confirmation/i)).toBeInTheDocument();
      expect(screen.getByText(/PAY-2026-0001/i)).toBeInTheDocument();
      expect(screen.getByText(/₹1,800.00/i)).toBeInTheDocument();

      // Check Outcome action is available in the banner
      const checkOutcomeBtn = screen.getByRole('button', { name: /Check Outcome/i });
      expect(checkOutcomeBtn).toBeInTheDocument();

      // Retry with Same Key action in the banner
      const retryBtn = screen.getByRole('button', { name: /Retry with Same Key/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(refundCalls.length).toBe(1);
      });
      expect(refundCalls[0].paymentId).toBe('pay-history-1');
      expect(refundCalls[0].payload.idempotencyKey).toBe('restored-refund-key-777');
      expect(refundCalls[0].payload.amount).toBe(1800);

      // After successful retry, pending operation is cleared and banner disappears
      await waitFor(() => {
        expect(screen.queryByText(/Pending Refund Awaiting Confirmation/i)).not.toBeInTheDocument();
      });
    });

    it('Finding 3 (MEDIUM): reload recovery auto-clears banner and refreshes history when backend lookup confirms restored refund found: true', async () => {
      const storedPendingRefund = {
        operationType: 'REFUND',
        idempotencyKey: 'restored-refund-key-888',
        requestFingerprint: 'fp-refund-888',
        createdAt: Date.now() - 30000,
        context: {
          paymentId: 'pay-history-1',
          paymentNumber: 'PAY-2026-0001',
          refundAmount: 2000,
          refundReason: 'Restored refund',
          refundMode: 'BANK_TRANSFER',
        },
      };
      sessionStorage.setItem('fee_pending_payment_op', JSON.stringify(storedPendingRefund));

      // Auto-query on mount returns found: true
      (paymentsApi.lookupIdempotency as any).mockResolvedValue({
        found: true,
        operationType: 'REFUND',
        status: 'SUCCEEDED',
        refund: { paymentId: 'pay-history-1', refundAmount: 2000, status: 'SUCCEEDED' },
      });

      render(<PaymentsView />);

      const historyTabBtn = await screen.findByRole('button', { name: /Payment History & Receipts/i });
      fireEvent.click(historyTabBtn);

      // Auto-lookup was performed with restored key
      await waitFor(() => {
        expect(paymentsApi.lookupIdempotency).toHaveBeenCalledWith('restored-refund-key-888');
      });

      // Banner should NOT be displayed because it was confirmed
      await waitFor(() => {
        expect(screen.queryByText(/Pending Refund Awaiting Confirmation/i)).not.toBeInTheDocument();
      });
      expect(sessionStorage.getItem('fee_pending_payment_op')).toBeNull();
    });

    it('Finding 3 (MEDIUM): reload recovery restores pending reversal from sessionStorage, shows persistent banner on History tab, and retries with same key', async () => {
      const storedPendingReversal = {
        operationType: 'REVERSAL',
        idempotencyKey: 'restored-reversal-key-555',
        requestFingerprint: 'fp-reversal-555',
        createdAt: Date.now() - 45000,
        context: {
          paymentId: 'pay-history-1',
          paymentNumber: 'PAY-2026-0001',
          reversalType: 'VOID',
          reversalReason: 'Accidental double payment recorded by clerk',
        },
      };
      sessionStorage.setItem('fee_pending_payment_op', JSON.stringify(storedPendingReversal));

      (paymentsApi.lookupIdempotency as any).mockResolvedValue({
        found: false,
      });

      const reverseCalls: any[] = [];
      (paymentsApi.reverse as any).mockImplementation((paymentId: string, payload: any) => {
        reverseCalls.push({ paymentId, payload });
        return Promise.resolve({ success: true });
      });

      render(<PaymentsView />);

      const historyTabBtn = await screen.findByRole('button', { name: /Payment History & Receipts/i });
      fireEvent.click(historyTabBtn);

      // Verify persistent banner on Payment History tab
      expect(await screen.findByText(/Pending Reversal Awaiting Confirmation/i)).toBeInTheDocument();
      expect(screen.getByText(/PAY-2026-0001/i)).toBeInTheDocument();
      expect(screen.getByText('VOID')).toBeInTheDocument();

      // Retry with Same Key action in the banner
      const retryBtn = screen.getByRole('button', { name: /Retry with Same Key/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(reverseCalls.length).toBe(1);
      });
      expect(reverseCalls[0].paymentId).toBe('pay-history-1');
      expect(reverseCalls[0].payload.idempotencyKey).toBe('restored-reversal-key-555');
      expect(reverseCalls[0].payload.reversalType).toBe('VOID');

      // After successful retry, pending reversal is cleared and banner disappears
      await waitFor(() => {
        expect(screen.queryByText(/Pending Reversal Awaiting Confirmation/i)).not.toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------
  // FEE-P0-003-FIX-6 Regression Tests: Final Payment Safety Blockers
  // -------------------------------------------------------------
  describe('FEE-P0-003-FIX-6 Regression Tests: Final Payment Safety Blockers', () => {
    describe('FIX-6B: Cross-Operation Recovery Guard', () => {
      it('Pending REFUND prevents starting a new COLLECTION, disables tab navigation, and preserves storage', async () => {
        const refundOp = {
          operationType: 'REFUND',
          idempotencyKey: 'refund-guard-key-101',
          fingerprint: 'fp-ref-101',
          createdAt: Date.now() - 5000,
          context: {
            paymentId: 'pay-history-1',
            paymentNumber: 'PAY-2026-0001',
            refundAmount: 1500,
            refundReason: 'Duplicate fee charge requested by parent',
            refundMode: 'BANK_TRANSFER',
          },
        };
        sessionStorage.setItem('fee_pending_payment_op', JSON.stringify(refundOp));

        (paymentsApi.lookupIdempotency as any).mockResolvedValue({
          found: false,
        });

        render(<PaymentsView />);

        // The Collect Payment tab should be disabled while a refund is pending
        const collectTabBtn = screen.getByRole('button', { name: /Collect Payment/i });
        expect(collectTabBtn).toBeDisabled();

        // Ensure collect API was never called
        expect(paymentsApi.collect).not.toHaveBeenCalled();

        // Ensure sessionStorage remains intact with the pending refund key
        const inStorage = JSON.parse(sessionStorage.getItem('fee_pending_payment_op') || '{}');
        expect(inStorage.idempotencyKey).toBe('refund-guard-key-101');
        expect(inStorage.operationType).toBe('REFUND');
      });

      it('Pending REVERSAL prevents starting a new COLLECTION, disables tab navigation, and preserves storage', async () => {
        const reversalOp = {
          operationType: 'REVERSAL',
          idempotencyKey: 'reversal-guard-key-202',
          fingerprint: 'fp-rev-202',
          createdAt: Date.now() - 5000,
          context: {
            paymentId: 'pay-history-1',
            paymentNumber: 'PAY-2026-0001',
            reversalType: 'VOID',
            reversalReason: 'Wrong fee head credited by clerk',
          },
        };
        sessionStorage.setItem('fee_pending_payment_op', JSON.stringify(reversalOp));

        (paymentsApi.lookupIdempotency as any).mockResolvedValue({
          found: false,
        });

        render(<PaymentsView />);

        // Collect Payment tab must be disabled while a reversal is unresolved
        const collectTabBtn = screen.getByRole('button', { name: /Collect Payment/i });
        expect(collectTabBtn).toBeDisabled();

        expect(paymentsApi.collect).not.toHaveBeenCalled();

        const inStorage = JSON.parse(sessionStorage.getItem('fee_pending_payment_op') || '{}');
        expect(inStorage.idempotencyKey).toBe('reversal-guard-key-202');
        expect(inStorage.operationType).toBe('REVERSAL');
      });

      it('Pending COLLECTION prevents starting REFUND or REVERSAL and preserves collection key', async () => {
        const collectionOp = {
          operationType: 'COLLECTION',
          idempotencyKey: 'collection-guard-key-303',
          fingerprint: 'fp-col-303',
          createdAt: Date.now() - 5000,
          context: {
            studentId: 'student-1',
            studentName: 'Aarav Sharma',
            academicYearId: 'ay-2026',
            amount: 3000,
            paymentMethod: 'CASH',
          },
        };
        sessionStorage.setItem('fee_pending_payment_op', JSON.stringify(collectionOp));

        (paymentsApi.lookupIdempotency as any).mockResolvedValue({
          found: false,
        });

        render(<PaymentsView />);

        // The Payment History tab navigation is disabled while collection is pending
        const historyTabBtn = screen.getByRole('button', { name: /Payment History & Receipts/i });
        expect(historyTabBtn).toBeDisabled();

        // Collection key and op remain intact
        const inStorage = JSON.parse(sessionStorage.getItem('fee_pending_payment_op') || '{}');
        expect(inStorage.idempotencyKey).toBe('collection-guard-key-303');
        expect(inStorage.operationType).toBe('COLLECTION');
        expect(paymentsApi.refund).not.toHaveBeenCalled();
        expect(paymentsApi.reverse).not.toHaveBeenCalled();
      });
    });

    describe('FIX-6C: Validate Refund Outcome Status', () => {
      it('Manual Check: treats SUCCEEDED as confirmed success and clears recovery state', async () => {
        const refundOp = {
          operationType: 'REFUND',
          idempotencyKey: 'refund-status-succ-401',
          fingerprint: 'fp-succ-401',
          createdAt: Date.now() - 10000,
          context: {
            paymentId: 'pay-history-1',
            paymentNumber: 'PAY-2026-0001',
            refundAmount: 1000,
            refundReason: 'Excess fee refund verification test',
            refundMode: 'BANK_TRANSFER',
          },
        };
        sessionStorage.setItem('fee_pending_payment_op', JSON.stringify(refundOp));

        // Initial lookup on mount returns not found
        (paymentsApi.lookupIdempotency as any).mockResolvedValueOnce({
          found: false,
        });

        render(<PaymentsView />);

        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();

        // User clicks Check Outcome -> backend returns SUCCEEDED
        (paymentsApi.lookupIdempotency as any).mockResolvedValueOnce({
          found: true,
          operationType: 'REFUND',
          status: 'SUCCEEDED',
          refund: { paymentId: 'pay-history-1', status: 'SUCCEEDED', refundAmount: 1000 },
        });

        const checkBtn = screen.getByRole('button', { name: /Check Outcome/i });
        fireEvent.click(checkBtn);

        // Confirmed: banner removed, storage cleared
        await waitFor(() => {
          expect(screen.queryByTestId('history-pending-recovery-banner')).not.toBeInTheDocument();
        });
        expect(sessionStorage.getItem('fee_pending_payment_op')).toBeNull();
      });

      it('Manual Check: PENDING status keeps recovery state unresolved and locked', async () => {
        const refundOp = {
          operationType: 'REFUND',
          idempotencyKey: 'refund-status-pend-402',
          fingerprint: 'fp-pend-402',
          createdAt: Date.now() - 10000,
          context: {
            paymentId: 'pay-history-1',
            paymentNumber: 'PAY-2026-0001',
            refundAmount: 1000,
            refundReason: 'Excess fee refund verification test',
            refundMode: 'BANK_TRANSFER',
          },
        };
        sessionStorage.setItem('fee_pending_payment_op', JSON.stringify(refundOp));

        (paymentsApi.lookupIdempotency as any).mockResolvedValueOnce({
          found: false,
        });

        render(<PaymentsView />);

        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();

        // Backend confirms record exists but is PENDING bank settlement
        (paymentsApi.lookupIdempotency as any).mockResolvedValueOnce({
          found: true,
          operationType: 'REFUND',
          status: 'PENDING',
          refund: { paymentId: 'pay-history-1', status: 'PENDING', refundAmount: 1000 },
        });

        const checkBtn = screen.getByRole('button', { name: /Check Outcome/i });
        fireEvent.click(checkBtn);

        // Remains unresolved and banner stays
        await waitFor(() => {
          expect(screen.getByText(/Refund is currently PENDING/i)).toBeInTheDocument();
        });
        expect(screen.getByTestId('history-pending-recovery-banner')).toBeInTheDocument();
        expect(sessionStorage.getItem('fee_pending_payment_op')).not.toBeNull();
      });

      it('Manual Check: FAILED status is shown as actual terminal failure and clears pending op', async () => {
        const refundOp = {
          operationType: 'REFUND',
          idempotencyKey: 'refund-status-fail-403',
          fingerprint: 'fp-fail-403',
          createdAt: Date.now() - 10000,
          context: {
            paymentId: 'pay-history-1',
            paymentNumber: 'PAY-2026-0001',
            refundAmount: 1000,
            refundReason: 'Excess fee refund verification test',
            refundMode: 'BANK_TRANSFER',
          },
        };
        sessionStorage.setItem('fee_pending_payment_op', JSON.stringify(refundOp));

        (paymentsApi.lookupIdempotency as any).mockResolvedValueOnce({
          found: false,
        });

        render(<PaymentsView />);

        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();

        // Backend reports refund FAILED
        (paymentsApi.lookupIdempotency as any).mockResolvedValueOnce({
          found: true,
          operationType: 'REFUND',
          status: 'FAILED',
          refund: { paymentId: 'pay-history-1', status: 'FAILED', refundAmount: 1000 },
        });

        const checkBtn = screen.getByRole('button', { name: /Check Outcome/i });
        fireEvent.click(checkBtn);

        await waitFor(() => {
          expect(screen.getByText(/Server confirmed: Refund was FAILED/i)).toBeInTheDocument();
        });
        expect(screen.queryByTestId('history-pending-recovery-banner')).not.toBeInTheDocument();
        expect(sessionStorage.getItem('fee_pending_payment_op')).toBeNull();
        const note = screen.getByTestId('history-recovery-notification');
        expect(note).toHaveAttribute('data-tone', 'failure');
        expect(note).toHaveAttribute('role', 'alert');
        expect(screen.getByTestId('recovery-icon-failure')).toBeInTheDocument();
        expect(screen.queryByTestId('recovery-icon-success')).not.toBeInTheDocument();
        expect(note.textContent).not.toMatch(/confirmed on the server/i);
      });

      it('Reload Recovery: auto-clears on SUCCEEDED and displays actual status on CANCELLED', async () => {
        // Test CANCELLED on reload
        const refundOp = {
          operationType: 'REFUND',
          idempotencyKey: 'refund-status-canc-404',
          fingerprint: 'fp-canc-404',
          createdAt: Date.now() - 10000,
          context: {
            paymentId: 'pay-history-1',
            paymentNumber: 'PAY-2026-0001',
            refundAmount: 1000,
            refundReason: 'Excess fee refund verification test',
            refundMode: 'BANK_TRANSFER',
          },
        };
        sessionStorage.setItem('fee_pending_payment_op', JSON.stringify(refundOp));

        (paymentsApi.lookupIdempotency as any).mockResolvedValueOnce({
          found: true,
          operationType: 'REFUND',
          status: 'CANCELLED',
          refund: { paymentId: 'pay-history-1', status: 'CANCELLED', refundAmount: 1000 },
        });

        render(<PaymentsView />);

        await waitFor(() => {
          expect(screen.getByText(/Restored refund was recorded as CANCELLED on the server/i)).toBeInTheDocument();
        });
        expect(sessionStorage.getItem('fee_pending_payment_op')).toBeNull();
      });

      it('Parent payment PARTIALLY_REFUNDED confirms success when specific refund is SUCCEEDED', async () => {
        const refundOp = {
          operationType: 'REFUND',
          idempotencyKey: 'refund-partial-key-405',
          fingerprint: 'fp-part-405',
          createdAt: Date.now() - 10000,
          context: {
            paymentId: 'pay-history-1',
            paymentNumber: 'PAY-2026-0001',
            refundAmount: 2000,
            refundReason: 'Legitimate partial refund verification',
            refundMode: 'BANK_TRANSFER',
          },
        };
        sessionStorage.setItem('fee_pending_payment_op', JSON.stringify(refundOp));

        (paymentsApi.lookupIdempotency as any).mockResolvedValueOnce({
          found: true,
          operationType: 'REFUND',
          status: 'SUCCEEDED',
          refund: { paymentId: 'pay-history-1', status: 'SUCCEEDED', refundAmount: 2000 },
        });

        render(<PaymentsView />);

        await waitFor(() => {
          expect(screen.getByText(/Restored refund was confirmed on the server! Payment history refreshed/i)).toBeInTheDocument();
        });
        expect(sessionStorage.getItem('fee_pending_payment_op')).toBeNull();
      });
    });

    // FIX-6D recovery-record tests were superseded by FIX-7 (see 'FEE-P0-003-FIX-7' suite below).
  });

  // -------------------------------------------------------------
  // FEE-P0-003-FIX-7: Payment Recovery Safety Remediation
  // -------------------------------------------------------------
  describe('FEE-P0-003-FIX-7 Payment Recovery Safety Remediation', () => {
    const STORAGE = 'fee_pending_payment_op';
    const colOp = (key = 'col-key-00000001', ctx: any = {}, extra: any = {}) => ({
      operationType: 'COLLECTION',
      idempotencyKey: key,
      fingerprint: 'fp-col',
      createdAt: Date.now() - 1000,
      context: {
        studentId: 'student-1',
        studentName: 'Aarav Sharma',
        academicYearId: 'ay-2026',
        amount: 3000,
        paymentMethod: 'CASH',
        ...ctx,
      },
      ...extra,
    });
    const refOp = (key = 'ref-key-000000001', ctx: any = {}, extra: any = {}) => ({
      operationType: 'REFUND',
      idempotencyKey: key,
      fingerprint: 'fp-ref',
      createdAt: Date.now() - 1000,
      context: {
        paymentId: 'pay-1',
        paymentNumber: 'PAY-2026-0001',
        refundAmount: 1500,
        refundReason: 'Duplicate fee charge requested by parent',
        refundMode: 'BANK_TRANSFER',
        ...ctx,
      },
      ...extra,
    });
    const revOp = (key = 'rev-key-000000001', ctx: any = {}, extra: any = {}) => ({
      operationType: 'REVERSAL',
      idempotencyKey: key,
      fingerprint: 'fp-rev',
      createdAt: Date.now() - 1000,
      context: {
        paymentId: 'pay-1',
        paymentNumber: 'PAY-2026-0001',
        reversalType: 'VOID',
        reversalReason: 'Wrong fee head credited by clerk',
        ...ctx,
      },
      ...extra,
    });
    const seed = (v: any) => sessionStorage.setItem(STORAGE, typeof v === 'string' ? v : JSON.stringify(v));
    const httpError = (status: number, message = 'err') =>
      Object.assign(new Error(message), { response: { status, data: { message } } });

    beforeEach(() => {
      (paymentsApi.lookupIdempotency as any).mockReset().mockResolvedValue({ found: false });
      (paymentsApi.getRefunds as any).mockReset().mockResolvedValue([]);
      (paymentsApi.collect as any).mockReset();
      (paymentsApi.refund as any).mockReset();
      (paymentsApi.reverse as any).mockReset();
    });

    // ---------------------------------------------------------
    // FIX-7B: records are never silently discarded
    // ---------------------------------------------------------
    describe('FIX-7B: recovery records are never silently discarded', () => {
      it('malformed JSON is retained (not erased) and classified UNRECONCILABLE; no key is invented', () => {
        seed('{"broken json');
        expect(getPendingPaymentOperation()).toBeNull();
        expect(sessionStorage.getItem(STORAGE)).toBe('{"broken json');
        const state = classifyRecoveryRecord(sessionStorage.getItem(STORAGE));
        expect(state).toMatchObject({ kind: 'UNRECONCILABLE', key: null });
      });

      it('malformed JSON with a strictly valid key recovers only that key', () => {
        const state = classifyRecoveryRecord('{"operationType":"REFUND","idempotencyKey":"abc-12345678-key","context":{');
        expect(state).toMatchObject({ kind: 'UNRECONCILABLE', key: 'abc-12345678-key', operationType: 'REFUND' });
        // A key that fails the strict shape is rejected rather than trusted
        const bad = classifyRecoveryRecord('{"idempotencyKey":"x y!","context":{');
        expect(bad).toMatchObject({ kind: 'UNRECONCILABLE', key: null });
      });

      it('unknown operation type, missing key and non-object records are retained as UNRECONCILABLE', () => {
        seed(colOp('unknown-op-key-0001', {}, { operationType: 'UNKNOWN_OP' }));
        expect(getPendingPaymentOperation()).toBeNull();
        expect(sessionStorage.getItem(STORAGE)).not.toBeNull();
        expect(classifyRecoveryRecord(sessionStorage.getItem(STORAGE))).toMatchObject({
          kind: 'UNRECONCILABLE',
          key: 'unknown-op-key-0001',
          operationType: null,
        });

        const noKey: any = colOp();
        delete noKey.idempotencyKey;
        expect(classifyRecoveryRecord(JSON.stringify(noKey))).toMatchObject({ kind: 'UNRECONCILABLE', key: null });
        expect(classifyRecoveryRecord('"just a string"')).toMatchObject({ kind: 'UNRECONCILABLE', key: null });
        expect(classifyRecoveryRecord('[1,2]')).toMatchObject({ kind: 'UNRECONCILABLE', key: null });
        expect(sessionStorage.getItem(STORAGE)).not.toBeNull();
      });

      it('records older than 24h are NOT purged and remain VALID/restorable', () => {
        const old = colOp('old-col-key-0000001', {}, { createdAt: Date.now() - 30 * 60 * 60 * 1000 });
        seed(old);
        expect(getPendingPaymentOperation()).toEqual(old);
        expect(sessionStorage.getItem(STORAGE)).toBe(JSON.stringify(old));
      });

      it('invalid timestamp or incomplete context is PARTIAL (key and type kept), never erased', () => {
        const badTime = colOp('bad-time-key-00001', {}, { createdAt: 'yesterday' });
        expect(classifyRecoveryRecord(JSON.stringify(badTime))).toMatchObject({
          kind: 'PARTIAL',
          op: { idempotencyKey: 'bad-time-key-00001', operationType: 'COLLECTION' },
        });
        const incomplete = refOp('incomplete-ctx-00001', { paymentId: undefined });
        seed(incomplete);
        expect(getPendingPaymentOperation()).toBeNull();
        expect(classifyRecoveryRecord(sessionStorage.getItem(STORAGE))).toMatchObject({ kind: 'PARTIAL' });
        expect(sessionStorage.getItem(STORAGE)).not.toBeNull();
      });

      it('invalid amounts and missing identifiers keep the record locked (PARTIAL), not unlocked', () => {
        for (const op of [
          colOp('amt-zero-key-000001', { amount: 0 }),
          colOp('amt-nan-key-0000001', { amount: 'abc' }),
          colOp('no-student-key-00001', { studentId: '' }),
          refOp('ref-neg-key-0000001', { refundAmount: -5 }),
          revOp('rev-badtype-key-0001', { reversalType: 'DELETE' }),
        ]) {
          expect(classifyRecoveryRecord(JSON.stringify(op)).kind).toBe('PARTIAL');
        }
      });

      it('UI: malformed record with no key blocks every action and offers no dismissal', async () => {
        seed('{"broken json');
        render(<PaymentsView />);

        expect(await screen.findByTestId('unreconcilable-record-banner')).toBeInTheDocument();
        expect(screen.getByText(/Supervisor Reconciliation Required/i)).toBeInTheDocument();
        expect(screen.getByText(/No reliable idempotency key could be recovered/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Dismiss/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Check Outcome/i })).not.toBeInTheDocument();
        expect(paymentsApi.lookupIdempotency).not.toHaveBeenCalled();

        const amountInput = await screen.findByPlaceholderText('0.00');
        fireEvent.change(amountInput, { target: { value: '100' } });
        const submit = screen.getByRole('button', { name: /Collect ₹100.00/i });
        expect(submit).toBeDisabled();
        fireEvent.click(submit);
        expect(paymentsApi.collect).not.toHaveBeenCalled();
        expect(sessionStorage.getItem(STORAGE)).toBe('{"broken json');
      });

      it('UI: Refund and Reverse buttons are disabled while a damaged record exists', async () => {
        seed('{"broken json');
        render(<PaymentsView />);
        fireEvent.click(await screen.findByRole('button', { name: /Payment History & Receipts/i }));
        const refundBtn = await screen.findByRole('button', { name: /^Refund$/i });
        const reverseBtn = await screen.findByRole('button', { name: /^Reverse$/i });
        expect(refundBtn).toBeDisabled();
        expect(reverseBtn).toBeDisabled();
      });

      it('UI: damaged record with a recovered key reconciles by key; found:false stays blocked (no dismissal)', async () => {
        seed('{"operationType":"REFUND","idempotencyKey":"damaged-key-123456","context":{');
        render(<PaymentsView />);

        expect(await screen.findByTestId('unreconcilable-record-banner')).toBeInTheDocument();
        await waitFor(() => expect(paymentsApi.lookupIdempotency).toHaveBeenCalledWith('damaged-key-123456'));
        expect(await screen.findByText(/does not prove the original request can no longer commit/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Dismiss/i })).not.toBeInTheDocument();
        expect(sessionStorage.getItem(STORAGE)).toBe('{"operationType":"REFUND","idempotencyKey":"damaged-key-123456","context":{');

        // Server later reports the exact key as a terminal SUCCEEDED refund -> record may now be cleared
        (paymentsApi.lookupIdempotency as any).mockResolvedValueOnce({
          found: true,
          operationType: 'REFUND',
          status: 'SUCCEEDED',
        });
        fireEvent.click(screen.getByRole('button', { name: /Check Outcome/i }));
        await waitFor(() => expect(screen.queryByTestId('unreconcilable-record-banner')).not.toBeInTheDocument());
        expect(sessionStorage.getItem(STORAGE)).toBeNull();
      });

      it('UI: a damaged record whose server outcome is a PENDING refund stays blocked', async () => {
        seed('{"operationType":"REFUND","idempotencyKey":"damaged-pend-123456","context":{');
        (paymentsApi.lookupIdempotency as any).mockResolvedValue({
          found: true,
          operationType: 'REFUND',
          status: 'PENDING',
        });
        render(<PaymentsView />);
        expect(await screen.findByText(/remains unresolved and all payment operations stay blocked/i)).toBeInTheDocument();
        expect(screen.getByTestId('unreconcilable-record-banner')).toBeInTheDocument();
        expect(sessionStorage.getItem(STORAGE)).not.toBeNull();
      });

      it('UI: 30-hour-old refund record is restored (locked, not discarded) and retried with the original key and payload', async () => {
        const old = refOp('old-ref-key-0000001', {}, { createdAt: Date.now() - 30 * 60 * 60 * 1000 });
        seed(old);
        (paymentsApi.refund as any).mockResolvedValue({ success: true });
        render(<PaymentsView />);

        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();
        expect(await screen.findByText(/older than 24 hours and has NOT been discarded/i)).toBeInTheDocument();
        expect(sessionStorage.getItem(STORAGE)).toBe(JSON.stringify(old));

        fireEvent.click(screen.getByRole('button', { name: /Retry with Same Key/i }));
        await waitFor(() => expect(paymentsApi.refund).toHaveBeenCalledTimes(1));
        const [paymentId, payload] = (paymentsApi.refund as any).mock.calls[0];
        expect(paymentId).toBe('pay-1');
        expect(payload).toMatchObject({
          amount: 1500,
          reason: 'Duplicate fee charge requested by parent',
          mode: 'BANK_TRANSFER',
          idempotencyKey: 'old-ref-key-0000001',
        });
        await waitFor(() => expect(sessionStorage.getItem(STORAGE)).toBeNull());
      });

      it('UI: incomplete-context collection stays locked on found:false, has no dismissal, and cannot be retried', async () => {
        seed(colOp('col-damaged-key-0001', { academicYearId: undefined, paymentMethod: undefined }));
        render(<PaymentsView />);

        expect(await screen.findByText(/Payment Outcome Uncertain — Form Locked for Safety/i)).toBeInTheDocument();
        expect(await screen.findByText(/does not prove that it can no longer commit|no committed payment for this key yet/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Dismiss/i })).not.toBeInTheDocument();
        expect(sessionStorage.getItem(STORAGE)).not.toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /Retry with Same Key/i }));
        expect(await screen.findAllByText(/missing required fields/i)).not.toHaveLength(0);
        expect(paymentsApi.collect).not.toHaveBeenCalled();
      });

      it('UI: unknown-type record with a valid key is looked up by that key and stays blocked on found:false', async () => {
        seed(colOp('unknown-type-key-001', {}, { operationType: 'MYSTERY' }));
        render(<PaymentsView />);
        expect(await screen.findByTestId('unreconcilable-record-banner')).toBeInTheDocument();
        await waitFor(() => expect(paymentsApi.lookupIdempotency).toHaveBeenCalledWith('unknown-type-key-001'));
        expect(sessionStorage.getItem(STORAGE)).not.toBeNull();
      });

      it('UI: exact-payload collection retry reuses the original key and payload', async () => {
        seed(colOp('col-retry-key-000001', { referenceNumber: 'REF-9', bankName: 'HDFC', notes: 'n1' }));
        (paymentsApi.collect as any).mockResolvedValue({
          payment: mockPaymentsList.data[0],
          receipt: mockPaymentsList.data[0].receipt,
          allocations: [],
          isIdempotentReplay: false,
        });
        render(<PaymentsView />);
        fireEvent.click(await screen.findByRole('button', { name: /Retry with Same Key/i }));
        await waitFor(() => expect(paymentsApi.collect).toHaveBeenCalledTimes(1));
        const [payload, headerKey] = (paymentsApi.collect as any).mock.calls[0];
        expect(headerKey).toBe('col-retry-key-000001');
        expect(payload).toMatchObject({
          studentId: 'student-1',
          academicYearId: 'ay-2026',
          amount: 3000,
          paymentMethod: 'CASH',
          referenceNumber: 'REF-9',
          bankName: 'HDFC',
          notes: 'n1',
          idempotencyKey: 'col-retry-key-000001',
        });
      });
    });

    // ---------------------------------------------------------
    // FIX-7E: key-aware clearing
    // ---------------------------------------------------------
    describe('FIX-7E: recovery clearing matches type AND idempotency key', () => {
      it('does not clear a same-type record that has a different key', () => {
        seed(refOp('newer-ref-key-00001'));
        expect(clearPendingPaymentOperation('REFUND', 'older-ref-key-00001')).toBe(false);
        expect(JSON.parse(sessionStorage.getItem(STORAGE)!).idempotencyKey).toBe('newer-ref-key-00001');
      });

      it('does not clear a different-type record that has the same key', () => {
        seed(refOp('shared-key-0000001'));
        expect(clearPendingPaymentOperation('COLLECTION', 'shared-key-0000001')).toBe(false);
        expect(clearPendingPaymentOperation('REVERSAL', 'shared-key-0000001')).toBe(false);
        expect(sessionStorage.getItem(STORAGE)).not.toBeNull();
      });

      it('clears only when both type and key match', () => {
        seed(refOp('match-ref-key-000001'));
        expect(clearPendingPaymentOperation('REFUND', 'match-ref-key-000001')).toBe(true);
        expect(sessionStorage.getItem(STORAGE)).toBeNull();
      });

      it('clearing never touches an UNRECONCILABLE record via the typed API', () => {
        seed('{"broken json');
        expect(clearPendingPaymentOperation('REFUND', 'whatever-key-0001')).toBe(false);
        expect(sessionStorage.getItem(STORAGE)).toBe('{"broken json');
      });

      it('UI: a late outcome for an older operation does not erase a newer recovery record', async () => {
        seed(refOp('older-ref-key-00001'));
        render(<PaymentsView />);
        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();

        // A newer operation of the same type now owns the storage slot
        const newer = refOp('newer-ref-key-00001');
        seed(newer);

        (paymentsApi.lookupIdempotency as any).mockResolvedValueOnce({
          found: true,
          operationType: 'REFUND',
          status: 'SUCCEEDED',
          refund: { paymentId: 'pay-1', refundAmount: 1500, status: 'SUCCEEDED' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Check Outcome/i }));
        await waitFor(() => expect(screen.queryByTestId('history-pending-recovery-banner')).not.toBeInTheDocument());

        // Older op's confirmation must not have erased the newer record
        expect(sessionStorage.getItem(STORAGE)).toBe(JSON.stringify(newer));
      });
    });

    // ---------------------------------------------------------
    // FIX-7F / FIX-7G: persistence failure and transitions
    // ---------------------------------------------------------
    describe('FIX-7F: abort when recovery persistence fails', () => {
      it('savePendingPaymentOperation returns ok:false and leaves the existing record untouched for every cross-type and same-type-different-key transition', () => {
        const ops: Record<string, any> = { COLLECTION: colOp(), REFUND: refOp(), REVERSAL: revOp() };
        const types = ['COLLECTION', 'REFUND', 'REVERSAL'];
        let transitions = 0;
        for (const from of types) {
          for (const to of types) {
            if (from === to) continue;
            sessionStorage.clear();
            seed(ops[from]);
            const before = sessionStorage.getItem(STORAGE);
            const res = savePendingPaymentOperation({ ...ops[to], idempotencyKey: 'transition-new-key-1' });
            expect(res.ok).toBe(false);
            expect((res as any).reason).toMatch(/No request was sent/i);
            expect(sessionStorage.getItem(STORAGE)).toBe(before);
            transitions++;
          }
        }
        expect(transitions).toBe(6);
      });

      it('refuses a same-type operation with a different key, but accepts the identical operation', () => {
        const a = refOp('same-type-key-000001');
        seed(a);
        expect(savePendingPaymentOperation(refOp('same-type-key-000002')).ok).toBe(false);
        expect(sessionStorage.getItem(STORAGE)).toBe(JSON.stringify(a));
        expect(savePendingPaymentOperation(a as any).ok).toBe(true);
      });

      it('refuses to save over a damaged record', () => {
        seed('{"broken json');
        const res = savePendingPaymentOperation(colOp() as any);
        expect(res.ok).toBe(false);
        expect(sessionStorage.getItem(STORAGE)).toBe('{"broken json');
      });

      it('collection: storage write failure aborts BEFORE any API call', async () => {
        render(<PaymentsView />);
        const amountInput = await screen.findByPlaceholderText('0.00');
        fireEvent.change(amountInput, { target: { value: '5500' } });
        const submit = await screen.findByRole('button', { name: /Collect ₹5,500.00/i });

        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });
        try {
          fireEvent.click(submit);
          expect(await screen.findByText(/Recovery state could not be persisted. No request was sent/i)).toBeInTheDocument();
          expect(paymentsApi.collect).not.toHaveBeenCalled();
        } finally {
          spy.mockRestore();
        }
        expect(sessionStorage.getItem(STORAGE)).toBeNull();
      });

      it('collection: another operation occupying storage aborts the request and preserves that record', async () => {
        render(<PaymentsView />);
        const amountInput = await screen.findByPlaceholderText('0.00');
        fireEvent.change(amountInput, { target: { value: '5500' } });
        const submit = await screen.findByRole('button', { name: /Collect ₹5,500.00/i });

        const other = refOp('occupant-ref-key-001');
        seed(other);
        fireEvent.click(submit);

        expect(await screen.findByText(/Another refund operation .* is still unresolved/i)).toBeInTheDocument();
        expect(paymentsApi.collect).not.toHaveBeenCalled();
        expect(sessionStorage.getItem(STORAGE)).toBe(JSON.stringify(other));
      });

      it('refund: storage write failure aborts BEFORE any API call', async () => {
        render(<PaymentsView />);
        fireEvent.click(await screen.findByRole('button', { name: /Payment History & Receipts/i }));
        fireEvent.click(await screen.findByRole('button', { name: /^Refund$/i }));
        fireEvent.change(await screen.findByPlaceholderText('0.00'), { target: { value: '1000' } });
        fireEvent.change(await screen.findByPlaceholderText(/Provide audit justification/i), {
          target: { value: 'Overpayment refund requested by parent' },
        });
        const confirm = screen.getByRole('button', { name: /Confirm Refund/i });

        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });
        try {
          fireEvent.click(confirm);
          expect(await screen.findByText(/Recovery state could not be persisted. No request was sent/i)).toBeInTheDocument();
          expect(paymentsApi.refund).not.toHaveBeenCalled();
        } finally {
          spy.mockRestore();
        }
      });

      it('reversal: storage write failure aborts BEFORE any API call', async () => {
        render(<PaymentsView />);
        fireEvent.click(await screen.findByRole('button', { name: /Payment History & Receipts/i }));
        fireEvent.click(await screen.findByRole('button', { name: /^Reverse$/i }));
        fireEvent.change(await screen.findByPlaceholderText(/Provide detailed compliance audit justification/i), {
          target: { value: 'Duplicate entry posted by cashier' },
        });
        const confirm = screen.getByRole('button', { name: /Confirm Reversal/i });

        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });
        try {
          fireEvent.click(confirm);
          expect(await screen.findByText(/Recovery state could not be persisted. No request was sent/i)).toBeInTheDocument();
          expect(paymentsApi.reverse).not.toHaveBeenCalled();
        } finally {
          spy.mockRestore();
        }
      });
    });

    describe('FIX-7G: UI cannot bypass the single-unresolved-operation guard', () => {
      it('pending REFUND: collect tab disabled, Reverse disabled, no API calls', async () => {
        seed(refOp());
        render(<PaymentsView />);
        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();

        const collectTab = screen.getByRole('button', { name: /Collect Payment/i });
        expect(collectTab).toBeDisabled();
        fireEvent.click(collectTab);
        expect(screen.queryByText(/Counter Fee Collection/i)).not.toBeInTheDocument();

        const reverseBtn = await screen.findByRole('button', { name: /^Reverse$/i });
        expect(reverseBtn).toBeDisabled();
        fireEvent.click(reverseBtn);
        expect(screen.queryByRole('button', { name: /Confirm Reversal/i })).not.toBeInTheDocument();
        expect(paymentsApi.collect).not.toHaveBeenCalled();
        expect(paymentsApi.reverse).not.toHaveBeenCalled();
      });

      it('pending REVERSAL: collect tab disabled, Refund disabled, no API calls', async () => {
        seed(revOp());
        render(<PaymentsView />);
        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();

        expect(screen.getByRole('button', { name: /Collect Payment/i })).toBeDisabled();
        const refundBtn = await screen.findByRole('button', { name: /^Refund$/i });
        expect(refundBtn).toBeDisabled();
        fireEvent.click(refundBtn);
        expect(screen.queryByRole('button', { name: /Confirm Refund/i })).not.toBeInTheDocument();
        expect(paymentsApi.collect).not.toHaveBeenCalled();
        expect(paymentsApi.refund).not.toHaveBeenCalled();
      });

      it('pending COLLECTION: history tab disabled so Refund/Reverse are unreachable, no API calls', async () => {
        seed(colOp());
        render(<PaymentsView />);
        const historyTab = await screen.findByRole('button', { name: /Payment History & Receipts/i });
        expect(historyTab).toBeDisabled();
        fireEvent.click(historyTab);
        expect(screen.queryByRole('button', { name: /^Refund$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Reverse$/i })).not.toBeInTheDocument();
        expect(paymentsApi.refund).not.toHaveBeenCalled();
        expect(paymentsApi.reverse).not.toHaveBeenCalled();
      });
    });

    // ---------------------------------------------------------
    // FIX-7G: refund verification against exact operation
    // ---------------------------------------------------------
    describe('FIX-7G: refund lookup is verified against the pending operation', () => {
      const op: any = refOp('verify-ref-key-0001', { refundAmount: 1500 });

      it('evaluateRefundLookup: parent PARTIALLY_REFUNDED never proves this refund', () => {
        // Specific refund absent
        expect(evaluateRefundLookup({ found: false, payment: { status: 'PARTIALLY_REFUNDED' } }, op)).toBeNull();
        // Specific refund pending
        expect(
          evaluateRefundLookup(
            { found: true, operationType: 'REFUND', status: 'PENDING', refund: { paymentId: 'pay-1', refundAmount: 1500 }, payment: { status: 'PARTIALLY_REFUNDED' } },
            op,
          ),
        ).toMatchObject({ verdict: 'PENDING' });
        // Specific refund failed
        expect(
          evaluateRefundLookup(
            { found: true, operationType: 'REFUND', status: 'FAILED', refund: { paymentId: 'pay-1', refundAmount: 1500 } },
            op,
          ),
        ).toMatchObject({ verdict: 'FAILED' });
        // A collection record is not a refund record
        expect(evaluateRefundLookup({ found: true, operationType: 'COLLECTION' }, op)).toBeNull();
      });

      it('evaluateRefundLookup: rejects a refund for another payment or another amount (another operation)', () => {
        expect(
          evaluateRefundLookup(
            { found: true, operationType: 'REFUND', status: 'SUCCEEDED', refund: { paymentId: 'pay-OTHER', refundAmount: 1500 } },
            op,
          ),
        ).toMatchObject({ verdict: 'MISMATCH' });
        expect(
          evaluateRefundLookup(
            { found: true, operationType: 'REFUND', status: 'SUCCEEDED', refund: { paymentId: 'pay-1', refundAmount: 999 } },
            op,
          ),
        ).toMatchObject({ verdict: 'MISMATCH' });
        expect(
          evaluateRefundLookup({ found: true, operationType: 'REFUND', status: 'SUCCEEDED' }, op),
        ).toMatchObject({ verdict: 'MISMATCH' });
        expect(
          evaluateRefundLookup(
            { found: true, operationType: 'REFUND', status: 'SUCCEEDED', refund: { paymentId: 'pay-1', refundAmount: 1500 } },
            op,
          ),
        ).toMatchObject({ verdict: 'SUCCEEDED' });
      });

      it('UI: SUCCEEDED refund for a DIFFERENT payment keeps the operation pending and locked', async () => {
        seed(op);
        render(<PaymentsView />);
        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();

        (paymentsApi.lookupIdempotency as any).mockResolvedValue({
          found: true,
          operationType: 'REFUND',
          status: 'SUCCEEDED',
          refund: { paymentId: 'pay-OTHER', refundAmount: 1500, status: 'SUCCEEDED' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Check Outcome/i }));
        expect((await screen.findAllByText(/does not match the pending refund \(payment/i)).length).toBeGreaterThan(0);
        expect(screen.getByTestId('history-pending-recovery-banner')).toBeInTheDocument();
        expect(sessionStorage.getItem(STORAGE)).toBe(JSON.stringify(op));
      });

      it('UI: SUCCEEDED refund with a DIFFERENT amount keeps the operation pending and locked', async () => {
        seed(op);
        render(<PaymentsView />);
        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();

        (paymentsApi.lookupIdempotency as any).mockResolvedValue({
          found: true,
          operationType: 'REFUND',
          status: 'SUCCEEDED',
          refund: { paymentId: 'pay-1', refundAmount: 700, status: 'SUCCEEDED' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Check Outcome/i }));
        expect((await screen.findAllByText(/does not match the pending refund \(amount/i)).length).toBeGreaterThan(0);
        expect(sessionStorage.getItem(STORAGE)).toBe(JSON.stringify(op));
      });

      it('UI: parent payment PARTIALLY_REFUNDED with the specific refund absent keeps the operation pending', async () => {
        (paymentsApi.list as any).mockResolvedValue({
          ...mockPaymentsList,
          data: [{ ...mockPaymentsList.data[0], status: 'PARTIALLY_REFUNDED' }],
        });
        // An earlier refund with the same amount but another key exists
        (paymentsApi.getRefunds as any).mockResolvedValue([
          { id: 'r0', paymentId: 'pay-1', amount: 1500, refundAmount: 1500, status: 'SUCCEEDED', idempotencyKey: 'earlier-key-00000001', reason: 'x', createdAt: '2026-01-01' },
        ]);
        seed(op);
        render(<PaymentsView />);
        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Check Outcome/i }));
        expect((await screen.findAllByText(/has no refund recorded with this key yet/i)).length).toBeGreaterThan(0);
        expect(screen.getByTestId('history-pending-recovery-banner')).toBeInTheDocument();
        expect(sessionStorage.getItem(STORAGE)).toBe(JSON.stringify(op));
      });

      it('UI: parent PARTIALLY_REFUNDED with the specific refund PENDING stays unresolved', async () => {
        (paymentsApi.list as any).mockResolvedValue({
          ...mockPaymentsList,
          data: [{ ...mockPaymentsList.data[0], status: 'PARTIALLY_REFUNDED' }],
        });
        seed(op);
        render(<PaymentsView />);
        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();
        (paymentsApi.lookupIdempotency as any).mockResolvedValue({
          found: true,
          operationType: 'REFUND',
          status: 'PENDING',
          refund: { paymentId: 'pay-1', refundAmount: 1500, status: 'PENDING' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Check Outcome/i }));
        expect((await screen.findAllByText(/Refund is currently PENDING/i)).length).toBeGreaterThan(0);
        expect(screen.getByTestId('history-pending-recovery-banner')).toBeInTheDocument();
        expect(screen.queryByTestId('recovery-icon-success')).not.toBeInTheDocument();
        expect(sessionStorage.getItem(STORAGE)).not.toBeNull();
      });

      it('UI: refund found only via the refund sub-resource must match key, payment and amount', async () => {
        seed(op);
        render(<PaymentsView />);
        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();

        // Same key but wrong amount in the sub-resource: not accepted
        (paymentsApi.getRefunds as any).mockResolvedValue([
          { id: 'r1', paymentId: 'pay-1', amount: 111, status: 'SUCCEEDED', idempotencyKey: 'verify-ref-key-0001', reason: 'x', createdAt: '2026-01-01' },
        ]);
        fireEvent.click(screen.getByRole('button', { name: /Check Outcome/i }));
        expect((await screen.findAllByText(/does not match the pending refund \(amount/i)).length).toBeGreaterThan(0);
        expect(sessionStorage.getItem(STORAGE)).toBe(JSON.stringify(op));

        // Correct record: accepted
        (paymentsApi.getRefunds as any).mockResolvedValue([
          { id: 'r2', paymentId: 'pay-1', amount: 1500, status: 'SUCCEEDED', idempotencyKey: 'verify-ref-key-0001', reason: 'x', createdAt: '2026-01-01' },
        ]);
        fireEvent.click(screen.getByRole('button', { name: /Check Outcome/i }));
        await waitFor(() => expect(screen.queryByTestId('history-pending-recovery-banner')).not.toBeInTheDocument());
        expect(sessionStorage.getItem(STORAGE)).toBeNull();
      });
    });

    // ---------------------------------------------------------
    // FIX-7D: outcome styling
    // ---------------------------------------------------------
    describe('FIX-7D: success, pending, failure and unresolved states are visually distinct', () => {
      const check = async (status: string, extra: any = {}) => {
        seed(refOp('style-ref-key-000001'));
        render(<PaymentsView />);
        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();
        (paymentsApi.lookupIdempotency as any).mockResolvedValue({
          found: true,
          operationType: 'REFUND',
          status,
          refund: { paymentId: 'pay-1', refundAmount: 1500, status },
          ...extra,
        });
        fireEvent.click(screen.getByRole('button', { name: /Check Outcome/i }));
      };

      it('SUCCEEDED renders a success-toned notification with a success icon', async () => {
        await check('SUCCEEDED');
        const note = await screen.findByTestId('history-recovery-notification');
        expect(note).toHaveAttribute('data-tone', 'success');
        expect(note).toHaveAttribute('role', 'status');
        expect(screen.getByTestId('recovery-icon-success')).toBeInTheDocument();
        expect(screen.queryByTestId('recovery-icon-failure')).not.toBeInTheDocument();
        expect(note.textContent).toMatch(/Confirmed:.*confirmed on the server/i);
      });

      it('FAILED renders a failure-toned alert with a failure icon and never success text or icon', async () => {
        await check('FAILED');
        const note = await screen.findByTestId('history-recovery-notification');
        expect(note).toHaveAttribute('data-tone', 'failure');
        expect(note).toHaveAttribute('role', 'alert');
        expect(screen.getByTestId('recovery-icon-failure')).toBeInTheDocument();
        expect(screen.queryByTestId('recovery-icon-success')).not.toBeInTheDocument();
        expect(note.textContent).toMatch(/Failed:.*Refund was FAILED.*No refund was applied/i);
        expect(note.textContent).not.toMatch(/^Confirmed:|confirmed on the server!/);
        expect(note.className).toMatch(/rose/);
        expect(note.className).not.toMatch(/emerald/);
      });

      it('CANCELLED renders the same failure presentation', async () => {
        await check('CANCELLED');
        const note = await screen.findByTestId('history-recovery-notification');
        expect(note).toHaveAttribute('data-tone', 'failure');
        expect(screen.getByTestId('recovery-icon-failure')).toBeInTheDocument();
        expect(screen.queryByTestId('recovery-icon-success')).not.toBeInTheDocument();
        expect(note.textContent).toMatch(/Refund was CANCELLED/i);
      });

      it('PENDING keeps the amber pending banner (no success or failure notification)', async () => {
        await check('PENDING');
        expect((await screen.findAllByText(/Refund is currently PENDING/i)).length).toBeGreaterThan(0);
        expect(screen.getByTestId('history-pending-recovery-banner').className).toMatch(/amber/);
        expect(screen.queryByTestId('history-recovery-notification')).not.toBeInTheDocument();
        expect(screen.queryByTestId('recovery-icon-success')).not.toBeInTheDocument();
        expect(screen.queryByTestId('recovery-icon-failure')).not.toBeInTheDocument();
      });

      it('unresolved (found:false) keeps the locked amber banner with an unresolved message', async () => {
        seed(refOp('style-unres-key-00001'));
        render(<PaymentsView />);
        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Check Outcome/i }));
        expect((await screen.findAllByText(/does not prove it can no longer commit/i)).length).toBeGreaterThan(0);
        expect(screen.getByTestId('history-pending-recovery-banner').className).toMatch(/amber/);
        expect(screen.queryByTestId('recovery-icon-success')).not.toBeInTheDocument();
      });

      it('reload recovery of a CANCELLED refund shows a failure alert', async () => {
        seed(refOp('style-reload-key-0001'));
        (paymentsApi.lookupIdempotency as any).mockResolvedValue({
          found: true,
          operationType: 'REFUND',
          status: 'CANCELLED',
          refund: { paymentId: 'pay-1', refundAmount: 1500, status: 'CANCELLED' },
        });
        render(<PaymentsView />);
        const note = await screen.findByTestId('history-recovery-notification');
        expect(note).toHaveAttribute('data-tone', 'failure');
        expect(screen.queryByTestId('recovery-icon-success')).not.toBeInTheDocument();
      });
    });

    // ---------------------------------------------------------
    // FIX-7H: error classification
    // ---------------------------------------------------------
    describe('FIX-7H: error classification', () => {
      it('isAmbiguousPaymentError treats 408, 425, 429, 5xx, idempotency 409 and transport failures as ambiguous', () => {
        expect(isAmbiguousPaymentError(httpError(408))).toBe(true);
        expect(isAmbiguousPaymentError(httpError(425))).toBe(true);
        expect(isAmbiguousPaymentError(httpError(429))).toBe(true);
        expect(isAmbiguousPaymentError(httpError(500))).toBe(true);
        expect(isAmbiguousPaymentError(httpError(504))).toBe(true);
        expect(isAmbiguousPaymentError(httpError(409, "Idempotency key 'x' was already used with a different request payload"))).toBe(true);
        expect(isAmbiguousPaymentError(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))).toBe(true);
        expect(isAmbiguousPaymentError(Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' }))).toBe(true);
        expect(isAmbiguousPaymentError(new Error('Network Error'))).toBe(true);
        expect(isAmbiguousPaymentError(null)).toBe(true);
      });

      it('isAmbiguousPaymentError treats definitive 4xx rejections as non-ambiguous', () => {
        expect(isAmbiguousPaymentError(httpError(400))).toBe(false);
        expect(isAmbiguousPaymentError(httpError(403))).toBe(false);
        expect(isAmbiguousPaymentError(httpError(404))).toBe(false);
        expect(isAmbiguousPaymentError(httpError(409, 'Invoice changed'))).toBe(false);
      });

      it('collection: HTTP 408 leaves the operation pending and locked with its key retained', async () => {
        (paymentsApi.collect as any).mockRejectedValue(httpError(408, 'Request Timeout'));
        render(<PaymentsView />);
        fireEvent.change(await screen.findByPlaceholderText('0.00'), { target: { value: '5500' } });
        fireEvent.click(await screen.findByRole('button', { name: /Collect ₹5,500.00/i }));

        expect(await screen.findByText(/Payment Outcome Uncertain — Form Locked for Safety/i)).toBeInTheDocument();
        const stored = JSON.parse(sessionStorage.getItem(STORAGE)!);
        expect(stored.operationType).toBe('COLLECTION');
        expect(stored.idempotencyKey).toBe((paymentsApi.collect as any).mock.calls[0][1]);
      });

      it('collection: HTTP 429 leaves the operation pending and locked', async () => {
        (paymentsApi.collect as any).mockRejectedValue(httpError(429, 'Too Many Requests'));
        render(<PaymentsView />);
        fireEvent.change(await screen.findByPlaceholderText('0.00'), { target: { value: '5500' } });
        fireEvent.click(await screen.findByRole('button', { name: /Collect ₹5,500.00/i }));
        expect(await screen.findByText(/Payment Outcome Uncertain — Form Locked for Safety/i)).toBeInTheDocument();
        expect(sessionStorage.getItem(STORAGE)).not.toBeNull();
      });

      it('collection: a definitive 400 rejection clears the matching record and unlocks', async () => {
        (paymentsApi.collect as any).mockRejectedValue(httpError(400, 'Invalid payment'));
        render(<PaymentsView />);
        fireEvent.change(await screen.findByPlaceholderText('0.00'), { target: { value: '5500' } });
        fireEvent.click(await screen.findByRole('button', { name: /Collect ₹5,500.00/i }));
        await waitFor(() => expect(sessionStorage.getItem(STORAGE)).toBeNull());
        expect(screen.queryByText(/Payment Outcome Uncertain/i)).not.toBeInTheDocument();
      });

      it('refund: HTTP 408 on retry keeps the record and the original key', async () => {
        const op: any = refOp('retry-408-key-00001');
        seed(op);
        (paymentsApi.refund as any).mockRejectedValue(httpError(408, 'Request Timeout'));
        render(<PaymentsView />);
        fireEvent.click(await screen.findByRole('button', { name: /Retry with Same Key/i }));
        await waitFor(() => expect(paymentsApi.refund).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getAllByText(/outcome on the server is UNKNOWN/i).length).toBeGreaterThan(0));
        expect(sessionStorage.getItem(STORAGE)).toBe(JSON.stringify(op));
        expect((paymentsApi.refund as any).mock.calls[0][1].idempotencyKey).toBe('retry-408-key-00001');
      });

      it('reversal: HTTP 429 on retry keeps the record and the original key', async () => {
        const op: any = revOp('retry-429-key-00001');
        seed(op);
        (paymentsApi.reverse as any).mockRejectedValue(httpError(429, 'Too Many Requests'));
        render(<PaymentsView />);
        fireEvent.click(await screen.findByRole('button', { name: /Retry with Same Key/i }));
        await waitFor(() => expect(paymentsApi.reverse).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getAllByText(/outcome on the server is UNKNOWN/i).length).toBeGreaterThan(0));
        expect(sessionStorage.getItem(STORAGE)).toBe(JSON.stringify(op));
        expect((paymentsApi.reverse as any).mock.calls[0][1].idempotencyKey).toBe('retry-429-key-00001');
      });

      it('reversal outcome is never inferred from the payment status; only the exact key proves it', async () => {
        (paymentsApi.list as any).mockResolvedValue({
          ...mockPaymentsList,
          data: [{ ...mockPaymentsList.data[0], status: 'VOIDED' }],
        });
        const op: any = revOp('rev-nofallback-key-1');
        seed(op);
        render(<PaymentsView />);
        expect(await screen.findByTestId('history-pending-recovery-banner')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Check Outcome/i }));
        expect((await screen.findAllByText(/No reversal was recorded with this key yet/i)).length).toBeGreaterThan(0);
        expect(screen.getByTestId('history-pending-recovery-banner')).toBeInTheDocument();
        expect(sessionStorage.getItem(STORAGE)).toBe(JSON.stringify(op));
      });
    });
  });
});
