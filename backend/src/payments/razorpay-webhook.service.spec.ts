import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import {
  AllocationType,
  AssessedFineStatus,
  GatewayEnvironment,
  GatewayStatus,
  InvoiceStatus,
  OnlinePaymentStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReceiptStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolPaymentGatewayConfigService } from '../schools/school-payment-gateway-config.service';
import { ReceiptSequenceService } from './receipt-sequence.service';
import { RazorpayWebhookService } from './razorpay-webhook.service';

describe('RazorpayWebhookService (Phase G)', () => {
  let service: RazorpayWebhookService;
  let prisma: any;
  let gatewayConfigService: any;
  let receiptSequenceService: any;

  const testSecret = 'whsec_test_secret_key_12345';
  const schoolId = 'school-uuid-1111';
  const orderId = 'order_local_uuid_9999';
  const providerOrderId = 'order_rzp_test_123456';
  const providerPaymentId = 'pay_rzp_test_987654';

  function createSignedPayload(payloadObj: any, secret = testSecret) {
    const rawBody = JSON.stringify(payloadObj);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    return { rawBody, signature };
  }

  function createSuccessPayload(paiseAmount = 150000, pId = providerPaymentId, oId = providerOrderId) {
    return {
      entity: 'event',
      account_id: 'acc_test123',
      event: 'payment.captured',
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: pId,
            entity: 'payment',
            amount: paiseAmount,
            currency: 'INR',
            status: 'captured',
            order_id: oId,
          },
        },
      },
      created_at: 1729600000,
    };
  }

  const mockOrder = {
    id: orderId,
    schoolId,
    studentId: 'student-uuid-1',
    invoiceId: 'inv-uuid-1',
    academicYearId: 'ay-uuid-1',
    providerOrderId,
    amount: new Prisma.Decimal(1500),
    currency: 'INR',
    status: OnlinePaymentStatus.CREATED,
    metadata: {},
  };

  const mockInvoice = {
    id: 'inv-uuid-1',
    schoolId,
    studentId: 'student-uuid-1',
    academicYearId: 'ay-uuid-1',
    netAmount: new Prisma.Decimal(1500),
    status: InvoiceStatus.DUE,
    items: [
      {
        id: 'item-uuid-1',
        feeHeadNameSnapshot: 'Tuition Fee',
        netAmount: new Prisma.Decimal(1000),
      },
      {
        id: 'item-uuid-2',
        feeHeadNameSnapshot: 'Development Fee',
        netAmount: new Prisma.Decimal(500),
      },
    ],
    paymentAllocations: [],
    assessedFines: [],
  };

  const mockStudent = {
    id: 'student-uuid-1',
    admissionNumber: 'SCH-001',
    firstName: 'Rahul',
    lastName: 'Sharma',
    grade: { name: 'Grade 5' },
    section: { name: 'A' },
  };

  const mockAcademicYear = {
    id: 'ay-uuid-1',
    name: '2026-2027',
  };

  const mockSchool = {
    id: schoolId,
    code: 'DPS01',
    name: 'Delhi Public School',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  };

  beforeEach(async () => {
    prisma = {
      onlinePaymentOrder: {
        findFirst: jest.fn().mockResolvedValue(mockOrder),
        findUnique: jest.fn().mockResolvedValue(mockOrder),
        update: jest.fn().mockResolvedValue({ ...mockOrder, status: OnlinePaymentStatus.SUCCESS }),
      },
      feeInvoice: {
        findUnique: jest.fn().mockResolvedValue(mockInvoice),
        update: jest.fn().mockResolvedValue(mockInvoice),
      },
      student: {
        findUnique: jest.fn().mockResolvedValue(mockStudent),
      },
      academicYear: {
        findUnique: jest.fn().mockResolvedValue(mockAcademicYear),
      },
      school: {
        findUnique: jest.fn().mockResolvedValue(mockSchool),
      },
      payment: {
        create: jest.fn().mockResolvedValue({
          id: 'pay-db-uuid-1',
          paymentNumber: 'PAY-2026-00001',
          amount: new Prisma.Decimal(1500),
          status: PaymentStatus.COMPLETED,
        }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      paymentAllocation: {
        create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'alloc-uuid', ...args.data })),
      },
      receipt: {
        create: jest.fn().mockResolvedValue({
          id: 'rec-db-uuid-1',
          receiptNumber: 'REC-2026-00001',
        }),
      },
      assessedFine: {
        update: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: orderId, status: OnlinePaymentStatus.CREATED }]),
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return await callback(prisma);
      }),
    };

    gatewayConfigService = {
      decryptCredentialsForInternalUse: jest.fn().mockResolvedValue({
        keyId: 'rzp_test_51Abc',
        keySecret: 'rzp_test_secret_mock',
        webhookSecret: testSecret,
        environment: GatewayEnvironment.TEST,
        status: GatewayStatus.ACTIVE,
      }),
    };

    receiptSequenceService = {
      allocateNextReceiptNumber: jest.fn().mockResolvedValue({
        receiptNumber: 'REC-2026-00001',
        sequenceNumber: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RazorpayWebhookService,
        { provide: PrismaService, useValue: prisma },
        { provide: SchoolPaymentGatewayConfigService, useValue: gatewayConfigService },
        { provide: ReceiptSequenceService, useValue: receiptSequenceService },
      ],
    }).compile();

    service = module.get<RazorpayWebhookService>(RazorpayWebhookService);
  });

  // -------------------------------------------------------------
  // G1 — Webhook Foundation & Signature Verification
  // -------------------------------------------------------------
  describe('G1 — Webhook Signature Verification and Tenant Resolution', () => {
    it('successfully verifies signature and settles payment with valid payload', async () => {
      const payload = createSuccessPayload(150000);
      const { rawBody, signature } = createSignedPayload(payload);

      const result = await service.handleWebhook(rawBody, signature);

      expect(result.status).toBe('success');
      expect(result.allocatedAmount).toBe(1500);
      expect(result.surplusAmount).toBe(0);
      expect(result.receiptNumber).toBe('REC-2026-00001');
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentMethod: PaymentMethod.ONLINE_RAZORPAY,
            referenceNumber: providerPaymentId,
            idempotencyKey: `rzp_pay_${providerPaymentId}`,
          }),
        }),
      );
    });

    it('fails closed when x-razorpay-signature header is missing', async () => {
      const { rawBody } = createSignedPayload(createSuccessPayload());
      await expect(service.handleWebhook(rawBody, undefined)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.handleWebhook(rawBody, '')).rejects.toThrow(
        /Missing required x-razorpay-signature header/,
      );
    });

    it('fails closed when raw payload is empty or malformed JSON', async () => {
      await expect(service.handleWebhook('', 'any_signature')).rejects.toThrow(
        /Empty webhook payload/,
      );
      await expect(
        service.handleWebhook('not-json-content', 'any_signature'),
      ).rejects.toThrow(/Malformed webhook payload JSON/);
    });

    it('fails closed when signature does not match (tampered payload or incorrect secret)', async () => {
      const { rawBody } = createSignedPayload(createSuccessPayload());
      const wrongSignature = crypto
        .createHmac('sha256', 'wrong_secret_key')
        .update(rawBody)
        .digest('hex');

      await expect(service.handleWebhook(rawBody, wrongSignature)).rejects.toThrow(
        /Invalid webhook signature/,
      );
    });

    it('identifies the tenant from trusted local online-order record, not from payload notes', async () => {
      const payload = createSuccessPayload();
      const { rawBody, signature } = createSignedPayload(payload);

      await service.handleWebhook(rawBody, signature);

      expect(prisma.onlinePaymentOrder.findFirst).toHaveBeenCalledWith({
        where: { providerOrderId },
        include: expect.any(Object),
      });
      expect(
        gatewayConfigService.decryptCredentialsForInternalUse,
      ).toHaveBeenCalledWith(schoolId);
    });

    it('fails closed when provider order ID in payload does not match any local online order', async () => {
      prisma.onlinePaymentOrder.findFirst.mockResolvedValue(null);
      const payload = createSuccessPayload(150000, providerPaymentId, 'order_unknown_999');
      const { rawBody, signature } = createSignedPayload(payload);

      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('fails closed if school has not configured a webhook secret', async () => {
      gatewayConfigService.decryptCredentialsForInternalUse.mockResolvedValue({
        keyId: 'rzp_test_123',
        keySecret: 'secret',
        webhookSecret: undefined,
        environment: GatewayEnvironment.TEST,
        status: GatewayStatus.ACTIVE,
      });

      const { rawBody, signature } = createSignedPayload(createSuccessPayload());
      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        /Webhook secret is not configured for this school/,
      );
    });

    it('rejects webhook if credentials are not in TEST mode', async () => {
      gatewayConfigService.decryptCredentialsForInternalUse.mockResolvedValue({
        keyId: 'rzp_test_123',
        keySecret: 'secret',
        webhookSecret: testSecret,
        environment: GatewayEnvironment.LIVE,
        status: GatewayStatus.ACTIVE,
      });

      const { rawBody, signature } = createSignedPayload(createSuccessPayload());
      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        /Only Razorpay TEST mode is supported/,
      );
    });
  });

  // -------------------------------------------------------------
  // G2 — Durable Idempotency & Terminal State Preservation
  // -------------------------------------------------------------
  describe('G2 — Durable Idempotency and State Management', () => {
    it('handles duplicate webhook delivery idempotently without creating duplicate payments or receipts', async () => {
      // Simulate order already in SUCCESS status in database
      prisma.$queryRaw.mockResolvedValue([
        {
          id: orderId,
          status: OnlinePaymentStatus.SUCCESS,
          providerPaymentId,
          paymentId: 'pay-db-uuid-1',
        },
      ]);

      const { rawBody, signature } = createSignedPayload(createSuccessPayload());
      const result = await service.handleWebhook(rawBody, signature);

      expect(result.status).toBe('already_settled');
      expect(result.isDuplicate).toBe(true);
      expect(result.paymentId).toBe('pay-db-uuid-1');
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(receiptSequenceService.allocateNextReceiptNumber).not.toHaveBeenCalled();
    });

    it('preserves terminal SUCCESS state if a delayed or out-of-order payment.failed event arrives', async () => {
      prisma.onlinePaymentOrder.findUnique.mockResolvedValue({
        id: orderId,
        status: OnlinePaymentStatus.SUCCESS,
      });

      const failedPayload = {
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: providerPaymentId,
              order_id: providerOrderId,
              error_code: 'BAD_REQUEST_ERROR',
              error_description: 'Payment failed',
            },
          },
        },
      };
      const { rawBody, signature } = createSignedPayload(failedPayload);

      const result = await service.handleWebhook(rawBody, signature);

      expect(result.status).toBe('noop_already_succeeded');
      expect(prisma.onlinePaymentOrder.update).not.toHaveBeenCalled();
    });

    it('marks order as FAILED when receiving valid payment.failed event for active order', async () => {
      prisma.onlinePaymentOrder.findUnique.mockResolvedValue({
        id: orderId,
        status: OnlinePaymentStatus.CREATED,
      });

      const failedPayload = {
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: providerPaymentId,
              order_id: providerOrderId,
              error_code: 'BAD_REQUEST_ERROR',
              error_description: 'Card declined by issuing bank',
            },
          },
        },
      };
      const { rawBody, signature } = createSignedPayload(failedPayload);

      const result = await service.handleWebhook(rawBody, signature);

      expect(result.status).toBe('marked_failed');
      expect(prisma.onlinePaymentOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: orderId },
          data: expect.objectContaining({
            status: OnlinePaymentStatus.FAILED,
            failureReason: 'Card declined by issuing bank',
          }),
        }),
      );
    });

    it('handles late success webhook for locally EXPIRED order that succeeded upstream', async () => {
      // Order was marked EXPIRED locally due to 2-hour TTL
      const expiredOrder = { ...mockOrder, status: OnlinePaymentStatus.EXPIRED };
      prisma.onlinePaymentOrder.findFirst.mockResolvedValue(expiredOrder);
      prisma.$queryRaw.mockResolvedValue([
        { id: orderId, status: OnlinePaymentStatus.EXPIRED },
      ]);

      const { rawBody, signature } = createSignedPayload(createSuccessPayload());
      const result = await service.handleWebhook(rawBody, signature);

      expect(result.status).toBe('success');
      expect(prisma.onlinePaymentOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OnlinePaymentStatus.SUCCESS,
            metadata: expect.objectContaining({
              recoveredFromExpired: true,
            }),
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // G3 — Transaction-Safe Settlement, Validation & Locks
  // -------------------------------------------------------------
  describe('G3 — Transaction-Safe Settlement and Invariants', () => {
    it('rejects underpayment / amount mismatch (provider paise != expected order paise)', async () => {
      // Order is for ₹1500 (150,000 paise). Webhook payload sends ₹1000 (100,000 paise)
      const payload = createSuccessPayload(100000);
      const { rawBody, signature } = createSignedPayload(payload);

      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        /Amount mismatch: provider sent 100000 paise, order expected 150000 paise/,
      );
    });

    it('rejects currency mismatch between webhook payload and order', async () => {
      const payload = createSuccessPayload(150000);
      payload.payload.payment.entity.currency = 'USD';
      const { rawBody, signature } = createSignedPayload(payload);

      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        /Currency mismatch/,
      );
    });

    it('acquires row-level locks on online_payment_orders and fee_invoices', async () => {
      const { rawBody, signature } = createSignedPayload(createSuccessPayload());
      await service.handleWebhook(rawBody, signature);

      // Verify row-level lock queries were dispatched
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('distributes payments principal-first across multiple invoice line items', async () => {
      const { rawBody, signature } = createSignedPayload(createSuccessPayload());
      await service.handleWebhook(rawBody, signature);

      // Verify line items allocated: item 1 (₹1000) and item 2 (₹500)
      expect(prisma.paymentAllocation.create).toHaveBeenCalledTimes(2);
      expect(prisma.paymentAllocation.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceItemId: 'item-uuid-1',
            allocatedAmount: new Prisma.Decimal(1000),
          }),
        }),
      );
      expect(prisma.paymentAllocation.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceItemId: 'item-uuid-2',
            allocatedAmount: new Prisma.Decimal(500),
          }),
        }),
      );
    });

    it('updates invoice status to PAID upon full balance settlement', async () => {
      const { rawBody, signature } = createSignedPayload(createSuccessPayload());
      await service.handleWebhook(rawBody, signature);

      expect(prisma.feeInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-uuid-1' },
        data: { status: InvoiceStatus.PAID },
      });
    });
  });

  // -------------------------------------------------------------
  // G4 — Reconciliation, Surplus Handling & TOCTOU Races
  // -------------------------------------------------------------
  describe('G4 — TOCTOU Cashier Race and Surplus Handling', () => {
    it('handles TOCTOU race: invoice partially paid offline before webhook arrives (allocates remaining balance, records surplus)', async () => {
      // An offline cashier collected ₹900 while checkout was in progress. Remaining balance is ₹600.
      const invoicePartiallyPaid = {
        ...mockInvoice,
        paymentAllocations: [
          {
            invoiceItemId: 'item-uuid-1',
            allocationType: AllocationType.PRINCIPAL,
            allocatedAmount: new Prisma.Decimal(900),
            refundAllocations: [],
          },
        ],
      };
      prisma.feeInvoice.findUnique.mockResolvedValue(invoicePartiallyPaid);

      // Online payment arrives for ₹1500
      const { rawBody, signature } = createSignedPayload(createSuccessPayload(150000));
      const result = await service.handleWebhook(rawBody, signature);

      expect(result.status).toBe('settled_with_surplus');
      expect(result.allocatedAmount).toBe(600); // Remaining balance was ₹600
      expect(result.surplusAmount).toBe(900); // Surplus is ₹900
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: new Prisma.Decimal(600), // Allocated amount committed to ledger
            notes: expect.stringContaining('Unallocated surplus: ₹900.00'),
          }),
        }),
      );
      expect(prisma.onlinePaymentOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              settlementType: 'PARTIAL_SETTLEMENT_WITH_SURPLUS',
              surplusAmount: 900,
              requiresManualReconciliation: true,
            }),
          }),
        }),
      );
    });

    it('handles TOCTOU race: invoice ALREADY fully paid offline before webhook arrives (zero allocation, records full surplus, flags reconciliation)', async () => {
      // Cashier collected full ₹1500 offline before webhook arrived. Remaining balance is ₹0.
      const invoiceFullyPaid = {
        ...mockInvoice,
        status: InvoiceStatus.PAID,
        paymentAllocations: [
          {
            invoiceItemId: 'item-uuid-1',
            allocationType: AllocationType.PRINCIPAL,
            allocatedAmount: new Prisma.Decimal(1000),
            refundAllocations: [],
          },
          {
            invoiceItemId: 'item-uuid-2',
            allocationType: AllocationType.PRINCIPAL,
            allocatedAmount: new Prisma.Decimal(500),
            refundAllocations: [],
          },
        ],
      };
      prisma.feeInvoice.findUnique.mockResolvedValue(invoiceFullyPaid);

      const { rawBody, signature } = createSignedPayload(createSuccessPayload(150000));
      const result = await service.handleWebhook(rawBody, signature);

      expect(result.status).toBe('settled_with_full_surplus');
      expect(result.allocatedAmount).toBe(0);
      expect(result.surplusAmount).toBe(1500);

      // Crucial: No phantom invoice allocations or receipts created against already-paid invoice
      expect(prisma.paymentAllocation.create).not.toHaveBeenCalled();
      expect(receiptSequenceService.allocateNextReceiptNumber).not.toHaveBeenCalled();

      // Crucial: Incoming payment is NOT silently discarded; recorded in OnlinePaymentOrder for reconciliation
      expect(prisma.onlinePaymentOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OnlinePaymentStatus.SUCCESS,
            metadata: expect.objectContaining({
              settlementType: 'ZERO_ALLOCATION_FULL_SURPLUS',
              surplusAmount: 1500,
              requiresManualReconciliation: true,
            }),
          }),
        }),
      );
    });

    it('safely rolls back database transaction if an error occurs during settlement', async () => {
      prisma.payment.create.mockRejectedValue(new Error('Database write error'));

      const { rawBody, signature } = createSignedPayload(createSuccessPayload());
      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        'Database write error',
      );
    });
  });
});
