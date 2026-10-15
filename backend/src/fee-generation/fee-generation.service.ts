import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PreviewFeeGenerationDto } from './dto/preview-fee-generation.dto';
import { ExecuteFeeGenerationDto } from './dto/execute-fee-generation.dto';
import {
  FeeFrequency,
  ConcessionType,
  InvoiceStatus,
  UserRole,
  Prisma,
  AcademicYear,
} from '@prisma/client';

export interface PlannedInvoiceItem {
  feeHeadId: string;
  feeHeadNameSnapshot: string;
  grossAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  billingFrequencySnapshot: FeeFrequency;
}

export interface PlannedInvoice {
  studentId: string;
  academicYearId: string;
  billingMonth: number;
  monthName: string;
  dueDate: Date;
  grossAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  items: PlannedInvoiceItem[];
}

export const BILLING_MONTH_NAMES = [
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'January',
  'February',
  'March',
];

@Injectable()
export class FeeGenerationService {
  constructor(private readonly prisma: PrismaService) {}

  public convertLocalToUtc(
    year: number,
    monthIndex: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    ms: number,
    timeZone: string = 'Asia/Kolkata',
  ): Date {
    const approx = new Date(Date.UTC(year, monthIndex, day, hour, minute, second, ms));
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(approx);
    const partMap: Record<string, string> = {};
    for (const p of parts) partMap[p.type] = p.value;

    const formattedAsUtc = Date.UTC(
      parseInt(partMap.year, 10),
      parseInt(partMap.month, 10) - 1,
      parseInt(partMap.day, 10),
      parseInt(partMap.hour, 10),
      parseInt(partMap.minute, 10),
      parseInt(partMap.second, 10),
      ms,
    );
    const offset = formattedAsUtc - approx.getTime();
    return new Date(approx.getTime() - offset);
  }

  public getDueDateForBillingMonth(
    academicYear: AcademicYear,
    billingMonth: number,
    timezone: string = 'Asia/Kolkata',
  ): Date {
    const startYear = academicYear.startDate.getUTCFullYear();
    // billingMonth 1 = April (calendar month index 3), billingMonth 10 = January (calendar month index 0)
    const monthOffset = billingMonth - 1;
    const calendarMonth = (3 + monthOffset) % 12;
    const calendarYear = startYear + Math.floor((3 + monthOffset) / 12);

    // Standard school fee due date: 10th of the calendar month at 23:59:59.999 local school time
    return this.convertLocalToUtc(calendarYear, calendarMonth, 10, 23, 59, 59, 999, timezone);
  }

  public getMonthStartDateForBillingMonth(
    academicYear: AcademicYear,
    billingMonth: number,
    timezone: string = 'Asia/Kolkata',
  ): Date {
    const startYear = academicYear.startDate.getUTCFullYear();
    const monthOffset = billingMonth - 1;
    const calendarMonth = (3 + monthOffset) % 12;
    const calendarYear = startYear + Math.floor((3 + monthOffset) / 12);

    // Billing month start: 1st of the calendar month at 00:00:00.000 local school time
    return this.convertLocalToUtc(calendarYear, calendarMonth, 1, 0, 0, 0, 0, timezone);
  }

  public deriveCurrentInvoiceStatus(
    status: InvoiceStatus,
    dueDate: Date,
    asOfDate: Date = new Date(),
    gracePeriodDays: number = 5,
    monthStartDate?: Date,
  ): InvoiceStatus {
    if (status === InvoiceStatus.VOID) {
      return InvoiceStatus.VOID;
    }

    const dueTime = dueDate.getTime();
    const currentTime = asOfDate.getTime();
    const gracePeriodMs = gracePeriodDays * 24 * 60 * 60 * 1000;

    // Billing month starts on the 1st of the month at 00:00:00
    // If not passed explicitly, derived from dueDate (day 10 23:59:59.999 -> day 1 00:00:00.000)
    const monthStartTime = monthStartDate
      ? monthStartDate.getTime()
      : dueTime - (9 * 24 * 60 * 60 * 1000 + (23 * 3600 + 59 * 60 + 59) * 1000 + 999);

    if (currentTime < monthStartTime) {
      return InvoiceStatus.UPCOMING;
    } else if (currentTime <= dueTime + gracePeriodMs) {
      return InvoiceStatus.DUE;
    } else {
      return InvoiceStatus.OVERDUE;
    }
  }

  public generateStudentSchedule(
    allocation: any,
    academicYear: AcademicYear,
    timezone: string = 'Asia/Kolkata',
    alreadyBilledOneTimeFeeHeadIds?: Set<string>,
  ): PlannedInvoice[] {
    const startMonth = Math.max(1, Math.min(12, allocation.startBillingMonth || 1));
    const optedHeadIds = new Set<string>((allocation.optedFeeHeadIds as string[]) || []);

    // Filter structure items: mandatory + opted optional items
    // Omit ONE_TIME fee heads if already billed for this student in prior sessions or runs
    const eligibleStructureItems = allocation.feeStructure.items.filter((item: any) => {
      if (
        item.frequency === FeeFrequency.ONE_TIME &&
        alreadyBilledOneTimeFeeHeadIds &&
        alreadyBilledOneTimeFeeHeadIds.has(item.feeHeadId)
      ) {
        return false;
      }
      if (item.isOptional) {
        return optedHeadIds.has(item.feeHeadId);
      }
      return true;
    });

    const plannedMonths: {
      billingMonth: number;
      dueDate: Date;
      monthName: string;
      items: {
        feeHeadId: string;
        feeHeadNameSnapshot: string;
        grossAmount: Prisma.Decimal;
        discountAmount: Prisma.Decimal;
        netAmount: Prisma.Decimal;
        billingFrequencySnapshot: FeeFrequency;
      }[];
    }[] = [];

    // 1. Build initial gross item schedule
    for (let m = startMonth; m <= 12; m++) {
      const dueDate = this.getDueDateForBillingMonth(academicYear, m, timezone);
      const monthName = BILLING_MONTH_NAMES[m - 1];
      const monthItems: any[] = [];

      for (const item of eligibleStructureItems) {
        let isApplicableThisMonth = false;

        if (item.frequency === FeeFrequency.MONTHLY) {
          isApplicableThisMonth = true;
        } else if (
          item.frequency === FeeFrequency.ANNUAL ||
          item.frequency === FeeFrequency.ONE_TIME
        ) {
          // Annual and One-Time charges are billed in the student's first active month
          isApplicableThisMonth = m === startMonth;
        }

        if (isApplicableThisMonth) {
          const gross = new Prisma.Decimal(item.amount);
          monthItems.push({
            feeHeadId: item.feeHeadId,
            feeHeadNameSnapshot: item.feeHead.name,
            grossAmount: gross,
            discountAmount: new Prisma.Decimal(0),
            netAmount: gross,
            billingFrequencySnapshot: item.frequency,
          });
        }
      }

      if (monthItems.length > 0) {
        plannedMonths.push({
          billingMonth: m,
          dueDate,
          monthName,
          items: monthItems,
        });
      }
    }

    // 2. Concession Calculations
    const concessionType = allocation.concessionType as ConcessionType;
    const concessionValue = new Prisma.Decimal(allocation.concessionValue || 0);

    if (concessionType === ConcessionType.PERCENTAGE && concessionValue.greaterThan(0)) {
      // Percentage Concession
      const percentage = Prisma.Decimal.min(concessionValue, new Prisma.Decimal(100));

      for (const m of plannedMonths) {
        for (const item of m.items) {
          const disc = item.grossAmount
            .mul(percentage)
            .div(100)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          item.discountAmount = Prisma.Decimal.min(disc, item.grossAmount);
          item.netAmount = item.grossAmount.sub(item.discountAmount);
        }
      }
    } else if (concessionType === ConcessionType.FLAT_DISCOUNT && concessionValue.greaterThan(0)) {
      // Flat Annual Discount Concession
      let totalGross = new Prisma.Decimal(0);
      for (const m of plannedMonths) {
        for (const item of m.items) {
          totalGross = totalGross.add(item.grossAmount);
        }
      }

      // Cap discount at total gross obligation
      const effectiveDiscount = Prisma.Decimal.min(concessionValue, totalGross);
      let remainingDiscountPool = effectiveDiscount;
      const numMonths = plannedMonths.length;

      if (numMonths > 0) {
        const baseMonthlyQuota = effectiveDiscount
          .div(numMonths)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_FLOOR);

        for (let i = 0; i < numMonths; i++) {
          const m = plannedMonths[i];
          const isLastMonth = i === numMonths - 1;
          let monthTarget = isLastMonth
            ? remainingDiscountPool
            : Prisma.Decimal.min(baseMonthlyQuota, remainingDiscountPool);

          for (const item of m.items) {
            if (monthTarget.lessThanOrEqualTo(0)) break;

            const itemDiscount = Prisma.Decimal.min(monthTarget, item.grossAmount);
            item.discountAmount = item.discountAmount.add(itemDiscount);
            item.netAmount = item.grossAmount.sub(item.discountAmount);

            monthTarget = monthTarget.sub(itemDiscount);
            remainingDiscountPool = remainingDiscountPool.sub(itemDiscount);
          }
        }

        // Second pass: if any remainder pool remains (e.g. from months where gross was smaller than quota),
        // distribute to any items with remaining gross
        if (remainingDiscountPool.greaterThan(0)) {
          for (const m of plannedMonths) {
            for (const item of m.items) {
              if (remainingDiscountPool.lessThanOrEqualTo(0)) break;

              const remainingHeadroom = item.netAmount;
              if (remainingHeadroom.greaterThan(0)) {
                const addDisc = Prisma.Decimal.min(remainingDiscountPool, remainingHeadroom);
                item.discountAmount = item.discountAmount.add(addDisc);
                item.netAmount = item.grossAmount.sub(item.discountAmount);
                remainingDiscountPool = remainingDiscountPool.sub(addDisc);
              }
            }
          }
        }
      }
    }

    // 3. Compile planned invoices with totals
    return plannedMonths.map((m) => {
      let mGross = new Prisma.Decimal(0);
      let mDiscount = new Prisma.Decimal(0);
      let mNet = new Prisma.Decimal(0);

      for (const item of m.items) {
        mGross = mGross.add(item.grossAmount);
        mDiscount = mDiscount.add(item.discountAmount);
        mNet = mNet.add(item.netAmount);
      }

      return {
        studentId: allocation.studentId,
        academicYearId: allocation.academicYearId,
        billingMonth: m.billingMonth,
        monthName: m.monthName,
        dueDate: m.dueDate,
        grossAmount: mGross,
        discountAmount: mDiscount,
        netAmount: mNet,
        items: m.items,
      };
    });
  }

  async preview(schoolId: string, dto: PreviewFeeGenerationDto) {
    // 1. Verify Academic Year and School Timezone
    const [academicYear, school] = await Promise.all([
      this.prisma.academicYear.findUnique({
        where: { schoolId_id: { schoolId, id: dto.academicYearId } },
      }),
      this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { timezone: true },
      }),
    ]);
    if (!academicYear) {
      throw new NotFoundException(`Academic year ${dto.academicYearId} not found in this school`);
    }
    const timezone = school?.timezone || 'Asia/Kolkata';

    // 2. Fetch active allocations
    const whereAllocation: any = {
      schoolId,
      academicYearId: dto.academicYearId,
      status: 'ACTIVE',
    };
    if (dto.gradeId) {
      whereAllocation.student = { gradeId: dto.gradeId };
    }

    const allocations = await this.prisma.studentFeeAllocation.findMany({
      where: whereAllocation,
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
        feeStructure: {
          include: {
            items: {
              include: {
                feeHead: true,
              },
            },
          },
        },
      },
    });

    // 3. Fetch existing invoices in this school & session to identify skips
    const existingInvoices = await this.prisma.feeInvoice.findMany({
      where: {
        schoolId,
        academicYearId: dto.academicYearId,
      },
      select: {
        studentId: true,
        billingMonth: true,
      },
    });

    const existingKeySet = new Set(
      existingInvoices.map((inv) => `${inv.studentId}_${inv.billingMonth}`),
    );

    // 4. Fetch already billed ONE_TIME fee heads across all sessions
    const studentIdsList = allocations.map((a) => a.studentId);
    const [oneTimeBillings, legacyOneTimeItems] = await Promise.all([
      this.prisma.studentOneTimeFeeBilling.findMany({
        where: {
          schoolId,
          studentId: { in: studentIdsList },
        },
        select: {
          studentId: true,
          feeHeadId: true,
        },
      }),
      this.prisma.invoiceItem.findMany({
        where: {
          schoolId,
          billingFrequencySnapshot: FeeFrequency.ONE_TIME,
          invoice: {
            studentId: { in: studentIdsList },
          },
        },
        select: {
          feeHeadId: true,
          invoice: {
            select: { studentId: true },
          },
        },
      }),
    ]);

    const studentBilledOneTimeMap = new Map<string, Set<string>>();
    for (const b of oneTimeBillings) {
      if (!studentBilledOneTimeMap.has(b.studentId)) {
        studentBilledOneTimeMap.set(b.studentId, new Set<string>());
      }
      studentBilledOneTimeMap.get(b.studentId)!.add(b.feeHeadId);
    }
    for (const l of legacyOneTimeItems) {
      if (l.invoice?.studentId) {
        if (!studentBilledOneTimeMap.has(l.invoice.studentId)) {
          studentBilledOneTimeMap.set(l.invoice.studentId, new Set<string>());
        }
        studentBilledOneTimeMap.get(l.invoice.studentId)!.add(l.feeHeadId);
      }
    }

    let totalPlannedInvoices = 0;
    let newInvoicesToCreate = 0;
    let existingInvoicesToSkip = 0;
    let totalPlannedItems = 0;
    let projectedGrossTotal = new Prisma.Decimal(0);
    let projectedDiscountTotal = new Prisma.Decimal(0);
    let projectedNetTotal = new Prisma.Decimal(0);
    const validationErrors: string[] = [];

    const studentIds = new Set<string>();

    for (const alloc of allocations) {
      studentIds.add(alloc.studentId);

      if (!alloc.feeStructure || alloc.feeStructure.status !== 'ACTIVE') {
        validationErrors.push(
          `Student ${alloc.student.admissionNumber} (${alloc.student.firstName}) has an inactive or missing fee structure`,
        );
        continue;
      }

      const billedOneTimeHeads = studentBilledOneTimeMap.get(alloc.studentId) || new Set<string>();
      const schedule = this.generateStudentSchedule(alloc, academicYear, timezone, billedOneTimeHeads);

      for (const invoicePlan of schedule) {
        totalPlannedInvoices++;
        const key = `${invoicePlan.studentId}_${invoicePlan.billingMonth}`;

        if (existingKeySet.has(key)) {
          existingInvoicesToSkip++;
        } else {
          newInvoicesToCreate++;
          totalPlannedItems += invoicePlan.items.length;
          projectedGrossTotal = projectedGrossTotal.add(invoicePlan.grossAmount);
          projectedDiscountTotal = projectedDiscountTotal.add(invoicePlan.discountAmount);
          projectedNetTotal = projectedNetTotal.add(invoicePlan.netAmount);
        }
      }
    }

    return {
      academicYearId: dto.academicYearId,
      gradeId: dto.gradeId || null,
      totalEligibleAllocations: allocations.length,
      totalStudents: studentIds.size,
      totalPlannedInvoices,
      newInvoicesToCreate,
      existingInvoicesToSkip,
      totalPlannedItems,
      projectedGrossTotal: projectedGrossTotal.toDecimalPlaces(2).toNumber(),
      projectedDiscountTotal: projectedDiscountTotal.toDecimalPlaces(2).toNumber(),
      projectedNetTotal: projectedNetTotal.toDecimalPlaces(2).toNumber(),
      validationErrors,
    };
  }

  async execute(schoolId: string, executedByUserId: string, dto: ExecuteFeeGenerationDto) {
    // 1. Verify Academic Year and School Timezone
    const [academicYear, school] = await Promise.all([
      this.prisma.academicYear.findUnique({
        where: { schoolId_id: { schoolId, id: dto.academicYearId } },
      }),
      this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { timezone: true },
      }),
    ]);
    if (!academicYear) {
      throw new NotFoundException(`Academic year ${dto.academicYearId} not found in this school`);
    }
    const timezone = school?.timezone || 'Asia/Kolkata';

    // 2. Fetch active allocations
    const whereAllocation: any = {
      schoolId,
      academicYearId: dto.academicYearId,
      status: 'ACTIVE',
    };
    if (dto.gradeId) {
      whereAllocation.student = { gradeId: dto.gradeId };
    }

    const allocations = await this.prisma.studentFeeAllocation.findMany({
      where: whereAllocation,
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
        feeStructure: {
          include: {
            items: {
              include: {
                feeHead: true,
              },
            },
          },
        },
      },
    });

    if (allocations.length === 0) {
      throw new BadRequestException('No active student allocations found to generate fees for');
    }

    // 3. Find existing invoices to enforce idempotency
    const existingInvoices = await this.prisma.feeInvoice.findMany({
      where: {
        schoolId,
        academicYearId: dto.academicYearId,
      },
      select: {
        studentId: true,
        billingMonth: true,
      },
    });

    const existingKeySet = new Set(
      existingInvoices.map((inv) => `${inv.studentId}_${inv.billingMonth}`),
    );

    // 4. Fetch already billed ONE_TIME fee heads across all sessions
    const studentIdsList = allocations.map((a) => a.studentId);
    const [oneTimeBillings, legacyOneTimeItems] = await Promise.all([
      this.prisma.studentOneTimeFeeBilling.findMany({
        where: {
          schoolId,
          studentId: { in: studentIdsList },
        },
        select: {
          studentId: true,
          feeHeadId: true,
        },
      }),
      this.prisma.invoiceItem.findMany({
        where: {
          schoolId,
          billingFrequencySnapshot: FeeFrequency.ONE_TIME,
          invoice: {
            studentId: { in: studentIdsList },
          },
        },
        select: {
          feeHeadId: true,
          invoice: {
            select: { studentId: true },
          },
        },
      }),
    ]);

    const studentBilledOneTimeMap = new Map<string, Set<string>>();
    for (const b of oneTimeBillings) {
      if (!studentBilledOneTimeMap.has(b.studentId)) {
        studentBilledOneTimeMap.set(b.studentId, new Set<string>());
      }
      studentBilledOneTimeMap.get(b.studentId)!.add(b.feeHeadId);
    }
    for (const l of legacyOneTimeItems) {
      if (l.invoice?.studentId) {
        if (!studentBilledOneTimeMap.has(l.invoice.studentId)) {
          studentBilledOneTimeMap.set(l.invoice.studentId, new Set<string>());
        }
        studentBilledOneTimeMap.get(l.invoice.studentId)!.add(l.feeHeadId);
      }
    }

    let createdInvoicesCount = 0;
    let skippedInvoicesCount = 0;
    let failedInvoicesCount = 0;
    let totalGrossCreated = new Prisma.Decimal(0);
    let totalDiscountCreated = new Prisma.Decimal(0);
    let totalNetCreated = new Prisma.Decimal(0);
    const studentIds = new Set<string>();

    // 5. Execute atomic generation per student allocation
    for (const alloc of allocations) {
      studentIds.add(alloc.studentId);

      if (!alloc.feeStructure || alloc.feeStructure.status !== 'ACTIVE') {
        failedInvoicesCount++;
        continue;
      }

      const billedOneTimeHeads = studentBilledOneTimeMap.get(alloc.studentId) || new Set<string>();
      const schedule = this.generateStudentSchedule(alloc, academicYear, timezone, billedOneTimeHeads);

      for (const invoicePlan of schedule) {
        const key = `${invoicePlan.studentId}_${invoicePlan.billingMonth}`;

        if (existingKeySet.has(key)) {
          skippedInvoicesCount++;
          continue;
        }

        try {
          await this.prisma.$transaction(async (tx) => {
            const initialStatus = this.deriveCurrentInvoiceStatus(
              InvoiceStatus.UPCOMING,
              invoicePlan.dueDate,
            );

            await tx.feeInvoice.create({
              data: {
                schoolId,
                studentId: invoicePlan.studentId,
                academicYearId: invoicePlan.academicYearId,
                billingMonth: invoicePlan.billingMonth,
                dueDate: invoicePlan.dueDate,
                grossAmount: invoicePlan.grossAmount,
                discountAmount: invoicePlan.discountAmount,
                netAmount: invoicePlan.netAmount,
                status: initialStatus,
                items: {
                  create: invoicePlan.items.map((item) => ({
                    feeHeadId: item.feeHeadId,
                    feeHeadNameSnapshot: item.feeHeadNameSnapshot,
                    grossAmount: item.grossAmount,
                    discountAmount: item.discountAmount,
                    netAmount: item.netAmount,
                    billingFrequencySnapshot: item.billingFrequencySnapshot,
                  })),
                },
              },
            });

            // Persist ONE_TIME fee billing record to prevent any future rebilling across sessions
            const oneTimeItems = invoicePlan.items.filter(
              (item) => item.billingFrequencySnapshot === FeeFrequency.ONE_TIME,
            );
            for (const otItem of oneTimeItems) {
              await tx.studentOneTimeFeeBilling.upsert({
                where: {
                  schoolId_studentId_feeHeadId: {
                    schoolId,
                    studentId: invoicePlan.studentId,
                    feeHeadId: otItem.feeHeadId,
                  },
                },
                update: {},
                create: {
                  schoolId,
                  studentId: invoicePlan.studentId,
                  feeHeadId: otItem.feeHeadId,
                  academicYearId: invoicePlan.academicYearId,
                },
              });
              if (!studentBilledOneTimeMap.has(invoicePlan.studentId)) {
                studentBilledOneTimeMap.set(invoicePlan.studentId, new Set<string>());
              }
              studentBilledOneTimeMap.get(invoicePlan.studentId)!.add(otItem.feeHeadId);
            }
          });

          // Mark as existing in local memory set
          existingKeySet.add(key);
          createdInvoicesCount++;
          totalGrossCreated = totalGrossCreated.add(invoicePlan.grossAmount);
          totalDiscountCreated = totalDiscountCreated.add(invoicePlan.discountAmount);
          totalNetCreated = totalNetCreated.add(invoicePlan.netAmount);
        } catch (err: any) {
          // If unique constraint violation occurred (e.g. concurrent run)
          if (err.code === 'P2002') {
            skippedInvoicesCount++;
          } else {
            failedInvoicesCount++;
          }
        }
      }
    }

    // 5. Record Fee Generation Run Audit Log
    const runAudit = await this.prisma.feeGenerationRun.create({
      data: {
        schoolId,
        academicYearId: dto.academicYearId,
        gradeId: dto.gradeId || null,
        executedByUserId,
        totalStudents: studentIds.size,
        totalInvoicesCreated: createdInvoicesCount,
        totalInvoicesSkipped: skippedInvoicesCount,
        totalGrossAmount: totalGrossCreated.toDecimalPlaces(2),
        totalDiscountAmount: totalDiscountCreated.toDecimalPlaces(2),
        totalNetAmount: totalNetCreated.toDecimalPlaces(2),
        status: failedInvoicesCount > 0 ? 'PARTIAL' : 'COMPLETED',
      },
    });

    return {
      runId: runAudit.id,
      academicYearId: dto.academicYearId,
      gradeId: dto.gradeId || null,
      totalStudents: studentIds.size,
      totalInvoicesCreated: createdInvoicesCount,
      totalInvoicesSkipped: skippedInvoicesCount,
      totalInvoicesFailed: failedInvoicesCount,
      totalGrossAmount: totalGrossCreated.toDecimalPlaces(2).toNumber(),
      totalDiscountAmount: totalDiscountCreated.toDecimalPlaces(2).toNumber(),
      totalNetAmount: totalNetCreated.toDecimalPlaces(2).toNumber(),
      status: runAudit.status,
      executedAt: runAudit.createdAt,
    };
  }

  async getGenerationRuns(schoolId: string, academicYearId?: string) {
    const where: any = { schoolId };
    if (academicYearId) {
      where.academicYearId = academicYearId;
    }
    return this.prisma.feeGenerationRun.findMany({
      where,
      include: {
        academicYear: true,
        executedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async getStudentFeeStatement(
    schoolId: string,
    user: any,
    studentId: string,
    academicYearId?: string,
  ) {
    // 1. Fetch student ensuring tenant isolation
    const student = await this.prisma.student.findUnique({
      where: {
        schoolId_id: { schoolId, id: studentId },
      },
      include: {
        grade: true,
        section: true,
        academicYear: true,
      },
    });

    if (!student) {
      throw new NotFoundException(`Student ${studentId} not found in this school`);
    }

    // 2. Strict Role-based student authorization:
    // PLATFORM_SUPER_ADMIN, SCHOOL_ADMIN, FEE_STAFF can access any student in school
    // STUDENT and PARENT must be explicitly associated with this student
    if (user.role === UserRole.STUDENT) {
      if (!student.userId || student.userId !== user.id) {
        throw new ForbiddenException(
          'Access denied: You are not authorized to view this student fee statement',
        );
      }
    } else if (user.role === UserRole.PARENT) {
      const verifiedRelation = await this.prisma.parentStudentRelation.findFirst({
        where: {
          schoolId,
          parentId: user.id,
          studentId: student.id,
          isVerified: true,
        },
      });

      if (!verifiedRelation) {
        throw new ForbiddenException(
          'Access denied: You are not authorized to view this student fee statement',
        );
      }
    }

    // 3. Resolve target academic year
    const targetAcademicYearId = academicYearId || student.academicYearId;
    const academicYear = await this.prisma.academicYear.findUnique({
      where: {
        schoolId_id: { schoolId, id: targetAcademicYearId },
      },
    });

    if (!academicYear) {
      throw new NotFoundException(`Academic year ${targetAcademicYearId} not found in this school`);
    }

    // 4. Fetch fee allocation
    const allocation = await this.prisma.studentFeeAllocation.findUnique({
      where: {
        schoolId_studentId_academicYearId: {
          schoolId,
          studentId,
          academicYearId: targetAcademicYearId,
        },
      },
      include: {
        feeStructure: true,
      },
    });

    // 5. Fetch generated invoices
    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        schoolId,
        studentId,
        academicYearId: targetAcademicYearId,
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { billingMonth: 'asc' },
    });

    let totalGross = new Prisma.Decimal(0);
    let totalDiscount = new Prisma.Decimal(0);
    let totalNet = new Prisma.Decimal(0);
    const statusBreakdown = {
      UPCOMING: 0,
      DUE: 0,
      OVERDUE: 0,
      VOID: 0,
    };

    const formattedInvoices = invoices.map((inv) => {
      const derivedStatus = this.deriveCurrentInvoiceStatus(inv.status, inv.dueDate);
      statusBreakdown[derivedStatus] = (statusBreakdown[derivedStatus] || 0) + 1;

      totalGross = totalGross.add(inv.grossAmount);
      totalDiscount = totalDiscount.add(inv.discountAmount);
      totalNet = totalNet.add(inv.netAmount);

      return {
        id: inv.id,
        schoolId: inv.schoolId,
        studentId: inv.studentId,
        academicYearId: inv.academicYearId,
        billingMonth: inv.billingMonth,
        monthName: BILLING_MONTH_NAMES[inv.billingMonth - 1] || `Month ${inv.billingMonth}`,
        dueDate: inv.dueDate,
        grossAmount: Number(inv.grossAmount),
        discountAmount: Number(inv.discountAmount),
        netAmount: Number(inv.netAmount),
        status: derivedStatus,
        storedStatus: inv.status,
        generatedAt: inv.generatedAt,
        items: inv.items.map((item) => ({
          id: item.id,
          feeHeadId: item.feeHeadId,
          feeHeadNameSnapshot: item.feeHeadNameSnapshot,
          billingFrequencySnapshot: item.billingFrequencySnapshot,
          grossAmount: Number(item.grossAmount),
          discountAmount: Number(item.discountAmount),
          netAmount: Number(item.netAmount),
          createdAt: item.createdAt,
        })),
      };
    });

    return {
      student: {
        id: student.id,
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        fullName: `${student.firstName} ${student.lastName}`,
        grade: student.grade?.name,
        section: student.section?.name,
        status: student.status,
        guardianName: student.guardianName,
        guardianEmail: student.guardianEmail,
        guardianPhone: student.guardianPhone,
      },
      academicYear: {
        id: academicYear.id,
        name: academicYear.name,
        startDate: academicYear.startDate,
        endDate: academicYear.endDate,
      },
      allocation: allocation
        ? {
            id: allocation.id,
            feeStructureId: allocation.feeStructureId,
            feeStructureName: allocation.feeStructure.name,
            concessionType: allocation.concessionType,
            concessionValue: Number(allocation.concessionValue),
            startBillingMonth: allocation.startBillingMonth,
            optedFeeHeadIds: allocation.optedFeeHeadIds,
            status: allocation.status,
          }
        : null,
      summary: {
        totalGrossAmount: totalGross.toDecimalPlaces(2).toNumber(),
        totalDiscountAmount: totalDiscount.toDecimalPlaces(2).toNumber(),
        totalNetAmount: totalNet.toDecimalPlaces(2).toNumber(),
        invoiceCount: formattedInvoices.length,
        statusBreakdown,
      },
      invoices: formattedInvoices,
    };
  }
}
