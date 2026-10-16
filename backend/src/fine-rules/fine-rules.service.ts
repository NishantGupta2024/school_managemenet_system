import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FeeHeadCategory,
  FineDayCountPolicy,
  FineRuleStatus,
  FineType,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFineRuleDto } from './dto/create-fine-rule.dto';
import { UpdateFineRuleDto } from './dto/update-fine-rule.dto';
import { PreviewFineCalculationDto } from './dto/preview-fine-calculation.dto';
import { BILLING_MONTH_NAMES } from '../fee-generation/fee-generation.service';

export interface EvaluableInvoiceItem {
  id?: string;
  feeHeadId: string;
  feeHeadNameSnapshot: string;
  grossAmount?: Prisma.Decimal | number | string;
  discountAmount?: Prisma.Decimal | number | string;
  netAmount: Prisma.Decimal | number | string;
  feeHead?: {
    id?: string;
    name?: string;
    code?: string;
    category?: FeeHeadCategory;
  } | null;
}

export interface EvaluableInvoice {
  id: string;
  schoolId?: string;
  studentId?: string;
  academicYearId?: string;
  billingMonth?: number;
  dueDate: Date;
  grossAmount: Prisma.Decimal | number | string;
  discountAmount: Prisma.Decimal | number | string;
  netAmount: Prisma.Decimal | number | string;
  status: InvoiceStatus;
  items?: EvaluableInvoiceItem[];
}

export interface EvaluableFineRule {
  id: string;
  name: string;
  fineType: FineType;
  fineValue: Prisma.Decimal | number | string;
  gracePeriodDays: number;
  maxFineCap?: Prisma.Decimal | number | string | null;
  dayCountPolicy: FineDayCountPolicy;
  applicableFeeHeadId?: string | null;
  applicableCategory?: FeeHeadCategory | null;
  effectiveStartDate?: Date | string | null;
  effectiveEndDate?: Date | string | null;
  status: FineRuleStatus;
}

export interface OverdueDaysResult {
  dueLocalDate: string;
  graceEndLocalDate: string;
  asOfLocalDate: string;
  isPastGracePeriod: boolean;
  calendarOverdueDays: number;
  applicableOverdueDays: number;
}

export interface FineCalculationBreakdown {
  invoiceId: string;
  dueDate: Date;
  dueLocalDate: string;
  gracePeriodDays: number;
  graceEndLocalDate: string;
  asOfDate: Date;
  asOfLocalDate: string;
  timeZone: string;
  dayCountPolicy: FineDayCountPolicy;
  isPastGracePeriod: boolean;
  calendarOverdueDays: number;
  overdueDays: number;
  invoiceGrossAmount: number;
  invoiceDiscountAmount: number;
  invoiceNetAmount: number;
  authoritativePaidAmount: number;
  paidAmountUsed: number;
  isPaymentSimulated: boolean;
  isFullyPaid: boolean;
  scopedBaseAmount: number;
  eligibleOutstandingBasis: number;
  ruleApplied: {
    id: string;
    name: string;
    fineType: FineType;
    fineValue: number;
    gracePeriodDays: number;
    maxFineCap: number | null;
    dayCountPolicy: FineDayCountPolicy;
    applicableFeeHeadId: string | null;
    applicableCategory: FeeHeadCategory | null;
    effectiveStartDate: Date | string | null;
    effectiveEndDate: Date | string | null;
    status: FineRuleStatus;
  } | null;
  fineType: FineType | null;
  fineValue: number;
  uncappedFine: number;
  maxFineCap: number | null;
  capApplied: boolean;
  alreadyRecordedFineAmount: number;
  calculatedFine: number;
  isPaymentOrCollected: false;
  reason: string;
}

@Injectable()
export class FineRulesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Extracts the local calendar date (year, month 1-12, day 1-31) in the target school timezone.
   */
  public extractLocalDateParts(
    date: Date,
    timeZone: string = 'Asia/Kolkata',
  ): { year: number; month: number; day: number } {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    for (const p of parts) {
      partMap[p.type] = p.value;
    }
    return {
      year: parseInt(partMap.year, 10),
      month: parseInt(partMap.month, 10),
      day: parseInt(partMap.day, 10),
    };
  }

  /**
   * Converts a Date to a UTC midnight timestamp corresponding to its local calendar date in `timeZone`.
   */
  public toLocalMidnightUtcTimestamp(
    date: Date,
    timeZone: string = 'Asia/Kolkata',
  ): number {
    const { year, month, day } = this.extractLocalDateParts(date, timeZone);
    return Date.UTC(year, month - 1, day);
  }

  /**
   * Formats a UTC midnight timestamp as YYYY-MM-DD.
   */
  public formatUtcMidnightAsIsoDate(utcMidnightMs: number): string {
    const d = new Date(utcMidnightMs);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Deterministically computes overdue days in the school's timezone.
   *
   * Day-count policies:
   * - CALENDAR_DAYS: Every calendar day elapsed after (dueLocalDate + gracePeriodDays).
   * - WORKING_DAYS: Monday through Friday (ISO weekdays 1..5, excluding Saturday 6 and Sunday 0)
   *   elapsed after (dueLocalDate + gracePeriodDays) in the school's timezone.
   */
  public calculateOverdueDays(
    dueDate: Date,
    asOfDate: Date,
    gracePeriodDays: number,
    dayCountPolicy: FineDayCountPolicy = FineDayCountPolicy.CALENDAR_DAYS,
    timeZone: string = 'Asia/Kolkata',
  ): OverdueDaysResult {
    if (!Number.isInteger(gracePeriodDays) || gracePeriodDays < 0) {
      throw new BadRequestException('Grace period days must be a non-negative integer');
    }

    const DAY_MS = 24 * 60 * 60 * 1000;
    const dueDayUtc = this.toLocalMidnightUtcTimestamp(dueDate, timeZone);
    const graceEndDayUtc = dueDayUtc + gracePeriodDays * DAY_MS;
    const asOfDayUtc = this.toLocalMidnightUtcTimestamp(asOfDate, timeZone);

    const dueLocalDate = this.formatUtcMidnightAsIsoDate(dueDayUtc);
    const graceEndLocalDate = this.formatUtcMidnightAsIsoDate(graceEndDayUtc);
    const asOfLocalDate = this.formatUtcMidnightAsIsoDate(asOfDayUtc);

    // Check both local calendar date and exact timestamp cutoff
    const graceCutoffTimestamp = dueDate.getTime() + gracePeriodDays * DAY_MS;
    if (asOfDayUtc <= graceEndDayUtc || asOfDate.getTime() <= graceCutoffTimestamp) {
      return {
        dueLocalDate,
        graceEndLocalDate,
        asOfLocalDate,
        isPastGracePeriod: false,
        calendarOverdueDays: 0,
        applicableOverdueDays: 0,
      };
    }

    const calendarOverdueDays = Math.round((asOfDayUtc - graceEndDayUtc) / DAY_MS);

    if (dayCountPolicy === FineDayCountPolicy.CALENDAR_DAYS) {
      return {
        dueLocalDate,
        graceEndLocalDate,
        asOfLocalDate,
        isPastGracePeriod: true,
        calendarOverdueDays,
        applicableOverdueDays: calendarOverdueDays,
      };
    }

    // WORKING_DAYS: Count Monday (1) through Friday (5), excluding Saturday (6) and Sunday (0)
    let workingDays = 0;
    for (let cursor = graceEndDayUtc + DAY_MS; cursor <= asOfDayUtc; cursor += DAY_MS) {
      const dayOfWeek = new Date(cursor).getUTCDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        workingDays++;
      }
    }

    return {
      dueLocalDate,
      graceEndLocalDate,
      asOfLocalDate,
      isPastGracePeriod: true,
      calendarOverdueDays,
      applicableOverdueDays: workingDays,
    };
  }

  /**
   * Pure, deterministic fine calculation engine using Prisma.Decimal arithmetic.
   * Never modifies invoice snapshots or treats a calculated fine as a payment.
   */
  public evaluateFineCalculation(params: {
    invoice: EvaluableInvoice;
    rule: EvaluableFineRule | null;
    asOfDate?: Date;
    timeZone?: string;
    authoritativePaidAmount?: Prisma.Decimal | number | string;
    simulatedPaidAmount?: Prisma.Decimal | number | string;
    alreadyRecordedFineAmount?: Prisma.Decimal | number | string;
  }): FineCalculationBreakdown {
    const {
      invoice,
      rule,
      asOfDate = new Date(),
      timeZone = 'Asia/Kolkata',
      authoritativePaidAmount = 0,
      simulatedPaidAmount,
      alreadyRecordedFineAmount = 0,
    } = params;

    const invoiceGrossDec = new Prisma.Decimal(invoice.grossAmount || 0).toDecimalPlaces(
      2,
      Prisma.Decimal.ROUND_HALF_UP,
    );
    const invoiceDiscountDec = new Prisma.Decimal(invoice.discountAmount || 0).toDecimalPlaces(
      2,
      Prisma.Decimal.ROUND_HALF_UP,
    );
    const invoiceNetDec = new Prisma.Decimal(invoice.netAmount || 0).toDecimalPlaces(
      2,
      Prisma.Decimal.ROUND_HALF_UP,
    );

    const authPaidDec = new Prisma.Decimal(authoritativePaidAmount || 0).toDecimalPlaces(
      2,
      Prisma.Decimal.ROUND_HALF_UP,
    );
    if (authPaidDec.lessThan(0)) {
      throw new BadRequestException('Authoritative paid amount cannot be negative');
    }

    const isPaymentSimulated =
      simulatedPaidAmount !== undefined && simulatedPaidAmount !== null;
    const paidUsedDec = isPaymentSimulated
      ? new Prisma.Decimal(simulatedPaidAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : authPaidDec;

    if (paidUsedDec.lessThan(0)) {
      throw new BadRequestException('Paid amount cannot be negative');
    }

    const alreadyRecordedFineDec = new Prisma.Decimal(
      alreadyRecordedFineAmount || 0,
    ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if (alreadyRecordedFineDec.lessThan(0)) {
      throw new BadRequestException('Previously recorded fine amount cannot be negative');
    }

    const gracePeriodDays = rule ? rule.gracePeriodDays : 5;
    const dayCountPolicy = rule ? rule.dayCountPolicy : FineDayCountPolicy.CALENDAR_DAYS;

    const overdueInfo = this.calculateOverdueDays(
      new Date(invoice.dueDate),
      asOfDate,
      gracePeriodDays,
      dayCountPolicy,
      timeZone,
    );

    const ruleSummary = rule
      ? {
          id: rule.id,
          name: rule.name,
          fineType: rule.fineType,
          fineValue: new Prisma.Decimal(rule.fineValue)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
            .toNumber(),
          gracePeriodDays: rule.gracePeriodDays,
          maxFineCap:
            rule.maxFineCap !== null && rule.maxFineCap !== undefined
              ? new Prisma.Decimal(rule.maxFineCap)
                  .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
                  .toNumber()
              : null,
          dayCountPolicy: rule.dayCountPolicy,
          applicableFeeHeadId: rule.applicableFeeHeadId || null,
          applicableCategory: rule.applicableCategory || null,
          effectiveStartDate: rule.effectiveStartDate || null,
          effectiveEndDate: rule.effectiveEndDate || null,
          status: rule.status,
        }
      : null;

    // 1. Check VOID invoice
    if (invoice.status === InvoiceStatus.VOID) {
      return {
        invoiceId: invoice.id,
        dueDate: new Date(invoice.dueDate),
        dueLocalDate: overdueInfo.dueLocalDate,
        gracePeriodDays,
        graceEndLocalDate: overdueInfo.graceEndLocalDate,
        asOfDate,
        asOfLocalDate: overdueInfo.asOfLocalDate,
        timeZone,
        dayCountPolicy,
        isPastGracePeriod: overdueInfo.isPastGracePeriod,
        calendarOverdueDays: overdueInfo.calendarOverdueDays,
        overdueDays: 0,
        invoiceGrossAmount: invoiceGrossDec.toNumber(),
        invoiceDiscountAmount: invoiceDiscountDec.toNumber(),
        invoiceNetAmount: invoiceNetDec.toNumber(),
        authoritativePaidAmount: authPaidDec.toNumber(),
        paidAmountUsed: paidUsedDec.toNumber(),
        isPaymentSimulated,
        isFullyPaid: false,
        scopedBaseAmount: 0,
        eligibleOutstandingBasis: 0,
        ruleApplied: ruleSummary,
        fineType: rule ? rule.fineType : null,
        fineValue: ruleSummary ? ruleSummary.fineValue : 0,
        uncappedFine: 0,
        maxFineCap: ruleSummary ? ruleSummary.maxFineCap : null,
        capApplied: false,
        alreadyRecordedFineAmount: alreadyRecordedFineDec.toNumber(),
        calculatedFine: 0,
        isPaymentOrCollected: false,
        reason: 'Invoice is VOID; no late fine applies',
      };
    }

    // 2. Compute unpaid invoice principal (excluding any fines)
    const unpaidInvoicePrincipal = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      invoiceNetDec.sub(paidUsedDec),
    ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    const isFullyPaid = unpaidInvoicePrincipal.lessThanOrEqualTo(0);

    // 3. Compute scoped base amount from invoice items (excluding any fine line items)
    let scopedBaseDec = invoiceNetDec;
    if (rule && (rule.applicableFeeHeadId || rule.applicableCategory)) {
      if (Array.isArray(invoice.items)) {
        scopedBaseDec = new Prisma.Decimal(0);
        for (const item of invoice.items) {
          if (rule.applicableFeeHeadId && item.feeHeadId !== rule.applicableFeeHeadId) {
            continue;
          }
          if (
            rule.applicableCategory &&
            item.feeHead?.category &&
            item.feeHead.category !== rule.applicableCategory
          ) {
            continue;
          }
          if (rule.applicableCategory && !item.feeHead?.category) {
            continue;
          }
          scopedBaseDec = scopedBaseDec.add(new Prisma.Decimal(item.netAmount || 0));
        }
        scopedBaseDec = scopedBaseDec.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      } else {
        scopedBaseDec = new Prisma.Decimal(0);
      }
    }

    // Eligible outstanding basis is the minimum of scoped base fee and unpaid invoice principal
    const eligibleBasisDec = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      Prisma.Decimal.min(scopedBaseDec, unpaidInvoicePrincipal),
    ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    if (isFullyPaid) {
      return {
        invoiceId: invoice.id,
        dueDate: new Date(invoice.dueDate),
        dueLocalDate: overdueInfo.dueLocalDate,
        gracePeriodDays,
        graceEndLocalDate: overdueInfo.graceEndLocalDate,
        asOfDate,
        asOfLocalDate: overdueInfo.asOfLocalDate,
        timeZone,
        dayCountPolicy,
        isPastGracePeriod: overdueInfo.isPastGracePeriod,
        calendarOverdueDays: overdueInfo.calendarOverdueDays,
        overdueDays: overdueInfo.applicableOverdueDays,
        invoiceGrossAmount: invoiceGrossDec.toNumber(),
        invoiceDiscountAmount: invoiceDiscountDec.toNumber(),
        invoiceNetAmount: invoiceNetDec.toNumber(),
        authoritativePaidAmount: authPaidDec.toNumber(),
        paidAmountUsed: paidUsedDec.toNumber(),
        isPaymentSimulated,
        isFullyPaid: true,
        scopedBaseAmount: scopedBaseDec.toNumber(),
        eligibleOutstandingBasis: 0,
        ruleApplied: ruleSummary,
        fineType: rule ? rule.fineType : null,
        fineValue: ruleSummary ? ruleSummary.fineValue : 0,
        uncappedFine: 0,
        maxFineCap: ruleSummary ? ruleSummary.maxFineCap : null,
        capApplied: false,
        alreadyRecordedFineAmount: alreadyRecordedFineDec.toNumber(),
        calculatedFine: 0,
        isPaymentOrCollected: false,
        reason: 'Invoice is fully paid / zero outstanding balance; no late fine applies',
      };
    }

    if (!rule) {
      return {
        invoiceId: invoice.id,
        dueDate: new Date(invoice.dueDate),
        dueLocalDate: overdueInfo.dueLocalDate,
        gracePeriodDays,
        graceEndLocalDate: overdueInfo.graceEndLocalDate,
        asOfDate,
        asOfLocalDate: overdueInfo.asOfLocalDate,
        timeZone,
        dayCountPolicy,
        isPastGracePeriod: overdueInfo.isPastGracePeriod,
        calendarOverdueDays: overdueInfo.calendarOverdueDays,
        overdueDays: overdueInfo.applicableOverdueDays,
        invoiceGrossAmount: invoiceGrossDec.toNumber(),
        invoiceDiscountAmount: invoiceDiscountDec.toNumber(),
        invoiceNetAmount: invoiceNetDec.toNumber(),
        authoritativePaidAmount: authPaidDec.toNumber(),
        paidAmountUsed: paidUsedDec.toNumber(),
        isPaymentSimulated,
        isFullyPaid: false,
        scopedBaseAmount: scopedBaseDec.toNumber(),
        eligibleOutstandingBasis: eligibleBasisDec.toNumber(),
        ruleApplied: null,
        fineType: null,
        fineValue: 0,
        uncappedFine: 0,
        maxFineCap: null,
        capApplied: false,
        alreadyRecordedFineAmount: alreadyRecordedFineDec.toNumber(),
        calculatedFine: 0,
        isPaymentOrCollected: false,
        reason: 'No active fine rule is configured for this academic session',
      };
    }

    // 4. Validate rule status and effective date range
    if (rule.status !== FineRuleStatus.ACTIVE) {
      return {
        invoiceId: invoice.id,
        dueDate: new Date(invoice.dueDate),
        dueLocalDate: overdueInfo.dueLocalDate,
        gracePeriodDays,
        graceEndLocalDate: overdueInfo.graceEndLocalDate,
        asOfDate,
        asOfLocalDate: overdueInfo.asOfLocalDate,
        timeZone,
        dayCountPolicy,
        isPastGracePeriod: overdueInfo.isPastGracePeriod,
        calendarOverdueDays: overdueInfo.calendarOverdueDays,
        overdueDays: overdueInfo.applicableOverdueDays,
        invoiceGrossAmount: invoiceGrossDec.toNumber(),
        invoiceDiscountAmount: invoiceDiscountDec.toNumber(),
        invoiceNetAmount: invoiceNetDec.toNumber(),
        authoritativePaidAmount: authPaidDec.toNumber(),
        paidAmountUsed: paidUsedDec.toNumber(),
        isPaymentSimulated,
        isFullyPaid: false,
        scopedBaseAmount: scopedBaseDec.toNumber(),
        eligibleOutstandingBasis: eligibleBasisDec.toNumber(),
        ruleApplied: ruleSummary,
        fineType: rule.fineType,
        fineValue: ruleSummary!.fineValue,
        uncappedFine: 0,
        maxFineCap: ruleSummary!.maxFineCap,
        capApplied: false,
        alreadyRecordedFineAmount: alreadyRecordedFineDec.toNumber(),
        calculatedFine: 0,
        isPaymentOrCollected: false,
        reason: `Fine rule '${rule.name}' is INACTIVE`,
      };
    }

    const asOfDayUtc = this.toLocalMidnightUtcTimestamp(asOfDate, timeZone);
    if (rule.effectiveStartDate) {
      const startDayUtc = this.toLocalMidnightUtcTimestamp(
        new Date(rule.effectiveStartDate),
        timeZone,
      );
      if (asOfDayUtc < startDayUtc) {
        return {
          invoiceId: invoice.id,
          dueDate: new Date(invoice.dueDate),
          dueLocalDate: overdueInfo.dueLocalDate,
          gracePeriodDays,
          graceEndLocalDate: overdueInfo.graceEndLocalDate,
          asOfDate,
          asOfLocalDate: overdueInfo.asOfLocalDate,
          timeZone,
          dayCountPolicy,
          isPastGracePeriod: overdueInfo.isPastGracePeriod,
          calendarOverdueDays: overdueInfo.calendarOverdueDays,
          overdueDays: overdueInfo.applicableOverdueDays,
          invoiceGrossAmount: invoiceGrossDec.toNumber(),
          invoiceDiscountAmount: invoiceDiscountDec.toNumber(),
          invoiceNetAmount: invoiceNetDec.toNumber(),
          authoritativePaidAmount: authPaidDec.toNumber(),
          paidAmountUsed: paidUsedDec.toNumber(),
          isPaymentSimulated,
          isFullyPaid: false,
          scopedBaseAmount: scopedBaseDec.toNumber(),
          eligibleOutstandingBasis: eligibleBasisDec.toNumber(),
          ruleApplied: ruleSummary,
          fineType: rule.fineType,
          fineValue: ruleSummary!.fineValue,
          uncappedFine: 0,
          maxFineCap: ruleSummary!.maxFineCap,
          capApplied: false,
          alreadyRecordedFineAmount: alreadyRecordedFineDec.toNumber(),
          calculatedFine: 0,
          isPaymentOrCollected: false,
          reason: `Evaluation date (${overdueInfo.asOfLocalDate}) is before rule effective start date (${this.formatUtcMidnightAsIsoDate(startDayUtc)})`,
        };
      }
    }

    if (rule.effectiveEndDate) {
      const endDayUtc = this.toLocalMidnightUtcTimestamp(
        new Date(rule.effectiveEndDate),
        timeZone,
      );
      if (asOfDayUtc > endDayUtc) {
        return {
          invoiceId: invoice.id,
          dueDate: new Date(invoice.dueDate),
          dueLocalDate: overdueInfo.dueLocalDate,
          gracePeriodDays,
          graceEndLocalDate: overdueInfo.graceEndLocalDate,
          asOfDate,
          asOfLocalDate: overdueInfo.asOfLocalDate,
          timeZone,
          dayCountPolicy,
          isPastGracePeriod: overdueInfo.isPastGracePeriod,
          calendarOverdueDays: overdueInfo.calendarOverdueDays,
          overdueDays: overdueInfo.applicableOverdueDays,
          invoiceGrossAmount: invoiceGrossDec.toNumber(),
          invoiceDiscountAmount: invoiceDiscountDec.toNumber(),
          invoiceNetAmount: invoiceNetDec.toNumber(),
          authoritativePaidAmount: authPaidDec.toNumber(),
          paidAmountUsed: paidUsedDec.toNumber(),
          isPaymentSimulated,
          isFullyPaid: false,
          scopedBaseAmount: scopedBaseDec.toNumber(),
          eligibleOutstandingBasis: eligibleBasisDec.toNumber(),
          ruleApplied: ruleSummary,
          fineType: rule.fineType,
          fineValue: ruleSummary!.fineValue,
          uncappedFine: 0,
          maxFineCap: ruleSummary!.maxFineCap,
          capApplied: false,
          alreadyRecordedFineAmount: alreadyRecordedFineDec.toNumber(),
          calculatedFine: 0,
          isPaymentOrCollected: false,
          reason: `Evaluation date (${overdueInfo.asOfLocalDate}) is after rule effective end date (${this.formatUtcMidnightAsIsoDate(endDayUtc)})`,
        };
      }
    }

    if (eligibleBasisDec.lessThanOrEqualTo(0)) {
      return {
        invoiceId: invoice.id,
        dueDate: new Date(invoice.dueDate),
        dueLocalDate: overdueInfo.dueLocalDate,
        gracePeriodDays,
        graceEndLocalDate: overdueInfo.graceEndLocalDate,
        asOfDate,
        asOfLocalDate: overdueInfo.asOfLocalDate,
        timeZone,
        dayCountPolicy,
        isPastGracePeriod: overdueInfo.isPastGracePeriod,
        calendarOverdueDays: overdueInfo.calendarOverdueDays,
        overdueDays: overdueInfo.applicableOverdueDays,
        invoiceGrossAmount: invoiceGrossDec.toNumber(),
        invoiceDiscountAmount: invoiceDiscountDec.toNumber(),
        invoiceNetAmount: invoiceNetDec.toNumber(),
        authoritativePaidAmount: authPaidDec.toNumber(),
        paidAmountUsed: paidUsedDec.toNumber(),
        isPaymentSimulated,
        isFullyPaid: false,
        scopedBaseAmount: scopedBaseDec.toNumber(),
        eligibleOutstandingBasis: 0,
        ruleApplied: ruleSummary,
        fineType: rule.fineType,
        fineValue: ruleSummary!.fineValue,
        uncappedFine: 0,
        maxFineCap: ruleSummary!.maxFineCap,
        capApplied: false,
        alreadyRecordedFineAmount: alreadyRecordedFineDec.toNumber(),
        calculatedFine: 0,
        isPaymentOrCollected: false,
        reason: 'No eligible outstanding balance for the configured fee head or category scope',
      };
    }

    if (!overdueInfo.isPastGracePeriod || overdueInfo.applicableOverdueDays <= 0) {
      return {
        invoiceId: invoice.id,
        dueDate: new Date(invoice.dueDate),
        dueLocalDate: overdueInfo.dueLocalDate,
        gracePeriodDays,
        graceEndLocalDate: overdueInfo.graceEndLocalDate,
        asOfDate,
        asOfLocalDate: overdueInfo.asOfLocalDate,
        timeZone,
        dayCountPolicy,
        isPastGracePeriod: overdueInfo.isPastGracePeriod,
        calendarOverdueDays: overdueInfo.calendarOverdueDays,
        overdueDays: overdueInfo.applicableOverdueDays,
        invoiceGrossAmount: invoiceGrossDec.toNumber(),
        invoiceDiscountAmount: invoiceDiscountDec.toNumber(),
        invoiceNetAmount: invoiceNetDec.toNumber(),
        authoritativePaidAmount: authPaidDec.toNumber(),
        paidAmountUsed: paidUsedDec.toNumber(),
        isPaymentSimulated,
        isFullyPaid: false,
        scopedBaseAmount: scopedBaseDec.toNumber(),
        eligibleOutstandingBasis: eligibleBasisDec.toNumber(),
        ruleApplied: ruleSummary,
        fineType: rule.fineType,
        fineValue: ruleSummary!.fineValue,
        uncappedFine: 0,
        maxFineCap: ruleSummary!.maxFineCap,
        capApplied: false,
        alreadyRecordedFineAmount: alreadyRecordedFineDec.toNumber(),
        calculatedFine: 0,
        isPaymentOrCollected: false,
        reason: overdueInfo.isPastGracePeriod
          ? 'No overdue working days have elapsed after the grace period'
          : `Invoice is within due date / ${gracePeriodDays}-day grace period (grace ends ${overdueInfo.graceEndLocalDate})`,
      };
    }

    // 5. Validate fineValue and calculate uncapped fine using Prisma.Decimal
    const fineValueDec = new Prisma.Decimal(rule.fineValue).toDecimalPlaces(
      2,
      Prisma.Decimal.ROUND_HALF_UP,
    );
    if (fineValueDec.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Fine value must be greater than 0');
    }
    if (rule.fineType === FineType.PERCENTAGE && fineValueDec.greaterThan(100)) {
      throw new BadRequestException('Percentage fine value cannot exceed 100%');
    }

    let uncappedFineDec = new Prisma.Decimal(0);
    if (rule.fineType === FineType.FIXED) {
      uncappedFineDec = fineValueDec;
    } else if (rule.fineType === FineType.PER_DAY) {
      uncappedFineDec = fineValueDec
        .mul(overdueInfo.applicableOverdueDays)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    } else if (rule.fineType === FineType.PERCENTAGE) {
      uncappedFineDec = eligibleBasisDec
        .mul(fineValueDec)
        .div(100)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    }

    // 6. Apply maximum fine cap if configured
    let cappedFineDec = uncappedFineDec;
    let capApplied = false;
    if (rule.maxFineCap !== null && rule.maxFineCap !== undefined) {
      const capDec = new Prisma.Decimal(rule.maxFineCap).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      if (capDec.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Maximum fine cap must be greater than 0 when specified');
      }
      if (uncappedFineDec.greaterThan(capDec)) {
        cappedFineDec = capDec;
        capApplied = true;
      }
    }

    // 7. Deduct any already recorded fine on this obligation to avoid double-counting, floor at 0
    const netCalculatedFineDec = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      cappedFineDec.sub(alreadyRecordedFineDec),
    ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    return {
      invoiceId: invoice.id,
      dueDate: new Date(invoice.dueDate),
      dueLocalDate: overdueInfo.dueLocalDate,
      gracePeriodDays,
      graceEndLocalDate: overdueInfo.graceEndLocalDate,
      asOfDate,
      asOfLocalDate: overdueInfo.asOfLocalDate,
      timeZone,
      dayCountPolicy,
      isPastGracePeriod: true,
      calendarOverdueDays: overdueInfo.calendarOverdueDays,
      overdueDays: overdueInfo.applicableOverdueDays,
      invoiceGrossAmount: invoiceGrossDec.toNumber(),
      invoiceDiscountAmount: invoiceDiscountDec.toNumber(),
      invoiceNetAmount: invoiceNetDec.toNumber(),
      authoritativePaidAmount: authPaidDec.toNumber(),
      paidAmountUsed: paidUsedDec.toNumber(),
      isPaymentSimulated,
      isFullyPaid: false,
      scopedBaseAmount: scopedBaseDec.toNumber(),
      eligibleOutstandingBasis: eligibleBasisDec.toNumber(),
      ruleApplied: ruleSummary,
      fineType: rule.fineType,
      fineValue: fineValueDec.toNumber(),
      uncappedFine: uncappedFineDec.toNumber(),
      maxFineCap: ruleSummary!.maxFineCap,
      capApplied,
      alreadyRecordedFineAmount: alreadyRecordedFineDec.toNumber(),
      calculatedFine: netCalculatedFineDec.toNumber(),
      isPaymentOrCollected: false,
      reason: capApplied
        ? `Overdue by ${overdueInfo.applicableOverdueDays} ${dayCountPolicy === FineDayCountPolicy.WORKING_DAYS ? 'working' : 'calendar'} day(s) past grace period; capped at maximum fine cap`
        : `Overdue by ${overdueInfo.applicableOverdueDays} ${dayCountPolicy === FineDayCountPolicy.WORKING_DAYS ? 'working' : 'calendar'} day(s) past grace period`,
    };
  }

  /**
   * Selects the single highest-precedence active, date-effective rule for an invoice:
   * 1. Specific applicableFeeHeadId matching an item on the invoice
   * 2. Specific applicableCategory matching an item on the invoice
   * 3. School-wide session rule (both applicableFeeHeadId and applicableCategory are null)
   */
  public selectBestMatchingRuleForInvoice(
    invoice: EvaluableInvoice,
    activeRules: EvaluableFineRule[],
    asOfDate: Date = new Date(),
    timeZone: string = 'Asia/Kolkata',
  ): EvaluableFineRule | null {
    const asOfDayUtc = this.toLocalMidnightUtcTimestamp(asOfDate, timeZone);

    const dateEffectiveRules = activeRules.filter((r) => {
      if (r.status !== FineRuleStatus.ACTIVE) return false;
      if (r.effectiveStartDate) {
        const startUtc = this.toLocalMidnightUtcTimestamp(new Date(r.effectiveStartDate), timeZone);
        if (asOfDayUtc < startUtc) return false;
      }
      if (r.effectiveEndDate) {
        const endUtc = this.toLocalMidnightUtcTimestamp(new Date(r.effectiveEndDate), timeZone);
        if (asOfDayUtc > endUtc) return false;
      }
      return true;
    });

    if (dateEffectiveRules.length === 0) return null;

    const itemHeadIds = new Set(
      (invoice.items || []).map((it) => it.feeHeadId),
    );
    const itemCategories = new Set(
      (invoice.items || [])
        .map((it) => it.feeHead?.category)
        .filter((c): c is FeeHeadCategory => Boolean(c)),
    );

    // Priority 1: FeeHead-specific rule
    const headRule = dateEffectiveRules.find(
      (r) => r.applicableFeeHeadId && itemHeadIds.has(r.applicableFeeHeadId),
    );
    if (headRule) return headRule;

    // Priority 2: Category-specific rule
    const categoryRule = dateEffectiveRules.find(
      (r) =>
        !r.applicableFeeHeadId &&
        r.applicableCategory &&
        itemCategories.has(r.applicableCategory),
    );
    if (categoryRule) return categoryRule;

    // Priority 3: General rule (applies to all fee heads)
    const generalRule = dateEffectiveRules.find(
      (r) => !r.applicableFeeHeadId && !r.applicableCategory,
    );
    return generalRule || null;
  }

  private validateRuleBusinessInvariants(params: {
    fineType: FineType;
    fineValue: Prisma.Decimal;
    gracePeriodDays: number;
    maxFineCap: Prisma.Decimal | null;
    effectiveStartDate: Date | null;
    effectiveEndDate: Date | null;
  }) {
    const {
      fineType,
      fineValue,
      gracePeriodDays,
      maxFineCap,
      effectiveStartDate,
      effectiveEndDate,
    } = params;

    if (fineValue.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Fine value must be greater than 0');
    }

    if (fineType === FineType.PERCENTAGE && fineValue.greaterThan(100)) {
      throw new BadRequestException(
        'Percentage fine value cannot exceed 100% of the eligible outstanding amount',
      );
    }

    if (!Number.isInteger(gracePeriodDays) || gracePeriodDays < 0 || gracePeriodDays > 365) {
      throw new BadRequestException(
        'Grace period days must be an integer between 0 and 365',
      );
    }

    if (maxFineCap !== null) {
      if (maxFineCap.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          'Maximum fine cap must be greater than 0 when configured',
        );
      }
      if (fineType === FineType.FIXED && maxFineCap.lessThan(fineValue)) {
        throw new BadRequestException(
          `Maximum fine cap (${maxFineCap.toFixed(2)}) cannot be less than the fixed fine amount (${fineValue.toFixed(2)})`,
        );
      }
    }

    if (effectiveStartDate && isNaN(effectiveStartDate.getTime())) {
      throw new BadRequestException('Invalid effective start date');
    }
    if (effectiveEndDate && isNaN(effectiveEndDate.getTime())) {
      throw new BadRequestException('Invalid effective end date');
    }
    if (
      effectiveStartDate &&
      effectiveEndDate &&
      effectiveEndDate.getTime() < effectiveStartDate.getTime()
    ) {
      throw new BadRequestException(
        'Effective end date cannot be earlier than effective start date',
      );
    }
  }

  private formatRuleResponse(rule: any) {
    return {
      id: rule.id,
      schoolId: rule.schoolId,
      academicYearId: rule.academicYearId,
      academicYearName: rule.academicYear?.name || null,
      name: rule.name,
      description: rule.description,
      fineType: rule.fineType,
      fineValue: Number(rule.fineValue),
      gracePeriodDays: rule.gracePeriodDays,
      maxFineCap: rule.maxFineCap !== null && rule.maxFineCap !== undefined ? Number(rule.maxFineCap) : null,
      dayCountPolicy: rule.dayCountPolicy,
      applicableFeeHeadId: rule.applicableFeeHeadId,
      applicableFeeHeadName: rule.applicableFeeHead?.name || null,
      applicableFeeHeadCode: rule.applicableFeeHead?.code || null,
      applicableCategory: rule.applicableCategory,
      effectiveStartDate: rule.effectiveStartDate,
      effectiveEndDate: rule.effectiveEndDate,
      status: rule.status,
      createdByUserId: rule.createdByUserId,
      updatedByUserId: rule.updatedByUserId,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  async create(schoolId: string, userId: string, dto: CreateFineRuleDto) {
    const trimmedName = dto.name.trim();
    if (!trimmedName) {
      throw new BadRequestException('Rule name cannot be empty');
    }

    // 1. Verify academicYearId belongs to schoolId
    const academicYear = await this.prisma.academicYear.findUnique({
      where: { schoolId_id: { schoolId, id: dto.academicYearId } },
    });
    if (!academicYear) {
      throw new NotFoundException(
        `Academic session ${dto.academicYearId} not found in this school`,
      );
    }

    // 2. Verify applicableFeeHeadId if provided belongs to schoolId
    let applicableFeeHead: any = null;
    if (dto.applicableFeeHeadId) {
      applicableFeeHead = await this.prisma.feeHead.findUnique({
        where: { schoolId_id: { schoolId, id: dto.applicableFeeHeadId } },
      });
      if (!applicableFeeHead) {
        throw new NotFoundException(
          `Fee head ${dto.applicableFeeHeadId} not found in this school`,
        );
      }
      if (
        dto.applicableCategory &&
        applicableFeeHead.category !== dto.applicableCategory
      ) {
        throw new BadRequestException(
          `Selected fee head '${applicableFeeHead.name}' belongs to category '${applicableFeeHead.category}', which does not match '${dto.applicableCategory}'`,
        );
      }
    }

    const fineValueDec = new Prisma.Decimal(dto.fineValue).toDecimalPlaces(
      2,
      Prisma.Decimal.ROUND_HALF_UP,
    );
    const maxFineCapDec =
      dto.maxFineCap !== null && dto.maxFineCap !== undefined
        ? new Prisma.Decimal(dto.maxFineCap).toDecimalPlaces(
            2,
            Prisma.Decimal.ROUND_HALF_UP,
          )
        : null;
    const gracePeriodDays =
      dto.gracePeriodDays !== undefined ? dto.gracePeriodDays : 5;
    const effectiveStartDate = dto.effectiveStartDate
      ? new Date(dto.effectiveStartDate)
      : null;
    const effectiveEndDate = dto.effectiveEndDate
      ? new Date(dto.effectiveEndDate)
      : null;

    this.validateRuleBusinessInvariants({
      fineType: dto.fineType,
      fineValue: fineValueDec,
      gracePeriodDays,
      maxFineCap: maxFineCapDec,
      effectiveStartDate,
      effectiveEndDate,
    });

    try {
      const created = await this.prisma.fineRule.create({
        data: {
          schoolId,
          academicYearId: dto.academicYearId,
          name: trimmedName,
          description: dto.description ? dto.description.trim() : null,
          fineType: dto.fineType,
          fineValue: fineValueDec,
          gracePeriodDays,
          maxFineCap: maxFineCapDec,
          dayCountPolicy: dto.dayCountPolicy || FineDayCountPolicy.CALENDAR_DAYS,
          applicableFeeHeadId: dto.applicableFeeHeadId || null,
          applicableCategory: dto.applicableCategory || null,
          effectiveStartDate,
          effectiveEndDate,
          status: dto.status || FineRuleStatus.ACTIVE,
          createdByUserId: userId,
          updatedByUserId: userId,
        },
        include: {
          academicYear: true,
          applicableFeeHead: true,
        },
      });
      return this.formatRuleResponse(created);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(
          `A fine rule named '${trimmedName}' already exists for this academic session`,
        );
      }
      throw new BadRequestException('Failed to create fine rule');
    }
  }

  async findAll(
    schoolId: string,
    filters?: {
      academicYearId?: string;
      status?: FineRuleStatus;
      fineType?: FineType;
    },
  ) {
    const where: Prisma.FineRuleWhereInput = { schoolId };
    if (filters?.academicYearId) {
      where.academicYearId = filters.academicYearId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.fineType) {
      where.fineType = filters.fineType;
    }

    const rules = await this.prisma.fineRule.findMany({
      where,
      include: {
        academicYear: true,
        applicableFeeHead: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return rules.map((r) => this.formatRuleResponse(r));
  }

  async findOne(schoolId: string, id: string) {
    const rule = await this.prisma.fineRule.findUnique({
      where: { schoolId_id: { schoolId, id } },
      include: {
        academicYear: true,
        applicableFeeHead: true,
      },
    });
    if (!rule) {
      throw new NotFoundException(`Fine rule ${id} not found in this school`);
    }
    return this.formatRuleResponse(rule);
  }

  async update(
    schoolId: string,
    id: string,
    userId: string,
    dto: UpdateFineRuleDto,
  ) {
    const existing = await this.prisma.fineRule.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (!existing) {
      throw new NotFoundException(`Fine rule ${id} not found in this school`);
    }

    const nextName =
      dto.name !== undefined ? dto.name.trim() : existing.name;
    if (!nextName) {
      throw new BadRequestException('Rule name cannot be empty');
    }

    const nextFineType =
      dto.fineType !== undefined ? dto.fineType : existing.fineType;
    const nextFineValue =
      dto.fineValue !== undefined
        ? new Prisma.Decimal(dto.fineValue).toDecimalPlaces(
            2,
            Prisma.Decimal.ROUND_HALF_UP,
          )
        : new Prisma.Decimal(existing.fineValue);
    const nextGracePeriodDays =
      dto.gracePeriodDays !== undefined
        ? dto.gracePeriodDays
        : existing.gracePeriodDays;

    let nextMaxFineCap: Prisma.Decimal | null = existing.maxFineCap
      ? new Prisma.Decimal(existing.maxFineCap)
      : null;
    if (dto.maxFineCap !== undefined) {
      nextMaxFineCap =
        dto.maxFineCap === null
          ? null
          : new Prisma.Decimal(dto.maxFineCap).toDecimalPlaces(
              2,
              Prisma.Decimal.ROUND_HALF_UP,
            );
    }

    const nextApplicableFeeHeadId =
      dto.applicableFeeHeadId !== undefined
        ? dto.applicableFeeHeadId || null
        : existing.applicableFeeHeadId;
    const nextApplicableCategory =
      dto.applicableCategory !== undefined
        ? dto.applicableCategory || null
        : existing.applicableCategory;

    if (nextApplicableFeeHeadId) {
      const feeHead = await this.prisma.feeHead.findUnique({
        where: { schoolId_id: { schoolId, id: nextApplicableFeeHeadId } },
      });
      if (!feeHead) {
        throw new NotFoundException(
          `Fee head ${nextApplicableFeeHeadId} not found in this school`,
        );
      }
      if (
        nextApplicableCategory &&
        feeHead.category !== nextApplicableCategory
      ) {
        throw new BadRequestException(
          `Selected fee head '${feeHead.name}' belongs to category '${feeHead.category}', which does not match '${nextApplicableCategory}'`,
        );
      }
    }

    const nextEffectiveStartDate =
      dto.effectiveStartDate !== undefined
        ? dto.effectiveStartDate
          ? new Date(dto.effectiveStartDate)
          : null
        : existing.effectiveStartDate;
    const nextEffectiveEndDate =
      dto.effectiveEndDate !== undefined
        ? dto.effectiveEndDate
          ? new Date(dto.effectiveEndDate)
          : null
        : existing.effectiveEndDate;

    this.validateRuleBusinessInvariants({
      fineType: nextFineType,
      fineValue: nextFineValue,
      gracePeriodDays: nextGracePeriodDays,
      maxFineCap: nextMaxFineCap,
      effectiveStartDate: nextEffectiveStartDate,
      effectiveEndDate: nextEffectiveEndDate,
    });

    try {
      const updated = await this.prisma.fineRule.update({
        where: { schoolId_id: { schoolId, id } },
        data: {
          name: nextName,
          description:
            dto.description !== undefined
              ? dto.description
                ? dto.description.trim()
                : null
              : existing.description,
          fineType: nextFineType,
          fineValue: nextFineValue,
          gracePeriodDays: nextGracePeriodDays,
          maxFineCap: nextMaxFineCap,
          dayCountPolicy:
            dto.dayCountPolicy !== undefined
              ? dto.dayCountPolicy
              : existing.dayCountPolicy,
          applicableFeeHeadId: nextApplicableFeeHeadId,
          applicableCategory: nextApplicableCategory,
          effectiveStartDate: nextEffectiveStartDate,
          effectiveEndDate: nextEffectiveEndDate,
          status: dto.status !== undefined ? dto.status : existing.status,
          updatedByUserId: userId,
        },
        include: {
          academicYear: true,
          applicableFeeHead: true,
        },
      });
      return this.formatRuleResponse(updated);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(
          `A fine rule named '${nextName}' already exists for this academic session`,
        );
      }
      throw new BadRequestException('Failed to update fine rule');
    }
  }

  async updateStatus(
    schoolId: string,
    id: string,
    userId: string,
    status: FineRuleStatus,
  ) {
    const existing = await this.prisma.fineRule.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (!existing) {
      throw new NotFoundException(`Fine rule ${id} not found in this school`);
    }

    const updated = await this.prisma.fineRule.update({
      where: { schoolId_id: { schoolId, id } },
      data: {
        status,
        updatedByUserId: userId,
      },
      include: {
        academicYear: true,
        applicableFeeHead: true,
      },
    });
    return this.formatRuleResponse(updated);
  }

  async remove(schoolId: string, id: string) {
    const existing = await this.prisma.fineRule.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (!existing) {
      throw new NotFoundException(`Fine rule ${id} not found in this school`);
    }

    await this.prisma.fineRule.delete({
      where: { schoolId_id: { schoolId, id } },
    });
    return { id, deleted: true };
  }

  async listInvoicesForPreview(schoolId: string, academicYearId?: string) {
    const where: Prisma.FeeInvoiceWhereInput = { schoolId };
    if (academicYearId) {
      where.academicYearId = academicYearId;
    }

    const invoices = await this.prisma.feeInvoice.findMany({
      where,
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
        academicYear: true,
      },
      orderBy: [{ billingMonth: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });

    return invoices.map((inv) => ({
      id: inv.id,
      studentId: inv.studentId,
      studentName: `${inv.student.firstName} ${inv.student.lastName}`,
      admissionNumber: inv.student.admissionNumber,
      gradeName: inv.student.grade?.name || null,
      sectionName: inv.student.section?.name || null,
      academicYearId: inv.academicYearId,
      academicYearName: inv.academicYear?.name || null,
      billingMonth: inv.billingMonth,
      monthName:
        BILLING_MONTH_NAMES[inv.billingMonth - 1] || `Month ${inv.billingMonth}`,
      dueDate: inv.dueDate,
      grossAmount: Number(inv.grossAmount),
      discountAmount: Number(inv.discountAmount),
      netAmount: Number(inv.netAmount),
      status: inv.status,
    }));
  }

  async previewForInvoice(schoolId: string, dto: PreviewFineCalculationDto) {
    const [invoice, school] = await Promise.all([
      this.prisma.feeInvoice.findUnique({
        where: { schoolId_id: { schoolId, id: dto.invoiceId } },
        include: {
          student: {
            include: {
              grade: true,
              section: true,
            },
          },
          academicYear: true,
          items: {
            include: {
              feeHead: true,
            },
          },
        },
      }),
      this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { timezone: true },
      }),
    ]);

    if (!invoice) {
      throw new NotFoundException(`Invoice ${dto.invoiceId} not found in this school`);
    }

    const timeZone = school?.timezone || 'Asia/Kolkata';
    const asOfDate = dto.asOfDate ? new Date(dto.asOfDate) : new Date();
    if (isNaN(asOfDate.getTime())) {
      throw new BadRequestException('Invalid evaluation date (asOfDate)');
    }

    let selectedRule: EvaluableFineRule | null = null;
    if (dto.fineRuleId) {
      const explicitRule = await this.prisma.fineRule.findUnique({
        where: { schoolId_id: { schoolId, id: dto.fineRuleId } },
      });
      if (!explicitRule) {
        throw new NotFoundException(
          `Fine rule ${dto.fineRuleId} not found in this school`,
        );
      }
      if (explicitRule.academicYearId !== invoice.academicYearId) {
        throw new BadRequestException(
          `Fine rule '${explicitRule.name}' belongs to a different academic session than the selected invoice`,
        );
      }
      selectedRule = explicitRule;
    } else {
      const sessionRules = await this.prisma.fineRule.findMany({
        where: {
          schoolId,
          academicYearId: invoice.academicYearId,
          status: FineRuleStatus.ACTIVE,
        },
        orderBy: { createdAt: 'asc' },
      });
      selectedRule = this.selectBestMatchingRuleForInvoice(
        invoice,
        sessionRules,
        asOfDate,
        timeZone,
      );
    }

    const breakdown = this.evaluateFineCalculation({
      invoice,
      rule: selectedRule,
      asOfDate,
      timeZone,
      authoritativePaidAmount: 0,
      simulatedPaidAmount: dto.paidAmount,
      alreadyRecordedFineAmount: 0,
    });

    return {
      ...breakdown,
      invoiceSummary: {
        id: invoice.id,
        studentId: invoice.studentId,
        studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
        admissionNumber: invoice.student.admissionNumber,
        gradeName: invoice.student.grade?.name || null,
        academicYearId: invoice.academicYearId,
        academicYearName: invoice.academicYear?.name || null,
        billingMonth: invoice.billingMonth,
        monthName:
          BILLING_MONTH_NAMES[invoice.billingMonth - 1] ||
          `Month ${invoice.billingMonth}`,
        dueDate: invoice.dueDate,
        grossAmount: Number(invoice.grossAmount),
        discountAmount: Number(invoice.discountAmount),
        netAmount: Number(invoice.netAmount),
        status: invoice.status,
      },
    };
  }
}
