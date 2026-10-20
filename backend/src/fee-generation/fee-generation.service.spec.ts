import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { FeeGenerationService } from './fee-generation.service';
import { PrismaService } from '../prisma/prisma.service';
import { FineRulesService } from '../fine-rules/fine-rules.service';

describe('FeeGenerationService — getStudentFeeStatement Regression Specs', () => {
  let service: FeeGenerationService;
  let prismaMock: any;

  const mockSchoolId = 'sch-001';
  const mockStudentId = 'stu-101';
  const mockAcademicYearId = 'ay-2026';

  const mockStudent = {
    id: mockStudentId,
    admissionNumber: 'ADM-101',
    firstName: 'Aarav',
    lastName: 'Sharma',
    status: 'ACTIVE',
    grade: { name: 'Grade 10' },
    section: { name: 'A' },
  };

  const mockAcademicYear = {
    id: mockAcademicYearId,
    name: '2026-2027',
    startDate: new Date('2026-04-01T00:00:00.000Z'),
    endDate: new Date('2027-03-31T23:59:59.999Z'),
  };

  const mockAllocation = {
    id: 'alloc-1',
    feeStructure: {
      name: 'Grade 10 Annual Fee',
    },
    concessionType: 'NONE',
    concessionValue: new Prisma.Decimal(0),
  };

  const mockUser = {
    id: 'user-admin-1',
    role: 'SCHOOL_ADMIN',
    schoolId: mockSchoolId,
  };

  beforeEach(async () => {
    prismaMock = {
      student: {
        findUnique: jest.fn().mockResolvedValue(mockStudent),
      },
      academicYear: {
        findUnique: jest.fn().mockResolvedValue(mockAcademicYear),
      },
      studentFeeAllocation: {
        findUnique: jest.fn().mockResolvedValue(mockAllocation),
      },
      feeInvoice: {
        findMany: jest.fn(),
      },
      fineRule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      school: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeGenerationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FineRulesService, useValue: null },
      ],
    }).compile();

    service = module.get<FeeGenerationService>(FeeGenerationService);
  });

  it('F-01: includes assessed late fines in invoice remaining balance and summary totals', async () => {
    // Invoice with 5000 net, 2000 paid principal (3000 remaining principal)
    // plus assessed fine of 500 with 0 paid (500 remaining fine)
    // => invoice remaining should be 3500, not 3000
    const mockInvoice = {
      id: 'inv-1',
      billingMonth: 1,
      dueDate: new Date('2026-04-10T18:29:59.999Z'),
      status: InvoiceStatus.DUE,
      grossAmount: new Prisma.Decimal(5000),
      discountAmount: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(5000),
      items: [
        {
          id: 'item-1',
          feeHead: { name: 'Tuition Fee' },
          grossAmount: new Prisma.Decimal(5000),
          discountAmount: new Prisma.Decimal(0),
          netAmount: new Prisma.Decimal(5000),
        },
      ],
      paymentAllocations: [
        {
          id: 'pa-1',
          invoiceItemId: 'item-1',
          allocationType: 'PRINCIPAL',
          allocatedAmount: new Prisma.Decimal(2000),
          refundAllocations: [],
        },
      ],
      assessedFines: [
        {
          id: 'fine-1',
          assessedAmount: new Prisma.Decimal(500),
          allocations: [],
          waivers: [],
        },
      ],
    };

    prismaMock.feeInvoice.findMany.mockResolvedValue([mockInvoice]);

    const result = await service.getStudentFeeStatement(
      mockSchoolId,
      mockUser,
      mockStudentId,
      mockAcademicYearId,
    );

    expect(result.summary.totalGrossAmount).toBe(5000);
    expect(result.summary.totalNetAmount).toBe(5000);
    expect(result.summary.totalAssessedFineAmount).toBe(500);
    expect(result.summary.totalPaidAmount).toBe(2000);
    // 3000 remaining principal + 500 remaining fine = 3500
    expect(result.summary.totalRemainingAmount).toBe(3500);
    // Reconcile: Net Principal (5000) + Net Assessed Fines (500) === Paid (2000) + Remaining (3500)
    expect(result.summary.totalNetAmount + result.summary.totalAssessedFineAmount).toBe(
      result.summary.totalPaidAmount + result.summary.totalRemainingAmount,
    );

    const inv = result.invoices[0];
    expect(inv.assessedFineAmount).toBe(500);
    expect(inv.grossAssessedFineAmount).toBe(500);
    expect(inv.waivedFineAmount).toBe(0);
    expect(inv.paidAmount).toBe(2000);
    expect(inv.remainingBalance).toBe(3500);
    expect(inv.paidFines).toBe(0);
    expect(inv.remainingFines).toBe(500);
  });

  it('F-02: fine reversals do not decrease principal paid amount', async () => {
    // Invoice with 5000 net, 2000 paid principal on item-1
    // Fine was assessed for 200, paid 200, then reversed by 200 (alloc.invoiceItemId is null)
    const mockInvoice = {
      id: 'inv-1',
      billingMonth: 1,
      dueDate: new Date('2026-04-10T18:29:59.999Z'),
      status: InvoiceStatus.PARTIALLY_PAID,
      grossAmount: new Prisma.Decimal(5000),
      discountAmount: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(5000),
      items: [
        {
          id: 'item-1',
          feeHead: { name: 'Tuition Fee' },
          grossAmount: new Prisma.Decimal(5000),
          discountAmount: new Prisma.Decimal(0),
          netAmount: new Prisma.Decimal(5000),
        },
      ],
      paymentAllocations: [
        {
          id: 'pa-1',
          invoiceItemId: 'item-1',
          allocationType: 'PRINCIPAL',
          allocatedAmount: new Prisma.Decimal(2000),
          refundAllocations: [],
        },
      ],
      assessedFines: [
        {
          id: 'fine-1',
          assessedAmount: new Prisma.Decimal(200),
          allocations: [
            {
              id: 'fa-1',
              allocationType: 'FINE',
              allocatedAmount: new Prisma.Decimal(200),
            },
            {
              id: 'fa-2',
              allocationType: 'REVERSAL',
              allocatedAmount: new Prisma.Decimal(200),
            },
          ],
          waivers: [],
        },
      ],
    };

    prismaMock.feeInvoice.findMany.mockResolvedValue([mockInvoice]);

    const result = await service.getStudentFeeStatement(
      mockSchoolId,
      mockUser,
      mockStudentId,
      mockAcademicYearId,
    );

    const inv = result.invoices[0];
    // Principal paid must remain 2000, not reduced by the fine reversal
    expect(inv.items[0].paidAmount).toBe(2000);
    expect(inv.items[0].remainingBalance).toBe(3000);
    expect(inv.paidFines).toBe(0);
    expect(inv.remainingFines).toBe(200);
    expect(inv.remainingBalance).toBe(3200);
  });

  it('F-05: excludes VOID invoices from totalGross, totalNet, totalAssessedFine, totalPaid, and totalRemaining', async () => {
    // Invoice 1: ACTIVE, 4000 net, 1000 paid (3000 remaining)
    // Invoice 2: VOID, 6000 gross/net, with historical allocation and fine -> must NOT inflate any summary totals
    const mockInvoices = [
      {
        id: 'inv-active',
        billingMonth: 1,
        dueDate: new Date('2026-04-10T18:29:59.999Z'),
        status: InvoiceStatus.DUE,
        grossAmount: new Prisma.Decimal(4000),
        discountAmount: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(4000),
        items: [
          {
            id: 'item-active',
            feeHead: { name: 'Tuition Fee' },
            grossAmount: new Prisma.Decimal(4000),
            discountAmount: new Prisma.Decimal(0),
            netAmount: new Prisma.Decimal(4000),
          },
        ],
        paymentAllocations: [
          {
            id: 'pa-active',
            invoiceItemId: 'item-active',
            allocationType: 'PRINCIPAL',
            allocatedAmount: new Prisma.Decimal(1000),
            refundAllocations: [],
          },
        ],
        assessedFines: [],
      },
      {
        id: 'inv-void',
        billingMonth: 2,
        dueDate: new Date('2026-05-10T18:29:59.999Z'),
        status: InvoiceStatus.VOID,
        grossAmount: new Prisma.Decimal(6000),
        discountAmount: new Prisma.Decimal(500),
        netAmount: new Prisma.Decimal(5500),
        items: [
          {
            id: 'item-void',
            feeHead: { name: 'Tuition Fee' },
            grossAmount: new Prisma.Decimal(6000),
            discountAmount: new Prisma.Decimal(500),
            netAmount: new Prisma.Decimal(5500),
          },
        ],
        paymentAllocations: [
          {
            id: 'pa-void',
            invoiceItemId: 'item-void',
            allocationType: 'PRINCIPAL',
            allocatedAmount: new Prisma.Decimal(500),
            refundAllocations: [],
          },
        ],
        assessedFines: [
          {
            id: 'fine-void',
            assessedAmount: new Prisma.Decimal(300),
            allocations: [],
            waivers: [],
          },
        ],
      },
    ];

    prismaMock.feeInvoice.findMany.mockResolvedValue(mockInvoices);

    const result = await service.getStudentFeeStatement(
      mockSchoolId,
      mockUser,
      mockStudentId,
      mockAcademicYearId,
    );

    // Totals should only reflect the active invoice (4000 gross, 4000 net, 0 fine, 1000 paid, 3000 remaining)
    expect(result.summary.totalGrossAmount).toBe(4000);
    expect(result.summary.totalDiscountAmount).toBe(0);
    expect(result.summary.totalNetAmount).toBe(4000);
    expect(result.summary.totalAssessedFineAmount).toBe(0);
    expect(result.summary.totalPaidAmount).toBe(1000);
    expect(result.summary.totalRemainingAmount).toBe(3000);

    // VOID invoice in the list should have 0 remainingBalance and 0 assessedFineAmount
    const voidInv = result.invoices.find((i) => i.id === 'inv-void');
    expect(voidInv).toBeDefined();
    expect(voidInv!.status).toBe(InvoiceStatus.VOID);
    expect(voidInv!.assessedFineAmount).toBe(0);
    expect(voidInv!.remainingBalance).toBe(0);
  });

  it('Finding 3: accounts for fine waivers and SUCCEEDED vs PENDING/FAILED refund allocations across principal and fines', async () => {
    // Principal: 5000 net, paid 3000, SUCCEEDED refund 500, PENDING refund 400, FAILED refund 300
    // => Net principal paid = 3000 - 500 = 2500; remaining principal = 2500
    // Assessed Fine: 600 gross, waived 200 => net assessed fine = 400
    // Fine paid: 300 allocated, SUCCEEDED refund 100, PENDING refund 50 => net fine paid = 200; remaining fine = 400 - 200 = 200
    // Total invoice paid = 2500 + 200 = 2700; Total invoice remaining = 2500 + 200 = 2700
    // Reconcile: Net Principal (5000) + Net Assessed Fine (400) = 5400 === Paid (2700) + Remaining (2700)
    const mockInvoice = {
      id: 'inv-waiver-refund',
      billingMonth: 1,
      dueDate: new Date('2026-04-10T18:29:59.999Z'),
      status: InvoiceStatus.PARTIALLY_PAID,
      grossAmount: new Prisma.Decimal(5000),
      discountAmount: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(5000),
      items: [
        {
          id: 'item-1',
          feeHead: { name: 'Tuition Fee' },
          grossAmount: new Prisma.Decimal(5000),
          discountAmount: new Prisma.Decimal(0),
          netAmount: new Prisma.Decimal(5000),
        },
      ],
      paymentAllocations: [
        {
          id: 'pa-1',
          invoiceItemId: 'item-1',
          allocationType: 'PRINCIPAL',
          allocatedAmount: new Prisma.Decimal(3000),
          refundAllocations: [
            { amount: new Prisma.Decimal(500), paymentRefund: { status: 'SUCCEEDED' } },
            { amount: new Prisma.Decimal(400), paymentRefund: { status: 'PENDING' } },
            { amount: new Prisma.Decimal(300), paymentRefund: { status: 'FAILED' } },
          ],
        },
      ],
      assessedFines: [
        {
          id: 'fine-1',
          assessedAmount: new Prisma.Decimal(600),
          waivers: [{ id: 'w-1', waivedAmount: new Prisma.Decimal(200) }],
          allocations: [
            {
              id: 'fa-1',
              allocationType: 'FINE',
              allocatedAmount: new Prisma.Decimal(300),
              refundAllocations: [
                { amount: new Prisma.Decimal(100), paymentRefund: { status: 'SUCCEEDED' } },
                { amount: new Prisma.Decimal(50), paymentRefund: { status: 'PENDING' } },
              ],
            },
          ],
        },
      ],
    };

    prismaMock.feeInvoice.findMany.mockResolvedValue([mockInvoice]);

    const result = await service.getStudentFeeStatement(
      mockSchoolId,
      mockUser,
      mockStudentId,
      mockAcademicYearId,
    );

    expect(result.summary.totalNetAmount).toBe(5000);
    expect(result.summary.totalGrossAssessedFineAmount).toBe(600);
    expect(result.summary.totalWaivedFineAmount).toBe(200);
    expect(result.summary.totalAssessedFineAmount).toBe(400);
    expect(result.summary.totalPaidAmount).toBe(2700);
    expect(result.summary.totalRemainingAmount).toBe(2700);
    expect(result.summary.totalNetAmount + result.summary.totalAssessedFineAmount).toBe(
      result.summary.totalPaidAmount + result.summary.totalRemainingAmount,
    );

    const inv = result.invoices[0];
    expect(inv.paidPrincipal).toBe(2500);
    expect(inv.remainingPrincipal).toBe(2500);
    expect(inv.grossAssessedFineAmount).toBe(600);
    expect(inv.waivedFineAmount).toBe(200);
    expect(inv.assessedFineAmount).toBe(400);
    expect(inv.paidFines).toBe(200);
    expect(inv.remainingFines).toBe(200);
    expect(inv.paidAmount).toBe(2700);
    expect(inv.remainingBalance).toBe(2700);
  });

  it('Finding 3: marks zero-net (100% discount) invoice as PAID consistently with payment reconciliation', async () => {
    const mockZeroNetInvoice = {
      id: 'inv-zero-net',
      billingMonth: 1,
      dueDate: new Date('2026-04-10T18:29:59.999Z'),
      status: InvoiceStatus.UPCOMING,
      grossAmount: new Prisma.Decimal(5000),
      discountAmount: new Prisma.Decimal(5000),
      netAmount: new Prisma.Decimal(0),
      items: [
        {
          id: 'item-zero',
          feeHead: { name: 'Tuition Fee' },
          grossAmount: new Prisma.Decimal(5000),
          discountAmount: new Prisma.Decimal(5000),
          netAmount: new Prisma.Decimal(0),
        },
      ],
      paymentAllocations: [],
      assessedFines: [],
    };

    prismaMock.feeInvoice.findMany.mockResolvedValue([mockZeroNetInvoice]);

    const result = await service.getStudentFeeStatement(
      mockSchoolId,
      mockUser,
      mockStudentId,
      mockAcademicYearId,
    );

    const inv = result.invoices[0];
    expect(inv.netAmount).toBe(0);
    expect(inv.remainingBalance).toBe(0);
    expect(inv.status).toBe(InvoiceStatus.PAID);
    expect(result.summary.statusBreakdown.PAID).toBe(1);
  });
});
