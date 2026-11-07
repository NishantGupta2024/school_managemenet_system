import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, StudentStatus } from '@prisma/client';
import { StudentsService } from './students.service';
import { AcademicsService } from '../academics/academics.service';
import { ExcelImportsService } from '../excel-imports/excel-imports.service';
import { FeeGenerationService } from '../fee-generation/fee-generation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PHASE 1C: End-to-End Integration Verification (Workflow, Compatibility & Security)', () => {
  let studentsService: StudentsService;
  let academicsService: AcademicsService;
  let excelImportsService: ExcelImportsService;
  let feeGenerationService: FeeGenerationService;
  let prisma: PrismaService;

  // Use School A (Tenant 1) and School B (Tenant 2)
  const schoolAId = '00000000-0000-0000-0000-000000000001';
  const schoolBId = '00000000-0000-0000-0000-000000000002';

  // Track entities created during test for complete cleanup
  const cleanup = {
    academicYearIds: [] as string[],
    gradeIds: [] as string[],
    sectionIds: [] as string[],
    studentIds: [] as string[],
    userIds: [] as string[],
    allocationIds: [] as string[],
    invoiceIds: [] as string[],
    paymentIds: [] as string[],
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsService,
        AcademicsService,
        ExcelImportsService,
        FeeGenerationService,
        PrismaService,
      ],
    }).compile();

    studentsService = module.get<StudentsService>(StudentsService);
    academicsService = module.get<AcademicsService>(AcademicsService);
    excelImportsService = module.get<ExcelImportsService>(ExcelImportsService);
    feeGenerationService = module.get<FeeGenerationService>(FeeGenerationService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    // 1. Delete parent relations
    if (cleanup.studentIds.length > 0) {
      await prisma.parentStudentRelation.deleteMany({
        where: { studentId: { in: cleanup.studentIds } },
      });
      // 2. Delete payments, allocations, invoices
      await prisma.paymentAllocation.deleteMany({
        where: { invoice: { studentId: { in: cleanup.studentIds } } },
      });
      await prisma.payment.deleteMany({
        where: { studentId: { in: cleanup.studentIds } },
      });
      await prisma.invoiceItem.deleteMany({
        where: { invoice: { studentId: { in: cleanup.studentIds } } },
      });
      await prisma.feeInvoice.deleteMany({
        where: { studentId: { in: cleanup.studentIds } },
      });
      await prisma.studentFeeAllocation.deleteMany({
        where: { studentId: { in: cleanup.studentIds } },
      });
      // 3. Delete students
      await prisma.student.deleteMany({
        where: { id: { in: cleanup.studentIds } },
      });
    }

    // 4. Delete users
    if (cleanup.userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: cleanup.userIds } },
      });
    }

    // 5. Delete sections, grades, academic years
    if (cleanup.sectionIds.length > 0) {
      await prisma.section.deleteMany({
        where: { id: { in: cleanup.sectionIds } },
      });
    }
    if (cleanup.gradeIds.length > 0) {
      await prisma.gradeClass.deleteMany({
        where: { id: { in: cleanup.gradeIds } },
      });
    }
    if (cleanup.academicYearIds.length > 0) {
      await prisma.academicYear.deleteMany({
        where: { id: { in: cleanup.academicYearIds } },
      });
    }

    await prisma.$disconnect();
  });

  // =========================================================================
  // SECTION 1: COMPLETE WORKFLOW VERIFICATION (STEPS 1 TO 8)
  // =========================================================================
  describe('1. Complete Workflow Verification (Steps 1 to 8)', () => {
    let testSession: any;
    let testGrade: any;
    let testSection: any;
    let admittedStudent: any;

    it('Step 1: Create an academic year', async () => {
      testSession = await academicsService.createAcademicYear(schoolAId, {
        name: `VERIF-2027-${Date.now()}`,
        startDate: '2027-06-01',
        endDate: '2028-05-31',
        isCurrent: false,
      });

      cleanup.academicYearIds.push(testSession.id);
      expect(testSession.id).toBeDefined();
      expect(testSession.schoolId).toBe(schoolAId);
    });

    it('Step 2: Create a grade and section', async () => {
      testGrade = await academicsService.createGrade(schoolAId, {
        name: 'Grade 12 Verification',
        code: `G12V-${Date.now()}`,
      });
      cleanup.gradeIds.push(testGrade.id);

      testSection = await academicsService.createSection(schoolAId, testGrade.id, {
        name: 'Alpha',
        capacity: 40,
      });
      cleanup.sectionIds.push(testSection.id);

      expect(testGrade.id).toBeDefined();
      expect(testSection.id).toBeDefined();
      expect(testSection.gradeId).toBe(testGrade.id);
    });

    it('Step 3: Admit a student using that academic structure', async () => {
      const admNo = `ADM-V-${Date.now()}`;
      admittedStudent = await studentsService.createStudent(schoolAId, {
        admissionNumber: admNo,
        firstName: 'Ananya',
        lastName: 'Verma',
        gradeId: testGrade.id,
        sectionId: testSection.id,
        academicYearId: testSession.id,
        rollNumber: 'R-01',
        guardianName: 'Sunil Verma',
        guardianPhone: '+91 9123456789',
        guardianEmail: 'sunil.verma@example.com',
        status: StudentStatus.ACTIVE,
      });

      cleanup.studentIds.push(admittedStudent.id);

      expect(admittedStudent.id).toBeDefined();
      expect(admittedStudent.admissionNumber).toBe(admNo.toUpperCase());
      expect(admittedStudent.firstName).toBe('Ananya');
      expect(admittedStudent.gradeId).toBe(testGrade.id);
      expect(admittedStudent.sectionId).toBe(testSection.id);
      expect(admittedStudent.academicYearId).toBe(testSession.id);
    });

    it('Step 4: Find the student using search and filters', async () => {
      // 4A: Search by admission number
      const searchRes: any = await studentsService.findStudents(schoolAId, {
        page: 1,
        limit: 10,
        search: admittedStudent.admissionNumber,
      });
      expect(searchRes.data.length).toBe(1);
      expect(searchRes.data[0].id).toBe(admittedStudent.id);

      // 4B: Filter by Grade, Section, Academic Year, and Status
      const filterRes: any = await studentsService.findStudents(schoolAId, {
        page: 1,
        limit: 10,
        gradeId: testGrade.id,
        sectionId: testSection.id,
        academicYearId: testSession.id,
        status: StudentStatus.ACTIVE,
      });
      expect(filterRes.data.length).toBe(1);
      expect(filterRes.data[0].id).toBe(admittedStudent.id);
    });

    it('Step 5: Open student profile and verify displayed academic information', async () => {
      const profile = await studentsService.getStudentProfile(schoolAId, admittedStudent.id);

      expect(profile.id).toBe(admittedStudent.id);
      expect(profile.admissionNumber).toBe(admittedStudent.admissionNumber);
      expect(profile.grade.name).toBe(testGrade.name);
      expect(profile.section.name).toBe(testSection.name);
      expect(profile.academicYear.name).toBe(testSession.name);
      expect(profile.guardianName).toBe('Sunil Verma');
      expect(profile.guardianPhone).toBe('+91 9123456789');
    });

    it('Step 6: Edit permitted demographic and guardian fields', async () => {
      const updated = await studentsService.updateStudent(schoolAId, admittedStudent.id, {
        firstName: 'Ananya (Updated)',
        guardianName: 'Sunil Kumar Verma',
        guardianPhone: '+91 9888877777',
        guardianEmail: 'sunil.updated@example.com',
        rollNumber: 'R-02',
      });

      expect(updated.firstName).toBe('Ananya (Updated)');
      expect(updated.guardianName).toBe('Sunil Kumar Verma');
      expect(updated.guardianPhone).toBe('+91 9888877777');
      expect(updated.guardianEmail).toBe('sunil.updated@example.com');
      expect(updated.rollNumber).toBe('R-02');
      // Academic placement remained intact
      expect(updated.gradeId).toBe(testGrade.id);
      expect(updated.sectionId).toBe(testSection.id);
    });

    it('Step 7: Verify existing fee statement and financial summary remain unchanged', async () => {
      const userContext = {
        id: 'admin-ctx-1',
        schoolId: schoolAId,
        role: UserRole.SCHOOL_ADMIN,
      };

      const statement = await feeGenerationService.getStudentFeeStatement(
        schoolAId,
        userContext,
        admittedStudent.id,
        testSession.id,
      );

      expect(statement).toBeDefined();
      expect(statement.student.id).toBe(admittedStudent.id);
      expect(statement.summary.totalGrossAmount).toBe(0);
      expect(statement.summary.totalPaidAmount).toBe(0);
      expect(statement.summary.totalRemainingAmount).toBe(0);
    });

    it('Step 8: Verify students with existing allocations or invoices cannot have academic placement changed', async () => {
      // Find or create fee structure
      let feeStructure = await prisma.feeStructure.findFirst({
        where: { schoolId: schoolAId },
      });

      // Create an allocation for this student
      const allocation = await prisma.studentFeeAllocation.create({
        data: {
          schoolId: schoolAId,
          studentId: admittedStudent.id,
          feeStructureId: feeStructure!.id,
          academicYearId: testSession.id,
          status: 'ACTIVE',
        },
      });
      cleanup.allocationIds.push(allocation.id);

      // Create a secondary grade to attempt moving the student to
      const secondGrade = await academicsService.createGrade(schoolAId, {
        name: 'Grade 11 Target',
        code: `G11T-${Date.now()}`,
      });
      cleanup.gradeIds.push(secondGrade.id);

      const secondSection = await academicsService.createSection(schoolAId, secondGrade.id, {
        name: 'Target-Sec',
        capacity: 35,
      });
      cleanup.sectionIds.push(secondSection.id);

      // Ordinary updateStudent MUST be rejected with BadRequestException
      await expect(
        studentsService.updateStudent(schoolAId, admittedStudent.id, {
          gradeId: secondGrade.id,
          sectionId: secondSection.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // SECTION 2: COMPATIBILITY VERIFICATION
  // =========================================================================
  describe('2. Compatibility Verification', () => {
    it('returns an unpaginated raw array when page parameter is omitted', async () => {
      const res: any = await studentsService.findStudents(schoolAId);
      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBeGreaterThan(0);
      expect(res[0].id).toBeDefined();
      expect(res[0].admissionNumber).toBeDefined();
    });

    it('returns a paginated { data, meta } structure when page parameter is provided', async () => {
      const res: any = await studentsService.findStudents(schoolAId, { page: 1, limit: 5 });
      expect(res.data).toBeDefined();
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.meta).toBeDefined();
      expect(res.meta.page).toBe(1);
      expect(res.meta.limit).toBe(5);
      expect(typeof res.meta.total).toBe('number');
      expect(typeof res.meta.totalPages).toBe('number');
    });

    it('ensures academic dropdowns return only records belonging to the authorized school', async () => {
      const gradesA = await academicsService.findGrades(schoolAId);
      expect(gradesA.every((g) => g.schoolId === schoolAId)).toBe(true);

      const gradesB = await academicsService.findGrades(schoolBId);
      expect(gradesB.every((g) => g.schoolId === schoolBId)).toBe(true);

      const yearsA = await academicsService.findAcademicYears(schoolAId);
      expect(yearsA.every((y) => y.schoolId === schoolAId)).toBe(true);
    });

    it('preserves student portal and parent portal account relationships', async () => {
      // Create student user
      const studentUser = await prisma.user.create({
        data: {
          schoolId: schoolAId,
          email: `portal-stud-${Date.now()}@test.edu`,
          passwordHash: 'dummyhash',
          name: 'Portal Student',
          role: UserRole.STUDENT,
        },
      });
      cleanup.userIds.push(studentUser.id);

      // Create student
      const session = await prisma.academicYear.findFirst({ where: { schoolId: schoolAId } });
      const grade = await prisma.gradeClass.findFirst({
        where: { schoolId: schoolAId },
        include: { sections: true },
      });

      const linkedStudent = await prisma.student.create({
        data: {
          schoolId: schoolAId,
          admissionNumber: `PORTAL-${Date.now()}`,
          firstName: 'Portal',
          lastName: 'Child',
          gradeId: grade!.id,
          sectionId: grade!.sections[0].id,
          academicYearId: session!.id,
          userId: studentUser.id,
          status: 'ACTIVE',
        },
      });
      cleanup.studentIds.push(linkedStudent.id);

      // Create verified parent user
      const parentUser = await prisma.user.create({
        data: {
          schoolId: schoolAId,
          email: `portal-par-${Date.now()}@test.edu`,
          passwordHash: 'dummyhash',
          name: 'Portal Parent',
          role: UserRole.PARENT,
        },
      });
      cleanup.userIds.push(parentUser.id);

      // Link parent to student
      await prisma.parentStudentRelation.create({
        data: {
          schoolId: schoolAId,
          parentId: parentUser.id,
          studentId: linkedStudent.id,
          relationshipType: 'FATHER',
          isVerified: true,
        },
      });

      // Verify student role gets ONLY their own profile
      const studentAccess = await studentsService.findAccessibleStudents(schoolAId, studentUser);
      expect(studentAccess.length).toBe(1);
      expect(studentAccess[0].id).toBe(linkedStudent.id);

      // Verify parent role gets verified child
      const parentAccess = await studentsService.findAccessibleStudents(schoolAId, parentUser);
      expect(parentAccess.length).toBe(1);
      expect(parentAccess[0].id).toBe(linkedStudent.id);
    });
  });

  // =========================================================================
  // SECTION 3: SECURITY & TENANT ISOLATION VERIFICATION
  // =========================================================================
  describe('3. Security & Cross-Tenant Isolation Verification', () => {
    it('rejects duplicate admission number within the same school', async () => {
      const existingStudent = await prisma.student.findFirst({
        where: { schoolId: schoolAId },
      });

      const session = await prisma.academicYear.findFirst({ where: { schoolId: schoolAId } });
      const grade = await prisma.gradeClass.findFirst({
        where: { schoolId: schoolAId },
        include: { sections: true },
      });

      await expect(
        studentsService.createStudent(schoolAId, {
          admissionNumber: existingStudent!.admissionNumber,
          firstName: 'Duplicate',
          lastName: 'Tester',
          gradeId: grade!.id,
          sectionId: grade!.sections[0].id,
          academicYearId: session!.id,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('strictly denies cross-tenant student lookup with 404 NotFoundException', async () => {
      const studentA = await prisma.student.findFirst({
        where: { schoolId: schoolAId },
      });

      // School B attempting to fetch School A student
      await expect(
        studentsService.findOneForSchool(schoolBId, studentA!.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects cross-tenant grade reference during student admission', async () => {
      const gradeB = await prisma.gradeClass.findFirst({
        where: { schoolId: schoolBId },
      });
      const sessionA = await prisma.academicYear.findFirst({
        where: { schoolId: schoolAId },
      });
      const gradeA = await prisma.gradeClass.findFirst({
        where: { schoolId: schoolAId },
        include: { sections: true },
      });

      await expect(
        studentsService.createStudent(schoolAId, {
          admissionNumber: `CROSS-SEC-${Date.now()}`,
          firstName: 'Hacker',
          lastName: 'Attempt',
          gradeId: gradeB!.id, // School B grade!
          sectionId: gradeA!.sections[0].id,
          academicYearId: sessionA!.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects section that does not belong to the selected grade', async () => {
      const sessionA = await prisma.academicYear.findFirst({
        where: { schoolId: schoolAId },
      });
      const grades = await prisma.gradeClass.findMany({
        where: { schoolId: schoolAId },
        include: { sections: true },
        take: 2,
      });

      if (grades.length >= 2 && grades[0].sections.length > 0 && grades[1].sections.length > 0) {
        await expect(
          studentsService.createStudent(schoolAId, {
            admissionNumber: `MISMATCH-SEC-${Date.now()}`,
            firstName: 'Mismatch',
            lastName: 'Section',
            gradeId: grades[0].id,
            sectionId: grades[1].sections[0].id, // Belongs to Grade 1, not Grade 0!
            academicYearId: sessionA!.id,
          }),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });
});
