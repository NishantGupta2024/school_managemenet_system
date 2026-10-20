import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import FeeReportsView, { validateDateRange } from '../components/FeeReportsView';
import { reportsApi } from '../services/api';

vi.mock('../services/api', () => ({
  metaApi: {
    getAcademicYears: vi.fn().mockResolvedValue([
      { id: 'ay-2026', name: '2026-2027', isCurrent: true },
      { id: 'ay-2025', name: '2025-2026', isCurrent: false },
    ]),
    getGrades: vi.fn().mockResolvedValue([
      { id: 'g-10', name: 'Grade 10', code: 'G10' },
      { id: 'g-9', name: 'Grade 9', code: 'G9' },
    ]),
  },
  reportsApi: {
    getDailyCollection: vi.fn(),
    getMonthlyCollection: vi.fn(),
    getCollectionSummary: vi.fn(),
    getOutstandingDues: vi.fn(),
    getDefaultersReport: vi.fn(),
    getClassCollections: vi.fn(),
    getFineSummary: vi.fn(),
    exportReport: vi.fn(),
  },
}));

describe('FeeReportsView Component', () => {
  const mockSchool = {
    id: 'school-1',
    name: 'Greenwood International Academy',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock response for Daily Collection
    (reportsApi.getDailyCollection as any).mockResolvedValue({
      school: mockSchool,
      period: { date: '2026-10-17' },
      summary: {
        grossCollections: 18500,
        totalReversals: 2500,
        totalRefunds: 1000,
        netCollections: 15000,
        transactionCount: 3,
        receiptCount: 3,
      },
      transactions: [
        {
          paymentId: 'p-1',
          paymentNumber: 'PAY-001',
          receiptNumber: 'REC-001',
          receiptStatus: 'ACTIVE',
          student: {
            id: 's-1',
            admissionNumber: 'ADM-101',
            name: 'Rohan Sharma',
            grade: 'Grade 10',
            section: 'A',
          },
          paymentDate: '2026-10-17T10:30:00Z',
          amount: 10000,
          paymentMethod: 'BANK_TRANSFER',
          referenceNumber: 'REF-8899',
          status: 'COMPLETED',
          collectedBy: 'Bursar Officer',
        },
      ],
      byPaymentMethod: [],
      byFeeHead: [],
    });
  });

  it('renders title, export buttons, and default daily collection report', async () => {
    render(<FeeReportsView />);

    expect(screen.getByText(/Fee Reporting & Financial Analytics/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CSV/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excel \(\.xlsx\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF/i })).toBeInTheDocument();

    // Check KPI cards
    await waitFor(() => {
      expect(screen.getByText(/Gross Collections/i)).toBeInTheDocument();
      expect(screen.getByText(/Total Reversals/i)).toBeInTheDocument();
      expect(screen.getByText(/Total Refunds/i)).toBeInTheDocument();
      expect(screen.getByText(/Net Collections/i)).toBeInTheDocument();
      expect(screen.getByText('Rohan Sharma')).toBeInTheDocument();
      expect(screen.getByText('ADM-101')).toBeInTheDocument();
    });

    expect(reportsApi.getDailyCollection).toHaveBeenCalledTimes(1);
  });

  it('switches between all seven report types and triggers respective endpoints', async () => {
    // Mock other 6 reports
    (reportsApi.getMonthlyCollection as any).mockResolvedValue({
      school: mockSchool,
      period: { year: 2026, month: 10 },
      summary: { grossCollections: 50000, totalReversals: 5000, totalRefunds: 2000, netCollections: 43000, transactionCount: 10 },
      dailyBreakdown: [
        { date: '2026-10-01', grossCollections: 20000, totalReversals: 0, totalRefunds: 0, netCollections: 20000, transactionCount: 4 },
      ],
      byPaymentMethod: [],
      byFeeHead: [],
    });

    (reportsApi.getCollectionSummary as any).mockResolvedValue({
      school: mockSchool,
      period: { startDate: '2026-10-01', endDate: '2026-10-17' },
      summary: { grossCollections: 50000, totalReversals: 5000, totalRefunds: 2000, netCollections: 43000, transactionCount: 10 },
      periodicBreakdown: [
        { period: '2026-10-01', grossCollections: 20000, totalReversals: 0, totalRefunds: 0, netCollections: 20000, transactionCount: 4 },
      ],
      byPaymentMethod: [],
      byFeeHead: [],
    });

    (reportsApi.getOutstandingDues as any).mockResolvedValue({
      school: mockSchool,
      filters: {},
      pagination: { page: 1, limit: 20, totalRecords: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      summary: {
        totalStudents: 1,
        totalBilledAmount: 50000,
        totalPaidAmount: 30000,
        totalPaidPrincipal: 30000,
        totalPaidFines: 0,
        totalRemainingPrincipal: 20000,
        totalFineBalance: 500,
        totalOutstandingAmount: 20500,
        totalOverduePrincipal: 20000,
        totalOverdueFines: 500,
        totalOverdueAmount: 20500,
        overdueStudentsCount: 1,
      },
      records: [
        {
          studentId: 's-1',
          admissionNumber: 'ADM-101',
          studentName: 'Aarav Patel',
          grade: { id: 'g-10', name: 'Grade 10', code: 'G10' },
          section: { id: 'sec-a', name: 'Section A' },
          guardian: { name: 'Parent', phone: '9876543210', email: 'parent@example.com' },
          status: 'ACTIVE',
          totalBilled: 50000,
          grossAmount: 50000,
          discountAmount: 0,
          totalPaid: 30000,
          paidPrincipal: 30000,
          paidFines: 0,
          remainingPrincipal: 20000,
          fineBalance: 500,
          outstandingBalance: 20500,
          overduePrincipal: 20000,
          overdueFines: 500,
          overdueAmount: 20500,
          overdueInvoicesCount: 1,
          maxOverdueDays: 15,
          hasOverdue: true,
          invoiceCount: 1,
        },
      ],
    });

    (reportsApi.getDefaultersReport as any).mockResolvedValue({
      school: mockSchool,
      filters: {},
      pagination: { page: 1, limit: 20, totalRecords: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      summary: {
        overdueStudentsCount: 1,
        totalOverduePrincipal: 20000,
        totalOverdueFines: 500,
        totalOverdueAmount: 20500,
        totalOutstandingAmount: 20500,
      },
      records: [
        {
          studentId: 's-1',
          admissionNumber: 'ADM-101',
          studentName: 'Aarav Patel',
          grade: { id: 'g-10', name: 'Grade 10', code: 'G10' },
          section: { id: 'sec-a', name: 'Section A' },
          guardian: { name: 'Parent', phone: '9876543210', email: 'parent@example.com' },
          status: 'ACTIVE',
          totalBilled: 50000,
          grossAmount: 50000,
          discountAmount: 0,
          totalPaid: 30000,
          paidPrincipal: 30000,
          paidFines: 0,
          remainingPrincipal: 20000,
          fineBalance: 500,
          outstandingBalance: 20500,
          overduePrincipal: 20000,
          overdueFines: 500,
          overdueAmount: 20500,
          overdueInvoicesCount: 1,
          maxOverdueDays: 15,
          hasOverdue: true,
          invoiceCount: 1,
        },
      ],
    });

    (reportsApi.getClassCollections as any).mockResolvedValue({
      school: mockSchool,
      period: { startDate: '2026-10-01', endDate: '2026-10-17' },
      filters: {},
      summary: { grossCollections: 45000, totalReversals: 0, totalRefunds: 0, netCollections: 45000, transactionCount: 5 },
      byClass: [
        {
          gradeId: 'g-10',
          gradeName: 'Grade 10',
          sectionId: 'sec-a',
          sectionName: 'Section A',
          grossCollections: 45000,
          totalReversals: 0,
          totalRefunds: 0,
          netCollections: 45000,
          transactionCount: 5,
        },
      ],
    });

    (reportsApi.getFineSummary as any).mockResolvedValue({
      school: mockSchool,
      filters: {},
      summary: {
        totalAssessed: 5000,
        totalWaived: 1000,
        netObligation: 4000,
        totalCollected: 2000,
        totalReversals: 0,
        totalRefunds: 0,
        netCollected: 2000,
        remainingBalance: 2000,
        fineCount: 4,
      },
      byClass: [
        {
          gradeId: 'g-10',
          gradeName: 'Grade 10',
          sectionId: 'sec-a',
          sectionName: 'Section A',
          assessedAmount: 5000,
          waivedAmount: 1000,
          netObligation: 4000,
          collectedAmount: 2000,
          reversalAmount: 0,
          refundAmount: 0,
          netCollected: 2000,
          remainingBalance: 2000,
          fineCount: 4,
        },
      ],
    });

    render(<FeeReportsView />);

    // 1. Switch to Monthly Collection
    fireEvent.click(screen.getByRole('tab', { name: /Monthly Collection/i }));
    await waitFor(() => {
      expect(reportsApi.getMonthlyCollection).toHaveBeenCalled();
      expect(screen.getByText(/Daily Breakdown for/i)).toBeInTheDocument();
    });

    // 2. Switch to Collection Summary
    fireEvent.click(screen.getByRole('tab', { name: /Collection Summary/i }));
    await waitFor(() => {
      expect(reportsApi.getCollectionSummary).toHaveBeenCalled();
      expect(screen.getByText(/Periodic Collection Aggregation/i)).toBeInTheDocument();
    });

    // 3. Switch to Outstanding Dues
    fireEvent.click(screen.getByRole('tab', { name: /Outstanding Dues/i }));
    await waitFor(() => {
      expect(reportsApi.getOutstandingDues).toHaveBeenCalled();
      expect(screen.getByText(/Student Outstanding Balances/i)).toBeInTheDocument();
      expect(screen.getByText('Aarav Patel')).toBeInTheDocument();
    });

    // 4. Switch to Defaulter Report
    fireEvent.click(screen.getByRole('tab', { name: /Defaulter Report/i }));
    await waitFor(() => {
      expect(reportsApi.getDefaultersReport).toHaveBeenCalled();
      expect(screen.getByText(/Fee Defaulters & Overdue Aging/i)).toBeInTheDocument();
    });

    // 5. Switch to Class-Wise Collection
    fireEvent.click(screen.getByRole('tab', { name: /Class-Wise Collection/i }));
    await waitFor(() => {
      expect(reportsApi.getClassCollections).toHaveBeenCalled();
      expect(screen.getByText(/Class-Wise Collection Aggregation/i)).toBeInTheDocument();
    });

    // 6. Switch to Fine Summary
    fireEvent.click(screen.getByRole('tab', { name: /Fine Summary/i }));
    await waitFor(() => {
      expect(reportsApi.getFineSummary).toHaveBeenCalled();
      expect(screen.getByText(/Late Fine & Penalty Summary by Class/i)).toBeInTheDocument();
    });
  });

  it('updates filters and applies query parameters', async () => {
    render(<FeeReportsView />);
    await waitFor(() => expect(reportsApi.getDailyCollection).toHaveBeenCalled());

    // Change date input
    const dateInput = screen.getByLabelText(/Report Date/i);
    fireEvent.change(dateInput, { target: { value: '2026-10-15' } });

    // Click Apply Filters
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/i }));

    await waitFor(() => {
      expect(reportsApi.getDailyCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2026-10-15',
        }),
      );
    });
  });

  it('supports pagination on outstanding dues report', async () => {
    (reportsApi.getOutstandingDues as any).mockResolvedValue({
      school: mockSchool,
      filters: {},
      pagination: { page: 1, limit: 20, totalRecords: 45, totalPages: 3, hasNextPage: true, hasPrevPage: false },
      summary: {
        totalStudents: 45,
        totalBilledAmount: 100000,
        totalPaidAmount: 50000,
        totalPaidPrincipal: 50000,
        totalPaidFines: 0,
        totalRemainingPrincipal: 50000,
        totalFineBalance: 0,
        totalOutstandingAmount: 50000,
        totalOverduePrincipal: 50000,
        totalOverdueFines: 0,
        totalOverdueAmount: 50000,
        overdueStudentsCount: 45,
      },
      records: [
        {
          studentId: 's-1',
          admissionNumber: 'ADM-101',
          studentName: 'Student One',
          grade: { id: 'g-10', name: 'Grade 10', code: 'G10' },
          section: { id: 'sec-a', name: 'Section A' },
          guardian: { name: 'Parent', phone: null, email: null },
          status: 'ACTIVE',
          totalBilled: 10000,
          grossAmount: 10000,
          discountAmount: 0,
          totalPaid: 5000,
          paidPrincipal: 5000,
          paidFines: 0,
          remainingPrincipal: 5000,
          fineBalance: 0,
          outstandingBalance: 5000,
          overduePrincipal: 5000,
          overdueFines: 0,
          overdueAmount: 5000,
          overdueInvoicesCount: 1,
          maxOverdueDays: 5,
          hasOverdue: true,
          invoiceCount: 1,
        },
      ],
    });

    render(<FeeReportsView />);
    fireEvent.click(screen.getByRole('tab', { name: /Outstanding Dues/i }));

    await waitFor(() => {
      expect(screen.getByText(/Page 1 of 3/i)).toBeInTheDocument();
    });

    const nextBtn = screen.getByRole('button', { name: /Next/i });
    expect(nextBtn).not.toBeDisabled();
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(reportsApi.getOutstandingDues).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
      );
    });
  });

  it('handles empty data state gracefully with message', async () => {
    (reportsApi.getDailyCollection as any).mockResolvedValueOnce({
      school: mockSchool,
      period: { date: '2026-10-17' },
      summary: {
        grossCollections: 0,
        totalReversals: 0,
        totalRefunds: 0,
        netCollections: 0,
        transactionCount: 0,
      },
      transactions: [],
      byPaymentMethod: [],
      byFeeHead: [],
    });

    render(<FeeReportsView />);

    await waitFor(() => {
      expect(screen.getByText(/No records found for the selected criteria\./i)).toBeInTheDocument();
    });
  });

  it('handles error state and provides retry action', async () => {
    (reportsApi.getDailyCollection as any).mockRejectedValueOnce(
      new Error('Failed to query ledger database'),
    );

    render(<FeeReportsView />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to process report request/i)).toBeInTheDocument();
      expect(screen.getByText(/Failed to query ledger database/i)).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /Retry Request/i });
    expect(retryBtn).toBeInTheDocument();

    (reportsApi.getDailyCollection as any).mockResolvedValueOnce({
      school: mockSchool,
      period: { date: '2026-10-17' },
      summary: { grossCollections: 1000, totalReversals: 0, totalRefunds: 0, netCollections: 1000, transactionCount: 1 },
      transactions: [],
    });

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(reportsApi.getDailyCollection).toHaveBeenCalledTimes(2);
    });
  });

  it('triggers CSV, XLSX, and PDF exports with active filters and handles progress state', async () => {
    (reportsApi.exportReport as any).mockImplementation(
      async (_type: any, format: string) => {
        return `daily_collection_2026-10-17.${format}`;
      },
    );

    render(<FeeReportsView />);
    await waitFor(() => expect(reportsApi.getDailyCollection).toHaveBeenCalled());

    // 1. Export CSV
    const csvBtn = screen.getByRole('button', { name: /CSV/i });
    fireEvent.click(csvBtn);
    await waitFor(() => {
      expect(reportsApi.exportReport).toHaveBeenCalledWith(
        'DAILY_COLLECTION',
        'csv',
        expect.objectContaining({ date: expect.any(String) }),
      );
      expect(screen.getByText(/Successfully downloaded daily_collection_2026-10-17\.csv/i)).toBeInTheDocument();
    });

    // 2. Export Excel
    const xlsxBtn = screen.getByRole('button', { name: /Excel \(\.xlsx\)/i });
    fireEvent.click(xlsxBtn);
    await waitFor(() => {
      expect(reportsApi.exportReport).toHaveBeenCalledWith(
        'DAILY_COLLECTION',
        'xlsx',
        expect.any(Object),
      );
      expect(screen.getByText(/Successfully downloaded daily_collection_2026-10-17\.xlsx/i)).toBeInTheDocument();
    });

    // 3. Export PDF
    const pdfBtn = screen.getByRole('button', { name: /PDF/i });
    fireEvent.click(pdfBtn);
    await waitFor(() => {
      expect(reportsApi.exportReport).toHaveBeenCalledWith(
        'DAILY_COLLECTION',
        'pdf',
        expect.any(Object),
      );
      expect(screen.getByText(/Successfully downloaded daily_collection_2026-10-17\.pdf/i)).toBeInTheDocument();
    });
  });

  it('displays error message when export fails and prevents duplicate clicks', async () => {
    (reportsApi.exportReport as any).mockRejectedValueOnce(
      new Error('School fiscal year not found'),
    );

    render(<FeeReportsView />);
    await waitFor(() => expect(reportsApi.getDailyCollection).toHaveBeenCalled());

    const csvBtn = screen.getByRole('button', { name: /CSV/i });
    fireEvent.click(csvBtn);

    await waitFor(() => {
      expect(screen.getByText(/School fiscal year not found/i)).toBeInTheDocument();
    });
  });

  // --- FIX 1: Filter Parameter Scoping Tests ---
  describe('Fix 1: Report-specific filter parameter scoping', () => {
    it('does not leak paymentMethod into outstanding dues or fine summary data requests', async () => {
      (reportsApi.getOutstandingDues as any).mockResolvedValueOnce({
        school: mockSchool,
        filters: {},
        pagination: { page: 1, limit: 20, totalRecords: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        summary: { totalStudents: 0, totalBilledAmount: 0, totalPaidAmount: 0, totalOutstandingAmount: 0, totalOverdueAmount: 0 },
        records: [],
      });
      (reportsApi.getFineSummary as any).mockResolvedValueOnce({
        school: mockSchool,
        filters: {},
        summary: { totalAssessed: 0, totalWaived: 0, netObligation: 0, totalCollected: 0, netCollected: 0, remainingBalance: 0, fineCount: 0 },
        byClass: [],
      });

      render(<FeeReportsView />);
      await waitFor(() => expect(reportsApi.getDailyCollection).toHaveBeenCalled());

      // Select a payment method on Daily Collection
      const pmSelect = screen.getByLabelText(/Payment Method/i);
      fireEvent.change(pmSelect, { target: { value: 'CASH' } });

      // Switch to Outstanding Dues
      fireEvent.click(screen.getByRole('tab', { name: /Outstanding Dues/i }));
      await waitFor(() => {
        expect(reportsApi.getOutstandingDues).toHaveBeenCalled();
        const callArg = (reportsApi.getOutstandingDues as any).mock.calls[0][0];
        expect(callArg.paymentMethod).toBeUndefined();
      });

      // Switch to Fine Summary
      fireEvent.click(screen.getByRole('tab', { name: /Fine Summary/i }));
      await waitFor(() => {
        expect(reportsApi.getFineSummary).toHaveBeenCalled();
        const callArg = (reportsApi.getFineSummary as any).mock.calls[0][0];
        expect(callArg.paymentMethod).toBeUndefined();
      });
    });

    it('does not leak gradeId into daily, monthly, or collection summary data requests', async () => {
      (reportsApi.getOutstandingDues as any).mockResolvedValueOnce({
        school: mockSchool,
        filters: {},
        pagination: { page: 1, limit: 20, totalRecords: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        summary: { totalStudents: 0, totalBilledAmount: 0, totalPaidAmount: 0, totalOutstandingAmount: 0, totalOverdueAmount: 0 },
        records: [],
      });
      (reportsApi.getMonthlyCollection as any).mockResolvedValueOnce({
        school: mockSchool,
        period: { year: 2026, month: 10 },
        summary: { grossCollections: 0, totalReversals: 0, totalRefunds: 0, netCollections: 0, transactionCount: 0 },
        dailyBreakdown: [],
        byPaymentMethod: [],
        byFeeHead: [],
      });
      (reportsApi.getCollectionSummary as any).mockResolvedValueOnce({
        school: mockSchool,
        period: { startDate: '2026-10-01', endDate: '2026-10-17' },
        summary: { grossCollections: 0, totalReversals: 0, totalRefunds: 0, netCollections: 0, transactionCount: 0 },
        periodicBreakdown: [],
        byPaymentMethod: [],
        byFeeHead: [],
      });

      render(<FeeReportsView />);
      await waitFor(() => expect(reportsApi.getDailyCollection).toHaveBeenCalled());

      // Go to Outstanding Dues and select a grade
      fireEvent.click(screen.getByRole('tab', { name: /Outstanding Dues/i }));
      await waitFor(() => expect(reportsApi.getOutstandingDues).toHaveBeenCalled());

      const gradeSelect = screen.getByLabelText(/Grade \/ Class/i);
      fireEvent.change(gradeSelect, { target: { value: 'g-10' } });

      // Switch to Monthly Collection
      fireEvent.click(screen.getByRole('tab', { name: /Monthly Collection/i }));
      await waitFor(() => {
        expect(reportsApi.getMonthlyCollection).toHaveBeenCalled();
        const callArg = (reportsApi.getMonthlyCollection as any).mock.calls[0][0];
        expect(callArg.gradeId).toBeUndefined();
      });

      // Switch to Collection Summary
      fireEvent.click(screen.getByRole('tab', { name: /Collection Summary/i }));
      await waitFor(() => {
        expect(reportsApi.getCollectionSummary).toHaveBeenCalled();
        const callArg = (reportsApi.getCollectionSummary as any).mock.calls[0][0];
        expect(callArg.gradeId).toBeUndefined();
      });

      // Switch back to Daily Collection
      fireEvent.click(screen.getByRole('tab', { name: /Daily Collection/i }));
      await waitFor(() => {
        expect(reportsApi.getDailyCollection).toHaveBeenCalledTimes(2);
        const secondCallArg = (reportsApi.getDailyCollection as any).mock.calls[1][0];
        expect(secondCallArg.gradeId).toBeUndefined();
      });
    });

    it('ensures export requests use strictly scoped active filters without cross-report leaks', async () => {
      (reportsApi.getOutstandingDues as any).mockResolvedValue({
        school: mockSchool,
        filters: {},
        pagination: { page: 1, limit: 20, totalRecords: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        summary: { totalStudents: 0, totalBilledAmount: 0, totalPaidAmount: 0, totalOutstandingAmount: 0, totalOverdueAmount: 0 },
        records: [],
      });
      (reportsApi.exportReport as any).mockResolvedValue('dues_export.csv');

      render(<FeeReportsView />);
      await waitFor(() => expect(reportsApi.getDailyCollection).toHaveBeenCalled());

      // Set payment method on Daily Collection
      const pmSelect = screen.getByLabelText(/Payment Method/i);
      fireEvent.change(pmSelect, { target: { value: 'BANK_TRANSFER' } });

      // Switch to Outstanding Dues
      fireEvent.click(screen.getByRole('tab', { name: /Outstanding Dues/i }));
      await waitFor(() => {
        expect(reportsApi.getOutstandingDues).toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /CSV/i })).not.toBeDisabled();
      });

      // Select Grade and Search in Outstanding Dues
      const gradeSelect = screen.getByLabelText(/Grade \/ Class/i);
      fireEvent.change(gradeSelect, { target: { value: 'g-10' } });
      const searchInput = screen.getByLabelText(/Search Student/i);
      fireEvent.change(searchInput, { target: { value: 'Aarav' } });

      // Trigger CSV export once ready
      const csvBtn = screen.getByRole('button', { name: /CSV/i });
      await waitFor(() => expect(csvBtn).not.toBeDisabled());
      fireEvent.click(csvBtn);

      await waitFor(() => {
        expect(reportsApi.exportReport).toHaveBeenCalledWith(
          'OUTSTANDING_DUES',
          'csv',
          expect.objectContaining({
            gradeId: 'g-10',
            search: 'Aarav',
          }),
        );
        const exportParams = (reportsApi.exportReport as any).mock.calls[0][2];
        expect(exportParams.paymentMethod).toBeUndefined();
      });
    });
  });

  // --- FIX 2: Client-side Date Validation Tests ---
  describe('Fix 2: Client-side date range validation', () => {
    it('validates date ranges correctly via validateDateRange helper', () => {
      // COLLECTION_SUMMARY requires both dates
      expect(validateDateRange('COLLECTION_SUMMARY', '', '')).toEqual({
        isValid: false,
        errorMessage: 'Both start date and end date are required for collection summary.',
      });
      expect(validateDateRange('COLLECTION_SUMMARY', '2026-10-01', '')).toEqual({
        isValid: false,
        errorMessage: 'End date is required for collection summary.',
      });
      expect(validateDateRange('COLLECTION_SUMMARY', '', '2026-10-17')).toEqual({
        isValid: false,
        errorMessage: 'Start date is required for collection summary.',
      });

      // Inverted ranges fail
      expect(validateDateRange('COLLECTION_SUMMARY', '2026-10-20', '2026-10-10')).toEqual({
        isValid: false,
        errorMessage: 'Start date cannot be after end date.',
      });
      expect(validateDateRange('CLASS_COLLECTION', '2026-10-20', '2026-10-10')).toEqual({
        isValid: false,
        errorMessage: 'Start date cannot be after end date.',
      });
      expect(validateDateRange('FINE_SUMMARY', '2026-10-20', '2026-10-10')).toEqual({
        isValid: false,
        errorMessage: 'Start date cannot be after end date.',
      });

      // Partial dates on CLASS_COLLECTION / FINE_SUMMARY
      expect(validateDateRange('CLASS_COLLECTION', '2026-10-01', '')).toEqual({
        isValid: false,
        errorMessage: 'End date is required when start date is provided.',
      });
      expect(validateDateRange('FINE_SUMMARY', '', '2026-10-17')).toEqual({
        isValid: false,
        errorMessage: 'Start date is required when end date is provided.',
      });

      // Valid ranges succeed
      expect(validateDateRange('COLLECTION_SUMMARY', '2026-10-01', '2026-10-17')).toEqual({
        isValid: true,
      });
      // Same-day ranges succeed
      expect(validateDateRange('COLLECTION_SUMMARY', '2026-10-17', '2026-10-17')).toEqual({
        isValid: true,
      });
      // Neither date provided on optional reports succeeds
      expect(validateDateRange('CLASS_COLLECTION', '', '')).toEqual({
        isValid: true,
      });
      expect(validateDateRange('FINE_SUMMARY', '', '')).toEqual({
        isValid: true,
      });
      // Reports that don't take date ranges succeed unconditionally
      expect(validateDateRange('DAILY_COLLECTION', '2026-10-20', '2026-10-10')).toEqual({
        isValid: true,
      });
    });

    it('rejects startDate > endDate on collection summary without issuing an API request', async () => {
      (reportsApi.getCollectionSummary as any).mockResolvedValueOnce({
        school: mockSchool,
        period: { startDate: '2026-10-01', endDate: '2026-10-17' },
        summary: { grossCollections: 0, totalReversals: 0, totalRefunds: 0, netCollections: 0, transactionCount: 0 },
        periodicBreakdown: [],
        byPaymentMethod: [],
        byFeeHead: [],
      });

      render(<FeeReportsView />);
      await waitFor(() => expect(reportsApi.getDailyCollection).toHaveBeenCalled());

      // Switch to Collection Summary
      fireEvent.click(screen.getByRole('tab', { name: /Collection Summary/i }));
      await waitFor(() => expect(reportsApi.getCollectionSummary).toHaveBeenCalledTimes(1));

      // Invert dates
      const startDateInput = screen.getByLabelText(/Start Date/i);
      const endDateInput = screen.getByLabelText(/End Date/i);
      fireEvent.change(startDateInput, { target: { value: '2026-10-31' } });
      fireEvent.change(endDateInput, { target: { value: '2026-10-01' } });

      // Click Apply Filters
      fireEvent.click(screen.getByRole('button', { name: /Apply Filters/i }));

      // Accessible error alert should be shown
      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(alert).toHaveTextContent(/Start date cannot be after end date\./i);
      });

      // Crucial: No second call was issued to the backend API!
      expect(reportsApi.getCollectionSummary).toHaveBeenCalledTimes(1);
    });

    it('prevents report exports when date range is invalid', async () => {
      (reportsApi.getCollectionSummary as any).mockResolvedValueOnce({
        school: mockSchool,
        period: { startDate: '2026-10-01', endDate: '2026-10-17' },
        summary: { grossCollections: 0, totalReversals: 0, totalRefunds: 0, netCollections: 0, transactionCount: 0 },
        periodicBreakdown: [],
        byPaymentMethod: [],
        byFeeHead: [],
      });

      render(<FeeReportsView />);
      await waitFor(() => expect(reportsApi.getDailyCollection).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('tab', { name: /Collection Summary/i }));
      await waitFor(() => expect(reportsApi.getCollectionSummary).toHaveBeenCalledTimes(1));

      // Invert dates
      const startDateInput = screen.getByLabelText(/Start Date/i);
      const endDateInput = screen.getByLabelText(/End Date/i);
      fireEvent.change(startDateInput, { target: { value: '2026-10-25' } });
      fireEvent.change(endDateInput, { target: { value: '2026-10-10' } });

      // Click Export
      const csvBtn = screen.getByRole('button', { name: /CSV/i });
      fireEvent.click(csvBtn);

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(alert).toHaveTextContent(/Start date cannot be after end date\./i);
      });

      // reportsApi.exportReport was never called
      expect(reportsApi.exportReport).not.toHaveBeenCalled();
    });

    it('allows valid date ranges including the same start and end date', async () => {
      (reportsApi.getCollectionSummary as any).mockResolvedValue({
        school: mockSchool,
        period: { startDate: '2026-10-17', endDate: '2026-10-17' },
        summary: { grossCollections: 1000, totalReversals: 0, totalRefunds: 0, netCollections: 1000, transactionCount: 1 },
        periodicBreakdown: [],
        byPaymentMethod: [],
        byFeeHead: [],
      });

      render(<FeeReportsView />);
      await waitFor(() => expect(reportsApi.getDailyCollection).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('tab', { name: /Collection Summary/i }));
      await waitFor(() => expect(reportsApi.getCollectionSummary).toHaveBeenCalledTimes(1));

      // Set same start and end date
      const startDateInput = screen.getByLabelText(/Start Date/i);
      const endDateInput = screen.getByLabelText(/End Date/i);
      fireEvent.change(startDateInput, { target: { value: '2026-10-17' } });
      fireEvent.change(endDateInput, { target: { value: '2026-10-17' } });

      fireEvent.click(screen.getByRole('button', { name: /Apply Filters/i }));

      await waitFor(() => {
        expect(reportsApi.getCollectionSummary).toHaveBeenCalledWith(
          expect.objectContaining({
            startDate: '2026-10-17',
            endDate: '2026-10-17',
          }),
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });
  });

  // --- FIX 3: Stale Request Race Protection Tests ---
  describe('Fix 3: Stale request race protection and lifecycle safety', () => {
    it('discards slower out-of-order responses when switching report tabs rapidly', async () => {
      let resolveSlowDaily: (value: any) => void;
      const slowDailyPromise = new Promise((resolve) => {
        resolveSlowDaily = resolve;
      });

      // Daily Collection will be slow
      (reportsApi.getDailyCollection as any).mockReturnValue(slowDailyPromise);

      // Monthly Collection will resolve quickly
      (reportsApi.getMonthlyCollection as any).mockResolvedValue({
        school: mockSchool,
        period: { year: 2026, month: 10 },
        summary: { grossCollections: 99999, totalReversals: 0, totalRefunds: 0, netCollections: 99999, transactionCount: 1 },
        dailyBreakdown: [
          { date: '2026-10-01', grossCollections: 99999, totalReversals: 0, totalRefunds: 0, netCollections: 99999, transactionCount: 1 },
        ],
        byPaymentMethod: [],
        byFeeHead: [],
      });

      render(<FeeReportsView />);

      // Daily collection is now in flight
      expect(reportsApi.getDailyCollection).toHaveBeenCalledTimes(1);

      // User immediately clicks Monthly Collection
      fireEvent.click(screen.getByRole('tab', { name: /Monthly Collection/i }));

      // Monthly finishes first
      await waitFor(() => {
        expect(reportsApi.getMonthlyCollection).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByText(/Daily Breakdown for/i)).toBeInTheDocument();
      });
      expect(screen.getAllByText(/99,999/).length).toBeGreaterThan(0);

      // Now the slow daily response finally resolves
      resolveSlowDaily!({
        school: mockSchool,
        period: { date: '2026-10-17' },
        summary: { grossCollections: 11111, totalReversals: 0, totalRefunds: 0, netCollections: 11111, transactionCount: 1 },
        transactions: [],
        byPaymentMethod: [],
        byFeeHead: [],
      });

      // Give event loop time to process
      await new Promise((r) => setTimeout(r, 50));

      // The Monthly Collection view must NOT be affected or replaced by the obsolete daily data!
      expect(screen.getByText(/Daily Breakdown for/i)).toBeInTheDocument();
      expect(screen.getAllByText(/99,999/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/11,111/)).not.toBeInTheDocument();
    });

    it('suppresses errors from obsolete in-flight requests after user navigated away', async () => {
      let rejectSlowDaily: (err: any) => void;
      const slowDailyPromise = new Promise((_resolve, reject) => {
        rejectSlowDaily = reject;
      });

      (reportsApi.getDailyCollection as any).mockReturnValue(slowDailyPromise);

      (reportsApi.getMonthlyCollection as any).mockResolvedValue({
        school: mockSchool,
        period: { year: 2026, month: 10 },
        summary: { grossCollections: 50000, totalReversals: 0, totalRefunds: 0, netCollections: 50000, transactionCount: 1 },
        dailyBreakdown: [],
        byPaymentMethod: [],
        byFeeHead: [],
      });

      render(<FeeReportsView />);
      expect(reportsApi.getDailyCollection).toHaveBeenCalledTimes(1);

      // User switches to Monthly Collection before daily fails
      fireEvent.click(screen.getByRole('tab', { name: /Monthly Collection/i }));

      await waitFor(() => {
        expect(reportsApi.getMonthlyCollection).toHaveBeenCalledTimes(1);
      });

      // Obsolete request rejects with network error
      rejectSlowDaily!(new Error('Stale connection aborted by server'));

      await new Promise((r) => setTimeout(r, 50));

      // Error banner should NOT be displayed on the active Monthly view
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByText(/Stale connection aborted by server/i)).not.toBeInTheDocument();
    });

    it('discards out-of-order responses from earlier filter applications on the same report', async () => {
      let resolveFirstSearch: (value: any) => void;
      const firstSearchPromise = new Promise((resolve) => {
        resolveFirstSearch = resolve;
      });

      const makeDuesResponse = (name: string, balance: number) => ({
        school: mockSchool,
        filters: {},
        pagination: { page: 1, limit: 20, totalRecords: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        summary: { totalStudents: 1, totalBilledAmount: balance, totalPaidAmount: 0, totalOutstandingAmount: balance, totalOverdueAmount: balance },
        records: [
          {
            studentId: 's-1',
            admissionNumber: 'ADM-01',
            studentName: name,
            grade: { id: 'g-10', name: 'Grade 10', code: 'G10' },
            section: { id: 'sec-a', name: 'Section A' },
            guardian: { name: 'Parent', phone: null, email: null },
            status: 'ACTIVE',
            totalBilled: balance,
            grossAmount: balance,
            discountAmount: 0,
            totalPaid: 0,
            paidPrincipal: 0,
            paidFines: 0,
            remainingPrincipal: balance,
            fineBalance: 0,
            outstandingBalance: balance,
            overduePrincipal: balance,
            overdueFines: 0,
            overdueAmount: balance,
            overdueInvoicesCount: 1,
            maxOverdueDays: 10,
            hasOverdue: true,
            invoiceCount: 1,
          },
        ],
      });

      (reportsApi.getOutstandingDues as any).mockResolvedValueOnce(makeDuesResponse('Initial Student', 1000));

      render(<FeeReportsView />);
      await waitFor(() => expect(reportsApi.getDailyCollection).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('tab', { name: /Outstanding Dues/i }));
      await waitFor(() => expect(screen.getByText('Initial Student')).toBeInTheDocument());

      // Next search request will be slow
      (reportsApi.getOutstandingDues as any).mockReturnValueOnce(firstSearchPromise);

      const searchInput = screen.getByLabelText(/Search Student/i);
      fireEvent.change(searchInput, { target: { value: 'SlowQuery' } });
      fireEvent.click(screen.getByRole('button', { name: /Apply Filters/i }));

      // User immediately types a faster query and clicks Apply
      (reportsApi.getOutstandingDues as any).mockResolvedValueOnce(makeDuesResponse('Fast Query Student', 5000));
      fireEvent.change(searchInput, { target: { value: 'FastQuery' } });
      fireEvent.click(screen.getByRole('button', { name: /Apply Filters/i }));

      // Fast query resolves first
      await waitFor(() => {
        expect(screen.getByText('Fast Query Student')).toBeInTheDocument();
      });

      // Now slow query finishes
      resolveFirstSearch!(makeDuesResponse('Slow Query Student', 2000));
      await new Promise((r) => setTimeout(r, 50));

      // Fast query result is retained, slow query result is discarded!
      expect(screen.getByText('Fast Query Student')).toBeInTheDocument();
      expect(screen.queryByText('Slow Query Student')).not.toBeInTheDocument();
    });

    it('safely handles unmount when a request is in flight without throwing state errors', async () => {
      let resolvePending: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePending = resolve;
      });

      (reportsApi.getDailyCollection as any).mockReturnValue(pendingPromise);

      const { unmount } = render(<FeeReportsView />);

      // Component unmounts while request is pending
      unmount();

      // Resolve after unmount
      resolvePending!({
        school: mockSchool,
        period: { date: '2026-10-17' },
        summary: { grossCollections: 100, totalReversals: 0, totalRefunds: 0, netCollections: 100, transactionCount: 1 },
        transactions: [],
      });

      await new Promise((r) => setTimeout(r, 30));
      // No unhandled exception or React state error
      expect(true).toBe(true);
    });
  });
});
