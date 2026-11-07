import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  AllocationType,
  GatewayEnvironment,
  GatewayStatus,
  InvoiceStatus,
  OnlinePaymentStatus,
  Prisma,
  RefundStatus,
  UserRole,
} from '@prisma/client';
import { OnlinePaymentsService } from './online-payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolPaymentGatewayConfigService } from '../schools/school-payment-gateway-config.service';

describe('OnlinePaymentsService (Phase E)', () => {
  let service: OnlinePaymentsService;
  let prisma: any;
  let gatewayConfigService: any;

  const SCHOOL_ID = 'sch-uuid-1';
  const OTHER_SCHOOL_ID = 'sch-uuid-99';
  const INVOICE_ID = 'inv-uuid-1';
  const STUDENT_ID = 'stud-uuid-1';
  const ACADEMIC_YEAR_ID = 'ay-uuid-1';

  const MOCK_STUDENT_USER = {
    id: 'user-stud-1',
    role: UserRole.STUDENT,
    schoolId: SCHOOL_ID,
  };

  const MOCK_PARENT_USER = {
    id: 'user-parent-1',
    role: UserRole.PARENT,
    schoolId: SCHOOL_ID,
  };

  const MOCK_OTHER_STUDENT_USER = {
    id: 'user-stud-2',
    role: UserRole.STUDENT,
    schoolId: SCHOOL_ID,
  };

  const MOCK_ADMIN_USER = {
    id: 'user-admin-1',
    role: UserRole.SCHOOL_ADMIN,
    schoolId: SCHOOL_ID,
  };

  const MOCK_CREDENTIALS = {
    keyId: 'rzp_test_Sch1Key',
    keySecret: 'secret_12345678',
    environment: GatewayEnvironment.TEST,
    status: GatewayStatus.ACTIVE,
  };

  const makeInvoice = (overrides: any = {}) => ({
    id: INVOICE_ID,
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    status: InvoiceStatus.DUE,
    school: { id: SCHOOL_ID, name: 'Greenwood High School' },
    student: {
      id: STUDENT_ID,
      admissionNumber: 'ADM-001',
      firstName: 'Rahul',
      lastName: 'Sharma',
      userId: 'user-stud-1',
      guardianEmail: 'parent@example.com',
      guardianPhone: '9876543210',
    },
    items: [
      {
        id: 'item-1',
        netAmount: new Prisma.Decimal('1000.00'),
        paymentAllocations: [],
      },
    ],
    assessedFines: [
      {
        id: 'fine-1',
        assessedAmount: new Prisma.Decimal('200.00'),
        allocations: [],
        waivers: [],
      },
    ],
    paymentAllocations: [],
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      feeInvoice: {
        findUnique: jest.fn(),
      },
      onlinePaymentOrder: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      parentStudentRelation: {
        findFirst: jest.fn(),
      },
    };

    gatewayConfigService = {
      decryptCredentialsForInternalUse: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnlinePaymentsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: SchoolPaymentGatewayConfigService,
          useValue: gatewayConfigService,
        },
      ],
    }).compile();

    service = module.get<OnlinePaymentsService>(OnlinePaymentsService);

    // Mock the external Razorpay call to prevent real HTTP calls during unit tests
    jest.spyOn<any, any>(service, 'executeRazorpayCreateOrder').mockResolvedValue({
      id: 'order_test_rzp12345',
      amount: 120000,
      currency: 'INR',
      receipt: 'ord_inv_test_1',
      status: 'created',
      notes: {},
    });
  });

  describe('Authorization and Tenant Security', () => {
    it('allows enrolled student to initiate payment for their own invoice', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());
      gatewayConfigService.decryptCredentialsForInternalUse.mockResolvedValue(
        MOCK_CREDENTIALS,
      );
      prisma.onlinePaymentOrder.findUnique.mockResolvedValue(null);
      prisma.onlinePaymentOrder.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, id: 'ord-db-1', createdAt: new Date() }),
      );

      const result = await service.createOnlineOrder(
        SCHOOL_ID,
        MOCK_STUDENT_USER,
        { invoiceId: INVOICE_ID },
        'idemp-test-1',
      );

      expect(result.orderId).toBe('order_test_rzp12345');
      expect(result.amount).toBe(1200);
      expect(result.amountInPaise).toBe(120000);
      expect(result.studentName).toBe('Rahul Sharma');
      expect(result.keyId).toBe('rzp_test_Sch1Key');
      expect((result as any).keySecret).toBeUndefined(); // Secret never exposed
    });

    it('allows verified parent to initiate payment for their linked child invoice', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());
      prisma.parentStudentRelation.findFirst.mockResolvedValue({
        id: 'rel-1',
        parentId: MOCK_PARENT_USER.id,
        studentId: STUDENT_ID,
        isVerified: true,
      });
      gatewayConfigService.decryptCredentialsForInternalUse.mockResolvedValue(
        MOCK_CREDENTIALS,
      );
      prisma.onlinePaymentOrder.findUnique.mockResolvedValue(null);
      prisma.onlinePaymentOrder.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, id: 'ord-db-2', createdAt: new Date() }),
      );

      const result = await service.createOnlineOrder(
        SCHOOL_ID,
        MOCK_PARENT_USER,
        { invoiceId: INVOICE_ID },
        'idemp-test-2',
      );

      expect(result.orderId).toBe('order_test_rzp12345');
    });

    it('rejects a student trying to pay for another student invoice', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_OTHER_STUDENT_USER,
          { invoiceId: INVOICE_ID },
          'idemp-test-3',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects unverified parent or parent not linked to the student', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());
      prisma.parentStudentRelation.findFirst.mockResolvedValue(null);

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_PARENT_USER,
          { invoiceId: INVOICE_ID },
          'idemp-test-4',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects school admin without student linkage from paying student invoices', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());
      prisma.parentStudentRelation.findFirst.mockResolvedValue(null);

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_ADMIN_USER,
          { invoiceId: INVOICE_ID },
          'idemp-test-5',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects cross-tenant invoice access without leaking existence', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());

      await expect(
        service.createOnlineOrder(
          OTHER_SCHOOL_ID, // Mismatched tenant context
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID },
          'idemp-test-6',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Outstanding Balance and Partial Payment Rules', () => {
    it('defaults to full outstanding balance when amount is omitted', async () => {
      // 1000 item + 200 fine = 1200
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());
      gatewayConfigService.decryptCredentialsForInternalUse.mockResolvedValue(
        MOCK_CREDENTIALS,
      );
      prisma.onlinePaymentOrder.findUnique.mockResolvedValue(null);
      prisma.onlinePaymentOrder.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, id: 'ord-db-3', createdAt: new Date() }),
      );

      const result = await service.createOnlineOrder(
        SCHOOL_ID,
        MOCK_STUDENT_USER,
        { invoiceId: INVOICE_ID },
        'idemp-test-full',
      );

      expect(result.amount).toBe(1200);
      expect(result.amountInPaise).toBe(120000);
    });

    it('allows valid partial payment less than outstanding balance', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());
      gatewayConfigService.decryptCredentialsForInternalUse.mockResolvedValue(
        MOCK_CREDENTIALS,
      );
      prisma.onlinePaymentOrder.findUnique.mockResolvedValue(null);
      prisma.onlinePaymentOrder.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, id: 'ord-db-4', createdAt: new Date() }),
      );

      const result = await service.createOnlineOrder(
        SCHOOL_ID,
        MOCK_STUDENT_USER,
        { invoiceId: INVOICE_ID, amount: 500.5 },
        'idemp-test-partial',
      );

      expect(result.amount).toBe(500.5);
      expect(result.amountInPaise).toBe(50050);
    });

    it('rejects amount exceeding outstanding balance (overpayment guard)', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID, amount: 1500 }, // Max is 1200
          'idemp-test-overpay',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects zero or negative payment amounts', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID, amount: 0 },
          'idemp-test-zero',
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID, amount: -50 },
          'idemp-test-neg',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects amounts under ₹1.00 (100 paise minimum)', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID, amount: 0.5 },
          'idemp-test-min',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects already fully paid invoices', async () => {
      const fullyPaidInvoice = makeInvoice({
        status: InvoiceStatus.PAID,
      });
      prisma.feeInvoice.findUnique.mockResolvedValue(fullyPaidInvoice);

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID },
          'idemp-test-paid',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects VOID invoices', async () => {
      const voidInvoice = makeInvoice({
        status: InvoiceStatus.VOID,
      });
      prisma.feeInvoice.findUnique.mockResolvedValue(voidInvoice);

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID },
          'idemp-test-void',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('correctly calculates balance with prior principal payment, reversal, and refund', () => {
      // 1000 item: 400 paid principal, but 100 refunded (so net paid 300) -> remaining 700
      // 200 fine: 50 paid, but reversed 50 (so net paid 0), and 50 waived -> remaining 150
      // Total remaining = 700 + 150 = 850
      const complexInvoice = makeInvoice({
        items: [
          {
            id: 'item-complex',
            netAmount: new Prisma.Decimal('1000.00'),
            paymentAllocations: [
              {
                allocationType: AllocationType.PRINCIPAL,
                allocatedAmount: new Prisma.Decimal('400.00'),
                refundAllocations: [
                  {
                    amount: new Prisma.Decimal('100.00'),
                    paymentRefund: { status: RefundStatus.SUCCEEDED },
                  },
                ],
              },
            ],
          },
        ],
        assessedFines: [
          {
            id: 'fine-complex',
            assessedAmount: new Prisma.Decimal('200.00'),
            allocations: [
              {
                allocationType: AllocationType.FINE,
                allocatedAmount: new Prisma.Decimal('50.00'),
                refundAllocations: [],
              },
              {
                allocationType: AllocationType.REVERSAL,
                allocatedAmount: new Prisma.Decimal('50.00'),
                refundAllocations: [],
              },
            ],
            waivers: [{ waivedAmount: new Prisma.Decimal('50.00') }],
          },
        ],
      });

      const balance = service.calculateAuthoritativeBalance(complexInvoice);
      expect(balance.toNumber()).toBe(850);
    });
  });

  describe('Gateway Configuration Checks & TEST-Mode Enforcement', () => {
    it('throws when school payment gateway is not configured', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());
      gatewayConfigService.decryptCredentialsForInternalUse.mockRejectedValue(
        new NotFoundException('Payment gateway is not configured for this school.'),
      );

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID },
          'idemp-test-nogw',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when gateway is not active', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());
      gatewayConfigService.decryptCredentialsForInternalUse.mockRejectedValue(
        new BadRequestException('Payment gateway is currently DISABLED.'),
      );

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID },
          'idemp-test-disabled',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('strictly rejects LIVE credentials in this phase', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());
      gatewayConfigService.decryptCredentialsForInternalUse.mockResolvedValue({
        keyId: 'rzp_live_forbidden123',
        keySecret: 'secret_live',
        environment: GatewayEnvironment.LIVE,
        status: GatewayStatus.ACTIVE,
      });

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID },
          'idemp-test-live',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Idempotency and Concurrency', () => {
    it('returns existing order on duplicate idempotency key (idempotent replay)', async () => {
      const invoice = makeInvoice();
      prisma.feeInvoice.findUnique.mockResolvedValue(invoice);
      gatewayConfigService.decryptCredentialsForInternalUse.mockResolvedValue(
        MOCK_CREDENTIALS,
      );

      const existingOrder = {
        id: 'ord-existing-1',
        schoolId: SCHOOL_ID,
        invoiceId: INVOICE_ID,
        amount: new Prisma.Decimal('1200.00'),
        providerOrderId: 'order_existing_rzp999',
        status: OnlinePaymentStatus.CREATED,
        createdAt: new Date(),
      };
      prisma.onlinePaymentOrder.findUnique.mockResolvedValue(existingOrder);

      const result = await service.createOnlineOrder(
        SCHOOL_ID,
        MOCK_STUDENT_USER,
        { invoiceId: INVOICE_ID },
        'idemp-key-repeat',
      );

      expect(result.orderId).toBe('order_existing_rzp999');
      expect(result.amount).toBe(1200);
      expect(prisma.onlinePaymentOrder.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException if idempotency key is reused with different amount', async () => {
      const invoice = makeInvoice();
      prisma.feeInvoice.findUnique.mockResolvedValue(invoice);
      gatewayConfigService.decryptCredentialsForInternalUse.mockResolvedValue(
        MOCK_CREDENTIALS,
      );

      const existingOrder = {
        id: 'ord-existing-2',
        schoolId: SCHOOL_ID,
        invoiceId: INVOICE_ID,
        amount: new Prisma.Decimal('500.00'), // Different amount
        providerOrderId: 'order_existing_rzp500',
        status: OnlinePaymentStatus.CREATED,
        createdAt: new Date(),
      };
      prisma.onlinePaymentOrder.findUnique.mockResolvedValue(existingOrder);

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID, amount: 600.0 },
          'idemp-key-conflict',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('safely handles concurrent race condition via P2002 duplicate key recovery', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());
      gatewayConfigService.decryptCredentialsForInternalUse.mockResolvedValue(
        MOCK_CREDENTIALS,
      );

      // First check returns null (both threads think no order exists)
      prisma.onlinePaymentOrder.findUnique
        .mockResolvedValueOnce(null)
        // Second check (inside catch block) finds the winner
        .mockResolvedValueOnce({
          id: 'ord-winner',
          providerOrderId: 'order_winner_123',
          amount: new Prisma.Decimal('1200.00'),
          status: OnlinePaymentStatus.CREATED,
          createdAt: new Date(),
        });

      // Thread fails with unique constraint error P2002
      prisma.onlinePaymentOrder.create.mockRejectedValue({
        code: 'P2002',
        message: 'Unique constraint failed on schoolId_idempotencyKey',
      });

      const result = await service.createOnlineOrder(
        SCHOOL_ID,
        MOCK_STUDENT_USER,
        { invoiceId: INVOICE_ID },
        'idemp-race-test',
      );

      expect(result.orderId).toBe('order_winner_123');
    });

    it('rejects idempotent replay if previous attempt is older than 2 hours (stale attempt expiry)', async () => {
      const invoice = makeInvoice();
      prisma.feeInvoice.findUnique.mockResolvedValue(invoice);
      gatewayConfigService.decryptCredentialsForInternalUse.mockResolvedValue(
        MOCK_CREDENTIALS,
      );

      // 3 hours old
      const staleDate = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const staleOrder = {
        id: 'ord-stale-1',
        schoolId: SCHOOL_ID,
        invoiceId: INVOICE_ID,
        amount: new Prisma.Decimal('1200.00'),
        providerOrderId: 'order_old_rzp111',
        status: OnlinePaymentStatus.CREATED,
        createdAt: staleDate,
      };
      prisma.onlinePaymentOrder.findUnique.mockResolvedValue(staleOrder);
      prisma.onlinePaymentOrder.update.mockResolvedValue({
        ...staleOrder,
        status: OnlinePaymentStatus.EXPIRED,
      });

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID },
          'idemp-stale-key',
        ),
      ).rejects.toThrow(/Payment attempt has expired/);

      expect(prisma.onlinePaymentOrder.update).toHaveBeenCalledWith({
        where: { id: 'ord-stale-1' },
        data: { status: OnlinePaymentStatus.EXPIRED },
      });
    });

    it('sanitizes database persistence failure without leaking raw provider order ID', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());
      gatewayConfigService.decryptCredentialsForInternalUse.mockResolvedValue(
        MOCK_CREDENTIALS,
      );
      prisma.onlinePaymentOrder.findUnique.mockResolvedValue(null);

      // Unexpected database failure (e.g. connection lost)
      prisma.onlinePaymentOrder.create.mockRejectedValue(
        new Error('Database write failure'),
      );

      try {
        await service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID },
          'idemp-db-fail',
        );
        throw new Error('Should have thrown InternalServerErrorException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(InternalServerErrorException);
        expect(err.message).not.toContain('order_test_rzp12345');
        expect(err.message).toContain('reference code:');
      }
    });
  });

  describe('Provider Errors and Timeouts', () => {
    it('handles gateway authentication failure (HTTP 401)', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());
      gatewayConfigService.decryptCredentialsForInternalUse.mockResolvedValue(
        MOCK_CREDENTIALS,
      );
      prisma.onlinePaymentOrder.findUnique.mockResolvedValue(null);

      jest
        .spyOn<any, any>(service, 'executeRazorpayCreateOrder')
        .mockRejectedValue(
          new BadGatewayException('Payment gateway authentication failed.'),
        );

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID },
          'idemp-provider-401',
        ),
      ).rejects.toThrow(BadGatewayException);
    });

    it('handles provider timeout (GatewayTimeoutException)', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(makeInvoice());
      gatewayConfigService.decryptCredentialsForInternalUse.mockResolvedValue(
        MOCK_CREDENTIALS,
      );
      prisma.onlinePaymentOrder.findUnique.mockResolvedValue(null);

      jest
        .spyOn<any, any>(service, 'executeRazorpayCreateOrder')
        .mockRejectedValue(
          new GatewayTimeoutException(
            'Connection to payment gateway timed out. Please check order status before retrying.',
          ),
        );

      await expect(
        service.createOnlineOrder(
          SCHOOL_ID,
          MOCK_STUDENT_USER,
          { invoiceId: INVOICE_ID },
          'idemp-provider-timeout',
        ),
      ).rejects.toThrow(GatewayTimeoutException);
    });
  });
});
