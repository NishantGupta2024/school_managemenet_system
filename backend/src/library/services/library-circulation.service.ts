import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LibrarySettingsService } from './library-settings.service';
import {
  IssueBookDto,
  LoanQueryDto,
  RenewBookDto,
  ReturnBookDto,
} from '../dto/circulation.dto';
import { BorrowerType, LoanStatus, Prisma } from '@prisma/client';

@Injectable()
export class LibraryCirculationService {
  private readonly logger = new Logger(LibraryCirculationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: LibrarySettingsService,
  ) {}

  /**
   * Issue a book copy to a student or teacher.
   */
  async issueBook(schoolId: string, userId: string, dto: IssueBookDto) {
    const settings = await this.settingsService.getOrCreateSettings(schoolId);
    const borrowerType = dto.borrowerType || BorrowerType.STUDENT;

    // Validate borrower identity
    if (borrowerType === BorrowerType.STUDENT) {
      if (!dto.studentId) {
        throw new BadRequestException('studentId is required when borrowerType is STUDENT');
      }
      const student = await this.prisma.student.findFirst({
        where: { schoolId, id: dto.studentId, status: 'ACTIVE' },
      });
      if (!student) {
        throw new NotFoundException(
          `Active student with ID "${dto.studentId}" not found in this school`,
        );
      }

      // Check max active loans
      const activeCount = await this.prisma.bookLoan.count({
        where: { schoolId, studentId: dto.studentId, status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] } },
      });
      if (activeCount >= settings.maxBooksStudent) {
        throw new BadRequestException(
          `Student has reached the maximum borrowing limit of ${settings.maxBooksStudent} active book(s)`,
        );
      }
    } else if (borrowerType === BorrowerType.TEACHER) {
      if (!dto.teacherId) {
        throw new BadRequestException('teacherId is required when borrowerType is TEACHER');
      }
      const teacher = await this.prisma.teacher.findFirst({
        where: { schoolId, id: dto.teacherId, status: 'ACTIVE' },
      });
      if (!teacher) {
        throw new NotFoundException(
          `Active teacher with ID "${dto.teacherId}" not found in this school`,
        );
      }

      const activeCount = await this.prisma.bookLoan.count({
        where: { schoolId, teacherId: dto.teacherId, status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] } },
      });
      if (activeCount >= settings.maxBooksTeacher) {
        throw new BadRequestException(
          `Teacher has reached the maximum borrowing limit of ${settings.maxBooksTeacher} active book(s)`,
        );
      }
    }

    // Verify copy existence and availability
    const copy = await this.prisma.bookCopy.findFirst({
      where: { schoolId, id: dto.copyId },
      include: { book: true },
    });

    if (!copy) {
      throw new NotFoundException(`Book copy with ID "${dto.copyId}" not found in this school`);
    }

    if (copy.status !== 'AVAILABLE') {
      throw new BadRequestException(
        `Copy "${copy.accessionNumber}" is currently ${copy.status} and cannot be issued`,
      );
    }

    // Calculate due date
    const loanDays =
      borrowerType === BorrowerType.STUDENT
        ? settings.loanDurationDaysStudent
        : settings.loanDurationDaysTeacher;
    const dueDate = dto.dueDate
      ? new Date(dto.dueDate)
      : new Date(Date.now() + loanDays * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.bookLoan.create({
        data: {
          schoolId,
          copyId: copy.id,
          borrowerType,
          studentId: borrowerType === BorrowerType.STUDENT ? dto.studentId : null,
          teacherId: borrowerType === BorrowerType.TEACHER ? dto.teacherId : null,
          issuedByUserId: userId,
          issuedAt: new Date(),
          dueDate,
          renewalCount: 0,
          status: LoanStatus.ACTIVE,
          notes: dto.notes?.trim() || null,
        },
        include: {
          copy: {
            include: { book: true },
          },
        },
      });

      await tx.bookCopy.update({
        where: { schoolId_id: { schoolId, id: copy.id } },
        data: { status: 'ISSUED' },
      });

      await tx.book.update({
        where: { schoolId_id: { schoolId, id: copy.bookId } },
        data: { availableCopies: { decrement: 1 } },
      });

      this.logger.log(
        `Issued copy ${copy.accessionNumber} (Loan ID: ${loan.id}) to ${borrowerType} in school ${schoolId}`,
      );
      return loan;
    });
  }

  /**
   * Return a book copy and assess overdue fines if applicable.
   */
  async returnBook(schoolId: string, userId: string, dto: ReturnBookDto) {
    if (!dto.loanId && !dto.copyId) {
      throw new BadRequestException('Either loanId or copyId must be provided to return a book');
    }

    const settings = await this.settingsService.getOrCreateSettings(schoolId);

    // Find active loan
    const loan = await this.prisma.bookLoan.findFirst({
      where: {
        schoolId,
        ...(dto.loanId ? { id: dto.loanId } : { copyId: dto.copyId }),
        status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] },
      },
      include: {
        copy: {
          include: { book: true },
        },
      },
    });

    if (!loan) {
      const anyLoan = await this.prisma.bookLoan.findFirst({
        where: {
          schoolId,
          ...(dto.loanId ? { id: dto.loanId } : { copyId: dto.copyId }),
        },
      });
      if (anyLoan && anyLoan.status === LoanStatus.RETURNED) {
        throw new BadRequestException('This loan is already marked as RETURNED');
      }
      throw new NotFoundException('No active loan found matching the provided identifier');
    }

    const now = new Date();
    let assessedFine = null;

    // Check overdue and calculate fine
    if (now.getTime() > loan.dueDate.getTime()) {
      const diffMs = now.getTime() - loan.dueDate.getTime();
      const elapsedDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const billableDays = Math.max(0, elapsedDays - settings.gracePeriodDays);

      if (billableDays > 0) {
        const finePerDay = Number(settings.finePerDay);
        const totalFine = billableDays * finePerDay;

        if (totalFine > 0) {
          assessedFine = {
            fineAmount: new Prisma.Decimal(totalFine.toFixed(2)),
            overdueDays: billableDays,
          };
        }
      }
    }

    const newCondition = dto.condition || loan.copy.condition;
    const isLost = newCondition === 'LOST';
    const isDamaged = newCondition === 'DAMAGED';

    return this.prisma.$transaction(async (tx) => {
      // 1. Mark loan as RETURNED (or LOST if marked lost)
      const updatedLoan = await tx.bookLoan.update({
        where: { schoolId_id: { schoolId, id: loan.id } },
        data: {
          status: isLost ? LoanStatus.LOST : LoanStatus.RETURNED,
          returnedAt: now,
          returnedByUserId: userId,
          ...(dto.notes && { notes: dto.notes.trim() }),
        },
      });

      // 2. Assess fine if overdue
      let createdFine = null;
      if (assessedFine) {
        createdFine = await tx.libraryFine.create({
          data: {
            schoolId,
            loanId: loan.id,
            borrowerType: loan.borrowerType,
            studentId: loan.studentId,
            teacherId: loan.teacherId,
            reason: 'OVERDUE',
            overdueDays: assessedFine.overdueDays,
            fineAmount: assessedFine.fineAmount,
            paidAmount: new Prisma.Decimal(0),
            waivedAmount: new Prisma.Decimal(0),
            status: 'PENDING',
          },
        });
      }

      // 3. Update copy condition and status
      let nextStatus = 'AVAILABLE';
      let availableIncrement = 1;

      if (isLost) {
        nextStatus = 'LOST';
        availableIncrement = 0; // Copy lost, not returned to available shelf
      } else if (isDamaged) {
        nextStatus = 'MAINTENANCE';
        availableIncrement = 0; // Copy damaged, needs repair
      }

      await tx.bookCopy.update({
        where: { schoolId_id: { schoolId, id: loan.copyId } },
        data: {
          condition: newCondition,
          status: nextStatus as any,
        },
      });

      // 4. Update availableCopies count on Book if returned to circulation
      if (availableIncrement > 0) {
        await tx.book.update({
          where: { schoolId_id: { schoolId, id: loan.copy.bookId } },
          data: { availableCopies: { increment: 1 } },
        });
      }

      this.logger.log(
        `Returned copy ${loan.copy.accessionNumber} (Loan ID: ${loan.id}) in school ${schoolId}`,
      );

      return {
        loan: updatedLoan,
        fine: createdFine,
        message: 'Book returned successfully',
      };
    });
  }

  /**
   * Renew an active book loan.
   */
  async renewBook(schoolId: string, dto: RenewBookDto) {
    const settings = await this.settingsService.getOrCreateSettings(schoolId);

    const loan = await this.prisma.bookLoan.findFirst({
      where: { schoolId, id: dto.loanId, status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] } },
    });

    if (!loan) {
      throw new NotFoundException(`Active loan with ID "${dto.loanId}" not found in this school`);
    }

    if (loan.renewalCount >= settings.maxRenewals) {
      throw new BadRequestException(
        `Maximum renewal limit of ${settings.maxRenewals} renewal(s) has been reached for this loan`,
      );
    }

    const now = new Date();
    const isOverdue = now.getTime() > loan.dueDate.getTime() || loan.status === LoanStatus.OVERDUE;
    if (isOverdue && !settings.allowRenewWithOverdue) {
      throw new BadRequestException(
        'Cannot renew an overdue loan. Please return the book to settle overdue penalties.',
      );
    }

    const renewalDays =
      loan.borrowerType === BorrowerType.STUDENT
        ? settings.loanDurationDaysStudent
        : settings.loanDurationDaysTeacher;

    const currentDue = new Date(loan.dueDate);
    const baseDate = currentDue.getTime() > now.getTime() ? currentDue : now;
    const newDueDate = new Date(baseDate.getTime() + renewalDays * 24 * 60 * 60 * 1000);

    const renewed = await this.prisma.bookLoan.update({
      where: { schoolId_id: { schoolId, id: loan.id } },
      data: {
        dueDate: newDueDate,
        renewalCount: { increment: 1 },
        status: LoanStatus.ACTIVE,
      },
      include: {
        copy: {
          include: { book: true },
        },
      },
    });

    this.logger.log(
      `Renewed loan ${loan.id} (new due date: ${newDueDate.toISOString()}) in school ${schoolId}`,
    );
    return renewed;
  }

  /**
   * List circulation loans with filters.
   */
  async getLoans(schoolId: string, query: LoanQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const now = new Date();

    const where: Prisma.BookLoanWhereInput = {
      schoolId,
      ...(query.status && { status: query.status }),
      ...(query.borrowerType && { borrowerType: query.borrowerType }),
      ...(query.studentId && { studentId: query.studentId }),
      ...(query.teacherId && { teacherId: query.teacherId }),
      ...(query.copyId && { copyId: query.copyId }),
      ...(query.overdueOnly && {
        status: LoanStatus.ACTIVE,
        dueDate: { lt: now },
      }),
    };

    const [loans, total] = await Promise.all([
      this.prisma.bookLoan.findMany({
        where,
        include: {
          copy: {
            include: {
              book: {
                select: {
                  id: true,
                  title: true,
                  author: true,
                  isbn: true,
                  category: true,
                },
              },
            },
          },
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNumber: true,
            },
          },
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
            },
          },
          fine: true,
        },
        orderBy: { issuedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.bookLoan.count({ where }),
    ]);

    // Attach computed isOverdue flag
    const data = loans.map((loan) => ({
      ...loan,
      isOverdue: loan.status === LoanStatus.ACTIVE && loan.dueDate.getTime() < now.getTime(),
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
