import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
} from '@nestjs/common';
import {
  AllocationType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReceiptStatus,
  RefundStatus,
  ReversalType,
  UserRole,
} from '@prisma/client';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptSequenceService } from './receipt-sequence.service';
import { ReversalSequenceService } from './reversal-sequence.service';
import { FeeGenerationService } from '../fee-generation/fee-generation.service';
import { NotificationOutboxService } from '../notifications/outbox/notification-outbox.service';

describe('PaymentsService — Transactional Outbox Enqueueing Integration', () => {
  let paymentsService: PaymentsService;
  let mockOutboxService: Partial<NotificationOutboxService>;
  let mockPrisma: any;
  let mockReceiptSeq: any;
  let mockReversalSeq: any;
  let mockFeeGen: any;

  const schoolId = '00000000-0000-0000-0000-000000000001';
  const adminUser = {
    id: '00000000-0000-0000-0000-000000000011',
    schoolId,
    role: UserRole.SCHOOL_ADMIN,
    name: 'Admin User',
  };
  const testStudentId = '00000000-0000-0000-0000-000000000021';
  const testAcademicYearId = '00000000-0000-0000-0000-000000000031';
  const testInvoiceId = '00000000-0000-0000-0000-000000000041';
  const testPaymentId = '00000000-0000-0000-0000-000000000051';
  const testRefundId = '00000000-0000-0000-0000-000000000061';
  const testReceiptId = '00000000-0000-0000-0000-000000000071';
  const testReversalId = '00000000-0000-0000-0000-000000000081';

  beforeEach(() => {
    mockOutboxService = {
      enqueueReceiptIssued: jest.fn().mockResolvedValue({ id: 'outbox-rcpt-1' } as any),
      enqueuePaymentReversed: jest.fn().mockResolvedValue({ id: 'outbox-rev-1' } as any),
      enqueueRefundSucceeded: jest.fn().mockResolvedValue({ id: 'outbox-ref-s-1' } as any),
      enqueueRefundFailed: jest.fn().mockResolvedValue({ id: 'outbox-ref-f-1' } as any),
    };

    mockReceiptSeq = {
      allocateNextReceiptNumber: jest.fn().mockResolvedValue({
        receiptNumber: 'RCP-2026-999',
        sequenceNumber: 999,
      }),
    };

    mockReversalSeq = {
      allocateNextReversalNumber: jest.fn().mockResolvedValue({
        reversalNumber: 'REV-2026-999',
        sequenceNumber: 999,
      }),
    };

    mockFeeGen = {
      deriveCurrentInvoiceStatus: jest.fn().mockReturnValue('PAID'),
    };
  });

  it('collectPayment invokes enqueueReceiptIssued inside the same Prisma transaction', async () => {
    const fakeTx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: testInvoiceId }]),
      feeInvoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: testInvoiceId,
            schoolId,
            studentId: testStudentId,
            academicYearId: testAcademicYearId,
            invoiceNumber: 'INV-001',
            netAmount: new Prisma.Decimal(1000),
            dueDate: new Date(),
            status: 'DUE',
            paymentAllocations: [],
            assessedFines: [],
            items: [
              {
                id: 'item-1',
                feeHeadId: 'fh-1',
                feeHeadNameSnapshot: 'Tuition Fee',
                amount: new Prisma.Decimal(1000),
                netAmount: new Prisma.Decimal(1000),
              },
            ],
            feeStructureSnapshot: {
              items: [{ feeHeadId: 'fh-1', feeHeadName: 'Tuition Fee', amount: 1000 }],
            },
          },
        ]),
        update: jest.fn().mockResolvedValue({ id: testInvoiceId }),
      },
      payment: {
        create: jest.fn().mockResolvedValue({
          id: testPaymentId,
          paymentNumber: 'PMT-2026-001',
          schoolId,
          amount: new Prisma.Decimal(1000),
          paymentDate: new Date(),
          paymentMethod: PaymentMethod.CASH,
          studentId: testStudentId,
        }),
      },
      paymentAllocation: {
        create: jest.fn().mockResolvedValue({
          id: 'alloc-1',
          schoolId,
          paymentId: testPaymentId,
          invoiceId: testInvoiceId,
          allocatedAmount: new Prisma.Decimal(1000),
          allocationType: AllocationType.PRINCIPAL,
          feeHeadNameSnapshot: 'Tuition Fee',
        }),
      },
      receipt: {
        create: jest.fn().mockResolvedValue({
          id: testReceiptId,
          schoolId,
          receiptNumber: 'RCP-2026-999',
          totalAmount: new Prisma.Decimal(1000),
          status: ReceiptStatus.ACTIVE,
        }),
      },
      student: {
        findUnique: jest.fn().mockResolvedValue({
          id: testStudentId,
          firstName: 'Rahul',
          lastName: 'Dravid',
          admissionNumber: 'ADM-001',
          guardianEmail: 'parent@example.com',
        }),
      },
      school: {
        findUnique: jest.fn().mockResolvedValue({ name: 'School 1', currency: 'INR' }),
      },
      academicYear: {
        findUnique: jest.fn().mockResolvedValue({ name: '2026-2027' }),
      },
    };

    mockPrisma = {
      student: {
        findUnique: jest.fn().mockResolvedValue({
          id: testStudentId,
          schoolId,
          status: 'ACTIVE',
        }),
      },
      feeInvoice: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return await callback(fakeTx);
      }),
    };

    paymentsService = new PaymentsService(
      mockPrisma as any,
      mockReceiptSeq as any,
      mockReversalSeq as any,
      mockFeeGen as any,
      mockOutboxService as any,
    );

    const result = await paymentsService.collectPayment(schoolId, adminUser, {
      studentId: testStudentId,
      academicYearId: testAcademicYearId,
      amount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    expect(result.payment).toBeDefined();
    expect(result.receipt).toBeDefined();
    expect(mockOutboxService.enqueueReceiptIssued).toHaveBeenCalledTimes(1);
    expect(mockOutboxService.enqueueReceiptIssued).toHaveBeenCalledWith(
      fakeTx, // verifies it ran within tx!
      expect.objectContaining({
        schoolId,
        payment: expect.objectContaining({ id: testPaymentId }),
        receipt: expect.objectContaining({ id: testReceiptId }),
      }),
    );
  });

  it('collectPayment transaction rolls back if outbox enqueueing throws an error', async () => {
    const outboxError = new Error('Outbox write failed');
    mockOutboxService.enqueueReceiptIssued = jest.fn().mockRejectedValue(outboxError);

    const fakeTx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: testInvoiceId }]),
      feeInvoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: testInvoiceId,
            schoolId,
            studentId: testStudentId,
            academicYearId: testAcademicYearId,
            invoiceNumber: 'INV-001',
            netAmount: new Prisma.Decimal(1000),
            dueDate: new Date(),
            status: 'DUE',
            paymentAllocations: [],
            assessedFines: [],
            items: [
              {
                id: 'item-1',
                feeHeadId: 'fh-1',
                feeHeadNameSnapshot: 'Tuition Fee',
                amount: new Prisma.Decimal(1000),
                netAmount: new Prisma.Decimal(1000),
              },
            ],
            feeStructureSnapshot: {
              items: [{ feeHeadId: 'fh-1', feeHeadName: 'Tuition Fee', amount: 1000 }],
            },
          },
        ]),
        update: jest.fn().mockResolvedValue({ id: testInvoiceId }),
      },
      payment: {
        create: jest.fn().mockResolvedValue({
          id: testPaymentId,
          paymentNumber: 'PMT-2026-001',
          schoolId,
          amount: new Prisma.Decimal(1000),
          paymentDate: new Date(),
          paymentMethod: PaymentMethod.CASH,
          studentId: testStudentId,
        }),
      },
      paymentAllocation: {
        create: jest.fn().mockResolvedValue({
          id: 'alloc-1',
          schoolId,
          paymentId: testPaymentId,
          invoiceId: testInvoiceId,
          allocatedAmount: new Prisma.Decimal(1000),
          allocationType: AllocationType.PRINCIPAL,
          feeHeadNameSnapshot: 'Tuition Fee',
        }),
      },
      receipt: {
        create: jest.fn().mockResolvedValue({
          id: testReceiptId,
          schoolId,
          receiptNumber: 'RCP-2026-999',
          totalAmount: new Prisma.Decimal(1000),
          status: ReceiptStatus.ACTIVE,
        }),
      },
      student: {
        findUnique: jest.fn().mockResolvedValue({ id: testStudentId }),
      },
      school: {
        findUnique: jest.fn().mockResolvedValue({ name: 'School 1', currency: 'INR' }),
      },
      academicYear: {
        findUnique: jest.fn().mockResolvedValue({ name: '2026-2027' }),
      },
    };

    mockPrisma = {
      student: {
        findUnique: jest.fn().mockResolvedValue({
          id: testStudentId,
          schoolId,
          status: 'ACTIVE',
        }),
      },
      feeInvoice: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return await callback(fakeTx);
      }),
    };

    paymentsService = new PaymentsService(
      mockPrisma as any,
      mockReceiptSeq as any,
      mockReversalSeq as any,
      mockFeeGen as any,
      mockOutboxService as any,
    );

    await expect(
      paymentsService.collectPayment(schoolId, adminUser, {
        studentId: testStudentId,
        academicYearId: testAcademicYearId,
        amount: 1000,
        paymentMethod: PaymentMethod.CASH,
      }),
    ).rejects.toThrow('Outbox write failed');
  });

  it('reversePayment invokes enqueuePaymentReversed inside the transaction', async () => {
    const fakeTx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: testPaymentId }]),
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          id: testPaymentId,
          paymentNumber: 'PMT-001',
          schoolId,
          academicYearId: testAcademicYearId,
          studentId: testStudentId,
          amount: new Prisma.Decimal(1000),
          status: PaymentStatus.COMPLETED,
          allocations: [
            {
              id: 'alloc-1',
              invoiceId: testInvoiceId,
              allocatedAmount: new Prisma.Decimal(1000),
              allocationType: AllocationType.PRINCIPAL,
              reversals: [],
              refundAllocations: [],
            },
          ],
          receipt: { id: testReceiptId, status: ReceiptStatus.ACTIVE, receiptNumber: 'RCP-001' },
          refunds: [],
        }),
        update: jest.fn().mockResolvedValue({ id: testPaymentId }),
      },
      receipt: {
        update: jest.fn().mockResolvedValue({ id: testReceiptId }),
      },
      paymentAllocation: {
        create: jest.fn().mockResolvedValue({ id: 'alloc-rev-1' }),
      },
      paymentReversal: {
        create: jest.fn().mockResolvedValue({
          id: testReversalId,
          reversalNumber: 'REV-2026-999',
          reversalType: ReversalType.BOUNCE,
          totalAmount: new Prisma.Decimal(1000),
          reason: 'Cheque bounced',
          createdAt: new Date(),
        }),
      },
      feeInvoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: testInvoiceId,
            schoolId,
            netAmount: new Prisma.Decimal(1000),
            dueDate: new Date(),
            status: 'PAID',
            paymentAllocations: [],
            assessedFines: [],
          },
        ]),
        update: jest.fn().mockResolvedValue({ id: testInvoiceId }),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return await callback(fakeTx);
      }),
    };

    paymentsService = new PaymentsService(
      mockPrisma as any,
      mockReceiptSeq as any,
      mockReversalSeq as any,
      mockFeeGen as any,
      mockOutboxService as any,
    );

    const result = await paymentsService.reversePayment(schoolId, adminUser, testPaymentId, {
      reversalType: ReversalType.BOUNCE,
      reason: 'Cheque bounced due to insufficient funds',
    });

    expect(result.reversal).toBeDefined();
    expect(mockOutboxService.enqueuePaymentReversed).toHaveBeenCalledTimes(1);
    expect(mockOutboxService.enqueuePaymentReversed).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({
        schoolId,
        paymentReversal: expect.objectContaining({ id: testReversalId }),
        payment: expect.objectContaining({ id: testPaymentId }),
      }),
    );
  });

  it('createRefund with direct SUCCEEDED status enqueues enqueueRefundSucceeded inside the transaction', async () => {
    const fakeTx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: testPaymentId }]),
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          id: testPaymentId,
          schoolId,
          amount: new Prisma.Decimal(1000),
          status: PaymentStatus.COMPLETED,
          allocations: [
            {
              id: 'alloc-1',
              invoiceId: testInvoiceId,
              allocatedAmount: new Prisma.Decimal(1000),
              allocationType: AllocationType.PRINCIPAL,
              reversals: [],
              refundAllocations: [],
            },
          ],
          receipt: { id: testReceiptId, status: ReceiptStatus.ACTIVE },
          refunds: [],
        }),
        update: jest.fn().mockResolvedValue({ id: testPaymentId }),
      },
      paymentRefund: {
        create: jest.fn().mockResolvedValue({
          id: testRefundId,
          schoolId,
          paymentId: testPaymentId,
          refundAmount: new Prisma.Decimal(400),
          mode: 'CASH',
          status: RefundStatus.SUCCEEDED,
          reason: 'Direct refund',
          createdAt: new Date(),
        }),
      },
      paymentRefundAllocation: {
        create: jest.fn().mockResolvedValue({ id: 'r-alloc-1' }),
      },
      feeInvoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: testInvoiceId,
            schoolId,
            netAmount: new Prisma.Decimal(1000),
            dueDate: new Date(),
            status: 'PAID',
            paymentAllocations: [],
            assessedFines: [],
          },
        ]),
        update: jest.fn().mockResolvedValue({ id: testInvoiceId }),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return await callback(fakeTx);
      }),
    };

    paymentsService = new PaymentsService(
      mockPrisma as any,
      mockReceiptSeq as any,
      mockReversalSeq as any,
      mockFeeGen as any,
      mockOutboxService as any,
    );

    const result = await paymentsService.createRefund(schoolId, adminUser, testPaymentId, {
      amount: 400,
      reason: 'Direct refund authorized by school admin',
      status: RefundStatus.SUCCEEDED,
      allocations: [{ allocationId: 'alloc-1', amount: 400 }],
    });

    expect(result.refund.status).toBe(RefundStatus.SUCCEEDED);
    expect(mockOutboxService.enqueueRefundSucceeded).toHaveBeenCalledTimes(1);
    expect(mockOutboxService.enqueueRefundSucceeded).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({
        schoolId,
        refund: expect.objectContaining({ id: testRefundId, status: RefundStatus.SUCCEEDED }),
        paymentId: testPaymentId,
      }),
    );
  });

  it('confirmRefund invokes enqueueRefundSucceeded inside the transaction', async () => {
    const fakeTx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: testRefundId }]),
      paymentRefund: {
        findUnique: jest.fn().mockResolvedValue({
          id: testRefundId,
          schoolId,
          paymentId: testPaymentId,
          refundAmount: new Prisma.Decimal(500),
          status: RefundStatus.PENDING,
          referenceNumber: 'REF-TXN-1',
          allocations: [{ originalAllocation: { invoiceId: testInvoiceId } }],
        }),
        update: jest.fn().mockResolvedValue({
          id: testRefundId,
          schoolId,
          paymentId: testPaymentId,
          refundAmount: new Prisma.Decimal(500),
          status: RefundStatus.SUCCEEDED,
          allocations: [],
        }),
      },
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          id: testPaymentId,
          schoolId,
          amount: new Prisma.Decimal(1000),
          status: PaymentStatus.COMPLETED,
          allocations: [
            {
              id: 'alloc-1',
              allocatedAmount: new Prisma.Decimal(1000),
              allocationType: AllocationType.PRINCIPAL,
              reversals: [],
              refundAllocations: [
                {
                  amount: new Prisma.Decimal(500),
                  paymentRefund: { status: RefundStatus.SUCCEEDED },
                },
              ],
            },
          ],
          receipt: { id: testReceiptId, status: ReceiptStatus.ACTIVE },
          refunds: [{ refundAmount: new Prisma.Decimal(500), status: RefundStatus.SUCCEEDED }],
        }),
        update: jest.fn().mockResolvedValue({ id: testPaymentId }),
      },
      feeInvoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: testInvoiceId,
            schoolId,
            netAmount: new Prisma.Decimal(1000),
            dueDate: new Date(),
            status: 'PAID',
            paymentAllocations: [],
            assessedFines: [],
          },
        ]),
        update: jest.fn().mockResolvedValue({ id: testInvoiceId }),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return await callback(fakeTx);
      }),
    };

    paymentsService = new PaymentsService(
      mockPrisma as any,
      mockReceiptSeq as any,
      mockReversalSeq as any,
      mockFeeGen as any,
      mockOutboxService as any,
    );

    const result = await paymentsService.confirmRefund(schoolId, adminUser, testRefundId);

    expect(result.status).toBe(RefundStatus.SUCCEEDED);
    expect(mockOutboxService.enqueueRefundSucceeded).toHaveBeenCalledTimes(1);
    expect(mockOutboxService.enqueueRefundSucceeded).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({
        schoolId,
        refund: expect.objectContaining({ id: testRefundId, status: RefundStatus.SUCCEEDED }),
        paymentId: testPaymentId,
      }),
    );
  });

  it('failRefund invokes enqueueRefundFailed inside the transaction', async () => {
    const fakeTx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: testRefundId }]),
      paymentRefund: {
        findUnique: jest.fn().mockResolvedValue({
          id: testRefundId,
          schoolId,
          paymentId: testPaymentId,
          refundAmount: new Prisma.Decimal(500),
          status: RefundStatus.PENDING,
          referenceNumber: 'REF-TXN-1',
          allocations: [],
        }),
        update: jest.fn().mockResolvedValue({
          id: testRefundId,
          schoolId,
          paymentId: testPaymentId,
          refundAmount: new Prisma.Decimal(500),
          status: RefundStatus.FAILED,
          failureReason: 'Disbursement banking gateway rejected the payout',
          allocations: [],
        }),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return await callback(fakeTx);
      }),
    };

    paymentsService = new PaymentsService(
      mockPrisma as any,
      mockReceiptSeq as any,
      mockReversalSeq as any,
      mockFeeGen as any,
      mockOutboxService as any,
    );

    const result = await paymentsService.failRefund(schoolId, adminUser, testRefundId, {
      reason: 'Disbursement banking gateway rejected the payout',
    });

    expect(result.status).toBe(RefundStatus.FAILED);
    expect(mockOutboxService.enqueueRefundFailed).toHaveBeenCalledTimes(1);
    expect(mockOutboxService.enqueueRefundFailed).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({
        schoolId,
        refund: expect.objectContaining({ id: testRefundId, status: RefundStatus.FAILED }),
        paymentId: testPaymentId,
      }),
    );
  });
});
