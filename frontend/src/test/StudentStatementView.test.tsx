import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { StudentStatementView } from '../components/StudentStatementView';
import { feeStatementApi, metaApi } from '../services/api';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    metaApi: {
      getAccessibleStudents: vi.fn(),
      getAcademicYears: vi.fn(),
    },
    feeStatementApi: {
      getStatement: vi.fn(),
    },
    onlinePaymentsApi: {
      createOrder: vi.fn(),
    },
  };
});

const mockStudents = [
  {
    id: 'stud-1',
    admissionNumber: 'ADM-001',
    firstName: 'Rahul',
    lastName: 'Sharma',
    grade: { name: 'Class 10' },
  },
];

const mockYears = [
  {
    id: 'ay-1',
    name: '2026-2027',
  },
];

const mockStatement = {
  student: {
    id: 'stud-1',
    admissionNumber: 'ADM-001',
    firstName: 'Rahul',
    lastName: 'Sharma',
  },
  academicYear: {
    id: 'ay-1',
    name: '2026-2027',
  },
  summary: {
    totalGrossAmount: 3000,
    totalDiscountAmount: 0,
    totalNetAmount: 3000,
    totalPaidAmount: 1500,
    totalRemainingAmount: 1500,
    statusBreakdown: {
      PAID: 1,
      DUE: 1,
      UPCOMING: 0,
      OVERDUE: 0,
    },
  },
  invoices: [
    {
      id: 'inv-paid-1',
      billingMonth: 1,
      monthName: 'April',
      dueDate: '2026-04-10T00:00:00.000Z',
      grossAmount: 1500,
      discountAmount: 0,
      netAmount: 1500,
      paidAmount: 1500,
      remainingBalance: 0,
      status: 'PAID' as const,
      items: [
        {
          id: 'item-1',
          feeHeadNameSnapshot: 'Tuition Fee',
          billingFrequencySnapshot: 'MONTHLY',
          grossAmount: 1500,
          discountAmount: 0,
          netAmount: 1500,
          paidAmount: 1500,
          remainingBalance: 0,
        },
      ],
    },
    {
      id: 'inv-due-2',
      billingMonth: 2,
      monthName: 'May',
      dueDate: '2026-05-10T00:00:00.000Z',
      grossAmount: 1500,
      discountAmount: 0,
      netAmount: 1500,
      paidAmount: 0,
      remainingBalance: 1500,
      status: 'DUE' as const,
      items: [
        {
          id: 'item-2',
          feeHeadNameSnapshot: 'Tuition Fee',
          billingFrequencySnapshot: 'MONTHLY',
          grossAmount: 1500,
          discountAmount: 0,
          netAmount: 1500,
          paidAmount: 0,
          remainingBalance: 1500,
        },
      ],
    },
  ],
};

describe('StudentStatementView Online Payment Action (Phase F)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(metaApi.getAccessibleStudents).mockResolvedValue(mockStudents as any);
    vi.mocked(metaApi.getAcademicYears).mockResolvedValue(mockYears as any);
    vi.mocked(feeStatementApi.getStatement).mockResolvedValue(mockStatement as any);
  });

  it('renders "Pay Online" action for unpaid (DUE) invoices, but not for PAID invoices', async () => {
    render(<StudentStatementView />);

    await waitFor(() => {
      expect(screen.getByText('Monthly Fee Obligation Schedule')).toBeInTheDocument();
    });

    // Invoices rendered
    expect(screen.getByText('April')).toBeInTheDocument();
    expect(screen.getByText('May')).toBeInTheDocument();

    // Only 1 Pay Online button in table (for May DUE invoice; April is PAID)
    const payOnlineButtons = screen.getAllByRole('button', { name: /Pay Online/i });
    expect(payOnlineButtons).toHaveLength(1);
  });

  it('opens OnlineCheckoutModal when "Pay Online" is clicked on a table row', async () => {
    render(<StudentStatementView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Pay Online/i })).toBeInTheDocument();
    });

    const payBtn = screen.getByRole('button', { name: /Pay Online/i });
    fireEvent.click(payBtn);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByText(/Pay Fee Online — May/i)).toBeInTheDocument();
      expect(screen.getByText(/Proceed to Razorpay Checkout/i)).toBeInTheDocument();
    });
  });

  it('allows launching OnlineCheckoutModal from inside the Line Items detail modal', async () => {
    render(<StudentStatementView />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Line Items/i })).toHaveLength(2);
    });

    // Click Line Items for May (the second invoice)
    const lineItemButtons = screen.getAllByRole('button', { name: /Line Items/i });
    fireEvent.click(lineItemButtons[1]);

    // Breakdown modal appears
    await waitFor(() => {
      expect(screen.getByText(/May Invoice Breakdown/i)).toBeInTheDocument();
    });

    // Pay Online button inside breakdown modal (second Pay Online button)
    const payOnlineButtons = screen.getAllByRole('button', { name: /Pay Online/i });
    expect(payOnlineButtons).toHaveLength(2);
    fireEvent.click(payOnlineButtons[1]);

    // OnlineCheckoutModal opens for May
    await waitFor(() => {
      expect(screen.getByText(/Pay Fee Online — May/i)).toBeInTheDocument();
    });
  });
});
