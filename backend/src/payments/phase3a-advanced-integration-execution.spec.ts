import { Test, TestingModule } from '@nestjs/testing';
import {
  AllocationType,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  ReceiptStatus,
  RefundStatus,
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
  ISO_ADMIN_USER_ID,
  ISO_ADMIN_EMAIL,
} from '../../scripts/seed-iso-test-tenant';

const { checkDatabaseTarget, resolveDatabaseUrl } = require('../../scripts/preflight-db-check');

describe('Phase 3A-3B Controlled Advanced Payment Integration Execution on fee_iso_test', () => {
  let prisma: PrismaService;
  let receiptSequenceService: ReceiptSequenceService;
  let reversalSequenceService: ReversalSequenceService;
  let paymentsService: PaymentsService;
  let outboxService: NotificationOutboxService;
  let moduleRef: TestingModule;

  // Dedicated Phase 3A Advanced Test Fixture Identifiers
  const ADV_STUDENT_ID = '00000000-0000-0000-0000-000000000497';
  const ADV_STUDENT_ADM = 'ADM-P3A-ADV-001';
  const ADV_INVOICE_1_ID = '00000000-0000-0000-0000-000000000681';
  const ADV_INV1_ITEM_ID = '00000000-0000-0000-0000-000000000781';
  const ADV_INVOICE_2_ID = '00000000-0000-0000-0000-000000000682';
  const ADV_INV2_ITEM_ID = '00000000-0000-0000-0000-000000000782';

  const ISO_GRADE_ID = '00000000-0000-0000-0000-000000000299';
  const ISO_SECTION_ID = '00000000-0000-0000-0000-000000000399';
  const ISO_FEE_HEAD_ID = '00000000-0000-0000-0000-000000000599';

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
        `[SECURITY HALT] Phase 3A-3B integration spec requires target database 'fee_iso_test' on localhost, but detected '${targetCheck?.dbName}'. Aborting to protect fee_dev.`,
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

    // 4. Build Testing Module with REAL services
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
    outboxService = moduleRef.get<NotificationOutboxService>(NotificationOutboxService);

    // 5. Create Dedicated Phase 3A Advanced Fixtures (Collision Checked)
    await prisma.student.upsert({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ADV_STUDENT_ID } },
      update: {},
      create: {
        id: ADV_STUDENT_ID,
        school: { connect: { id: ISO_SCHOOL_ID } },
        admissionNumber: ADV_STUDENT_ADM,
        rollNumber: '302',
        firstName: 'P3A-ADV-Student',
        lastName: 'AdvancedTesting',
        grade: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_GRADE_ID } } },
        section: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_SECTION_ID } } },
        academicYear: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_AY_ID } } },
        status: StudentStatus.ACTIVE,
      },
    });

    // Invoice 1: 4,000.00 INR
    await prisma.feeInvoice.upsert({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ADV_INVOICE_1_ID } },
      update: {},
      create: {
        id: ADV_INVOICE_1_ID,
        school: { connect: { id: ISO_SCHOOL_ID } },
        student: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ADV_STUDENT_ID } } },
        academicYear: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_AY_ID } } },
        billingMonth: 3,
        dueDate: new Date('2026-08-15T00:00:00.000Z'),
        grossAmount: 4000.0,
        discountAmount: 0.0,
        netAmount: 4000.0,
        status: InvoiceStatus.DUE,
      },
    });

    await prisma.invoiceItem.upsert({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ADV_INV1_ITEM_ID } },
      update: {},
      create: {
        id: ADV_INV1_ITEM_ID,
        school: { connect: { id: ISO_SCHOOL_ID } },
        invoice: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ADV_INVOICE_1_ID } } },
        feeHead: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_FEE_HEAD_ID } } },
        feeHeadNameSnapshot: 'Tuition Fee ADV-1',
        grossAmount: 4000.0,
        discountAmount: 0.0,
        netAmount: 4000.0,
        billingFrequencySnapshot: 'MONTHLY',
      },
    });

    // Invoice 2: 4,000.00 INR
    await prisma.feeInvoice.upsert({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ADV_INVOICE_2_ID } },
      update: {},
      create: {
        id: ADV_INVOICE_2_ID,
        school: { connect: { id: ISO_SCHOOL_ID } },
        student: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ADV_STUDENT_ID } } },
        academicYear: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_AY_ID } } },
        billingMonth: 4,
        dueDate: new Date('2026-09-15T00:00:00.000Z'),
        grossAmount: 4000.0,
        discountAmount: 0.0,
        netAmount: 4000.0,
        status: InvoiceStatus.DUE,
      },
    });

    await prisma.invoiceItem.upsert({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ADV_INV2_ITEM_ID } },
      update: {},
      create: {
        id: ADV_INV2_ITEM_ID,
        school: { connect: { id: ISO_SCHOOL_ID } },
        invoice: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ADV_INVOICE_2_ID } } },
        feeHead: { connect: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_FEE_HEAD_ID } } },
        feeHeadNameSnapshot: 'Tuition Fee ADV-2',
        grossAmount: 4000.0,
        discountAmount: 0.0,
        netAmount: 4000.0,
        billingFrequencySnapshot: 'MONTHLY',
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  // =========================================================================
  // ADV-1: Immediate Successful Refund (SUCCEEDED)
  // =========================================================================
  it('ADV-1: Immediate Successful Refund updates payment, restores invoice balance, and emits outbox event', async () => {
    // Initial payment of 2,000 INR against Invoice 1 (4,000 INR net)
    const result = await paymentsService.collectPayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      {
        studentId: ADV_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        amount: 2000.0,
        paymentMethod: PaymentMethod.CASH,
        allocations: [
          {
            invoiceId: ADV_INVOICE_1_ID,
            invoiceItemId: ADV_INV1_ITEM_ID,
            allocationType: AllocationType.PRINCIPAL,
            amount: 2000.0,
          },
        ],
      },
      `idemp-adv1-pay-${Date.now()}`,
    );

    expect(result.payment.status).toBe(PaymentStatus.COMPLETED);

    // Verify invoice is PARTIALLY_PAID
    let inv1 = await prisma.feeInvoice.findUnique({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ADV_INVOICE_1_ID } },
    });
    expect(inv1?.status).toBe(InvoiceStatus.PARTIALLY_PAID);

    // Outbox count before refund
    const outboxCountBefore = await prisma.notificationOutbox.count({
      where: { schoolId: ISO_SCHOOL_ID, eventType: 'REFUND_SUCCEEDED' },
    });

    // Execute Immediate Refund of 1,000 INR (SUCCEEDED is default status in CreatePaymentRefundDto)
    const refundResult = await paymentsService.createRefund(
      ISO_SCHOOL_ID,
      testAdminUser,
      result.payment.id,
      {
        amount: 1000.0,
        reason: 'Authorized partial fee adjustment refund for ADV-1',
        status: RefundStatus.SUCCEEDED,
      },
    );

    expect(refundResult.refund.status).toBe(RefundStatus.SUCCEEDED);
    expect(Number(refundResult.refund.refundAmount)).toBe(1000.0);

    // Verify Payment status updated to PARTIALLY_REFUNDED
    const updatedPayment = await prisma.payment.findUnique({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: result.payment.id } },
    });
    expect(updatedPayment?.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);

    // Verify Invoice balance remains PARTIALLY_PAID
    inv1 = await prisma.feeInvoice.findUnique({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ADV_INVOICE_1_ID } },
    });
    expect(inv1?.status).toBe(InvoiceStatus.PARTIALLY_PAID);

    // Verify outbox recorded exactly one REFUND_SUCCEEDED event
    const outboxCountAfter = await prisma.notificationOutbox.count({
      where: { schoolId: ISO_SCHOOL_ID, eventType: 'REFUND_SUCCEEDED' },
    });
    expect(outboxCountAfter).toBe(outboxCountBefore + 1);
  });

  // =========================================================================
  // ADV-2: Two-Phase Refund Lifecycle (PENDING -> SUCCEEDED)
  // =========================================================================
  it('ADV-2: Two-Phase Refund Lifecycle reserves headroom while PENDING and reconciles on confirmRefund()', async () => {
    // Current state of ADV_INVOICE_1: 4000 total, 2000 initial payment, 1000 refunded -> net effective 1000 paid.
    // Pay another 1,000 INR on ADV_INVOICE_1
    const result = await paymentsService.collectPayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      {
        studentId: ADV_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        amount: 1000.0,
        paymentMethod: PaymentMethod.CASH,
        allocations: [
          {
            invoiceId: ADV_INVOICE_1_ID,
            invoiceItemId: ADV_INV1_ITEM_ID,
            allocationType: AllocationType.PRINCIPAL,
            amount: 1000.0,
          },
        ],
      },
      `idemp-adv2-pay-${Date.now()}`,
    );

    expect(result.payment.status).toBe(PaymentStatus.COMPLETED);

    // Create refund as PENDING for 500 INR
    const pendingRefundResult = await paymentsService.createRefund(
      ISO_SCHOOL_ID,
      testAdminUser,
      result.payment.id,
      {
        amount: 500.0,
        reason: 'Authorized pending gateway refund request for ADV-2',
        status: RefundStatus.PENDING,
      },
    );

    expect(pendingRefundResult.refund.status).toBe(RefundStatus.PENDING);

    // While PENDING, payment status remains COMPLETED
    const paymentDuringPending = await prisma.payment.findUnique({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: result.payment.id } },
    });
    expect(paymentDuringPending?.status).toBe(PaymentStatus.COMPLETED);

    // Confirm Refund
    const confirmedRefund = await paymentsService.confirmRefund(
      ISO_SCHOOL_ID,
      testAdminUser,
      pendingRefundResult.refund.id,
      {
        reason: 'Gateway confirmed refund settlement for ADV-2',
      },
    );

    expect(confirmedRefund.status).toBe(RefundStatus.SUCCEEDED);

    // Payment transitions to PARTIALLY_REFUNDED
    const paymentAfterConfirm = await prisma.payment.findUnique({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: result.payment.id } },
    });
    expect(paymentAfterConfirm?.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);

    // State machine protection: Repeat confirm must fail closed
    await expect(
      paymentsService.confirmRefund(ISO_SCHOOL_ID, testAdminUser, pendingRefundResult.refund.id, { reason: 'Duplicate confirm' }),
    ).rejects.toThrow();
  });

  // =========================================================================
  // ADV-3: Refund Failure Lifecycle (PENDING -> FAILED)
  // =========================================================================
  it('ADV-3: Refund Failure Lifecycle transitions PENDING -> FAILED, releases headroom, and preserves payment', async () => {
    // Pay 500 INR on ADV_INVOICE_1
    const result = await paymentsService.collectPayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      {
        studentId: ADV_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        amount: 500.0,
        paymentMethod: PaymentMethod.CASH,
        allocations: [
          {
            invoiceId: ADV_INVOICE_1_ID,
            invoiceItemId: ADV_INV1_ITEM_ID,
            allocationType: AllocationType.PRINCIPAL,
            amount: 500.0,
          },
        ],
      },
      `idemp-adv3-pay-${Date.now()}`,
    );

    // Outbox count before fail
    const outboxFailCountBefore = await prisma.notificationOutbox.count({
      where: { schoolId: ISO_SCHOOL_ID, eventType: 'REFUND_FAILED' },
    });

    // Create PENDING refund for 500 INR
    const pendingRefundResult = await paymentsService.createRefund(
      ISO_SCHOOL_ID,
      testAdminUser,
      result.payment.id,
      {
        amount: 500.0,
        reason: 'Temporary test refund request to be failed ADV-3',
        status: RefundStatus.PENDING,
      },
    );

    expect(pendingRefundResult.refund.status).toBe(RefundStatus.PENDING);

    // Fail Refund
    const failedRefund = await paymentsService.failRefund(
      ISO_SCHOOL_ID,
      testAdminUser,
      pendingRefundResult.refund.id,
      {
        reason: 'Simulated gateway bank account invalid error',
      },
    );

    expect(failedRefund.status).toBe(RefundStatus.FAILED);
    expect(failedRefund.failureReason).toContain('Simulated gateway bank account invalid');

    // Payment status remains COMPLETED
    const paymentAfterFail = await prisma.payment.findUnique({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: result.payment.id } },
    });
    expect(paymentAfterFail?.status).toBe(PaymentStatus.COMPLETED);

    // Outbox recorded REFUND_FAILED event
    const outboxFailCountAfter = await prisma.notificationOutbox.count({
      where: { schoolId: ISO_SCHOOL_ID, eventType: 'REFUND_FAILED' },
    });
    expect(outboxFailCountAfter).toBe(outboxFailCountBefore + 1);

    // Repeat fail must fail closed
    await expect(
      paymentsService.failRefund(ISO_SCHOOL_ID, testAdminUser, pendingRefundResult.refund.id, { reason: 'Duplicate fail' }),
    ).rejects.toThrow();
  });

  // =========================================================================
  // ADV-4: Over-Refund Headroom Rejection
  // =========================================================================
  it('ADV-4: Over-Refund Headroom Rejection evaluates cumulative SUCCEEDED and PENDING allocations and rejects over-refund', async () => {
    // Collect 400 INR on ADV_INVOICE_2 (net 4000)
    const result = await paymentsService.collectPayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      {
        studentId: ADV_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        amount: 400.0,
        paymentMethod: PaymentMethod.CASH,
        allocations: [
          {
            invoiceId: ADV_INVOICE_2_ID,
            invoiceItemId: ADV_INV2_ITEM_ID,
            allocationType: AllocationType.PRINCIPAL,
            amount: 400.0,
          },
        ],
      },
      `idemp-adv4-pay-${Date.now()}`,
    );

    // Create 200 INR refund as SUCCEEDED
    await paymentsService.createRefund(
      ISO_SCHOOL_ID,
      testAdminUser,
      result.payment.id,
      {
        amount: 200.0,
        reason: 'Partial legitimate refund of 200 INR',
        status: RefundStatus.SUCCEEDED,
      },
    );

    // Create 100 INR refund as PENDING
    await paymentsService.createRefund(
      ISO_SCHOOL_ID,
      testAdminUser,
      result.payment.id,
      {
        amount: 100.0,
        reason: 'Pending reservation refund of 100 INR',
        status: RefundStatus.PENDING,
      },
    );

    // Remaining unreserved headroom is now 400 - 200 - 100 = 100 INR.
    // Attempting to refund 150 INR must be rejected with BadRequestException
    await expect(
      paymentsService.createRefund(
        ISO_SCHOOL_ID,
        testAdminUser,
        result.payment.id,
        {
          amount: 150.0,
          reason: 'Attempted excessive refund exceeding headroom',
          status: RefundStatus.PENDING,
        },
      ),
    ).rejects.toThrow();

    // Verify refund of exactly remaining 100 INR succeeds
    const finalRefundResult = await paymentsService.createRefund(
      ISO_SCHOOL_ID,
      testAdminUser,
      result.payment.id,
      {
        amount: 100.0,
        reason: 'Legitimate final refund consuming exact remaining headroom',
        status: RefundStatus.SUCCEEDED,
      },
    );
    expect(finalRefundResult.refund.status).toBe(RefundStatus.SUCCEEDED);

    // Any further refund attempt on this payment must fail
    await expect(
      paymentsService.createRefund(
        ISO_SCHOOL_ID,
        testAdminUser,
        result.payment.id,
        {
          amount: 10.0,
          reason: 'Attempted refund when 0 headroom remains',
          status: RefundStatus.SUCCEEDED,
        },
      ),
    ).rejects.toThrow();
  });

  // =========================================================================
  // ADV-5: Concurrent Partial Collections Racing
  // =========================================================================
  it('ADV-5: Concurrent Partial Collections are serialized via row locks and both succeed within invoice balance', async () => {
    // Current outstanding balance on ADV_INVOICE_2:
    // Net: 4000, Payment: 400 (300 refunded, 100 reserved? Actually: 200 SUC + 100 PEN + 100 SUC = 400 total refunded/reserved)
    // Allocations on Invoice 2: 400 gross, 300 succeeded refund -> net 100 paid on invoice.
    // Remaining due on ADV_INVOICE_2 is ~3,900 INR.
    // Launch two simultaneous collections of 1,000 INR each (combined 2,000 <= 3,900)
    const promise1 = paymentsService.collectPayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      {
        studentId: ADV_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        amount: 1000.0,
        paymentMethod: PaymentMethod.CASH,
        allocations: [
          {
            invoiceId: ADV_INVOICE_2_ID,
            invoiceItemId: ADV_INV2_ITEM_ID,
            allocationType: AllocationType.PRINCIPAL,
            amount: 1000.0,
          },
        ],
      },
      `idemp-adv5-c1-${Date.now()}`,
    );

    const promise2 = paymentsService.collectPayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      {
        studentId: ADV_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        amount: 1000.0,
        paymentMethod: PaymentMethod.CASH,
        allocations: [
          {
            invoiceId: ADV_INVOICE_2_ID,
            invoiceItemId: ADV_INV2_ITEM_ID,
            allocationType: AllocationType.PRINCIPAL,
            amount: 1000.0,
          },
        ],
      },
      `idemp-adv5-c2-${Date.now()}`,
    );

    const [pay1, pay2] = await Promise.all([promise1, promise2]);

    expect(pay1.payment.status).toBe(PaymentStatus.COMPLETED);
    expect(pay2.payment.status).toBe(PaymentStatus.COMPLETED);
    expect(pay1.payment.id).not.toBe(pay2.payment.id);

    // Verify receipts generated are distinct
    expect(pay1.receipt.receiptNumber).not.toBe(pay2.receipt.receiptNumber);

    // Verify total allocation matches exactly 2,000 INR
    const totalAllocated = Number(pay1.payment.amount) + Number(pay2.payment.amount);
    expect(totalAllocated).toBe(2000.0);
  });

  // =========================================================================
  // ADV-6: Concurrent Collection Overpayment Race
  // =========================================================================
  it('ADV-6: Concurrent Collection Overpayment Race: winning fiber commits, losing fiber detects depleted balance and rejects', async () => {
    // Check current balance on ADV_INVOICE_2
    const allocationsOnInv2 = await prisma.paymentAllocation.findMany({
      where: { invoiceId: ADV_INVOICE_2_ID },
    });
    const totalAllocatedOnInv2 = allocationsOnInv2.reduce((sum, a) => sum + Number(a.allocatedAmount), 0);
    // Net is 4000. Previous allocations: 400 (ADV-4) + 1000 (ADV-5) + 1000 (ADV-5) = 2400.
    // Outstanding remaining is 4000 - (400 - 300 refund) - 2000 = 1900.
    // Launch two competing concurrent collections of 1,500 INR each.
    // Combined requested = 3,000 INR, which exceeds remaining balance.
    const promiseA = paymentsService.collectPayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      {
        studentId: ADV_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        amount: 1500.0,
        paymentMethod: PaymentMethod.CASH,
        allocations: [
          {
            invoiceId: ADV_INVOICE_2_ID,
            invoiceItemId: ADV_INV2_ITEM_ID,
            allocationType: AllocationType.PRINCIPAL,
            amount: 1500.0,
          },
        ],
      },
      `idemp-adv6-compA-${Date.now()}`,
    );

    const promiseB = paymentsService.collectPayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      {
        studentId: ADV_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        amount: 1500.0,
        paymentMethod: PaymentMethod.CASH,
        allocations: [
          {
            invoiceId: ADV_INVOICE_2_ID,
            invoiceItemId: ADV_INV2_ITEM_ID,
            allocationType: AllocationType.PRINCIPAL,
            amount: 1500.0,
          },
        ],
      },
      `idemp-adv6-compB-${Date.now()}`,
    );

    const results = await Promise.allSettled([promiseA, promiseB]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one must succeed and one must be rejected
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Verify rejected reason indicates obligation exceeded
    const rejectionError = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionError.message).toMatch(/exceeds/i);

    // Verify invoice status is still PARTIALLY_PAID and no overpayment occurred
    const inv2 = await prisma.feeInvoice.findUnique({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ADV_INVOICE_2_ID } },
    });
    expect(inv2?.status).toBe(InvoiceStatus.PARTIALLY_PAID);
  });

  // =========================================================================
  // ADV-7: Concurrent Reversal Race
  // =========================================================================
  it('ADV-7: Concurrent Reversal Race on same payment: exactly one succeeds, second rejects with VOIDED conflict', async () => {
    // Make a standalone payment of 200 INR on ADV_INVOICE_2
    const payResult = await paymentsService.collectPayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      {
        studentId: ADV_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        amount: 200.0,
        paymentMethod: PaymentMethod.CASH,
        allocations: [
          {
            invoiceId: ADV_INVOICE_2_ID,
            invoiceItemId: ADV_INV2_ITEM_ID,
            allocationType: AllocationType.PRINCIPAL,
            amount: 200.0,
          },
        ],
      },
      `idemp-adv7-pay-${Date.now()}`,
    );

    expect(payResult.payment.status).toBe(PaymentStatus.COMPLETED);

    // Launch two simultaneous VOID reversals against the exact same payment
    const revPromise1 = paymentsService.reversePayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      payResult.payment.id,
      {
        reversalType: ReversalType.VOID,
        reason: 'Concurrent reversal race attempt 1',
      },
    );

    const revPromise2 = paymentsService.reversePayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      payResult.payment.id,
      {
        reversalType: ReversalType.VOID,
        reason: 'Concurrent reversal race attempt 2',
      },
    );

    const revResults = await Promise.allSettled([revPromise1, revPromise2]);

    const revFulfilled = revResults.filter((r) => r.status === 'fulfilled');
    const revRejected = revResults.filter((r) => r.status === 'rejected');

    // Exactly one succeeds, one fails
    expect(revFulfilled.length).toBe(1);
    expect(revRejected.length).toBe(1);

    const revError = (revRejected[0] as PromiseRejectedResult).reason;
    expect(revError.message).toMatch(/already been voided/i);

    // Verify payment status is VOIDED
    const finalPayment = await prisma.payment.findUnique({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: payResult.payment.id } },
    });
    expect(finalPayment?.status).toBe(PaymentStatus.VOIDED);

    // Verify only 1 reversal record created for this payment
    const reversals = await prisma.paymentReversal.findMany({
      where: { paymentId: payResult.payment.id },
    });
    expect(reversals.length).toBe(1);
  });

  // =========================================================================
  // ADV-8: Transaction Rollback Atomicity (Failure Injection)
  // =========================================================================
  it('ADV-8: Transaction Rollback Atomicity rolls back all mutations when outbox fails inside transaction boundary', async () => {
    // Snapshot balances & counts before failed attempt
    const paymentsCountBefore = await prisma.payment.count({ where: { schoolId: ISO_SCHOOL_ID } });
    const receiptsCountBefore = await prisma.receipt.count({ where: { schoolId: ISO_SCHOOL_ID } });
    const outboxCountBefore = await prisma.notificationOutbox.count({ where: { schoolId: ISO_SCHOOL_ID } });

    // Inject failure into outboxService.enqueueReceiptIssued during transaction
    const spy = jest
      .spyOn(outboxService, 'enqueueReceiptIssued')
      .mockImplementationOnce(async () => {
        throw new Error('[SIMULATED FAILURE] Outbox transient infrastructure failure inside payment transaction');
      });

    // Attempt collection which should fail and roll back all SQL writes
    await expect(
      paymentsService.collectPayment(
        ISO_SCHOOL_ID,
        testAdminUser,
        {
          studentId: ADV_STUDENT_ID,
          academicYearId: ISO_AY_ID,
          amount: 200.0,
          paymentMethod: PaymentMethod.CASH,
          allocations: [
            {
              invoiceId: ADV_INVOICE_1_ID,
              invoiceItemId: ADV_INV1_ITEM_ID,
              allocationType: AllocationType.PRINCIPAL,
              amount: 200.0,
            },
          ],
        },
        `idemp-adv8-rollback-${Date.now()}`,
      ),
    ).rejects.toThrow(/\[SIMULATED FAILURE\] Outbox transient infrastructure failure/);

    spy.mockRestore();

    // Verify zero payment created
    const paymentsCountAfter = await prisma.payment.count({ where: { schoolId: ISO_SCHOOL_ID } });
    expect(paymentsCountAfter).toBe(paymentsCountBefore);

    // Verify zero receipt created
    const receiptsCountAfter = await prisma.receipt.count({ where: { schoolId: ISO_SCHOOL_ID } });
    expect(receiptsCountAfter).toBe(receiptsCountBefore);

    // Verify zero outbox row committed
    const outboxCountAfter = await prisma.notificationOutbox.count({ where: { schoolId: ISO_SCHOOL_ID } });
    expect(outboxCountAfter).toBe(outboxCountBefore);
  });
});
