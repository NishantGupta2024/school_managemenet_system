import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BookQueryDto, CreateBookDto, UpdateBookDto } from '../dto/book.dto';
import { CreateCopyDto, UpdateCopyDto } from '../dto/copy.dto';
import { BookCopyStatus, Prisma } from '@prisma/client';

@Injectable()
export class LibraryCatalogueService {
  private readonly logger = new Logger(LibraryCatalogueService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search and paginate book catalogue with copy counts.
   */
  async getBooks(schoolId: string, query: BookQueryDto) {
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
        include: {
          copies: {
            select: {
              id: true,
              accessionNumber: true,
              barcode: true,
              rackLocation: true,
              shelfLocation: true,
              condition: true,
              status: true,
            },
          },
        },
        orderBy: { title: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.book.count({ where }),
    ]);

    return {
      data: books,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single book by ID with copies.
   */
  async getBookById(schoolId: string, id: string) {
    const book = await this.prisma.book.findFirst({
      where: { schoolId, id },
      include: {
        copies: {
          orderBy: { accessionNumber: 'asc' },
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book with ID "${id}" not found in this school`);
    }

    return book;
  }

  /**
   * Add a new book title to the catalogue.
   */
  async createBook(schoolId: string, dto: CreateBookDto) {
    const book = await this.prisma.book.create({
      data: {
        schoolId,
        title: dto.title.trim(),
        author: dto.author.trim(),
        category: dto.category.trim(),
        isbn: dto.isbn?.trim() || null,
        publisher: dto.publisher?.trim() || null,
        edition: dto.edition?.trim() || null,
        publicationYear: dto.publicationYear || null,
        language: dto.language?.trim() || 'English',
        description: dto.description?.trim() || null,
        totalCopies: 0,
        availableCopies: 0,
      },
    });

    this.logger.log(`Created book "${book.title}" (ID: ${book.id}) for school ${schoolId}`);
    return book;
  }

  /**
   * Edit book metadata.
   */
  async updateBook(schoolId: string, id: string, dto: UpdateBookDto) {
    await this.getBookById(schoolId, id);

    const updated = await this.prisma.book.update({
      where: {
        schoolId_id: { schoolId, id },
      },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.author !== undefined && { author: dto.author.trim() }),
        ...(dto.category !== undefined && { category: dto.category.trim() }),
        ...(dto.isbn !== undefined && { isbn: dto.isbn?.trim() || null }),
        ...(dto.publisher !== undefined && { publisher: dto.publisher?.trim() || null }),
        ...(dto.edition !== undefined && { edition: dto.edition?.trim() || null }),
        ...(dto.publicationYear !== undefined && { publicationYear: dto.publicationYear }),
        ...(dto.language !== undefined && { language: dto.language.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
      },
    });

    return updated;
  }

  /**
   * Delete book title (strictly rejected if active loans exist).
   */
  async deleteBook(schoolId: string, id: string) {
    const book = await this.getBookById(schoolId, id);

    // Verify no active loans on any copies of this book
    const activeLoans = await this.prisma.bookLoan.count({
      where: {
        schoolId,
        copy: { bookId: id },
        status: { in: ['ACTIVE', 'OVERDUE'] },
      },
    });

    if (activeLoans > 0) {
      throw new BadRequestException(
        `Cannot delete book "${book.title}": ${activeLoans} copy/copies are currently on active loan`,
      );
    }

    await this.prisma.book.delete({
      where: {
        schoolId_id: { schoolId, id },
      },
    });

    this.logger.log(`Deleted book "${book.title}" (ID: ${id}) from school ${schoolId}`);
    return { success: true, message: `Book "${book.title}" deleted successfully` };
  }

  /**
   * Add a physical copy to an existing book.
   */
  async createCopy(schoolId: string, bookId: string, dto: CreateCopyDto) {
    const book = await this.getBookById(schoolId, bookId);

    // Check accession number uniqueness per school
    const existing = await this.prisma.bookCopy.findUnique({
      where: {
        schoolId_accessionNumber: {
          schoolId,
          accessionNumber: dto.accessionNumber.trim(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Accession number "${dto.accessionNumber}" already exists in this school`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const copy = await tx.bookCopy.create({
        data: {
          schoolId,
          bookId,
          accessionNumber: dto.accessionNumber.trim(),
          barcode: dto.barcode?.trim() || null,
          rackLocation: dto.rackLocation?.trim() || null,
          shelfLocation: dto.shelfLocation?.trim() || null,
          condition: dto.condition || 'GOOD',
          status: 'AVAILABLE',
          purchasePrice: dto.purchasePrice !== undefined ? new Prisma.Decimal(dto.purchasePrice) : null,
          notes: dto.notes?.trim() || null,
        },
      });

      await tx.book.update({
        where: { schoolId_id: { schoolId, id: bookId } },
        data: {
          totalCopies: { increment: 1 },
          availableCopies: { increment: 1 },
        },
      });

      this.logger.log(
        `Added copy ${copy.accessionNumber} for book "${book.title}" in school ${schoolId}`,
      );
      return copy;
    });
  }

  /**
   * Update physical copy (shelf location, condition, status).
   */
  async updateCopy(schoolId: string, copyId: string, dto: UpdateCopyDto) {
    const copy = await this.prisma.bookCopy.findFirst({
      where: { schoolId, id: copyId },
      include: { book: true },
    });

    if (!copy) {
      throw new NotFoundException(`Book copy with ID "${copyId}" not found in this school`);
    }

    // Status transition guards
    if (dto.status && dto.status !== copy.status) {
      if (copy.status === 'ISSUED' && dto.status !== 'ISSUED') {
        throw new BadRequestException(
          'Cannot manually change status of an ISSUED copy. Use circulation return instead.',
        );
      }
      if (dto.status === 'ISSUED' && copy.status !== 'ISSUED') {
        throw new BadRequestException(
          'Cannot manually set status to ISSUED. Use circulation issue instead.',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let availableDelta = 0;
      if (dto.status && dto.status !== copy.status) {
        if (copy.status === 'AVAILABLE' && dto.status !== 'AVAILABLE') {
          availableDelta = -1;
        } else if (copy.status !== 'AVAILABLE' && dto.status === 'AVAILABLE') {
          availableDelta = 1;
        }
      }

      const updated = await tx.bookCopy.update({
        where: { schoolId_id: { schoolId, id: copyId } },
        data: {
          ...(dto.rackLocation !== undefined && { rackLocation: dto.rackLocation?.trim() || null }),
          ...(dto.shelfLocation !== undefined && {
            shelfLocation: dto.shelfLocation?.trim() || null,
          }),
          ...(dto.condition !== undefined && { condition: dto.condition }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
        },
      });

      if (availableDelta !== 0) {
        await tx.book.update({
          where: { schoolId_id: { schoolId, id: copy.bookId } },
          data: {
            availableCopies: { increment: availableDelta },
          },
        });
      }

      return updated;
    });
  }
}
