import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FeeHeadCategory, FeeFrequency, ConcessionType } from '@prisma/client';

describe('Phase 2B: Fee Configuration Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const schoolAId = '00000000-0000-0000-0000-000000000001';
  const schoolBId = '00000000-0000-0000-0000-000000000002';

  let tokenSchoolAAdmin: string;
  let tokenSchoolBAdmin: string;
  let tokenSchoolAStaff: string;
  let tokenSchoolAStudent: string;
  let tokenPlatformAdmin: string;

  let gradeAId: string;
  let sessionAId: string;
  let studentAId: string;

  let gradeBId: string;
  let sessionBId: string;
  let studentBId: string;

  // Tracked IDs
  let tuitionHeadAId: string;
  let transportHeadAId: string;
  let labHeadAId: string;
  let structureAId: string;
  let allocationAId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Retrieve School A references
    const gradeA = await prisma.gradeClass.findFirst({ where: { schoolId: schoolAId } });
    const sessionA = await prisma.academicYear.findFirst({ where: { schoolId: schoolAId } });
    const studentA = await prisma.student.findFirst({ where: { schoolId: schoolAId } });

    gradeAId = gradeA!.id;
    sessionAId = sessionA!.id;
    studentAId = studentA!.id;

    // Retrieve School B references
    const gradeB = await prisma.gradeClass.findFirst({ where: { schoolId: schoolBId } });
    const sessionB = await prisma.academicYear.findFirst({ where: { schoolId: schoolBId } });
    const studentB = await prisma.student.findFirst({ where: { schoolId: schoolBId } });

    gradeBId = gradeB!.id;
    sessionBId = sessionB!.id;
    studentBId = studentB!.id;

    // Authenticate and obtain JWT tokens
    const loginAAdmin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@greenwood.edu', password: 'Password123!' });
    tokenSchoolAAdmin = loginAAdmin.body.accessToken;

    const loginBAdmin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@starlight.edu', password: 'Password123!' });
    tokenSchoolBAdmin = loginBAdmin.body.accessToken;

    const loginAStaff = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'staff@greenwood.edu', password: 'Password123!' });
    tokenSchoolAStaff = loginAStaff.body.accessToken;

    const loginAStudent = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'student@greenwood.edu', password: 'Password123!' });
    tokenSchoolAStudent = loginAStudent.body.accessToken;

    const loginSuper = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@fee-platform.com', password: 'Password123!' });
    tokenPlatformAdmin = loginSuper.body.accessToken;

    // Clean any residual test data
    await prisma.studentFeeAllocation.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeStructureItem.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeStructure.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeHead.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.student.deleteMany({ where: { admissionNumber: { startsWith: 'ADM-TEMP-' } } });
  });

  afterAll(async () => {
    // Cleanup any created allocations, structures, items, heads
    await prisma.studentFeeAllocation.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeStructureItem.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeStructure.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeHead.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.student.deleteMany({ where: { admissionNumber: { startsWith: 'ADM-TEMP-' } } });

    if (app) {
      await app.close();
    }
  });

  describe('1. Fee Head Management', () => {
    it('allows SCHOOL_ADMIN to create fee heads', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fee-heads')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          name: 'Tuition Fee',
          code: 'TUIT',
          description: 'Core academic instructional tuition',
          category: FeeHeadCategory.ACADEMIC,
          isOptional: false,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.code).toBe('TUIT');
      expect(res.body.schoolId).toBe(schoolAId);
      tuitionHeadAId = res.body.id;

      // Create optional Transport Head
      const resTrn = await request(app.getHttpServer())
        .post('/api/v1/fee-heads')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          name: 'Transport Fee',
          code: 'TRN',
          description: 'Bus transit facility fee',
          category: FeeHeadCategory.FACILITY,
          isOptional: true,
        })
        .expect(201);

      transportHeadAId = resTrn.body.id;

      // Create Laboratory Head
      const resLab = await request(app.getHttpServer())
        .post('/api/v1/fee-heads')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          name: 'Science Lab Fee',
          code: 'LAB',
          description: 'Laboratory practicals and equipment',
          category: FeeHeadCategory.ACADEMIC,
          isOptional: false,
        })
        .expect(201);

      labHeadAId = resLab.body.id;
    });

    it('rejects duplicate fee head code within the same school (409 Conflict)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fee-heads')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          name: 'Duplicate Tuition',
          code: 'tuit', // lower case should be normalized and collide
          category: FeeHeadCategory.ACADEMIC,
        })
        .expect(409);

      expect(res.body.message).toContain('already exists in this school');
    });

    it('allows another school (School B) to use the same fee head code (tenant-scoped uniqueness)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fee-heads')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .send({
          name: 'Starlight Tuition Fee',
          code: 'TUIT',
          category: FeeHeadCategory.ACADEMIC,
        })
        .expect(201);

      expect(res.body.schoolId).toBe(schoolBId);
      expect(res.body.code).toBe('TUIT');
    });

    it('allows FEE_STAFF to list fee heads but rejects mutations (403 Forbidden)', async () => {
      // Read is permitted
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/fee-heads')
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .expect(200);

      expect(Array.isArray(listRes.body)).toBe(true);
      expect(listRes.body.length).toBeGreaterThanOrEqual(3);

      // Mutation is forbidden
      await request(app.getHttpServer())
        .post('/api/v1/fee-heads')
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .send({
          name: 'Unauthorized Head',
          code: 'UNAUTH',
          category: FeeHeadCategory.ACADEMIC,
        })
        .expect(403);
    });

    it('forbids STUDENT from accessing fee head endpoints (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/fee-heads')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .expect(403);
    });

    it('allows filtering fee heads by category and isOptional', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/fee-heads?category=FACILITY&isOptional=true')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.length).toBe(1);
      expect(res.body[0].code).toBe('TRN');
    });
  });

  describe('2. Fee Structure Management', () => {
    it('atomically creates a fee structure with valid fee items in transaction', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fee-structures')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          gradeId: gradeAId,
          name: 'Grade 10 Standard Fee 2026-2027',
          description: 'Regular academic syllabus fee breakdown',
          items: [
            {
              feeHeadId: tuitionHeadAId,
              amount: 2500.0,
              frequency: FeeFrequency.MONTHLY,
              isOptional: false,
            },
            {
              feeHeadId: labHeadAId,
              amount: 5000.0,
              frequency: FeeFrequency.ANNUAL,
              isOptional: false,
            },
            {
              feeHeadId: transportHeadAId,
              amount: 1200.0,
              frequency: FeeFrequency.MONTHLY,
              isOptional: true,
            },
          ],
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.schoolId).toBe(schoolAId);
      expect(res.body.items).toHaveLength(3);
      structureAId = res.body.id;
    });

    it('rejects duplicate fee structure name for same grade and session (409 Conflict)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/fee-structures')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          gradeId: gradeAId,
          name: 'Grade 10 Standard Fee 2026-2027',
          items: [
            {
              feeHeadId: tuitionHeadAId,
              amount: 2500.0,
              frequency: FeeFrequency.MONTHLY,
            },
          ],
        })
        .expect(409);
    });

    it('rejects fee structure referencing non-existent or foreign school fee head (400 Bad Request)', async () => {
      // Create a fee head in School B
      const headB = await prisma.feeHead.findFirst({ where: { schoolId: schoolBId } });

      await request(app.getHttpServer())
        .post('/api/v1/fee-structures')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          gradeId: gradeAId,
          name: 'Cross-Tenant Structure',
          items: [
            {
              feeHeadId: headB!.id, // Belongs to School B!
              amount: 1000.0,
              frequency: FeeFrequency.MONTHLY,
            },
          ],
        })
        .expect(400);
    });

    it('prevents deleting a fee head that is referenced by a fee structure (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/fee-heads/${tuitionHeadAId}`)
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);

      expect(res.body.message).toContain('is referenced by');
    });
  });

  describe('3. Student Fee Allocation', () => {
    it('assigns student to fee structure with optional transport and percentage concession', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/student-allocations')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          studentId: studentAId,
          feeStructureId: structureAId,
          academicYearId: sessionAId,
          concessionType: ConcessionType.PERCENTAGE,
          concessionValue: 15.0,
          concessionReason: 'Merit scholarship for top academic performance',
          optedFeeHeadIds: [transportHeadAId],
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.schoolId).toBe(schoolAId);
      expect(res.body.studentId).toBe(studentAId);
      expect(res.body.feeStructureId).toBe(structureAId);
      expect(res.body.concessionType).toBe(ConcessionType.PERCENTAGE);
      expect(Number(res.body.concessionValue)).toBe(15.0);
      expect(res.body.authorizedBy).toBeDefined();
      expect(res.body.optedFeeHeadIds).toContain(transportHeadAId);
      allocationAId = res.body.id;
    });

    it('rejects duplicate allocation for same student and academic year (409 Conflict)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/student-allocations')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          studentId: studentAId,
          feeStructureId: structureAId,
          academicYearId: sessionAId,
        })
        .expect(409);
    });

    it('rejects concession if reason is missing when concession > 0 (400 Bad Request)', async () => {
      const studentTemp = await prisma.student.create({
        data: {
          schoolId: schoolAId,
          admissionNumber: 'ADM-TEMP-001',
          firstName: 'Temp',
          lastName: 'Student',
          gradeId: gradeAId,
          sectionId: (await prisma.section.findFirst({ where: { schoolId: schoolAId } }))!.id,
          academicYearId: sessionAId,
        },
      });

      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/student-allocations')
          .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
          .send({
            studentId: studentTemp.id,
            feeStructureId: structureAId,
            academicYearId: sessionAId,
            concessionType: ConcessionType.PERCENTAGE,
            concessionValue: 10,
            // Missing concessionReason!
          })
          .expect(400);

        expect(res.body.message).toContain('Concession reason is mandatory');
      } finally {
        await prisma.student.delete({ where: { id: studentTemp.id } });
      }
    });

    it('rejects flat discount if it exceeds the total annual base fee (400 Bad Request)', async () => {
      const studentTemp = await prisma.student.create({
        data: {
          schoolId: schoolAId,
          admissionNumber: 'ADM-TEMP-002',
          firstName: 'Temp2',
          lastName: 'Student',
          gradeId: gradeAId,
          sectionId: (await prisma.section.findFirst({ where: { schoolId: schoolAId } }))!.id,
          academicYearId: sessionAId,
        },
      });

      try {
        // Total base fee of structure without transport: (2500 * 12) + 5000 = 35000
        const res = await request(app.getHttpServer())
          .post('/api/v1/student-allocations')
          .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
          .send({
            studentId: studentTemp.id,
            feeStructureId: structureAId,
            academicYearId: sessionAId,
            concessionType: ConcessionType.FLAT_DISCOUNT,
            concessionValue: 999999.0, // Exceeds total annual base fee
            concessionReason: 'Excessive waiver attempt',
          })
          .expect(400);

        expect(res.body.message).toContain('cannot exceed total base fee');
      } finally {
        await prisma.student.delete({ where: { id: studentTemp.id } });
      }
    });

    it('prevents deleting a fee structure that has active student allocations (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/fee-structures/${structureAId}`)
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);

      expect(res.body.message).toContain('already allocated to');
    });

    it('allows FEE_STAFF to query student allocations but forbids creation (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/student-allocations')
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      await request(app.getHttpServer())
        .post('/api/v1/student-allocations')
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .send({
          studentId: studentAId,
          feeStructureId: structureAId,
          academicYearId: sessionAId,
        })
        .expect(403);
    });
  });

  describe('4. Strict Tenant Isolation Verification', () => {
    it('School A cannot allocate School B student (400 Bad Request)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/student-allocations')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          studentId: studentBId, // School B student!
          feeStructureId: structureAId,
          academicYearId: sessionAId,
        })
        .expect(400);
    });

    it('School B Admin cannot see School A fee structures or heads', async () => {
      const headsB = await request(app.getHttpServer())
        .get('/api/v1/fee-heads')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .expect(200);

      // Should only see School B heads, none of School A heads
      const hasHeadA = headsB.body.some((h: any) => h.id === tuitionHeadAId);
      expect(hasHeadA).toBe(false);

      const structuresB = await request(app.getHttpServer())
        .get('/api/v1/fee-structures')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .expect(200);

      const hasStructureA = structuresB.body.some((s: any) => s.id === structureAId);
      expect(hasStructureA).toBe(false);
    });

    it('allows PLATFORM_SUPER_ADMIN to query configurations of School A with x-school-id header', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/fee-heads')
        .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
        .set('x-school-id', schoolAId)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((h: any) => h.id === tuitionHeadAId)).toBe(true);
    });
  });
});
