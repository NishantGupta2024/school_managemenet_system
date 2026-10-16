import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { StudentsService } from './students.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StudentsService — Object-Level Authorization & Tenant Isolation', () => {
  let service: StudentsService;
  let prisma: PrismaService;

  const schoolAId = '00000000-0000-0000-0000-000000000001';
  const schoolBId = '00000000-0000-0000-0000-000000000002';

  let testStudentA: any;
  let testStudentB: any;
  let studentAUser: any;
  let studentBUser: any;
  let verifiedParentUser: any;
  let unverifiedParentUser: any;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentsService, PrismaService],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
    prisma = module.get<PrismaService>(PrismaService);

    // 1. Fetch sessions and grades
    const sessionA = await prisma.academicYear.findFirst({ where: { schoolId: schoolAId } });
    const gradeA = await prisma.gradeClass.findFirst({ where: { schoolId: schoolAId } });
    const sectionA = await prisma.section.findFirst({ where: { schoolId: schoolAId } });

    const sessionB = await prisma.academicYear.findFirst({ where: { schoolId: schoolBId } });
    const gradeB = await prisma.gradeClass.findFirst({ where: { schoolId: schoolBId } });
    const sectionB = await prisma.section.findFirst({ where: { schoolId: schoolBId } });

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
        isVerified: false, // Unverified!
      },
    });
  });

  afterAll(async () => {
    if (testStudentA) {
      await prisma.parentStudentRelation.deleteMany({
        where: { studentId: testStudentA.id },
      });
      await prisma.student.delete({ where: { id: testStudentA.id } }).catch(() => {});
    }
    if (testStudentB) {
      await prisma.parentStudentRelation.deleteMany({
        where: { studentId: testStudentB.id },
      });
      await prisma.student.delete({ where: { id: testStudentB.id } }).catch(() => {});
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
      // Querying School B student under School A context
      await expect(
        service.findOneForSchool(schoolAId, testStudentB.id),
      ).rejects.toThrow(NotFoundException);

      // Querying School A student under School B context
      await expect(
        service.findOneForSchool(schoolBId, testStudentA.id),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
