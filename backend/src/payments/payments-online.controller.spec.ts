import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { OnlinePaymentsService } from './online-payments.service';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';

describe('PaymentsController Online Order Endpoint (Phase E)', () => {
  let controller: PaymentsController;
  let onlinePaymentsService: any;
  let paymentsService: any;
  let reflector: Reflector;

  const SCHOOL_ID = 'sch-uuid-1';
  const MOCK_REQ = {
    school: { id: SCHOOL_ID },
    user: { id: 'user-stud-1', role: UserRole.STUDENT, schoolId: SCHOOL_ID },
  };

  beforeEach(async () => {
    onlinePaymentsService = {
      createOnlineOrder: jest.fn(),
    };
    paymentsService = {};

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        {
          provide: PaymentsService,
          useValue: paymentsService,
        },
        {
          provide: OnlinePaymentsService,
          useValue: onlinePaymentsService,
        },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PaymentsController>(PaymentsController);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Authorization Metadata', () => {
    it('allows STUDENT, PARENT, PLATFORM_SUPER_ADMIN, SCHOOL_ADMIN, and FEE_STAFF at controller route level', () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.createOnlineOrder,
      );
      expect(roles).toContain(UserRole.STUDENT);
      expect(roles).toContain(UserRole.PARENT);
      expect(roles).toContain(UserRole.SCHOOL_ADMIN);
      expect(roles).toContain(UserRole.FEE_STAFF);
    });
  });

  describe('createOnlineOrder', () => {
    it('resolves idempotency key from header and delegates to service', async () => {
      const mockDto = { invoiceId: 'inv-uuid-1', amount: 500 };
      const expectedResponse = {
        orderId: 'order_test_123',
        keyId: 'rzp_test_key',
        amount: 500,
        amountInPaise: 50000,
        currency: 'INR',
        invoiceId: 'inv-uuid-1',
        studentId: 'stud-1',
        schoolName: 'Greenwood High',
        studentName: 'Rahul Sharma',
        idempotencyKey: 'header-idemp-key',
        status: 'CREATED',
        createdAt: new Date().toISOString(),
      };

      onlinePaymentsService.createOnlineOrder.mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.createOnlineOrder(
        MOCK_REQ,
        mockDto,
        'header-idemp-key',
      );

      expect(onlinePaymentsService.createOnlineOrder).toHaveBeenCalledWith(
        SCHOOL_ID,
        MOCK_REQ.user,
        mockDto,
        'header-idemp-key',
      );
      expect(result).toEqual(expectedResponse);
    });

    it('falls back to body idempotency key if header is omitted', async () => {
      const mockDto = {
        invoiceId: 'inv-uuid-1',
        idempotencyKey: 'body-idemp-key',
      };
      onlinePaymentsService.createOnlineOrder.mockResolvedValue({
        orderId: 'order_test_456',
      });

      await controller.createOnlineOrder(MOCK_REQ, mockDto, undefined);

      expect(onlinePaymentsService.createOnlineOrder).toHaveBeenCalledWith(
        SCHOOL_ID,
        MOCK_REQ.user,
        mockDto,
        'body-idemp-key',
      );
    });

    it('throws BadRequestException if neither header nor body provides idempotency key', async () => {
      const mockDto = { invoiceId: 'inv-uuid-1' };

      await expect(
        controller.createOnlineOrder(MOCK_REQ, mockDto, undefined),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Reconciliation Endpoints (Phase G1)', () => {
    it('restricts reconciliation-queue route to PLATFORM_SUPER_ADMIN and SCHOOL_ADMIN', () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.getReconciliationQueue,
      );
      expect(roles).toEqual([
        UserRole.PLATFORM_SUPER_ADMIN,
        UserRole.SCHOOL_ADMIN,
      ]);
    });

    it('delegates getReconciliationQueue to onlinePaymentsService', async () => {
      onlinePaymentsService.getReconciliationQueue = jest
        .fn()
        .mockResolvedValue({ data: [] });
      const query = { page: 1, limit: 10 };

      await controller.getReconciliationQueue(MOCK_REQ, query as any);

      expect(onlinePaymentsService.getReconciliationQueue).toHaveBeenCalledWith(
        SCHOOL_ID,
        MOCK_REQ.user,
        query,
      );
    });

    it('restricts reconcile route to PLATFORM_SUPER_ADMIN and SCHOOL_ADMIN', () => {
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        controller.resolveSurplusOrder,
      );
      expect(roles).toEqual([
        UserRole.PLATFORM_SUPER_ADMIN,
        UserRole.SCHOOL_ADMIN,
      ]);
    });

    it('delegates resolveSurplusOrder to onlinePaymentsService', async () => {
      onlinePaymentsService.resolveSurplusOrder = jest
        .fn()
        .mockResolvedValue({ success: true });
      const dto = {
        action: 'OFFLINE_REFUND_PROCESSED' as any,
        notes: 'Refunded cash counter-side with receipt',
        externalReferenceNumber: 'CASH-REC-10023',
      };

      await controller.resolveSurplusOrder(MOCK_REQ, 'order-uuid-1', dto);

      expect(onlinePaymentsService.resolveSurplusOrder).toHaveBeenCalledWith(
        SCHOOL_ID,
        MOCK_REQ.user,
        'order-uuid-1',
        dto,
      );
    });
  });
});
