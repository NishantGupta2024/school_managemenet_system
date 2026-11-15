import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentCatalogueQueryDto } from '../dto/settings.dto';
import { LoanStatus, Prisma } from '@prisma/client';

@Injectable()
export class LibraryStudentService {
  private readonly logger = new Logger(LibraryStudentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper: Resolves the active student profile strictly from req.user.id and schoolId.
   * Client-supplied student IDs are never accepted.
   */
  async resolveActiveStudent(schoolId: string, userId: string) {
    const student = await this.prisma.student.findFirst({
      where: {
        schoolId,
        userId,
        status: 'ACTIVE',
      },
    });

    if (!student) {
      throw new ForbiddenException(
        'Active student profile not found for this account in this school',
      );
    }

    return student;
  }

  /**
   * Student Catalogue Search:
   * Returns book titles, author, category, total copies, and available copies.
   * PRIVACY GUARANTEE: Never exposes borrower identities, loan IDs, or current holder details.
   */
  async getCatalogue(schoolId: string, query: StudentCatalogueQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.BookWhereInput = {
      schoolId,
      ...(query.category && {
        category: { equals: query.category, mode: 'insensitive' },
      }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { author: { contains: query.search, mode: 'insensitive' } },
          { isbn: { contains: query.search, mode: 'insensitive' } },
          { copies: { some: { barcode: { contains: query.search, mode: 'insensitive' } } } },
          { copies: { some: { accessionNumber: { contains: query.search, mode: 'insensitive' } } } },
        ],
      }),
    };

    const [books, total] = await Promise.all([
      this.prisma.book.findMany({
        where,
        select: {
          id: true,
          title: true,
          author: true,
          category: true,
          isbn: true,
          publisher: true,
          edition: true,
          publicationYear: true,
          language: true,
          description: true,
          totalCopies: true,
          availableCopies: true,
          // Only expose shelf/rack locations of available copies, zero loan/borrower info
          copies: {
            where: { status: 'AVAILABLE' },
            select: {
              rackLocation: true,
              shelfLocation: true,
            },
          },
        },
        orderBy: { title: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.book.count({ where }),
    ]);

    // Format copies shelf locations into unique summary strings (e.g. "Rack A, Shelf 2")
    const formatted = books.map((b) => {
      const locations = Array.from(
        new Set(
          b.copies
            .filter((c) => c.rackLocation || c.shelfLocation)
            .map((c) =>
              [c.rackLocation && `Rack ${c.rackLocation}`, c.shelfLocation && `Shelf ${c.shelfLocation}`]
                .filter(Boolean)
                .join(', '),
            ),
        ),
      );

      return {
        id: b.id,
        title: b.title,
        author: b.author,
        category: b.category,
        isbn: b.isbn,
        publisher: b.publisher,
        edition: b.edition,
        publicationYear: b.publicationYear,
        language: b.language,
        description: b.description,
        totalCopies: b.totalCopies,
        availableCopies: b.availableCopies,
        shelfLocations: locations,
      };
    });

    return {
      data: formatted,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * My Loans: View only the authenticated student's active and historical loans.
   */
  async getMyLoans(schoolId: string, userId: string) {
    const student = await this.resolveActiveStudent(schoolId, userId);
    const now = new Date();

    const loans = await this.prisma.bookLoan.findMany({
      where: {
        schoolId,
        studentId: student.id,
      },
      include: {
        copy: {
          select: {
            accessionNumber: true,
            barcode: true,
            rackLocation: true,
            shelfLocation: true,
            book: {
              select: {
                id: true,
                title: true,
                author: true,
                category: true,
                isbn: true,
              },
            },
          },
        },
        fine: {
          select: {
            id: true,
            fineAmount: true,
            paidAmount: true,
            waivedAmount: true,
            status: true,
            reason: true,
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });

    const activeLoans = [];
    const pastLoans = [];

    for (const loan of loans) {
      const isOverdue =
        loan.status === LoanStatus.ACTIVE && loan.dueDate.getTime() < now.getTime();
      const item = {
        id: loan.id,
        bookTitle: loan.copy.book.title,
        bookAuthor: loan.copy.book.author,
        category: loan.copy.book.category,
        accessionNumber: loan.copy.accessionNumber,
        issuedAt: loan.issuedAt,
        dueDate: loan.dueDate,
        returnedAt: loan.returnedAt,
        status: loan.status,
        renewalCount: loan.renewalCount,
        isOverdue,
        fine: loan.fine,
      };

      if (loan.status === LoanStatus.ACTIVE) {
        activeLoans.push(item);
      } else {
        pastLoans.push(item);
      }
    }

    return {
      activeLoans,
      pastLoans,
      totalActive: activeLoans.length,
      totalPast: pastLoans.length,
    };
  }

  /**
   * My Fines: View only the authenticated student's library fines.
   * Strictly isolated from tuition invoices and academic fee balances.
   */
  async getMyFines(schoolId: string, userId: string) {
    const student = await this.resolveActiveStudent(schoolId, userId);

    const fines = await this.prisma.libraryFine.findMany({
      where: {
        schoolId,
        studentId: student.id,
      },
      include: {
        loan: {
          include: {
            copy: {
              include: {
                book: {
                  select: {
                    title: true,
                    author: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { assessedAt: 'desc' },
    });

    return fines.map((f) => ({
      id: f.id,
      bookTitle: f.loan?.copy?.book?.title || 'Unknown Title',
      reason: f.reason,
      overdueDays: f.overdueDays,
      fineAmount: f.fineAmount,
      paidAmount: f.paidAmount,
      waivedAmount: f.waivedAmount,
      status: f.status,
      assessedAt: f.assessedAt,
      resolvedAt: f.resolvedAt,
      paymentReference: f.paymentReference,
    }));
  }
}
