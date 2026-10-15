import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '@prisma/client';

describe('Multi-Tenant Security & Isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const schoolAId = '00000000-0000-0000-0000-000000000001';
  const schoolBId = '00000000-0000-0000-0000-000000000002';
  const nonExistentSchoolId = '00000000-0000-0000-0000-999999999999';

  let studentAId: string;
  let studentBId: string;
  let gradeBId: string;
  let sectionBId: string;
  let sessionBId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    // Mock auth middleware for simulated user sessions in tests
    app.use((req, res, next) => {
      // Allow test requests to inject mock authenticated user via test headers
      const mockRole = req.headers['x-mock-role'] as string;
      const mockUserSchoolId = req.headers['x-mock-user-school-id'] as string;

      if (mockRole) {
        req.user = {
          id: 'mock-user-id',
          email: 'test@mock.edu',
          role: mockRole as UserRole,
          schoolId: mockUserSchoolId || null,
        };
      }
      next();
    });

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Retrieve seeded student IDs
    const studentA = await prisma.student.findFirst({ where: { schoolId: schoolAId } });
    const studentB = await prisma.student.findFirst({ where: { schoolId: schoolBId } });
    const gradeB = await prisma.gradeClass.findFirst({ where: { schoolId: schoolBId } });
    const sectionB = await prisma.section.findFirst({ where: { schoolId: schoolBId } });
    const sessionB = await prisma.academicYear.findFirst({ where: { schoolId: schoolBId } });

    studentAId = studentA!.id;
    studentBId = studentB!.id;
    gradeBId = gradeB!.id;
    sectionBId = sectionB!.id;
    sessionBId = sessionB!.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Tenant Ingestion & Fallback Elimination', () => {
    it('rejects protected requests when x-school-id is missing (no unsafe fallback)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/students')
        .expect(401);

      expect(response.body.message).toContain('Tenant context missing');
    });

    it('rejects protected requests with a non-existent school ID', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('x-school-id', nonExistentSchoolId)
        .expect(403);

      expect(response.body.message).toContain('Target school tenant does not exist');
    });

    it('rejects malformed tenant UUID format', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('x-school-id', 'invalid-uuid-123')
        .expect(400);

      expect(response.body.message).toContain('Malformed tenant ID');
    });
  });

  describe('2. Cross-Tenant Query Isolation (School Alpha vs School Beta)', () => {
    it('returns only School Alpha students when x-school-id is School Alpha', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('x-school-id', schoolAId)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);

      // Verify all returned students strictly belong to School Alpha
      for (const student of response.body) {
        expect(student.schoolId).toBe(schoolAId);
        expect(student.admissionNumber).toBe('ADM-2026-001');
      }

      // Ensure School Beta student is not leaked
      const hasStudentB = response.body.some((s: any) => s.id === studentBId);
      expect(hasStudentB).toBe(false);
    });

    it('returns only School Beta students when x-school-id is School Beta', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('x-school-id', schoolBId)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);

      for (const student of response.body) {
        expect(student.schoolId).toBe(schoolBId);
        expect(student.admissionNumber).toBe('ADM-2026-002');
      }

      // Ensure School Alpha student is not leaked
      const hasStudentA = response.body.some((s: any) => s.id === studentAId);
      expect(hasStudentA).toBe(false);
    });

    it('prevents direct ID access: School Alpha cannot view Student B by ID', async () => {
      // Client is scoped to School A, but asks for Student B's UUID
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentBId}`)
        .set('x-school-id', schoolAId)
        .expect(404);

      expect(response.body.message).toContain('not found in this school');
    });
  });

  describe('3. Authenticated Membership vs Client-Supplied Header (Spoofing Defense)', () => {
    it('blocks user of School A from accessing School B data by spoofing x-school-id', async () => {
      // User is from School A, but supplies x-school-id = School B
      const response = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('x-school-id', schoolBId)
        .set('x-mock-role', UserRole.SCHOOL_ADMIN)
        .set('x-mock-user-school-id', schoolAId)
        .expect(403);

      expect(response.body.message).toContain('Cross-tenant access forbidden');
    });

    it('allows user of School A to access School A data when header matches membership', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('x-school-id', schoolAId)
        .set('x-mock-role', UserRole.SCHOOL_ADMIN)
        .set('x-mock-user-school-id', schoolAId)
        .expect(200);

      expect(response.body[0].schoolId).toBe(schoolAId);
    });

    it('allows PLATFORM_SUPER_ADMIN to access any school tenant', async () => {
      // Super admin has schoolId: null, but target School A
      const resA = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('x-school-id', schoolAId)
        .set('x-mock-role', UserRole.PLATFORM_SUPER_ADMIN)
        .expect(200);

      expect(resA.body[0].schoolId).toBe(schoolAId);

      // Super admin target School B
      const resB = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('x-school-id', schoolBId)
        .set('x-mock-role', UserRole.PLATFORM_SUPER_ADMIN)
        .expect(200);

      expect(resB.body[0].schoolId).toBe(schoolBId);
    });
  });

  describe('4. Database Composite Foreign Key Integrity', () => {
    it('rejects cross-tenant student creation at database engine level', async () => {
      // Attempt to insert a student under School A that references Grade from School B
      await expect(
        prisma.student.create({
          data: {
            schoolId: schoolAId, // School A
            admissionNumber: 'HACK-001',
            firstName: 'CrossTenant',
            lastName: 'Intruder',
            gradeId: gradeBId, // Belongs to School B!
            sectionId: sectionBId, // Belongs to School B!
            academicYearId: sessionBId, // Belongs to School B!
          },
        }),
      ).rejects.toThrow();
    });
  });
});
