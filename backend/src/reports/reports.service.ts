import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  AllocationType,
  FeeHeadCategory,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReceiptStatus,
  RefundStatus,
  School,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportConfigService } from './report-config.service';
import { DailyCollectionQueryDto } from './dto/daily-collection-query.dto';
import { MonthlyCollectionQueryDto } from './dto/monthly-collection-query.dto';
import { CollectionSummaryQueryDto } from './dto/collection-summary-query.dto';
import {
  OutstandingDuesQueryDto,
  DuesSortField,
  SortDirection,
} from './dto/outstanding-dues-query.dto';
import { ClassCollectionQueryDto } from './dto/class-collection-query.dto';
import { FineSummaryQueryDto } from './dto/fine-summary-query.dto';
import { ReportType } from './dto/report-config.dto';

export interface MethodSummary {
  method: PaymentMethod;
  grossAmount: number;
  reversals: number;
  refunds: number;
  netAmount: number;
  count: number;
}

export interface FeeHeadSummary {
  feeHeadId: string;
  name: string;
  category: string;
  grossAmount: number;
  reversals: number;
  refunds: number;
  netAmount: number;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reportConfigService: ReportConfigService,
  ) {}

  /**
   * Generates a daily collection report for the target school.
   */
  async getDailyCollection(school: School, query: DailyCollectionQueryDto) {
    const timeZone = school.timezone || 'Asia/Kolkata';
    const dateStr = query.date || this.getTodayIsoInTimezone(timeZone);

    const { startUtc, endUtc } = this.getLocalDayBoundariesUtc(dateStr, timeZone);

    const {
      payments,
      reversals,
      refunds,
      grossTotal,
      reversalTotal,
      refundTotal,
      netTotal,
      byPaymentMethod,
      byFeeHead,
    } = await this.aggregateCollectionData({
      schoolId: school.id,
      startUtc,
      endUtc,
      academicYearId: query.academicYearId,
      paymentMethod: query.paymentMethod,
    });

    const transactions = payments.map((p) => {
      const studentName = `${p.student.firstName} ${p.student.lastName || ''}`.trim();
      return {
        paymentId: p.id,
        paymentNumber: p.paymentNumber,
        receiptNumber: p.receipt?.receiptNumber || null,
        receiptStatus: p.receipt?.status || null,
        student: {
          id: p.student.id,
          admissionNumber: p.student.admissionNumber,
          name: studentName,
          grade: p.student.grade?.name || null,
          section: p.student.section?.name || null,
        },
        paymentDate: p.paymentDate,
        amount: Number(p.amount.toFixed(2)),
        paymentMethod: p.paymentMethod,
        referenceNumber: p.referenceNumber || p.chequeNumber || null,
        status: p.status,
        collectedBy: p.collectedByUser?.name || null,
      };
    });

    const config = this.reportConfigService.getReportConfig(
      school,
      ReportType.DAILY_COLLECTION,
    );

    return {
      school: {
        id: school.id,
        name: school.name,
        currency: school.currency,
        timezone: timeZone,
      },
      period: {
        date: dateStr,
        startDateTime: startUtc.toISOString(),
        endDateTime: endUtc.toISOString(),
      },
      summary: {
        grossCollections: Number(grossTotal.toFixed(2)),
        totalReversals: Number(reversalTotal.toFixed(2)),
        totalRefunds: Number(refundTotal.toFixed(2)),
        netCollections: Number(netTotal.toFixed(2)),
        transactionCount: payments.length,
        receiptCount: payments.filter(
          (p) => p.receipt != null && p.receipt.status === ReceiptStatus.ACTIVE,
        ).length,
        cancelledReceiptCount: payments.filter(
          (p) => p.receipt != null && p.receipt.status === ReceiptStatus.CANCELLED,
        ).length,
        reversalCount: reversals.length,
        refundCount: refunds.length,
      },
      byPaymentMethod,
      byFeeHead,
      transactions,
      config,
    };
  }

  /**
   * Generates a monthly collection summary with daily breakdowns.
   */
  async getMonthlyCollection(school: School, query: MonthlyCollectionQueryDto) {
    const timeZone = school.timezone || 'Asia/Kolkata';

    let year = query.year;
    let month = query.month;

    if (!year || !month) {
      const todayIso = this.getTodayIsoInTimezone(timeZone);
      const [todayYear, todayMonth] = todayIso.split('-').map((v) => parseInt(v, 10));
      year = year || todayYear;
      month = month || todayMonth;
    }

    const { startUtc, endUtc, daysInMonth } = this.getLocalMonthBoundariesUtc(
      year,
      month,
      timeZone,
    );

    const {
      payments,
      reversals,
      refunds,
      grossTotal,
      reversalTotal,
      refundTotal,
      netTotal,
      byPaymentMethod,
      byFeeHead,
    } = await this.aggregateCollectionData({
      schoolId: school.id,
      startUtc,
      endUtc,
      academicYearId: query.academicYearId,
      paymentMethod: query.paymentMethod,
    });

    // Compute daily trend for every day in the month
    const dailyTrendMap = new Map<
      string,
      {
        gross: Prisma.Decimal;
        reversals: Prisma.Decimal;
        refunds: Prisma.Decimal;
        count: number;
      }
    >();

    for (let d = 1; d <= daysInMonth; d++) {
      const dayIso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      dailyTrendMap.set(dayIso, {
        gross: new Prisma.Decimal(0),
        reversals: new Prisma.Decimal(0),
        refunds: new Prisma.Decimal(0),
        count: 0,
      });
    }

    for (const p of payments) {
      const dayIso = this.formatDateInTimezone(p.paymentDate, timeZone);
      const entry = dailyTrendMap.get(dayIso);
      if (entry) {
        entry.gross = entry.gross.add(p.amount);
        entry.count += 1;
      }
    }

    for (const rev of reversals) {
      const dayIso = this.formatDateInTimezone(rev.createdAt, timeZone);
      const entry = dailyTrendMap.get(dayIso);
      if (entry) {
        entry.reversals = entry.reversals.add(rev.totalAmount);
      }
    }

    for (const ref of refunds) {
      const dateToUse = ref.processedAt || ref.refundDate;
      const dayIso = this.formatDateInTimezone(dateToUse, timeZone);
      const entry = dailyTrendMap.get(dayIso);
      if (entry) {
        entry.refunds = entry.refunds.add(ref.refundAmount);
      }
    }

    const dailyBreakdown = Array.from(dailyTrendMap.entries()).map(([date, data]) => {
      const net = data.gross.sub(data.reversals).sub(data.refunds);
      return {
        date,
        grossCollections: Number(data.gross.toFixed(2)),
        totalReversals: Number(data.reversals.toFixed(2)),
        totalRefunds: Number(data.refunds.toFixed(2)),
        netCollections: Number(net.toFixed(2)),
        transactionCount: data.count,
      };
    });

    const config = this.reportConfigService.getReportConfig(
      school,
      ReportType.MONTHLY_COLLECTION,
    );

    return {
      school: {
        id: school.id,
        name: school.name,
        currency: school.currency,
        timezone: timeZone,
      },
      period: {
        year,
        month,
        startDateTime: startUtc.toISOString(),
        endDateTime: endUtc.toISOString(),
        daysInMonth,
      },
      summary: {
        grossCollections: Number(grossTotal.toFixed(2)),
        totalReversals: Number(reversalTotal.toFixed(2)),
        totalRefunds: Number(refundTotal.toFixed(2)),
        netCollections: Number(netTotal.toFixed(2)),
        transactionCount: payments.length,
        receiptCount: payments.filter(
          (p) => p.receipt != null && p.receipt.status === ReceiptStatus.ACTIVE,
        ).length,
        cancelledReceiptCount: payments.filter(
          (p) => p.receipt != null && p.receipt.status === ReceiptStatus.CANCELLED,
        ).length,
        reversalCount: reversals.length,
        refundCount: refunds.length,
      },
      byPaymentMethod,
      byFeeHead,
      dailyBreakdown,
      config,
    };
  }

  /**
   * Generates a date-range collection summary.
   */
  async getCollectionSummary(school: School, query: CollectionSummaryQueryDto) {
    const timeZone = school.timezone || 'Asia/Kolkata';

    const { startUtc } = this.getLocalDayBoundariesUtc(query.startDate, timeZone);
    const { endUtc } = this.getLocalDayBoundariesUtc(query.endDate, timeZone);

    if (startUtc > endUtc) {
      throw new BadRequestException('startDate cannot be after endDate');
    }

    const diffMs = endUtc.getTime() - startUtc.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 366) {
      throw new BadRequestException('Date range cannot exceed 366 days');
    }

    const {
      payments,
      reversals,
      refunds,
      grossTotal,
      reversalTotal,
      refundTotal,
      netTotal,
      byPaymentMethod,
      byFeeHead,
    } = await this.aggregateCollectionData({
      schoolId: school.id,
      startUtc,
      endUtc,
      academicYearId: query.academicYearId,
      paymentMethod: query.paymentMethod,
    });

    // Bucket trends: by day if <= 31 days, otherwise by month (YYYY-MM)
    const isDailyBucketing = diffDays <= 31;
    const trendMap = new Map<
      string,
      {
        gross: Prisma.Decimal;
        reversals: Prisma.Decimal;
        refunds: Prisma.Decimal;
        count: number;
      }
    >();

    const getBucketKey = (date: Date): string => {
      const iso = this.formatDateInTimezone(date, timeZone);
      return isDailyBucketing ? iso : iso.substring(0, 7);
    };

    for (const p of payments) {
      const key = getBucketKey(p.paymentDate);
      const entry = trendMap.get(key) || {
        gross: new Prisma.Decimal(0),
        reversals: new Prisma.Decimal(0),
        refunds: new Prisma.Decimal(0),
        count: 0,
      };
      entry.gross = entry.gross.add(p.amount);
      entry.count += 1;
      trendMap.set(key, entry);
    }

    for (const rev of reversals) {
      const key = getBucketKey(rev.createdAt);
      const entry = trendMap.get(key) || {
        gross: new Prisma.Decimal(0),
        reversals: new Prisma.Decimal(0),
        refunds: new Prisma.Decimal(0),
        count: 0,
      };
      entry.reversals = entry.reversals.add(rev.totalAmount);
      trendMap.set(key, entry);
    }

    for (const ref of refunds) {
      const dateToUse = ref.processedAt || ref.refundDate;
      const key = getBucketKey(dateToUse);
      const entry = trendMap.get(key) || {
        gross: new Prisma.Decimal(0),
        reversals: new Prisma.Decimal(0),
        refunds: new Prisma.Decimal(0),
        count: 0,
      };
      entry.refunds = entry.refunds.add(ref.refundAmount);
      trendMap.set(key, entry);
    }

    const periodicBreakdown = Array.from(trendMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, data]) => {
        const net = data.gross.sub(data.reversals).sub(data.refunds);
        return {
          period,
          grossCollections: Number(data.gross.toFixed(2)),
          totalReversals: Number(data.reversals.toFixed(2)),
          totalRefunds: Number(data.refunds.toFixed(2)),
          netCollections: Number(net.toFixed(2)),
          transactionCount: data.count,
        };
      });

    const config = this.reportConfigService.getReportConfig(
      school,
      ReportType.COLLECTION_SUMMARY,
    );

    return {
      school: {
        id: school.id,
        name: school.name,
        currency: school.currency,
        timezone: timeZone,
      },
      period: {
        startDate: query.startDate,
        endDate: query.endDate,
        startDateTime: startUtc.toISOString(),
        endDateTime: endUtc.toISOString(),
        totalDays: diffDays,
        bucketType: isDailyBucketing ? 'DAILY' : 'MONTHLY',
      },
      summary: {
        grossCollections: Number(grossTotal.toFixed(2)),
        totalReversals: Number(reversalTotal.toFixed(2)),
        totalRefunds: Number(refundTotal.toFixed(2)),
        netCollections: Number(netTotal.toFixed(2)),
        transactionCount: payments.length,
        receiptCount: payments.filter(
          (p) => p.receipt != null && p.receipt.status === ReceiptStatus.ACTIVE,
        ).length,
        cancelledReceiptCount: payments.filter(
          (p) => p.receipt != null && p.receipt.status === ReceiptStatus.CANCELLED,
        ).length,
        reversalCount: reversals.length,
        refundCount: refunds.length,
      },
      byPaymentMethod,
      byFeeHead,
      periodicBreakdown,
      config,
    };
  }

  /**
   * Generates tenant-safe outstanding dues and defaulters report.
   */
  async getOutstandingDues(school: School, query: OutstandingDuesQueryDto) {
    const timeZone = school.timezone || 'Asia/Kolkata';

    // 1. Resolve Academic Year
    let targetAcademicYearId = query.academicYearId;
    let academicYear: any = null;
    if (targetAcademicYearId) {
      academicYear = await this.prisma.academicYear.findFirst({
        where: { schoolId: school.id, id: targetAcademicYearId },
      });
      if (!academicYear) {
        throw new BadRequestException(
          `Academic year ${targetAcademicYearId} not found in this school`,
        );
      }
    } else {
      academicYear = await this.prisma.academicYear.findFirst({
        where: { schoolId: school.id, isCurrent: true },
      });
      if (academicYear) {
        targetAcademicYearId = academicYear.id;
      }
    }

    // 2. Query students belonging to this school
    const studentsWhere: Prisma.StudentWhereInput = {
      schoolId: school.id,
      ...(targetAcademicYearId ? { academicYearId: targetAcademicYearId } : {}),
      ...(query.gradeId ? { gradeId: query.gradeId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
    };

    if (query.search && query.search.trim().length > 0) {
      const searchTerm = query.search.trim();
      studentsWhere.OR = [
        { firstName: { contains: searchTerm, mode: 'insensitive' } },
        { lastName: { contains: searchTerm, mode: 'insensitive' } },
        { admissionNumber: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const students = await this.prisma.student.findMany({
      where: studentsWhere,
      include: {
        grade: true,
        section: true,
        invoices: {
          where: {
            schoolId: school.id,
            status: { not: InvoiceStatus.VOID },
            ...(targetAcademicYearId ? { academicYearId: targetAcademicYearId } : {}),
          },
          include: {
            paymentAllocations: {
              include: {
                refundAllocations: {
                  include: {
                    paymentRefund: { select: { status: true } },
                  },
                },
              },
            },
            assessedFines: {
              include: {
                allocations: {
                  include: {
                    refundAllocations: {
                      include: {
                        paymentRefund: { select: { status: true } },
                      },
                    },
                  },
                },
                waivers: true,
              },
            },
          },
          orderBy: { dueDate: 'asc' },
        },
      },
      orderBy: [{ grade: { code: 'asc' } }, { admissionNumber: 'asc' }],
    });

    const now = new Date();

    // 3. Calculate balance and dues per student
    let studentRecords = students.map((student) => {
      let totalGross = new Prisma.Decimal(0);
      let totalDiscount = new Prisma.Decimal(0);
      let totalBilled = new Prisma.Decimal(0);
      let totalPaidPrincipal = new Prisma.Decimal(0);
      let totalRemainingPrincipal = new Prisma.Decimal(0);
      let totalAssessedFines = new Prisma.Decimal(0);
      let totalWaivedFines = new Prisma.Decimal(0);
      let totalPaidFines = new Prisma.Decimal(0);
      let totalRemainingFines = new Prisma.Decimal(0);
      let overduePrincipal = new Prisma.Decimal(0);
      let overdueFines = new Prisma.Decimal(0);
      let overdueAmount = new Prisma.Decimal(0);
      let overdueInvoicesCount = 0;
      let maxOverdueDays = 0;

      for (const inv of student.invoices) {
        totalGross = totalGross.add(inv.grossAmount);
        totalDiscount = totalDiscount.add(inv.discountAmount);
        totalBilled = totalBilled.add(inv.netAmount);

        // Principal calculations
        let invPaidPrincipal = new Prisma.Decimal(0);
        for (const alloc of inv.paymentAllocations) {
          if (alloc.invoiceItemId) {
            if (alloc.allocationType === AllocationType.PRINCIPAL) {
              invPaidPrincipal = invPaidPrincipal.add(alloc.allocatedAmount);
              if (alloc.refundAllocations) {
                for (const ra of alloc.refundAllocations) {
                  if (ra.paymentRefund.status === RefundStatus.SUCCEEDED) {
                    invPaidPrincipal = invPaidPrincipal.sub(ra.amount);
                  }
                }
              }
            } else if (alloc.allocationType === AllocationType.REVERSAL) {
              invPaidPrincipal = invPaidPrincipal.sub(alloc.allocatedAmount);
            }
          }
        }
        invPaidPrincipal = Prisma.Decimal.max(new Prisma.Decimal(0), invPaidPrincipal);
        totalPaidPrincipal = totalPaidPrincipal.add(invPaidPrincipal);

        const invNet = new Prisma.Decimal(inv.netAmount);
        const invRemainingPrincipal = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          invNet.sub(invPaidPrincipal),
        );
        totalRemainingPrincipal = totalRemainingPrincipal.add(invRemainingPrincipal);

        // Fines calculations
        let invAssessedFines = new Prisma.Decimal(0);
        let invWaivedFines = new Prisma.Decimal(0);
        let invPaidFines = new Prisma.Decimal(0);
        let invRemainingFines = new Prisma.Decimal(0);

        for (const fine of inv.assessedFines) {
          invAssessedFines = invAssessedFines.add(fine.assessedAmount);

          let fineWaived = new Prisma.Decimal(0);
          for (const w of fine.waivers) {
            fineWaived = fineWaived.add(w.waivedAmount);
          }
          invWaivedFines = invWaivedFines.add(fineWaived);

          let finePaid = new Prisma.Decimal(0);
          for (const fa of fine.allocations) {
            if (fa.allocationType === AllocationType.FINE) {
              finePaid = finePaid.add(fa.allocatedAmount);
              if (fa.refundAllocations) {
                for (const ra of fa.refundAllocations) {
                  if (ra.paymentRefund.status === RefundStatus.SUCCEEDED) {
                    finePaid = finePaid.sub(ra.amount);
                  }
                }
              }
            } else if (fa.allocationType === AllocationType.REVERSAL) {
              finePaid = finePaid.sub(fa.allocatedAmount);
            }
          }
          finePaid = Prisma.Decimal.max(new Prisma.Decimal(0), finePaid);
          invPaidFines = invPaidFines.add(finePaid);

          const fineRemaining = Prisma.Decimal.max(
            new Prisma.Decimal(0),
            new Prisma.Decimal(fine.assessedAmount).sub(fineWaived).sub(finePaid),
          );
          invRemainingFines = invRemainingFines.add(fineRemaining);
        }

        totalAssessedFines = totalAssessedFines.add(invAssessedFines);
        totalWaivedFines = totalWaivedFines.add(invWaivedFines);
        totalPaidFines = totalPaidFines.add(invPaidFines);
        totalRemainingFines = totalRemainingFines.add(invRemainingFines);

        const invOutstanding = invRemainingPrincipal.add(invRemainingFines);

        // Overdue status check
        const isOverdue = inv.dueDate < now && invOutstanding.greaterThan(0);
        if (isOverdue) {
          overdueAmount = overdueAmount.add(invOutstanding);
          overduePrincipal = overduePrincipal.add(invRemainingPrincipal);
          overdueFines = overdueFines.add(invRemainingFines);
          overdueInvoicesCount += 1;
          const days = Math.max(
            0,
            Math.floor((now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
          );
          if (days > maxOverdueDays) {
            maxOverdueDays = days;
          }
        }
      }

      const totalPaid = totalPaidPrincipal.add(totalPaidFines);
      const outstandingBalance = totalRemainingPrincipal.add(totalRemainingFines);

      return {
        studentId: student.id,
        admissionNumber: student.admissionNumber,
        rollNumber: student.rollNumber || null,
        studentName: `${student.firstName} ${student.lastName || ''}`.trim(),
        grade: {
          id: student.grade?.id || student.gradeId,
          name: student.grade?.name || 'Unknown',
          code: student.grade?.code || '',
        },
        section: {
          id: student.section?.id || student.sectionId,
          name: student.section?.name || 'Unknown',
        },
        guardian: {
          name: student.guardianName || null,
          phone: student.guardianPhone || null,
          email: student.guardianEmail || null,
        },
        status: student.status,
        totalBilled: Number(totalBilled.toFixed(2)),
        grossAmount: Number(totalGross.toFixed(2)),
        discountAmount: Number(totalDiscount.toFixed(2)),
        totalPaid: Number(totalPaid.toFixed(2)),
        paidPrincipal: Number(totalPaidPrincipal.toFixed(2)),
        paidFines: Number(totalPaidFines.toFixed(2)),
        remainingPrincipal: Number(totalRemainingPrincipal.toFixed(2)),
        fineBalance: Number(totalRemainingFines.toFixed(2)),
        outstandingBalance: Number(outstandingBalance.toFixed(2)),
        overduePrincipal: Number(overduePrincipal.toFixed(2)),
        overdueFines: Number(overdueFines.toFixed(2)),
        overdueAmount: Number(overdueAmount.toFixed(2)),
        overdueInvoicesCount,
        maxOverdueDays,
        hasOverdue: overdueInvoicesCount > 0,
        invoiceCount: student.invoices.length,
      };
    });

    // 4. Apply optional filters
    if (query.onlyWithDues) {
      studentRecords = studentRecords.filter((s) => s.outstandingBalance > 0);
    }
    if (query.minOverdueDays && query.minOverdueDays > 0) {
      studentRecords = studentRecords.filter(
        (s) => s.maxOverdueDays >= (query.minOverdueDays as number),
      );
    }

    // 5. Deterministic sorting
    const sortBy = query.sortBy || DuesSortField.OUTSTANDING_BALANCE;
    const sortOrder = query.sortOrder || SortDirection.DESC;

    studentRecords.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case DuesSortField.OUTSTANDING_BALANCE:
          comparison = a.outstandingBalance - b.outstandingBalance;
          break;
        case DuesSortField.MAX_OVERDUE_DAYS:
          comparison = a.maxOverdueDays - b.maxOverdueDays;
          break;
        case DuesSortField.ADMISSION_NUMBER:
          comparison = a.admissionNumber.localeCompare(b.admissionNumber);
          break;
        case DuesSortField.STUDENT_NAME:
          comparison = a.studentName.localeCompare(b.studentName);
          break;
        case DuesSortField.TOTAL_BILLED:
          comparison = a.totalBilled - b.totalBilled;
          break;
        case DuesSortField.TOTAL_PAID:
          comparison = a.totalPaid - b.totalPaid;
          break;
        case DuesSortField.OVERDUE_AMOUNT:
          comparison = a.overdueAmount - b.overdueAmount;
          break;
      }

      if (sortOrder === SortDirection.DESC) {
        comparison = -comparison;
      }

      // Secondary tiebreaker
      if (comparison === 0) {
        const admCmp = a.admissionNumber.localeCompare(b.admissionNumber);
        if (admCmp !== 0) return admCmp;
        return a.studentId.localeCompare(b.studentId);
      }

      return comparison;
    });

    // 6. Pagination
    const page = Math.max(1, query.page || 1);
    const maxAllowedLimit = (query as any).isExport || (query.limit && query.limit > 100) ? 10000 : 100;
    const defaultLimit = (query as any).isExport ? 10000 : 20;
    const limit = Math.max(1, Math.min(maxAllowedLimit, query.limit || defaultLimit));
    const totalRecords = studentRecords.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
    const paginatedRecords = studentRecords.slice((page - 1) * limit, page * limit);

    // 7. Overall Summary across all matching records
    const totalBilledAll = studentRecords.reduce((acc, s) => acc + s.totalBilled, 0);
    const totalPaidAll = studentRecords.reduce((acc, s) => acc + s.totalPaid, 0);
    const totalPaidPrincipalAll = studentRecords.reduce((acc, s) => acc + s.paidPrincipal, 0);
    const totalPaidFinesAll = studentRecords.reduce((acc, s) => acc + s.paidFines, 0);
    const totalRemainingPrincipalAll = studentRecords.reduce((acc, s) => acc + s.remainingPrincipal, 0);
    const totalFineBalanceAll = studentRecords.reduce((acc, s) => acc + s.fineBalance, 0);
    const totalOutstandingAll = studentRecords.reduce((acc, s) => acc + s.outstandingBalance, 0);
    const totalOverduePrincipalAll = studentRecords.reduce((acc, s) => acc + s.overduePrincipal, 0);
    const totalOverdueFinesAll = studentRecords.reduce((acc, s) => acc + s.overdueFines, 0);
    const totalOverdueAmountAll = studentRecords.reduce((acc, s) => acc + s.overdueAmount, 0);
    const overdueStudentsCount = studentRecords.filter((s) => s.overdueInvoicesCount > 0).length;

    const config = this.reportConfigService.getReportConfig(
      school,
      ReportType.OUTSTANDING_DUES,
    );

    return {
      school: {
        id: school.id,
        name: school.name,
        currency: school.currency,
        timezone: timeZone,
      },
      filters: {
        academicYearId: targetAcademicYearId || null,
        academicYearName: academicYear?.name || null,
        gradeId: query.gradeId || null,
        sectionId: query.sectionId || null,
        search: query.search || null,
        minOverdueDays: query.minOverdueDays || null,
        onlyWithDues: Boolean(query.onlyWithDues),
      },
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      summary: {
        totalStudents: totalRecords,
        totalBilledAmount: Number(totalBilledAll.toFixed(2)),
        totalPaidAmount: Number(totalPaidAll.toFixed(2)),
        totalPaidPrincipal: Number(totalPaidPrincipalAll.toFixed(2)),
        totalPaidFines: Number(totalPaidFinesAll.toFixed(2)),
        totalRemainingPrincipal: Number(totalRemainingPrincipalAll.toFixed(2)),
        totalFineBalance: Number(totalFineBalanceAll.toFixed(2)),
        totalOutstandingAmount: Number(totalOutstandingAll.toFixed(2)),
        totalOverduePrincipal: Number(totalOverduePrincipalAll.toFixed(2)),
        totalOverdueFines: Number(totalOverdueFinesAll.toFixed(2)),
        totalOverdueAmount: Number(totalOverdueAmountAll.toFixed(2)),
        overdueStudentsCount,
      },
      records: paginatedRecords,
      config,
    };
  }

  /**
   * Generates fee defaulters and overdue aging report.
   */
  async getDefaultersReport(school: School, query: OutstandingDuesQueryDto) {
    const minDays = query.minOverdueDays !== undefined ? query.minOverdueDays : 1;
    const duesResult = await this.getOutstandingDues(school, {
      ...query,
      onlyWithDues: true,
      minOverdueDays: minDays,
      sortBy: query.sortBy || DuesSortField.OVERDUE_AMOUNT,
    });

    const config = this.reportConfigService.getReportConfig(
      school,
      ReportType.DEFAULTER_REPORT,
    );

    return {
      ...duesResult,
      config,
    };
  }

  /**
   * Generates fine summaries with class-wise, status, and rule breakdowns.
   */
  async getFineSummary(school: School, query: FineSummaryQueryDto) {
    const timeZone = school.timezone || 'Asia/Kolkata';

    // 1. Resolve Academic Year
    let targetAcademicYearId = query.academicYearId;
    let academicYear: any = null;
    if (targetAcademicYearId) {
      academicYear = await this.prisma.academicYear.findFirst({
        where: { schoolId: school.id, id: targetAcademicYearId },
      });
      if (!academicYear) {
        throw new BadRequestException(
          `Academic year ${targetAcademicYearId} not found in this school`,
        );
      }
    } else {
      academicYear = await this.prisma.academicYear.findFirst({
        where: { schoolId: school.id, isCurrent: true },
      });
      if (academicYear) {
        targetAcademicYearId = academicYear.id;
      }
    }

    // 2. Resolve optional date boundaries
    let startUtc: Date | undefined;
    let endUtc: Date | undefined;
    let startDateStr: string | null = null;
    let endDateStr: string | null = null;

    if (query.startDate && query.endDate) {
      startDateStr = query.startDate;
      endDateStr = query.endDate;
      const bStart = this.getLocalDayBoundariesUtc(startDateStr, timeZone);
      const bEnd = this.getLocalDayBoundariesUtc(endDateStr, timeZone);
      startUtc = bStart.startUtc;
      endUtc = bEnd.endUtc;

      if (startUtc > endUtc) {
        throw new BadRequestException('startDate cannot be after endDate');
      }
    } else if (query.startDate || query.endDate) {
      throw new BadRequestException(
        'Both startDate and endDate must be provided together',
      );
    }

    // 3. Build Prisma query for AssessedFine
    const invoiceWhere: Prisma.FeeInvoiceWhereInput = {
      schoolId: school.id,
      status: { not: InvoiceStatus.VOID },
      ...(targetAcademicYearId ? { academicYearId: targetAcademicYearId } : {}),
    };

    if (query.gradeId || query.sectionId) {
      invoiceWhere.student = {
        ...(query.gradeId ? { gradeId: query.gradeId } : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      };
    }

    const finesWhere: Prisma.AssessedFineWhereInput = {
      schoolId: school.id,
      invoice: invoiceWhere,
    };

    if (query.fineRuleId) {
      finesWhere.fineRuleId = query.fineRuleId;
    }

    if (startUtc && endUtc) {
      finesWhere.createdAt = { gte: startUtc, lte: endUtc };
    }

    // 4. Fetch classes and sections for class breakdown initialization
    const grades = await this.prisma.gradeClass.findMany({
      where: {
        schoolId: school.id,
        ...(query.gradeId ? { id: query.gradeId } : {}),
      },
      include: {
        sections: {
          where: {
            ...(query.sectionId ? { id: query.sectionId } : {}),
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { code: 'asc' },
    });

    const classMap = new Map<
      string,
      {
        gradeId: string;
        gradeName: string;
        gradeCode: string;
        sectionId: string;
        sectionName: string;
        totalAssessed: Prisma.Decimal;
        totalWaived: Prisma.Decimal;
        totalCollected: Prisma.Decimal;
        totalReversals: Prisma.Decimal;
        totalRefunds: Prisma.Decimal;
        count: number;
      }
    >();

    for (const g of grades) {
      for (const s of g.sections) {
        const key = `${g.id}:${s.id}`;
        classMap.set(key, {
          gradeId: g.id,
          gradeName: g.name,
          gradeCode: g.code,
          sectionId: s.id,
          sectionName: s.name,
          totalAssessed: new Prisma.Decimal(0),
          totalWaived: new Prisma.Decimal(0),
          totalCollected: new Prisma.Decimal(0),
          totalReversals: new Prisma.Decimal(0),
          totalRefunds: new Prisma.Decimal(0),
          count: 0,
        });
      }
    }

    // 5. Query assessed fines with relations
    const fines = await this.prisma.assessedFine.findMany({
      where: finesWhere,
      include: {
        invoice: {
          include: {
            student: {
              include: { grade: true, section: true },
            },
          },
        },
        waivers: true,
        allocations: {
          include: {
            refundAllocations: {
              include: {
                paymentRefund: { select: { status: true } },
              },
            },
          },
        },
        fineRule: {
          select: { id: true, name: true, fineType: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // 6. Aggregators
    let overallAssessed = new Prisma.Decimal(0);
    let overallWaived = new Prisma.Decimal(0);
    let overallCollected = new Prisma.Decimal(0);
    let overallReversals = new Prisma.Decimal(0);
    let overallRefunds = new Prisma.Decimal(0);

    const statusMap = new Map<
      string,
      {
        count: number;
        totalAssessed: Prisma.Decimal;
        remainingBalance: Prisma.Decimal;
      }
    >();

    const ruleMap = new Map<
      string,
      {
        ruleId: string | null;
        ruleName: string;
        count: number;
        totalAssessed: Prisma.Decimal;
        remainingBalance: Prisma.Decimal;
      }
    >();

    for (const fine of fines) {
      const assessed = new Prisma.Decimal(fine.assessedAmount);
      overallAssessed = overallAssessed.add(assessed);

      let fineWaived = new Prisma.Decimal(0);
      for (const w of fine.waivers) {
        fineWaived = fineWaived.add(w.waivedAmount);
      }
      overallWaived = overallWaived.add(fineWaived);

      let fineCollected = new Prisma.Decimal(0);
      let fineRev = new Prisma.Decimal(0);
      let fineRef = new Prisma.Decimal(0);

      for (const alloc of fine.allocations) {
        if (alloc.allocationType === AllocationType.FINE) {
          fineCollected = fineCollected.add(alloc.allocatedAmount);
          if (alloc.refundAllocations) {
            for (const ra of alloc.refundAllocations) {
              if (ra.paymentRefund.status === RefundStatus.SUCCEEDED) {
                fineRef = fineRef.add(ra.amount);
              }
            }
          }
        } else if (alloc.allocationType === AllocationType.REVERSAL) {
          fineRev = fineRev.add(alloc.allocatedAmount);
        }
      }

      overallCollected = overallCollected.add(fineCollected);
      overallReversals = overallReversals.add(fineRev);
      overallRefunds = overallRefunds.add(fineRef);

      const netPaidFine = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        fineCollected.sub(fineRev).sub(fineRef),
      );
      const remainingBalance = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        assessed.sub(fineWaived).sub(netPaidFine),
      );

      // Class bucket
      const student = fine.invoice?.student;
      if (student) {
        const gId = student.gradeId;
        const sId = student.sectionId;
        const classKey = `${gId}:${sId}`;
        let bucket = classMap.get(classKey);
        if (!bucket) {
          bucket = {
            gradeId: gId,
            gradeName: student.grade?.name || 'Unknown Grade',
            gradeCode: student.grade?.code || '',
            sectionId: sId,
            sectionName: student.section?.name || 'Unknown Section',
            totalAssessed: new Prisma.Decimal(0),
            totalWaived: new Prisma.Decimal(0),
            totalCollected: new Prisma.Decimal(0),
            totalReversals: new Prisma.Decimal(0),
            totalRefunds: new Prisma.Decimal(0),
            count: 0,
          };
          classMap.set(classKey, bucket);
        }
        bucket.totalAssessed = bucket.totalAssessed.add(assessed);
        bucket.totalWaived = bucket.totalWaived.add(fineWaived);
        bucket.totalCollected = bucket.totalCollected.add(fineCollected);
        bucket.totalReversals = bucket.totalReversals.add(fineRev);
        bucket.totalRefunds = bucket.totalRefunds.add(fineRef);
        bucket.count += 1;
      }

      // Status breakdown
      const statusKey = fine.status;
      const sEntry = statusMap.get(statusKey) || {
        count: 0,
        totalAssessed: new Prisma.Decimal(0),
        remainingBalance: new Prisma.Decimal(0),
      };
      sEntry.count += 1;
      sEntry.totalAssessed = sEntry.totalAssessed.add(assessed);
      sEntry.remainingBalance = sEntry.remainingBalance.add(remainingBalance);
      statusMap.set(statusKey, sEntry);

      // Rule breakdown
      const ruleKey = fine.fineRuleId || 'CUSTOM';
      const ruleName = fine.fineRule?.name || 'Manual / Custom Fine';
      const rEntry = ruleMap.get(ruleKey) || {
        ruleId: fine.fineRuleId || null,
        ruleName,
        count: 0,
        totalAssessed: new Prisma.Decimal(0),
        remainingBalance: new Prisma.Decimal(0),
      };
      rEntry.count += 1;
      rEntry.totalAssessed = rEntry.totalAssessed.add(assessed);
      rEntry.remainingBalance = rEntry.remainingBalance.add(remainingBalance);
      ruleMap.set(ruleKey, rEntry);
    }

    // 7. Format byClass array deterministically
    const byClass = Array.from(classMap.values())
      .sort((a, b) => {
        const gradeCmp = (a.gradeCode || a.gradeName).localeCompare(b.gradeCode || b.gradeName);
        if (gradeCmp !== 0) return gradeCmp;
        return a.sectionName.localeCompare(b.sectionName);
      })
      .map((b) => {
        const netCol = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          b.totalCollected.sub(b.totalReversals).sub(b.totalRefunds),
        );
        const rem = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          b.totalAssessed.sub(b.totalWaived).sub(netCol),
        );
        return {
          gradeId: b.gradeId,
          gradeName: b.gradeName,
          gradeCode: b.gradeCode,
          sectionId: b.sectionId,
          sectionName: b.sectionName,
          totalAssessed: Number(b.totalAssessed.toFixed(2)),
          totalWaived: Number(b.totalWaived.toFixed(2)),
          totalCollected: Number(b.totalCollected.toFixed(2)),
          totalReversals: Number(b.totalReversals.toFixed(2)),
          totalRefunds: Number(b.totalRefunds.toFixed(2)),
          netCollected: Number(netCol.toFixed(2)),
          remainingBalance: Number(rem.toFixed(2)),
          fineCount: b.count,
        };
      });

    // 8. Overall summary metrics
    const netOverallCollected = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      overallCollected.sub(overallReversals).sub(overallRefunds),
    );
    const overallRemaining = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      overallAssessed.sub(overallWaived).sub(netOverallCollected),
    );

    const statusBreakdown = Array.from(statusMap.entries()).map(([status, d]) => ({
      status,
      count: d.count,
      totalAssessed: Number(d.totalAssessed.toFixed(2)),
      remainingBalance: Number(d.remainingBalance.toFixed(2)),
    }));

    const ruleBreakdown = Array.from(ruleMap.values()).map((r) => ({
      ruleId: r.ruleId,
      ruleName: r.ruleName,
      count: r.count,
      totalAssessed: Number(r.totalAssessed.toFixed(2)),
      remainingBalance: Number(r.remainingBalance.toFixed(2)),
    }));

    const config = this.reportConfigService.getReportConfig(
      school,
      ReportType.FINE_SUMMARY,
    );

    return {
      school: {
        id: school.id,
        name: school.name,
        currency: school.currency,
        timezone: timeZone,
      },
      filters: {
        academicYearId: targetAcademicYearId || null,
        academicYearName: academicYear?.name || null,
        gradeId: query.gradeId || null,
        sectionId: query.sectionId || null,
        fineRuleId: query.fineRuleId || null,
        startDate: startDateStr,
        endDate: endDateStr,
      },
      summary: {
        totalAssessed: Number(overallAssessed.toFixed(2)),
        totalWaived: Number(overallWaived.toFixed(2)),
        netObligation: Number(
          Prisma.Decimal.max(new Prisma.Decimal(0), overallAssessed.sub(overallWaived)).toFixed(2),
        ),
        totalCollected: Number(overallCollected.toFixed(2)),
        totalReversals: Number(overallReversals.toFixed(2)),
        totalRefunds: Number(overallRefunds.toFixed(2)),
        netCollected: Number(netOverallCollected.toFixed(2)),
        remainingBalance: Number(overallRemaining.toFixed(2)),
        fineCount: fines.length,
      },
      byClass,
      statusBreakdown,
      ruleBreakdown,
      config,
    };
  }

  /**
   * Generates class-wise fee collections report.

   */
  async getClassCollections(school: School, query: ClassCollectionQueryDto) {
    const timeZone = school.timezone || 'Asia/Kolkata';

    // 1. Resolve date boundaries
    let startUtc: Date;
    let endUtc: Date;
    let startDateStr: string;
    let endDateStr: string;

    if (query.startDate && query.endDate) {
      startDateStr = query.startDate;
      endDateStr = query.endDate;
      const bStart = this.getLocalDayBoundariesUtc(startDateStr, timeZone);
      const bEnd = this.getLocalDayBoundariesUtc(endDateStr, timeZone);
      startUtc = bStart.startUtc;
      endUtc = bEnd.endUtc;

      if (startUtc > endUtc) {
        throw new BadRequestException('startDate cannot be after endDate');
      }
    } else if (query.startDate || query.endDate) {
      throw new BadRequestException(
        'Both startDate and endDate must be provided together',
      );
    } else {
      // Neither provided: use academic year or current month
      let targetAy = null;
      if (query.academicYearId) {
        targetAy = await this.prisma.academicYear.findFirst({
          where: { schoolId: school.id, id: query.academicYearId },
        });
      } else {
        targetAy = await this.prisma.academicYear.findFirst({
          where: { schoolId: school.id, isCurrent: true },
        });
      }

      if (targetAy) {
        startUtc = targetAy.startDate;
        endUtc = targetAy.endDate;
        startDateStr = this.formatDateInTimezone(startUtc, timeZone);
        endDateStr = this.formatDateInTimezone(endUtc, timeZone);
      } else {
        const todayIso = this.getTodayIsoInTimezone(timeZone);
        const [yStr, mStr] = todayIso.split('-');
        const monthBounds = this.getLocalMonthBoundariesUtc(
          parseInt(yStr, 10),
          parseInt(mStr, 10),
          timeZone,
        );
        startUtc = monthBounds.startUtc;
        endUtc = monthBounds.endUtc;
        startDateStr = `${yStr}-${mStr}-01`;
        endDateStr = `${yStr}-${mStr}-${String(monthBounds.daysInMonth).padStart(2, '0')}`;
      }
    }

    // 2. Fetch grades and sections for the school
    const grades = await this.prisma.gradeClass.findMany({
      where: {
        schoolId: school.id,
        ...(query.gradeId ? { id: query.gradeId } : {}),
      },
      include: {
        sections: {
          where: {
            ...(query.sectionId ? { id: query.sectionId } : {}),
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { code: 'asc' },
    });

    const classMap = new Map<
      string,
      {
        gradeId: string;
        gradeName: string;
        gradeCode: string;
        sectionId: string;
        sectionName: string;
        gross: Prisma.Decimal;
        reversals: Prisma.Decimal;
        refunds: Prisma.Decimal;
        count: number;
      }
    >();

    for (const g of grades) {
      for (const s of g.sections) {
        const key = `${g.id}:${s.id}`;
        classMap.set(key, {
          gradeId: g.id,
          gradeName: g.name,
          gradeCode: g.code,
          sectionId: s.id,
          sectionName: s.name,
          gross: new Prisma.Decimal(0),
          reversals: new Prisma.Decimal(0),
          refunds: new Prisma.Decimal(0),
          count: 0,
        });
      }
    }

    // 3. Query payments
    const paymentsWhere: Prisma.PaymentWhereInput = {
      schoolId: school.id,
      paymentDate: { gte: startUtc, lte: endUtc },
      status: PaymentStatus.COMPLETED,
    };
    if (query.academicYearId) paymentsWhere.academicYearId = query.academicYearId;
    if (query.paymentMethod) paymentsWhere.paymentMethod = query.paymentMethod;
    if (query.gradeId || query.sectionId) {
      paymentsWhere.student = {};
      if (query.gradeId) paymentsWhere.student.gradeId = query.gradeId;
      if (query.sectionId) paymentsWhere.student.sectionId = query.sectionId;
    }

    const payments = await this.prisma.payment.findMany({
      where: paymentsWhere,
      include: {
        student: {
          include: { grade: true, section: true },
        },
      },
      orderBy: { paymentDate: 'asc' },
    });

    for (const p of payments) {
      const gId = p.student.gradeId;
      const sId = p.student.sectionId;
      const key = `${gId}:${sId}`;
      let entry = classMap.get(key);
      if (!entry) {
        entry = {
          gradeId: gId,
          gradeName: p.student.grade?.name || 'Unknown Grade',
          gradeCode: p.student.grade?.code || '',
          sectionId: sId,
          sectionName: p.student.section?.name || 'Unknown Section',
          gross: new Prisma.Decimal(0),
          reversals: new Prisma.Decimal(0),
          refunds: new Prisma.Decimal(0),
          count: 0,
        };
        classMap.set(key, entry);
      }
      entry.gross = entry.gross.add(p.amount);
      entry.count += 1;
    }

    // 4. Query reversals
    const reversalsWhere: Prisma.PaymentReversalWhereInput = {
      schoolId: school.id,
      createdAt: { gte: startUtc, lte: endUtc },
    };
    if (query.academicYearId || query.paymentMethod || query.gradeId || query.sectionId) {
      reversalsWhere.payment = {};
      if (query.academicYearId) reversalsWhere.payment.academicYearId = query.academicYearId;
      if (query.paymentMethod) reversalsWhere.payment.paymentMethod = query.paymentMethod;
      if (query.gradeId || query.sectionId) {
        reversalsWhere.payment.student = {};
        if (query.gradeId) reversalsWhere.payment.student.gradeId = query.gradeId;
        if (query.sectionId) reversalsWhere.payment.student.sectionId = query.sectionId;
      }
    }

    const reversals = await this.prisma.paymentReversal.findMany({
      where: reversalsWhere,
      include: {
        payment: {
          include: {
            student: {
              include: { grade: true, section: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const rev of reversals) {
      const gId = rev.payment.student.gradeId;
      const sId = rev.payment.student.sectionId;
      const key = `${gId}:${sId}`;
      let entry = classMap.get(key);
      if (!entry) {
        entry = {
          gradeId: gId,
          gradeName: rev.payment.student.grade?.name || 'Unknown Grade',
          gradeCode: rev.payment.student.grade?.code || '',
          sectionId: sId,
          sectionName: rev.payment.student.section?.name || 'Unknown Section',
          gross: new Prisma.Decimal(0),
          reversals: new Prisma.Decimal(0),
          refunds: new Prisma.Decimal(0),
          count: 0,
        };
        classMap.set(key, entry);
      }
      entry.reversals = entry.reversals.add(rev.totalAmount);
    }

    // 5. Query refunds (succeeded only, with processedAt or refundDate fallback)
    const refundsWhere: Prisma.PaymentRefundWhereInput = {
      schoolId: school.id,
      status: RefundStatus.SUCCEEDED,
      OR: [
        { processedAt: { gte: startUtc, lte: endUtc } },
        { processedAt: null, refundDate: { gte: startUtc, lte: endUtc } },
      ],
    };
    if (query.academicYearId || query.paymentMethod || query.gradeId || query.sectionId) {
      refundsWhere.payment = {};
      if (query.academicYearId) refundsWhere.payment.academicYearId = query.academicYearId;
      if (query.paymentMethod) refundsWhere.payment.paymentMethod = query.paymentMethod;
      if (query.gradeId || query.sectionId) {
        refundsWhere.payment.student = {};
        if (query.gradeId) refundsWhere.payment.student.gradeId = query.gradeId;
        if (query.sectionId) refundsWhere.payment.student.sectionId = query.sectionId;
      }
    }

    const refunds = await this.prisma.paymentRefund.findMany({
      where: refundsWhere,
      include: {
        payment: {
          include: {
            student: {
              include: { grade: true, section: true },
            },
          },
        },
      },
      orderBy: { processedAt: 'asc' },
    });

    for (const ref of refunds) {
      const gId = ref.payment.student.gradeId;
      const sId = ref.payment.student.sectionId;
      const key = `${gId}:${sId}`;
      let entry = classMap.get(key);
      if (!entry) {
        entry = {
          gradeId: gId,
          gradeName: ref.payment.student.grade?.name || 'Unknown Grade',
          gradeCode: ref.payment.student.grade?.code || '',
          sectionId: sId,
          sectionName: ref.payment.student.section?.name || 'Unknown Section',
          gross: new Prisma.Decimal(0),
          reversals: new Prisma.Decimal(0),
          refunds: new Prisma.Decimal(0),
          count: 0,
        };
        classMap.set(key, entry);
      }
      entry.refunds = entry.refunds.add(ref.refundAmount);
    }

    // 6. Build deterministic sorted byClass list
    const byClass = Array.from(classMap.values())
      .sort((a, b) => {
        const gradeCmp = (a.gradeCode || a.gradeName).localeCompare(b.gradeCode || b.gradeName);
        if (gradeCmp !== 0) return gradeCmp;
        return a.sectionName.localeCompare(b.sectionName);
      })
      .map((b) => {
        const net = b.gross.sub(b.reversals).sub(b.refunds);
        return {
          gradeId: b.gradeId,
          gradeName: b.gradeName,
          gradeCode: b.gradeCode,
          sectionId: b.sectionId,
          sectionName: b.sectionName,
          grossCollections: Number(b.gross.toFixed(2)),
          totalReversals: Number(b.reversals.toFixed(2)),
          totalRefunds: Number(b.refunds.toFixed(2)),
          netCollections: Number(net.toFixed(2)),
          transactionCount: b.count,
        };
      });

    // 7. Overall summary totals
    let grossTotal = new Prisma.Decimal(0);
    let reversalTotal = new Prisma.Decimal(0);
    let refundTotal = new Prisma.Decimal(0);
    let totalTxnCount = 0;

    for (const b of classMap.values()) {
      grossTotal = grossTotal.add(b.gross);
      reversalTotal = reversalTotal.add(b.reversals);
      refundTotal = refundTotal.add(b.refunds);
      totalTxnCount += b.count;
    }
    const netTotal = grossTotal.sub(reversalTotal).sub(refundTotal);

    const config = this.reportConfigService.getReportConfig(
      school,
      ReportType.CLASS_COLLECTION,
    );

    return {
      school: {
        id: school.id,
        name: school.name,
        currency: school.currency,
        timezone: timeZone,
      },
      period: {
        startDate: startDateStr,
        endDate: endDateStr,
        startDateTime: startUtc.toISOString(),
        endDateTime: endUtc.toISOString(),
        academicYearId: query.academicYearId || null,
      },
      filters: {
        gradeId: query.gradeId || null,
        sectionId: query.sectionId || null,
        paymentMethod: query.paymentMethod || null,
      },
      summary: {
        grossCollections: Number(grossTotal.toFixed(2)),
        totalReversals: Number(reversalTotal.toFixed(2)),
        totalRefunds: Number(refundTotal.toFixed(2)),
        netCollections: Number(netTotal.toFixed(2)),
        transactionCount: totalTxnCount,
        reversalCount: reversals.length,
        refundCount: refunds.length,
      },
      byClass,
      config,
    };
  }

  /**
   * Internal core aggregator querying payments, reversals, and refunds.
   */
  private async aggregateCollectionData(params: {
    schoolId: string;
    startUtc: Date;
    endUtc: Date;
    academicYearId?: string;
    paymentMethod?: PaymentMethod;
  }) {
    const { schoolId, startUtc, endUtc, academicYearId, paymentMethod } = params;

    // 1. Payments query
    const paymentsWhere: Prisma.PaymentWhereInput = {
      schoolId,
      paymentDate: { gte: startUtc, lte: endUtc },
    };
    if (academicYearId) paymentsWhere.academicYearId = academicYearId;
    if (paymentMethod) paymentsWhere.paymentMethod = paymentMethod;

    const payments = await this.prisma.payment.findMany({
      where: paymentsWhere,
      include: {
        receipt: true,
        student: {
          include: { grade: true, section: true },
        },
        collectedByUser: {
          select: { id: true, name: true, email: true },
        },
        allocations: {
          include: {
            invoiceItem: {
              include: { feeHead: true },
            },
            assessedFine: true,
          },
        },
      },
      orderBy: { paymentDate: 'asc' },
    });

    // 2. Reversals query
    const reversalsWhere: Prisma.PaymentReversalWhereInput = {
      schoolId,
      createdAt: { gte: startUtc, lte: endUtc },
    };
    if (academicYearId || paymentMethod) {
      reversalsWhere.payment = {};
      if (academicYearId) reversalsWhere.payment.academicYearId = academicYearId;
      if (paymentMethod) reversalsWhere.payment.paymentMethod = paymentMethod;
    }

    const reversals = await this.prisma.paymentReversal.findMany({
      where: reversalsWhere,
      include: {
        payment: {
          select: {
            id: true,
            paymentNumber: true,
            paymentMethod: true,
            academicYearId: true,
          },
        },
        allocations: {
          include: {
            reversalOf: {
              include: {
                invoiceItem: { include: { feeHead: true } },
                assessedFine: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // 3. Refunds query (strictly SUCCEEDED refunds with processedAt or refundDate fallback)
    const refundsWhere: Prisma.PaymentRefundWhereInput = {
      schoolId,
      status: RefundStatus.SUCCEEDED,
      OR: [
        { processedAt: { gte: startUtc, lte: endUtc } },
        { processedAt: null, refundDate: { gte: startUtc, lte: endUtc } },
      ],
    };
    if (academicYearId || paymentMethod) {
      refundsWhere.payment = {};
      if (academicYearId) refundsWhere.payment.academicYearId = academicYearId;
      if (paymentMethod) refundsWhere.payment.paymentMethod = paymentMethod;
    }

    const refunds = await this.prisma.paymentRefund.findMany({
      where: refundsWhere,
      include: {
        payment: {
          select: {
            id: true,
            paymentNumber: true,
            paymentMethod: true,
            academicYearId: true,
          },
        },
        allocations: {
          include: {
            originalAllocation: {
              include: {
                invoiceItem: { include: { feeHead: true } },
                assessedFine: true,
              },
            },
          },
        },
      },
      orderBy: { processedAt: 'asc' },
    });

    // Gross, Reversals, Refunds totals
    let grossTotal = new Prisma.Decimal(0);
    for (const p of payments) {
      grossTotal = grossTotal.add(p.amount);
    }

    let reversalTotal = new Prisma.Decimal(0);
    for (const rev of reversals) {
      reversalTotal = reversalTotal.add(rev.totalAmount);
    }

    let refundTotal = new Prisma.Decimal(0);
    for (const ref of refunds) {
      refundTotal = refundTotal.add(ref.refundAmount);
    }

    const netTotal = grossTotal.sub(reversalTotal).sub(refundTotal);

    // Payment Method Breakdown
    const methodMap = new Map<
      PaymentMethod,
      {
        gross: Prisma.Decimal;
        reversals: Prisma.Decimal;
        refunds: Prisma.Decimal;
        count: number;
      }
    >();

    for (const p of payments) {
      const m = p.paymentMethod;
      const current = methodMap.get(m) || {
        gross: new Prisma.Decimal(0),
        reversals: new Prisma.Decimal(0),
        refunds: new Prisma.Decimal(0),
        count: 0,
      };
      current.gross = current.gross.add(p.amount);
      current.count += 1;
      methodMap.set(m, current);
    }

    for (const rev of reversals) {
      const m = rev.payment.paymentMethod;
      const current = methodMap.get(m) || {
        gross: new Prisma.Decimal(0),
        reversals: new Prisma.Decimal(0),
        refunds: new Prisma.Decimal(0),
        count: 0,
      };
      current.reversals = current.reversals.add(rev.totalAmount);
      methodMap.set(m, current);
    }

    for (const ref of refunds) {
      const m = ref.payment.paymentMethod;
      const current = methodMap.get(m) || {
        gross: new Prisma.Decimal(0),
        reversals: new Prisma.Decimal(0),
        refunds: new Prisma.Decimal(0),
        count: 0,
      };
      current.refunds = current.refunds.add(ref.refundAmount);
      methodMap.set(m, current);
    }

    const byPaymentMethod: MethodSummary[] = Array.from(methodMap.entries())
      .map(([method, data]) => {
        const net = data.gross.sub(data.reversals).sub(data.refunds);
        return {
          method,
          grossAmount: Number(data.gross.toFixed(2)),
          reversals: Number(data.reversals.toFixed(2)),
          refunds: Number(data.refunds.toFixed(2)),
          netAmount: Number(net.toFixed(2)),
          count: data.count,
        };
      })
      .sort((a, b) => a.method.localeCompare(b.method));

    // Fee Head Breakdown
    interface FeeHeadAccumulator {
      feeHeadId: string;
      name: string;
      category: string;
      grossAmount: Prisma.Decimal;
      reversals: Prisma.Decimal;
      refunds: Prisma.Decimal;
    }

    const headMap = new Map<string, FeeHeadAccumulator>();

    const getOrCreateHead = (
      headId: string,
      name: string,
      category: string,
    ): FeeHeadAccumulator => {
      let entry = headMap.get(headId);
      if (!entry) {
        entry = {
          feeHeadId: headId,
          name,
          category,
          grossAmount: new Prisma.Decimal(0),
          reversals: new Prisma.Decimal(0),
          refunds: new Prisma.Decimal(0),
        };
        headMap.set(headId, entry);
      }
      return entry;
    };

    // Gross allocations from payments
    for (const p of payments) {
      for (const alloc of p.allocations) {
        if (alloc.allocationType === AllocationType.PRINCIPAL && alloc.invoiceItem) {
          const headId = alloc.invoiceItem.feeHeadId;
          const headName =
            alloc.invoiceItem.feeHeadNameSnapshot ||
            alloc.invoiceItem.feeHead?.name ||
            'Fee Head';
          const category =
            alloc.invoiceItem.feeHead?.category || FeeHeadCategory.ACADEMIC;
          const entry = getOrCreateHead(headId, headName, category);
          entry.grossAmount = entry.grossAmount.add(alloc.allocatedAmount);
        } else if (alloc.allocationType === AllocationType.FINE) {
          const entry = getOrCreateHead(
            'LATE_FINE',
            'Late Payment Fine',
            FeeHeadCategory.MISCELLANEOUS,
          );
          entry.grossAmount = entry.grossAmount.add(alloc.allocatedAmount);
        }
      }
    }

    // Reversal allocations
    for (const rev of reversals) {
      for (const alloc of rev.allocations) {
        if (alloc.allocationType === AllocationType.REVERSAL && alloc.reversalOf) {
          const orig = alloc.reversalOf;
          if (orig.allocationType === AllocationType.PRINCIPAL && orig.invoiceItem) {
            const headId = orig.invoiceItem.feeHeadId;
            const headName =
              orig.invoiceItem.feeHeadNameSnapshot ||
              orig.invoiceItem.feeHead?.name ||
              'Fee Head';
            const category =
              orig.invoiceItem.feeHead?.category || FeeHeadCategory.ACADEMIC;
            const entry = getOrCreateHead(headId, headName, category);
            entry.reversals = entry.reversals.add(alloc.allocatedAmount);
          } else if (orig.allocationType === AllocationType.FINE) {
            const entry = getOrCreateHead(
              'LATE_FINE',
              'Late Payment Fine',
              FeeHeadCategory.MISCELLANEOUS,
            );
            entry.reversals = entry.reversals.add(alloc.allocatedAmount);
          }
        }
      }
    }

    // Refund allocations
    for (const ref of refunds) {
      for (const refAlloc of ref.allocations) {
        const orig = refAlloc.originalAllocation;
        if (orig) {
          if (orig.allocationType === AllocationType.PRINCIPAL && orig.invoiceItem) {
            const headId = orig.invoiceItem.feeHeadId;
            const headName =
              orig.invoiceItem.feeHeadNameSnapshot ||
              orig.invoiceItem.feeHead?.name ||
              'Fee Head';
            const category =
              orig.invoiceItem.feeHead?.category || FeeHeadCategory.ACADEMIC;
            const entry = getOrCreateHead(headId, headName, category);
            entry.refunds = entry.refunds.add(refAlloc.amount);
          } else if (orig.allocationType === AllocationType.FINE) {
            const entry = getOrCreateHead(
              'LATE_FINE',
              'Late Payment Fine',
              FeeHeadCategory.MISCELLANEOUS,
            );
            entry.refunds = entry.refunds.add(refAlloc.amount);
          }
        }
      }
    }

    const byFeeHead: FeeHeadSummary[] = Array.from(headMap.values())
      .map((h) => {
        const net = h.grossAmount.sub(h.reversals).sub(h.refunds);
        return {
          feeHeadId: h.feeHeadId,
          name: h.name,
          category: h.category,
          grossAmount: Number(h.grossAmount.toFixed(2)),
          reversals: Number(h.reversals.toFixed(2)),
          refunds: Number(h.refunds.toFixed(2)),
          netAmount: Number(net.toFixed(2)),
        };
      })
      .sort((a, b) => {
        const catCmp = a.category.localeCompare(b.category);
        if (catCmp !== 0) return catCmp;
        const nameCmp = a.name.localeCompare(b.name);
        if (nameCmp !== 0) return nameCmp;
        return a.feeHeadId.localeCompare(b.feeHeadId);
      });

    return {
      payments,
      reversals,
      refunds,
      grossTotal,
      reversalTotal,
      refundTotal,
      netTotal,
      byPaymentMethod,
      byFeeHead,
    };
  }

  /**
   * Deterministically calculates UTC day boundaries for a given YYYY-MM-DD in a timezone.
   */
  public getLocalDayBoundariesUtc(
    dateStr: string,
    timeZone: string = 'Asia/Kolkata',
  ): { startUtc: Date; endUtc: Date } {
    const parts = (dateStr || '').trim().split('-');
    if (parts.length !== 3) {
      throw new BadRequestException(
        `Invalid date format '${dateStr}', expected YYYY-MM-DD`,
      );
    }
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    if (
      isNaN(year) ||
      isNaN(month) ||
      isNaN(day) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      throw new BadRequestException(
        `Invalid date values in '${dateStr}': must be valid calendar day`,
      );
    }

    // Sample offset at UTC noon for stability
    const sampleUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const formattedParts = formatter.formatToParts(sampleUtc);
    const partMap: Record<string, number> = {};
    for (const p of formattedParts) {
      if (p.type !== 'literal') partMap[p.type] = parseInt(p.value, 10);
    }
    const localHour = partMap.hour === 24 ? 0 : partMap.hour;
    const localUtcMs = Date.UTC(
      partMap.year,
      partMap.month - 1,
      partMap.day,
      localHour,
      partMap.minute,
      partMap.second,
    );
    const offsetMs = localUtcMs - sampleUtc.getTime();

    const startUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - offsetMs);
    const endUtc = new Date(
      Date.UTC(year, month - 1, day, 23, 59, 59, 999) - offsetMs,
    );

    return { startUtc, endUtc };
  }

  /**
   * Deterministically calculates UTC month boundaries for a given year and month in a timezone.
   */
  public getLocalMonthBoundariesUtc(
    year: number,
    month: number,
    timeZone: string = 'Asia/Kolkata',
  ): { startUtc: Date; endUtc: Date; daysInMonth: number } {
    if (month < 1 || month > 12) {
      throw new BadRequestException(
        `Invalid month ${month}: must be between 1 and 12`,
      );
    }
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const { startUtc } = this.getLocalDayBoundariesUtc(startStr, timeZone);
    const { endUtc } = this.getLocalDayBoundariesUtc(endStr, timeZone);

    return { startUtc, endUtc, daysInMonth };
  }

  /**
   * Formats a Date object to YYYY-MM-DD in the target school timezone.
   */
  public formatDateInTimezone(
    date: Date,
    timeZone: string = 'Asia/Kolkata',
  ): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  }

  /**
   * Returns today's ISO date string (YYYY-MM-DD) in the target school timezone.
   */
  public getTodayIsoInTimezone(timeZone: string = 'Asia/Kolkata'): string {
    return this.formatDateInTimezone(new Date(), timeZone);
  }
}
