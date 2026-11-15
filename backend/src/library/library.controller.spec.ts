import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../common/auth/roles.guard';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { LibraryStaffController } from './controllers/library-staff.controller';
import { LibraryStudentController } from './controllers/library-student.controller';
import { AcademicsController } from '../academics/academics.controller';
import { StudentsController } from '../students/students.controller';
import { LibraryCatalogueService } from './services/library-catalogue.service';
import { LibraryCirculationService } from './services/library-circulation.service';
import { LibraryExcelImportService } from './services/library-excel-import.service';
import { LibraryFinesService } from './services/library-fines.service';
import { LibrarySettingsService } from './services/library-settings.service';
import { LibraryStudentService } from './services/library-student.service';

import { PrismaService } from '../prisma/prisma.service';

describe('LibraryControllers — RBAC, Parent Exclusion & Route Delegation', () => {
  let staffController: LibraryStaffController;
  let studentController: LibraryStudentController;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  let catalogueServiceMock: Partial<Record<keyof LibraryCatalogueService, jest.Mock>>;
  let circulationServiceMock: Partial<Record<keyof LibraryCirculationService, jest.Mock>>;
  let finesServiceMock: Partial<Record<keyof LibraryFinesService, jest.Mock>>;
  let settingsServiceMock: Partial<Record<keyof LibrarySettingsService, jest.Mock>>;
  let studentServiceMock: Partial<Record<keyof LibraryStudentService, jest.Mock>>;

  const mockSchoolId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    catalogueServiceMock = {
      getBooks: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
      createBook: jest.fn().mockResolvedValue({ id: 'book-1', title: 'Calculus' }),
      updateBook: jest.fn().mockResolvedValue({ id: 'book-1', title: 'Calculus Advanced' }),
      deleteBook: jest.fn().mockResolvedValue({ success: true }),
      createCopy: jest.fn().mockResolvedValue({ id: 'copy-1', accessionNumber: 'ACC-001' }),
      updateCopy: jest.fn().mockResolvedValue({ id: 'copy-1', condition: 'GOOD' }),
    };

    circulationServiceMock = {
      issueBook: jest.fn().mockResolvedValue({ id: 'loan-1', status: 'ACTIVE' }),
      returnBook: jest.fn().mockResolvedValue({ loan: { id: 'loan-1', status: 'RETURNED' } }),
      renewBook: jest.fn().mockResolvedValue({ id: 'loan-1', renewalCount: 1 }),
      getLoans: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    };

    finesServiceMock = {
      getFines: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
      collectFine: jest.fn().mockResolvedValue({ fine: { id: 'fine-1', status: 'PAID' } }),
      waiveFine: jest.fn().mockResolvedValue({ fine: { id: 'fine-1', status: 'WAIVED' } }),
    };

    settingsServiceMock = {
      getOrCreateSettings: jest.fn().mockResolvedValue({ schoolId: mockSchoolId, maxBooksStudent: 3 }),
      updateSettings: jest.fn().mockResolvedValue({ schoolId: mockSchoolId, maxBooksStudent: 5 }),
    };

    studentServiceMock = {
      getCatalogue: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
      getMyLoans: jest.fn().mockResolvedValue({ activeLoans: [], pastLoans: [] }),
      getMyFines: jest.fn().mockResolvedValue([]),
    };

    const excelImportServiceMock = {
      generateTemplate: jest.fn().mockResolvedValue(Buffer.from('mock')),
      previewImport: jest.fn().mockResolvedValue({ canImport: true }),
      confirmImport: jest.fn().mockResolvedValue({ totalSubmitted: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LibraryStaffController, LibraryStudentController],
      providers: [
        { provide: LibraryCatalogueService, useValue: catalogueServiceMock },
        { provide: LibraryCirculationService, useValue: circulationServiceMock },
        { provide: LibraryExcelImportService, useValue: excelImportServiceMock },
        { provide: LibraryFinesService, useValue: finesServiceMock },
        { provide: LibrarySettingsService, useValue: settingsServiceMock },
        { provide: LibraryStudentService, useValue: studentServiceMock },
        { provide: PrismaService, useValue: {} },
        Reflector,
        RolesGuard,
      ],
    }).compile();

    staffController = module.get<LibraryStaffController>(LibraryStaffController);
    studentController = module.get<LibraryStudentController>(LibraryStudentController);
    rolesGuard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  function createMockExecutionContext(userRole: UserRole, handler: Function, classRef: any): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => classRef,
      switchToHttp: () => ({
        getRequest: () => ({
          school: { id: mockSchoolId },
          user: { id: 'user-001', role: userRole, schoolId: mockSchoolId },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  describe('Parent Role Absolute Exclusion', () => {
    it('strictly rejects PARENT access to staff catalogue endpoint with HTTP 403 Forbidden', () => {
      const context = createMockExecutionContext(
        UserRole.PARENT,
        staffController.getBooks,
        LibraryStaffController,
      );
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('strictly rejects PARENT access to circulation issue endpoint with HTTP 403 Forbidden', () => {
      const context = createMockExecutionContext(
        UserRole.PARENT,
        staffController.issueBook,
        LibraryStaffController,
      );
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('strictly rejects PARENT access to student self-service catalogue endpoint with HTTP 403 Forbidden', () => {
      const context = createMockExecutionContext(
        UserRole.PARENT,
        studentController.getCatalogue,
        LibraryStudentController,
      );
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('strictly rejects PARENT access to student loans endpoint with HTTP 403 Forbidden', () => {
      const context = createMockExecutionContext(
        UserRole.PARENT,
        studentController.getMyLoans,
        LibraryStudentController,
      );
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('Student Role Route Boundaries', () => {
    it('permits STUDENT to access student catalogue search', () => {
      const context = createMockExecutionContext(
        UserRole.STUDENT,
        studentController.getCatalogue,
        LibraryStudentController,
      );
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('permits STUDENT to access my-loans', () => {
      const context = createMockExecutionContext(
        UserRole.STUDENT,
        studentController.getMyLoans,
        LibraryStudentController,
      );
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('strictly rejects STUDENT from staff circulation issue endpoint with HTTP 403 Forbidden', () => {
      const context = createMockExecutionContext(
        UserRole.STUDENT,
        staffController.issueBook,
        LibraryStaffController,
      );
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('strictly rejects STUDENT from staff fine waiver endpoint with HTTP 403 Forbidden', () => {
      const context = createMockExecutionContext(
        UserRole.STUDENT,
        staffController.waiveFine,
        LibraryStaffController,
      );
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('Librarian & School Admin Role Authorization', () => {
    it('permits LIBRARIAN to manage catalogue and circulation', () => {
      const contextBooks = createMockExecutionContext(
        UserRole.LIBRARIAN,
        staffController.getBooks,
        LibraryStaffController,
      );
      const contextIssue = createMockExecutionContext(
        UserRole.LIBRARIAN,
        staffController.issueBook,
        LibraryStaffController,
      );
      expect(rolesGuard.canActivate(contextBooks)).toBe(true);
      expect(rolesGuard.canActivate(contextIssue)).toBe(true);
    });

    it('permits SCHOOL_ADMIN to delete book title and update settings', () => {
      const contextDelete = createMockExecutionContext(
        UserRole.SCHOOL_ADMIN,
        staffController.deleteBook,
        LibraryStaffController,
      );
      const contextSettings = createMockExecutionContext(
        UserRole.SCHOOL_ADMIN,
        staffController.updateSettings,
        LibraryStaffController,
      );
      expect(rolesGuard.canActivate(contextDelete)).toBe(true);
      expect(rolesGuard.canActivate(contextSettings)).toBe(true);
    });

    it('strictly rejects LIBRARIAN from deleting books (restricted to School Admin)', () => {
      const contextDelete = createMockExecutionContext(
        UserRole.LIBRARIAN,
        staffController.deleteBook,
        LibraryStaffController,
      );
      expect(() => rolesGuard.canActivate(contextDelete)).toThrow(ForbiddenException);
    });

    it('strictly rejects LIBRARIAN from altering school library settings (restricted to School Admin)', () => {
      const contextSettings = createMockExecutionContext(
        UserRole.LIBRARIAN,
        staffController.updateSettings,
        LibraryStaffController,
      );
      expect(() => rolesGuard.canActivate(contextSettings)).toThrow(ForbiddenException);
    });

    it('permits LIBRARIAN to read school grades/classes for circulation desk dropdowns', () => {
      const context = createMockExecutionContext(
        UserRole.LIBRARIAN,
        AcademicsController.prototype.getGrades,
        AcademicsController,
      );
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('permits LIBRARIAN to read student directory for circulation desk dropdowns', () => {
      const context = createMockExecutionContext(
        UserRole.LIBRARIAN,
        StudentsController.prototype.findAll,
        StudentsController,
      );
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('strictly rejects LIBRARIAN from creating grades or students', () => {
      const contextCreateGrade = createMockExecutionContext(
        UserRole.LIBRARIAN,
        AcademicsController.prototype.createGrade,
        AcademicsController,
      );
      const contextCreateStudent = createMockExecutionContext(
        UserRole.LIBRARIAN,
        StudentsController.prototype.createStudent,
        StudentsController,
      );
      expect(() => rolesGuard.canActivate(contextCreateGrade)).toThrow(ForbiddenException);
      expect(() => rolesGuard.canActivate(contextCreateStudent)).toThrow(ForbiddenException);
    });
  });

  describe('Staff Controller Route Handler Delegation', () => {
    const mockStaffReq = {
      school: { id: mockSchoolId },
      user: { id: 'staff-user-01', role: UserRole.LIBRARIAN },
    };

    it('delegates getBooks with tenant schoolId', async () => {
      await staffController.getBooks(mockStaffReq, { search: 'physics' });
      expect(catalogueServiceMock.getBooks).toHaveBeenCalledWith(mockSchoolId, { search: 'physics' });
    });

    it('delegates issueBook with schoolId, userId, and dto', async () => {
      const dto = { copyId: 'copy-123', studentId: 'stud-456' };
      await staffController.issueBook(mockStaffReq, dto as any);
      expect(circulationServiceMock.issueBook).toHaveBeenCalledWith(mockSchoolId, 'staff-user-01', dto);
    });

    it('delegates returnBook with schoolId, userId, and dto', async () => {
      const dto = { copyId: 'copy-123' };
      await staffController.returnBook(mockStaffReq, dto as any);
      expect(circulationServiceMock.returnBook).toHaveBeenCalledWith(mockSchoolId, 'staff-user-01', dto);
    });

    it('delegates renewBook with schoolId and dto', async () => {
      const dto = { loanId: 'loan-123' };
      await staffController.renewBook(mockStaffReq, dto as any);
      expect(circulationServiceMock.renewBook).toHaveBeenCalledWith(mockSchoolId, dto);
    });

    it('delegates collectFine with schoolId, fineId, userId, and dto', async () => {
      const dto = { paidAmount: 20 };
      await staffController.collectFine(mockStaffReq, 'fine-01', dto as any);
      expect(finesServiceMock.collectFine).toHaveBeenCalledWith(mockSchoolId, 'fine-01', 'staff-user-01', dto);
    });

    it('delegates waiveFine with schoolId, fineId, userId, and dto', async () => {
      const dto = { waiveReason: 'Approved by Principal' };
      await staffController.waiveFine(mockStaffReq, 'fine-01', dto as any);
      expect(finesServiceMock.waiveFine).toHaveBeenCalledWith(mockSchoolId, 'fine-01', 'staff-user-01', dto);
    });
  });

  describe('Student Controller Route Handler Delegation', () => {
    const mockStudentReq = {
      school: { id: mockSchoolId },
      user: { id: 'student-user-01', role: UserRole.STUDENT },
    };

    it('delegates getCatalogue with tenant schoolId', async () => {
      await studentController.getCatalogue(mockStudentReq, { search: 'geometry' });
      expect(studentServiceMock.getCatalogue).toHaveBeenCalledWith(mockSchoolId, { search: 'geometry' });
    });

    it('delegates getMyLoans strictly using session req.user.id', async () => {
      await studentController.getMyLoans(mockStudentReq);
      expect(studentServiceMock.getMyLoans).toHaveBeenCalledWith(mockSchoolId, 'student-user-01');
    });

    it('delegates getMyFines strictly using session req.user.id', async () => {
      await studentController.getMyFines(mockStudentReq);
      expect(studentServiceMock.getMyFines).toHaveBeenCalledWith(mockSchoolId, 'student-user-01');
    });
  });
});
