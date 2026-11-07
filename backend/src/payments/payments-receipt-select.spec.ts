import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService, SAFE_RECEIPT_SELECT, SAFE_SCHOOL_SELECT } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptSequenceService } from './receipt-sequence.service';
import { ReversalSequenceService } from './reversal-sequence.service';
import { FeeGenerationService } from '../fee-generation/fee-generation.service';
import { NotificationOutboxService } from '../notifications/outbox/notification-outbox.service';
import { ReceiptArtifactService } from '../receipt-templates/receipt-artifact.service';
import { UserRole } from '@prisma/client';

describe('PaymentsService - Receipt Selection Schema Drift Regression Guards', () => {
  let service: PaymentsService;
  let prisma: {
    payment: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
    };
    receipt: {
      findUnique: jest.Mock;
    };
    student: {
      findMany: jest.Mock;
    };
    parentStudentRelation: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      payment: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
      receipt: {
        findUnique: jest.fn(),
      },
      student: {
        findMany: jest.fn(),
      },
      parentStudentRelation: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReceiptSequenceService, useValue: {} },
        { provide: ReversalSequenceService, useValue: {} },
        { provide: FeeGenerationService, useValue: {} },
        { provide: NotificationOutboxService, useValue: {} },
        { provide: ReceiptArtifactService, useValue: {} },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('SAFE_RECEIPT_SELECT does not include unmigrated templateVersionId', () => {
    expect((SAFE_RECEIPT_SELECT as any).templateVersionId).toBeUndefined();
    expect(SAFE_RECEIPT_SELECT.receiptNumber).toBe(true);
    expect(SAFE_RECEIPT_SELECT.totalAmount).toBe(true);
    expect(SAFE_RECEIPT_SELECT.status).toBe(true);
  });

  it('SAFE_SCHOOL_SELECT does not include unmigrated defaultReceiptTemplateId', () => {
    expect((SAFE_SCHOOL_SELECT as any).defaultReceiptTemplateId).toBeUndefined();
    expect(SAFE_SCHOOL_SELECT.id).toBe(true);
    expect(SAFE_SCHOOL_SELECT.name).toBe(true);
    expect(SAFE_SCHOOL_SELECT.code).toBe(true);
    expect(SAFE_SCHOOL_SELECT.status).toBe(true);
  });

  it('findAllPayments explicitly selects SAFE_RECEIPT_SELECT and does not query templateVersionId', async () => {
    prisma.payment.findMany.mockResolvedValue([]);
    prisma.payment.count.mockResolvedValue(0);

    const user = {
      id: 'admin-1',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: 'school-1',
    };

    await service.findAllPayments('school-1', user, { page: 1, limit: 10 });

    expect(prisma.payment.findMany).toHaveBeenCalledTimes(1);
    const queryArg = prisma.payment.findMany.mock.calls[0][0];

    // Ensure receipt is NOT requested with `receipt: true`
    expect(queryArg.include.receipt).not.toBe(true);

    // Ensure receipt is requested via safe select
    expect(queryArg.include.receipt).toEqual({
      select: SAFE_RECEIPT_SELECT,
    });
    expect(queryArg.include.receipt.select.templateVersionId).toBeUndefined();
  });

  it('findPaymentById explicitly selects SAFE_RECEIPT_SELECT', async () => {
    prisma.payment.findUnique.mockResolvedValue({
      id: 'pay-1',
      schoolId: 'school-1',
      student: { id: 'stu-1' },
    });

    const user = {
      id: 'admin-1',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: 'school-1',
    };

    await service.findPaymentById('school-1', user, 'pay-1');

    expect(prisma.payment.findUnique).toHaveBeenCalledTimes(1);
    const queryArg = prisma.payment.findUnique.mock.calls[0][0];

    expect(queryArg.include.receipt).not.toBe(true);
    expect(queryArg.include.receipt).toEqual({
      select: SAFE_RECEIPT_SELECT,
    });
    expect(queryArg.include.receipt.select.templateVersionId).toBeUndefined();
  });

  it('findReceiptByNumber explicitly uses select without templateVersionId', async () => {
    prisma.receipt.findUnique.mockResolvedValue({
      id: 'rct-1',
      schoolId: 'school-1',
      receiptNumber: 'RCT-202627-00001',
      payment: {
        student: { userId: 'stu-user-1' },
      },
    });

    const user = {
      id: 'admin-1',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: 'school-1',
    };

    await service.findReceiptByNumber('school-1', user, 'RCT-202627-00001');

    expect(prisma.receipt.findUnique).toHaveBeenCalledTimes(1);
    const queryArg = prisma.receipt.findUnique.mock.calls[0][0];

    expect(queryArg.select).toBeDefined();
    expect(queryArg.select.templateVersionId).toBeUndefined();
    expect(queryArg.select.receiptNumber).toBe(true);
  });
});
