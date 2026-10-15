import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { UserRole } from '@prisma/client';

describe('End-to-End Security Gate & Multi-Tenant Authorization (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const schoolAId = '00000000-0000-0000-0000-000000000001';
  const schoolBId = '00000000-0000-0000-0000-000000000002';
  const nonExistentSchoolId = '00000000-0000-0000-0000-999999999999';

  let studentAId: string;
  let studentBId: string;
  let gradeBId: string;
  let sectionBId: string;
  let sessionBId: string;

  // Real JWT tokens obtained through real login flows
  let tokenSchoolAAdmin: string;
  let tokenSchoolBAdmin: string;
  let tokenSchoolAStaff: string;
  let tokenSchoolAStudent: string;
  let tokenPlatformAdmin: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    authService = app.get<AuthService>(AuthService);

    // Retrieve seeded student and structural IDs
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

    // Perform REAL authentication logins to obtain valid server-signed JWTs
    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@greenwood.edu', password: 'Password123!' });
    tokenSchoolAAdmin = loginA.body.accessToken;

    const loginB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@starlight.edu', password: 'Password123!' });
    tokenSchoolBAdmin = loginB.body.accessToken;

    const loginStaffA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'staff@greenwood.edu', password: 'Password123!' });
    tokenSchoolAStaff = loginStaffA.body.accessToken;

    const loginStudentA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'student@greenwood.edu', password: 'Password123!' });
    tokenSchoolAStudent = loginStudentA.body.accessToken;

    const loginSuper = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@fee-platform.com', password: 'Password123!' });
    tokenPlatformAdmin = loginSuper.body.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Real Authentication Flow & Credential Validation', () => {
    it('successfully logs in with valid credentials and receives signed JWT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@greenwood.edu', password: 'Password123!' })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.tokenType).toBe('Bearer');
      expect(res.body.user.role).toBe(UserRole.SCHOOL_ADMIN);
      expect(res.body.user.schoolId).toBe(schoolAId);
    });

    it('rejects invalid password credentials with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@greenwood.edu', password: 'WrongPassword!' })
        .expect(401);

      expect(res.body.message).toContain('Invalid email or password credentials');
    });

    it('rejects non-existent email credentials with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@nonexistent.edu', password: 'Password123!' })
        .expect(401);

      expect(res.body.message).toContain('Invalid email or password credentials');
    });

    it('verifies /api/v1/auth/me returns authenticated identity from real JWT', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.email).toBe('admin@greenwood.edu');
      expect(res.body.role).toBe(UserRole.SCHOOL_ADMIN);
      expect(res.body.schoolId).toBe(schoolAId);
    });
  });

  describe('2. Token Lifecycle & Boundary Enforcement', () => {
    it('rejects protected routes when Authorization header is missing with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .expect(401);

      expect(res.body.statusCode).toBe(401);
      expect(res.body.message).toBeDefined();
    });

    it('rejects protected routes with a malformed/invalid bearer token with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', 'Bearer invalid.tampered.token')
        .expect(401);

      expect(res.body.statusCode).toBe(401);
      expect(res.body.message).toBeDefined();
    });

    it('rejects protected routes with an expired token with 401', async () => {
      // Generate real token signed with immediate expiration
      const expiredToken = authService.generateCustomToken(
        { id: 'mock-id', email: 'admin@greenwood.edu', role: UserRole.SCHOOL_ADMIN, schoolId: schoolAId },
        '-1s',
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(res.body.message).toContain('jwt expired');
    });
  });

  describe('3. Cross-Tenant Query Isolation & Spoofing Defense', () => {
    it('derives school membership from trusted token and returns only School A students', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      for (const student of res.body) {
        expect(student.schoolId).toBe(schoolAId);
        expect(student.admissionNumber).toBe('ADM-2026-001');
      }

      // School Beta's student must not exist in School A's response
      const hasStudentB = res.body.some((s: any) => s.id === studentBId);
      expect(hasStudentB).toBe(false);
    });

    it('derives school membership from trusted token and returns only School B students', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      for (const student of res.body) {
        expect(student.schoolId).toBe(schoolBId);
        expect(student.admissionNumber).toBe('ADM-2026-002');
      }

      const hasStudentA = res.body.some((s: any) => s.id === studentAId);
      expect(hasStudentA).toBe(false);
    });

    it('rejects spoofing: School A Admin sending x-school-id of School B is rejected with 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .set('x-school-id', schoolBId) // Attacker tries to switch school via header
        .expect(403);

      expect(res.body.message).toContain('Cross-tenant access forbidden: User membership does not match requested school');
    });

    it('rejects direct ID access across tenants with 404', async () => {
      // School A Admin requests Student B's UUID
      const res = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentBId}`)
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(404);

      expect(res.body.message).toContain('not found in this school');
    });
  });

  describe('4. Role-Based Access Control (RBAC) Enforcement', () => {
    it('permits FEE_STAFF to access student records in their school', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .expect(200);

      expect(res.body[0].schoolId).toBe(schoolAId);
    });

    it('rejects STUDENT user from accessing staff-level student directory with 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .expect(403);

      expect(res.body.message).toContain('Access denied');
    });
  });

  describe('5. Platform Super Admin Explicit Tenant Switching', () => {
    it('allows PLATFORM_SUPER_ADMIN to target School A with explicit header', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
        .set('x-school-id', schoolAId)
        .expect(200);

      expect(res.body[0].schoolId).toBe(schoolAId);
    });

    it('allows PLATFORM_SUPER_ADMIN to target School B with explicit header', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
        .set('x-school-id', schoolBId)
        .expect(200);

      expect(res.body[0].schoolId).toBe(schoolBId);
    });

    it('rejects PLATFORM_SUPER_ADMIN when x-school-id header is missing on school-scoped endpoint', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
        .expect(400);

      expect(res.body.message).toContain('Platform admin must provide x-school-id header');
    });

    it('rejects PLATFORM_SUPER_ADMIN targeting a non-existent school ID with 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
        .set('x-school-id', nonExistentSchoolId)
        .expect(403);

      expect(res.body.message).toContain('Target school tenant does not exist');
    });
  });

  describe('6. PostgreSQL Composite Foreign Key Relational Defense', () => {
    it('physically rejects cross-tenant relationship insertion at database level', async () => {
      // Attempt to insert Student under School A referencing School B's Grade
      await expect(
        prisma.student.create({
          data: {
            schoolId: schoolAId,
            admissionNumber: 'ROGUE-001',
            firstName: 'Intruder',
            lastName: 'CrossTenant',
            gradeId: gradeBId, // Belongs to School B!
            sectionId: sectionBId, // Belongs to School B!
            academicYearId: sessionBId, // Belongs to School B!
          },
        }),
      ).rejects.toThrow();
    });
  });
});
