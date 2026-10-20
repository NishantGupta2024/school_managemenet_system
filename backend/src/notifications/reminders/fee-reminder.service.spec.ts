import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FeeReminderService,
  formatDateInTimezone,
  getCalendarDayDiff,
} from './fee-reminder.service';

describe('FeeReminderService', () => {
  let service: FeeReminderService;
  let mockPrisma: any;

  const mockSchoolId = 'school-uuid-001';
  const otherSchoolId = 'school-uuid-002';

  beforeEach(async () => {
    mockPrisma = {
      school: {
        findUnique: jest.fn().mockResolvedValue({
          id: mockSchoolId,
          name: 'Greenwood International School',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
        }),
      },
      feeInvoice: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeReminderService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FeeReminderService>(FeeReminderService);
  });

  describe('Timezone & Calendar Calculation Helpers', () => {
    it('formats dates consistently in school timezone', () => {
      // 2026-10-20 20:00:00 UTC is 2026-10-21 01:30:00 in Asia/Kolkata (+5:30)
      const lateUtcDate = new Date('2026-10-20T20:00:00Z');
      expect(formatDateInTimezone(lateUtcDate, 'Asia/Kolkata')).toBe('2026-10-21');
      expect(formatDateInTimezone(lateUtcDate, 'America/New_York')).toBe('2026-10-20');
    });

    it('calculates calendar day differences accurately across midnight boundaries', () => {
      const baseDate = new Date('2026-10-20T10:00:00Z');
      const dueIn7Days = new Date('2026-10-27T10:00:00Z');
      const dueTomorrow = new Date('2026-10-21T10:00:00Z');
      const dueToday = new Date('2026-10-20T14:00:00Z');
      const overdue3Days = new Date('2026-10-17T10:00:00Z');

      expect(getCalendarDayDiff(dueIn7Days, baseDate, 'Asia/Kolkata')).toBe(7);
      expect(getCalendarDayDiff(dueTomorrow, baseDate, 'Asia/Kolkata')).toBe(1);
      expect(getCalendarDayDiff(dueToday, baseDate, 'Asia/Kolkata')).toBe(0);
      expect(getCalendarDayDiff(overdue3Days, baseDate, 'Asia/Kolkata')).toBe(-3);
    });
  });

  describe('scanReminders — Milestone Evaluation & Eligibility', () => {
    const referenceDate = new Date('2026-10-20T10:00:00Z'); // 2026-10-20 in Asia/Kolkata

    const createMockInvoice = (overrides: any = {}) => ({
      id: 'inv-1',
      schoolId: mockSchoolId,
      studentId: 'student-1',
      academicYearId: 'ay-1',
      billingMonth: 7,
      dueDate: new Date('2026-10-27T18:29:59Z'), // 7 days ahead
      grossAmount: new Prisma.Decimal(10000),
      discountAmount: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(10000),
      status: InvoiceStatus.DUE,
      academicYear: { name: '2026-2027' },
      items: [
        { netAmount: new Prisma.Decimal(8000), feeHeadNameSnapshot: 'Tuition Fee', feeHead: { name: 'Tuition Fee' } },
        { netAmount: new Prisma.Decimal(2000), feeHeadNameSnapshot: 'Transport Fee', feeHead: { name: 'Transport Fee' } },
      ],
      paymentAllocations: [],
      student: {
        id: 'student-1',
        schoolId: mockSchoolId,
        firstName: 'Aarav',
        lastName: 'Sharma',
        admissionNumber: 'ADM-001',
        guardianEmail: 'guardian@example.com',
        guardianPhone: '+919876543210',
        guardianName: 'Vikram Sharma',
        grade: { name: 'Grade 10' },
        section: { name: 'A' },
        userAccount: null,
        parentRelations: [],
      },
      ...overrides,
    });

    it('identifies DUE_IN_7_DAYS reminder candidates correctly', async () => {
      const inv7Days = createMockInvoice({
        id: 'inv-7d',
        dueDate: new Date('2026-10-27T00:00:00+05:30'),
      });
      mockPrisma.feeInvoice.findMany.mockResolvedValue([inv7Days]);

      const result = await service.scanReminders(mockSchoolId, referenceDate);

      expect(result.scannedInvoicesCount).toBe(1);
      expect(result.eligibleRemindersCount).toBe(1);
      const cand = result.candidates[0];
      expect(cand.milestone).toBe('DUE_IN_7_DAYS');
      expect(cand.balanceDue).toBe(10000);
      expect(cand.recipientEmail).toBe('guardian@example.com');
      expect(cand.recipientPhone).toBe('+919876543210');
      expect(cand.idempotencyKey).toBe('REMINDER:school-uuid-001:inv-7d:DUE_IN_7_DAYS:2026-10-27:guardian@example.com');
    });

    it('identifies DUE_IN_1_DAY reminder candidates correctly', async () => {
      const inv1Day = createMockInvoice({
        id: 'inv-1d',
        dueDate: new Date('2026-10-21T00:00:00+05:30'),
      });
      mockPrisma.feeInvoice.findMany.mockResolvedValue([inv1Day]);

      const result = await service.scanReminders(mockSchoolId, referenceDate);

      expect(result.eligibleRemindersCount).toBe(1);
      expect(result.candidates[0].milestone).toBe('DUE_IN_1_DAY');
    });

    it('identifies DUE_TODAY reminder candidates correctly', async () => {
      const invToday = createMockInvoice({
        id: 'inv-today',
        dueDate: new Date('2026-10-20T00:00:00+05:30'),
      });
      mockPrisma.feeInvoice.findMany.mockResolvedValue([invToday]);

      const result = await service.scanReminders(mockSchoolId, referenceDate);

      expect(result.eligibleRemindersCount).toBe(1);
      expect(result.candidates[0].milestone).toBe('DUE_TODAY');
    });

    it('identifies OVERDUE reminder candidates with daysOverdue calculation', async () => {
      const invOverdue = createMockInvoice({
        id: 'inv-od',
        dueDate: new Date('2026-10-15T00:00:00+05:30'), // 5 days overdue
      });
      mockPrisma.feeInvoice.findMany.mockResolvedValue([invOverdue]);

      const result = await service.scanReminders(mockSchoolId, referenceDate);

      expect(result.eligibleRemindersCount).toBe(1);
      expect(result.candidates[0].milestone).toBe('OVERDUE');
      expect(result.candidates[0].daysOverdue).toBe(5);
    });

    it('excludes invoices that are not at any of the 4 milestone dates', async () => {
      const inv15Days = createMockInvoice({
        id: 'inv-15d',
        dueDate: new Date('2026-11-04T00:00:00+05:30'), // 15 days ahead
      });
      mockPrisma.feeInvoice.findMany.mockResolvedValue([inv15Days]);

      const result = await service.scanReminders(mockSchoolId, referenceDate);

      expect(result.scannedInvoicesCount).toBe(1);
      expect(result.eligibleRemindersCount).toBe(0);
      expect(result.candidates.length).toBe(0);
    });

    it('excludes fully settled invoices even if status has not transitioned', async () => {
      const invSettled = createMockInvoice({
        id: 'inv-settled',
        dueDate: new Date('2026-10-27T00:00:00+05:30'),
        netAmount: new Prisma.Decimal(10000),
        paymentAllocations: [
          { allocatedAmount: new Prisma.Decimal(6000) },
          { allocatedAmount: new Prisma.Decimal(4000) },
        ],
      });
      mockPrisma.feeInvoice.findMany.mockResolvedValue([invSettled]);

      const result = await service.scanReminders(mockSchoolId, referenceDate);

      expect(result.eligibleRemindersCount).toBe(0);
    });

    it('correctly calculates partial balance due and includes partially paid invoices', async () => {
      const invPartial = createMockInvoice({
        id: 'inv-partial',
        dueDate: new Date('2026-10-27T00:00:00+05:30'),
        netAmount: new Prisma.Decimal(10000),
        paymentAllocations: [
          { allocatedAmount: new Prisma.Decimal(4000) },
        ],
      });
      mockPrisma.feeInvoice.findMany.mockResolvedValue([invPartial]);

      const result = await service.scanReminders(mockSchoolId, referenceDate);

      expect(result.eligibleRemindersCount).toBe(1);
      expect(result.candidates[0].totalFeeAmount).toBe(10000);
      expect(result.candidates[0].paidAmount).toBe(4000);
      expect(result.candidates[0].balanceDue).toBe(6000);
    });

    it('preserves recipient resolution priority and rejects cross-tenant relations', async () => {
      const invCrossTenant = createMockInvoice({
        id: 'inv-cross',
        dueDate: new Date('2026-10-27T00:00:00+05:30'),
        student: {
          id: 'student-2',
          schoolId: otherSchoolId, // Cross-tenant student
          firstName: 'Evil',
          lastName: 'Intruder',
          admissionNumber: 'HACK-01',
          guardianEmail: 'intruder@other.com',
          parentRelations: [],
        },
      });
      mockPrisma.feeInvoice.findMany.mockResolvedValue([invCrossTenant]);

      const result = await service.scanReminders(mockSchoolId, referenceDate);

      expect(result.candidates[0].recipientEmail).toBeNull();
      expect(result.candidates[0].idempotencyKey).toContain(':NO_CONTACT');
    });

    it('produces identical deterministic idempotency keys across repeated scans', async () => {
      const inv = createMockInvoice({
        id: 'inv-idemp-test',
        dueDate: new Date('2026-10-27T00:00:00+05:30'),
      });
      mockPrisma.feeInvoice.findMany.mockResolvedValue([inv]);

      const run1 = await service.scanReminders(mockSchoolId, referenceDate);
      const run2 = await service.scanReminders(mockSchoolId, referenceDate);

      expect(run1.candidates[0].idempotencyKey).toBe(run2.candidates[0].idempotencyKey);
    });

    it('falls back to recipient phone in idempotency key when email is absent', async () => {
      const invPhoneOnly = createMockInvoice({
        id: 'inv-phone-only',
        dueDate: new Date('2026-10-27T00:00:00+05:30'),
        student: {
          id: 'student-phone',
          schoolId: mockSchoolId,
          firstName: 'Ankit',
          lastName: 'Sharma',
          admissionNumber: 'ADM-PH-001',
          guardianEmail: null,
          guardianPhone: '+919876543210',
          grade: { name: 'Grade 9' },
          section: { name: 'A' },
          userAccount: null,
          parentRelations: [],
        },
      });
      mockPrisma.feeInvoice.findMany.mockResolvedValue([invPhoneOnly]);

      const result = await service.scanReminders(mockSchoolId, referenceDate);

      expect(result.eligibleRemindersCount).toBe(1);
      const cand = result.candidates[0];
      expect(cand.recipientEmail).toBeNull();
      expect(cand.recipientPhone).toBe('+919876543210');
      expect(cand.idempotencyKey).toBe(
        'REMINDER:school-uuid-001:inv-phone-only:DUE_IN_7_DAYS:2026-10-27:+919876543210',
      );
    });

    it('prevents collision between different phone recipients without email', async () => {
      const invA = createMockInvoice({
        id: 'inv-phone-a',
        dueDate: new Date('2026-10-27T00:00:00+05:30'),
        student: {
          id: 'student-a',
          schoolId: mockSchoolId,
          firstName: 'Student',
          lastName: 'A',
          admissionNumber: 'ADM-A',
          guardianEmail: null,
          guardianPhone: '+919876543210',
          parentRelations: [],
        },
      });
      const invB = createMockInvoice({
        id: 'inv-phone-b',
        dueDate: new Date('2026-10-27T00:00:00+05:30'),
        student: {
          id: 'student-b',
          schoolId: mockSchoolId,
          firstName: 'Student',
          lastName: 'B',
          admissionNumber: 'ADM-B',
          guardianEmail: null,
          guardianPhone: '+919876543299',
          parentRelations: [],
        },
      });
      mockPrisma.feeInvoice.findMany.mockResolvedValue([invA, invB]);

      const result = await service.scanReminders(mockSchoolId, referenceDate);

      expect(result.eligibleRemindersCount).toBe(2);
      expect(result.candidates[0].idempotencyKey).not.toBe(result.candidates[1].idempotencyKey);
      expect(result.candidates[0].idempotencyKey).toContain('+919876543210');
      expect(result.candidates[1].idempotencyKey).toContain('+919876543299');
    });

    it('falls back to NO_CONTACT in idempotency key when both email and phone are absent', async () => {
      const invNoContact = createMockInvoice({
        id: 'inv-no-contact',
        dueDate: new Date('2026-10-27T00:00:00+05:30'),
        student: {
          id: 'student-none',
          schoolId: mockSchoolId,
          firstName: 'No',
          lastName: 'Contact',
          admissionNumber: 'ADM-NONE',
          guardianEmail: null,
          guardianPhone: null,
          userAccount: null,
          parentRelations: [],
        },
      });
      mockPrisma.feeInvoice.findMany.mockResolvedValue([invNoContact]);

      const result = await service.scanReminders(mockSchoolId, referenceDate);

      expect(result.eligibleRemindersCount).toBe(1);
      const cand = result.candidates[0];
      expect(cand.recipientEmail).toBeNull();
      expect(cand.recipientPhone).toBeNull();
      expect(cand.idempotencyKey).toBe(
        'REMINDER:school-uuid-001:inv-no-contact:DUE_IN_7_DAYS:2026-10-27:NO_CONTACT',
      );
    });
  });

  describe('produceReminders — Producer Outbox Integration', () => {
    const referenceDate = new Date('2026-10-20T10:00:00Z');

    it('stages reminder records in dryRun mode when schema migration is pending', async () => {
      const mockTx = {
        schoolNotificationSetting: { findUnique: jest.fn().mockResolvedValue(null) },
        notificationOutbox: { findUnique: jest.fn().mockResolvedValue(null) },
        $queryRaw: jest.fn(),
      };

      const inv = {
        id: 'inv-prod-1',
        schoolId: mockSchoolId,
        studentId: 'student-1',
        academicYearId: 'ay-1',
        billingMonth: 7,
        dueDate: new Date('2026-10-27T00:00:00+05:30'), // DUE_IN_7_DAYS
        grossAmount: new Prisma.Decimal(5000),
        discountAmount: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(5000),
        status: InvoiceStatus.DUE,
        academicYear: { name: '2026-2027' },
        items: [],
        paymentAllocations: [],
        student: {
          id: 'student-1',
          schoolId: mockSchoolId,
          firstName: 'Rohan',
          lastName: 'Verma',
          admissionNumber: 'ADM-050',
          guardianEmail: 'rohan.parent@example.com',
          guardianPhone: '+919876543210',
          grade: { name: 'Grade 8' },
          section: { name: 'B' },
          parentRelations: [],
        },
      };
      mockPrisma.feeInvoice.findMany.mockResolvedValue([inv]);

      const result = await service.produceReminders(mockTx as any, mockSchoolId, referenceDate, { dryRun: true });

      expect(result.eligibleRemindersCount).toBe(1);
      expect(result.enqueuedCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(result.records[0].status).toBe('SIMULATED_PENDING_SCHEMA_MIGRATION');
      expect(result.records[0].balanceDue).toBe(5000);
      expect(mockTx.$queryRaw).not.toHaveBeenCalled();
    });

    it('skips duplicate reminder production if idempotency key already exists', async () => {
      const mockTx = {
        schoolNotificationSetting: { findUnique: jest.fn().mockResolvedValue(null) },
        notificationOutbox: {
          findUnique: jest.fn().mockResolvedValue({ id: 'existing-outbox-row' }),
        },
        $queryRaw: jest.fn(),
      };

      const inv = {
        id: 'inv-prod-dup',
        schoolId: mockSchoolId,
        studentId: 'student-1',
        academicYearId: 'ay-1',
        billingMonth: 7,
        dueDate: new Date('2026-10-27T00:00:00+05:30'),
        grossAmount: new Prisma.Decimal(5000),
        discountAmount: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(5000),
        status: InvoiceStatus.DUE,
        academicYear: { name: '2026-2027' },
        items: [],
        paymentAllocations: [],
        student: {
          id: 'student-1',
          schoolId: mockSchoolId,
          firstName: 'Rohan',
          lastName: 'Verma',
          admissionNumber: 'ADM-050',
          guardianEmail: 'rohan.parent@example.com',
          parentRelations: [],
        },
      };
      mockPrisma.feeInvoice.findMany.mockResolvedValue([inv]);

      const result = await service.produceReminders(mockTx as any, mockSchoolId, referenceDate, { dryRun: false, persistOutbox: true });

      expect(result.eligibleRemindersCount).toBe(1);
      expect(result.enqueuedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(result.records[0].status).toBe('SKIPPED');
      expect(result.records[0].skipReason).toBe('DUPLICATE_IDEMPOTENCY_KEY_ALREADY_EXISTS');
      expect(mockTx.$queryRaw).not.toHaveBeenCalled();
    });

    it('skips reminder production when tenant feeReminderEmailEnabled preference is explicitly disabled', async () => {
      const mockTx = {
        schoolNotificationSetting: {
          findUnique: jest.fn().mockResolvedValue({
            feeReminderEmailEnabled: false,
          }),
        },
        notificationOutbox: { findUnique: jest.fn() },
        $queryRaw: jest.fn(),
      };

      const inv = {
        id: 'inv-disabled-pref',
        schoolId: mockSchoolId,
        studentId: 'student-1',
        academicYearId: 'ay-1',
        billingMonth: 7,
        dueDate: new Date('2026-10-27T00:00:00+05:30'),
        grossAmount: new Prisma.Decimal(5000),
        discountAmount: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(5000),
        status: InvoiceStatus.DUE,
        academicYear: { name: '2026-2027' },
        items: [],
        paymentAllocations: [],
        student: {
          id: 'student-1',
          schoolId: mockSchoolId,
          firstName: 'Rohan',
          lastName: 'Verma',
          admissionNumber: 'ADM-050',
          guardianEmail: 'rohan.parent@example.com',
          parentRelations: [],
        },
      };
      mockPrisma.feeInvoice.findMany.mockResolvedValue([inv]);

      const result = await service.produceReminders(mockTx as any, mockSchoolId, referenceDate, { dryRun: true });

      expect(result.eligibleRemindersCount).toBe(1);
      expect(result.enqueuedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(result.records[0].status).toBe('SKIPPED');
      expect(result.records[0].skipReason).toBe('EVENT_DISABLED_BY_SCHOOL_SETTING:feeReminderEmailEnabled');
      expect(mockTx.$queryRaw).not.toHaveBeenCalled();
    });

    it('persists outbox record with canonical FEE_DUE_REMINDER event type and template key', async () => {
      const mockTx = {
        schoolNotificationSetting: { findUnique: jest.fn().mockResolvedValue(null) },
        notificationOutbox: { findUnique: jest.fn().mockResolvedValue(null) },
        $queryRaw: jest.fn().mockResolvedValue(1),
      };

      const milestones: Array<{ daysDiff: number; expectedMilestone: string }> = [
        { daysDiff: 7, expectedMilestone: 'DUE_IN_7_DAYS' },
        { daysDiff: 1, expectedMilestone: 'DUE_IN_1_DAY' },
        { daysDiff: 0, expectedMilestone: 'DUE_TODAY' },
        { daysDiff: -5, expectedMilestone: 'OVERDUE' },
      ];

      for (const m of milestones) {
        jest.clearAllMocks();
        mockTx.schoolNotificationSetting.findUnique.mockResolvedValue(null);
        mockTx.notificationOutbox.findUnique.mockResolvedValue(null);

        const targetDueDate = new Date('2026-10-20T00:00:00+05:30');
        targetDueDate.setDate(targetDueDate.getDate() + m.daysDiff);

        const inv = {
          id: `inv-${m.expectedMilestone}`,
          schoolId: mockSchoolId,
          studentId: 'student-1',
          academicYearId: 'ay-1',
          billingMonth: 7,
          dueDate: targetDueDate,
          grossAmount: new Prisma.Decimal(5000),
          discountAmount: new Prisma.Decimal(0),
          netAmount: new Prisma.Decimal(5000),
          status: InvoiceStatus.DUE,
          academicYear: { name: '2026-2027' },
          items: [],
          paymentAllocations: [],
          student: {
            id: 'student-1',
            schoolId: mockSchoolId,
            firstName: 'Rohan',
            lastName: 'Verma',
            admissionNumber: 'ADM-050',
            guardianEmail: 'rohan.parent@example.com',
            guardianPhone: '+919876543210',
            parentRelations: [],
          },
        };
        mockPrisma.feeInvoice.findMany.mockResolvedValue([inv]);

        const result = await service.produceReminders(mockTx as any, mockSchoolId, new Date('2026-10-20T10:00:00+05:30'), {
          dryRun: false,
          persistOutbox: true,
        });

        expect(result.enqueuedCount).toBe(1);
        expect(result.records[0].status).toBe('ENQUEUED');
        expect(result.records[0].milestone).toBe(m.expectedMilestone);
        expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);

        // Verify that the query arguments include canonical event type and template key
        const rawCall = mockTx.$queryRaw.mock.calls[0];
        const rawQueryStrings = JSON.stringify(rawCall);
        expect(rawQueryStrings).toContain('FEE_DUE_REMINDER');
        // Ensure raw milestone is preserved inside templateData
        expect(rawQueryStrings).toContain(m.expectedMilestone);
      }
    });
  });
});
