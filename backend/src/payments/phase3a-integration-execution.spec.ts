import { Test, TestingModule } from '@nestjs/testing';
import {
  AllocationType,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  ReceiptStatus,
  ReversalType,
  StudentStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { ReceiptSequenceService } from './receipt-sequence.service';
import { ReceiptNumberingService } from './receipt-numbering.service';
import { PaymentsService } from './payments.service';
import { NotificationOutboxService } from '../notifications/outbox/notification-outbox.service';
import { FeeGenerationService } from '../fee-generation/fee-generation.service';
import { ReversalSequenceService } from './reversal-sequence.service';
import {
  ISO_SCHOOL_ID,
  ISO_AY_ID,
  ISO_GRADE_ID,
  ISO_SECTION_ID,
  ISO_FEE_HEAD_ID,
  ISO_ADMIN_USER_ID,
  ISO_ADMIN_EMAIL,
} from '../../scripts/seed-iso-test-tenant';

const { checkDatabaseTarget, resolveDatabaseUrl } = require('../../scripts/preflight-db-check');

describe('Phase 3A-2B Controlled Payment Integration Execution on fee_iso_test', () => {
  let prisma: PrismaService;
  let receiptSequenceService: ReceiptSequenceService;
  let reversalSequenceService: ReversalSequenceService;
  let paymentsService: PaymentsService;
  let moduleRef: TestingModule;

  // Dedicated Phase 3A Test Fixture Identifiers
  const P3A_STUDENT_ID = '00000000-0000-0000-0000-000000000498';
  const P3A_STUDENT_ADM = 'ADM-P3A-001';
  const P3A_INVOICE_1_ID = '00000000-0000-0000-0000-000000000691';
  const P3A_INV1_ITEM_ID = '00000000-0000-0000-0000-000000000791';
  const P3A_INVOICE_2_ID = '00000000-0000-0000-0000-000000000692';
  const P3A_INV2_ITEM_ID = '00000000-0000-0000-0000-000000000792';

  const testAdminUser = {
    id: ISO_ADMIN_USER_ID,
    schoolId: ISO_SCHOOL_ID,
    email: ISO_ADMIN_EMAIL,
    name: 'ISO Test School Admin',
    role: UserRole.SCHOOL_ADMIN,
  };

  beforeAll(async () => {
    // 1. Mandatory Fail-Closed Preflight Target Guard
    const { url } = resolveDatabaseUrl();
    const targetCheck = checkDatabaseTarget(url);

    if (!targetCheck.ok || targetCheck.dbName !== 'fee_iso_test') {
      throw new Error(
        `[SECURITY HALT] Phase 3A-2B integration spec requires target database 'fee_iso_test' on localhost, but detected '${targetCheck?.dbName}'. Aborting to protect fee_dev.`,
      );
    }

    // 2. Connect real Prisma Service with strictly fee_iso_test
    prisma = new PrismaService();
    await prisma.$connect();

    // 3. Confirm connected database identity via SQL query
    const dbIdentity = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() as db`;
    const connectedDb = dbIdentity[0]?.db;

    if (connectedDb !== 'fee_iso_test') {
      throw new Error(
        `[SECURITY HALT] Connected database identity is '${connectedDb}', which does not match required 'fee_iso_test'. Execution halted.`,
      );
    }

    // 4. Build Testing Module with REAL services (including real NotificationOutboxService)
    moduleRef = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: prisma },
        TenantContextService,
        ReceiptSequenceService,
        ReceiptNumberingService,
        ReversalSequenceService,
        FeeGenerationService,
        NotificationOutboxService,
        PaymentsService,
      ],
    }).compile();

    receiptSequenceService = moduleRef.get<ReceiptSequenceService>(ReceiptSequenceService);
    reversalSequenceService = moduleRef.get<ReversalSequenceService>(ReversalSequenceService);
    paymentsService = moduleRef.get<PaymentsService>(PaymentsService);

    const ISO_GRADE_ID = '00000000-0000-0000-0000-000000000299';
    const ISO_SECTION_ID = '00000000-0000-0000-0000-000000000399';
    const ISO_FEE_HEAD_ID = '00000000-0000-0000-0000-000000000599';

    // 5. Create Dedicated Fixtures under Tenant A (Student + 2 Invoices)
    await prisma.student.upsert({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_STUDENT_ID } },
      update: {},
      create: {
        id: P3A_STUDENT_ID,
        school: { connect: { id: ISO_SCHOOL_ID } },
        admissionNumber: P3A_STUDENT_ADM,
        rollNumber: '301',
        firstName: 'Phase3A',
        lastName: 'IntegrationTester',
        grade: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_GRADE_ID } } },
        section: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_SECTION_ID } } },
        academicYear: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_AY_ID } } },
        status: StudentStatus.ACTIVE,
      },
    });

    // Invoice 1: 5,000.00 INR
    await prisma.feeInvoice.upsert({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_INVOICE_1_ID } },
      update: {},
      create: {
        id: P3A_INVOICE_1_ID,
        school: { connect: { id: ISO_SCHOOL_ID } },
        student: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_STUDENT_ID } } },
        academicYear: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_AY_ID } } },
        billingMonth: 2,
        dueDate: new Date('2026-07-15T00:00:00.000Z'),
        grossAmount: 5000.0,
        discountAmount: 0.0,
        netAmount: 5000.0,
        status: InvoiceStatus.DUE,
      },
    });

    await prisma.invoiceItem.upsert({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_INV1_ITEM_ID } },
      update: {},
      create: {
        id: P3A_INV1_ITEM_ID,
        school: { connect: { id: ISO_SCHOOL_ID } },
        invoice: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_INVOICE_1_ID } } },
        feeHead: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_FEE_HEAD_ID } } },
        feeHeadNameSnapshot: 'Tuition Fee ISO P3A-1',
        grossAmount: 5000.0,
        discountAmount: 0.0,
        netAmount: 5000.0,
        billingFrequencySnapshot: 'MONTHLY',
      },
    });

    // Invoice 2: 3,000.00 INR
    await prisma.feeInvoice.upsert({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_INVOICE_2_ID } },
      update: {},
      create: {
        id: P3A_INVOICE_2_ID,
        school: { connect: { id: ISO_SCHOOL_ID } },
        student: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_STUDENT_ID } } },
        academicYear: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_AY_ID } } },
        billingMonth: 3,
        dueDate: new Date('2026-08-15T00:00:00.000Z'),
        grossAmount: 3000.0,
        discountAmount: 0.0,
        netAmount: 3000.0,
        status: InvoiceStatus.DUE,
      },
    });

    await prisma.invoiceItem.upsert({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_INV2_ITEM_ID } },
      update: {},
      create: {
        id: P3A_INV2_ITEM_ID,
        school: { connect: { id: ISO_SCHOOL_ID } },
        invoice: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_INVOICE_2_ID } } },
        feeHead: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_FEE_HEAD_ID } } },
        feeHeadNameSnapshot: 'Tuition Fee ISO P3A-2',
        grossAmount: 3000.0,
        discountAmount: 0.0,
        netAmount: 3000.0,
        billingFrequencySnapshot: 'MONTHLY',
      },
    });
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('Test 1: Verifies database identity, initial baseline sequence, and fixture presence', async () => {
    const student = await prisma.student.findUnique({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_STUDENT_ID } },
    });
    expect(student).toBeDefined();
    expect(student?.admissionNumber).toBe(P3A_STUDENT_ADM);

    const inv1 = await prisma.feeInvoice.findUnique({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_INVOICE_1_ID } },
    });
    expect(inv1).toBeDefined();
    expect(Number(inv1?.netAmount)).toBe(5000);

    const inv2 = await prisma.feeInvoice.findUnique({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_INVOICE_2_ID } },
    });
    expect(inv2).toBeDefined();
    expect(Number(inv2?.netAmount)).toBe(3000);

    const seqStatus = await receiptSequenceService.getCurrentSequence({
      schoolId: ISO_SCHOOL_ID,
      academicYearId: ISO_AY_ID,
      user: testAdminUser,
    });
    expect(seqStatus.nextSequence).toBeGreaterThanOrEqual(3);
  });

  let collectedPayment1Id: string;
  let baselineSeqBeforePartial: number;

  it('Test 2 & 8: Executes partial payment collection with real notification outbox persistence', async () => {
    const seqBefore = await receiptSequenceService.getCurrentSequence({
      schoolId: ISO_SCHOOL_ID,
      academicYearId: ISO_AY_ID,
      user: testAdminUser,
    });
    baselineSeqBeforePartial = seqBefore.nextSequence;

    const idempKey = `idemp-p3a-partial-${Date.now()}`;
    const partialResult = await paymentsService.collectPayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      {
        studentId: P3A_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        amount: 2000.0,
        paymentMethod: PaymentMethod.CASH,
        notes: 'Phase 3A Partial Payment Collection Test',
        allocations: [
          {
            invoiceId: P3A_INVOICE_1_ID,
            invoiceItemId: P3A_INV1_ITEM_ID,
            allocationType: AllocationType.PRINCIPAL,
            amount: 2000.0,
          },
        ],
      },
      idempKey,
    );

    expect(partialResult.payment).toBeDefined();
    expect(partialResult.receipt).toBeDefined();
    expect(partialResult.isIdempotentReplay).toBe(false);
    expect(Number(partialResult.payment.amount)).toBe(2000.0);
    expect(partialResult.receipt.receiptSequence).toBe(baselineSeqBeforePartial);

    collectedPayment1Id = partialResult.payment.id;

    // Verify Invoice 1 status updated to PARTIALLY_PAID
    const inv1After = await prisma.feeInvoice.findUniqueOrThrow({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_INVOICE_1_ID } },
    });
    expect(inv1After.status).toBe(InvoiceStatus.PARTIALLY_PAID);

    // Verify Notification Outbox Persistence (Test 8 assertion)
    const outboxAfter = await prisma.notificationOutbox.findMany({
      where: { schoolId: ISO_SCHOOL_ID, eventType: 'RECEIPT_ISSUED' as any },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(outboxAfter.length).toBe(1);
    // Student has no parent email attached, so outbox correctly records SKIPPED (NO_VALID_RECIPIENT_EMAIL)
    expect(['PENDING', 'SKIPPED']).toContain(outboxAfter[0].status);
    const templateData = outboxAfter[0].templateData as any;
    expect(templateData.receiptNumber).toBe(partialResult.receipt.receiptNumber);
    expect(templateData.amount ?? templateData.totalAmount).toBe(2000);
  });

  it('Test 3: Executes multi-invoice FIFO waterfall payment allocation', async () => {
    // Current state of P3A:
    // Invoice 1 remaining principal: 3,000.00 INR (5,000 - 2,000)
    // Invoice 2 remaining principal: 3,000.00 INR
    // Total outstanding: 6,000.00 INR
    // We collect 4,500.00 INR without explicit allocations.
    // FIFO waterfall should allocate:
    // - 3,000.00 to Invoice 1 -> status PAID
    // - 1,500.00 to Invoice 2 -> status PARTIALLY_PAID
    const seqBefore = await receiptSequenceService.getCurrentSequence({
      schoolId: ISO_SCHOOL_ID,
      academicYearId: ISO_AY_ID,
      user: testAdminUser,
    });

    const idempKey = `idemp-p3a-fifo-${Date.now()}`;
    const fifoResult = await paymentsService.collectPayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      {
        studentId: P3A_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        amount: 4500.0,
        paymentMethod: PaymentMethod.CASH,
        notes: 'Phase 3A Multi-Invoice FIFO Allocation Test',
      },
      idempKey,
    );

    expect(fifoResult.payment).toBeDefined();
    expect(fifoResult.receipt.receiptSequence).toBe(seqBefore.nextSequence);
    expect(fifoResult.allocations.length).toBe(2);

    const allocInv1 = fifoResult.allocations.find((a) => a.invoiceId === P3A_INVOICE_1_ID);
    const allocInv2 = fifoResult.allocations.find((a) => a.invoiceId === P3A_INVOICE_2_ID);

    expect(allocInv1).toBeDefined();
    expect(Number(allocInv1?.allocatedAmount)).toBe(3000.0);

    expect(allocInv2).toBeDefined();
    expect(Number(allocInv2?.allocatedAmount)).toBe(1500.0);

    // Verify Invoice 1 is now fully PAID
    const inv1 = await prisma.feeInvoice.findUniqueOrThrow({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_INVOICE_1_ID } },
    });
    expect(inv1.status).toBe(InvoiceStatus.PAID);

    // Verify Invoice 2 is now PARTIALLY_PAID
    const inv2 = await prisma.feeInvoice.findUniqueOrThrow({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_INVOICE_2_ID } },
    });
    expect(inv2.status).toBe(InvoiceStatus.PARTIALLY_PAID);
  });

  it('Test 4: Verifies idempotency replay and prevents duplicate payments', async () => {
    // Attempt replay of Payment 1 with same idempotency key and same payload
    const existingPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: collectedPayment1Id },
    });

    const replayResult = await paymentsService.collectPayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      {
        studentId: P3A_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        amount: 2000.0,
        paymentMethod: PaymentMethod.CASH,
        notes: 'Phase 3A Partial Payment Collection Test',
        allocations: [
          {
            invoiceId: P3A_INVOICE_1_ID,
            invoiceItemId: P3A_INV1_ITEM_ID,
            allocationType: AllocationType.PRINCIPAL,
            amount: 2000.0,
          },
        ],
      },
      existingPayment.idempotencyKey!,
    );

    expect(replayResult.isIdempotentReplay).toBe(true);
    expect(replayResult.payment.id).toBe(collectedPayment1Id);
  });

  it('Test 5: Executes payment reversal (VOID) and restores invoice balance invariants', async () => {
    // Reverse Payment 1 (2,000 INR on Invoice 1)
    // Note: Invoice 1 currently has 2,000 (Payment 1) + 3,000 (Payment 2 FIFO) = 5,000 (PAID).
    // Reversing Payment 1 un-allocates 2,000 INR.
    // Invoice 1 total paid should become 3,000 INR -> status should revert to PARTIALLY_PAID!
    const reversalResult = await paymentsService.reversePayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      collectedPayment1Id,
      {
        reversalType: ReversalType.VOID,
        reason: 'Integration test payment reversal void reason required 10 chars',
      },
    );

    expect(reversalResult.reversal).toBeDefined();

    // Verify payment status updated to VOIDED
    const paymentAfter = await prisma.payment.findUniqueOrThrow({
      where: { id: collectedPayment1Id },
    });
    expect(paymentAfter.status).toBe(PaymentStatus.VOIDED);

    // Verify receipt status is CANCELLED
    const receiptAfter = await prisma.receipt.findUniqueOrThrow({
      where: { paymentId: collectedPayment1Id },
    });
    expect(receiptAfter.status).toBe(ReceiptStatus.CANCELLED);

    // Verify Invoice 1 reverted to PARTIALLY_PAID
    const inv1 = await prisma.feeInvoice.findUniqueOrThrow({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: P3A_INVOICE_1_ID } },
    });
    expect(inv1.status).toBe(InvoiceStatus.PARTIALLY_PAID);

    // Verify reversal outbox event enqueued
    const outboxReversal = await prisma.notificationOutbox.findMany({
      where: { schoolId: ISO_SCHOOL_ID, eventType: 'PAYMENT_REVERSED' as any },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(outboxReversal.length).toBe(1);
    expect(['PENDING', 'SKIPPED']).toContain(outboxReversal[0].status);
  });

  it('Test 6: Executes concurrent receipt sequence allocation under row locking', async () => {
    // Test 3 concurrent requests to allocateNextReceiptNumber to verify row-locking serialization
    const initialStatus = await receiptSequenceService.getCurrentSequence({
      schoolId: ISO_SCHOOL_ID,
      academicYearId: ISO_AY_ID,
      user: testAdminUser,
    });
    const startSeq = initialStatus.nextSequence;

    const allocations = await Promise.all([
      receiptSequenceService.allocateNextReceiptNumber({
        schoolId: ISO_SCHOOL_ID,
        academicYearId: ISO_AY_ID,
      }),
      receiptSequenceService.allocateNextReceiptNumber({
        schoolId: ISO_SCHOOL_ID,
        academicYearId: ISO_AY_ID,
      }),
      receiptSequenceService.allocateNextReceiptNumber({
        schoolId: ISO_SCHOOL_ID,
        academicYearId: ISO_AY_ID,
      }),
    ]);

    const allocatedNumbers = allocations.map((a) => a.sequenceNumber);
    // Sequences must be strictly distinct and continuous
    expect(new Set(allocatedNumbers).size).toBe(3);
    expect(allocatedNumbers).toContain(startSeq);
    expect(allocatedNumbers).toContain(startSeq + 1);
    expect(allocatedNumbers).toContain(startSeq + 2);

    const endStatus = await receiptSequenceService.getCurrentSequence({
      schoolId: ISO_SCHOOL_ID,
      academicYearId: ISO_AY_ID,
      user: testAdminUser,
    });
    expect(endStatus.currentSequence).toBe(startSeq + 2);
    expect(endStatus.nextSequence).toBe(startSeq + 3);
  });

  it('Test 7: Multi-tenant boundary guard strictly protects Tenant B', async () => {
    const TENANT_B_ID = 'e161ab95-0b43-4e28-bb8b-e61fba82cfcc';

    // Verify student from Tenant B cannot be billed by Tenant A
    const tenantBStudent = await prisma.student.findFirst({
      where: { schoolId: TENANT_B_ID },
    });
    expect(tenantBStudent).toBeDefined();

    // Attempting to collect payment under Tenant A for Tenant B's student must fail closed
    await expect(
      paymentsService.collectPayment(
        ISO_SCHOOL_ID,
        testAdminUser,
        {
          studentId: tenantBStudent!.id,
          academicYearId: ISO_AY_ID,
          amount: 500.0,
          paymentMethod: PaymentMethod.CASH,
        },
        `idemp-cross-tenant-${Date.now()}`,
      ),
    ).rejects.toThrow();

    // Verify Tenant B has 0 payments and 4 students unchanged
    const tenantBPayments = await prisma.payment.count({
      where: { schoolId: TENANT_B_ID },
    });
    expect(tenantBPayments).toBe(0);

    const tenantBStudents = await prisma.student.count({
      where: { schoolId: TENANT_B_ID },
    });
    expect(tenantBStudents).toBe(4);
  });
});
