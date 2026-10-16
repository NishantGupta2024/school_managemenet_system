import { Test, TestingModule } from '@nestjs/testing';
import {
  NotificationChannel,
  NotificationEventType,
  NotificationStatus,
  Prisma,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { NotificationOutboxService } from './notification-outbox.service';

describe('NotificationOutboxService', () => {
  let service: NotificationOutboxService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationOutboxService],
    }).compile();

    service = module.get<NotificationOutboxService>(NotificationOutboxService);
  });

  const mockSchoolId = '00000000-0000-0000-0000-000000000001';
  const otherSchoolId = '00000000-0000-0000-0000-000000000002';
  const mockReceiptId = 'rcpt-uuid-100';
  const mockPaymentId = 'pmt-uuid-100';
  const mockReversalId = 'rev-uuid-100';
  const mockRefundId = 'ref-uuid-100';

  const defaultMockTx = (overrides: any = {}) => ({
    schoolNotificationSetting: {
      findUnique: jest.fn().mockResolvedValue({ receiptEmailEnabled: true, paymentReversalEmailEnabled: true, refundSuccessEmailEnabled: true, refundFailureEmailEnabled: true }),
      ...overrides.schoolNotificationSetting,
    },
    school: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Delhi Public School', currency: 'INR' }),
      ...overrides.school,
    },
    student: {
      findUnique: jest.fn().mockResolvedValue(null),
      ...overrides.student,
    },
    payment: {
      findUnique: jest.fn().mockResolvedValue(null),
      ...overrides.payment,
    },
    notificationOutbox: {
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(null),
      ...overrides.notificationOutbox,
    },
    $queryRaw: jest.fn().mockImplementation(async (strings: any, ...values: any[]) => {
      if (overrides.$queryRaw) {
        return await overrides.$queryRaw(strings, ...values);
      }
      return [
        {
          id: values[0] || 'outbox-raw-id',
          schoolId: values[1],
          channel: values[2],
          eventType: values[3],
          recipientEmail: values[4],
          recipientName: values[5],
          idempotencyKey: values[6],
          status: values[7],
          skipReason: values[8],
          skippedAt: values[9],
          templateKey: values[10],
          templateData: values[11] ? JSON.parse(values[11]) : {},
          attemptCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
    }),
  });

  describe('enqueueReceiptIssued — Recipient Authorization & Tenant Scoping', () => {
    it('enqueues PENDING with Priority 1: Registered Guardian Email', async () => {
      const mockTx = defaultMockTx();

      const result = await service.enqueueReceiptIssued(mockTx as any, {
        schoolId: mockSchoolId,
        receipt: {
          id: mockReceiptId,
          receiptNumber: 'RCP-2026-001',
          totalAmount: new Prisma.Decimal(5000),
        },
        payment: {
          id: mockPaymentId,
          paymentNumber: 'PMT-2026-001',
          paymentDate: new Date('2026-10-15'),
          paymentMethod: 'UPI',
          studentId: 'stud-1',
        },
        student: {
          id: 'stud-1',
          schoolId: mockSchoolId,
          firstName: 'Aarav',
          lastName: 'Sharma',
          admissionNumber: 'ADM-101',
          guardianEmail: 'guardian@example.com',
          guardianName: 'Rajesh Sharma',
        },
        school: { name: 'Delhi Public School', currency: 'INR' },
      });

      expect(result.status).toBe(NotificationStatus.PENDING);
      expect(result.recipientEmail).toBe('guardian@example.com');
      expect(result.recipientName).toBe('Rajesh Sharma');
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('falls back to Priority 2: Verified Parent in the SAME school when guardian email missing', async () => {
      const mockTx = defaultMockTx();

      const result = await service.enqueueReceiptIssued(mockTx as any, {
        schoolId: mockSchoolId,
        receipt: { id: mockReceiptId, receiptNumber: 'RCP-002', totalAmount: 2000 },
        payment: {
          id: mockPaymentId,
          paymentNumber: 'PMT-002',
          paymentDate: '2026-10-15',
          paymentMethod: 'CASH',
          studentId: 'stud-2',
        },
        student: {
          id: 'stud-2',
          schoolId: mockSchoolId,
          firstName: 'Rohan',
          lastName: 'Verma',
          admissionNumber: 'ADM-102',
          guardianEmail: null,
          parentRelations: [
            {
              schoolId: mockSchoolId,
              isVerified: true,
              parent: {
                id: 'parent-1',
                schoolId: mockSchoolId,
                email: 'verified.parent@example.com',
                name: 'Suresh Verma',
                role: UserRole.PARENT,
                status: UserStatus.ACTIVE,
              },
            },
          ],
        },
      });

      expect(result.status).toBe(NotificationStatus.PENDING);
      expect(result.recipientEmail).toBe('verified.parent@example.com');
      expect(result.recipientName).toBe('Suresh Verma');
    });

    it('falls back to Priority 3: Student User Account in the SAME school for receipts', async () => {
      const mockTx = defaultMockTx();

      const result = await service.enqueueReceiptIssued(mockTx as any, {
        schoolId: mockSchoolId,
        receipt: { id: mockReceiptId, receiptNumber: 'RCP-003', totalAmount: 1500 },
        payment: {
          id: mockPaymentId,
          paymentNumber: 'PMT-003',
          paymentDate: '2026-10-15',
          paymentMethod: 'ONLINE',
          studentId: 'stud-3',
        },
        student: {
          id: 'stud-3',
          schoolId: mockSchoolId,
          firstName: 'Ananya',
          lastName: 'Sen',
          admissionNumber: 'ADM-103',
          guardianEmail: null,
          parentRelations: [],
          userAccount: {
            id: 'user-stud-3',
            schoolId: mockSchoolId,
            email: 'student.self@example.com',
            name: 'Ananya Sen',
            role: UserRole.STUDENT,
            status: UserStatus.ACTIVE,
          },
        },
      });

      expect(result.status).toBe(NotificationStatus.PENDING);
      expect(result.recipientEmail).toBe('student.self@example.com');
      expect(result.recipientName).toBe('Ananya Sen');
    });

    it('rejects cross-tenant parent relations (parent from different school)', async () => {
      const mockTx = defaultMockTx();

      const result = await service.enqueueReceiptIssued(mockTx as any, {
        schoolId: mockSchoolId,
        receipt: { id: mockReceiptId, receiptNumber: 'RCP-004', totalAmount: 1000 },
        payment: {
          id: mockPaymentId,
          paymentNumber: 'PMT-004',
          paymentDate: '2026-10-15',
          paymentMethod: 'CASH',
          studentId: 'stud-4',
        },
        student: {
          id: 'stud-4',
          schoolId: mockSchoolId,
          firstName: 'Sneha',
          lastName: 'Roy',
          admissionNumber: 'ADM-104',
          guardianEmail: null,
          parentRelations: [
            {
              schoolId: otherSchoolId, // Cross-tenant!
              isVerified: true,
              parent: {
                id: 'parent-other',
                schoolId: otherSchoolId,
                email: 'hacker.parent@example.com',
                role: UserRole.PARENT,
                status: UserStatus.ACTIVE,
              },
            },
          ],
        },
      });

      expect(result.status).toBe(NotificationStatus.SKIPPED);
      expect(result.recipientEmail).toBeNull();
      expect(result.skipReason).toBe('NO_VALID_RECIPIENT_EMAIL');
    });

    it('rejects unverified parent relations (isVerified === false)', async () => {
      const mockTx = defaultMockTx();

      const result = await service.enqueueReceiptIssued(mockTx as any, {
        schoolId: mockSchoolId,
        receipt: { id: mockReceiptId, receiptNumber: 'RCP-005', totalAmount: 1000 },
        payment: {
          id: mockPaymentId,
          paymentNumber: 'PMT-005',
          paymentDate: '2026-10-15',
          paymentMethod: 'CASH',
          studentId: 'stud-5',
        },
        student: {
          id: 'stud-5',
          schoolId: mockSchoolId,
          firstName: 'Karan',
          lastName: 'Mehta',
          admissionNumber: 'ADM-105',
          guardianEmail: null,
          parentRelations: [
            {
              schoolId: mockSchoolId,
              isVerified: false, // Unverified!
              parent: {
                id: 'parent-unverified',
                schoolId: mockSchoolId,
                email: 'unverified@example.com',
                role: UserRole.PARENT,
                status: UserStatus.ACTIVE,
              },
            },
          ],
        },
      });

      expect(result.status).toBe(NotificationStatus.SKIPPED);
      expect(result.recipientEmail).toBeNull();
      expect(result.skipReason).toBe('NO_VALID_RECIPIENT_EMAIL');
    });

    it('rejects cross-tenant student user account', async () => {
      const mockTx = defaultMockTx();

      const result = await service.enqueueReceiptIssued(mockTx as any, {
        schoolId: mockSchoolId,
        receipt: { id: mockReceiptId, receiptNumber: 'RCP-006', totalAmount: 1000 },
        payment: {
          id: mockPaymentId,
          paymentNumber: 'PMT-006',
          paymentDate: '2026-10-15',
          paymentMethod: 'CASH',
          studentId: 'stud-6',
        },
        student: {
          id: 'stud-6',
          schoolId: mockSchoolId,
          firstName: 'Vikram',
          lastName: 'Singh',
          admissionNumber: 'ADM-106',
          guardianEmail: null,
          userAccount: {
            id: 'user-cross',
            schoolId: otherSchoolId, // Cross-tenant!
            email: 'cross.student@example.com',
            role: UserRole.STUDENT,
            status: UserStatus.ACTIVE,
          },
        },
      });

      expect(result.status).toBe(NotificationStatus.SKIPPED);
      expect(result.recipientEmail).toBeNull();
      expect(result.skipReason).toBe('NO_VALID_RECIPIENT_EMAIL');
    });

    it('persists SKIPPED with EVENT_DISABLED_BY_SCHOOL_SETTING when school disabled receipts', async () => {
      const mockTx = defaultMockTx({
        schoolNotificationSetting: {
          findUnique: jest.fn().mockResolvedValue({ receiptEmailEnabled: false }),
        },
      });

      const result = await service.enqueueReceiptIssued(mockTx as any, {
        schoolId: mockSchoolId,
        receipt: { id: mockReceiptId, receiptNumber: 'RCP-007', totalAmount: 3000 },
        payment: {
          id: mockPaymentId,
          paymentNumber: 'PMT-007',
          paymentDate: '2026-10-15',
          paymentMethod: 'UPI',
          studentId: 'stud-7',
        },
        student: {
          id: 'stud-7',
          schoolId: mockSchoolId,
          firstName: 'Pooja',
          lastName: 'Patel',
          admissionNumber: 'ADM-107',
          guardianEmail: 'pooja.parent@example.com',
        },
      });

      expect(result.status).toBe(NotificationStatus.SKIPPED);
      expect(result.recipientEmail).toBe('pooja.parent@example.com');
      expect(result.skipReason).toBe('EVENT_DISABLED_BY_SCHOOL_SETTING:receiptEmailEnabled');
    });
  });

  describe('enqueuePaymentReversed — Recipient Authorization', () => {
    it('enqueues PENDING for authorized guardian', async () => {
      const mockTx = defaultMockTx();

      const result = await service.enqueuePaymentReversed(mockTx as any, {
        schoolId: mockSchoolId,
        paymentReversal: {
          id: mockReversalId,
          reversalNumber: 'REV-2026-001',
          reversalType: 'BOUNCE',
          totalAmount: 5000,
          reason: 'Cheque dishonored',
          createdAt: new Date('2026-10-16'),
        },
        payment: {
          id: mockPaymentId,
          paymentNumber: 'PMT-2026-001',
          studentId: 'stud-1',
          receipt: { receiptNumber: 'RCP-2026-001' },
        },
        student: {
          id: 'stud-1',
          schoolId: mockSchoolId,
          firstName: 'Aarav',
          lastName: 'Sharma',
          admissionNumber: 'ADM-101',
          guardianEmail: 'parent@example.com',
        },
        school: { name: 'Delhi Public School', currency: 'INR' },
      });

      expect(result.status).toBe(NotificationStatus.PENDING);
      expect(result.eventType).toBe(NotificationEventType.PAYMENT_REVERSED);
      expect(result.recipientEmail).toBe('parent@example.com');
    });

    it('skips reversal notification when only student account exists (student account unauthorized for reversals)', async () => {
      const mockTx = defaultMockTx();

      const result = await service.enqueuePaymentReversed(mockTx as any, {
        schoolId: mockSchoolId,
        paymentReversal: {
          id: mockReversalId,
          reversalNumber: 'REV-2026-002',
          reversalType: 'VOID',
          totalAmount: 1000,
          reason: 'Entry error',
          createdAt: new Date('2026-10-16'),
        },
        payment: {
          id: mockPaymentId,
          paymentNumber: 'PMT-2026-002',
          studentId: 'stud-student-only',
        },
        student: {
          id: 'stud-student-only',
          schoolId: mockSchoolId,
          firstName: 'Minor',
          lastName: 'Student',
          admissionNumber: 'ADM-999',
          guardianEmail: null,
          parentRelations: [],
          userAccount: {
            schoolId: mockSchoolId,
            email: 'minor.student@example.com',
            role: UserRole.STUDENT,
            status: UserStatus.ACTIVE,
          },
        },
      });

      expect(result.status).toBe(NotificationStatus.SKIPPED);
      expect(result.recipientEmail).toBeNull();
      expect(result.skipReason).toBe('NO_AUTHORIZED_PARENT_OR_GUARDIAN_RECIPIENT');
    });
  });

  describe('enqueueRefundSucceeded and enqueueRefundFailed — Recipient Authorization', () => {
    it('enqueues REFUND_SUCCEEDED for authorized guardian', async () => {
      const mockTx = defaultMockTx({
        payment: {
          findUnique: jest.fn().mockResolvedValue({
            paymentNumber: 'PMT-2026-001',
            student: {
              schoolId: mockSchoolId,
              firstName: 'Priya',
              lastName: 'Nair',
              admissionNumber: 'ADM-201',
              guardianEmail: 'priya.parent@example.com',
            },
            school: { name: 'Greenwood High', currency: 'INR' },
          }),
        },
      });

      const result = await service.enqueueRefundSucceeded(mockTx as any, {
        schoolId: mockSchoolId,
        refund: {
          id: mockRefundId,
          refundAmount: 1500,
          mode: 'ORIGINAL_PAYMENT_METHOD',
          referenceNumber: 'REF-TXN-999',
          reason: 'Overpayment refund',
          createdAt: new Date('2026-10-16'),
        },
        paymentId: mockPaymentId,
      });

      expect(result.status).toBe(NotificationStatus.PENDING);
      expect(result.eventType).toBe(NotificationEventType.REFUND_SUCCEEDED);
      expect(result.recipientEmail).toBe('priya.parent@example.com');
    });

    it('skips REFUND_FAILED if only student account exists without authorized parent/guardian', async () => {
      const mockTx = defaultMockTx({
        payment: {
          findUnique: jest.fn().mockResolvedValue({
            paymentNumber: 'PMT-2026-001',
            student: {
              schoolId: mockSchoolId,
              firstName: 'Priya',
              lastName: 'Nair',
              admissionNumber: 'ADM-201',
              guardianEmail: null,
              parentRelations: [],
              userAccount: {
                schoolId: mockSchoolId,
                email: 'priya.student@example.com',
                role: UserRole.STUDENT,
                status: UserStatus.ACTIVE,
              },
            },
            school: { name: 'Greenwood High', currency: 'INR' },
          }),
        },
      });

      const result = await service.enqueueRefundFailed(mockTx as any, {
        schoolId: mockSchoolId,
        refund: {
          id: mockRefundId,
          refundAmount: 1500,
          failureReason: 'Account closed',
          createdAt: new Date('2026-10-16'),
        },
        paymentId: mockPaymentId,
      });

      expect(result.status).toBe(NotificationStatus.SKIPPED);
      expect(result.recipientEmail).toBeNull();
      expect(result.skipReason).toBe('NO_AUTHORIZED_PARENT_OR_GUARDIAN_RECIPIENT');
    });
  });

  describe('Transactional Idempotency & Safe Upsert Strategy', () => {
    it('returns existing record on replay when findUnique finds it, without calling upsert', async () => {
      const existing = {
        id: 'outbox-existing-1',
        schoolId: mockSchoolId,
        idempotencyKey: `RECEIPT:${mockReceiptId}:parent@example.com`,
        status: NotificationStatus.PENDING,
      };

      const mockTx = defaultMockTx({
        notificationOutbox: {
          findUnique: jest.fn().mockResolvedValue(existing),
          upsert: jest.fn(),
        },
      });

      const result = await service.enqueueReceiptIssued(mockTx as any, {
        schoolId: mockSchoolId,
        receipt: { id: mockReceiptId, receiptNumber: 'RCP-001', totalAmount: 5000 },
        payment: {
          id: mockPaymentId,
          paymentNumber: 'PMT-001',
          paymentDate: new Date(),
          paymentMethod: 'UPI',
          studentId: 'stud-1',
        },
        student: {
          id: 'stud-1',
          schoolId: mockSchoolId,
          firstName: 'Aarav',
          lastName: 'Sharma',
          admissionNumber: 'ADM-101',
          guardianEmail: 'parent@example.com',
        },
      });

      expect(result).toBe(existing);
      expect(mockTx.notificationOutbox.findUnique).toHaveBeenCalledTimes(1);
      expect(mockTx.$queryRaw).not.toHaveBeenCalled();
    });

    it('executes parameterized INSERT ... ON CONFLICT DO NOTHING and returns newly inserted row', async () => {
      let rawSqlStrings: any = null;
      let rawSqlValues: any[] = [];
      const mockTx = defaultMockTx({
        $queryRaw: jest.fn().mockImplementation(async (strings: any, ...values: any[]) => {
          rawSqlStrings = strings;
          rawSqlValues = values;
          return [
            {
              id: values[0] || 'outbox-inserted-id',
              schoolId: values[1],
              channel: values[2],
              eventType: values[3],
              recipientEmail: values[4],
              recipientName: values[5],
              idempotencyKey: values[6],
              status: values[7],
              templateKey: values[10],
              templateData: values[11] ? JSON.parse(values[11]) : {},
            },
          ];
        }),
      });

      const result = await service.enqueueReceiptIssued(mockTx as any, {
        schoolId: mockSchoolId,
        receipt: { id: mockReceiptId, receiptNumber: 'RCP-001', totalAmount: 5000 },
        payment: {
          id: mockPaymentId,
          paymentNumber: 'PMT-001',
          paymentDate: new Date(),
          paymentMethod: 'UPI',
          studentId: 'stud-1',
        },
        student: {
          id: 'stud-1',
          schoolId: mockSchoolId,
          firstName: 'Aarav',
          lastName: 'Sharma',
          admissionNumber: 'ADM-101',
          guardianEmail: 'parent@example.com',
        },
      });

      expect(result.id).toBeDefined();
      expect(result.recipientEmail).toBe('parent@example.com');
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);

      // Verify the query includes ON CONFLICT DO NOTHING RETURNING *
      const fullSql = rawSqlStrings.join('?');
      expect(fullSql).toContain('INSERT INTO "notification_outbox"');
      expect(fullSql).toContain('ON CONFLICT ("schoolId", "idempotencyKey") DO NOTHING');
      expect(fullSql).toContain('RETURNING *');
    });

    it('handles concurrent race: when ON CONFLICT DO NOTHING returns [], falls back safely to reading existing record', async () => {
      const winningRecord = {
        id: 'outbox-winning-record',
        schoolId: mockSchoolId,
        idempotencyKey: `RECEIPT:${mockReceiptId}:parent@example.com`,
        status: NotificationStatus.PENDING,
        recipientEmail: 'parent@example.com',
        templateData: { originalSnapshot: true },
      };

      const mockTx = defaultMockTx({
        notificationOutbox: {
          findUnique: jest.fn().mockResolvedValue(null), // step 1: not found initially
          findUniqueOrThrow: jest.fn().mockResolvedValue(winningRecord), // step 3: read winning record
        },
        $queryRaw: jest.fn().mockResolvedValue([]), // step 2: conflict occurred, DO NOTHING returns 0 rows
      });

      const result = await service.enqueueReceiptIssued(mockTx as any, {
        schoolId: mockSchoolId,
        receipt: { id: mockReceiptId, receiptNumber: 'RCP-001', totalAmount: 5000 },
        payment: {
          id: mockPaymentId,
          paymentNumber: 'PMT-001',
          paymentDate: new Date(),
          paymentMethod: 'UPI',
          studentId: 'stud-1',
        },
        student: {
          id: 'stud-1',
          schoolId: mockSchoolId,
          firstName: 'Aarav',
          lastName: 'Sharma',
          admissionNumber: 'ADM-101',
          guardianEmail: 'parent@example.com',
        },
      });

      // Verifies the winning record is returned intact without error
      expect(result).toBe(winningRecord);
      expect(result.templateData).toEqual({ originalSnapshot: true });
      expect(mockTx.notificationOutbox.findUniqueOrThrow).toHaveBeenCalledWith({
        where: {
          schoolId_idempotencyKey: {
            schoolId: mockSchoolId,
            idempotencyKey: `RECEIPT:${mockReceiptId}:parent@example.com`,
          },
        },
      });
    });

    it('does NOT swallow unexpected database errors (connection timeout, lock timeout)', async () => {
      const dbError = new Error('Connection terminated unexpectedly');
      const mockTx = defaultMockTx({
        $queryRaw: jest.fn().mockRejectedValue(dbError),
      });

      await expect(
        service.enqueueReceiptIssued(mockTx as any, {
          schoolId: mockSchoolId,
          receipt: { id: mockReceiptId, receiptNumber: 'RCP-001', totalAmount: 5000 },
          payment: {
            id: mockPaymentId,
            paymentNumber: 'PMT-001',
            paymentDate: new Date(),
            paymentMethod: 'UPI',
            studentId: 'stud-1',
          },
          student: {
            id: 'stud-1',
            schoolId: mockSchoolId,
            firstName: 'Aarav',
            lastName: 'Sharma',
            admissionNumber: 'ADM-101',
            guardianEmail: 'parent@example.com',
          },
        }),
      ).rejects.toThrow('Connection terminated unexpectedly');
    });
  });
});
