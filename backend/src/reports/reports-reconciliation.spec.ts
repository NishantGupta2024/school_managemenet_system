import { Test, TestingModule } from '@nestjs/testing';
import {
  InvoiceStatus,
  OnlinePaymentStatus,
  Prisma,
  RefundStatus,
  School,
} from '@prisma/client';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportConfigService } from './report-config.service';
import { ReconciliationFilterStatus } from './dto/gateway-reconciliation-query.dto';

describe('ReportsService — Gateway Reconciliation Report (Phase G1)', () => {
  let reportsService: ReportsService;
  let prisma: any;

  const sampleSchool: School = {
    id: 'school-uuid-alpha',
    code: 'SCH-ALPHA',
    name: 'Alpha International School',
    address: '123 School Lane',
    city: 'New Delhi',
    state: 'Delhi',
    country: 'IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    status: 'ACTIVE' as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    defaultReceiptTemplateId: null,
  };

  // Mock Orders Fixtures
  const orderStandard = {
    id: 'order-1-std',
    schoolId: sampleSchool.id,
    studentId: 'student-1',
    invoiceId: 'inv-1',
    providerOrderId: 'order_rzp_1',
    providerPaymentId: 'pay_rzp_1',
    amount: new Prisma.Decimal(1000),
    status: OnlinePaymentStatus.SUCCESS,
    verifiedAt: new Date('2026-10-20T10:00:00Z'),
    metadata: {
      settlementType: 'FULL_SETTLEMENT',
      totalCaptured: 1000,
      allocatedAmount: 1000,
      surplusAmount: 0,
      requiresManualReconciliation: false,
    },
    student: {
      id: 'student-1',
      admissionNumber: 'ADM-001',
      firstName: 'Aarav',
      lastName: 'Patel',
      grade: { name: 'Grade 1' },
      section: { name: 'A' },
    },
    invoice: {
      id: 'inv-1',
      billingMonth: 1,
      status: InvoiceStatus.PAID,
      netAmount: new Prisma.Decimal(1000),
    },
    payment: {
      id: 'pay-1',
      paymentNumber: 'PAY-2026-0001',
      amount: new Prisma.Decimal(1000),
      receipt: { receiptNumber: 'REC-2026-0001' },
      refunds: [],
    },
  };

  // Case A: ₹2,000 captured with ₹500 outstanding (₹1,500 surplus)
  const orderPartialSurplus = {
    id: 'order-2-partial-surplus',
    schoolId: sampleSchool.id,
    studentId: 'student-2',
    invoiceId: 'inv-2',
    providerOrderId: 'order_rzp_2',
    providerPaymentId: 'pay_rzp_2',
    amount: new Prisma.Decimal(2000),
    status: OnlinePaymentStatus.SUCCESS,
    verifiedAt: new Date('2026-10-21T11:00:00Z'),
    metadata: {
      settlementType: 'PARTIAL_SETTLEMENT_WITH_SURPLUS',
      totalCaptured: 2000,
      allocatedAmount: 500,
      surplusAmount: 1500,
      requiresManualReconciliation: true,
      reconciliationStatus: 'PENDING_RECONCILIATION',
      surplusReason: 'INVOICE_PARTIALLY_SETTLED_OFFLINE',
    },
    student: {
      id: 'student-2',
      admissionNumber: 'ADM-002',
      firstName: 'Diya',
      lastName: 'Sharma',
      grade: { name: 'Grade 2' },
      section: { name: 'B' },
    },
    invoice: {
      id: 'inv-2',
      billingMonth: 2,
      status: InvoiceStatus.PAID,
      netAmount: new Prisma.Decimal(1500),
    },
    payment: {
      id: 'pay-2',
      paymentNumber: 'PAY-2026-0002',
      amount: new Prisma.Decimal(500),
      receipt: { receiptNumber: 'REC-2026-0002' },
      refunds: [],
    },
  };

  // Case B: ₹2,000 captured with ₹0 outstanding (₹2,000 full surplus, zero allocations)
  const orderFullSurplus = {
    id: 'order-3-full-surplus',
    schoolId: sampleSchool.id,
    studentId: 'student-3',
    invoiceId: 'inv-3',
    providerOrderId: 'order_rzp_3',
    providerPaymentId: 'pay_rzp_3',
    amount: new Prisma.Decimal(2000),
    status: OnlinePaymentStatus.SUCCESS,
    verifiedAt: new Date('2026-10-22T09:00:00Z'),
    failureReason: 'INVOICE_ALREADY_PAID_OFFLINE: Full payment received after invoice settled offline.',
    metadata: {
      settlementType: 'ZERO_ALLOCATION_FULL_SURPLUS',
      totalCaptured: 2000,
      allocatedAmount: 0,
      surplusAmount: 2000,
      requiresManualReconciliation: true,
      reconciliationStatus: 'PENDING_RECONCILIATION',
      surplusReason: 'INVOICE_ALREADY_PAID_OFFLINE',
    },
    student: {
      id: 'student-3',
      admissionNumber: 'ADM-003',
      firstName: 'Vihaan',
      lastName: 'Verma',
      grade: { name: 'Grade 3' },
      section: { name: 'A' },
    },
    invoice: {
      id: 'inv-3',
      billingMonth: 3,
      status: InvoiceStatus.PAID,
      netAmount: new Prisma.Decimal(2000),
    },
    payment: null, // Zero payment row created for already-paid invoice
  };

  // Order with Resolved Surplus
  const orderResolvedSurplus = {
    id: 'order-4-resolved',
    schoolId: sampleSchool.id,
    studentId: 'student-4',
    invoiceId: 'inv-4',
    providerOrderId: 'order_rzp_4',
    providerPaymentId: 'pay_rzp_4',
    amount: new Prisma.Decimal(1500),
    status: OnlinePaymentStatus.SUCCESS,
    verifiedAt: new Date('2026-10-22T14:00:00Z'),
    metadata: {
      settlementType: 'PARTIAL_SETTLEMENT_WITH_SURPLUS',
      totalCaptured: 1500,
      allocatedAmount: 1000,
      surplusAmount: 500,
      requiresManualReconciliation: false,
      reconciliationStatus: 'RESOLVED',
      resolutionAction: 'OFFLINE_REFUND_PROCESSED',
      resolutionNotes: 'Refunded ₹500 via account payee cheque #44321',
      resolvedByUserName: 'Principal Sharma',
      resolvedAt: '2026-10-22T15:00:00Z',
    },
    student: {
      id: 'student-4',
      admissionNumber: 'ADM-004',
      firstName: 'Ananya',
      lastName: 'Iyer',
      grade: { name: 'Grade 4' },
      section: { name: 'A' },
    },
    invoice: {
      id: 'inv-4',
      billingMonth: 4,
      status: InvoiceStatus.PAID,
      netAmount: new Prisma.Decimal(1000),
    },
    payment: {
      id: 'pay-4',
      paymentNumber: 'PAY-2026-0004',
      amount: new Prisma.Decimal(1000),
      receipt: { receiptNumber: 'REC-2026-0004' },
      refunds: [],
    },
  };

  beforeEach(async () => {
    prisma = {
      onlinePaymentOrder: {
        findMany: jest.fn().mockResolvedValue([
          orderStandard,
          orderPartialSurplus,
          orderFullSurplus,
          orderResolvedSurplus,
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ReportConfigService,
          useValue: {
            getReportConfig: jest.fn().mockReturnValue({}),
          },
        },
      ],
    }).compile();

    reportsService = module.get<ReportsService>(ReportsService);
  });

  it('aggregates total captured, allocated, and surplus amounts with exact mathematical parity', async () => {
    const report = await reportsService.getGatewayReconciliationReport(
      sampleSchool,
      {},
    );

    // Total Captured = 1000 (std) + 2000 (partial) + 2000 (full) + 1500 (resolved) = 6500.00
    expect(report.summary.totalCapturedAmount).toBe(6500.0);

    // Total Allocated = 1000 + 500 + 0 + 1000 = 2500.00
    expect(report.summary.totalAllocatedAmount).toBe(2500.0);

    // Total Surplus = 0 + 1500 + 2000 + 500 = 4000.00
    expect(report.summary.totalSurplusAmount).toBe(4000.0);

    // Unresolved Surplus = 1500 (partial) + 2000 (full) = 3500.00
    expect(report.summary.unresolvedSurplusAmount).toBe(3500.0);

    // Resolved Surplus = 500.00
    expect(report.summary.resolvedSurplusAmount).toBe(500.0);

    // Invariant check: Total Captured === Total Allocated + Total Surplus
    expect(report.summary.totalCapturedAmount).toBe(
      report.summary.totalAllocatedAmount + report.summary.totalSurplusAmount,
    );

    // Invariant check: Total Surplus === Unresolved Surplus + Resolved Surplus
    expect(report.summary.totalSurplusAmount).toBe(
      report.summary.unresolvedSurplusAmount +
        report.summary.resolvedSurplusAmount,
    );
  });

  it('strictly filters orders by schoolId (tenant isolation)', async () => {
    await reportsService.getGatewayReconciliationReport(sampleSchool, {});

    expect(prisma.onlinePaymentOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: sampleSchool.id,
          status: OnlinePaymentStatus.SUCCESS,
        }),
      }),
    );
  });

  it('accurately traces Case A (partial surplus ₹1,500 on ₹2,000 order)', async () => {
    const report = await reportsService.getGatewayReconciliationReport(
      sampleSchool,
      {},
    );

    const caseA = report.transactions.find(
      (t) => t.orderId === 'order-2-partial-surplus',
    );
    expect(caseA).toBeDefined();
    expect(caseA!.capturedAmount).toBe(2000.0);
    expect(caseA!.allocatedAmount).toBe(500.0);
    expect(caseA!.surplusAmount).toBe(1500.0);
    expect(caseA!.settlementType).toBe('PARTIAL_SETTLEMENT_WITH_SURPLUS');
    expect(caseA!.reconciliationStatus).toBe('PENDING_RECONCILIATION');
    expect(caseA!.reconciliationReason).toBe(
      'INVOICE_PARTIALLY_SETTLED_OFFLINE',
    );
    expect(caseA!.student.admissionNumber).toBe('ADM-002');
  });

  it('accurately traces Case B (full surplus ₹2,000 on zero-balance invoice)', async () => {
    const report = await reportsService.getGatewayReconciliationReport(
      sampleSchool,
      {},
    );

    const caseB = report.transactions.find(
      (t) => t.orderId === 'order-3-full-surplus',
    );
    expect(caseB).toBeDefined();
    expect(caseB!.capturedAmount).toBe(2000.0);
    expect(caseB!.allocatedAmount).toBe(0.0);
    expect(caseB!.surplusAmount).toBe(2000.0);
    expect(caseB!.settlementType).toBe('ZERO_ALLOCATION_FULL_SURPLUS');
    expect(caseB!.reconciliationStatus).toBe('PENDING_RECONCILIATION');
    expect(caseB!.reconciliationReason).toBe('INVOICE_ALREADY_PAID_OFFLINE');
    expect(caseB!.paymentNumber).toBeNull();
    expect(caseB!.receiptNumber).toBeNull();
  });

  it('filters by UNRESOLVED_ONLY to display only orders requiring manual action', async () => {
    const report = await reportsService.getGatewayReconciliationReport(
      sampleSchool,
      {
        status: ReconciliationFilterStatus.UNRESOLVED_ONLY,
      },
    );

    expect(report.transactions).toHaveLength(2);
    expect(
      report.transactions.every(
        (t) => t.reconciliationStatus === 'PENDING_RECONCILIATION',
      ),
    ).toBe(true);
  });

  it('filters by RESOLVED_ONLY to display resolved orders and resolution details', async () => {
    const report = await reportsService.getGatewayReconciliationReport(
      sampleSchool,
      {
        status: ReconciliationFilterStatus.RESOLVED_ONLY,
      },
    );

    expect(report.transactions).toHaveLength(1);
    expect(report.transactions[0].orderId).toBe('order-4-resolved');
    expect(report.transactions[0].resolution).toEqual(
      expect.objectContaining({
        action: 'OFFLINE_REFUND_PROCESSED',
        notes: expect.stringContaining('cheque #44321'),
        resolvedBy: 'Principal Sharma',
      }),
    );
  });

  it('does not double-count captured amounts upon duplicate delivery or retried webhook events', async () => {
    // Each successful payment has a single OnlinePaymentOrder record
    const report = await reportsService.getGatewayReconciliationReport(
      sampleSchool,
      {},
    );
    expect(report.summary.ordersCount).toBe(4);
  });

  describe('Phase G2 Remediation — Exhaustive Surplus Accounting', () => {
    it('accounts for order with missing reconciliationStatus as UNRESOLVED surplus without leakage', async () => {
      const orderMissingStatus = {
        ...orderPartialSurplus,
        id: 'order-missing-status',
        metadata: {
          settlementType: 'PARTIAL_SETTLEMENT_WITH_SURPLUS',
          totalCaptured: 2000,
          allocatedAmount: 800,
          surplusAmount: 1200,
        },
        payment: {
          ...orderPartialSurplus.payment,
          amount: new Prisma.Decimal(800),
        },
      };

      prisma.onlinePaymentOrder.findMany.mockResolvedValueOnce([orderMissingStatus]);

      const report = await reportsService.getGatewayReconciliationReport(sampleSchool, {});

      expect(report.summary.totalCapturedAmount).toBe(2000.0);
      expect(report.summary.totalAllocatedAmount).toBe(800.0);
      expect(report.summary.totalSurplusAmount).toBe(1200.0);
      expect(report.summary.unresolvedSurplusAmount).toBe(1200.0);
      expect(report.summary.resolvedSurplusAmount).toBe(0.0);

      // Invariants
      expect(report.summary.totalCapturedAmount).toBe(
        report.summary.totalAllocatedAmount + report.summary.totalSurplusAmount,
      );
      expect(report.summary.totalSurplusAmount).toBe(
        report.summary.unresolvedSurplusAmount + report.summary.resolvedSurplusAmount,
      );
    });

    it('accounts for order with unexpected reconciliationStatus as UNRESOLVED surplus without disappearing', async () => {
      const orderUnexpectedStatus = {
        ...orderPartialSurplus,
        id: 'order-unexpected-status',
        metadata: {
          settlementType: 'PARTIAL_SETTLEMENT_WITH_SURPLUS',
          totalCaptured: 2000,
          allocatedAmount: 500,
          surplusAmount: 1500,
          reconciliationStatus: 'CUSTOM_AUDIT_HOLD',
        },
      };

      prisma.onlinePaymentOrder.findMany.mockResolvedValueOnce([orderUnexpectedStatus]);

      const report = await reportsService.getGatewayReconciliationReport(sampleSchool, {});

      expect(report.summary.totalSurplusAmount).toBe(1500.0);
      expect(report.summary.unresolvedSurplusAmount).toBe(1500.0);
      expect(report.summary.resolvedSurplusAmount).toBe(0.0);
      expect(report.summary.totalSurplusAmount).toBe(
        report.summary.unresolvedSurplusAmount + report.summary.resolvedSurplusAmount,
      );
    });

    it('ensures orders with zero surplus do not contribute to unresolved or resolved surplus', async () => {
      const orderZeroSurplus = {
        ...orderStandard,
        id: 'order-zero-surplus',
        metadata: {
          settlementType: 'FULL_SETTLEMENT',
          totalCaptured: 1000,
          allocatedAmount: 1000,
          surplusAmount: 0,
        },
      };

      prisma.onlinePaymentOrder.findMany.mockResolvedValueOnce([orderZeroSurplus]);

      const report = await reportsService.getGatewayReconciliationReport(sampleSchool, {});

      expect(report.summary.totalSurplusAmount).toBe(0.0);
      expect(report.summary.unresolvedSurplusAmount).toBe(0.0);
      expect(report.summary.resolvedSurplusAmount).toBe(0.0);
      expect(report.summary.surplusOrdersCount).toBe(0);
      expect(report.summary.unresolvedOrdersCount).toBe(0);
    });
  });

  describe('Phase G2 Remediation — Refund and Reversal Interactions', () => {
    it('correctly aggregates confirmed refunds without reducing captured or allocated totals', async () => {
      const orderWithConfirmedRefund = {
        ...orderStandard,
        id: 'order-confirmed-refund',
        payment: {
          ...orderStandard.payment,
          amount: new Prisma.Decimal(1000),
          refunds: [
            {
              id: 'ref-1',
              refundAmount: new Prisma.Decimal(300),
              status: RefundStatus.SUCCEEDED,
            },
          ],
        },
      };

      prisma.onlinePaymentOrder.findMany.mockResolvedValueOnce([orderWithConfirmedRefund]);

      const report = await reportsService.getGatewayReconciliationReport(sampleSchool, {});

      // Captured remains intact: original 1000 was captured from gateway
      expect(report.summary.totalCapturedAmount).toBe(1000.0);
      // Allocated remains intact: original 1000 was allocated
      expect(report.summary.totalAllocatedAmount).toBe(1000.0);
      // Surplus is 0
      expect(report.summary.totalSurplusAmount).toBe(0.0);
      // Refunded amount is distinctly tracked
      expect(report.summary.totalRefundedAmount).toBe(300.0);
      expect(report.transactions[0].refundedAmount).toBe(300.0);

      // Parity check
      expect(report.summary.totalCapturedAmount).toBe(
        report.summary.totalAllocatedAmount + report.summary.totalSurplusAmount,
      );
    });

    it('ignores failed and pending refunds, never subtracting unconfirmed refunds from captured funds', async () => {
      const orderWithFailedAndPendingRefunds = {
        ...orderStandard,
        id: 'order-unconfirmed-refunds',
        payment: {
          ...orderStandard.payment,
          refunds: [
            {
              id: 'ref-failed',
              refundAmount: new Prisma.Decimal(200),
              status: RefundStatus.FAILED,
            },
            {
              id: 'ref-pending',
              refundAmount: new Prisma.Decimal(250),
              status: RefundStatus.PENDING,
            },
          ],
        },
      };

      prisma.onlinePaymentOrder.findMany.mockResolvedValueOnce([
        orderWithFailedAndPendingRefunds,
      ]);

      const report = await reportsService.getGatewayReconciliationReport(sampleSchool, {});

      expect(report.summary.totalCapturedAmount).toBe(1000.0);
      expect(report.summary.totalAllocatedAmount).toBe(1000.0);
      expect(report.summary.totalRefundedAmount).toBe(0.0);
      expect(report.transactions[0].refundedAmount).toBe(0.0);
    });

    it('handles payment reversals by preserving historical captured money and distinct ledger integrity', async () => {
      const orderWithReversedPayment = {
        ...orderStandard,
        id: 'order-reversed-payment',
        payment: {
          ...orderStandard.payment,
          status: 'VOIDED' as any,
          amount: new Prisma.Decimal(1000),
          refunds: [],
        },
      };

      prisma.onlinePaymentOrder.findMany.mockResolvedValueOnce([orderWithReversedPayment]);

      const report = await reportsService.getGatewayReconciliationReport(sampleSchool, {});

      // Historical captured amount at gateway remains preserved
      expect(report.summary.totalCapturedAmount).toBe(1000.0);
      expect(report.summary.totalRefundedAmount).toBe(0.0);
      expect(report.summary.totalCapturedAmount).toBe(
        report.summary.totalAllocatedAmount + report.summary.totalSurplusAmount,
      );
    });
  });
});
