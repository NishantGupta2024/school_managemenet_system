import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  InvoiceStatus,
  OnlinePaymentStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { OnlinePaymentsService } from './online-payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolPaymentGatewayConfigService } from '../schools/school-payment-gateway-config.service';
import {
  QueueStatusFilter,
  ReconciliationQueueQueryDto,
} from './dto/reconciliation-queue-query.dto';
import {
  ResolveOnlineSurplusDto,
  SurplusResolutionAction,
} from './dto/resolve-online-surplus.dto';

describe('OnlinePaymentsService — Reconciliation Queue & Resolution (Phase G1)', () => {
  let service: OnlinePaymentsService;
  let prisma: any;

  const schoolIdA = 'school-alpha-uuid';
  const schoolIdB = 'school-beta-uuid';

  const adminUser = {
    id: 'user-admin-1',
    name: 'Mrs. Admin',
    email: 'admin@alpha.edu',
    role: UserRole.SCHOOL_ADMIN,
    schoolId: schoolIdA,
  };

  const staffUser = {
    id: 'user-staff-1',
    name: 'Cashier Staff',
    email: 'staff@alpha.edu',
    role: UserRole.FEE_STAFF,
    schoolId: schoolIdA,
  };

  const studentUser = {
    id: 'user-student-1',
    role: UserRole.STUDENT,
    schoolId: schoolIdA,
  };

  const sampleSurplusOrder = {
    id: 'order-surplus-uuid-1',
    schoolId: schoolIdA,
    studentId: 'student-1',
    invoiceId: 'inv-1',
    providerOrderId: 'order_rzp_surplus_1',
    providerPaymentId: 'pay_rzp_surplus_1',
    amount: new Prisma.Decimal(2000),
    status: OnlinePaymentStatus.SUCCESS,
    verifiedAt: new Date(),
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
      id: 'student-1',
      admissionNumber: 'ADM-001',
      firstName: 'Rohan',
      lastName: 'Mehra',
      grade: { name: 'Grade 10' },
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
      amount: new Prisma.Decimal(500),
      receipt: { receiptNumber: 'REC-2026-0001' },
    },
  };

  beforeEach(async () => {
    prisma = {
      onlinePaymentOrder: {
        findMany: jest.fn().mockResolvedValue([sampleSurplusOrder]),
        findUnique: jest.fn().mockResolvedValue(sampleSurplusOrder),
        update: jest.fn().mockImplementation((args) =>
          Promise.resolve({
            ...sampleSurplusOrder,
            metadata: args.data.metadata,
          }),
        ),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: sampleSurplusOrder.id,
          schoolId: sampleSurplusOrder.schoolId,
          status: sampleSurplusOrder.status,
          amount: sampleSurplusOrder.amount,
          metadata: sampleSurplusOrder.metadata,
        },
      ]),
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return await callback(prisma);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnlinePaymentsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: SchoolPaymentGatewayConfigService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<OnlinePaymentsService>(OnlinePaymentsService);
  });

  // -------------------------------------------------------------
  // Reconciliation Queue Tests
  // -------------------------------------------------------------
  describe('Reconciliation Queue Access and Scoping', () => {
    it('allows SCHOOL_ADMIN and PLATFORM_SUPER_ADMIN to view queue', async () => {
      const result = await service.getReconciliationQueue(
        schoolIdA,
        adminUser,
        {},
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].orderId).toBe(sampleSurplusOrder.id);
      expect(result.data[0].surplusAmount).toBe(1500);
      expect(result.data[0].student.admissionNumber).toBe('ADM-001');
    });

    it('rejects FEE_STAFF and STUDENT roles with ForbiddenException', async () => {
      await expect(
        service.getReconciliationQueue(schoolIdA, staffUser, {}),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.getReconciliationQueue(schoolIdA, studentUser, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('strictly isolates queue by schoolId', async () => {
      await service.getReconciliationQueue(schoolIdA, adminUser, {});

      expect(prisma.onlinePaymentOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            schoolId: schoolIdA,
            status: OnlinePaymentStatus.SUCCESS,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // Reconciliation Resolution Action Tests
  // -------------------------------------------------------------
  describe('Surplus Resolution Action', () => {
    const validDto: ResolveOnlineSurplusDto = {
      action: SurplusResolutionAction.OFFLINE_REFUND_PROCESSED,
      notes: 'Parent refunded ₹1,500 cash at administration counter with signed receipt.',
      externalReferenceNumber: 'CASH-REF-0988',
    };

    it('resolves surplus order idempotently and preserves complete audit trail', async () => {
      const result = await service.resolveSurplusOrder(
        schoolIdA,
        adminUser,
        sampleSurplusOrder.id,
        validDto,
      );

      expect(result.success).toBe(true);
      expect(result.surplusAmount).toBe(1500);
      expect(result.resolutionAction).toBe(
        SurplusResolutionAction.OFFLINE_REFUND_PROCESSED,
      );
      expect(result.resolvedBy).toBe(adminUser.name);
      expect(prisma.onlinePaymentOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sampleSurplusOrder.id },
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              reconciliationStatus: 'RESOLVED',
              resolutionAction: SurplusResolutionAction.OFFLINE_REFUND_PROCESSED,
              requiresManualReconciliation: false,
              resolvedByUserId: adminUser.id,
            }),
          }),
        }),
      );
    });

    it('prevents double-resolution: rejects second resolution with ConflictException', async () => {
      // Simulate order already resolved in database
      prisma.$queryRaw.mockResolvedValue([
        {
          id: sampleSurplusOrder.id,
          schoolId: sampleSurplusOrder.schoolId,
          status: sampleSurplusOrder.status,
          amount: sampleSurplusOrder.amount,
          metadata: {
            ...sampleSurplusOrder.metadata,
            reconciliationStatus: 'RESOLVED',
            resolutionAction: SurplusResolutionAction.OFFLINE_REFUND_PROCESSED,
          },
        },
      ]);

      await expect(
        service.resolveSurplusOrder(
          schoolIdA,
          adminUser,
          sampleSurplusOrder.id,
          validDto,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('strictly enforces cross-tenant access denial (Admin from School B cannot resolve School A order)', async () => {
      const adminSchoolB = { ...adminUser, schoolId: schoolIdB };

      // Order belongs to School A, but request is scoped to School B
      await expect(
        service.resolveSurplusOrder(
          schoolIdB,
          adminSchoolB,
          sampleSurplusOrder.id,
          validDto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects resolution on orders with zero surplus', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: sampleSurplusOrder.id,
          schoolId: sampleSurplusOrder.schoolId,
          status: sampleSurplusOrder.status,
          amount: sampleSurplusOrder.amount,
          metadata: {
            ...sampleSurplusOrder.metadata,
            surplusAmount: 0,
          },
        },
      ]);

      await expect(
        service.resolveSurplusOrder(
          schoolIdA,
          adminUser,
          sampleSurplusOrder.id,
          validDto,
        ),
      ).rejects.toThrow(/has no surplus funds requiring reconciliation/);
    });

    it('rejects resolution on non-SUCCESS orders (e.g. CREATED or FAILED)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: sampleSurplusOrder.id,
          schoolId: sampleSurplusOrder.schoolId,
          status: OnlinePaymentStatus.FAILED,
          amount: sampleSurplusOrder.amount,
          metadata: sampleSurplusOrder.metadata,
        },
      ]);

      await expect(
        service.resolveSurplusOrder(
          schoolIdA,
          adminUser,
          sampleSurplusOrder.id,
          validDto,
        ),
      ).rejects.toThrow(
        /Only successfully captured online payment orders can be reconciled/,
      );
    });

    it('rejects refund actions without mandatory external reference number', async () => {
      const missingRefDto: ResolveOnlineSurplusDto = {
        action: SurplusResolutionAction.OFFLINE_REFUND_PROCESSED,
        notes: 'Claimed refund processed offline at counter',
        externalReferenceNumber: '   ', // empty or whitespace
      };

      await expect(
        service.resolveSurplusOrder(
          schoolIdA,
          adminUser,
          sampleSurplusOrder.id,
          missingRefDto,
        ),
      ).rejects.toThrow(
        /An external reference number .* is required for refund action/,
      );
    });

    it('allows non-refund administrative actions without external reference number', async () => {
      const nonRefundDto: ResolveOnlineSurplusDto = {
        action: SurplusResolutionAction.ADMINISTRATIVE_ADJUSTMENT,
        notes: 'Administrative write-off authorized by school principal per waiver policy.',
      };

      const result = await service.resolveSurplusOrder(
        schoolIdA,
        adminUser,
        sampleSurplusOrder.id,
        nonRefundDto,
      );

      expect(result.success).toBe(true);
      expect(result.resolutionAction).toBe(
        SurplusResolutionAction.ADMINISTRATIVE_ADJUSTMENT,
      );
      expect(result.externalReferenceNumber).toBeNull();
    });
  });
});
