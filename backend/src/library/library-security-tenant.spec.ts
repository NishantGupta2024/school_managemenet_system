import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, LoanStatus, BorrowerType, Prisma } from '@prisma/client';
import { LibraryStaffController } from './controllers/library-staff.controller';
import { LibraryStudentController } from './controllers/library-student.controller';
import { LibraryCatalogueService } from './services/library-catalogue.service';
import { LibraryCirculationService } from './services/library-circulation.service';
import { LibraryExcelImportService } from './services/library-excel-import.service';
import { LibraryFinesService } from './services/library-fines.service';
import { LibrarySettingsService } from './services/library-settings.service';
import { LibraryStudentService } from './services/library-student.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../common/auth/roles.guard';
import { Reflector } from '@nestjs/core';

describe('Library System Security, Multi-Tenant & Circulation Edge Verification (Phase 5)', () => {
  let staffController: LibraryStaffController;
  let studentController: LibraryStudentController;
  let catalogueService: LibraryCatalogueService;
  let circulationService: LibraryCirculationService;
  let finesService: LibraryFinesService;
  let settingsService: LibrarySettingsService;
  let studentService: LibraryStudentService;

  const schoolA = '11111111-1111-1111-1111-111111111111';
  const schoolB = '22222222-2222-2222-2222-222222222222';

  const mockPrisma = {
    book: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    bookCopy: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    bookLoan: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    libraryFine: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    librarySetting: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    student: {
      findFirst: jest.fn(),
    },
    teacher: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (cb) => cb(mockPrisma)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LibraryStaffController, LibraryStudentController],
      providers: [
        LibraryCatalogueService,
        LibraryCirculationService,
        LibraryExcelImportService,
        LibraryFinesService,
        LibrarySettingsService,
        LibraryStudentService,
        { provide: PrismaService, useValue: mockPrisma },
        Reflector,
      ],
    }).compile();

    staffController = module.get<LibraryStaffController>(LibraryStaffController);
    studentController = module.get<LibraryStudentController>(LibraryStudentController);
    catalogueService = module.get<LibraryCatalogueService>(LibraryCatalogueService);
    circulationService = module.get<LibraryCirculationService>(LibraryCirculationService);
    finesService = module.get<LibraryFinesService>(LibraryFinesService);
    settingsService = module.get<LibrarySettingsService>(LibrarySettingsService);
    studentService = module.get<LibraryStudentService>(LibraryStudentService);
  });

  describe('Pillar 1: Parent Account Strict RBAC Rejection', () => {
    it('verifies RolesGuard metadata on all Staff endpoints excludes PARENT role', () => {
      const reflector = new Reflector();

      // Check createBook
      const createBookRoles = reflector.get<UserRole[]>('roles', staffController.createBook);
      expect(createBookRoles).not.toContain(UserRole.PARENT);
      expect(createBookRoles).toContain(UserRole.LIBRARIAN);
      expect(createBookRoles).toContain(UserRole.SCHOOL_ADMIN);

      // Check issueBook
      const issueRoles = reflector.get<UserRole[]>('roles', staffController.issueBook);
      expect(issueRoles).not.toContain(UserRole.PARENT);

      // Check returnBook
      const returnRoles = reflector.get<UserRole[]>('roles', staffController.returnBook);
      expect(returnRoles).not.toContain(UserRole.PARENT);

      // Check collectFine
      const collectRoles = reflector.get<UserRole[]>('roles', staffController.collectFine);
      expect(collectRoles).not.toContain(UserRole.PARENT);

      // Check updateSettings
      const settingsRoles = reflector.get<UserRole[]>('roles', staffController.updateSettings);
      expect(settingsRoles).not.toContain(UserRole.PARENT);
      expect(settingsRoles).not.toContain(UserRole.LIBRARIAN); // Settings is admin only
      expect(settingsRoles).toContain(UserRole.SCHOOL_ADMIN);

      // Check catalogue Excel import endpoints
      const templateRoles = reflector.get<UserRole[]>('roles', staffController.downloadCatalogueTemplate);
      expect(templateRoles).not.toContain(UserRole.PARENT);
      expect(templateRoles).not.toContain(UserRole.STUDENT);
      expect(templateRoles).not.toContain(UserRole.TEACHER);
      expect(templateRoles).not.toContain(UserRole.FEE_STAFF);
      expect(templateRoles).toContain(UserRole.LIBRARIAN);
      expect(templateRoles).toContain(UserRole.SCHOOL_ADMIN);

      const previewRoles = reflector.get<UserRole[]>('roles', staffController.previewCatalogueImport);
      expect(previewRoles).not.toContain(UserRole.PARENT);
      expect(previewRoles).not.toContain(UserRole.STUDENT);
      expect(previewRoles).not.toContain(UserRole.TEACHER);
      expect(previewRoles).not.toContain(UserRole.FEE_STAFF);
      expect(previewRoles).toContain(UserRole.LIBRARIAN);
      expect(previewRoles).toContain(UserRole.SCHOOL_ADMIN);

      const confirmRoles = reflector.get<UserRole[]>('roles', staffController.confirmCatalogueImport);
      expect(confirmRoles).not.toContain(UserRole.PARENT);
      expect(confirmRoles).not.toContain(UserRole.STUDENT);
      expect(confirmRoles).not.toContain(UserRole.TEACHER);
      expect(confirmRoles).not.toContain(UserRole.FEE_STAFF);
      expect(confirmRoles).toContain(UserRole.LIBRARIAN);
      expect(confirmRoles).toContain(UserRole.SCHOOL_ADMIN);
    });

    it('verifies RolesGuard metadata on Student endpoints excludes PARENT role', () => {
      const reflector = new Reflector();

      const catalogueRoles = reflector.get<UserRole[]>('roles', studentController.getCatalogue);
      expect(catalogueRoles).not.toContain(UserRole.PARENT);
      expect(catalogueRoles).toEqual([UserRole.STUDENT]);

      const myLoansRoles = reflector.get<UserRole[]>('roles', studentController.getMyLoans);
      expect(myLoansRoles).not.toContain(UserRole.PARENT);
      expect(myLoansRoles).toEqual([UserRole.STUDENT]);

      const myFinesRoles = reflector.get<UserRole[]>('roles', studentController.getMyFines);
      expect(myFinesRoles).not.toContain(UserRole.PARENT);
      expect(myFinesRoles).toEqual([UserRole.STUDENT]);
    });
  });

  describe('Pillar 2: Multi-Tenant Scoping & Isolation', () => {
    it('rejects copy lookup across schools (School A cannot see School B copy)', async () => {
      mockPrisma.librarySetting.findUnique.mockResolvedValue({
        id: 'set-01',
        schoolId: schoolA,
        maxBooksStudent: 3,
        loanDurationDaysStudent: 14,
      });
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-01', status: 'ACTIVE' });
      mockPrisma.bookLoan.count.mockResolvedValue(0);
      mockPrisma.bookCopy.findFirst.mockResolvedValue(null);

      await expect(
        circulationService.issueBook(schoolA, 'staff-01', {
          copyId: 'copy-in-school-b',
          borrowerType: BorrowerType.STUDENT,
          studentId: 'student-01',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.bookCopy.findFirst).toHaveBeenCalledWith({
        where: { schoolId: schoolA, id: 'copy-in-school-b' },
        include: { book: true },
      });
    });

    it('enforces accession uniqueness per school, allowing same accession in different schools', async () => {
      // In school A, ACC-101 exists -> conflict
      mockPrisma.book.findFirst.mockResolvedValue({ id: 'book-a', title: 'Book A' });
      mockPrisma.bookCopy.findUnique.mockResolvedValue({ id: 'existing-copy' });

      await expect(
        catalogueService.createCopy(schoolA, 'book-a', {
          accessionNumber: 'ACC-101',
        }),
      ).rejects.toThrow(ConflictException);

      // Check findUnique was scoped to school A
      expect(mockPrisma.bookCopy.findUnique).toHaveBeenCalledWith({
        where: {
          schoolId_accessionNumber: {
            schoolId: schoolA,
            accessionNumber: 'ACC-101',
          },
        },
      });
    });
  });

  describe('Pillar 3: Catalogue & Copy Lifecycle Safety Guards', () => {
    it('blocks deleting a book title when physical copies have active or overdue loans', async () => {
      mockPrisma.book.findFirst.mockResolvedValue({ id: 'book-01', title: 'Calculus' });
      mockPrisma.bookLoan.count.mockResolvedValue(2); // 2 active/overdue loans

      await expect(catalogueService.deleteBook(schoolA, 'book-01')).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrisma.bookLoan.count).toHaveBeenCalledWith({
        where: {
          schoolId: schoolA,
          copy: { bookId: 'book-01' },
          status: { in: ['ACTIVE', 'OVERDUE'] },
        },
      });
      expect(mockPrisma.book.delete).not.toHaveBeenCalled();
    });

    it('rejects manual status transition of an ISSUED copy without circulation check-in', async () => {
      mockPrisma.bookCopy.findFirst.mockResolvedValue({
        id: 'copy-01',
        schoolId: schoolA,
        status: 'ISSUED',
        book: { id: 'b1' },
      });

      await expect(
        catalogueService.updateCopy(schoolA, 'copy-01', {
          status: 'AVAILABLE',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Pillar 4: Circulation Business Rules & Edge State Transitions', () => {
    const mockSettingsRecord = {
      id: 'set-01',
      schoolId: schoolA,
      maxBooksStudent: 2,
      maxBooksTeacher: 5,
      loanDurationDaysStudent: 14,
      loanDurationDaysTeacher: 30,
      maxRenewals: 1,
      finePerDay: new Prisma.Decimal('5.00'),
      gracePeriodDays: 2,
      allowRenewWithOverdue: false,
    };

    beforeEach(() => {
      mockPrisma.librarySetting.findUnique.mockResolvedValue(mockSettingsRecord);
    });

    it('rejects issuing a book to a student who has reached max active loans (counting active and overdue)', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-01', status: 'ACTIVE' });
      mockPrisma.bookLoan.count.mockResolvedValue(2); // Already 2 active/overdue loans

      await expect(
        circulationService.issueBook(schoolA, 'staff-01', {
          copyId: 'copy-avail',
          borrowerType: BorrowerType.STUDENT,
          studentId: 'student-01',
        }),
      ).rejects.toThrow(/maximum borrowing limit of 2 active book\(s\)/);

      expect(mockPrisma.bookLoan.count).toHaveBeenCalledWith({
        where: {
          schoolId: schoolA,
          studentId: 'student-01',
          status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] },
        },
      });
    });

    it('rejects returning a loan that is already RETURNED (idempotency guard)', async () => {
      mockPrisma.bookLoan.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'loan-returned',
          schoolId: schoolA,
          status: LoanStatus.RETURNED,
          copy: { id: 'copy-01', accessionNumber: 'ACC-01' },
        });

      await expect(
        circulationService.returnBook(schoolA, 'staff-01', {
          loanId: 'loan-returned',
        }),
      ).rejects.toThrow(/already marked as RETURNED/);
    });

    it('rejects renewing a loan when renewal count has reached maxRenewals', async () => {
      mockPrisma.bookLoan.findFirst.mockResolvedValue({
        id: 'loan-maxed',
        schoolId: schoolA,
        status: LoanStatus.ACTIVE,
        renewalCount: 1, // maxRenewals is 1
        dueDate: new Date(Date.now() + 86400000),
        borrowerType: BorrowerType.STUDENT,
        copy: { accessionNumber: 'ACC-01' },
      });

      await expect(
        circulationService.renewBook(schoolA, {
          loanId: 'loan-maxed',
        }),
      ).rejects.toThrow(/maximum renewal limit/i);
    });

    it('rejects renewing an OVERDUE loan when allowRenewWithOverdue is false', async () => {
      mockPrisma.bookLoan.findFirst.mockResolvedValue({
        id: 'loan-overdue',
        schoolId: schoolA,
        status: LoanStatus.OVERDUE,
        renewalCount: 0,
        dueDate: new Date(Date.now() - 5 * 86400000),
        borrowerType: BorrowerType.STUDENT,
        copy: { accessionNumber: 'ACC-01' },
      });

      await expect(
        circulationService.renewBook(schoolA, {
          loanId: 'loan-overdue',
        }),
      ).rejects.toThrow(/Cannot renew an overdue loan/);
    });

    it('correctly calculates overdue fines on return after deducting gracePeriodDays', async () => {
      // Due 7 days ago. Grace period is 2 days. Overdue days = 5. Rate = ₹5.00/day. Fine = ₹25.00
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      mockPrisma.bookLoan.findFirst.mockResolvedValue({
        id: 'loan-late',
        schoolId: schoolA,
        status: LoanStatus.ACTIVE,
        dueDate: sevenDaysAgo,
        copyId: 'copy-late',
        borrowerType: BorrowerType.STUDENT,
        studentId: 'student-01',
        fine: null,
        copy: { id: 'copy-late', bookId: 'b-late', accessionNumber: 'ACC-LATE' },
      });
      mockPrisma.bookCopy.update.mockResolvedValue({});
      mockPrisma.book.update.mockResolvedValue({});
      mockPrisma.bookLoan.update.mockResolvedValue({
        id: 'loan-late',
        status: LoanStatus.RETURNED,
      });
      mockPrisma.libraryFine.create.mockResolvedValue({
        id: 'fine-calc',
        fineAmount: new Prisma.Decimal('25.00'),
        overdueDays: 5,
      });

      const res = await circulationService.returnBook(schoolA, 'staff-01', {
        loanId: 'loan-late',
      });

      expect(res.fine).toBeDefined();
      expect(mockPrisma.libraryFine.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            schoolId: schoolA,
            fineAmount: new Prisma.Decimal('25.00'),
            overdueDays: 5,
            status: 'PENDING',
          }),
        }),
      );
    });
  });

  describe('Pillar 5: Student Privacy & Zero-Leak Self-Service', () => {
    it('getCatalogue never exposes borrower names or loans in student catalogue response', async () => {
      mockPrisma.book.findMany.mockResolvedValue([
        {
          id: 'book-01',
          title: 'Clean Code',
          author: 'Robert C. Martin',
          category: 'Computer Science',
          isbn: '978-0132350884',
          publisher: 'Prentice Hall',
          edition: '1st',
          publicationYear: 2008,
          language: 'English',
          description: 'Software handbook',
          totalCopies: 5,
          availableCopies: 2,
          copies: [
            { rackLocation: 'A', shelfLocation: '1' },
            { rackLocation: 'A', shelfLocation: '2' },
          ],
        },
      ]);
      mockPrisma.book.count.mockResolvedValue(1);

      const result = await studentService.getCatalogue(schoolA, { search: 'Clean Code' });

      expect(result.data.length).toBe(1);
      const book = result.data[0];
      expect(book.title).toBe('Clean Code');
      expect(book.availableCopies).toBe(2);
      expect(book.totalCopies).toBe(5);
      expect(book.shelfLocations).toEqual(['Rack A, Shelf 1', 'Rack A, Shelf 2']);

      // Strict privacy assertions: No borrower identity fields exist on returned object
      expect((book as any).loans).toBeUndefined();
      expect((book as any).borrower).toBeUndefined();
      expect((book as any).borrowerName).toBeUndefined();
      expect((book as any).borrowerStudentId).toBeUndefined();
    });

    it('getMyLoans queries exclusively by authenticated student ID', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({
        id: 'student-real-id',
        userId: 'user-auth-id',
        status: 'ACTIVE',
      });
      mockPrisma.bookLoan.findMany.mockResolvedValue([]);

      await studentService.getMyLoans(schoolA, 'user-auth-id');

      expect(mockPrisma.student.findFirst).toHaveBeenCalledWith({
        where: { schoolId: schoolA, userId: 'user-auth-id', status: 'ACTIVE' },
      });
      expect(mockPrisma.bookLoan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            schoolId: schoolA,
            studentId: 'student-real-id',
          },
        }),
      );
    });
  });
});
