import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BorrowerType, LoanStatus, LibraryFineStatus, Prisma } from '@prisma/client';
import { LibraryCatalogueService } from './services/library-catalogue.service';
import { LibraryCirculationService } from './services/library-circulation.service';
import { LibraryFinesService } from './services/library-fines.service';
import { LibrarySettingsService } from './services/library-settings.service';
import { LibraryStudentService } from './services/library-student.service';

describe('LibraryServices — Business Logic, Circulation Lifecycle & Tenant Isolation', () => {
  let prismaMock: any;
  let settingsService: LibrarySettingsService;
  let catalogueService: LibraryCatalogueService;
  let circulationService: LibraryCirculationService;
  let finesService: LibraryFinesService;
  let studentService: LibraryStudentService;

  const mockSchoolId = '11111111-1111-1111-1111-111111111111';
  const otherSchoolId = '22222222-2222-2222-2222-222222222222';

  const defaultSettings = {
    schoolId: mockSchoolId,
    maxBooksStudent: 3,
    maxBooksTeacher: 10,
    loanDurationDaysStudent: 14,
    loanDurationDaysTeacher: 30,
    maxRenewals: 2,
    finePerDay: new Prisma.Decimal('2.00'),
    gracePeriodDays: 2,
    allowRenewWithOverdue: false,
  };

  beforeEach(() => {
    prismaMock = {
      book: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      bookCopy: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      bookLoan: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      libraryFine: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      librarySetting: {
        findUnique: jest.fn().mockResolvedValue(defaultSettings),
        create: jest.fn().mockResolvedValue(defaultSettings),
        update: jest.fn(),
      },
      student: {
        findFirst: jest.fn(),
      },
      teacher: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prismaMock)),
    };

    settingsService = new LibrarySettingsService(prismaMock);
    catalogueService = new LibraryCatalogueService(prismaMock);
    circulationService = new LibraryCirculationService(prismaMock, settingsService);
    finesService = new LibraryFinesService(prismaMock);
    studentService = new LibraryStudentService(prismaMock);
  });

  describe('Multi-Tenant Isolation', () => {
    it('scopes book search strictly to target schoolId', async () => {
      prismaMock.book.findMany.mockResolvedValue([]);
      prismaMock.book.count.mockResolvedValue(0);

      await catalogueService.getBooks(mockSchoolId, { search: 'biology' });

      expect(prismaMock.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ schoolId: mockSchoolId }),
        }),
      );
    });

    it('searches books by barcode and accession number in addition to title, author, and ISBN', async () => {
      prismaMock.book.findMany.mockResolvedValue([]);
      prismaMock.book.count.mockResolvedValue(0);

      await catalogueService.getBooks(mockSchoolId, { search: 'BC-10001' });

      expect(prismaMock.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            schoolId: mockSchoolId,
            OR: expect.arrayContaining([
              { title: { contains: 'BC-10001', mode: 'insensitive' } },
              { author: { contains: 'BC-10001', mode: 'insensitive' } },
              { isbn: { contains: 'BC-10001', mode: 'insensitive' } },
              { copies: { some: { barcode: { contains: 'BC-10001', mode: 'insensitive' } } } },
              { copies: { some: { accessionNumber: { contains: 'BC-10001', mode: 'insensitive' } } } },
            ]),
          }),
        }),
      );
    });

    it('rejects copy creation if accession number exists in same school', async () => {
      prismaMock.book.findFirst.mockResolvedValue({ id: 'book-1', schoolId: mockSchoolId });
      prismaMock.bookCopy.findUnique.mockResolvedValue({ id: 'copy-existing', accessionNumber: 'ACC-001' });

      await expect(
        catalogueService.createCopy(mockSchoolId, 'book-1', { accessionNumber: 'ACC-001' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Student Privacy & Self-Service Isolation', () => {
    it('never exposes borrower identities or loan IDs in student catalogue search', async () => {
      prismaMock.book.findMany.mockResolvedValue([
        {
          id: 'book-1',
          title: 'Physics for Engineers',
          author: 'Halliday',
          category: 'Science',
          totalCopies: 4,
          availableCopies: 2,
          copies: [
            { rackLocation: 'B', shelfLocation: '3' },
            { rackLocation: 'B', shelfLocation: '3' },
          ],
        },
      ]);
      prismaMock.book.count.mockResolvedValue(1);

      const result = await studentService.getCatalogue(mockSchoolId, {});

      expect(result.data[0]).toHaveProperty('availableCopies', 2);
      expect(result.data[0]).toHaveProperty('shelfLocations', ['Rack B, Shelf 3']);
      // Confirm NO borrower, studentId, or loans leaked
      expect(result.data[0]).not.toHaveProperty('studentId');
      expect(result.data[0]).not.toHaveProperty('loans');
      expect(result.data[0]).not.toHaveProperty('borrower');
    });

    it('derives student strictly from authenticated userId and rejects when profile not found', async () => {
      prismaMock.student.findFirst.mockResolvedValue(null);

      await expect(
        studentService.getMyLoans(mockSchoolId, 'unknown-user'),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.student.findFirst).toHaveBeenCalledWith({
        where: { schoolId: mockSchoolId, userId: 'unknown-user', status: 'ACTIVE' },
      });
    });

    it('returns only the authenticated student loans separated into active and past', async () => {
      prismaMock.student.findFirst.mockResolvedValue({
        id: 'stud-verified-01',
        schoolId: mockSchoolId,
        userId: 'usr-student',
      });

      const futureDate = new Date(Date.now() + 7 * 86400000);
      const pastDate = new Date(Date.now() - 30 * 86400000);

      prismaMock.bookLoan.findMany.mockResolvedValue([
        {
          id: 'loan-active',
          schoolId: mockSchoolId,
          studentId: 'stud-verified-01',
          status: LoanStatus.ACTIVE,
          dueDate: futureDate,
          issuedAt: new Date(),
          returnedAt: null,
          renewalCount: 0,
          copy: {
            accessionNumber: 'ACC-01',
            barcode: 'BC-01',
            book: { title: 'Chemistry', author: 'NCERT', category: 'Science' },
          },
          fine: null,
        },
        {
          id: 'loan-returned',
          schoolId: mockSchoolId,
          studentId: 'stud-verified-01',
          status: LoanStatus.RETURNED,
          dueDate: pastDate,
          issuedAt: pastDate,
          returnedAt: pastDate,
          renewalCount: 0,
          copy: {
            accessionNumber: 'ACC-02',
            barcode: 'BC-02',
            book: { title: 'History', author: 'NCERT', category: 'Humanities' },
          },
          fine: null,
        },
      ]);

      const result = await studentService.getMyLoans(mockSchoolId, 'usr-student');

      expect(result.totalActive).toBe(1);
      expect(result.totalPast).toBe(1);
      expect(result.activeLoans[0].bookTitle).toBe('Chemistry');
      expect(result.pastLoans[0].bookTitle).toBe('History');
    });
  });

  describe('Circulation Lifecycle: Issue, Return, Renew', () => {
    it('successfully issues an available copy and decrements availableCopies count', async () => {
      prismaMock.student.findFirst.mockResolvedValue({ id: 'stud-01', status: 'ACTIVE' });
      prismaMock.bookLoan.count.mockResolvedValue(1); // 1 active loan, max is 3

      prismaMock.bookCopy.findFirst.mockResolvedValue({
        id: 'copy-01',
        bookId: 'book-01',
        accessionNumber: 'ACC-001',
        status: 'AVAILABLE',
      });

      prismaMock.bookLoan.create.mockResolvedValue({
        id: 'loan-new',
        status: LoanStatus.ACTIVE,
        borrowerType: BorrowerType.STUDENT,
        studentId: 'stud-01',
      });

      const result = await circulationService.issueBook(mockSchoolId, 'librarian-01', {
        copyId: 'copy-01',
        borrowerType: BorrowerType.STUDENT,
        studentId: 'stud-01',
      });

      expect(prismaMock.bookCopy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { schoolId_id: { schoolId: mockSchoolId, id: 'copy-01' } },
          data: { status: 'ISSUED' },
        }),
      );
      expect(prismaMock.book.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { schoolId_id: { schoolId: mockSchoolId, id: 'book-01' } },
          data: { availableCopies: { decrement: 1 } },
        }),
      );
      expect(result.id).toBe('loan-new');
    });

    it('rejects issue when student has reached max active loan limit', async () => {
      prismaMock.student.findFirst.mockResolvedValue({ id: 'stud-01', status: 'ACTIVE' });
      prismaMock.bookLoan.count.mockResolvedValue(3); // already 3 active loans (limit is 3)

      await expect(
        circulationService.issueBook(mockSchoolId, 'librarian-01', {
          copyId: 'copy-01',
          borrowerType: BorrowerType.STUDENT,
          studentId: 'stud-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects issue when book copy is already ISSUED', async () => {
      prismaMock.student.findFirst.mockResolvedValue({ id: 'stud-01', status: 'ACTIVE' });
      prismaMock.bookLoan.count.mockResolvedValue(0);

      prismaMock.bookCopy.findFirst.mockResolvedValue({
        id: 'copy-01',
        accessionNumber: 'ACC-001',
        status: 'ISSUED',
      });

      await expect(
        circulationService.issueBook(mockSchoolId, 'librarian-01', {
          copyId: 'copy-01',
          borrowerType: BorrowerType.STUDENT,
          studentId: 'stud-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('calculates overdue fines on return beyond grace period and assesses pending LibraryFine', async () => {
      // 5 days overdue, grace period is 2 days -> 3 billable days * ₹2.00 = ₹6.00
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

      prismaMock.bookLoan.findFirst.mockResolvedValue({
        id: 'loan-overdue',
        schoolId: mockSchoolId,
        copyId: 'copy-01',
        borrowerType: BorrowerType.STUDENT,
        studentId: 'stud-01',
        dueDate: fiveDaysAgo,
        copy: {
          id: 'copy-01',
          bookId: 'book-01',
          accessionNumber: 'ACC-001',
          condition: 'GOOD',
        },
      });

      prismaMock.bookLoan.update.mockResolvedValue({ id: 'loan-overdue', status: LoanStatus.RETURNED });
      prismaMock.libraryFine.create.mockResolvedValue({
        id: 'fine-01',
        fineAmount: new Prisma.Decimal('6.00'),
        overdueDays: 3,
        status: 'PENDING',
      });

      const result = await circulationService.returnBook(mockSchoolId, 'librarian-01', {
        loanId: 'loan-overdue',
      });

      expect(prismaMock.libraryFine.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            schoolId: mockSchoolId,
            loanId: 'loan-overdue',
            overdueDays: 3,
            fineAmount: new Prisma.Decimal('6.00'),
            status: 'PENDING',
          }),
        }),
      );
      expect(prismaMock.bookCopy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { condition: 'GOOD', status: 'AVAILABLE' },
        }),
      );
      expect(prismaMock.book.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { availableCopies: { increment: 1 } },
        }),
      );
      expect(result.fine).toBeDefined();
    });

    it('renews loan and extends due date when within maxRenewals', async () => {
      const futureDueDate = new Date(Date.now() + 5 * 86400000);

      prismaMock.bookLoan.findFirst.mockResolvedValue({
        id: 'loan-renew',
        schoolId: mockSchoolId,
        status: LoanStatus.ACTIVE,
        renewalCount: 1, // max is 2
        borrowerType: BorrowerType.STUDENT,
        dueDate: futureDueDate,
      });

      prismaMock.bookLoan.update.mockResolvedValue({
        id: 'loan-renew',
        renewalCount: 2,
      });

      await circulationService.renewBook(mockSchoolId, { loanId: 'loan-renew' });

      expect(prismaMock.bookLoan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            renewalCount: { increment: 1 },
          }),
        }),
      );
    });

    it('rejects renewal when maxRenewals is exceeded', async () => {
      prismaMock.bookLoan.findFirst.mockResolvedValue({
        id: 'loan-renew',
        schoolId: mockSchoolId,
        status: LoanStatus.ACTIVE,
        renewalCount: 2, // limit is 2
        borrowerType: BorrowerType.STUDENT,
        dueDate: new Date(Date.now() + 5 * 86400000),
      });

      await expect(
        circulationService.renewBook(mockSchoolId, { loanId: 'loan-renew' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Library Fine Settlements & Waivers', () => {
    it('records desk collection and assigns receipt reference', async () => {
      prismaMock.libraryFine.findFirst.mockResolvedValue({
        id: 'fine-01',
        schoolId: mockSchoolId,
        fineAmount: new Prisma.Decimal('10.00'),
        paidAmount: new Prisma.Decimal('0.00'),
        waivedAmount: new Prisma.Decimal('0.00'),
        status: LibraryFineStatus.PENDING,
      });

      prismaMock.libraryFine.update.mockResolvedValue({
        id: 'fine-01',
        status: LibraryFineStatus.PAID,
        paidAmount: new Prisma.Decimal('10.00'),
      });

      const result = await finesService.collectFine(mockSchoolId, 'fine-01', 'staff-01', {
        paidAmount: 10.0,
      });

      expect(prismaMock.libraryFine.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: LibraryFineStatus.PAID,
            paidAmount: new Prisma.Decimal('10.00'),
            collectedByUserId: 'staff-01',
          }),
        }),
      );
      expect(result.receiptNumber).toMatch(/^LIB-REC-/);
    });

    it('records authorized fine waiver with written justification', async () => {
      prismaMock.libraryFine.findFirst.mockResolvedValue({
        id: 'fine-02',
        schoolId: mockSchoolId,
        fineAmount: new Prisma.Decimal('20.00'),
        paidAmount: new Prisma.Decimal('0.00'),
        waivedAmount: new Prisma.Decimal('0.00'),
        status: LibraryFineStatus.PENDING,
      });

      prismaMock.libraryFine.update.mockResolvedValue({
        id: 'fine-02',
        status: LibraryFineStatus.WAIVED,
        waivedAmount: new Prisma.Decimal('20.00'),
        waiveReason: 'Medical absence verified by school nurse',
      });

      const result = await finesService.waiveFine(mockSchoolId, 'fine-02', 'admin-01', {
        waiveReason: 'Medical absence verified by school nurse',
      });

      expect(prismaMock.libraryFine.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: LibraryFineStatus.WAIVED,
            waivedAmount: new Prisma.Decimal('20.00'),
            waiveReason: 'Medical absence verified by school nurse',
            waivedByUserId: 'admin-01',
          }),
        }),
      );
      expect(result.message).toContain('waived successfully');
    });
  });
});
