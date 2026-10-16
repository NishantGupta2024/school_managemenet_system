import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AllocationType,
  AssessedFineStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReceiptStatus,
  RefundStatus,
  ReversalType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { FeeGenerationService } from '../fee-generation/fee-generation.service';
import { FineRulesService } from '../fine-rules/fine-rules.service';
import { ReceiptSequenceService } from './receipt-sequence.service';
import { ReversalSequenceService } from './reversal-sequence.service';
import { PaymentsService } from './payments.service';
import { NotificationOutboxService } from '../notifications/outbox/notification-outbox.service';

describe('PaymentsService — Payment Collection Engine & Accounting Invariants', () => {
  let service: PaymentsService;
  let prisma: PrismaService;
  let sequenceService: ReceiptSequenceService;
  let reversalSequenceService: ReversalSequenceService;
  let feeGenService: FeeGenerationService;

  const schoolAId = '00000000-0000-0000-0000-000000000001';
  const schoolBId = '00000000-0000-0000-0000-000000000002';

  let testStudentId: string;
  let testAcademicYearId: string;
  let testGradeId: string;
  let testFeeHeadId: string;

  let adminUserSchoolA: any;
  let staffUserSchoolA: any;

  const studentUser = {
    id: '00000000-0000-0000-0000-000000000013',
    schoolId: schoolAId,
    role: UserRole.STUDENT,
    name: 'Student User',
  };

  const parentUser = {
    id: '00000000-0000-0000-0000-000000000014',
    schoolId: schoolAId,
    role: UserRole.PARENT,
    name: 'Parent User',
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        TenantContextService,
        ReceiptSequenceService,
        ReversalSequenceService,
        FineRulesService,
        FeeGenerationService,
        PaymentsService,
        {
          provide: NotificationOutboxService,
          useValue: {
            enqueueReceiptIssued: jest.fn().mockResolvedValue({ id: 'mock-outbox-rcpt' }),
            enqueuePaymentReversed: jest.fn().mockResolvedValue({ id: 'mock-outbox-rev' }),
            enqueueRefundSucceeded: jest.fn().mockResolvedValue({ id: 'mock-outbox-ref-s' }),
            enqueueRefundFailed: jest.fn().mockResolvedValue({ id: 'mock-outbox-ref-f' }),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get<PrismaService>(PrismaService);
    sequenceService = module.get<ReceiptSequenceService>(ReceiptSequenceService);
    reversalSequenceService = module.get<ReversalSequenceService>(ReversalSequenceService);
    feeGenService = module.get<FeeGenerationService>(FeeGenerationService);

    // 1. Fetch real admin and staff users from School A
    const adminUser = await prisma.user.findFirst({
      where: { schoolId: schoolAId, role: UserRole.SCHOOL_ADMIN },
    });
    const staffUser = await prisma.user.findFirst({
      where: { schoolId: schoolAId, role: UserRole.FEE_STAFF },
    });
    adminUserSchoolA = adminUser || {
      id: '00000000-0000-0000-0000-000000000011',
      schoolId: schoolAId,
      role: UserRole.SCHOOL_ADMIN,
    };
    staffUserSchoolA = staffUser || {
      id: '00000000-0000-0000-0000-000000000012',
      schoolId: schoolAId,
      role: UserRole.FEE_STAFF,
    };

    // 2. Fetch Session A
    const sessionA = await prisma.academicYear.findFirst({
      where: { schoolId: schoolAId, name: '2026-2027' },
    });
    if (!sessionA) {
      throw new Error('Precondition failed: Academic year 2026-2027 for School A must exist');
    }
    testAcademicYearId = sessionA.id;

    // 3. Create a dedicated isolated test student in School A
    const grade = await prisma.gradeClass.findFirst({ where: { schoolId: schoolAId } });
    const section = await prisma.section.findFirst({ where: { schoolId: schoolAId } });
    const student = await prisma.student.create({
      data: {
        schoolId: schoolAId,
        admissionNumber: `PAY-TEST-${Date.now()}`,
        firstName: 'PaymentTest',
        lastName: 'Student',
        gradeId: grade!.id,
        sectionId: section!.id,
        academicYearId: testAcademicYearId,
        status: 'ACTIVE',
      },
    });
    testStudentId = student.id;
    testGradeId = student.gradeId;

    // 4. Fetch or create a FeeHead for line item creation
    let feeHead = await prisma.feeHead.findFirst({ where: { schoolId: schoolAId } });
    if (!feeHead) {
      feeHead = await prisma.feeHead.create({
        data: {
          schoolId: schoolAId,
          code: 'TUIT-TEST',
          name: 'Tuition Fee',
          category: 'ACADEMIC',
        },
      });
    }
    testFeeHeadId = feeHead.id;
  });

  afterAll(async () => {
    if (testStudentId) {
      const invs = await prisma.feeInvoice.findMany({
        where: { studentId: testStudentId },
        select: { id: true },
      });
      for (const inv of invs) {
        await cleanupInvoice(inv.id);
      }
      await prisma.student.delete({ where: { id: testStudentId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  async function cleanupInvoice(invoiceId: string) {
    const allocs = await prisma.paymentAllocation.findMany({
      where: { invoiceId },
      select: { paymentId: true },
    });
    const paymentIds = Array.from(new Set(allocs.map((a) => a.paymentId)));

    if (paymentIds.length > 0) {
      await prisma.paymentRefundAllocation.deleteMany({
        where: { paymentRefund: { paymentId: { in: paymentIds } } },
      });
      await prisma.paymentRefund.deleteMany({
        where: { paymentId: { in: paymentIds } },
      });
      await prisma.receipt.deleteMany({
        where: { paymentId: { in: paymentIds } },
      });
      await prisma.paymentAllocation.deleteMany({
        where: { paymentId: { in: paymentIds } },
      });
      await prisma.paymentReversal.deleteMany({
        where: { paymentId: { in: paymentIds } },
      });
      await prisma.payment.deleteMany({
        where: { id: { in: paymentIds } },
      });
    }

    await prisma.fineWaiver.deleteMany({
      where: { invoiceId },
    });
    await prisma.assessedFine.deleteMany({
      where: { invoiceId },
    });
    await prisma.invoiceItem.deleteMany({
      where: { invoiceId },
    });
    await prisma.feeInvoice.deleteMany({
      where: { id: invoiceId },
    });
  }

  /**
   * Helper to create a pristine test invoice for testing allocations.
   */
  async function createTestInvoice(params: {
    month: number;
    grossAmount: number;
    discountAmount?: number;
    dueDate?: Date;
  }) {
    const gross = new Prisma.Decimal(params.grossAmount);
    const discount = new Prisma.Decimal(params.discountAmount || 0);
    const net = gross.sub(discount);

    const inv = await prisma.feeInvoice.create({
      data: {
        schoolId: schoolAId,
        studentId: testStudentId,
        academicYearId: testAcademicYearId,
        billingMonth: params.month,
        dueDate: params.dueDate || new Date('2026-04-10T18:29:59.999Z'),
        grossAmount: gross,
        discountAmount: discount,
        netAmount: net,
        status: InvoiceStatus.DUE,
      },
    });

    const item = await prisma.invoiceItem.create({
      data: {
        schoolId: schoolAId,
        invoiceId: inv.id,
        feeHeadId: testFeeHeadId,
        feeHeadNameSnapshot: 'Tuition Fee',
        grossAmount: gross,
        discountAmount: discount,
        netAmount: net,
        billingFrequencySnapshot: 'MONTHLY',
      },
    });

    return {
      ...inv,
      items: [item],
    };
  }

  /**
   * Helper to create an assessed fine on a test invoice.
   */
  async function createAssessedFine(invoiceId: string, amount: number) {
    return prisma.assessedFine.create({
      data: {
        schoolId: schoolAId,
        invoiceId,
        assessedAmount: new Prisma.Decimal(amount),
        asOfDate: new Date(),
        overdueDays: 10,
        status: AssessedFineStatus.OUTSTANDING,
        calculationSnapshot: { fineType: 'FIXED', amount },
      },
    });
  }

  // -------------------------------------------------------------
  // Test 1: Principal-First Auto-Allocation Waterfall
  // -------------------------------------------------------------
  it('1. should automatically allocate funds principal-first across invoices in chronological order', async () => {
    const inv1 = await createTestInvoice({ month: 101, grossAmount: 3000 });
    const inv2 = await createTestInvoice({ month: 102, grossAmount: 4000 });

    try {
      // Collect ₹5,000 partial payment without explicit allocations
      // Waterfall should completely settle inv1 (₹3,000) and partially settle inv2 (₹2,000)
      const result = await service.collectPayment(
        schoolAId,
        adminUserSchoolA,
        {
          studentId: testStudentId,
          academicYearId: testAcademicYearId,
          amount: 5000,
          paymentMethod: PaymentMethod.CASH,
          notes: 'Auto waterfall test',
        },
      );

      // Verify Payment record
      expect(result.payment).toBeDefined();
      expect(Number(result.payment.amount)).toBe(5000);
      expect(result.payment.status).toBe(PaymentStatus.COMPLETED);

      // Verify Receipt record
      expect(result.receipt).toBeDefined();
      expect(result.receipt.receiptNumber).toMatch(/^RCT-202627-\d{5}$/);
      expect(Number(result.receipt.totalAmount)).toBe(5000);
      expect((result.receipt.receiptSnapshot as any).student.id).toBe(testStudentId);

      // Verify Allocations sum
      const totalAllocated = result.allocations.reduce(
        (sum, a) => sum + Number(a.allocatedAmount || a.amount),
        0,
      );
      expect(totalAllocated).toBe(5000);

      // Verify inv1 is PAID
      const updatedInv1 = await prisma.feeInvoice.findUnique({
        where: { id: inv1.id },
      });
      expect(updatedInv1!.status).toBe(InvoiceStatus.PAID);

      // Verify inv2 is PARTIALLY_PAID
      const updatedInv2 = await prisma.feeInvoice.findUnique({
        where: { id: inv2.id },
      });
      expect(updatedInv2!.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    } finally {
      // Clean up test invoices
      await cleanupInvoice(inv1.id);
      await cleanupInvoice(inv2.id);
    }
  });

  // -------------------------------------------------------------
  // Test 2: Explicit Line-Item Allocations
  // -------------------------------------------------------------
  it('2. should allocate explicitly to specified invoice items and update item balances accurately', async () => {
    const inv = await createTestInvoice({ month: 103, grossAmount: 6000 });
    const item = inv.items[0];

    try {
      const result = await service.collectPayment(
        schoolAId,
        staffUserSchoolA,
        {
          studentId: testStudentId,
          academicYearId: testAcademicYearId,
          amount: 2500,
          paymentMethod: PaymentMethod.UPI,
          referenceNumber: 'UPI-REF-00129',
          allocations: [
            {
              invoiceId: inv.id,
              invoiceItemId: item.id,
              allocationType: AllocationType.PRINCIPAL,
              amount: 2500,
            },
          ],
        },
      );

      expect(result.allocations.length).toBe(1);
      expect(Number(result.allocations[0].allocatedAmount)).toBe(2500);
      expect(result.allocations[0].invoiceItemId).toBe(item.id);

      const updatedInv = await prisma.feeInvoice.findUnique({
        where: { id: inv.id },
      });
      expect(updatedInv!.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 3: Reject Explicit Allocation Mismatch
  // -------------------------------------------------------------
  it('3. should reject when explicit allocation sum does not equal payment amount', async () => {
    const inv = await createTestInvoice({ month: 104, grossAmount: 5000 });

    try {
      await expect(
        service.collectPayment(
          schoolAId,
          adminUserSchoolA,
          {
            studentId: testStudentId,
            academicYearId: testAcademicYearId,
            amount: 5000,
            paymentMethod: PaymentMethod.CASH,
            allocations: [
              {
                invoiceId: inv.id,
                invoiceItemId: inv.items[0].id,
                allocationType: AllocationType.PRINCIPAL,
                amount: 4000, // Explicit total 4000 !== payment amount 5000
              },
            ],
          },
        ),
      ).rejects.toThrow(BadRequestException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 4: Overpayment Rejection
  // -------------------------------------------------------------
  it('4. should reject payment that exceeds total outstanding obligation for student', async () => {
    const inv = await createTestInvoice({ month: 105, grossAmount: 2000 });

    try {
      // Student owes ₹2,000; attempting to pay ₹3,000 without wallet feature
      await expect(
        service.collectPayment(
          schoolAId,
          adminUserSchoolA,
          {
            studentId: testStudentId,
            academicYearId: testAcademicYearId,
            amount: 3000,
            paymentMethod: PaymentMethod.CASH,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 5: Idempotency Replay (Safe Re-execution)
  // -------------------------------------------------------------
  it('5. should safely replay previous response without creating duplicate records on idempotent retry', async () => {
    const inv = await createTestInvoice({ month: 106, grossAmount: 3500 });
    const idempotencyKey = `idem-${Date.now()}-${Math.random()}`;

    try {
      const payload = {
        studentId: testStudentId,
        academicYearId: testAcademicYearId,
        amount: 3500,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        referenceNumber: 'NEFT-88990',
        idempotencyKey,
      };

      // 1. First execution: creates payment
      const firstResult = await service.collectPayment(
        schoolAId,
        adminUserSchoolA,
        payload,
        idempotencyKey,
      );
      expect(firstResult.isIdempotentReplay).toBe(false);
      const originalPaymentId = firstResult.payment.id;
      const originalReceiptNumber = firstResult.receipt.receiptNumber;

      // 2. Second execution with identical payload and key
      const secondResult = await service.collectPayment(
        schoolAId,
        adminUserSchoolA,
        payload,
        idempotencyKey,
      );
      expect(secondResult.isIdempotentReplay).toBe(true);
      expect(secondResult.payment.id).toBe(originalPaymentId);
      expect(secondResult.receipt.receiptNumber).toBe(originalReceiptNumber);

      // Verify no duplicate payment was created in database
      const payments = await prisma.payment.findMany({
        where: { schoolId: schoolAId, idempotencyKey },
      });
      expect(payments.length).toBe(1);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 6: Idempotency Key Conflict on Payload Mutation (409)
  // -------------------------------------------------------------
  it('6. should reject with 409 Conflict when an idempotency key is reused with a different payload', async () => {
    const inv = await createTestInvoice({ month: 107, grossAmount: 4000 });
    const idempotencyKey = `idem-conflict-${Date.now()}`;

    try {
      // First call with amount 4000
      await service.collectPayment(
        schoolAId,
        adminUserSchoolA,
        {
          studentId: testStudentId,
          academicYearId: testAcademicYearId,
          amount: 4000,
          paymentMethod: PaymentMethod.CASH,
          idempotencyKey,
        },
        idempotencyKey,
      );

      // Second call reusing the same key but different amount (2000)
      await expect(
        service.collectPayment(
          schoolAId,
          adminUserSchoolA,
          {
            studentId: testStudentId,
            academicYearId: testAcademicYearId,
            amount: 2000, // Altered payload!
            paymentMethod: PaymentMethod.CASH,
            idempotencyKey,
          },
          idempotencyKey,
        ),
      ).rejects.toThrow(ConflictException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 7: Role Authorization Enforcement (Students & Parents Blocked)
  // -------------------------------------------------------------
  it('7. should strictly forbid STUDENT and PARENT roles from collecting payments (403 Forbidden)', async () => {
    const inv = await createTestInvoice({ month: 108, grossAmount: 1500 });

    try {
      // Student attempt
      await expect(
        service.collectPayment(
          schoolAId,
          studentUser,
          {
            studentId: testStudentId,
            academicYearId: testAcademicYearId,
            amount: 1500,
            paymentMethod: PaymentMethod.CASH,
          },
        ),
      ).rejects.toThrow(ForbiddenException);

      // Parent attempt
      await expect(
        service.collectPayment(
          schoolAId,
          parentUser,
          {
            studentId: testStudentId,
            academicYearId: testAcademicYearId,
            amount: 1500,
            paymentMethod: PaymentMethod.CASH,
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 8: Cross-Tenant Isolation
  // -------------------------------------------------------------
  it('8. should reject attempt to collect payment for a student in another school', async () => {
    // School B attempts to collect for School A's student
    await expect(
      service.collectPayment(
        schoolBId,
        { id: 'admin-b', schoolId: schoolBId, role: UserRole.SCHOOL_ADMIN },
        {
          studentId: testStudentId, // Student belongs to School A
          academicYearId: testAcademicYearId,
          amount: 1000,
          paymentMethod: PaymentMethod.CASH,
        },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  // -------------------------------------------------------------
  // Test 9: Concurrent Over-Collection Prevention
  // -------------------------------------------------------------
  it('9. should prevent concurrent race condition from over-allocating invoice headroom', async () => {
    const inv = await createTestInvoice({ month: 109, grossAmount: 4000 });

    try {
      // Invoice net amount is ₹4,000. Launch two concurrent payment requests for ₹4,000 simultaneously.
      // With row locking (SELECT ... FOR UPDATE), one will succeed, and the second must be rejected
      // with an overpayment error. The database allocations must equal exactly ₹4,000.
      const task1 = service.collectPayment(schoolAId, adminUserSchoolA, {
        studentId: testStudentId,
        academicYearId: testAcademicYearId,
        amount: 4000,
        paymentMethod: PaymentMethod.CASH,
      });

      const task2 = service.collectPayment(schoolAId, staffUserSchoolA, {
        studentId: testStudentId,
        academicYearId: testAcademicYearId,
        amount: 4000,
        paymentMethod: PaymentMethod.CASH,
      });

      const results = await Promise.allSettled([task1, task2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Verify that the total allocated amount in database equals exactly 4000
      const allocations = await prisma.paymentAllocation.findMany({
        where: { invoiceId: inv.id },
      });
      const totalInDb = allocations.reduce(
        (sum, a) => sum + Number(a.allocatedAmount),
        0,
      );
      expect(totalInDb).toBe(4000);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 10: Assessed Fine Allocation with Waiver Integration
  // -------------------------------------------------------------
  it('10. should accurately compute remaining fine balance after partial waivers and allocate payments to fines', async () => {
    const inv = await createTestInvoice({ month: 110, grossAmount: 2000 });

    try {
      // 1. Create an AssessedFine of ₹500 on this invoice
      const fine = await prisma.assessedFine.create({
        data: {
          schoolId: schoolAId,
          invoiceId: inv.id,
          assessedAmount: new Prisma.Decimal(500),
          asOfDate: new Date(),
          overdueDays: 10,
          status: 'OUTSTANDING',
          calculationSnapshot: { fineType: 'FIXED', amount: 500 },
        },
      });

      // 2. Create a FineWaiver of ₹200 on this fine
      await prisma.fineWaiver.create({
        data: {
          schoolId: schoolAId,
          invoiceId: inv.id,
          assessedFineId: fine.id,
          waivedAmount: new Prisma.Decimal(200),
          reason: 'Medical waiver approved by principal',
        },
      });

      // Remaining fine balance is: 500 - 200 = ₹300.
      // Settle the invoice principal (₹2,000) and the remaining fine (₹300) = ₹2,300 total.
      const result = await service.collectPayment(
        schoolAId,
        adminUserSchoolA,
        {
          studentId: testStudentId,
          academicYearId: testAcademicYearId,
          amount: 2300,
          paymentMethod: PaymentMethod.POS_CARD,
        },
      );

      // Verify allocations: 1 principal allocation of ₹2,000 and 1 fine allocation of ₹300
      const principalAlloc = result.allocations.find(
        (a) => a.allocationType === AllocationType.PRINCIPAL,
      );
      const fineAlloc = result.allocations.find(
        (a) => a.allocationType === AllocationType.FINE,
      );

      expect(Number(principalAlloc.allocatedAmount || principalAlloc.amount)).toBe(2000);
      expect(Number(fineAlloc.allocatedAmount || fineAlloc.amount)).toBe(300);
      expect(fineAlloc.assessedFineId).toBe(fine.id);

      const fineInDb = await prisma.assessedFine.findUnique({ where: { id: fine.id } });
      expect(fineInDb!.status).toBe(AssessedFineStatus.PAID);
      const invInDb = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(invInDb!.status).toBe(InvoiceStatus.PAID);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 11: Multi-transaction settlement — Principal first, then fine
  // -------------------------------------------------------------
  it('11. should keep invoice PARTIALLY_PAID when principal is paid but fine remains, and transition to PAID when fine is settled in second transaction', async () => {
    // Invoice net amount ₹2,000
    const inv = await createTestInvoice({ month: 111, grossAmount: 2000 });

    try {
      // Create an AssessedFine of ₹500 on this invoice
      const fine = await prisma.assessedFine.create({
        data: {
          schoolId: schoolAId,
          invoiceId: inv.id,
          assessedAmount: new Prisma.Decimal(500),
          asOfDate: new Date(),
          overdueDays: 10,
          status: AssessedFineStatus.OUTSTANDING,
          calculationSnapshot: { fineType: 'FIXED', amount: 500 },
        },
      });

      // Transaction 1: Pay ₹2,000 via auto-waterfall (settles all principal, fine remains)
      const res1 = await service.collectPayment(
        schoolAId,
        adminUserSchoolA,
        {
          studentId: testStudentId,
          academicYearId: testAcademicYearId,
          amount: 2000,
          paymentMethod: PaymentMethod.CASH,
        },
      );

      expect(res1.allocations.length).toBe(1);
      expect(res1.allocations[0].allocationType).toBe(AllocationType.PRINCIPAL);
      expect(Number(res1.allocations[0].allocatedAmount)).toBe(2000);

      // Verify invoice is NOT marked PAID; it must be PARTIALLY_PAID because ₹500 fine remains!
      const midInv = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(midInv!.status).toBe(InvoiceStatus.PARTIALLY_PAID);

      // Verify fine is still OUTSTANDING
      const midFine = await prisma.assessedFine.findUnique({ where: { id: fine.id } });
      expect(midFine!.status).toBe(AssessedFineStatus.OUTSTANDING);

      // Transaction 2: Pay ₹500 via auto-waterfall (must pick up invoice with remaining fine!)
      const res2 = await service.collectPayment(
        schoolAId,
        adminUserSchoolA,
        {
          studentId: testStudentId,
          academicYearId: testAcademicYearId,
          amount: 500,
          paymentMethod: PaymentMethod.UPI,
          referenceNumber: 'UPI-FINE-001',
        },
      );

      expect(res2.allocations.length).toBe(1);
      expect(res2.allocations[0].allocationType).toBe(AllocationType.FINE);
      expect(res2.allocations[0].assessedFineId).toBe(fine.id);
      expect(Number(res2.allocations[0].allocatedAmount)).toBe(500);

      // Verify fine status is now PAID
      const finalFine = await prisma.assessedFine.findUnique({ where: { id: fine.id } });
      expect(finalFine!.status).toBe(AssessedFineStatus.PAID);

      // Verify invoice is now fully PAID!
      const finalInv = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(finalInv!.status).toBe(InvoiceStatus.PAID);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 12: Partial fine payment updates AssessedFine status
  // -------------------------------------------------------------
  it('12. should update AssessedFine status to PARTIALLY_PAID when fine is only partially settled', async () => {
    const inv = await createTestInvoice({ month: 112, grossAmount: 2000 });

    try {
      const fine = await prisma.assessedFine.create({
        data: {
          schoolId: schoolAId,
          invoiceId: inv.id,
          assessedAmount: new Prisma.Decimal(500),
          asOfDate: new Date(),
          overdueDays: 10,
          status: AssessedFineStatus.OUTSTANDING,
          calculationSnapshot: { fineType: 'FIXED', amount: 500 },
        },
      });

      // Pay ₹2,200 (₹2,000 principal + ₹200 towards ₹500 fine)
      const res = await service.collectPayment(
        schoolAId,
        adminUserSchoolA,
        {
          studentId: testStudentId,
          academicYearId: testAcademicYearId,
          amount: 2200,
          paymentMethod: PaymentMethod.POS_CARD,
        },
      );

      expect(res.allocations.length).toBe(2);

      const fineAfter = await prisma.assessedFine.findUnique({ where: { id: fine.id } });
      expect(fineAfter!.status).toBe(AssessedFineStatus.PARTIALLY_PAID);

      const invAfter = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(invAfter!.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 13: Cheque collection rejection without side effects
  // -------------------------------------------------------------
  it('13. should reject CHEQUE payment method with validation error and leave no financial side effects', async () => {
    const inv = await createTestInvoice({ month: 113, grossAmount: 3000 });

    try {
      const initialPaymentsCount = await prisma.payment.count({
        where: { schoolId: schoolAId },
      });
      const initialSeq = await sequenceService.getCurrentSequence({
        schoolId: schoolAId,
        academicYearId: testAcademicYearId,
      });

      await expect(
        service.collectPayment(
          schoolAId,
          adminUserSchoolA,
          {
            studentId: testStudentId,
            academicYearId: testAcademicYearId,
            amount: 3000,
            paymentMethod: PaymentMethod.CHEQUE,
            chequeNumber: 'CHQ-998877',
            chequeDate: '2026-04-15',
            bankName: 'HDFC Bank',
          },
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Cheque payments are temporarily disabled pending clearance and dishonor workflow implementation',
        ),
      );

      // Verify no payment was created
      const finalPaymentsCount = await prisma.payment.count({
        where: { schoolId: schoolAId },
      });
      expect(finalPaymentsCount).toBe(initialPaymentsCount);

      // Verify sequence counter was NOT incremented
      const finalSeq = await sequenceService.getCurrentSequence({
        schoolId: schoolAId,
        academicYearId: testAcademicYearId,
      });
      expect(finalSeq.currentSequence).toBe(initialSeq.currentSequence);

      // Verify invoice status remains untouched (DUE)
      const invAfter = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(invAfter!.status).toBe(InvoiceStatus.DUE);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 14: Preservation of PAID status in student fee statement
  // -------------------------------------------------------------
  it('14. should preserve PAID invoice status in student statement even when due date is in the past', async () => {
    // Invoice with due date in the past
    const pastDueDate = new Date('2026-01-10T18:29:59.999Z');
    const inv = await createTestInvoice({
      month: 114,
      grossAmount: 2500,
      dueDate: pastDueDate,
    });

    try {
      // Settle invoice in full
      await service.collectPayment(
        schoolAId,
        adminUserSchoolA,
        {
          studentId: testStudentId,
          academicYearId: testAcademicYearId,
          amount: 2500,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          referenceNumber: 'NEFT-PAID-001',
        },
      );

      const invInDb = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(invInDb!.status).toBe(InvoiceStatus.PAID);

      // Fetch student fee statement
      const statement = await feeGenService.getStudentFeeStatement(
        schoolAId,
        adminUserSchoolA,
        testStudentId,
        testAcademicYearId,
      );

      const stmtInv = statement.invoices.find((i) => i.id === inv.id);
      expect(stmtInv).toBeDefined();
      expect(stmtInv!.status).toBe(InvoiceStatus.PAID);
      expect(stmtInv!.finePreview).toBeNull();
      expect(statement.summary.statusBreakdown.PAID).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 15: Concurrent Idempotent Requests (Simultaneous Execution)
  // -------------------------------------------------------------
  it('15. should handle two simultaneous concurrent requests with identical idempotency key returning the same result without duplicate payment or sequence allocation', async () => {
    const inv = await createTestInvoice({ month: 115, grossAmount: 4000 });
    const idempotencyKey = `concurrent-idem-${Date.now()}`;

    try {
      const payload = {
        studentId: testStudentId,
        academicYearId: testAcademicYearId,
        amount: 4000,
        paymentMethod: PaymentMethod.POS_CARD,
        referenceNumber: 'POS-CONC-001',
        idempotencyKey,
      };

      // Launch both requests simultaneously against PostgreSQL
      const [result1, result2] = await Promise.all([
        service.collectPayment(schoolAId, adminUserSchoolA, payload, idempotencyKey),
        service.collectPayment(schoolAId, staffUserSchoolA, payload, idempotencyKey),
      ]);

      // Both should succeed and return consistent data
      expect(result1.payment.id).toBe(result2.payment.id);
      expect(result1.receipt.receiptNumber).toBe(result2.receipt.receiptNumber);
      expect(Number(result1.payment.amount)).toBe(4000);
      expect(Number(result2.payment.amount)).toBe(4000);

      // Exactly one was original execution and the other was an idempotent replay
      const replayCount = [result1.isIdempotentReplay, result2.isIdempotentReplay].filter(Boolean).length;
      expect(replayCount).toBe(1);

      // Verify in PostgreSQL: exactly ONE payment row exists for this key
      const paymentsInDb = await prisma.payment.findMany({
        where: { schoolId: schoolAId, idempotencyKey },
      });
      expect(paymentsInDb.length).toBe(1);

      // Verify in PostgreSQL: exactly ONE receipt exists for this payment
      const receiptsInDb = await prisma.receipt.findMany({
        where: { paymentId: result1.payment.id },
      });
      expect(receiptsInDb.length).toBe(1);

      // Verify in PostgreSQL: allocations sum to exactly ₹4,000 (not doubled to ₹8,000)
      const allocationsInDb = await prisma.paymentAllocation.findMany({
        where: { invoiceId: inv.id },
      });
      const totalAllocated = allocationsInDb.reduce(
        (sum, a) => sum + Number(a.allocatedAmount),
        0,
      );
      expect(totalAllocated).toBe(4000);

      // Verify invoice status is PAID
      const updatedInv = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(updatedInv!.status).toBe(InvoiceStatus.PAID);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 16: Concurrent Requests with Same Key but Mutated Payload
  // -------------------------------------------------------------
  it('16. should reject with 409 Conflict when concurrent simultaneous requests reuse the same idempotency key with conflicting payloads', async () => {
    const inv = await createTestInvoice({ month: 116, grossAmount: 5000 });
    const idempotencyKey = `concurrent-conflict-${Date.now()}`;

    try {
      const payload1 = {
        studentId: testStudentId,
        academicYearId: testAcademicYearId,
        amount: 3000,
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey,
      };

      const payload2 = {
        studentId: testStudentId,
        academicYearId: testAcademicYearId,
        amount: 2000, // Different amount!
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey,
      };

      // Launch both requests simultaneously against PostgreSQL
      const results = await Promise.allSettled([
        service.collectPayment(schoolAId, adminUserSchoolA, payload1, idempotencyKey),
        service.collectPayment(schoolAId, staffUserSchoolA, payload2, idempotencyKey),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // One must succeed and one must be rejected with ConflictException (409)
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectionReason).toBeInstanceOf(ConflictException);

      // Exactly ONE payment row exists in DB
      const paymentsInDb = await prisma.payment.findMany({
        where: { schoolId: schoolAId, idempotencyKey },
      });
      expect(paymentsInDb.length).toBe(1);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 17: Cross-Tenant Idempotency Key Isolation
  // -------------------------------------------------------------
  it('17. should allow the same idempotency key in different schools without collision or cross-tenant leakage', async () => {
    // 1. Setup School A invoice
    const invA = await createTestInvoice({ month: 117, grossAmount: 1500 });

    // 2. Setup School B entities
    const sessionB = await prisma.academicYear.findFirst({
      where: { schoolId: schoolBId, name: '2026-2027' },
    });
    const gradeB = await prisma.gradeClass.findFirst({ where: { schoolId: schoolBId } });
    const sectionB = await prisma.section.findFirst({ where: { schoolId: schoolBId } });
    let feeHeadB = await prisma.feeHead.findFirst({ where: { schoolId: schoolBId } });
    if (!feeHeadB) {
      feeHeadB = await prisma.feeHead.create({
        data: {
          schoolId: schoolBId,
          code: 'TUIT-B-TEST',
          name: 'Tuition Fee B',
          category: 'ACADEMIC',
        },
      });
    }

    const studentB = await prisma.student.create({
      data: {
        schoolId: schoolBId,
        admissionNumber: `PAY-TEST-B-${Date.now()}`,
        firstName: 'Student',
        lastName: 'SchoolB',
        gradeId: gradeB!.id,
        sectionId: sectionB!.id,
        academicYearId: sessionB!.id,
        status: 'ACTIVE',
      },
    });

    const adminUserSchoolB = {
      id: '1115f6be-92a4-4a00-9ca3-ef27ba97b47e',
      schoolId: schoolBId,
      role: UserRole.SCHOOL_ADMIN,
    };

    const invB = await prisma.feeInvoice.create({
      data: {
        schoolId: schoolBId,
        studentId: studentB.id,
        academicYearId: sessionB!.id,
        billingMonth: 117,
        dueDate: new Date('2026-04-10T18:29:59.999Z'),
        grossAmount: new Prisma.Decimal(1500),
        discountAmount: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(1500),
        status: InvoiceStatus.DUE,
      },
    });

    await prisma.invoiceItem.create({
      data: {
        schoolId: schoolBId,
        invoiceId: invB.id,
        feeHeadId: feeHeadB.id,
        feeHeadNameSnapshot: 'Tuition Fee B',
        grossAmount: new Prisma.Decimal(1500),
        discountAmount: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(1500),
        billingFrequencySnapshot: 'MONTHLY',
      },
    });

    const sharedKey = `shared-tenant-idem-${Date.now()}`;

    try {
      // Collect payment in School A with sharedKey
      const resA = await service.collectPayment(
        schoolAId,
        adminUserSchoolA,
        {
          studentId: testStudentId,
          academicYearId: testAcademicYearId,
          amount: 1500,
          paymentMethod: PaymentMethod.CASH,
          idempotencyKey: sharedKey,
        },
        sharedKey,
      );

      // Collect payment in School B with the EXACT SAME sharedKey
      const resB = await service.collectPayment(
        schoolBId,
        adminUserSchoolB,
        {
          studentId: studentB.id,
          academicYearId: sessionB!.id,
          amount: 1500,
          paymentMethod: PaymentMethod.CASH,
          idempotencyKey: sharedKey,
        },
        sharedKey,
      );

      // Both must succeed independently
      expect(resA.payment.id).toBeDefined();
      expect(resB.payment.id).toBeDefined();
      expect(resA.payment.id).not.toBe(resB.payment.id);

      expect(resA.payment.schoolId).toBe(schoolAId);
      expect(resB.payment.schoolId).toBe(schoolBId);

      expect(resA.receipt.receiptNumber).toMatch(/^RCT-/);
      expect(resB.receipt.receiptNumber).toMatch(/^RCT-/);

      // Verify both payments exist in DB with the same idempotencyKey under different schools
      const countA = await prisma.payment.count({
        where: { schoolId: schoolAId, idempotencyKey: sharedKey },
      });
      const countB = await prisma.payment.count({
        where: { schoolId: schoolBId, idempotencyKey: sharedKey },
      });
      expect(countA).toBe(1);
      expect(countB).toBe(1);
    } finally {
      await cleanupInvoice(invA.id);
      await cleanupInvoice(invB.id);
      await prisma.student.delete({ where: { id: studentB.id } }).catch(() => {});
    }
  });

  // =========================================================================
  // TASK 4-2: PAYMENT REVERSAL ENGINE TESTS (Tests 18 - 33)
  // =========================================================================

  // -------------------------------------------------------------
  // Test 18: Full payment void with principal allocations
  // -------------------------------------------------------------
  it('18. should execute a full payment void, updating payment to VOIDED, cancelling receipt, and reverting invoice status', async () => {
    const inv = await createTestInvoice({ month: 118, grossAmount: 2500 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 2500,
      paymentMethod: PaymentMethod.CASH,
    });
    expect(payRes.payment.status).toBe(PaymentStatus.COMPLETED);
    expect(payRes.receipt.status).toBe(ReceiptStatus.ACTIVE);

    const invBeforeRev = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
    expect(invBeforeRev!.status).toBe(InvoiceStatus.PAID);

    try {
      const revRes = await service.reversePayment(
        schoolAId,
        adminUserSchoolA,
        payRes.payment.id,
        {
          reversalType: ReversalType.VOID,
          reason: 'Clerical cashier entry mistake during counter collection',
        },
      );

      expect(revRes.reversal.reversalNumber).toMatch(/^REV-/);
      expect(Number(revRes.reversal.totalAmount)).toBe(2500);
      expect(revRes.reversal.reversalType).toBe(ReversalType.VOID);
      expect(revRes.allocations.length).toBe(1);
      expect(revRes.allocations[0].allocationType).toBe(AllocationType.REVERSAL);
      expect(Number(revRes.allocations[0].allocatedAmount)).toBe(2500);
      expect(revRes.allocations[0].reversalOfAllocationId).toBe(payRes.allocations[0].id);
      expect(revRes.isIdempotentReplay).toBe(false);

      // Verify payment master updated to VOIDED with cancellation metadata
      const updatedPayment = await prisma.payment.findUnique({ where: { id: payRes.payment.id } });
      expect(updatedPayment!.status).toBe(PaymentStatus.VOIDED);
      expect(updatedPayment!.cancelledAt).toBeDefined();
      expect(updatedPayment!.cancellationReason).toBe(
        'Clerical cashier entry mistake during counter collection',
      );

      // Verify receipt status is CANCELLED
      const updatedReceipt = await prisma.receipt.findUnique({ where: { paymentId: payRes.payment.id } });
      expect(updatedReceipt!.status).toBe(ReceiptStatus.CANCELLED);

      // Verify invoice reverted to date-based status (DUE or OVERDUE, not PAID)
      const invAfterRev = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(invAfterRev!.status).not.toBe(InvoiceStatus.PAID);
      expect([InvoiceStatus.DUE, InvoiceStatus.OVERDUE, InvoiceStatus.UPCOMING]).toContain(invAfterRev!.status);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 19: Full bounce with both principal and fine allocations
  // -------------------------------------------------------------
  it('19. should execute a full bounce reversal, marking payment BOUNCED, cancelling receipt, and reverting fine to OUTSTANDING', async () => {
    const inv = await createTestInvoice({ month: 119, grossAmount: 3000 });
    const fine = await createAssessedFine(inv.id, 200);

    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 3200,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
    });
    expect(payRes.allocations.length).toBe(2);

    const fineBefore = await prisma.assessedFine.findUnique({ where: { id: fine.id } });
    expect(fineBefore!.status).toBe(AssessedFineStatus.PAID);

    try {
      const revRes = await service.reversePayment(
        schoolAId,
        adminUserSchoolA,
        payRes.payment.id,
        {
          reversalType: ReversalType.BOUNCE,
          reason: 'Bank transfer failed realization / NSF dishonor',
        },
      );

      expect(revRes.reversal.reversalType).toBe(ReversalType.BOUNCE);
      expect(Number(revRes.reversal.totalAmount)).toBe(3200);
      expect(revRes.allocations.length).toBe(2);

      // Payment status must be BOUNCED
      const updatedPayment = await prisma.payment.findUnique({ where: { id: payRes.payment.id } });
      expect(updatedPayment!.status).toBe(PaymentStatus.BOUNCED);

      // Receipt must be CANCELLED
      const updatedReceipt = await prisma.receipt.findUnique({ where: { paymentId: payRes.payment.id } });
      expect(updatedReceipt!.status).toBe(ReceiptStatus.CANCELLED);

      // Fine status must revert from PAID to OUTSTANDING
      const fineAfter = await prisma.assessedFine.findUnique({ where: { id: fine.id } });
      expect(fineAfter!.status).toBe(AssessedFineStatus.OUTSTANDING);

      // Invoice status must revert to DUE or OVERDUE
      const invAfter = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(invAfter!.status).not.toBe(InvoiceStatus.PAID);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 20: Partial correction of one allocation
  // -------------------------------------------------------------
  it('20. should execute a partial CORRECTION reversal, keeping payment COMPLETED and receipt ACTIVE', async () => {
    // Invoice with 2 items
    const inv = await createTestInvoice({ month: 120, grossAmount: 2000 });
    const head2 = await prisma.feeHead.findFirst({
      where: { schoolId: schoolAId, code: 'TRN' },
    });
    const item2 = await prisma.invoiceItem.create({
      data: {
        schoolId: schoolAId,
        invoiceId: inv.id,
        feeHeadId: head2 ? head2.id : testFeeHeadId,
        feeHeadNameSnapshot: 'Transport Fee',
        grossAmount: new Prisma.Decimal(1000),
        discountAmount: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(1000),
        billingFrequencySnapshot: 'MONTHLY',
      },
    });
    await prisma.feeInvoice.update({
      where: { id: inv.id },
      data: { grossAmount: new Prisma.Decimal(3000), netAmount: new Prisma.Decimal(3000) },
    });

    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 3000,
      paymentMethod: PaymentMethod.CASH,
    });
    expect(payRes.allocations.length).toBe(2);

    const allocToReverse = payRes.allocations.find((a) => a.invoiceItemId === item2.id);
    expect(allocToReverse).toBeDefined();

    try {
      const revRes = await service.reversePayment(
        schoolAId,
        adminUserSchoolA,
        payRes.payment.id,
        {
          reversalType: ReversalType.CORRECTION,
          reason: 'Erroneous transport fee charged to student',
          allocations: [
            {
              allocationId: allocToReverse!.id,
              amount: 1000,
            },
          ],
        },
      );

      expect(revRes.reversal.reversalType).toBe(ReversalType.CORRECTION);
      expect(Number(revRes.reversal.totalAmount)).toBe(1000);
      expect(revRes.allocations.length).toBe(1);

      // Payment master must stay COMPLETED because 2000 remains active
      const updatedPayment = await prisma.payment.findUnique({ where: { id: payRes.payment.id } });
      expect(updatedPayment!.status).toBe(PaymentStatus.COMPLETED);

      // Receipt must stay ACTIVE
      const updatedReceipt = await prisma.receipt.findUnique({ where: { paymentId: payRes.payment.id } });
      expect(updatedReceipt!.status).toBe(ReceiptStatus.ACTIVE);

      // Invoice must transition to PARTIALLY_PAID
      const invAfter = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(invAfter!.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 21: Multiple corrections whose cumulative amount equals original allocation
  // -------------------------------------------------------------
  it('21. should support multiple successive corrections on the same allocation up to its full amount', async () => {
    const inv = await createTestInvoice({ month: 121, grossAmount: 1500 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1500,
      paymentMethod: PaymentMethod.CASH,
    });
    const originalAlloc = payRes.allocations[0];

    try {
      // Step 1: Reverse 500
      const rev1 = await service.reversePayment(
        schoolAId,
        adminUserSchoolA,
        payRes.payment.id,
        {
          reversalType: ReversalType.CORRECTION,
          reason: 'Correction step 1: reversing 500 of 1500',
          allocations: [{ allocationId: originalAlloc.id, amount: 500 }],
        },
      );
      expect(Number(rev1.reversal.totalAmount)).toBe(500);

      const payAfter1 = await prisma.payment.findUnique({ where: { id: payRes.payment.id } });
      expect(payAfter1!.status).toBe(PaymentStatus.COMPLETED);

      // Step 2: Reverse remaining 1000
      const rev2 = await service.reversePayment(
        schoolAId,
        adminUserSchoolA,
        payRes.payment.id,
        {
          reversalType: ReversalType.CORRECTION,
          reason: 'Correction step 2: reversing remaining 1000',
          allocations: [{ allocationId: originalAlloc.id, amount: 1000 }],
        },
      );
      expect(Number(rev2.reversal.totalAmount)).toBe(1000);

      // Now that all 1500 is reversed, payment transitions to VOIDED and receipt to CANCELLED
      const payAfter2 = await prisma.payment.findUnique({ where: { id: payRes.payment.id } });
      expect(payAfter2!.status).toBe(PaymentStatus.VOIDED);

      const rctAfter2 = await prisma.receipt.findUnique({ where: { paymentId: payRes.payment.id } });
      expect(rctAfter2!.status).toBe(ReceiptStatus.CANCELLED);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 22: Rejection of a reversal that exceeds unreversed original allocation
  // -------------------------------------------------------------
  it('22. should reject any reversal attempt exceeding the unreversed balance of an allocation', async () => {
    const inv = await createTestInvoice({ month: 122, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });
    const originalAlloc = payRes.allocations[0];

    try {
      // 1. Attempt to reverse 1200 on 1000 allocation
      await expect(
        service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, {
          reversalType: ReversalType.CORRECTION,
          reason: 'Attempting over-reversal on allocation',
          allocations: [{ allocationId: originalAlloc.id, amount: 1200 }],
        }),
      ).rejects.toThrow(BadRequestException);

      // 2. Reverse 600 (succeeds, 400 remains)
      await service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, {
        reversalType: ReversalType.CORRECTION,
        reason: 'Legitimate partial reversal of 600',
        allocations: [{ allocationId: originalAlloc.id, amount: 600 }],
      });

      // 3. Attempt to reverse 500 when only 400 remains unreversed
      await expect(
        service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, {
          reversalType: ReversalType.CORRECTION,
          reason: 'Attempting to reverse 500 when 400 remains',
          allocations: [{ allocationId: originalAlloc.id, amount: 500 }],
        }),
      ).rejects.toThrow(BadRequestException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 23: Reversal of fine allocation and AssessedFine.status transitions
  // -------------------------------------------------------------
  it('23. should accurately reconcile AssessedFine.status through partial and full fine reversals', async () => {
    const inv = await createTestInvoice({ month: 123, grossAmount: 1000 });
    const fine = await createAssessedFine(inv.id, 400);

    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1400,
      paymentMethod: PaymentMethod.CASH,
    });

    const fineAlloc = payRes.allocations.find((a) => a.allocationType === AllocationType.FINE);
    expect(fineAlloc).toBeDefined();

    try {
      // Step 1: Reverse 150 of the 400 fine -> status should become PARTIALLY_PAID
      await service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, {
        reversalType: ReversalType.CORRECTION,
        reason: 'Partial fine reversal of 150 out of 400',
        allocations: [{ allocationId: fineAlloc!.id, amount: 150 }],
      });

      const fineAfterPart = await prisma.assessedFine.findUnique({ where: { id: fine.id } });
      expect(fineAfterPart!.status).toBe(AssessedFineStatus.PARTIALLY_PAID);

      // Step 2: Reverse remaining 250 -> status should revert to OUTSTANDING
      await service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, {
        reversalType: ReversalType.CORRECTION,
        reason: 'Remaining fine reversal of 250',
        allocations: [{ allocationId: fineAlloc!.id, amount: 250 }],
      });

      const fineAfterFull = await prisma.assessedFine.findUnique({ where: { id: fine.id } });
      expect(fineAfterFull!.status).toBe(AssessedFineStatus.OUTSTANDING);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 24: Invoice status returning to date-derived state (OVERDUE) after full reversal
  // -------------------------------------------------------------
  it('24. should revert an invoice to OVERDUE when a payment on a past-due invoice is fully reversed', async () => {
    const pastDueDate = new Date('2026-01-10T18:29:59.999Z');
    const inv = await createTestInvoice({
      month: 124,
      grossAmount: 2000,
      dueDate: pastDueDate,
    });

    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 2000,
      paymentMethod: PaymentMethod.CASH,
    });
    const invPaid = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
    expect(invPaid!.status).toBe(InvoiceStatus.PAID);

    try {
      await service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, {
        reversalType: ReversalType.VOID,
        reason: 'Voiding payment on past-due invoice',
      });

      const invAfterVoid = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(invAfterVoid!.status).toBe(InvoiceStatus.OVERDUE);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 25: Same-key, same-payload idempotent replay
  // -------------------------------------------------------------
  it('25. should safely return idempotent replay when the same reversal request is retried with identical payload', async () => {
    const inv = await createTestInvoice({ month: 125, grossAmount: 2000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 2000,
      paymentMethod: PaymentMethod.CASH,
    });

    const key = `rev-idem-${Date.now()}`;
    const payload = {
      reversalType: ReversalType.VOID,
      reason: 'Idempotency test reversal reason',
      idempotencyKey: key,
    };

    try {
      const res1 = await service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, payload, key);
      expect(res1.isIdempotentReplay).toBe(false);

      const res2 = await service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, payload, key);
      expect(res2.isIdempotentReplay).toBe(true);
      expect(res2.reversal.id).toBe(res1.reversal.id);
      expect(res2.reversal.reversalNumber).toBe(res1.reversal.reversalNumber);

      const countInDb = await prisma.paymentReversal.count({ where: { schoolId: schoolAId, idempotencyKey: key } });
      expect(countInDb).toBe(1);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 26: Same-key, different-payload conflict (HTTP 409)
  // -------------------------------------------------------------
  it('26. should reject with 409 Conflict when a reversal idempotency key is reused with a mutated payload', async () => {
    const inv = await createTestInvoice({ month: 126, grossAmount: 2000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 2000,
      paymentMethod: PaymentMethod.CASH,
    });

    const key = `rev-conflict-${Date.now()}`;

    try {
      await service.reversePayment(
        schoolAId,
        adminUserSchoolA,
        payRes.payment.id,
        {
          reversalType: ReversalType.VOID,
          reason: 'Initial payload with reason AAAAAAAAA',
          idempotencyKey: key,
        },
        key,
      );

      await expect(
        service.reversePayment(
          schoolAId,
          adminUserSchoolA,
          payRes.payment.id,
          {
            reversalType: ReversalType.VOID,
            reason: 'Mutated payload with reason BBBBBBBBB',
            idempotencyKey: key,
          },
          key,
        ),
      ).rejects.toThrow(ConflictException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 27: Concurrent duplicate reversal requests (Simultaneous Execution)
  // -------------------------------------------------------------
  it('27. should handle two simultaneous concurrent reversal requests with identical key without creating duplicates', async () => {
    const inv = await createTestInvoice({ month: 127, grossAmount: 3500 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 3500,
      paymentMethod: PaymentMethod.CASH,
    });

    const key = `rev-concurrent-${Date.now()}`;
    const payload = {
      reversalType: ReversalType.VOID,
      reason: 'Concurrent reversal test reason',
      idempotencyKey: key,
    };

    try {
      const [r1, r2] = await Promise.all([
        service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, payload, key),
        service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, payload, key),
      ]);

      expect(r1.reversal.id).toBe(r2.reversal.id);
      expect(r1.reversal.reversalNumber).toBe(r2.reversal.reversalNumber);

      const replayFlags = [r1.isIdempotentReplay, r2.isIdempotentReplay];
      expect(replayFlags).toContain(false);
      expect(replayFlags).toContain(true);

      const dbReversals = await prisma.paymentReversal.findMany({
        where: { schoolId: schoolAId, paymentId: payRes.payment.id },
      });
      expect(dbReversals.length).toBe(1);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 28: Concurrent attempts to reverse the same allocation beyond allowed amount
  // -------------------------------------------------------------
  it('28. should serialize concurrent reversal attempts on the same allocation and reject the second when headroom is exhausted', async () => {
    const inv = await createTestInvoice({ month: 128, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });
    const originalAlloc = payRes.allocations[0];

    try {
      const p1 = service.reversePayment(
        schoolAId,
        adminUserSchoolA,
        payRes.payment.id,
        {
          reversalType: ReversalType.CORRECTION,
          reason: 'Concurrent reversal attempt 1: 600',
          idempotencyKey: `conc-alloc-1-${Date.now()}`,
          allocations: [{ allocationId: originalAlloc.id, amount: 600 }],
        },
      );

      const p2 = service.reversePayment(
        schoolAId,
        adminUserSchoolA,
        payRes.payment.id,
        {
          reversalType: ReversalType.CORRECTION,
          reason: 'Concurrent reversal attempt 2: 600',
          idempotencyKey: `conc-alloc-2-${Date.now()}`,
          allocations: [{ allocationId: originalAlloc.id, amount: 600 }],
        },
      );

      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Verify DB total reversed allocations is exactly 600
      const revAllocs = await prisma.paymentAllocation.findMany({
        where: { paymentId: payRes.payment.id, allocationType: AllocationType.REVERSAL },
      });
      const totalReversedInDb = revAllocs.reduce((sum, r) => sum.add(r.allocatedAmount), new Prisma.Decimal(0));
      expect(totalReversedInDb.toNumber()).toBe(600);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 29: Cross-tenant payment access rejection
  // -------------------------------------------------------------
  it('29. should strictly reject attempts to reverse a School A payment using School B context', async () => {
    const inv = await createTestInvoice({ month: 129, grossAmount: 1500 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1500,
      paymentMethod: PaymentMethod.CASH,
    });

    const adminUserSchoolB = {
      id: '00000000-0000-0000-0000-000000000021',
      schoolId: schoolBId,
      role: UserRole.SCHOOL_ADMIN,
    };

    try {
      await expect(
        service.reversePayment(schoolBId, adminUserSchoolB, payRes.payment.id, {
          reversalType: ReversalType.VOID,
          reason: 'Cross-tenant illegal reversal attempt',
        }),
      ).rejects.toThrow(NotFoundException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 30: Unauthorized roles rejection (FEE_STAFF, STUDENT, PARENT)
  // -------------------------------------------------------------
  it('30. should strictly forbid FEE_STAFF, STUDENT, and PARENT from reversing payments', async () => {
    const inv = await createTestInvoice({ month: 130, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    const dummyPayload = {
      reversalType: ReversalType.VOID,
      reason: 'Unauthorized attempt to reverse payment',
    };

    try {
      // Fee staff
      await expect(
        service.reversePayment(schoolAId, staffUserSchoolA, payRes.payment.id, dummyPayload),
      ).rejects.toThrow(ForbiddenException);

      // Student
      await expect(
        service.reversePayment(schoolAId, studentUser, payRes.payment.id, dummyPayload),
      ).rejects.toThrow(ForbiddenException);

      // Parent
      await expect(
        service.reversePayment(schoolAId, parentUser, payRes.payment.id, dummyPayload),
      ).rejects.toThrow(ForbiddenException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 31: Transaction rollback on failure
  // -------------------------------------------------------------
  it('31. should roll back completely if any reversal step fails, leaving zero orphaned records', async () => {
    const inv = await createTestInvoice({ month: 131, grossAmount: 1200 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1200,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      // Pass a non-existent UUID allocation ID in CORRECTION
      await expect(
        service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, {
          reversalType: ReversalType.CORRECTION,
          reason: 'Intentional failure with non-existent allocation',
          allocations: [{ allocationId: '00000000-0000-0000-0000-000000000099', amount: 500 }],
        }),
      ).rejects.toThrow(BadRequestException);

      // Confirm zero reversals were created
      const reversals = await prisma.paymentReversal.findMany({ where: { paymentId: payRes.payment.id } });
      expect(reversals.length).toBe(0);

      // Confirm zero compensating allocations were created
      const compAllocs = await prisma.paymentAllocation.findMany({
        where: { paymentId: payRes.payment.id, allocationType: AllocationType.REVERSAL },
      });
      expect(compAllocs.length).toBe(0);

      // Payment remains COMPLETED
      const pay = await prisma.payment.findUnique({ where: { id: payRes.payment.id } });
      expect(pay!.status).toBe(PaymentStatus.COMPLETED);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 32: Full reversal after partial payment history
  // -------------------------------------------------------------
  it('32. should restore PARTIALLY_PAID status when one of multiple payments on an invoice is reversed', async () => {
    const futureDueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const inv = await createTestInvoice({ month: 132, grossAmount: 3000, dueDate: futureDueDate });

    // Payment 1: 1000 -> invoice is PARTIALLY_PAID
    const pay1 = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });
    const invAfter1 = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
    expect(invAfter1!.status).toBe(InvoiceStatus.PARTIALLY_PAID);

    // Payment 2: 2000 -> invoice is PAID
    const pay2 = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 2000,
      paymentMethod: PaymentMethod.CASH,
    });
    const invAfter2 = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
    expect(invAfter2!.status).toBe(InvoiceStatus.PAID);

    try {
      // Reverse Payment 2 in full -> invoice should drop back to PARTIALLY_PAID (1000 from Pay 1 still active)
      await service.reversePayment(schoolAId, adminUserSchoolA, pay2.payment.id, {
        reversalType: ReversalType.VOID,
        reason: 'Voiding second payment of 2000',
      });

      const invAfterRev2 = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(invAfterRev2!.status).toBe(InvoiceStatus.PARTIALLY_PAID);

      // Now reverse Payment 1 in full -> invoice should revert to DUE (0 active paid)
      await service.reversePayment(schoolAId, adminUserSchoolA, pay1.payment.id, {
        reversalType: ReversalType.VOID,
        reason: 'Voiding first payment of 1000',
      });

      const invAfterRev1 = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(invAfterRev1!.status).toBe(InvoiceStatus.DUE);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 33: Receipt status and sequence counter integrity
  // -------------------------------------------------------------
  it('33. should generate strictly monotonic reversal numbers for consecutive reversals in the same academic year', async () => {
    const inv1 = await createTestInvoice({ month: 133, grossAmount: 1000 });
    const inv2 = await createTestInvoice({ month: 134, grossAmount: 1000 });

    const pay1 = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });
    const pay2 = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      const rev1 = await service.reversePayment(schoolAId, adminUserSchoolA, pay1.payment.id, {
        reversalType: ReversalType.VOID,
        reason: 'Consecutive reversal test 1',
      });
      const rev2 = await service.reversePayment(schoolAId, adminUserSchoolA, pay2.payment.id, {
        reversalType: ReversalType.VOID,
        reason: 'Consecutive reversal test 2',
      });

      expect(rev1.reversal.reversalNumber).toMatch(/^REV-/);
      expect(rev2.reversal.reversalNumber).toMatch(/^REV-/);

      const seq1 = parseInt(rev1.reversal.reversalNumber.split('-')[2], 10);
      const seq2 = parseInt(rev2.reversal.reversalNumber.split('-')[2], 10);
      expect(seq2).toBe(seq1 + 1);
    } finally {
      await cleanupInvoice(inv1.id);
      await cleanupInvoice(inv2.id);
    }
  });

  // =============================================================
  // PHASE 2E — TASK 4-3: REFUND ENGINE TESTS (34 - 53)
  // =============================================================

  // -------------------------------------------------------------
  // Test 34: Partial principal refund transitions payment to PARTIALLY_REFUNDED and invoice to PARTIALLY_PAID while keeping receipt ACTIVE
  // -------------------------------------------------------------
  it('34. should execute partial principal refund, transitioning payment to PARTIALLY_REFUNDED and invoice to PARTIALLY_PAID while keeping receipt ACTIVE', async () => {
    const inv = await createTestInvoice({ month: 134, grossAmount: 3000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 3000,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      const refRes = await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 1000,
        reason: 'Authorized partial fee refund for student',
      });

      expect(refRes.refund).toBeDefined();
      expect(refRes.refund.status).toBe(RefundStatus.SUCCEEDED);
      expect(Number(refRes.refund.refundAmount)).toBe(1000);
      expect(refRes.allocations.length).toBe(1);
      expect(Number(refRes.allocations[0].amount)).toBe(1000);

      // Verify payment status
      const updatedPay = await prisma.payment.findUnique({
        where: { id: payRes.payment.id },
        include: { receipt: true },
      });
      expect(updatedPay!.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(updatedPay!.receipt!.status).toBe(ReceiptStatus.ACTIVE);

      // Verify invoice status reverted to PARTIALLY_PAID
      const updatedInv = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(updatedInv!.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 35: Full principal refund transitions payment to REFUNDED, cancels receipt, and reverts invoice
  // -------------------------------------------------------------
  it('35. should execute full principal refund, transitioning payment to REFUNDED, cancelling receipt, and reverting invoice to date-derived status', async () => {
    const futureDueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const inv = await createTestInvoice({ month: 135, grossAmount: 2500, dueDate: futureDueDate });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 2500,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      const refRes = await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 2500,
        reason: 'Authorized full fee refund for student transfer',
      });

      expect(refRes.refund.status).toBe(RefundStatus.SUCCEEDED);

      const updatedPay = await prisma.payment.findUnique({
        where: { id: payRes.payment.id },
        include: { receipt: true },
      });
      expect(updatedPay!.status).toBe(PaymentStatus.REFUNDED);
      expect(updatedPay!.receipt!.status).toBe(ReceiptStatus.CANCELLED);

      const updatedInv = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(updatedInv!.status).toBe(InvoiceStatus.DUE);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 36: Fine refund reconciles AssessedFine status
  // -------------------------------------------------------------
  it('36. should accurately reconcile AssessedFine status through partial and full fine refunds', async () => {
    const inv = await createTestInvoice({ month: 136, grossAmount: 1000 });
    const fine = await prisma.assessedFine.create({
      data: {
        schoolId: schoolAId,
        invoiceId: inv.id,
        assessedAmount: 200,
        asOfDate: new Date(),
        overdueDays: 10,
        status: AssessedFineStatus.OUTSTANDING,
        calculationSnapshot: { overdueDays: 10, finePerDay: 20 },
      },
    });

    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1200,
      paymentMethod: PaymentMethod.CASH,
    });

    const fineAlloc = payRes.allocations.find((a) => a.assessedFineId === fine.id);
    expect(fineAlloc).toBeDefined();

    try {
      // 1. Partial fine refund: 50
      await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 50,
        reason: 'Partial fine refund due to waiver dispute',
        allocations: [{ allocationId: fineAlloc!.id, amount: 50 }],
      });

      const fineAfterPartial = await prisma.assessedFine.findUnique({ where: { id: fine.id } });
      expect(fineAfterPartial!.status).toBe(AssessedFineStatus.PARTIALLY_PAID);

      const invAfterPartial = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(invAfterPartial!.status).toBe(InvoiceStatus.PARTIALLY_PAID);

      // 2. Full remaining fine refund: 150
      await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 150,
        reason: 'Full remaining fine refund granted',
        allocations: [{ allocationId: fineAlloc!.id, amount: 150 }],
      });

      const fineAfterFull = await prisma.assessedFine.findUnique({ where: { id: fine.id } });
      expect(fineAfterFull!.status).toBe(AssessedFineStatus.OUTSTANDING);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 37: Over-refund rejection
  // -------------------------------------------------------------
  it('37. should reject refund attempt exceeding remaining available allocation headroom with 400 BadRequestException', async () => {
    const inv = await createTestInvoice({ month: 137, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      await expect(
        service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
          amount: 1001,
          reason: 'Excessive refund attempt exceeding payment headroom',
        }),
      ).rejects.toThrow(BadRequestException);

      const dbRefunds = await prisma.paymentRefund.findMany({
        where: { paymentId: payRes.payment.id },
      });
      expect(dbRefunds.length).toBe(0);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 38: Multiple partial refunds cumulative limit
  // -------------------------------------------------------------
  it('38. should allow successive partial refunds up to allocation amount and reject any further refund attempt beyond limit', async () => {
    const inv = await createTestInvoice({ month: 138, grossAmount: 2000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 2000,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      // Partial refund 1: 800 (Remaining = 1200)
      await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 800,
        reason: 'First successive partial refund test',
      });

      // Partial refund 2: 700 (Remaining = 500)
      await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 700,
        reason: 'Second successive partial refund test',
      });

      // Partial refund 3: 600 (Exceeds remaining 500 -> rejected)
      await expect(
        service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
          amount: 600,
          reason: 'Third excessive partial refund test',
        }),
      ).rejects.toThrow(BadRequestException);

      // Partial refund 4: 500 (Exact remaining balance -> succeeds and finishes payment)
      await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 500,
        reason: 'Final exact partial refund test',
      });

      const updatedPay = await prisma.payment.findUnique({
        where: { id: payRes.payment.id },
        include: { receipt: true },
      });
      expect(updatedPay!.status).toBe(PaymentStatus.REFUNDED);
      expect(updatedPay!.receipt!.status).toBe(ReceiptStatus.CANCELLED);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 39: PENDING refund reserves allocation headroom without decrementing invoice net paid
  // -------------------------------------------------------------
  it('39. should reserve allocation headroom for PENDING refund without prematurely decrementing invoice net paid', async () => {
    const inv = await createTestInvoice({ month: 139, grossAmount: 2000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 2000,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      const refRes = await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 800,
        reason: 'Pending payout refund waiting for bank authorization',
        status: RefundStatus.PENDING,
      });

      expect(refRes.refund.status).toBe(RefundStatus.PENDING);

      // Payment remains COMPLETED
      const pay = await prisma.payment.findUnique({ where: { id: payRes.payment.id } });
      expect(pay!.status).toBe(PaymentStatus.COMPLETED);

      // Invoice remains PAID (funds not confirmed out yet)
      const invAfterPending = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(invAfterPending!.status).toBe(InvoiceStatus.PAID);

      // Headroom is reserved: remaining is 1200, so attempting 1300 must reject
      await expect(
        service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
          amount: 1300,
          reason: 'Excessive refund beyond reserved headroom',
        }),
      ).rejects.toThrow(BadRequestException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 40: Confirming PENDING refund transitions to SUCCEEDED and updates statuses
  // -------------------------------------------------------------
  it('40. should confirm PENDING refund transitioning status to SUCCEEDED and updating payment and invoice statuses', async () => {
    const inv = await createTestInvoice({ month: 140, grossAmount: 2000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 2000,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      const pendingRef = await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 800,
        reason: 'Pending refund awaiting gateway confirmation',
        status: RefundStatus.PENDING,
      });

      const confirmedRef = await service.confirmRefund(schoolAId, adminUserSchoolA, pendingRef.refund.id, {
        referenceNumber: 'BANK-UTR-CONFIRM-40',
      });

      expect(confirmedRef.status).toBe(RefundStatus.SUCCEEDED);
      expect(confirmedRef.processedAt).toBeDefined();
      expect(confirmedRef.processedByUserId).toBe(adminUserSchoolA.id);
      expect(confirmedRef.referenceNumber).toBe('BANK-UTR-CONFIRM-40');

      const updatedPay = await prisma.payment.findUnique({ where: { id: payRes.payment.id } });
      expect(updatedPay!.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);

      const updatedInv = await prisma.feeInvoice.findUnique({ where: { id: inv.id } });
      expect(updatedInv!.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 41: Failed PENDING refund transitions to FAILED and frees reserved allocation headroom
  // -------------------------------------------------------------
  it('41. should mark PENDING refund as FAILED and free reserved allocation headroom', async () => {
    const inv = await createTestInvoice({ month: 141, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      const pendingRef = await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 600,
        reason: 'Pending refund to test gateway failure',
        status: RefundStatus.PENDING,
      });

      const failedRef = await service.failRefund(schoolAId, adminUserSchoolA, pendingRef.refund.id, {
        reason: 'Bank account number invalid',
      });

      expect(failedRef.status).toBe(RefundStatus.FAILED);
      expect(failedRef.failureReason).toBe('Bank account number invalid');

      // Headroom freed: full 1000 can now be refunded
      const newRef = await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 1000,
        reason: 'Subsequent refund after previous failure',
      });
      expect(newRef.refund.status).toBe(RefundStatus.SUCCEEDED);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 42: Cancelled PENDING refund transitions to CANCELLED and frees reserved allocation headroom
  // -------------------------------------------------------------
  it('42. should cancel PENDING refund and free reserved allocation headroom', async () => {
    const inv = await createTestInvoice({ month: 142, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      const pendingRef = await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 500,
        reason: 'Pending refund to test admin cancellation',
        status: RefundStatus.PENDING,
      });

      const cancelledRef = await service.cancelRefund(schoolAId, adminUserSchoolA, pendingRef.refund.id, {
        reason: 'Payer opted for fee adjustment instead of cash refund',
      });

      expect(cancelledRef.status).toBe(RefundStatus.CANCELLED);
      expect(cancelledRef.failureReason).toBe('Payer opted for fee adjustment instead of cash refund');

      // Headroom freed: full 1000 can now be refunded
      const newRef = await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 1000,
        reason: 'Subsequent refund after previous cancellation',
      });
      expect(newRef.refund.status).toBe(RefundStatus.SUCCEEDED);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 43: Reject confirmation/failure/cancellation on already finalized refund
  // -------------------------------------------------------------
  it('43. should reject confirmation, failure, or cancellation attempts on already finalized refund', async () => {
    const inv = await createTestInvoice({ month: 143, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      const succeededRef = await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 300,
        reason: 'Immediate succeeded refund for finalization testing',
      });

      await expect(
        service.confirmRefund(schoolAId, adminUserSchoolA, succeededRef.refund.id),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.failRefund(schoolAId, adminUserSchoolA, succeededRef.refund.id),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.cancelRefund(schoolAId, adminUserSchoolA, succeededRef.refund.id),
      ).rejects.toThrow(BadRequestException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 44: Reject refund on VOIDED or BOUNCED payment
  // -------------------------------------------------------------
  it('44. should reject refund on a VOIDED or BOUNCED payment with 400 BadRequestException', async () => {
    const inv = await createTestInvoice({ month: 144, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      // Void the payment
      await service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, {
        reversalType: ReversalType.VOID,
        reason: 'Voiding payment before refund attempt test',
      });

      // Attempt to refund voided payment
      await expect(
        service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
          amount: 500,
          reason: 'Attempting illegal refund on voided payment',
        }),
      ).rejects.toThrow(BadRequestException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 45: Idempotent replay returns cached response
  // -------------------------------------------------------------
  it('45. should safely return idempotent replay when the same refund request is retried with identical payload', async () => {
    const inv = await createTestInvoice({ month: 145, grossAmount: 1500 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1500,
      paymentMethod: PaymentMethod.CASH,
    });

    const key = `ref-idem-${Date.now()}`;
    const payload = {
      amount: 500,
      reason: 'Idempotent refund retry test payload',
      idempotencyKey: key,
    };

    try {
      const res1 = await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, payload, key);
      expect(res1.isIdempotentReplay).toBe(false);

      const res2 = await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, payload, key);
      expect(res2.isIdempotentReplay).toBe(true);
      expect(res2.refund.id).toBe(res1.refund.id);

      const dbRefunds = await prisma.paymentRefund.findMany({
        where: { schoolId: schoolAId, paymentId: payRes.payment.id },
      });
      expect(dbRefunds.length).toBe(1);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 46: Idempotency conflict
  // -------------------------------------------------------------
  it('46. should reject with 409 Conflict when a refund idempotency key is reused with a mutated payload', async () => {
    const inv = await createTestInvoice({ month: 146, grossAmount: 1500 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1500,
      paymentMethod: PaymentMethod.CASH,
    });

    const key = `ref-conflict-${Date.now()}`;

    try {
      await service.createRefund(
        schoolAId,
        adminUserSchoolA,
        payRes.payment.id,
        {
          amount: 500,
          reason: 'Initial refund payload with reason AAAAAAAAA',
          idempotencyKey: key,
        },
        key,
      );

      await expect(
        service.createRefund(
          schoolAId,
          adminUserSchoolA,
          payRes.payment.id,
          {
            amount: 600,
            reason: 'Mutated refund payload with reason BBBBBBBBB',
            idempotencyKey: key,
          },
          key,
        ),
      ).rejects.toThrow(ConflictException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 47: Concurrent duplicate refund requests
  // -------------------------------------------------------------
  it('47. should handle two simultaneous concurrent refund requests with identical key without creating duplicates', async () => {
    const inv = await createTestInvoice({ month: 147, grossAmount: 2000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 2000,
      paymentMethod: PaymentMethod.CASH,
    });

    const key = `ref-concurrent-${Date.now()}`;
    const payload = {
      amount: 600,
      reason: 'Concurrent simultaneous refund test',
      idempotencyKey: key,
    };

    try {
      const [r1, r2] = await Promise.all([
        service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, payload, key),
        service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, payload, key),
      ]);

      expect(r1.refund.id).toBe(r2.refund.id);
      const replayFlags = [r1.isIdempotentReplay, r2.isIdempotentReplay];
      expect(replayFlags).toContain(false);
      expect(replayFlags).toContain(true);

      const dbRefunds = await prisma.paymentRefund.findMany({
        where: { schoolId: schoolAId, paymentId: payRes.payment.id },
      });
      expect(dbRefunds.length).toBe(1);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 48: Concurrent attempts to refund the same allocation beyond allowed amount
  // -------------------------------------------------------------
  it('48. should serialize concurrent refund attempts on the same allocation and reject the second when headroom is exhausted', async () => {
    const inv = await createTestInvoice({ month: 148, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });
    const originalAlloc = payRes.allocations[0];

    try {
      const p1 = service.createRefund(
        schoolAId,
        adminUserSchoolA,
        payRes.payment.id,
        {
          amount: 600,
          reason: 'Concurrent refund attempt 1 for 600',
          idempotencyKey: `conc-ref-alloc-1-${Date.now()}`,
          allocations: [{ allocationId: originalAlloc.id, amount: 600 }],
        },
      );

      const p2 = service.createRefund(
        schoolAId,
        adminUserSchoolA,
        payRes.payment.id,
        {
          amount: 600,
          reason: 'Concurrent refund attempt 2 for 600',
          idempotencyKey: `conc-ref-alloc-2-${Date.now()}`,
          allocations: [{ allocationId: originalAlloc.id, amount: 600 }],
        },
      );

      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const dbRefunds = await prisma.paymentRefund.findMany({
        where: { paymentId: payRes.payment.id },
      });
      expect(dbRefunds.length).toBe(1);
      expect(Number(dbRefunds[0].refundAmount)).toBe(600);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 49: Cross-tenant payment refund rejection
  // -------------------------------------------------------------
  it('49. should strictly reject attempts to refund a School A payment using School B context', async () => {
    const inv = await createTestInvoice({ month: 149, grossAmount: 1200 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1200,
      paymentMethod: PaymentMethod.CASH,
    });

    const adminUserSchoolB = {
      id: '00000000-0000-0000-0000-000000000021',
      schoolId: schoolBId,
      role: UserRole.SCHOOL_ADMIN,
    };

    try {
      await expect(
        service.createRefund(schoolBId, adminUserSchoolB, payRes.payment.id, {
          amount: 500,
          reason: 'Illegal cross-tenant refund attempt',
        }),
      ).rejects.toThrow(NotFoundException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 50: Unauthorized roles rejection (FEE_STAFF, STUDENT, PARENT)
  // -------------------------------------------------------------
  it('50. should strictly forbid FEE_STAFF, STUDENT, and PARENT from creating refunds', async () => {
    const inv = await createTestInvoice({ month: 150, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    const dummyPayload = {
      amount: 300,
      reason: 'Unauthorized refund execution attempt',
    };

    try {
      await expect(
        service.createRefund(schoolAId, staffUserSchoolA, payRes.payment.id, dummyPayload),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.createRefund(schoolAId, studentUser, payRes.payment.id, dummyPayload),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.createRefund(schoolAId, parentUser, payRes.payment.id, dummyPayload),
      ).rejects.toThrow(ForbiddenException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 51: Transaction rollback on failure
  // -------------------------------------------------------------
  it('51. should roll back completely if any refund step fails, leaving zero orphaned records', async () => {
    const inv = await createTestInvoice({ month: 151, grossAmount: 1200 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1200,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      await expect(
        service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
          amount: 500,
          reason: 'Intentional failure with non-existent allocation id',
          allocations: [{ allocationId: '00000000-0000-0000-0000-000000000099', amount: 500 }],
        }),
      ).rejects.toThrow(BadRequestException);

      const dbRefunds = await prisma.paymentRefund.findMany({
        where: { paymentId: payRes.payment.id },
      });
      expect(dbRefunds.length).toBe(0);

      const refAllocs = await prisma.paymentRefundAllocation.findMany({
        where: { schoolId: schoolAId, paymentRefund: { paymentId: payRes.payment.id } },
      });
      expect(refAllocs.length).toBe(0);

      const pay = await prisma.payment.findUnique({ where: { id: payRes.payment.id } });
      expect(pay!.status).toBe(PaymentStatus.COMPLETED);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 52: Symmetric accounting: Reversal after refund respects remaining headroom
  // -------------------------------------------------------------
  it('52. should ensure reversals respect headroom reduced by refunds (cannot reverse already refunded money)', async () => {
    const inv = await createTestInvoice({ month: 152, grossAmount: 2000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 2000,
      paymentMethod: PaymentMethod.CASH,
    });
    const originalAlloc = payRes.allocations[0];

    try {
      // 1. Refund 800 (Remaining = 1200)
      await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 800,
        reason: 'Authorized partial refund of 800 before reversal',
        allocations: [{ allocationId: originalAlloc.id, amount: 800 }],
      });

      // 2. Attempt to reverse 1300 on the same allocation (Exceeds remaining 1200 -> rejects)
      await expect(
        service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, {
          reversalType: ReversalType.CORRECTION,
          reason: 'Attempting reversal of 1300 beyond 1200 remaining headroom',
          allocations: [{ allocationId: originalAlloc.id, amount: 1300 }],
        }),
      ).rejects.toThrow(BadRequestException);

      // 3. Reverse the exact remaining 1200 -> succeeds!
      await service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, {
        reversalType: ReversalType.CORRECTION,
        reason: 'Reversing exact remaining 1200 balance',
        allocations: [{ allocationId: originalAlloc.id, amount: 1200 }],
      });

      // Payment is now fully settled (800 refunded + 1200 reversed = 2000)
      const finalPay = await prisma.payment.findUnique({
        where: { id: payRes.payment.id },
        include: { receipt: true },
      });
      expect(finalPay!.status).toBe(PaymentStatus.VOIDED);
      expect(finalPay!.receipt!.status).toBe(ReceiptStatus.CANCELLED);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 53: Symmetric accounting: Refund after reversal respects remaining headroom
  // -------------------------------------------------------------
  it('53. should ensure refunds respect headroom reduced by reversals (cannot refund already reversed money)', async () => {
    const inv = await createTestInvoice({ month: 153, grossAmount: 2000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 2000,
      paymentMethod: PaymentMethod.CASH,
    });
    const originalAlloc = payRes.allocations[0];

    try {
      // 1. Reverse 1200 (Remaining = 800)
      await service.reversePayment(schoolAId, adminUserSchoolA, payRes.payment.id, {
        reversalType: ReversalType.CORRECTION,
        reason: 'Reversing 1200 before refund test',
        allocations: [{ allocationId: originalAlloc.id, amount: 1200 }],
      });

      // 2. Attempt to refund 900 on the same allocation (Exceeds remaining 800 -> rejects)
      await expect(
        service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
          amount: 900,
          reason: 'Attempting refund of 900 beyond 800 remaining headroom',
          allocations: [{ allocationId: originalAlloc.id, amount: 900 }],
        }),
      ).rejects.toThrow(BadRequestException);

      // 3. Refund the exact remaining 800 -> succeeds!
      await service.createRefund(schoolAId, adminUserSchoolA, payRes.payment.id, {
        amount: 800,
        reason: 'Refunding exact remaining 800 balance',
        allocations: [{ allocationId: originalAlloc.id, amount: 800 }],
      });

      // Payment is now fully refunded/settled
      const finalPay = await prisma.payment.findUnique({
        where: { id: payRes.payment.id },
        include: { receipt: true },
      });
      expect(finalPay!.status).toBe(PaymentStatus.REFUNDED);
      expect(finalPay!.receipt!.status).toBe(ReceiptStatus.CANCELLED);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 54: Object-level authorization on payment detail - Student isolation
  // -------------------------------------------------------------
  it('54. should reject Student B attempting to access Student A payment record (403 Forbidden)', async () => {
    let studentUserA = await prisma.user.findFirst({
      where: { schoolId: schoolAId, email: 'student-a-test@greenwood.edu' },
    });
    if (!studentUserA) {
      studentUserA = await prisma.user.create({
        data: {
          schoolId: schoolAId,
          email: 'student-a-test@greenwood.edu',
          passwordHash: 'dummyhash',
          name: 'Student A',
          role: UserRole.STUDENT,
        },
      });
    }
    await prisma.student.update({
      where: { id: testStudentId },
      data: { userId: studentUserA.id },
    });

    const inv = await createTestInvoice({ month: 154, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    const studentUserB = {
      id: '00000000-0000-0000-0000-000000000099',
      schoolId: schoolAId,
      role: UserRole.STUDENT,
      name: 'Student B',
    };

    try {
      await expect(
        service.findPaymentById(schoolAId, studentUserB, payRes.payment.id),
      ).rejects.toThrow(ForbiddenException);

      const studentAPayment = await service.findPaymentById(
        schoolAId,
        studentUserA,
        payRes.payment.id,
      );
      expect(studentAPayment.id).toBe(payRes.payment.id);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 55: Object-level authorization on payment detail - Unverified parent
  // -------------------------------------------------------------
  it('55. should reject a parent without a verified relationship attempting to access payment (403 Forbidden)', async () => {
    const inv = await createTestInvoice({ month: 155, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    const unlinkedParent = {
      id: '00000000-0000-0000-0000-000000000089',
      schoolId: schoolAId,
      role: UserRole.PARENT,
      name: 'Unlinked Parent',
    };

    try {
      await expect(
        service.findPaymentById(schoolAId, unlinkedParent, payRes.payment.id),
      ).rejects.toThrow(ForbiddenException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 56: Object-level authorization on payment detail - Verified parent
  // -------------------------------------------------------------
  it('56. should allow a parent with a verified relationship to access authorized payment', async () => {
    let parentUserVerified = await prisma.user.findFirst({
      where: { schoolId: schoolAId, email: 'parent-v-test@greenwood.edu' },
    });
    if (!parentUserVerified) {
      parentUserVerified = await prisma.user.create({
        data: {
          schoolId: schoolAId,
          email: 'parent-v-test@greenwood.edu',
          passwordHash: 'dummyhash',
          name: 'Verified Parent',
          role: UserRole.PARENT,
        },
      });
    }

    await prisma.parentStudentRelation.deleteMany({
      where: { schoolId: schoolAId, parentId: parentUserVerified.id, studentId: testStudentId },
    });
    await prisma.parentStudentRelation.create({
      data: {
        schoolId: schoolAId,
        parentId: parentUserVerified.id,
        studentId: testStudentId,
        relationshipType: 'FATHER',
        isVerified: true,
      },
    });

    const inv = await createTestInvoice({ month: 156, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      const retrieved = await service.findPaymentById(
        schoolAId,
        parentUserVerified,
        payRes.payment.id,
      );
      expect(retrieved.id).toBe(payRes.payment.id);
      expect(retrieved.studentId).toBe(testStudentId);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 57: Cross-tenant payment access rejection
  // -------------------------------------------------------------
  it('57. should return 404 NotFoundException when attempting to access a payment from another school', async () => {
    const inv = await createTestInvoice({ month: 157, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    const adminUserSchoolB = {
      id: '00000000-0000-0000-0000-000000000021',
      schoolId: schoolBId,
      role: UserRole.SCHOOL_ADMIN,
    };

    try {
      await expect(
        service.findPaymentById(schoolBId, adminUserSchoolB, payRes.payment.id),
      ).rejects.toThrow(NotFoundException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 58: Object-level authorization on receipt - Student isolation
  // -------------------------------------------------------------
  it('58. should reject Student B attempting to access Student A receipt (403 Forbidden)', async () => {
    const inv = await createTestInvoice({ month: 158, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    const studentUserB = {
      id: '00000000-0000-0000-0000-000000000099',
      schoolId: schoolAId,
      role: UserRole.STUDENT,
      name: 'Student B',
    };

    try {
      await expect(
        service.findReceiptByNumber(schoolAId, studentUserB, payRes.receipt.receiptNumber),
      ).rejects.toThrow(ForbiddenException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 59: Object-level authorization on receipt - Unverified parent
  // -------------------------------------------------------------
  it('59. should reject an unverified parent attempting to access Student A receipt (403 Forbidden)', async () => {
    const inv = await createTestInvoice({ month: 159, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    const unlinkedParent = {
      id: '00000000-0000-0000-0000-000000000089',
      schoolId: schoolAId,
      role: UserRole.PARENT,
      name: 'Unlinked Parent',
    };

    try {
      await expect(
        service.findReceiptByNumber(schoolAId, unlinkedParent, payRes.receipt.receiptNumber),
      ).rejects.toThrow(ForbiddenException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 60: Object-level authorization on receipt - Verified parent
  // -------------------------------------------------------------
  it('60. should allow a verified parent to access Student A receipt', async () => {
    let parentUserVerified = await prisma.user.findFirst({
      where: { schoolId: schoolAId, email: 'parent-v-test@greenwood.edu' },
    });
    if (!parentUserVerified) {
      parentUserVerified = await prisma.user.create({
        data: {
          schoolId: schoolAId,
          email: 'parent-v-test@greenwood.edu',
          passwordHash: 'dummyhash',
          name: 'Verified Parent',
          role: UserRole.PARENT,
        },
      });
    }

    await prisma.parentStudentRelation.deleteMany({
      where: { schoolId: schoolAId, parentId: parentUserVerified.id, studentId: testStudentId },
    });
    await prisma.parentStudentRelation.create({
      data: {
        schoolId: schoolAId,
        parentId: parentUserVerified.id,
        studentId: testStudentId,
        relationshipType: 'FATHER',
        isVerified: true,
      },
    });

    const inv = await createTestInvoice({ month: 160, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    try {
      const retrieved = await service.findReceiptByNumber(
        schoolAId,
        parentUserVerified,
        payRes.receipt.receiptNumber,
      );
      expect(retrieved.receiptNumber).toBe(payRes.receipt.receiptNumber);
      expect(retrieved.payment.studentId).toBe(testStudentId);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 61: Cross-tenant receipt access rejection
  // -------------------------------------------------------------
  it('61. should return 404 NotFoundException when attempting to access a receipt from another school', async () => {
    const inv = await createTestInvoice({ month: 161, grossAmount: 1000 });
    const payRes = await service.collectPayment(schoolAId, adminUserSchoolA, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    const adminUserSchoolB = {
      id: '00000000-0000-0000-0000-000000000021',
      schoolId: schoolBId,
      role: UserRole.SCHOOL_ADMIN,
    };

    try {
      await expect(
        service.findReceiptByNumber(schoolBId, adminUserSchoolB, payRes.receipt.receiptNumber),
      ).rejects.toThrow(NotFoundException);
    } finally {
      await cleanupInvoice(inv.id);
    }
  });

  // -------------------------------------------------------------
  // Test 62: Payment allocation authorization - Reject invoice belonging to another student
  // -------------------------------------------------------------
  it('62. should reject payment collection if explicit allocations specify an invoice belonging to another student in the same school', async () => {
    const invA = await createTestInvoice({ month: 162, grossAmount: 1000 });

    const studentB = await prisma.student.create({
      data: {
        schoolId: schoolAId,
        admissionNumber: `PAY-TEST-B-${Date.now()}`,
        firstName: 'StudentB',
        lastName: 'Other',
        gradeId: testGradeId,
        sectionId: (await prisma.section.findFirst({ where: { schoolId: schoolAId } }))!.id,
        academicYearId: testAcademicYearId,
        status: 'ACTIVE',
      },
    });

    const invB = await prisma.feeInvoice.create({
      data: {
        schoolId: schoolAId,
        studentId: studentB.id,
        academicYearId: testAcademicYearId,
        billingMonth: 162,
        dueDate: new Date('2026-04-10T18:29:59.999Z'),
        status: InvoiceStatus.DUE,
        grossAmount: new Prisma.Decimal(1000),
        discountAmount: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(1000),
      },
    });
    await prisma.invoiceItem.create({
      data: {
        schoolId: schoolAId,
        invoiceId: invB.id,
        feeHeadId: testFeeHeadId,
        feeHeadNameSnapshot: 'Tuition Fee',
        grossAmount: new Prisma.Decimal(1000),
        discountAmount: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(1000),
        billingFrequencySnapshot: 'MONTHLY',
      },
    });

    try {
      await expect(
        service.collectPayment(schoolAId, adminUserSchoolA, {
          studentId: testStudentId,
          academicYearId: testAcademicYearId,
          amount: 1000,
          paymentMethod: PaymentMethod.CASH,
          allocations: [
            {
              invoiceId: invB.id,
              amount: 1000,
              allocationType: AllocationType.PRINCIPAL,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    } finally {
      await cleanupInvoice(invA.id);
      await cleanupInvoice(invB.id);
      await prisma.student.delete({ where: { id: studentB.id } }).catch(() => {});
    }
  });

  // -------------------------------------------------------------
  // Test 63: Payment allocation authorization - Reject invoice belonging to another school
  // -------------------------------------------------------------
  it('63. should reject payment collection if explicit allocations specify an invoice belonging to another school', async () => {
    const invA = await createTestInvoice({ month: 163, grossAmount: 1000 });

    const sessionB = await prisma.academicYear.findFirst({ where: { schoolId: schoolBId } });
    const gradeB = await prisma.gradeClass.findFirst({ where: { schoolId: schoolBId } });
    const sectionB = await prisma.section.findFirst({ where: { schoolId: schoolBId } });

    const studentSchoolB = await prisma.student.create({
      data: {
        schoolId: schoolBId,
        admissionNumber: `PAY-TEST-SCHB-${Date.now()}`,
        firstName: 'SchoolB',
        lastName: 'Student',
        gradeId: gradeB!.id,
        sectionId: sectionB!.id,
        academicYearId: sessionB!.id,
        status: 'ACTIVE',
      },
    });

    const invSchoolB = await prisma.feeInvoice.create({
      data: {
        schoolId: schoolBId,
        studentId: studentSchoolB.id,
        academicYearId: sessionB!.id,
        billingMonth: 163,
        dueDate: new Date('2026-04-10T18:29:59.999Z'),
        status: InvoiceStatus.DUE,
        grossAmount: new Prisma.Decimal(1000),
        discountAmount: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(1000),
      },
    });

    try {
      await expect(
        service.collectPayment(schoolAId, adminUserSchoolA, {
          studentId: testStudentId,
          academicYearId: testAcademicYearId,
          amount: 1000,
          paymentMethod: PaymentMethod.CASH,
          allocations: [
            {
              invoiceId: invSchoolB.id,
              amount: 1000,
              allocationType: AllocationType.PRINCIPAL,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    } finally {
      await cleanupInvoice(invA.id);
      await cleanupInvoice(invSchoolB.id);
      await prisma.student.delete({ where: { id: studentSchoolB.id } }).catch(() => {});
    }
  });
});

