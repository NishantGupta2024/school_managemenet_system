import { BadRequestException } from '@nestjs/common';
import {
  AllocationType,
  FeeHeadCategory,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReceiptStatus,
  RefundStatus,
  School,
  TenantStatus,
  UserRole,
} from '@prisma/client';
import { ReportsService } from './reports.service';
import { ReportConfigService } from './report-config.service';
import { ReportType } from './dto/report-config.dto';

describe('ReportsService & ReportConfigService — Financial Calculations & Presentation', () => {
  let reportsService: ReportsService;
  let reportConfigService: ReportConfigService;
  let mockPrisma: any;

  const sampleSchoolA: School = {
    id: '00000000-0000-0000-0000-000000000001',
    code: 'SCH001',
    name: 'Delhi Public School, R.K. Puram',
    address: 'Sector XII, R.K. Puram',
    city: 'New Delhi',
    state: 'Delhi',
    country: 'IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    status: TenantStatus.ACTIVE,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    defaultReceiptTemplateId: null,
  };

  const sampleSchoolB: School = {
    id: '00000000-0000-0000-0000-000000000002',
    code: 'SCH002',
    name: 'St. Xavier High School',
    address: 'Park Street',
    city: 'Kolkata',
    state: 'West Bengal',
    country: 'IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    status: TenantStatus.ACTIVE,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    defaultReceiptTemplateId: null,
  };

  beforeEach(() => {
    mockPrisma = {
      payment: {
        findMany: jest.fn(),
      },
      paymentReversal: {
        findMany: jest.fn(),
      },
      paymentRefund: {
        findMany: jest.fn(),
      },
      academicYear: {
        findFirst: jest.fn(),
      },
      student: {
        findMany: jest.fn(),
      },
      gradeClass: {
        findMany: jest.fn(),
      },
      assessedFine: {
        findMany: jest.fn(),
      },
    };

    reportConfigService = new ReportConfigService();
    reportsService = new ReportsService(mockPrisma, reportConfigService);
  });

  describe('1. Date Boundary Calculations & Timezone Handling', () => {
    it('calculates exact local day boundaries in UTC for Asia/Kolkata (UTC+05:30)', () => {
      const { startUtc, endUtc } = reportsService.getLocalDayBoundariesUtc(
        '2026-10-17',
        'Asia/Kolkata',
      );

      // Start of 2026-10-17 in IST is 2026-10-16 18:30:00 UTC
      expect(startUtc.toISOString()).toBe('2026-10-16T18:30:00.000Z');
      // End of 2026-10-17 in IST is 2026-10-17 18:29:59.999 UTC
      expect(endUtc.toISOString()).toBe('2026-10-17T18:29:59.999Z');
    });

    it('calculates exact local month boundaries in UTC for February in non-leap year (2025)', () => {
      const { startUtc, endUtc, daysInMonth } =
        reportsService.getLocalMonthBoundariesUtc(2025, 2, 'Asia/Kolkata');

      expect(daysInMonth).toBe(28);
      expect(startUtc.toISOString()).toBe('2025-01-31T18:30:00.000Z');
      expect(endUtc.toISOString()).toBe('2025-02-28T18:29:59.999Z');
    });

    it('calculates exact local month boundaries in UTC for February in leap year (2024)', () => {
      const { startUtc, endUtc, daysInMonth } =
        reportsService.getLocalMonthBoundariesUtc(2024, 2, 'Asia/Kolkata');

      expect(daysInMonth).toBe(29);
      expect(startUtc.toISOString()).toBe('2024-01-31T18:30:00.000Z');
      expect(endUtc.toISOString()).toBe('2024-02-29T18:29:59.999Z');
    });

    it('throws BadRequestException on malformed date string', () => {
      expect(() =>
        reportsService.getLocalDayBoundariesUtc('not-a-date', 'Asia/Kolkata'),
      ).toThrow(BadRequestException);

      expect(() =>
        reportsService.getLocalDayBoundariesUtc('2026-13-45', 'Asia/Kolkata'),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException on invalid month number', () => {
      expect(() =>
        reportsService.getLocalMonthBoundariesUtc(2026, 13, 'Asia/Kolkata'),
      ).toThrow(BadRequestException);

      expect(() =>
        reportsService.getLocalMonthBoundariesUtc(2026, 0, 'Asia/Kolkata'),
      ).toThrow(BadRequestException);
    });
  });

  describe('2. Financial Calculations & Net Collection Invariants', () => {
    it('correctly calculates Gross, Reversals, Succeeded Refunds, and Net Collections', async () => {
      // Mock payments: ₹10,000 cash and ₹15,000 UPI
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          paymentNumber: 'PAY-001',
          paymentDate: new Date('2026-10-17T05:00:00Z'),
          amount: new Prisma.Decimal('10000.00'),
          paymentMethod: PaymentMethod.CASH,
          status: PaymentStatus.COMPLETED,
          referenceNumber: null,
          receipt: { receiptNumber: 'RCT-001', status: ReceiptStatus.ACTIVE },
          student: {
            id: 'stud-1',
            admissionNumber: 'ADM-101',
            firstName: 'Aarav',
            lastName: 'Sharma',
            grade: { name: 'Grade 5' },
            section: { name: 'A' },
          },
          collectedByUser: { name: 'Cashier 1' },
          allocations: [
            {
              allocationType: AllocationType.PRINCIPAL,
              allocatedAmount: new Prisma.Decimal('8000.00'),
              invoiceItem: {
                feeHeadId: 'fh-tuition',
                feeHeadNameSnapshot: 'Tuition Fee',
                feeHead: { category: FeeHeadCategory.ACADEMIC },
              },
            },
            {
              allocationType: AllocationType.FINE,
              allocatedAmount: new Prisma.Decimal('2000.00'),
            },
          ],
        },
        {
          id: 'pay-2',
          paymentNumber: 'PAY-002',
          paymentDate: new Date('2026-10-17T06:00:00Z'),
          amount: new Prisma.Decimal('15000.00'),
          paymentMethod: PaymentMethod.UPI,
          status: PaymentStatus.COMPLETED,
          referenceNumber: 'UPI-123456',
          receipt: { receiptNumber: 'RCT-002', status: ReceiptStatus.ACTIVE },
          student: {
            id: 'stud-2',
            admissionNumber: 'ADM-102',
            firstName: 'Diya',
            lastName: 'Patel',
            grade: { name: 'Grade 6' },
            section: { name: 'B' },
          },
          collectedByUser: { name: 'Cashier 2' },
          allocations: [
            {
              allocationType: AllocationType.PRINCIPAL,
              allocatedAmount: new Prisma.Decimal('15000.00'),
              invoiceItem: {
                feeHeadId: 'fh-tuition',
                feeHeadNameSnapshot: 'Tuition Fee',
                feeHead: { category: FeeHeadCategory.ACADEMIC },
              },
            },
          ],
        },
      ]);

      // Mock reversal: ₹3,000 on pay-1
      mockPrisma.paymentReversal.findMany.mockResolvedValue([
        {
          id: 'rev-1',
          createdAt: new Date('2026-10-17T08:00:00Z'),
          totalAmount: new Prisma.Decimal('3000.00'),
          payment: {
            id: 'pay-1',
            paymentNumber: 'PAY-001',
            paymentMethod: PaymentMethod.CASH,
            academicYearId: 'ay-2026',
          },
          allocations: [
            {
              allocationType: AllocationType.REVERSAL,
              allocatedAmount: new Prisma.Decimal('3000.00'),
              reversalOf: {
                allocationType: AllocationType.PRINCIPAL,
                invoiceItem: {
                  feeHeadId: 'fh-tuition',
                  feeHeadNameSnapshot: 'Tuition Fee',
                  feeHead: { category: FeeHeadCategory.ACADEMIC },
                },
              },
            },
          ],
        },
      ]);

      // Mock succeeded refund: ₹2,000 on pay-2
      mockPrisma.paymentRefund.findMany.mockResolvedValue([
        {
          id: 'ref-1',
          refundAmount: new Prisma.Decimal('2000.00'),
          processedAt: new Date('2026-10-17T09:00:00Z'),
          status: RefundStatus.SUCCEEDED,
          payment: {
            id: 'pay-2',
            paymentNumber: 'PAY-002',
            paymentMethod: PaymentMethod.UPI,
            academicYearId: 'ay-2026',
          },
          allocations: [
            {
              amount: new Prisma.Decimal('2000.00'),
              originalAllocation: {
                allocationType: AllocationType.PRINCIPAL,
                invoiceItem: {
                  feeHeadId: 'fh-tuition',
                  feeHeadNameSnapshot: 'Tuition Fee',
                  feeHead: { category: FeeHeadCategory.ACADEMIC },
                },
              },
            },
          ],
        },
      ]);

      const result = await reportsService.getDailyCollection(sampleSchoolA, {
        date: '2026-10-17',
      });

      // Total Gross: 10,000 + 15,000 = 25,000
      expect(result.summary.grossCollections).toBe(25000);
      // Total Reversals: 3,000
      expect(result.summary.totalReversals).toBe(3000);
      // Total Refunds: 2,000
      expect(result.summary.totalRefunds).toBe(2000);
      // Net Collections: 25,000 - 3,000 - 2,000 = 20,000
      expect(result.summary.netCollections).toBe(20000);
      expect(result.summary.receiptCount).toBe(2);
      expect(result.summary.cancelledReceiptCount).toBe(0);

      // Verify deterministic sorting: CASH before UPI
      expect(result.byPaymentMethod[0].method).toBe(PaymentMethod.CASH);
      expect(result.byPaymentMethod[1].method).toBe(PaymentMethod.UPI);

      // Payment method breakdowns
      const cashMethod = result.byPaymentMethod.find((m) => m.method === PaymentMethod.CASH);
      expect(cashMethod).toBeDefined();
      expect(cashMethod?.grossAmount).toBe(10000);
      expect(cashMethod?.reversals).toBe(3000);
      expect(cashMethod?.refunds).toBe(0);
      expect(cashMethod?.netAmount).toBe(7000);

      const upiMethod = result.byPaymentMethod.find((m) => m.method === PaymentMethod.UPI);
      expect(upiMethod).toBeDefined();
      expect(upiMethod?.grossAmount).toBe(15000);
      expect(upiMethod?.reversals).toBe(0);
      expect(upiMethod?.refunds).toBe(2000);
      expect(upiMethod?.netAmount).toBe(13000);

      // Fee head breakdowns
      const tuitionHead = result.byFeeHead.find((h) => h.feeHeadId === 'fh-tuition');
      expect(tuitionHead).toBeDefined();
      // Gross Tuition: 8,000 + 15,000 = 23,000; Reversal: 3,000; Refund: 2,000; Net: 18,000
      expect(tuitionHead?.grossAmount).toBe(23000);
      expect(tuitionHead?.reversals).toBe(3000);
      expect(tuitionHead?.refunds).toBe(2000);
      expect(tuitionHead?.netAmount).toBe(18000);

      const fineHead = result.byFeeHead.find((h) => h.feeHeadId === 'LATE_FINE');
      expect(fineHead).toBeDefined();
      expect(fineHead?.grossAmount).toBe(2000);
      expect(fineHead?.netAmount).toBe(2000);
    });

    it('strictly excludes pending, failed, and cancelled refunds from deductions', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          paymentNumber: 'PAY-001',
          paymentDate: new Date('2026-10-17T05:00:00Z'),
          amount: new Prisma.Decimal('10000.00'),
          paymentMethod: PaymentMethod.CASH,
          status: PaymentStatus.COMPLETED,
          allocations: [],
          student: { firstName: 'Test', lastName: 'User' },
        },
      ]);

      mockPrisma.paymentReversal.findMany.mockResolvedValue([]);

      // In the database query, ReportsService filters by status: RefundStatus.SUCCEEDED
      mockPrisma.paymentRefund.findMany.mockResolvedValue([]);

      const result = await reportsService.getDailyCollection(sampleSchoolA, {
        date: '2026-10-17',
      });

      // Verification that query contains status: RefundStatus.SUCCEEDED
      expect(mockPrisma.paymentRefund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: RefundStatus.SUCCEEDED,
          }),
        }),
      );

      expect(result.summary.totalRefunds).toBe(0);
      expect(result.summary.netCollections).toBe(10000);
    });

    it('correctly uses refundDate fallback when processedAt is null on SUCCEEDED refund', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          paymentNumber: 'PAY-001',
          paymentDate: new Date('2026-10-17T05:00:00Z'),
          amount: new Prisma.Decimal('5000.00'),
          paymentMethod: PaymentMethod.CASH,
          status: PaymentStatus.COMPLETED,
          allocations: [],
          student: { firstName: 'Test', lastName: 'User' },
        },
      ]);
      mockPrisma.paymentReversal.findMany.mockResolvedValue([]);

      // Refund with processedAt = null, falling back to refundDate
      mockPrisma.paymentRefund.findMany.mockResolvedValue([
        {
          id: 'ref-null-processed',
          refundAmount: new Prisma.Decimal('1500.00'),
          processedAt: null,
          refundDate: new Date('2026-10-17T06:00:00Z'),
          status: RefundStatus.SUCCEEDED,
          payment: {
            id: 'pay-1',
            paymentNumber: 'PAY-001',
            paymentMethod: PaymentMethod.CASH,
            academicYearId: 'ay-2026',
          },
          allocations: [],
        },
      ]);

      const result = await reportsService.getDailyCollection(sampleSchoolA, {
        date: '2026-10-17',
      });

      expect(mockPrisma.paymentRefund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: RefundStatus.SUCCEEDED,
            OR: expect.arrayContaining([
              expect.objectContaining({ processedAt: expect.any(Object) }),
              expect.objectContaining({ processedAt: null, refundDate: expect.any(Object) }),
            ]),
          }),
        }),
      );

      expect(result.summary.totalRefunds).toBe(1500);
      expect(result.summary.netCollections).toBe(3500);
    });

    it('distinguishes active receipts from cancelled receipts in summary metrics', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          paymentNumber: 'PAY-001',
          paymentDate: new Date('2026-10-17T05:00:00Z'),
          amount: new Prisma.Decimal('1000.00'),
          paymentMethod: PaymentMethod.CASH,
          status: PaymentStatus.COMPLETED,
          receipt: { receiptNumber: 'RCT-001', status: ReceiptStatus.ACTIVE },
          allocations: [],
          student: { firstName: 'Active', lastName: 'Student' },
        },
        {
          id: 'pay-2',
          paymentNumber: 'PAY-002',
          paymentDate: new Date('2026-10-17T06:00:00Z'),
          amount: new Prisma.Decimal('2000.00'),
          paymentMethod: PaymentMethod.CASH,
          status: PaymentStatus.VOIDED,
          receipt: { receiptNumber: 'RCT-002', status: ReceiptStatus.CANCELLED },
          allocations: [],
          student: { firstName: 'Voided', lastName: 'Student' },
        },
        {
          id: 'pay-3',
          paymentNumber: 'PAY-003',
          paymentDate: new Date('2026-10-17T07:00:00Z'),
          amount: new Prisma.Decimal('3000.00'),
          paymentMethod: PaymentMethod.CASH,
          status: PaymentStatus.COMPLETED,
          receipt: null,
          allocations: [],
          student: { firstName: 'NoReceipt', lastName: 'Student' },
        },
      ]);
      mockPrisma.paymentReversal.findMany.mockResolvedValue([]);
      mockPrisma.paymentRefund.findMany.mockResolvedValue([]);

      const result = await reportsService.getDailyCollection(sampleSchoolA, {
        date: '2026-10-17',
      });

      expect(result.summary.transactionCount).toBe(3);
      expect(result.summary.receiptCount).toBe(1);
      expect(result.summary.cancelledReceiptCount).toBe(1);
      expect(result.transactions[0].receiptStatus).toBe(ReceiptStatus.ACTIVE);
      expect(result.transactions[1].receiptStatus).toBe(ReceiptStatus.CANCELLED);
      expect(result.transactions[2].receiptStatus).toBeNull();
    });

    it('returns zeroes and empty lists when no records exist for the date', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.paymentReversal.findMany.mockResolvedValue([]);
      mockPrisma.paymentRefund.findMany.mockResolvedValue([]);

      const result = await reportsService.getDailyCollection(sampleSchoolA, {
        date: '2026-10-17',
      });

      expect(result.summary.grossCollections).toBe(0);
      expect(result.summary.totalReversals).toBe(0);
      expect(result.summary.totalRefunds).toBe(0);
      expect(result.summary.netCollections).toBe(0);
      expect(result.summary.transactionCount).toBe(0);
      expect(result.byPaymentMethod).toEqual([]);
      expect(result.byFeeHead).toEqual([]);
      expect(result.transactions).toEqual([]);
    });

    it('rejects collection summary if startDate is after endDate', async () => {
      await expect(
        reportsService.getCollectionSummary(sampleSchoolA, {
          startDate: '2026-10-20',
          endDate: '2026-10-10',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects collection summary if date range exceeds 366 days', async () => {
      await expect(
        reportsService.getCollectionSummary(sampleSchoolA, {
          startDate: '2025-01-01',
          endDate: '2026-02-01', // > 366 days
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Multi-Tenant Scoping & Isolation', () => {
    it('enforces schoolId on every database query', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.paymentReversal.findMany.mockResolvedValue([]);
      mockPrisma.paymentRefund.findMany.mockResolvedValue([]);

      await reportsService.getDailyCollection(sampleSchoolA, {
        date: '2026-10-17',
      });

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ schoolId: sampleSchoolA.id }),
        }),
      );

      expect(mockPrisma.paymentReversal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ schoolId: sampleSchoolA.id }),
        }),
      );

      expect(mockPrisma.paymentRefund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ schoolId: sampleSchoolA.id }),
        }),
      );
    });

    it('does not leak School B tenant ID into School A queries', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.paymentReversal.findMany.mockResolvedValue([]);
      mockPrisma.paymentRefund.findMany.mockResolvedValue([]);

      await reportsService.getDailyCollection(sampleSchoolB, {
        date: '2026-10-17',
      });

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ schoolId: sampleSchoolB.id }),
        }),
      );
    });
  });

  describe('4. Report Presentation Configuration Defaults', () => {
    it('generates valid default configuration dynamically using School profile', () => {
      const config = reportConfigService.getReportConfig(
        sampleSchoolA,
        ReportType.DAILY_COLLECTION,
      );

      expect(config.reportType).toBe(ReportType.DAILY_COLLECTION);
      expect(config.branding.schoolName).toBe('Delhi Public School, R.K. Puram');
      expect(config.branding.headerAddress).toContain('Sector XII, R.K. Puram, New Delhi, Delhi, IN');
      expect(config.display.currencyCode).toBe('INR');
      expect(config.display.currencySymbol).toBe('₹');
      expect(config.display.timeZone).toBe('Asia/Kolkata');
      expect(config.styling.orientation).toBe('PORTRAIT');
      expect(config.table.columns.length).toBeGreaterThan(0);
      expect(config.table.columns.map((c) => c.key)).toContain('receiptNumber');
      expect(config.table.columns.map((c) => c.key)).toContain('amount');
    });

    it('provides landscape orientation for COLLECTION_SUMMARY by default', () => {
      const config = reportConfigService.getReportConfig(
        sampleSchoolA,
        ReportType.COLLECTION_SUMMARY,
      );

      expect(config.styling.orientation).toBe('LANDSCAPE');
    });

    it('provides landscape orientation for OUTSTANDING_DUES, CLASS_COLLECTION, FINE_SUMMARY, and DEFAULTER_REPORT', () => {
      const configDues = reportConfigService.getReportConfig(
        sampleSchoolA,
        ReportType.OUTSTANDING_DUES,
      );
      const configClass = reportConfigService.getReportConfig(
        sampleSchoolA,
        ReportType.CLASS_COLLECTION,
      );
      const configFines = reportConfigService.getReportConfig(
        sampleSchoolA,
        ReportType.FINE_SUMMARY,
      );
      const configDefaulters = reportConfigService.getReportConfig(
        sampleSchoolA,
        ReportType.DEFAULTER_REPORT,
      );

      expect(configDues.styling.orientation).toBe('LANDSCAPE');
      expect(configClass.styling.orientation).toBe('LANDSCAPE');
      expect(configFines.styling.orientation).toBe('LANDSCAPE');
      expect(configDefaulters.styling.orientation).toBe('LANDSCAPE');
      expect(configDues.display.visibleSummaryCards).toContain('OUTSTANDING_BALANCE');
      expect(configClass.display.visibleSummaryCards).toContain('GROSS_COLLECTIONS');
      expect(configFines.display.visibleSummaryCards).toContain('TOTAL_ASSESSED');
      expect(configDefaulters.display.visibleSummaryCards).toContain('OVERDUE_AMOUNT');
    });

    it('returns all seven report configurations on getAllReportConfigs', () => {
      const allConfigs = reportConfigService.getAllReportConfigs(sampleSchoolA);
      expect(Object.keys(allConfigs)).toEqual(
        expect.arrayContaining([
          ReportType.DAILY_COLLECTION,
          ReportType.MONTHLY_COLLECTION,
          ReportType.COLLECTION_SUMMARY,
          ReportType.OUTSTANDING_DUES,
          ReportType.CLASS_COLLECTION,
          ReportType.FINE_SUMMARY,
          ReportType.DEFAULTER_REPORT,
        ]),
      );
    });

    it('throws BadRequestException on unsupported report type in configuration', () => {
      expect(() =>
        reportConfigService.getReportConfig(sampleSchoolA, 'UNSUPPORTED_TYPE'),
      ).toThrow(BadRequestException);
    });
  });

  describe('5. Outstanding Dues & Defaulters Calculations', () => {
    const mockAcademicYear = {
      id: 'ay-2026-0001',
      schoolId: sampleSchoolA.id,
      name: '2026-2027',
      isCurrent: true,
      startDate: new Date('2026-04-01T00:00:00Z'),
      endDate: new Date('2027-03-31T23:59:59Z'),
    };

    it('correctly calculates balances for unpaid, partially paid, and fully paid students', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(mockAcademicYear);

      const pastDueDate = new Date('2026-05-10T00:00:00Z');

      const mockStudents = [
        {
          id: 'student-unpaid',
          admissionNumber: 'ADM-001',
          rollNumber: '1',
          firstName: 'Alice',
          lastName: 'Unpaid',
          gradeId: 'grade-10',
          sectionId: 'sec-a',
          grade: { id: 'grade-10', name: 'Grade 10', code: 'G10' },
          section: { id: 'sec-a', name: 'A' },
          status: 'ACTIVE',
          invoices: [
            {
              id: 'inv-1',
              grossAmount: new Prisma.Decimal(1000),
              discountAmount: new Prisma.Decimal(0),
              netAmount: new Prisma.Decimal(1000),
              dueDate: pastDueDate,
              paymentAllocations: [],
              assessedFines: [],
            },
          ],
        },
        {
          id: 'student-partial',
          admissionNumber: 'ADM-002',
          rollNumber: '2',
          firstName: 'Bob',
          lastName: 'Partial',
          gradeId: 'grade-10',
          sectionId: 'sec-a',
          grade: { id: 'grade-10', name: 'Grade 10', code: 'G10' },
          section: { id: 'sec-a', name: 'A' },
          status: 'ACTIVE',
          invoices: [
            {
              id: 'inv-2',
              grossAmount: new Prisma.Decimal(2000),
              discountAmount: new Prisma.Decimal(0),
              netAmount: new Prisma.Decimal(2000),
              dueDate: pastDueDate,
              paymentAllocations: [
                {
                  invoiceItemId: 'item-2',
                  allocationType: AllocationType.PRINCIPAL,
                  allocatedAmount: new Prisma.Decimal(600),
                  refundAllocations: [],
                },
              ],
              assessedFines: [],
            },
          ],
        },
        {
          id: 'student-paid',
          admissionNumber: 'ADM-003',
          rollNumber: '3',
          firstName: 'Charlie',
          lastName: 'Paid',
          gradeId: 'grade-10',
          sectionId: 'sec-a',
          grade: { id: 'grade-10', name: 'Grade 10', code: 'G10' },
          section: { id: 'sec-a', name: 'A' },
          status: 'ACTIVE',
          invoices: [
            {
              id: 'inv-3',
              grossAmount: new Prisma.Decimal(1500),
              discountAmount: new Prisma.Decimal(0),
              netAmount: new Prisma.Decimal(1500),
              dueDate: pastDueDate,
              paymentAllocations: [
                {
                  invoiceItemId: 'item-3',
                  allocationType: AllocationType.PRINCIPAL,
                  allocatedAmount: new Prisma.Decimal(1500),
                  refundAllocations: [],
                },
              ],
              assessedFines: [],
            },
          ],
        },
      ];

      mockPrisma.student.findMany.mockResolvedValue(mockStudents);

      const result = await reportsService.getOutstandingDues(sampleSchoolA, {
        page: 1,
        limit: 10,
      });

      expect(result.summary.totalStudents).toBe(3);
      expect(result.summary.totalBilledAmount).toBe(4500); // 1000 + 2000 + 1500
      expect(result.summary.totalPaidAmount).toBe(2100); // 0 + 600 + 1500
      expect(result.summary.totalOutstandingAmount).toBe(2400); // 1000 + 1400 + 0
      expect(result.summary.overdueStudentsCount).toBe(2);

      const alice = result.records.find((r) => r.studentId === 'student-unpaid');
      expect(alice?.outstandingBalance).toBe(1000);
      expect(alice?.totalPaid).toBe(0);
      expect(alice?.overdueAmount).toBe(1000);
      expect(alice?.hasOverdue).toBe(true);

      const bob = result.records.find((r) => r.studentId === 'student-partial');
      expect(bob?.outstandingBalance).toBe(1400);
      expect(bob?.totalPaid).toBe(600);
      expect(bob?.overdueAmount).toBe(1400);

      const charlie = result.records.find((r) => r.studentId === 'student-paid');
      expect(charlie?.outstandingBalance).toBe(0);
      expect(charlie?.totalPaid).toBe(1500);
      expect(charlie?.hasOverdue).toBe(false);
    });

    it('accounts for assessed fines, fine waivers, and fine payments in outstanding balance', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(mockAcademicYear);

      mockPrisma.student.findMany.mockResolvedValue([
        {
          id: 'student-fined',
          admissionNumber: 'ADM-004',
          firstName: 'David',
          lastName: 'Fined',
          gradeId: 'grade-10',
          sectionId: 'sec-a',
          grade: { id: 'grade-10', name: 'Grade 10', code: 'G10' },
          section: { id: 'sec-a', name: 'A' },
          status: 'ACTIVE',
          invoices: [
            {
              id: 'inv-4',
              grossAmount: new Prisma.Decimal(1000),
              discountAmount: new Prisma.Decimal(0),
              netAmount: new Prisma.Decimal(1000),
              dueDate: new Date('2026-05-10T00:00:00Z'),
              paymentAllocations: [],
              assessedFines: [
                {
                  id: 'fine-1',
                  assessedAmount: new Prisma.Decimal(200),
                  waivers: [
                    { id: 'w-1', waivedAmount: new Prisma.Decimal(50) },
                  ],
                  allocations: [
                    {
                      allocationType: AllocationType.FINE,
                      allocatedAmount: new Prisma.Decimal(30),
                      refundAllocations: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]);

      const result = await reportsService.getOutstandingDues(sampleSchoolA, {});
      const record = result.records[0];

      // Principal: 1000 billed, 0 paid -> remaining 1000
      // Fine: 200 assessed - 50 waived - 30 paid -> remaining fine 120
      // Total Outstanding: 1000 + 120 = 1120
      // Fine Balance: 120
      // Total Paid: 30
      expect(record.totalBilled).toBe(1000);
      expect(record.fineBalance).toBe(120);
      expect(record.totalPaid).toBe(30);
      expect(record.outstandingBalance).toBe(1120);
      expect(result.summary.totalFineBalance).toBe(120);
      expect(result.summary.totalOutstandingAmount).toBe(1120);
    });

    it('reverses payments correctly and restores outstanding principal', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(mockAcademicYear);

      mockPrisma.student.findMany.mockResolvedValue([
        {
          id: 'student-rev',
          admissionNumber: 'ADM-005',
          firstName: 'Eve',
          lastName: 'Reversed',
          gradeId: 'grade-10',
          sectionId: 'sec-a',
          grade: { id: 'grade-10', name: 'Grade 10', code: 'G10' },
          section: { id: 'sec-a', name: 'A' },
          status: 'ACTIVE',
          invoices: [
            {
              id: 'inv-5',
              grossAmount: new Prisma.Decimal(1000),
              discountAmount: new Prisma.Decimal(0),
              netAmount: new Prisma.Decimal(1000),
              dueDate: new Date('2026-05-10T00:00:00Z'),
              paymentAllocations: [
                {
                  invoiceItemId: 'item-5',
                  allocationType: AllocationType.PRINCIPAL,
                  allocatedAmount: new Prisma.Decimal(1000),
                  refundAllocations: [],
                },
                {
                  invoiceItemId: 'item-5',
                  allocationType: AllocationType.REVERSAL,
                  allocatedAmount: new Prisma.Decimal(1000),
                  refundAllocations: [],
                },
              ],
              assessedFines: [],
            },
          ],
        },
      ]);

      const result = await reportsService.getOutstandingDues(sampleSchoolA, {});
      const record = result.records[0];

      // Net paid: 1000 - 1000 = 0
      // Remaining principal: 1000
      expect(record.totalPaid).toBe(0);
      expect(record.outstandingBalance).toBe(1000);
    });

    it('restores outstanding principal for SUCCEEDED refunds while ignoring FAILED refunds', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(mockAcademicYear);

      mockPrisma.student.findMany.mockResolvedValue([
        {
          id: 'student-refunded',
          admissionNumber: 'ADM-006',
          firstName: 'Frank',
          lastName: 'Refunded',
          gradeId: 'grade-10',
          sectionId: 'sec-a',
          grade: { id: 'grade-10', name: 'Grade 10', code: 'G10' },
          section: { id: 'sec-a', name: 'A' },
          status: 'ACTIVE',
          invoices: [
            {
              id: 'inv-6',
              grossAmount: new Prisma.Decimal(1000),
              discountAmount: new Prisma.Decimal(0),
              netAmount: new Prisma.Decimal(1000),
              dueDate: new Date('2026-05-10T00:00:00Z'),
              paymentAllocations: [
                {
                  invoiceItemId: 'item-6',
                  allocationType: AllocationType.PRINCIPAL,
                  allocatedAmount: new Prisma.Decimal(1000),
                  refundAllocations: [
                    {
                      amount: new Prisma.Decimal(300),
                      paymentRefund: { status: RefundStatus.SUCCEEDED },
                    },
                    {
                      amount: new Prisma.Decimal(200),
                      paymentRefund: { status: RefundStatus.FAILED },
                    },
                  ],
                },
              ],
              assessedFines: [],
            },
          ],
        },
      ]);

      const result = await reportsService.getOutstandingDues(sampleSchoolA, {});
      const record = result.records[0];

      // Paid: 1000 - 300 (succeeded refund) = 700; failed refund ignored
      // Outstanding: 1000 - 700 = 300
      expect(record.totalPaid).toBe(700);
      expect(record.outstandingBalance).toBe(300);
    });

    it('filters only students with dues when onlyWithDues is set to true', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(mockAcademicYear);

      mockPrisma.student.findMany.mockResolvedValue([
        {
          id: 's-with-dues',
          admissionNumber: 'ADM-10',
          firstName: 'Has',
          lastName: 'Dues',
          gradeId: 'grade-10',
          sectionId: 'sec-a',
          grade: { id: 'grade-10', name: 'Grade 10', code: 'G10' },
          section: { id: 'sec-a', name: 'A' },
          status: 'ACTIVE',
          invoices: [
            {
              id: 'inv-10',
              grossAmount: new Prisma.Decimal(1000),
              discountAmount: new Prisma.Decimal(0),
              netAmount: new Prisma.Decimal(1000),
              dueDate: new Date('2026-05-10T00:00:00Z'),
              paymentAllocations: [],
              assessedFines: [],
            },
          ],
        },
        {
          id: 's-zero-dues',
          admissionNumber: 'ADM-11',
          firstName: 'No',
          lastName: 'Dues',
          gradeId: 'grade-10',
          sectionId: 'sec-a',
          grade: { id: 'grade-10', name: 'Grade 10', code: 'G10' },
          section: { id: 'sec-a', name: 'A' },
          status: 'ACTIVE',
          invoices: [
            {
              id: 'inv-11',
              grossAmount: new Prisma.Decimal(1000),
              discountAmount: new Prisma.Decimal(0),
              netAmount: new Prisma.Decimal(1000),
              dueDate: new Date('2026-05-10T00:00:00Z'),
              paymentAllocations: [
                {
                  invoiceItemId: 'item-11',
                  allocationType: AllocationType.PRINCIPAL,
                  allocatedAmount: new Prisma.Decimal(1000),
                  refundAllocations: [],
                },
              ],
              assessedFines: [],
            },
          ],
        },
      ]);

      const result = await reportsService.getOutstandingDues(sampleSchoolA, {
        onlyWithDues: true,
      });

      expect(result.summary.totalStudents).toBe(1);
      expect(result.records.length).toBe(1);
      expect(result.records[0].studentId).toBe('s-with-dues');
    });

    it('enforces multi-tenant isolation by scoping queries to school.id', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(mockAcademicYear);
      mockPrisma.student.findMany.mockResolvedValue([]);

      await reportsService.getOutstandingDues(sampleSchoolB, {});

      expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ schoolId: sampleSchoolB.id }),
        }),
      );
    });

    it('generates defaulters report with overdue aging, distinguishing overdue principal from overdue fines', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(mockAcademicYear);

      const pastDueDate = new Date('2026-05-10T00:00:00Z');
      mockPrisma.student.findMany.mockResolvedValue([
        {
          id: 's-defaulter',
          admissionNumber: 'ADM-DEF-1',
          rollNumber: '1',
          firstName: 'Dan',
          lastName: 'Defaulter',
          gradeId: 'grade-10',
          sectionId: 'sec-a',
          grade: { id: 'grade-10', name: 'Grade 10', code: 'G10' },
          section: { id: 'sec-a', name: 'A' },
          status: 'ACTIVE',
          invoices: [
            {
              id: 'inv-def',
              grossAmount: new Prisma.Decimal(1000),
              discountAmount: new Prisma.Decimal(0),
              netAmount: new Prisma.Decimal(1000),
              dueDate: pastDueDate,
              paymentAllocations: [],
              assessedFines: [
                {
                  id: 'fine-def',
                  assessedAmount: new Prisma.Decimal(150),
                  waivers: [],
                  allocations: [],
                },
              ],
            },
          ],
        },
      ]);

      const result = await reportsService.getDefaultersReport(sampleSchoolA, {});

      expect(result.config.reportType).toBe(ReportType.DEFAULTER_REPORT);
      expect(result.summary.overdueStudentsCount).toBe(1);
      expect(result.summary.totalOverduePrincipal).toBe(1000);
      expect(result.summary.totalOverdueFines).toBe(150);
      expect(result.summary.totalOverdueAmount).toBe(1150);

      const record = result.records[0];
      expect(record.overduePrincipal).toBe(1000);
      expect(record.overdueFines).toBe(150);
      expect(record.overdueAmount).toBe(1150);
      expect(record.maxOverdueDays).toBeGreaterThan(0);
    });
  });

  describe('6. Class-Wise Collection Aggregations', () => {
    it('aggregates gross collections, reversals, refunds, and net collections by class and section', async () => {
      mockPrisma.gradeClass.findMany.mockResolvedValue([
        {
          id: 'grade-10',
          name: 'Grade 10',
          code: 'G10',
          sections: [
            { id: 'sec-a', name: 'A' },
            { id: 'sec-b', name: 'B' },
          ],
        },
      ]);

      mockPrisma.payment.findMany.mockResolvedValue([
        {
          id: 'p-1',
          amount: new Prisma.Decimal(1000),
          student: {
            gradeId: 'grade-10',
            sectionId: 'sec-a',
            grade: { name: 'Grade 10', code: 'G10' },
            section: { name: 'A' },
          },
        },
        {
          id: 'p-2',
          amount: new Prisma.Decimal(1500),
          student: {
            gradeId: 'grade-10',
            sectionId: 'sec-b',
            grade: { name: 'Grade 10', code: 'G10' },
            section: { name: 'B' },
          },
        },
      ]);

      mockPrisma.paymentReversal.findMany.mockResolvedValue([
        {
          id: 'rev-1',
          totalAmount: new Prisma.Decimal(200),
          payment: {
            student: {
              gradeId: 'grade-10',
              sectionId: 'sec-a',
              grade: { name: 'Grade 10', code: 'G10' },
              section: { name: 'A' },
            },
          },
        },
      ]);

      mockPrisma.paymentRefund.findMany.mockResolvedValue([
        {
          id: 'ref-1',
          refundAmount: new Prisma.Decimal(100),
          payment: {
            student: {
              gradeId: 'grade-10',
              sectionId: 'sec-a',
              grade: { name: 'Grade 10', code: 'G10' },
              section: { name: 'A' },
            },
          },
        },
      ]);

      const result = await reportsService.getClassCollections(sampleSchoolA, {
        startDate: '2026-10-01',
        endDate: '2026-10-17',
      });

      expect(result.summary.grossCollections).toBe(2500); // 1000 + 1500
      expect(result.summary.totalReversals).toBe(200);
      expect(result.summary.totalRefunds).toBe(100);
      expect(result.summary.netCollections).toBe(2200); // 2500 - 200 - 100
      expect(result.summary.transactionCount).toBe(2);

      expect(result.byClass.length).toBe(2);

      const secA = result.byClass.find((c) => c.sectionName === 'A');
      expect(secA?.grossCollections).toBe(1000);
      expect(secA?.totalReversals).toBe(200);
      expect(secA?.totalRefunds).toBe(100);
      expect(secA?.netCollections).toBe(700);
      expect(secA?.transactionCount).toBe(1);

      const secB = result.byClass.find((c) => c.sectionName === 'B');
      expect(secB?.grossCollections).toBe(1500);
      expect(secB?.totalReversals).toBe(0);
      expect(secB?.totalRefunds).toBe(0);
      expect(secB?.netCollections).toBe(1500);
      expect(secB?.transactionCount).toBe(1);
    });

    it('throws BadRequestException if startDate is after endDate in class collections', async () => {
      await expect(
        reportsService.getClassCollections(sampleSchoolA, {
          startDate: '2026-10-20',
          endDate: '2026-10-10',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if only startDate or only endDate is provided', async () => {
      await expect(
        reportsService.getClassCollections(sampleSchoolA, {
          startDate: '2026-10-20',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        reportsService.getClassCollections(sampleSchoolA, {
          endDate: '2026-10-20',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('7. Fine Summaries & Penalty Metrics', () => {
    const mockAcademicYear = {
      id: 'ay-2026-0001',
      schoolId: sampleSchoolA.id,
      name: '2026-2027',
      isCurrent: true,
      startDate: new Date('2026-04-01T00:00:00Z'),
      endDate: new Date('2027-03-31T23:59:59Z'),
    };

    it('accurately aggregates assessed fines, waivers, collections, reversals, and refunds', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(mockAcademicYear);
      mockPrisma.gradeClass.findMany.mockResolvedValue([
        {
          id: 'grade-10',
          name: 'Grade 10',
          code: 'G10',
          sections: [
            { id: 'sec-a', name: 'A' },
          ],
        },
      ]);

      const mockFines = [
        {
          id: 'fine-1',
          schoolId: sampleSchoolA.id,
          assessedAmount: new Prisma.Decimal(500),
          status: 'PARTIALLY_PAID',
          fineRuleId: 'rule-late-1',
          fineRule: { id: 'rule-late-1', name: 'Monthly 5-Day Rule', fineType: 'FIXED' },
          invoice: {
            id: 'inv-1',
            status: 'OVERDUE',
            student: {
              id: 'st-1',
              gradeId: 'grade-10',
              sectionId: 'sec-a',
              grade: { name: 'Grade 10', code: 'G10' },
              section: { name: 'A' },
            },
          },
          waivers: [
            { id: 'w-1', waivedAmount: new Prisma.Decimal(50) },
          ],
          allocations: [
            {
              id: 'a-1',
              allocationType: AllocationType.FINE,
              allocatedAmount: new Prisma.Decimal(200),
              refundAllocations: [
                {
                  amount: new Prisma.Decimal(50),
                  paymentRefund: { status: RefundStatus.SUCCEEDED },
                },
              ],
            },
            {
              id: 'a-2',
              allocationType: AllocationType.REVERSAL,
              allocatedAmount: new Prisma.Decimal(50),
              refundAllocations: [],
            },
          ],
        },
      ];

      mockPrisma.assessedFine.findMany.mockResolvedValue(mockFines);

      const result = await reportsService.getFineSummary(sampleSchoolA, {});

      // Assessed = 500
      // Waived = 50
      // Net Obligation = 450
      // Collected = 200
      // Reversals = 50
      // Refunds = 50
      // Net Collected = 200 - 50 - 50 = 100
      // Remaining Balance = 450 - 100 = 350
      expect(result.summary.totalAssessed).toBe(500);
      expect(result.summary.totalWaived).toBe(50);
      expect(result.summary.netObligation).toBe(450);
      expect(result.summary.totalCollected).toBe(200);
      expect(result.summary.totalReversals).toBe(50);
      expect(result.summary.totalRefunds).toBe(50);
      expect(result.summary.netCollected).toBe(100);
      expect(result.summary.remainingBalance).toBe(350);
      expect(result.summary.fineCount).toBe(1);

      // Class breakdown
      expect(result.byClass.length).toBe(1);
      const classEntry = result.byClass[0];
      expect(classEntry.gradeName).toBe('Grade 10');
      expect(classEntry.sectionName).toBe('A');
      expect(classEntry.totalAssessed).toBe(500);
      expect(classEntry.netCollected).toBe(100);
      expect(classEntry.remainingBalance).toBe(350);

      // Status breakdown
      expect(result.statusBreakdown.length).toBe(1);
      expect(result.statusBreakdown[0].status).toBe('PARTIALLY_PAID');
      expect(result.statusBreakdown[0].totalAssessed).toBe(500);
      expect(result.statusBreakdown[0].remainingBalance).toBe(350);

      // Rule breakdown
      expect(result.ruleBreakdown.length).toBe(1);
      expect(result.ruleBreakdown[0].ruleName).toBe('Monthly 5-Day Rule');
      expect(result.ruleBreakdown[0].totalAssessed).toBe(500);

      // Config
      expect(result.config.reportType).toBe(ReportType.FINE_SUMMARY);
    });

    it('validates date range query parameters on fine summary', async () => {
      await expect(
        reportsService.getFineSummary(sampleSchoolA, {
          startDate: '2026-10-20',
          endDate: '2026-10-10',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        reportsService.getFineSummary(sampleSchoolA, {
          startDate: '2026-10-20',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces multi-tenant isolation by scoping fine queries to schoolId', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(mockAcademicYear);
      mockPrisma.gradeClass.findMany.mockResolvedValue([]);
      mockPrisma.assessedFine.findMany.mockResolvedValue([]);

      await reportsService.getFineSummary(sampleSchoolB, {});

      expect(mockPrisma.assessedFine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ schoolId: sampleSchoolB.id }),
        }),
      );
    });
  });
});

