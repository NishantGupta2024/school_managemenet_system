import { Test, TestingModule } from '@nestjs/testing';
import { FeeReminderScheduler } from './fee-reminder.scheduler';
import { FeeReminderService } from './fee-reminder.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('FeeReminderScheduler', () => {
  let scheduler: FeeReminderScheduler;
  let mockPrisma: any;
  let mockFeeReminderService: any;

  beforeEach(async () => {
    mockPrisma = {
      school: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'sch-1', name: 'Springfield Academy', timezone: 'Asia/Kolkata', status: 'ACTIVE' },
          { id: 'sch-2', name: 'Shelbyville High', timezone: 'Asia/Kolkata', status: 'ACTIVE' },
        ]),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback({});
      }),
    };

    mockFeeReminderService = {
      produceReminders: jest.fn().mockResolvedValue({
        schoolId: 'sch-1',
        asOfDate: '2026-11-01',
        scannedInvoicesCount: 10,
        eligibleRemindersCount: 3,
        enqueuedCount: 2,
        skippedCount: 1,
        records: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeReminderScheduler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FeeReminderService, useValue: mockFeeReminderService },
      ],
    }).compile();

    scheduler = module.get<FeeReminderScheduler>(FeeReminderScheduler);
  });

  afterEach(() => {
    scheduler.onApplicationShutdown();
  });

  it('1. initializes as disabled by default for safe deployment', () => {
    expect(scheduler.isEnabled).toBe(false);
  });

  it('2. executes scheduled scan across active schools and delegates to produceReminders', async () => {
    const summary = await scheduler.runScheduledScan();

    expect(mockPrisma.school.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, timezone: true },
    });

    expect(mockFeeReminderService.produceReminders).toHaveBeenCalledTimes(2);
    expect(mockFeeReminderService.produceReminders).toHaveBeenCalledWith(
      expect.anything(),
      'sch-1',
      expect.any(Date),
      { dryRun: false, persistOutbox: true },
    );
    expect(mockFeeReminderService.produceReminders).toHaveBeenCalledWith(
      expect.anything(),
      'sch-2',
      expect.any(Date),
      { dryRun: false, persistOutbox: true },
    );

    expect(summary.schoolsScanned).toBe(2);
    expect(summary.totalEnqueuedOutbox).toBe(4);
    expect(summary.totalEligibleInvoices).toBe(6);
    expect(summary.totalSkipped).toBe(2);
  });

  it('3. prevents overlapping executions when a scan is already in progress', async () => {
    // Delay first execution
    mockFeeReminderService.produceReminders.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                schoolId: 'sch-1',
                asOfDate: '2026-11-01',
                scannedInvoicesCount: 2,
                eligibleRemindersCount: 1,
                enqueuedCount: 1,
                skippedCount: 0,
                records: [],
              }),
            50,
          ),
        ),
    );

    const promise1 = scheduler.runScheduledScan();
    const promise2 = scheduler.runScheduledScan();

    const [res1, res2] = await Promise.all([promise1, promise2]);

    expect(res1.schoolsScanned).toBe(2);
    // Second execution was guarded and skipped immediately
    expect(res2.schoolsScanned).toBe(0);
  });

  it('4. isolates single school failure without crashing overall scan', async () => {
    mockFeeReminderService.produceReminders
      .mockRejectedValueOnce(new Error('School 1 database connection timeout'))
      .mockResolvedValueOnce({
        schoolId: 'sch-2',
        asOfDate: '2026-11-01',
        scannedInvoicesCount: 5,
        eligibleRemindersCount: 1,
        enqueuedCount: 1,
        skippedCount: 0,
        records: [],
      });

    const summary = await scheduler.runScheduledScan();

    expect(summary.schoolsScanned).toBe(2);
    expect(summary.totalEnqueuedOutbox).toBe(1);
  });

  describe('targetHourUtc Configuration & Scheduled Execution Enforcement', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('5. Scheduler respects configured targetHourUtc when enforceTargetHour is true', async () => {
      process.env.FEE_REMINDER_SCHEDULE_HOUR_UTC = '6';
      const customScheduler = new FeeReminderScheduler(mockPrisma, mockFeeReminderService);

      expect(customScheduler.targetHourUtc).toBe(6);

      // Run at 06:15 UTC -> should execute
      const matchingTime = new Date('2026-11-01T06:15:00Z');
      const resExecuted = await customScheduler.runScheduledScan({
        enforceTargetHour: true,
        now: matchingTime,
      });

      expect(resExecuted.schoolsScanned).toBe(2);
      expect(resExecuted.totalEnqueuedOutbox).toBe(4);
      expect(mockFeeReminderService.produceReminders).toHaveBeenCalledTimes(2);

      // Second tick in the same UTC hour on the same day -> skipped (already executed for UTC date)
      const sameHourLater = new Date('2026-11-01T06:45:00Z');
      const resDuplicateDay = await customScheduler.runScheduledScan({
        enforceTargetHour: true,
        now: sameHourLater,
      });
      expect(resDuplicateDay.schoolsScanned).toBe(0);
      expect(resDuplicateDay.skippedReason).toBe('ALREADY_EXECUTED_FOR_UTC_DATE');
      expect(mockFeeReminderService.produceReminders).toHaveBeenCalledTimes(2);
    });

    it('6. Scheduler does not fire outside targetHourUtc when enforceTargetHour is true', async () => {
      process.env.FEE_REMINDER_SCHEDULE_HOUR_UTC = '2';
      const customScheduler = new FeeReminderScheduler(mockPrisma, mockFeeReminderService);

      const nonMatchingTime = new Date('2026-11-01T14:30:00Z'); // 14 UTC != 2 UTC
      const resSkipped = await customScheduler.runScheduledScan({
        enforceTargetHour: true,
        now: nonMatchingTime,
      });

      expect(resSkipped.schoolsScanned).toBe(0);
      expect(resSkipped.totalEnqueuedOutbox).toBe(0);
      expect(resSkipped.skippedReason).toBe('OUTSIDE_TARGET_HOUR_UTC');
      expect(mockPrisma.school.findMany).not.toHaveBeenCalled();
      expect(mockFeeReminderService.produceReminders).not.toHaveBeenCalled();
    });

    it('7. Validates invalid or out-of-range FEE_REMINDER_SCHEDULE_HOUR_UTC and falls back safely to 2 UTC', () => {
      process.env.FEE_REMINDER_SCHEDULE_HOUR_UTC = '99';
      const outOfRangeScheduler = new FeeReminderScheduler(mockPrisma, mockFeeReminderService);
      expect(outOfRangeScheduler.targetHourUtc).toBe(2);

      process.env.FEE_REMINDER_SCHEDULE_HOUR_UTC = '-5';
      const negativeScheduler = new FeeReminderScheduler(mockPrisma, mockFeeReminderService);
      expect(negativeScheduler.targetHourUtc).toBe(2);

      process.env.FEE_REMINDER_SCHEDULE_HOUR_UTC = 'invalid-hour';
      const nanScheduler = new FeeReminderScheduler(mockPrisma, mockFeeReminderService);
      expect(nanScheduler.targetHourUtc).toBe(2);
    });
  });
});
