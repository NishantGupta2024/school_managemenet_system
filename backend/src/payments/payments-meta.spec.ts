import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptSequenceService } from './receipt-sequence.service';
import { ReversalSequenceService } from './reversal-sequence.service';
import { FeeGenerationService } from '../fee-generation/fee-generation.service';
import { NotificationOutboxService } from '../notifications/outbox/notification-outbox.service';

describe('PaymentsService — findAllPayments empty student/parent handling (F-07)', () => {
  let service: PaymentsService;
  let prismaMock: any;

  const mockSchoolId = 'sch-001';

  beforeEach(async () => {
    prismaMock = {
      student: {
        findFirst: jest.fn(),
      },
      parentStudentRelation: {
        findMany: jest.fn(),
      },
      payment: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ReceiptSequenceService, useValue: {} },
        { provide: ReversalSequenceService, useValue: {} },
        { provide: FeeGenerationService, useValue: {} },
        { provide: NotificationOutboxService, useValue: {} },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('returns valid empty paginated response with meta when student has no linked student record', async () => {
    prismaMock.student.findFirst.mockResolvedValue(null);

    const studentUser = {
      id: 'user-stud-1',
      role: UserRole.STUDENT,
      schoolId: mockSchoolId,
    };

    const result = await service.findAllPayments(mockSchoolId, studentUser, { page: '1', limit: '15' });

    expect(result).toEqual({
      data: [],
      meta: {
        page: 1,
        limit: 15,
        total: 0,
        totalPages: 0,
      },
    });
    expect(prismaMock.payment.findMany).not.toHaveBeenCalled();
  });

  it('returns valid empty paginated response with meta when parent has no linked children', async () => {
    prismaMock.parentStudentRelation.findMany.mockResolvedValue([]);

    const parentUser = {
      id: 'user-parent-1',
      role: UserRole.PARENT,
      schoolId: mockSchoolId,
    };

    const result = await service.findAllPayments(mockSchoolId, parentUser, { page: '2', limit: '10' });

    expect(result).toEqual({
      data: [],
      meta: {
        page: 2,
        limit: 10,
        total: 0,
        totalPages: 0,
      },
    });
    expect(prismaMock.payment.findMany).not.toHaveBeenCalled();
  });
});
