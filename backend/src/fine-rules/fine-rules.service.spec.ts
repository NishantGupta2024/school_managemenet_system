import { BadRequestException } from '@nestjs/common';
import {
  FeeHeadCategory,
  FineDayCountPolicy,
  FineRuleStatus,
  FineType,
  InvoiceStatus,
} from '@prisma/client';
import {
  EvaluableFineRule,
  EvaluableInvoice,
  FineRulesService,
} from './fine-rules.service';

describe('FineRulesService — Centralized Late-Fine Calculation Engine', () => {
  let service: FineRulesService;

  // Due Date: April 10, 2026 at 23:59:59.999 IST (18:29:59.999 UTC)
  const dueDateApr10Ist = new Date('2026-04-10T18:29:59.999Z');

  const sampleInvoice: EvaluableInvoice = {
    id: '00000000-0000-4000-a000-000000000101',
    dueDate: dueDateApr10Ist,
    grossAmount: 10000,
    discountAmount: 1000,
    netAmount: 9000,
    status: InvoiceStatus.OVERDUE,
    items: [
      {
        feeHeadId: '00000000-0000-4000-a000-000000000201',
        feeHeadNameSnapshot: 'Tuition Fee',
        grossAmount: 7000,
        discountAmount: 700,
        netAmount: 6300,
        feeHead: { category: FeeHeadCategory.ACADEMIC },
      },
      {
        feeHeadId: '00000000-0000-4000-a000-000000000202',
        feeHeadNameSnapshot: 'Transport Fee',
        grossAmount: 3000,
        discountAmount: 300,
        netAmount: 2700,
        feeHead: { category: FeeHeadCategory.FACILITY },
      },
    ],
  };

  const baseRule: EvaluableFineRule = {
    id: '00000000-0000-4000-a000-000000000301',
    name: 'Standard Late Fine',
    fineType: FineType.FIXED,
    fineValue: 250,
    gracePeriodDays: 5,
    maxFineCap: null,
    dayCountPolicy: FineDayCountPolicy.CALENDAR_DAYS,
    applicableFeeHeadId: null,
    applicableCategory: null,
    effectiveStartDate: null,
    effectiveEndDate: null,
    status: FineRuleStatus.ACTIVE,
  };

  beforeEach(() => {
    service = new FineRulesService({} as any);
  });

  describe('1. Fixed Fine Before and After Grace Period', () => {
    it('calculates 0 fine before due date and throughout the 5-day grace period', () => {
      // On Due Date (Apr 10, 2026 IST)
      const onDueDay = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: baseRule,
        asOfDate: new Date('2026-04-10T10:00:00.000Z'),
        timeZone: 'Asia/Kolkata',
      });
      expect(onDueDay.isPastGracePeriod).toBe(false);
      expect(onDueDay.overdueDays).toBe(0);
      expect(onDueDay.calculatedFine).toBe(0);

      // Last day of 5-day grace period (Apr 15, 2026 23:59:59 IST = Apr 15 18:29:59 UTC)
      const onGraceEnd = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: baseRule,
        asOfDate: new Date('2026-04-15T18:29:59.000Z'),
        timeZone: 'Asia/Kolkata',
      });
      expect(onGraceEnd.isPastGracePeriod).toBe(false);
      expect(onGraceEnd.overdueDays).toBe(0);
      expect(onGraceEnd.calculatedFine).toBe(0);
    });

    it('applies fixed fine on the first day after grace period and keeps it constant across later days', () => {
      // Apr 16, 2026 IST (1 day after Apr 15 grace end)
      const day1Overdue = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: baseRule,
        asOfDate: new Date('2026-04-16T06:00:00.000Z'),
        timeZone: 'Asia/Kolkata',
      });
      expect(day1Overdue.isPastGracePeriod).toBe(true);
      expect(day1Overdue.overdueDays).toBe(1);
      expect(day1Overdue.calculatedFine).toBe(250);
      expect(day1Overdue.isPaymentOrCollected).toBe(false);

      // Apr 25, 2026 IST (10 days after Apr 15 grace end)
      const day10Overdue = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: baseRule,
        asOfDate: new Date('2026-04-25T06:00:00.000Z'),
        timeZone: 'Asia/Kolkata',
      });
      expect(day10Overdue.overdueDays).toBe(10);
      expect(day10Overdue.calculatedFine).toBe(250);
    });
  });

  describe('2. Per-Day Fine Across Multiple Overdue Days & Maximum Fine Cap', () => {
    it('multiplies per-day fine by overdue days and enforces maxFineCap when configured', () => {
      const perDayRule: EvaluableFineRule = {
        ...baseRule,
        fineType: FineType.PER_DAY,
        fineValue: 50,
        gracePeriodDays: 5,
        maxFineCap: 300,
      };

      // Apr 18, 2026 IST => 3 overdue days (Apr 16, 17, 18) => 3 * 50 = 150 (under 300 cap)
      const res3Days = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: perDayRule,
        asOfDate: new Date('2026-04-18T10:00:00.000Z'),
        timeZone: 'Asia/Kolkata',
      });
      expect(res3Days.overdueDays).toBe(3);
      expect(res3Days.uncappedFine).toBe(150);
      expect(res3Days.capApplied).toBe(false);
      expect(res3Days.calculatedFine).toBe(150);

      // Apr 25, 2026 IST => 10 overdue days => 10 * 50 = 500 => capped at 300
      const res10Days = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: perDayRule,
        asOfDate: new Date('2026-04-25T10:00:00.000Z'),
        timeZone: 'Asia/Kolkata',
      });
      expect(res10Days.overdueDays).toBe(10);
      expect(res10Days.uncappedFine).toBe(500);
      expect(res10Days.capApplied).toBe(true);
      expect(res10Days.calculatedFine).toBe(300);
    });
  });

  describe('3. Percentage Calculation & Scoped Fee Head / Category Basis', () => {
    it('calculates percentage fine against net invoice basis and never compounds on the fine itself', () => {
      const pctRule: EvaluableFineRule = {
        ...baseRule,
        fineType: FineType.PERCENTAGE,
        fineValue: 5, // 5% of 9000 = 450
      };

      const res1 = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: pctRule,
        asOfDate: new Date('2026-04-20T10:00:00.000Z'),
        timeZone: 'Asia/Kolkata',
      });
      expect(res1.eligibleOutstandingBasis).toBe(9000);
      expect(res1.calculatedFine).toBe(450);

      // Repeated evaluation on a later date produces identical percentage basis (never 9000 + 450)
      const res2 = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: pctRule,
        asOfDate: new Date('2026-04-28T10:00:00.000Z'),
        timeZone: 'Asia/Kolkata',
      });
      expect(res2.eligibleOutstandingBasis).toBe(9000);
      expect(res2.calculatedFine).toBe(450);
    });

    it('restricts percentage basis to matching applicableFeeHeadId or applicableCategory when scoped', () => {
      // Scoped to Transport Fee (FACILITY category, netAmount = 2700)
      const facilityPctRule: EvaluableFineRule = {
        ...baseRule,
        fineType: FineType.PERCENTAGE,
        fineValue: 10, // 10% of 2700 = 270
        applicableCategory: FeeHeadCategory.FACILITY,
      };

      const res = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: facilityPctRule,
        asOfDate: new Date('2026-04-20T10:00:00.000Z'),
        timeZone: 'Asia/Kolkata',
      });
      expect(res.scopedBaseAmount).toBe(2700);
      expect(res.eligibleOutstandingBasis).toBe(2700);
      expect(res.calculatedFine).toBe(270);
    });
  });

  describe('4. Calendar Days vs Working Days Policy & Timezone Boundaries', () => {
    it('excludes Saturdays and Sundays when dayCountPolicy is WORKING_DAYS', () => {
      // Grace period ends Apr 15, 2026 (Wednesday).
      // Overdue window Apr 16 (Thu) through Apr 20 (Mon) = 5 calendar days:
      // Apr 16 (Thu - working), Apr 17 (Fri - working), Apr 18 (Sat - weekend), Apr 19 (Sun - weekend), Apr 20 (Mon - working) => 3 working days!
      const workingDayRule: EvaluableFineRule = {
        ...baseRule,
        fineType: FineType.PER_DAY,
        fineValue: 100,
        gracePeriodDays: 5,
        dayCountPolicy: FineDayCountPolicy.WORKING_DAYS,
      };

      const res = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: workingDayRule,
        asOfDate: new Date('2026-04-20T10:00:00.000Z'),
        timeZone: 'Asia/Kolkata',
      });
      expect(res.calendarOverdueDays).toBe(5);
      expect(res.overdueDays).toBe(3);
      expect(res.calculatedFine).toBe(300);
    });

    it('correctly handles school timezone transitions across UTC midnight vs IST midnight', () => {
      // Due Apr 10, grace 0 days => Grace ends Apr 10 23:59:59.999 IST (Apr 10 18:29:59.999 UTC).
      // At Apr 10 20:00:00 UTC, it is already Apr 11 01:30:00 IST (1 day overdue in Asia/Kolkata, but still Apr 10 in UTC!).
      const zeroGraceRule: EvaluableFineRule = {
        ...baseRule,
        fineType: FineType.FIXED,
        fineValue: 150,
        gracePeriodDays: 0,
      };

      const istEval = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: zeroGraceRule,
        asOfDate: new Date('2026-04-10T20:00:00.000Z'),
        timeZone: 'Asia/Kolkata',
      });
      expect(istEval.asOfLocalDate).toBe('2026-04-11');
      expect(istEval.isPastGracePeriod).toBe(true);
      expect(istEval.overdueDays).toBe(1);
      expect(istEval.calculatedFine).toBe(150);
    });
  });

  describe('5. Fully Paid, Partially Paid, VOID Invoices & Duplicate Prevention', () => {
    it('calculates 0 fine for fully paid or VOID invoices', () => {
      const pctRule: EvaluableFineRule = {
        ...baseRule,
        fineType: FineType.PERCENTAGE,
        fineValue: 10,
      };

      const fullyPaid = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: pctRule,
        asOfDate: new Date('2026-04-22T10:00:00.000Z'),
        authoritativePaidAmount: 9000,
      });
      expect(fullyPaid.isFullyPaid).toBe(true);
      expect(fullyPaid.eligibleOutstandingBasis).toBe(0);
      expect(fullyPaid.calculatedFine).toBe(0);

      const voidInv = service.evaluateFineCalculation({
        invoice: { ...sampleInvoice, status: InvoiceStatus.VOID },
        rule: pctRule,
        asOfDate: new Date('2026-04-22T10:00:00.000Z'),
      });
      expect(voidInv.calculatedFine).toBe(0);
    });

    it('reduces eligibleOutstandingBasis on partial payment and avoids double-counting existing fine', () => {
      const pctRule: EvaluableFineRule = {
        ...baseRule,
        fineType: FineType.PERCENTAGE,
        fineValue: 10,
      };

      // Partial payment of 4000 on 9000 net invoice => 5000 unpaid principal => 10% fine = 500
      const partialRes = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: pctRule,
        asOfDate: new Date('2026-04-22T10:00:00.000Z'),
        simulatedPaidAmount: 4000,
      });
      expect(partialRes.eligibleOutstandingBasis).toBe(5000);
      expect(partialRes.calculatedFine).toBe(500);

      // If 200 fine was already recorded, net additional fine is 500 - 200 = 300 (never double-counted or negative)
      const dedupRes = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: pctRule,
        asOfDate: new Date('2026-04-22T10:00:00.000Z'),
        simulatedPaidAmount: 4000,
        alreadyRecordedFineAmount: 200,
      });
      expect(dedupRes.calculatedFine).toBe(300);
    });
  });

  describe('6. Inactive Rules, Effective Dates, Invalid Inputs & Decimal Precision', () => {
    it('returns 0 fine when rule is INACTIVE or outside effectiveStartDate / effectiveEndDate', () => {
      const inactiveRes = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: { ...baseRule, status: FineRuleStatus.INACTIVE },
        asOfDate: new Date('2026-04-22T10:00:00.000Z'),
      });
      expect(inactiveRes.calculatedFine).toBe(0);

      const futureRule: EvaluableFineRule = {
        ...baseRule,
        effectiveStartDate: new Date('2026-05-01T00:00:00.000Z'),
      };
      const beforeStart = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: futureRule,
        asOfDate: new Date('2026-04-22T10:00:00.000Z'),
      });
      expect(beforeStart.calculatedFine).toBe(0);

      const expiredRule: EvaluableFineRule = {
        ...baseRule,
        effectiveEndDate: new Date('2026-04-18T00:00:00.000Z'),
      };
      const afterEnd = service.evaluateFineCalculation({
        invoice: sampleInvoice,
        rule: expiredRule,
        asOfDate: new Date('2026-04-22T10:00:00.000Z'),
      });
      expect(afterEnd.calculatedFine).toBe(0);
    });

    it('rejects negative fine values, percentage > 100%, and negative grace periods', () => {
      expect(() =>
        service.evaluateFineCalculation({
          invoice: sampleInvoice,
          rule: { ...baseRule, fineValue: -10 },
          asOfDate: new Date('2026-04-22T10:00:00.000Z'),
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.evaluateFineCalculation({
          invoice: sampleInvoice,
          rule: { ...baseRule, fineType: FineType.PERCENTAGE, fineValue: 150 },
          asOfDate: new Date('2026-04-22T10:00:00.000Z'),
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateOverdueDays(dueDateApr10Ist, new Date(), -1),
      ).toThrow(BadRequestException);
    });

    it('maintains exact ROUND_HALF_UP decimal precision on fractional percentages and large monetary amounts', () => {
      const fractionalInvoice: EvaluableInvoice = {
        ...sampleInvoice,
        grossAmount: '1234567.89',
        discountAmount: '0.00',
        netAmount: '1234567.89',
      };
      const fractionalPctRule: EvaluableFineRule = {
        ...baseRule,
        fineType: FineType.PERCENTAGE,
        fineValue: '2.35', // 1234567.89 * 2.35 / 100 = 29012.345415 -> rounds HALF_UP to 29012.35
      };

      const res = service.evaluateFineCalculation({
        invoice: fractionalInvoice,
        rule: fractionalPctRule,
        asOfDate: new Date('2026-04-22T10:00:00.000Z'),
      });
      expect(res.calculatedFine).toBe(29012.35);
    });
  });
});
