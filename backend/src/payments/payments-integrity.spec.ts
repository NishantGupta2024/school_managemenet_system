import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentMethod, UserRole } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService, computeCanonicalRequestHash } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { ReceiptSequenceService } from './receipt-sequence.service';
import { ReversalSequenceService } from './reversal-sequence.service';
import { FineRulesService } from '../fine-rules/fine-rules.service';
import { FeeGenerationService } from '../fee-generation/fee-generation.service';
import { NotificationOutboxService } from '../notifications/outbox/notification-outbox.service';

describe('Financial Integrity & Mandatory Idempotency (FEE-P1E)', () => {
  let controller: PaymentsController;
  let mockPaymentsService: any;
  let prisma: PrismaService;

  const mockSchoolId = '00000000-0000-0000-0000-000000000001';
  const mockUser = {
    id: '00000000-0000-0000-0000-000000000011',
    schoolId: mockSchoolId,
    role: UserRole.SCHOOL_ADMIN,
  };
  const mockReq = {
    school: { id: mockSchoolId },
    user: mockUser,
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mockPaymentsService = {
      collectPayment: jest.fn().mockResolvedValue({ id: 'pay-1', success: true }),
      reversePayment: jest.fn().mockResolvedValue({ id: 'rev-1', success: true }),
      createRefund: jest.fn().mockResolvedValue({ id: 'ref-1', success: true }),
    };
    controller = new PaymentsController(mockPaymentsService);
  });

  describe('1. Controller Mandatory Idempotency Key Validation', () => {
    it('rejects POST /payments/collect when idempotency-key is missing', async () => {
      const dto: any = { studentId: 'stu-1', amount: 500 };
      await expect(
        controller.collectPayment(mockReq, dto, undefined),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.collectPayment(mockReq, dto, undefined),
      ).rejects.toThrow(/Header "idempotency-key" is required for payment collection/);
    });

    it('rejects POST /payments/collect when idempotency-key is blank or whitespace', async () => {
      const dto: any = { studentId: 'stu-1', amount: 500 };
      await expect(
        controller.collectPayment(mockReq, dto, '   '),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.collectPayment(mockReq, dto, ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects POST /payments/collect when idempotency-key exceeds 255 characters', async () => {
      const dto: any = { studentId: 'stu-1', amount: 500 };
      const longKey = 'k'.repeat(256);
      await expect(
        controller.collectPayment(mockReq, dto, longKey),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.collectPayment(mockReq, dto, longKey),
      ).rejects.toThrow(/must not exceed 255 characters/);
    });

    it('accepts valid header idempotency-key and trims it', async () => {
      const dto: any = { studentId: 'stu-1', amount: 500 };
      await controller.collectPayment(mockReq, dto, '  valid-key-123  ');
      expect(mockPaymentsService.collectPayment).toHaveBeenCalledWith(
        mockSchoolId,
        mockUser,
        dto,
        'valid-key-123',
      );
    });

    it('accepts body idempotencyKey as fallback if header is omitted', async () => {
      const dto: any = { studentId: 'stu-1', amount: 500, idempotencyKey: 'body-key-456' };
      await controller.collectPayment(mockReq, dto, undefined);
      expect(mockPaymentsService.collectPayment).toHaveBeenCalledWith(
        mockSchoolId,
        mockUser,
        dto,
        'body-key-456',
      );
    });

    it('rejects POST /payments/:id/reverse when idempotency-key is missing or blank', async () => {
      const dto: any = { reason: 'Test reversal reason long enough', reversalType: 'VOID' };
      await expect(
        controller.reversePayment(mockReq, 'pay-123', dto, undefined),
      ).rejects.toThrow(/Header "idempotency-key" is required for payment reversal/);
      await expect(
        controller.reversePayment(mockReq, 'pay-123', dto, '   '),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects POST /payments/:id/refund when idempotency-key is missing or blank', async () => {
      const dto: any = { amount: 100, reason: 'Duplicate payment reason long enough' };
      await expect(
        controller.createRefund(mockReq, 'pay-123', dto, undefined),
      ).rejects.toThrow(/Header "idempotency-key" is required for payment refund/);
      await expect(
        controller.createRefund(mockReq, 'pay-123', dto, '   '),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Database PostgreSQL CHECK Constraints Enforcement', () => {
    it('chk_payments_amount_positive rejects payment amount <= 0', async () => {
      await expect(
        prisma.$executeRaw`
          UPDATE "payments"
          SET "amount" = -10.00
          WHERE "id" = (SELECT "id" FROM "payments" LIMIT 1);
        `,
      ).rejects.toThrow(/chk_payments_amount_positive/);

      await expect(
        prisma.$executeRaw`
          UPDATE "payments"
          SET "amount" = 0.00
          WHERE "id" = (SELECT "id" FROM "payments" LIMIT 1);
        `,
      ).rejects.toThrow(/chk_payments_amount_positive/);
    });

    it('chk_payment_allocations_amount_positive rejects allocatedAmount <= 0', async () => {
      await expect(
        prisma.$executeRaw`
          UPDATE "payment_allocations"
          SET "allocatedAmount" = 0.00
          WHERE "id" = (SELECT "id" FROM "payment_allocations" LIMIT 1);
        `,
      ).rejects.toThrow(/chk_payment_allocations_amount_positive/);
    });

    it('chk_payment_refunds_amount_positive rejects refundAmount <= 0', async () => {
      await expect(
        prisma.$executeRaw`
          INSERT INTO "payment_refunds" (
            "id", "schoolId", "paymentId", "refundAmount", "reason", "status", "createdAt", "updatedAt"
          ) SELECT
            gen_random_uuid(), p."schoolId", p."id", 0.00, 'Test reject', 'PENDING', NOW(), NOW()
          FROM "payments" p LIMIT 1;
        `,
      ).rejects.toThrow(/chk_payment_refunds_amount_positive/);
    });

    it('chk_payment_refund_allocations_amount_positive rejects refund allocation amount <= 0', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          const pay = await tx.payment.findFirst();
          const alloc = await tx.paymentAllocation.findFirst();
          const ref = await tx.paymentRefund.create({
            data: {
              schoolId: pay!.schoolId,
              paymentId: pay!.id,
              refundAmount: 50.0,
              reason: 'Temp test refund for constraint verification',
            },
          });
          await tx.$executeRaw`
            INSERT INTO "payment_refund_allocations" (
              "id", "schoolId", "paymentRefundId", "originalAllocationId", "amount", "createdAt"
            ) VALUES (
              gen_random_uuid(), ${pay!.schoolId}::uuid, ${ref.id}::uuid, ${alloc!.id}::uuid,
              -5.00, NOW()
            );
          `;
        }),
      ).rejects.toThrow(/chk_payment_refund_allocations_amount_positive/);
    });

    it('chk_payment_reversals_total_amount_positive rejects totalAmount <= 0', async () => {
      await expect(
        prisma.$executeRaw`
          INSERT INTO "payment_reversals" (
            "id", "schoolId", "paymentId", "reversalNumber", "reversalType",
            "totalAmount", "reason", "createdAt"
          ) SELECT
            gen_random_uuid(), p."schoolId", p."id", 'REV-TEMP-REJECT', 'VOID',
            0.00, 'Reversal test', NOW()
          FROM "payments" p LIMIT 1;
        `,
      ).rejects.toThrow(/chk_payment_reversals_total_amount_positive/);
    });

    it('chk_receipts_total_amount_positive rejects receipt totalAmount <= 0', async () => {
      await expect(
        prisma.$executeRaw`
          UPDATE "receipts"
          SET "totalAmount" = 0.00
          WHERE "id" = (SELECT "id" FROM "receipts" LIMIT 1);
        `,
      ).rejects.toThrow(/chk_receipts_total_amount_positive/);
    });

    it('chk_fee_invoices_amounts_valid rejects netAmount mismatch with grossAmount - discountAmount', async () => {
      await expect(
        prisma.$executeRaw`
          UPDATE "fee_invoices"
          SET "netAmount" = "grossAmount" - "discountAmount" + 100.00
          WHERE "id" = (SELECT "id" FROM "fee_invoices" LIMIT 1);
        `,
      ).rejects.toThrow(/chk_fee_invoices_amounts_valid/);
    });

    it('chk_fee_invoices_amounts_valid rejects discountAmount > grossAmount', async () => {
      await expect(
        prisma.$executeRaw`
          UPDATE "fee_invoices"
          SET "discountAmount" = "grossAmount" + 50.00, "netAmount" = -50.00
          WHERE "id" = (SELECT "id" FROM "fee_invoices" LIMIT 1);
        `,
      ).rejects.toThrow(/chk_fee_invoices_amounts_valid/);
    });

    it('chk_invoice_items_amounts_valid rejects netAmount mismatch in invoice items', async () => {
      await expect(
        prisma.$executeRaw`
          UPDATE "invoice_items"
          SET "netAmount" = "grossAmount" - "discountAmount" - 10.00
          WHERE "id" = (SELECT "id" FROM "invoice_items" LIMIT 1);
        `,
      ).rejects.toThrow(/chk_invoice_items_amounts_valid/);
    });

    it('chk_assessed_fines_amount_non_negative rejects negative assessedAmount', async () => {
      await expect(
        prisma.$executeRaw`
          INSERT INTO "assessed_fines" (
            "id", "schoolId", "invoiceId", "assessedAmount", "asOfDate", "overdueDays",
            "status", "calculationSnapshot", "createdAt", "updatedAt"
          ) SELECT
            gen_random_uuid(), i."schoolId", i."id", -25.00, NOW(), 5,
            'OUTSTANDING', '{}'::jsonb, NOW(), NOW()
          FROM "fee_invoices" i LIMIT 1;
        `,
      ).rejects.toThrow(/chk_assessed_fines_amount_non_negative/);
    });

    it('chk_fine_waivers_amount_positive rejects waivedAmount <= 0', async () => {
      await expect(
        prisma.$executeRaw`
          INSERT INTO "fine_waivers" (
            "id", "schoolId", "invoiceId", "waivedAmount", "reason", "createdAt"
          ) SELECT
            gen_random_uuid(), i."schoolId", i."id", 0.00, 'Test waiver zero', NOW()
          FROM "fee_invoices" i LIMIT 1;
        `,
      ).rejects.toThrow(/chk_fine_waivers_amount_positive/);
    });

    it('chk_fee_structure_items_amount_non_negative rejects negative fee structure item amount', async () => {
      await expect(
        prisma.$executeRaw`
          UPDATE "fee_structure_items"
          SET "amount" = -1.00
          WHERE "id" = (SELECT "id" FROM "fee_structure_items" LIMIT 1);
        `,
      ).rejects.toThrow(/chk_fee_structure_items_amount_non_negative/);
    });
  });

  describe('3. Idempotency Replay & Conflict Safety', () => {
    it('returns existing payment with isIdempotentReplay=true on duplicate request with identical payload', async () => {
      const testDto: any = {
        studentId: '00000000-0000-0000-0000-000000000021',
        academicYearId: '00000000-0000-0000-0000-000000000031',
        amount: 500,
        paymentMethod: PaymentMethod.CASH,
      };
      const expectedHash = computeCanonicalRequestHash(testDto);
      const mockExistingPayment = {
        id: 'existing-pay-uuid',
        schoolId: mockSchoolId,
        requestHash: expectedHash,
        allocations: [{ id: 'alloc-1', allocatedAmount: 500 }],
        receipt: { id: 'rcpt-1', receiptNumber: 'RCP-001' },
      };

      const mockPrisma = {
        payment: {
          findUnique: jest.fn().mockResolvedValue(mockExistingPayment),
        },
      };

      const unitService = new PaymentsService(
        mockPrisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const result = await unitService.collectPayment(
        mockSchoolId,
        mockUser,
        testDto,
        'valid-idemp-key',
      );

      expect(result.isIdempotentReplay).toBe(true);
      expect(result.payment.id).toBe('existing-pay-uuid');
      expect(result.receipt?.receiptNumber).toBe('RCP-001');
    });

    it('throws ConflictException (409) when idempotency key is reused with different payload', async () => {
      const originalDto: any = {
        studentId: '00000000-0000-0000-0000-000000000021',
        amount: 500,
        paymentMethod: PaymentMethod.CASH,
      };
      const originalHash = computeCanonicalRequestHash(originalDto);

      const mockExistingPayment = {
        id: 'existing-pay-uuid',
        schoolId: mockSchoolId,
        requestHash: originalHash,
        allocations: [],
        receipt: null,
      };

      const mockPrisma = {
        payment: {
          findUnique: jest.fn().mockResolvedValue(mockExistingPayment),
        },
      };

      const unitService = new PaymentsService(
        mockPrisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const alteredDto: any = {
        studentId: '00000000-0000-0000-0000-000000000021',
        amount: 9999, // Conflicting amount
        paymentMethod: PaymentMethod.CASH,
      };

      await expect(
        unitService.collectPayment(
          mockSchoolId,
          mockUser,
          alteredDto,
          'valid-idemp-key',
        ),
      ).rejects.toThrow(ConflictException);

      await expect(
        unitService.collectPayment(
          mockSchoolId,
          mockUser,
          alteredDto,
          'valid-idemp-key',
        ),
      ).rejects.toThrow(/already used with a different request payload/);
    });
  });
});
