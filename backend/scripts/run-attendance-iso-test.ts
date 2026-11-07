import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import * as bcrypt from 'bcrypt';
import { PrismaClient, UserRole, TenantStatus, StudentStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { checkDatabaseTarget } from './preflight-db-check';

// ---------------------------------------------------------------------------
// 1. Connection Resolution & Target Safety Guard
// ---------------------------------------------------------------------------
function resolveIsoDatabaseUrl(): string {
  const envPath = path.resolve(__dirname, '../.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const line = envContent.split('\n').find(l => /^\s*DATABASE_URL\s*=/.test(l));
  if (!line) throw new Error('DATABASE_URL not found in backend/.env');

  const idx = line.indexOf('=');
  const rawUrl = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  const parsed = new URL(rawUrl);

  // Strictly enforce fee_iso_test and public schema
  parsed.pathname = '/fee_iso_test';
  if (!parsed.searchParams.get('schema')) {
    parsed.searchParams.set('schema', 'public');
  }

  const isoUrl = parsed.toString();

  // Fail-closed target validation
  const check = checkDatabaseTarget(isoUrl);
  if (!check.ok) {
    throw new Error(`[SAFETY GUARD ERROR] Target rejected: ${check.reason}`);
  }
  if (check.dbName !== 'fee_iso_test') {
    throw new Error(`[SAFETY GUARD ERROR] Prohibited database: ${check.dbName}`);
  }

  return isoUrl;
}

const ISO_URL = resolveIsoDatabaseUrl();
process.env.DATABASE_URL = ISO_URL;

// Pre-existing Baseline Fixture Identifiers (NEVER mutated or deleted)
const ISO_SCHOOL_ID = '00000000-0000-0000-0000-000000000099';
const ISO_ADMIN_EMAIL = 'admin@iso-school.edu';
const ISO_ADMIN_PASSWORD = 'IsoTestAdmin123!';
const ISO_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000999';

// Disposable Fixture Identifiers with strictly compliant RFC-4122 UUID v4
// (block 3 = 4xxx, block 4 = 8xxx)
const ATT_AY_ID = '00000000-0000-4000-8000-000000000199';
const ATT_GRADE_ID = '00000000-0000-4000-8000-000000000299';
const ATT_SECTION_ID = '00000000-0000-4000-8000-000000000399';
const ATT_STUDENT_ID = '00000000-0000-4000-8000-000000000499';
const ATT_STUDENT_ADM = 'ADM-ISO-ATT-001';

const DISPOSABLE_SCHOOL_B_ID = '00000000-0000-4000-8000-000000000098';
const DISPOSABLE_SCHOOL_B_CODE = 'SCH-ISO-ATT-B';
const DISPOSABLE_ADMIN_B_ID = '00000000-0000-4000-8000-000000000998';
const DISPOSABLE_ADMIN_B_EMAIL = 'admin-b@iso-att-test.edu';

const DISPOSABLE_STAFF_ID = '00000000-0000-4000-8000-000000000881';
const DISPOSABLE_STAFF_EMAIL = 'staff@iso-att-test.edu';

const DISPOSABLE_TEACHER_1_USER_ID = '00000000-0000-4000-8000-000000000882';
const DISPOSABLE_TEACHER_1_PROFILE_ID = '00000000-0000-4000-8000-000000000883';
const DISPOSABLE_TEACHER_1_ASSIGNMENT_ID = '00000000-0000-4000-8000-000000000884';
const DISPOSABLE_TEACHER_1_EMAIL = 'teacher1@iso-att-test.edu';
const DISPOSABLE_TEACHER_1_EMPID = 'EMP-ATT-TEST-01';

const DISPOSABLE_TEACHER_2_USER_ID = '00000000-0000-4000-8000-000000000885';
const DISPOSABLE_TEACHER_2_PROFILE_ID = '00000000-0000-4000-8000-000000000886';
const DISPOSABLE_TEACHER_2_EMAIL = 'teacher2@iso-att-test.edu';
const DISPOSABLE_TEACHER_2_EMPID = 'EMP-ATT-TEST-02';

const TEST_PASSWORD = 'TestPassword123!';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestResult[] = [];

function recordTest(name: string, fn: () => void | Promise<void>) {
  return async () => {
    process.stdout.write(`  • Running: ${name}... `);
    try {
      await fn();
      console.log('PASSED');
      testResults.push({ name, passed: true });
    } catch (err: any) {
      console.log('FAILED');
      console.error(`    -> ${err.message || err}`);
      testResults.push({ name, passed: false, error: err.message || String(err) });
      throw err;
    }
  };
}

async function main() {
  console.log('\n===============================================================');
  console.log('  TASK-P3B-07B — Controlled Attendance PostgreSQL Test Suite');
  console.log('===============================================================\n');

  const prisma = new PrismaClient({
    datasources: { db: { url: ISO_URL } },
  });

  let app: INestApplication | null = null;
  let baselineCounts: Record<string, number> = {};

  try {
    // -------------------------------------------------------------------------
    // Guard Check 1: Runtime Database Identity
    // -------------------------------------------------------------------------
    const dbIdentity = await prisma.$queryRaw<Array<{ db: string; host: string; port: number }>>`
      SELECT current_database() as db, inet_server_addr() as host, inet_server_port() as port
    `;
    const connectedDb = dbIdentity[0]?.db;
    const connectedHost = dbIdentity[0]?.host || 'localhost';
    const connectedPort = dbIdentity[0]?.port || 5432;

    console.log(`[GUARD] Connected to PostgreSQL: db='${connectedDb}', host='${connectedHost}:${connectedPort}'`);

    if (connectedDb !== 'fee_iso_test') {
      throw new Error(`CRITICAL: Connected to '${connectedDb}' instead of 'fee_iso_test'. Aborting immediately!`);
    }

    // -------------------------------------------------------------------------
    // Baseline Count Recording
    // -------------------------------------------------------------------------
    baselineCounts = {
      school: await prisma.school.count(),
      user: await prisma.user.count(),
      teacher: await prisma.teacher.count(),
      teacherAssignment: await prisma.teacherAssignment.count(),
      student: await prisma.student.count(),
      academicYear: await prisma.academicYear.count(),
      gradeClass: await prisma.gradeClass.count(),
      section: await prisma.section.count(),
      attendanceRegister: await prisma.attendanceRegister.count(),
      studentAttendance: await prisma.studentAttendance.count(),
      attendanceCorrectionLog: await prisma.attendanceCorrectionLog.count(),
      schoolHoliday: await prisma.schoolHoliday.count(),
    };

    console.log('[BASELINE] Initial record counts:');
    for (const [k, v] of Object.entries(baselineCounts)) {
      console.log(`  - ${k}: ${v}`);
    }

    // -------------------------------------------------------------------------
    // Setup Disposable Fixtures
    // -------------------------------------------------------------------------
    console.log('\n[SETUP] Creating disposable fixtures for test run...');
    const hashedPw = await bcrypt.hash(TEST_PASSWORD, 10);

    // 1. Disposable Academic Hierarchy in School A (UUID v4 compliant)
    await prisma.academicYear.create({
      data: {
        id: ATT_AY_ID,
        schoolId: ISO_SCHOOL_ID,
        name: '2026-2027-ATT-TEST',
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T23:59:59.999Z'),
        isCurrent: false,
      },
    });

    await prisma.gradeClass.create({
      data: {
        id: ATT_GRADE_ID,
        schoolId: ISO_SCHOOL_ID,
        name: 'Grade 10 ATT',
        code: 'G10-ATT',
      },
    });

    await prisma.section.create({
      data: {
        id: ATT_SECTION_ID,
        schoolId: ISO_SCHOOL_ID,
        gradeId: ATT_GRADE_ID,
        name: 'Section A ATT',
      },
    });

    await prisma.student.create({
      data: {
        id: ATT_STUDENT_ID,
        schoolId: ISO_SCHOOL_ID,
        admissionNumber: ATT_STUDENT_ADM,
        firstName: 'Attendance',
        lastName: 'Tester',
        gradeId: ATT_GRADE_ID,
        sectionId: ATT_SECTION_ID,
        academicYearId: ATT_AY_ID,
        status: StudentStatus.ACTIVE,
      },
    });

    // 2. Disposable School B
    await prisma.school.create({
      data: {
        id: DISPOSABLE_SCHOOL_B_ID,
        code: DISPOSABLE_SCHOOL_B_CODE,
        name: 'Disposable Staging Academy B',
        address: '200 Other Rd',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'IN',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        status: TenantStatus.ACTIVE,
      },
    });

    // 3. Disposable Admin B
    await prisma.user.create({
      data: {
        id: DISPOSABLE_ADMIN_B_ID,
        schoolId: DISPOSABLE_SCHOOL_B_ID,
        email: DISPOSABLE_ADMIN_B_EMAIL,
        passwordHash: hashedPw,
        name: 'Admin B',
        role: UserRole.SCHOOL_ADMIN,
      },
    });

    // 4. Disposable Fee Staff (School A)
    await prisma.user.create({
      data: {
        id: DISPOSABLE_STAFF_ID,
        schoolId: ISO_SCHOOL_ID,
        email: DISPOSABLE_STAFF_EMAIL,
        passwordHash: hashedPw,
        name: 'Staff Test User',
        role: UserRole.FEE_STAFF,
      },
    });

    // 5. Disposable Teacher 1 (assigned to Grade 10 ATT Section A ATT)
    await prisma.user.create({
      data: {
        id: DISPOSABLE_TEACHER_1_USER_ID,
        schoolId: ISO_SCHOOL_ID,
        email: DISPOSABLE_TEACHER_1_EMAIL,
        passwordHash: hashedPw,
        name: 'Assigned Teacher User',
        role: UserRole.TEACHER,
      },
    });

    await prisma.teacher.create({
      data: {
        id: DISPOSABLE_TEACHER_1_PROFILE_ID,
        schoolId: ISO_SCHOOL_ID,
        employeeId: DISPOSABLE_TEACHER_1_EMPID,
        firstName: 'Assigned',
        lastName: 'Teacher',
        email: DISPOSABLE_TEACHER_1_EMAIL,
        userId: DISPOSABLE_TEACHER_1_USER_ID,
      },
    });

    await prisma.teacherAssignment.create({
      data: {
        id: DISPOSABLE_TEACHER_1_ASSIGNMENT_ID,
        schoolId: ISO_SCHOOL_ID,
        teacherId: DISPOSABLE_TEACHER_1_PROFILE_ID,
        academicYearId: ATT_AY_ID,
        gradeId: ATT_GRADE_ID,
        sectionId: ATT_SECTION_ID,
        subject: 'General',
        isClassTeacher: true,
      },
    });

    // 6. Disposable Teacher 2 (unassigned)
    await prisma.user.create({
      data: {
        id: DISPOSABLE_TEACHER_2_USER_ID,
        schoolId: ISO_SCHOOL_ID,
        email: DISPOSABLE_TEACHER_2_EMAIL,
        passwordHash: hashedPw,
        name: 'Unassigned Teacher User',
        role: UserRole.TEACHER,
      },
    });

    await prisma.teacher.create({
      data: {
        id: DISPOSABLE_TEACHER_2_PROFILE_ID,
        schoolId: ISO_SCHOOL_ID,
        employeeId: DISPOSABLE_TEACHER_2_EMPID,
        firstName: 'Unassigned',
        lastName: 'Teacher',
        email: DISPOSABLE_TEACHER_2_EMAIL,
        userId: DISPOSABLE_TEACHER_2_USER_ID,
      },
    });

    console.log('[SETUP] Disposable fixtures created successfully.');

    // -------------------------------------------------------------------------
    // Bootstrap In-Memory NestJS Application
    // -------------------------------------------------------------------------
    console.log('[SETUP] Bootstrapping NestJS application context...');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const server = app.getHttpServer();
    console.log('[SETUP] NestJS application initialized.');

    // -------------------------------------------------------------------------
    // Authentication: Acquire Server-Signed Tokens via Real Login Flow
    // -------------------------------------------------------------------------
    console.log('\n[AUTH] Authenticating test personas via /api/v1/auth/login...');

    async function login(email: string, password: string, schoolId: string): Promise<string> {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password, schoolId })
        .expect(200);
      if (!res.body?.accessToken) throw new Error(`Login failed for ${email}`);
      return res.body.accessToken;
    }

    const tokenAdminA = await login(ISO_ADMIN_EMAIL, ISO_ADMIN_PASSWORD, ISO_SCHOOL_ID);
    const tokenAdminB = await login(DISPOSABLE_ADMIN_B_EMAIL, TEST_PASSWORD, DISPOSABLE_SCHOOL_B_ID);
    const tokenStaff = await login(DISPOSABLE_STAFF_EMAIL, TEST_PASSWORD, ISO_SCHOOL_ID);
    const tokenTeacher1 = await login(DISPOSABLE_TEACHER_1_EMAIL, TEST_PASSWORD, ISO_SCHOOL_ID);
    const tokenTeacher2 = await login(DISPOSABLE_TEACHER_2_EMAIL, TEST_PASSWORD, ISO_SCHOOL_ID);

    console.log('[AUTH] All 5 persona tokens successfully acquired.');

    // -------------------------------------------------------------------------
    // TEST SUITE EXECUTION
    // -------------------------------------------------------------------------
    console.log('\n[TESTS] Executing Attendance PostgreSQL Integration Tests:');

    // Test 1: Unauthenticated and Malformed Token Rejection
    await recordTest('1. Unauthenticated & Invalid Token Rejection', async () => {
      await request(server)
        .get('/api/v1/attendance/register')
        .expect(401);

      await request(server)
        .get('/api/v1/attendance/register')
        .set('Authorization', 'Bearer invalid-token-xyz')
        .expect(401);
    })();

    // Test 2: Register Retrieval with Virtual NOT_MARKED Status
    await recordTest('2. Register Retrieval & Virtual NOT_MARKED Status', async () => {
      const res = await request(server)
        .get('/api/v1/attendance/register')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .query({
          academicYearId: ATT_AY_ID,
          gradeId: ATT_GRADE_ID,
          sectionId: ATT_SECTION_ID,
          date: '2026-10-25',
        });

      if (res.status !== 200) {
        throw new Error(`expected 200 "OK", got ${res.status}: ${JSON.stringify(res.body)}`);
      }

      const registerSummary = res.body?.register || res.body?.summary;
      if (!registerSummary) throw new Error('Missing register summary in response');
      if (registerSummary.status !== 'UNMARKED') {
        throw new Error(`Expected summary status UNMARKED, got: ${registerSummary.status}`);
      }
      if (registerSummary.totalEnrolled !== 1 || registerSummary.totalUnmarked !== 1) {
        throw new Error(`Unexpected enrollment count: ${JSON.stringify(registerSummary)}`);
      }
      if (!Array.isArray(res.body.data) || res.body.data.length !== 1) {
        throw new Error('Expected 1 student roster item');
      }
      if (res.body.data[0].status !== 'NOT_MARKED') {
        throw new Error(`Expected student virtual status NOT_MARKED, got: ${res.body.data[0].status}`);
      }
      if (res.body.data[0].studentId !== ATT_STUDENT_ID) {
        throw new Error(`Student ID mismatch: ${res.body.data[0].studentId}`);
      }

      // Assert 0 database attendance records exist
      const regCount = await prisma.attendanceRegister.count();
      const attCount = await prisma.studentAttendance.count();
      if (regCount !== 0 || attCount !== 0) {
        throw new Error(`Expected 0 DB rows before marking, got reg=${regCount}, att=${attCount}`);
      }
    })();

    // Test 3: Future-Date Rejection
    await recordTest('3. Future-Date Marking Rejection', async () => {
      const futureDate = new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0];
      const res = await request(server)
        .post('/api/v1/attendance/register/bulk-mark')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          academicYearId: ATT_AY_ID,
          gradeId: ATT_GRADE_ID,
          sectionId: ATT_SECTION_ID,
          attendanceDate: futureDate,
          entries: [{ studentId: ATT_STUDENT_ID, status: 'PRESENT' }],
        })
        .expect(400);

      const msg = JSON.stringify(res.body);
      if (!msg.toLowerCase().includes('future date')) {
        throw new Error(`Expected future date rejection message, got: ${msg}`);
      }
    })();

    // Test 4: Duplicate Payload Rejection
    await recordTest('4. Duplicate Payload Student Rejection', async () => {
      const res = await request(server)
        .post('/api/v1/attendance/register/bulk-mark')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          academicYearId: ATT_AY_ID,
          gradeId: ATT_GRADE_ID,
          sectionId: ATT_SECTION_ID,
          attendanceDate: '2026-10-25',
          entries: [
            { studentId: ATT_STUDENT_ID, status: 'PRESENT' },
            { studentId: ATT_STUDENT_ID, status: 'ABSENT' },
          ],
        })
        .expect(400);

      const msg = JSON.stringify(res.body);
      if (!msg.includes('Duplicate student entries')) {
        throw new Error(`Expected duplicate entries rejection, got: ${msg}`);
      }
    })();

    // Test 5: Atomic Rollback on Controlled Failure
    await recordTest('5. Controlled Failure & Atomic Transaction Rollback', async () => {
      const nonExistentStudentId = '00000000-0000-4000-8000-999999999999';
      await request(server)
        .post('/api/v1/attendance/register/bulk-mark')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          academicYearId: ATT_AY_ID,
          gradeId: ATT_GRADE_ID,
          sectionId: ATT_SECTION_ID,
          attendanceDate: '2026-10-24',
          entries: [
            { studentId: ATT_STUDENT_ID, status: 'PRESENT' },
            { studentId: nonExistentStudentId, status: 'ABSENT' },
          ],
        })
        .expect(400);

      // Verify zero partial writes in PostgreSQL
      const regCount = await prisma.attendanceRegister.count({
        where: { attendanceDate: new Date('2026-10-24') },
      });
      const attCount = await prisma.studentAttendance.count({
        where: { attendanceDate: new Date('2026-10-24') },
      });

      if (regCount !== 0 || attCount !== 0) {
        throw new Error(`Atomic rollback failed! Partial records found: reg=${regCount}, att=${attCount}`);
      }
    })();

    let markedAttendanceId = '';

    // Test 6: Successful Marking & Summary Persistence
    await recordTest('6. Successful Bulk Marking & Summary Persistence', async () => {
      const res = await request(server)
        .post('/api/v1/attendance/register/bulk-mark')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          academicYearId: ATT_AY_ID,
          gradeId: ATT_GRADE_ID,
          sectionId: ATT_SECTION_ID,
          attendanceDate: '2026-10-25',
          entries: [{ studentId: ATT_STUDENT_ID, status: 'PRESENT', remarks: 'On time' }],
        })
        .expect(200);

      if (res.body.summary?.status !== 'SUBMITTED') {
        throw new Error(`Expected summary status SUBMITTED, got: ${res.body.summary?.status}`);
      }
      if (res.body.summary.totalPresent !== 1 || res.body.summary.totalUnmarked !== 0) {
        throw new Error(`Unexpected summary counters: ${JSON.stringify(res.body.summary)}`);
      }

      // Verify PostgreSQL database rows
      const dbReg = await prisma.attendanceRegister.findFirst({
        where: {
          schoolId: ISO_SCHOOL_ID,
          sectionId: ATT_SECTION_ID,
          attendanceDate: new Date('2026-10-25'),
        },
      });
      if (!dbReg || dbReg.status !== 'SUBMITTED' || dbReg.totalPresent !== 1) {
        throw new Error(`DB Register verification failed: ${JSON.stringify(dbReg)}`);
      }

      const dbAtt = await prisma.studentAttendance.findFirst({
        where: {
          schoolId: ISO_SCHOOL_ID,
          studentId: ATT_STUDENT_ID,
          attendanceDate: new Date('2026-10-25'),
        },
      });
      if (!dbAtt || dbAtt.status !== 'PRESENT' || dbAtt.remarks !== 'On time') {
        throw new Error(`DB Student Attendance verification failed: ${JSON.stringify(dbAtt)}`);
      }

      markedAttendanceId = dbAtt.id;

      // Verify subsequent GET returns SUBMITTED register with PRESENT record
      const getRes = await request(server)
        .get('/api/v1/attendance/register')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .query({
          academicYearId: ATT_AY_ID,
          gradeId: ATT_GRADE_ID,
          sectionId: ATT_SECTION_ID,
          date: '2026-10-25',
        })
        .expect(200);

      const subsequentSummary = getRes.body?.register || getRes.body?.summary;
      if (subsequentSummary?.status !== 'SUBMITTED') {
        throw new Error(`Expected register status SUBMITTED, got: ${subsequentSummary?.status}`);
      }
      if (getRes.body.data[0]?.status !== 'PRESENT') {
        throw new Error(`Expected student mark PRESENT, got: ${getRes.body.data[0]?.status}`);
      }
    })();

    // Test 7: Cross-School Access Rejection
    await recordTest('7. Cross-School Multi-Tenant Access Rejection', async () => {
      // Admin B tries to read School A's register using School B token
      await request(server)
        .get('/api/v1/attendance/register')
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .query({
          academicYearId: ATT_AY_ID,
          gradeId: ATT_GRADE_ID,
          sectionId: ATT_SECTION_ID,
          date: '2026-10-25',
        })
        .expect((r) => {
          if (r.status !== 400 && r.status !== 404 && r.status !== 403) {
            throw new Error(`Expected 400/404/403 for cross-school query, got: ${r.status}`);
          }
        });

      // Admin B tries to spoof x-school-id header for School A
      await request(server)
        .get('/api/v1/attendance/register')
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .set('x-school-id', ISO_SCHOOL_ID)
        .query({
          academicYearId: ATT_AY_ID,
          gradeId: ATT_GRADE_ID,
          sectionId: ATT_SECTION_ID,
          date: '2026-10-25',
        })
        .expect(403);
    })();

    // Test 8: Teacher Assignment Authorization
    await recordTest('8. Teacher Assignment Authorization (Assigned vs Unassigned)', async () => {
      // Teacher 1 (assigned to Grade 10 ATT Section A ATT) succeeds
      await request(server)
        .get('/api/v1/attendance/register')
        .set('Authorization', `Bearer ${tokenTeacher1}`)
        .query({
          academicYearId: ATT_AY_ID,
          gradeId: ATT_GRADE_ID,
          sectionId: ATT_SECTION_ID,
          date: '2026-10-25',
        })
        .expect(200);

      // Teacher 2 (unassigned) is rejected with 403 Forbidden
      const unassignedRes = await request(server)
        .get('/api/v1/attendance/register')
        .set('Authorization', `Bearer ${tokenTeacher2}`)
        .query({
          academicYearId: ATT_AY_ID,
          gradeId: ATT_GRADE_ID,
          sectionId: ATT_SECTION_ID,
          date: '2026-10-25',
        })
        .expect(403);

      if (!JSON.stringify(unassignedRes.body).includes('not assigned to mark or view attendance')) {
        throw new Error(`Expected unassigned teacher error message, got: ${JSON.stringify(unassignedRes.body)}`);
      }

      // Teacher 2 bulk mark is also rejected with 403 Forbidden
      await request(server)
        .post('/api/v1/attendance/register/bulk-mark')
        .set('Authorization', `Bearer ${tokenTeacher2}`)
        .send({
          academicYearId: ATT_AY_ID,
          gradeId: ATT_GRADE_ID,
          sectionId: ATT_SECTION_ID,
          attendanceDate: '2026-10-25',
          entries: [{ studentId: ATT_STUDENT_ID, status: 'PRESENT' }],
        })
        .expect(403);
    })();

    // Test 9: Fee Staff Read-Only Access
    await recordTest('9. Fee Staff Read-Only Restrictions', async () => {
      // Fee Staff CAN read register
      await request(server)
        .get('/api/v1/attendance/register')
        .set('Authorization', `Bearer ${tokenStaff}`)
        .query({
          academicYearId: ATT_AY_ID,
          gradeId: ATT_GRADE_ID,
          sectionId: ATT_SECTION_ID,
          date: '2026-10-25',
        })
        .expect(200);

      // Fee Staff CAN read student history
      await request(server)
        .get(`/api/v1/attendance/students/${ATT_STUDENT_ID}`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .query({ academicYearId: ATT_AY_ID })
        .expect(200);

      // Fee Staff CANNOT bulk mark (403 Forbidden)
      await request(server)
        .post('/api/v1/attendance/register/bulk-mark')
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({
          academicYearId: ATT_AY_ID,
          gradeId: ATT_GRADE_ID,
          sectionId: ATT_SECTION_ID,
          attendanceDate: '2026-10-25',
          entries: [{ studentId: ATT_STUDENT_ID, status: 'PRESENT' }],
        })
        .expect(403);

      // Fee Staff CANNOT correct attendance (403 Forbidden)
      await request(server)
        .patch(`/api/v1/attendance/${markedAttendanceId}`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({ status: 'ABSENT', reason: 'Staff correction attempt' })
        .expect(403);
    })();

    // Test 10: Attendance Correction & Mandatory Reason / Audit Log
    await recordTest('10. Attendance Correction & Mandatory Reason Audit Log', async () => {
      // Correction without reason fails validation
      await request(server)
        .patch(`/api/v1/attendance/${markedAttendanceId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ status: 'LATE' })
        .expect(400);

      // Valid correction with reason succeeds
      const patchRes = await request(server)
        .patch(`/api/v1/attendance/${markedAttendanceId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          status: 'LATE',
          reason: 'Bus breakdown delayed arrival by 30 mins',
        })
        .expect(200);

      const updatedStatus = patchRes.body?.updatedRecord?.status || patchRes.body?.status;
      if (updatedStatus !== 'LATE') {
        throw new Error(`Expected status LATE, got: ${updatedStatus}`);
      }

      // Check PostgreSQL audit trail directly
      const auditLogs = await prisma.attendanceCorrectionLog.findMany({
        where: { attendanceId: markedAttendanceId },
      });

      if (auditLogs.length !== 1) {
        throw new Error(`Expected 1 audit log, found: ${auditLogs.length}`);
      }

      const log = auditLogs[0];
      if (log.previousStatus !== 'PRESENT' || log.newStatus !== 'LATE') {
        throw new Error(`Audit log status mismatch: prev=${log.previousStatus}, new=${log.newStatus}`);
      }
      if (log.reason !== 'Bus breakdown delayed arrival by 30 mins') {
        throw new Error(`Audit log reason mismatch: ${log.reason}`);
      }
      if (log.changedById !== ISO_ADMIN_USER_ID) {
        throw new Error(`Audit log missing or mismatched changedById: expected ${ISO_ADMIN_USER_ID}, got ${log.changedById}`);
      }
    })();

    // Test 11: Student History & Formula Weighting Verification
    await recordTest('11. Student History & Attendance Rate Formula Verification', async () => {
      // Mark a second day (2026-10-23) as EXCUSED
      await request(server)
        .post('/api/v1/attendance/register/bulk-mark')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          academicYearId: ATT_AY_ID,
          gradeId: ATT_GRADE_ID,
          sectionId: ATT_SECTION_ID,
          attendanceDate: '2026-10-23',
          entries: [{ studentId: ATT_STUDENT_ID, status: 'EXCUSED', remarks: 'Doctor appointment' }],
        })
        .expect(200);

      // Query Student History
      const histRes = await request(server)
        .get(`/api/v1/attendance/students/${ATT_STUDENT_ID}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .query({ academicYearId: ATT_AY_ID })
        .expect(200);

      const stats = histRes.body.stats;
      if (!stats) throw new Error('Missing stats in history response');

      // Formula checks:
      // Day 1 (2026-10-25): LATE (effective present = 1.0)
      // Day 2 (2026-10-23): EXCUSED (effective present = 0.0)
      // totalWorkingDays = 2
      // effectivePresent = 1.0
      // attendanceRate = (1.0 / 2.0) * 100 = 50.0%
      if (stats.totalWorkingDays !== 2) {
        throw new Error(`Expected totalWorkingDays=2, got: ${stats.totalWorkingDays}`);
      }
      if (stats.lateDays !== 1 || stats.excusedDays !== 1 || stats.presentDays !== 0) {
        throw new Error(`Stats breakdown mismatch: ${JSON.stringify(stats)}`);
      }
      if (stats.attendanceRate !== 50.0) {
        throw new Error(`Expected attendanceRate=50.0, got: ${stats.attendanceRate}`);
      }
    })();

    console.log('\n[SUCCESS] All 11 PostgreSQL integration test suites executed successfully!');
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP STAGE (Guaranteed in finally block)
    // -------------------------------------------------------------------------
    console.log('\n[CLEANUP] Beginning dependency-safe cleanup of test records...');
    try {
      if (app) {
        await app.close();
        console.log('[CLEANUP] NestJS application closed.');
      }

      // 1. Delete Attendance Correction Logs
      const deletedLogs = await prisma.attendanceCorrectionLog.deleteMany({
        where: { schoolId: ISO_SCHOOL_ID },
      });
      console.log(`  - Deleted ${deletedLogs.count} attendance correction logs.`);

      // 2. Delete Student Attendance Records
      const deletedAtt = await prisma.studentAttendance.deleteMany({
        where: { schoolId: ISO_SCHOOL_ID },
      });
      console.log(`  - Deleted ${deletedAtt.count} student attendance records.`);

      // 3. Delete Attendance Registers
      const deletedReg = await prisma.attendanceRegister.deleteMany({
        where: { schoolId: ISO_SCHOOL_ID },
      });
      console.log(`  - Deleted ${deletedReg.count} attendance registers.`);

      // 4. Delete Disposable Teacher Assignments
      const deletedTA = await prisma.teacherAssignment.deleteMany({
        where: { id: DISPOSABLE_TEACHER_1_ASSIGNMENT_ID },
      });
      console.log(`  - Deleted ${deletedTA.count} teacher assignments.`);

      // 5. Delete Disposable Teachers
      const deletedTeachers = await prisma.teacher.deleteMany({
        where: {
          id: { in: [DISPOSABLE_TEACHER_1_PROFILE_ID, DISPOSABLE_TEACHER_2_PROFILE_ID] },
        },
      });
      console.log(`  - Deleted ${deletedTeachers.count} teachers.`);

      // 6. Delete Disposable Student
      const deletedStudent = await prisma.student.deleteMany({
        where: { id: ATT_STUDENT_ID },
      });
      console.log(`  - Deleted ${deletedStudent.count} disposable students.`);

      // 7. Delete Disposable Section
      const deletedSection = await prisma.section.deleteMany({
        where: { id: ATT_SECTION_ID },
      });
      console.log(`  - Deleted ${deletedSection.count} disposable sections.`);

      // 8. Delete Disposable Grade
      const deletedGrade = await prisma.gradeClass.deleteMany({
        where: { id: ATT_GRADE_ID },
      });
      console.log(`  - Deleted ${deletedGrade.count} disposable grades.`);

      // 9. Delete Disposable Academic Year
      const deletedAY = await prisma.academicYear.deleteMany({
        where: { id: ATT_AY_ID },
      });
      console.log(`  - Deleted ${deletedAY.count} disposable academic years.`);

      // 10. Delete Disposable Users
      const deletedUsers = await prisma.user.deleteMany({
        where: {
          id: {
            in: [
              DISPOSABLE_ADMIN_B_ID,
              DISPOSABLE_STAFF_ID,
              DISPOSABLE_TEACHER_1_USER_ID,
              DISPOSABLE_TEACHER_2_USER_ID,
            ],
          },
        },
      });
      console.log(`  - Deleted ${deletedUsers.count} disposable users.`);

      // 11. Delete Disposable School B
      const deletedSchool = await prisma.school.deleteMany({
        where: { id: DISPOSABLE_SCHOOL_B_ID },
      });
      console.log(`  - Deleted ${deletedSchool.count} disposable schools.`);

      // 12. Post-Cleanup Baseline Count Comparison
      const finalCounts = {
        school: await prisma.school.count(),
        user: await prisma.user.count(),
        teacher: await prisma.teacher.count(),
        teacherAssignment: await prisma.teacherAssignment.count(),
        student: await prisma.student.count(),
        academicYear: await prisma.academicYear.count(),
        gradeClass: await prisma.gradeClass.count(),
        section: await prisma.section.count(),
        attendanceRegister: await prisma.attendanceRegister.count(),
        studentAttendance: await prisma.studentAttendance.count(),
        attendanceCorrectionLog: await prisma.attendanceCorrectionLog.count(),
        schoolHoliday: await prisma.schoolHoliday.count(),
      };

      console.log('\n[POST-CLEANUP VERIFICATION] Baseline vs Final Counts:');
      let isClean = true;
      for (const [k, baselineVal] of Object.entries(baselineCounts)) {
        const finalVal = finalCounts[k];
        const match = baselineVal === finalVal;
        console.log(`  - ${k}: baseline=${baselineVal}, final=${finalVal} -> ${match ? 'MATCH' : 'MISMATCH'}`);
        if (!match) isClean = false;
      }

      if (!isClean) {
        throw new Error('CRITICAL: Post-cleanup count mismatch with baseline!');
      }

      console.log('[POST-CLEANUP VERIFICATION] All counts restored to pristine baseline state.');
    } catch (cleanupErr: any) {
      console.error('[CLEANUP ERROR]:', cleanupErr.message || cleanupErr);
    } finally {
      await prisma.$disconnect();
    }
  }

  // Print Summary Table
  console.log('\n===============================================================');
  console.log('  TEST SUMMARY');
  console.log('===============================================================');
  let passCount = 0;
  for (const t of testResults) {
    console.log(`  [${t.passed ? 'PASS' : 'FAIL'}] ${t.name}`);
    if (t.passed) passCount++;
  }
  console.log(`\n  Total: ${testResults.length} | Passed: ${passCount} | Failed: ${testResults.length - passCount}`);
  console.log('===============================================================\n');

  if (passCount !== testResults.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n[FATAL TEST RUNNER ERROR]:', err);
  process.exit(1);
});
