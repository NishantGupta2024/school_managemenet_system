import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { UserRole, StudentStatus } from '@prisma/client';
import { StudentsService } from './students.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StudentsService — Object-Level Authorization, Tenant Isolation & Phase 1B Admissions', () => {
  let service: StudentsService;
  let prisma: PrismaService;

  const schoolAId = '00000000-0000-0000-0000-000000000001';
  const schoolBId = '00000000-0000-0000-0000-000000000002';

  let sessionA: any;
  let gradeA: any;
  let sectionA: any;
  let gradeA2: any;
  let sectionA2: any;

  let sessionB: any;
  let gradeB: any;
  let sectionB: any;

  let testStudentA: any;
  let testStudentB: any;
  let studentAUser: any;
  let studentBUser: any;
  let verifiedParentUser: any;
  let unverifiedParentUser: any;

  const createdStudentIds: string[] = [];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentsService, PrismaService],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
    prisma = module.get<PrismaService>(PrismaService);

    // 1. Fetch sessions and grades
    sessionA = await prisma.academicYear.findFirst({ where: { schoolId: schoolAId } });
    const gradesA = await prisma.gradeClass.findMany({
      where: { schoolId: schoolAId },
      include: { sections: true },
      take: 2,
    });
    gradeA = gradesA[0];
    sectionA = gradeA?.sections?.[0];

    // Ensure gradeA2 is distinct from gradeA
    if (gradesA.length > 1 && gradesA[1].sections && gradesA[1].sections.length > 0) {
      gradeA2 = gradesA[1];
      sectionA2 = gradesA[1].sections[0];
    } else {
      gradeA2 = await prisma.gradeClass.create({
        data: {
          schoolId: schoolAId,
          name: 'Grade Test 2',
          code: `GT2-${Date.now()}`,
        },
      });
      sectionA2 = await prisma.section.create({
        data: {
          schoolId: schoolAId,
          gradeId: gradeA2.id,
          name: 'Section A2',
          capacity: 30,
        },
      });
    }

    sessionB = await prisma.academicYear.findFirst({ where: { schoolId: schoolBId } });
    gradeB = await prisma.gradeClass.findFirst({ where: { schoolId: schoolBId } });
    sectionB = await prisma.section.findFirst({ where: { schoolId: schoolBId } });

    // 2. Create users
    studentAUser = await prisma.user.create({
      data: {
        schoolId: schoolAId,
        email: `stud-a-${Date.now()}@test.edu`,
        passwordHash: 'dummyhash',
        name: 'Student A User',
        role: UserRole.STUDENT,
      },
    });

    studentBUser = await prisma.user.create({
      data: {
        schoolId: schoolAId,
        email: `stud-b-${Date.now()}@test.edu`,
        passwordHash: 'dummyhash',
        name: 'Student B User',
        role: UserRole.STUDENT,
      },
    });

    verifiedParentUser = await prisma.user.create({
      data: {
        schoolId: schoolAId,
        email: `par-v-${Date.now()}@test.edu`,
        passwordHash: 'dummyhash',
        name: 'Verified Parent User',
        role: UserRole.PARENT,
      },
    });

    unverifiedParentUser = await prisma.user.create({
      data: {
        schoolId: schoolAId,
        email: `par-u-${Date.now()}@test.edu`,
        passwordHash: 'dummyhash',
        name: 'Unverified Parent User',
        role: UserRole.PARENT,
      },
    });

    // 3. Create students
    testStudentA = await prisma.student.create({
      data: {
        schoolId: schoolAId,
        admissionNumber: `STU-AUTH-A-${Date.now()}`,
        firstName: 'Student',
        lastName: 'A',
        gradeId: gradeA!.id,
        sectionId: sectionA!.id,
        academicYearId: sessionA!.id,
        userId: studentAUser.id,
        status: 'ACTIVE',
      },
    });
    createdStudentIds.push(testStudentA.id);

    testStudentB = await prisma.student.create({
      data: {
        schoolId: schoolBId,
        admissionNumber: `STU-AUTH-B-${Date.now()}`,
        firstName: 'Student',
        lastName: 'B',
        gradeId: gradeB!.id,
        sectionId: sectionB!.id,
        academicYearId: sessionB!.id,
        userId: studentBUser.id,
        status: 'ACTIVE',
      },
    });
    createdStudentIds.push(testStudentB.id);

    // 4. Create Parent-Student relationships
    await prisma.parentStudentRelation.create({
      data: {
        schoolId: schoolAId,
        parentId: verifiedParentUser.id,
        studentId: testStudentA.id,
        relationshipType: 'MOTHER',
        isVerified: true,
      },
    });

    await prisma.parentStudentRelation.create({
      data: {
        schoolId: schoolAId,
        parentId: unverifiedParentUser.id,
        studentId: testStudentA.id,
        relationshipType: 'FATHER',
        isVerified: false,
      },
    });
  });

  afterAll(async () => {
    if (createdStudentIds.length > 0) {
      await prisma.parentStudentRelation.deleteMany({
        where: { studentId: { in: createdStudentIds } },
      });
      await prisma.studentFeeAllocation.deleteMany({
        where: { studentId: { in: createdStudentIds } },
      });
      await prisma.feeInvoice.deleteMany({
        where: { studentId: { in: createdStudentIds } },
      });
      await prisma.student.deleteMany({
        where: { id: { in: createdStudentIds } },
      });
    }

    const userIds = [
      studentAUser?.id,
      studentBUser?.id,
      verifiedParentUser?.id,
      unverifiedParentUser?.id,
    ].filter(Boolean);

    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    await prisma.$disconnect();
  });

  describe('findAccessibleStudents — Object-level scoping', () => {
    it('returns ONLY the authenticated student own profile for STUDENT role', async () => {
      const results = await service.findAccessibleStudents(schoolAId, studentAUser);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(testStudentA.id);
      expect(results[0].userId).toBe(studentAUser.id);
    });

    it('returns ONLY verified linked children for PARENT role', async () => {
      const results = await service.findAccessibleStudents(schoolAId, verifiedParentUser);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(testStudentA.id);
    });

    it('returns EMPTY array for unverified parent relationship', async () => {
      const results = await service.findAccessibleStudents(schoolAId, unverifiedParentUser);
      expect(results.length).toBe(0);
    });

    it('returns all school students for SCHOOL_ADMIN and FEE_STAFF within tenant boundary', async () => {
      const adminUser = {
        id: '00000000-0000-0000-0000-000000000011',
        schoolId: schoolAId,
        role: UserRole.SCHOOL_ADMIN,
      };
      const results = await service.findAccessibleStudents(schoolAId, adminUser);
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((s) => s.schoolId === schoolAId)).toBe(true);
      expect(results.some((s) => s.id === testStudentB.id)).toBe(false);
    });
  });

  describe('findOneForSchool — Cross-tenant isolation', () => {
    it('returns student record when querying inside authorized school boundary', async () => {
      const student = await service.findOneForSchool(schoolAId, testStudentA.id);
      expect(student.id).toBe(testStudentA.id);
      expect(student.schoolId).toBe(schoolAId);
    });

    it('strictly rejects cross-school student ID with 404 NotFoundException', async () => {
      await expect(
        service.findOneForSchool(schoolAId, testStudentB.id),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.findOneForSchool(schoolBId, testStudentA.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findStudents — Backward Compatibility & Pagination', () => {
    it('returns a raw array when page is omitted (backward compatibility)', async () => {
      const res = await service.findStudents(schoolAId);
      expect(Array.isArray(res)).toBe(true);
      expect((res as any[]).some((s) => s.id === testStudentA.id)).toBe(true);
    });

    it('returns paginated { data, meta } when page is provided', async () => {
      const res: any = await service.findStudents(schoolAId, { page: 1, limit: 5 });
      expect(res.data).toBeDefined();
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.meta).toBeDefined();
      expect(res.meta.page).toBe(1);
      expect(res.meta.limit).toBe(5);
      expect(typeof res.meta.total).toBe('number');
      expect(res.meta.totalPages).toBeGreaterThanOrEqual(1);
    });

    it('filters students by search query across name and admission number', async () => {
      const res: any = await service.findStudents(schoolAId, {
        page: 1,
        limit: 10,
        search: testStudentA.admissionNumber,
      });
      expect(res.data.length).toBe(1);
      expect(res.data[0].id).toBe(testStudentA.id);
    });
  });

  describe('createStudent — Individual Admission', () => {
    it('successfully admits a new student with uppercase normalized admission number', async () => {
      const admNo = `adm-${Date.now()}`;
      const newStudent = await service.createStudent(schoolAId, {
        admissionNumber: `  ${admNo}  `,
        firstName: 'Aarav',
        lastName: 'Sharma',
        gradeId: gradeA.id,
        sectionId: sectionA.id,
        academicYearId: sessionA.id,
        rollNumber: 'R-101',
        guardianName: 'Vikram Sharma',
        guardianPhone: '+91 9876543210',
        guardianEmail: 'vikram.sharma@example.com',
        status: StudentStatus.ACTIVE,
      });

      createdStudentIds.push(newStudent.id);

      expect(newStudent.id).toBeDefined();
      expect(newStudent.admissionNumber).toBe(admNo.toUpperCase());
      expect(newStudent.firstName).toBe('Aarav');
      expect(newStudent.lastName).toBe('Sharma');
      expect(newStudent.gradeId).toBe(gradeA.id);
      expect(newStudent.sectionId).toBe(sectionA.id);
      expect(newStudent.schoolId).toBe(schoolAId);
    });

    it('rejects duplicate admission number in the same school with ConflictException', async () => {
      await expect(
        service.createStudent(schoolAId, {
          admissionNumber: testStudentA.admissionNumber,
          firstName: 'Duplicate',
          lastName: 'Student',
          gradeId: gradeA.id,
          sectionId: sectionA.id,
          academicYearId: sessionA.id,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects cross-tenant academic reference with BadRequestException', async () => {
      await expect(
        service.createStudent(schoolAId, {
          admissionNumber: `CROSS-${Date.now()}`,
          firstName: 'Cross',
          lastName: 'Tenant',
          gradeId: gradeB.id, // Belongs to School B!
          sectionId: sectionA.id,
          academicYearId: sessionA.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStudent & Financial Integrity Guard', () => {
    let studentForUpdate: any;

    beforeAll(async () => {
      studentForUpdate = await service.createStudent(schoolAId, {
        admissionNumber: `UPD-${Date.now()}`,
        firstName: 'Update',
        lastName: 'Target',
        gradeId: gradeA.id,
        sectionId: sectionA.id,
        academicYearId: sessionA.id,
        guardianName: 'Initial Guardian',
      });
      createdStudentIds.push(studentForUpdate.id);
    });

    it('safely updates demographic and guardian information', async () => {
      const updated = await service.updateStudent(schoolAId, studentForUpdate.id, {
        firstName: 'UpdatedName',
        guardianName: 'Updated Guardian',
        guardianPhone: '+91 9999988888',
      });

      expect(updated.firstName).toBe('UpdatedName');
      expect(updated.guardianName).toBe('Updated Guardian');
      expect(updated.guardianPhone).toBe('+91 9999988888');
    });

    it('blocks class change if student has active fee allocations or invoices', async () => {
      // Simulate an active fee allocation for this student
      const feeStructure = await prisma.feeStructure.findFirst({
        where: { schoolId: schoolAId },
      });

      if (feeStructure) {
        const allocation = await prisma.studentFeeAllocation.create({
          data: {
            schoolId: schoolAId,
            studentId: studentForUpdate.id,
            feeStructureId: feeStructure.id,
            academicYearId: sessionA.id,
            status: 'ACTIVE',
          },
        });

        // Attempting to change grade must fail with BadRequestException explaining the financial block
        await expect(
          service.updateStudent(schoolAId, studentForUpdate.id, {
            gradeId: gradeA2.id,
            sectionId: sectionA2.id,
          }),
        ).rejects.toThrow(BadRequestException);

        // Clean up allocation for subsequent tests
        await prisma.studentFeeAllocation.delete({ where: { id: allocation.id } });
      }
    });

    it('allows class change when no active allocations or invoices exist', async () => {
      if (gradeA2 && gradeA2.id !== gradeA.id) {
        const updated = await service.updateStudent(schoolAId, studentForUpdate.id, {
          gradeId: gradeA2.id,
          sectionId: sectionA2.id,
        });

        expect(updated.gradeId).toBe(gradeA2.id);
        expect(updated.sectionId).toBe(sectionA2.id);
      }
    });
  });

  describe('getStudentProfile', () => {
    it('returns full student profile including relations and financial counts', async () => {
      const profile: any = await service.getStudentProfile(schoolAId, testStudentA.id);
      expect(profile).toBeDefined();
      expect(profile.id).toBe(testStudentA.id);
      expect(profile.grade).toBeDefined();
      expect(profile.section).toBeDefined();
      expect(profile.academicYear).toBeDefined();
      expect(profile.userAccount).toBeDefined();
      expect(profile.parentRelations).toBeDefined();
      expect(profile._count).toBeDefined();
      expect(typeof profile._count.invoices).toBe('number');
    });
  });
});
