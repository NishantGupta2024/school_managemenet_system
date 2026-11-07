/**
 * =============================================================================
 * TASK-P4-08D-20: Disposable Examination PostgreSQL Test Runner
 * =============================================================================
 * 
 * Objective:
 * Verifies examination result-release concurrency and lifecycle hardening against
 * an isolated, disposable PostgreSQL database created and torn down per test run.
 * 
 * Safety & Isolation Invariants:
 * 1. Admin connection strictly targets authorized localhost 'fee_iso_test'.
 * 2. Never mutates backend/.env; disposable URL is resolved and held in-memory.
 * 3. Disposable database name is cryptographically generated: ^fee_iso_exam_[a-f0-9]{12}$
 * 4. Migrations deployed via child process with in-memory DATABASE_URL.
 * 5. Preflight target safety check enforces allowedDatabases = [tempDbName].
 * 6. Hard runtime server identity handshake (SELECT current_database()).
 * 7. Teardown ensures all connections are drained and cleanly drops the database
 *    WITHOUT using FORCE or pg_terminate_backend.
 * =============================================================================
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { spawnSync } from 'child_process';
import {
  PrismaClient,
  UserRole,
  TenantStatus,
  StudentStatus,
  TeacherStatus,
} from '@prisma/client';
import {
  AssessmentMode,
  AssessmentStatus,
  AttemptStatus,
} from '../src/examination/types';
import { AppModule } from '../src/app.module';

// Reuse target validation helper from preflight-db-check.js
const { checkDatabaseTarget } = require('./preflight-db-check');

// -----------------------------------------------------------------------------
// 1. Connection Resolution & Target Safety Guards
// -----------------------------------------------------------------------------
export function resolveAdminDatabaseUrl(): string {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('[SAFETY GUARD ERROR] backend/.env file not found');
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const line = envContent.split('\n').find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  if (!line) {
    throw new Error('[SAFETY GUARD ERROR] DATABASE_URL not found in backend/.env');
  }

  const idx = line.indexOf('=');
  const rawUrl = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  const parsed = new URL(rawUrl);

  // Administrative target strictly set to fee_iso_test on localhost
  parsed.pathname = '/fee_iso_test';
  if (!parsed.searchParams.get('schema')) {
    parsed.searchParams.set('schema', 'public');
  }

  const adminUrl = parsed.toString();

  // Fail-closed static target validation
  const check = checkDatabaseTarget(adminUrl, { allowedDatabases: ['fee_iso_test'] });
  if (!check.ok) {
    throw new Error(`[SAFETY GUARD ERROR] Admin target rejected: ${check.reason}`);
  }
  if (check.dbName !== 'fee_iso_test') {
    throw new Error(
      `[SAFETY GUARD ERROR] Prohibited admin database '${check.dbName}'. Admin target must be 'fee_iso_test'.`,
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
    throw new Error(`[SAFETY GUARD ERROR] Non-localhost host rejected: ${host}`);
  }

  return adminUrl;
}

export interface DisposableDatabaseTarget {
  dbName: string;
  tempUrl: string;
}

export function generateDisposableDatabaseTarget(adminUrl: string): DisposableDatabaseTarget {
  const randomHex = crypto.randomBytes(6).toString('hex'); // 12 hex characters
  const dbName = `fee_iso_exam_${randomHex}`;

  if (!/^fee_iso_exam_[a-f0-9]{12}$/.test(dbName)) {
    throw new Error(`[SAFETY GUARD ERROR] Generated invalid dbName format: ${dbName}`);
  }

  const parsed = new URL(adminUrl);
  parsed.pathname = `/${dbName}`;
  parsed.searchParams.set('schema', 'public');
  const tempUrl = parsed.toString();

  // Validate the temporary target URL using preflight-db-check
  const check = checkDatabaseTarget(tempUrl, { allowedDatabases: [dbName] });
  if (!check.ok) {
    throw new Error(`[SAFETY GUARD ERROR] Disposable target rejected: ${check.reason}`);
  }
  if (check.dbName !== dbName) {
    throw new Error(
      `[SAFETY GUARD ERROR] Mismatched disposable target name: expected ${dbName}, got ${check.dbName}`,
    );
  }

  return { dbName, tempUrl };
}

// -----------------------------------------------------------------------------
// 2. Disposable Database Provisioning & Migration
// -----------------------------------------------------------------------------
export async function provisionDisposableDatabase(adminUrl: string, dbName: string): Promise<void> {
  const adminPrisma = new PrismaClient({
    datasources: { db: { url: adminUrl } },
    log: ['error'],
  });

  try {
    // 1. Verify admin target identity handshake
    const rows = await adminPrisma.$queryRawUnsafe<any[]>(`SELECT current_database() as db`);
    if (rows[0]?.db !== 'fee_iso_test') {
      throw new Error(
        `[SAFETY GUARD ERROR] Admin handshake failed. Connected to '${rows[0]?.db}', expected 'fee_iso_test'.`,
      );
    }

    // 2. Fail-closed check: ensure the random db does not already exist
    const existsRows = await adminPrisma.$queryRawUnsafe<any[]>(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      dbName,
    );
    if (existsRows.length > 0) {
      throw new Error(
        `[SAFETY GUARD ERROR] Disposable database '${dbName}' already exists. Aborting to prevent accidental mutation.`,
      );
    }

    // 3. Execute CREATE DATABASE
    console.log(`[PROVISION] Creating disposable database: ${dbName}`);
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    console.log(`[PROVISION] Disposable database '${dbName}' successfully created.`);
  } finally {
    await adminPrisma.$disconnect();
  }
}

export function applyMigrationsToDisposableDatabase(tempUrl: string, dbName: string): void {
  console.log(`[MIGRATE] Applying version-controlled migrations to '${dbName}'...`);

  if (!/^fee_iso_exam_[a-f0-9]{12}$/.test(dbName)) {
    throw new Error(`[SAFETY GUARD ERROR] Invalid database name for migration: ${dbName}`);
  }

  const parsed = new URL(tempUrl);
  if (parsed.pathname !== `/${dbName}`) {
    throw new Error(
      `[SAFETY GUARD ERROR] URL pathname '${parsed.pathname}' does not match dbName '${dbName}'`,
    );
  }

  const check = checkDatabaseTarget(tempUrl, { allowedDatabases: [dbName] });
  if (!check.ok) {
    throw new Error(`[SAFETY GUARD ERROR] Target rejected before migration: ${check.reason}`);
  }

  const backendDir = path.resolve(__dirname, '..');
  const prismaBin = require.resolve('prisma/build/index.js');

  const result = spawnSync(process.execPath, [prismaBin, 'migrate', 'deploy'], {
    cwd: backendDir,
    env: {
      ...process.env,
      DATABASE_URL: tempUrl,
      AUTHORIZED_DATABASE: dbName,
      ALLOWED_STAGING_HOSTS: 'localhost,127.0.0.1,::1',
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const sanitizedError = (result.stderr || result.stdout || 'Unknown migration error')
      .replace(new RegExp(tempUrl, 'g'), '[REDACTED_DATABASE_URL]');
    throw new Error(
      `[MIGRATE ERROR] Migration deployment failed with code ${result.status}:\n${sanitizedError}`,
    );
  }

  console.log(`[MIGRATE] Migrations applied successfully to '${dbName}'.`);
}

export async function teardownDisposableDatabase(
  adminUrl: string,
  dbName: string,
  created: boolean,
): Promise<void> {
  if (!created) {
    console.log(`[TEARDOWN] Database '${dbName}' was not created by this run; skipping DROP.`);
    return;
  }

  if (!/^fee_iso_exam_[a-f0-9]{12}$/.test(dbName)) {
    console.error(`[TEARDOWN ERROR] Refusing to drop database with unexpected name: '${dbName}'`);
    return;
  }

  console.log(`[TEARDOWN] Commencing drop of disposable database: ${dbName}...`);
  const adminPrisma = new PrismaClient({
    datasources: { db: { url: adminUrl } },
    log: ['error'],
  });

  try {
    // 1. Verify admin target identity
    const idRows = await adminPrisma.$queryRawUnsafe<any[]>(`SELECT current_database() as db`);
    if (idRows[0]?.db !== 'fee_iso_test') {
      console.error(
        `[TEARDOWN ERROR] Admin connection pointed to '${idRows[0]?.db}'. Refusing to issue DROP.`,
      );
      return;
    }

    // 2. Poll for active sessions to gracefully drain (up to 5 seconds)
    const maxWaitMs = 5000;
    const intervalMs = 500;
    let elapsed = 0;
    let activeSessions = 0;

    while (elapsed < maxWaitMs) {
      const sessRows = await adminPrisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int as count FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        dbName,
      );
      activeSessions = Number(sessRows[0]?.count ?? 0);
      if (activeSessions === 0) break;
      await new Promise((r) => setTimeout(r, intervalMs));
      elapsed += intervalMs;
    }

    if (activeSessions > 0) {
      console.warn(
        `[TEARDOWN WARNING] ${activeSessions} active session(s) remain on '${dbName}'. Skipping DROP to avoid forceful termination. Database remains available for manual administrator review.`,
      );
      return;
    }

    // 3. Drop disposable database (No WITH FORCE)
    await adminPrisma.$executeRawUnsafe(`DROP DATABASE "${dbName}"`);
    console.log(`[TEARDOWN] Disposable database '${dbName}' dropped cleanly.`);
  } catch (err: any) {
    console.error(
      `[TEARDOWN ERROR] Failed to drop disposable database '${dbName}': ${err.message || err}`,
    );
  } finally {
    await adminPrisma.$disconnect();
  }
}

// -----------------------------------------------------------------------------
// 3. Unique Execution Run Identifier & Disposable Entity IDs
// -----------------------------------------------------------------------------
const RUN_ID = crypto.randomUUID();
const RUN_SHORT = RUN_ID.slice(0, 8);

const FIXTURE_SCHOOL_ID = crypto.randomUUID();
const FIXTURE_SCHOOL_CODE = `SCH-EXAM-${RUN_SHORT}`.toUpperCase();

const FIXTURE_AY_ID = crypto.randomUUID();
const FIXTURE_GRADE_ID = crypto.randomUUID();
const FIXTURE_SECTION_ID = crypto.randomUUID();

const FIXTURE_ADMIN_USER_ID = crypto.randomUUID();
const FIXTURE_ADMIN_EMAIL = `admin-${RUN_SHORT}@iso-exam-test.edu`;

const FIXTURE_TEACHER_USER_ID = crypto.randomUUID();
const FIXTURE_TEACHER_PROFILE_ID = crypto.randomUUID();
const FIXTURE_TEACHER_EMAIL = `teacher-${RUN_SHORT}@iso-exam-test.edu`;
const FIXTURE_TEACHER_EMP_ID = `EMP-${RUN_SHORT}`;

const FIXTURE_STUDENT1_USER_ID = crypto.randomUUID();
const FIXTURE_STUDENT1_PROFILE_ID = crypto.randomUUID();
const FIXTURE_STUDENT1_EMAIL = `student1-${RUN_SHORT}@iso-exam-test.edu`;
const FIXTURE_STUDENT1_ADM = `ADM1-${RUN_SHORT}`;

const FIXTURE_STUDENT2_USER_ID = crypto.randomUUID();
const FIXTURE_STUDENT2_PROFILE_ID = crypto.randomUUID();
const FIXTURE_STUDENT2_EMAIL = `student2-${RUN_SHORT}@iso-exam-test.edu`;
const FIXTURE_STUDENT2_ADM = `ADM2-${RUN_SHORT}`;

const FIXTURE_STUDENT3_USER_ID = crypto.randomUUID();
const FIXTURE_STUDENT3_PROFILE_ID = crypto.randomUUID();
const FIXTURE_STUDENT3_EMAIL = `student3-${RUN_SHORT}@iso-exam-test.edu`;
const FIXTURE_STUDENT3_ADM = `ADM3-${RUN_SHORT}`;

const FIXTURE_STUDENT4_USER_ID = crypto.randomUUID();
const FIXTURE_STUDENT4_PROFILE_ID = crypto.randomUUID();
const FIXTURE_STUDENT4_EMAIL = `student4-${RUN_SHORT}@iso-exam-test.edu`;
const FIXTURE_STUDENT4_ADM = `ADM4-${RUN_SHORT}`;

const FIXTURE_PARENT_USER_ID = crypto.randomUUID();
const FIXTURE_PARENT_EMAIL = `parent-${RUN_SHORT}@iso-exam-test.edu`;
const FIXTURE_PARENT_REL_ID = crypto.randomUUID();

const FIXTURE_UNAUTH_PARENT_USER_ID = crypto.randomUUID();
const FIXTURE_UNAUTH_PARENT_EMAIL = `unauth-parent-${RUN_SHORT}@iso-exam-test.edu`;

const TEST_PASSWORD = 'IsoExamPassword123!';

// -----------------------------------------------------------------------------
// 4. Test Result Reporting Structure
// -----------------------------------------------------------------------------
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: Record<string, any>;
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

// -----------------------------------------------------------------------------
// 5. Concurrency Barrier Utility
// -----------------------------------------------------------------------------
class ConcurrencyBarrier {
  private count: number;
  private current = 0;
  private resolveAll!: () => void;
  private promise: Promise<void>;

  constructor(count: number) {
    this.count = count;
    this.promise = new Promise((resolve) => {
      this.resolveAll = resolve;
    });
  }

  async wait(): Promise<void> {
    this.current++;
    if (this.current >= this.count) {
      this.resolveAll();
    }
    return this.promise;
  }
}

// -----------------------------------------------------------------------------
// 6. Main Runner Implementation
// -----------------------------------------------------------------------------
export async function main() {
  console.log('===============================================================');
  console.log('  TASK-P4-08D-20: Disposable Examination PostgreSQL Test Runner');
  console.log('===============================================================\n');

  // 1. Resolve Admin URL and Generate Disposable Target
  const adminUrl = resolveAdminDatabaseUrl();
  const { dbName, tempUrl } = generateDisposableDatabaseTarget(adminUrl);

  console.log(`[TARGET] Admin Database: fee_iso_test (localhost)`);
  console.log(`[TARGET] Disposable Database: ${dbName}\n`);

  let dbCreated = false;
  let app: INestApplication | null = null;
  let prisma: PrismaClient | null = null;

  try {
    // 2. Provision Disposable Database
    await provisionDisposableDatabase(adminUrl, dbName);
    dbCreated = true;

    // 3. Deploy Migrations to Disposable Database
    applyMigrationsToDisposableDatabase(tempUrl, dbName);

    // 4. Set in-memory DATABASE_URL for NestJS and Prisma Client
    process.env.DATABASE_URL = tempUrl;

    // 5. Connect Application Prisma Client
    prisma = new PrismaClient({
      datasources: { db: { url: tempUrl } },
      log: ['error'],
    });
    await prisma.$connect();

    // 6. Runtime Server Handshake
    const idCheck = await prisma.$queryRawUnsafe<any[]>(`SELECT current_database() as db`);
    if (idCheck[0]?.db !== dbName) {
      throw new Error(
        `[SAFETY VIOLATION] Application connected to '${idCheck[0]?.db}' instead of '${dbName}'!`,
      );
    }
    console.log(`[HANDSHAKE] Confirmed connection to disposable database: ${dbName}\n`);

    // -------------------------------------------------------------------------
    // Setup Base Personas & Fixtures in Disposable DB
    // -------------------------------------------------------------------------
    console.log('[SETUP] Seeding base fixtures into disposable database...');
    const hashedPw = await bcrypt.hash(TEST_PASSWORD, 10);

    // School
    await prisma.school.create({
      data: {
        id: FIXTURE_SCHOOL_ID,
        name: `Iso Exam Test School ${RUN_SHORT}`,
        code: FIXTURE_SCHOOL_CODE,
        status: TenantStatus.ACTIVE,
      },
    });

    // Academic Year
    await prisma.academicYear.create({
      data: {
        id: FIXTURE_AY_ID,
        schoolId: FIXTURE_SCHOOL_ID,
        name: `2026-2027-EXAM-${RUN_SHORT}`,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T23:59:59.999Z'),
        isCurrent: true,
      },
    });

    // Grade Class
    await prisma.gradeClass.create({
      data: {
        id: FIXTURE_GRADE_ID,
        schoolId: FIXTURE_SCHOOL_ID,
        name: 'Grade 10 Exam',
        code: `G10-${RUN_SHORT}`,
      },
    });

    // Section
    await prisma.section.create({
      data: {
        id: FIXTURE_SECTION_ID,
        schoolId: FIXTURE_SCHOOL_ID,
        gradeId: FIXTURE_GRADE_ID,
        name: 'Section A Exam',
      },
    });

    // 1. School Admin
    await prisma.user.create({
      data: {
        id: FIXTURE_ADMIN_USER_ID,
        email: FIXTURE_ADMIN_EMAIL,
        passwordHash: hashedPw,
        name: 'Exam Admin',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: FIXTURE_SCHOOL_ID,
        status: 'ACTIVE',
      },
    });

    // 2. Teacher
    await prisma.user.create({
      data: {
        id: FIXTURE_TEACHER_USER_ID,
        email: FIXTURE_TEACHER_EMAIL,
        passwordHash: hashedPw,
        name: 'Exam Teacher',
        role: UserRole.TEACHER,
        schoolId: FIXTURE_SCHOOL_ID,
        status: 'ACTIVE',
      },
    });
    await prisma.teacher.create({
      data: {
        id: FIXTURE_TEACHER_PROFILE_ID,
        userId: FIXTURE_TEACHER_USER_ID,
        schoolId: FIXTURE_SCHOOL_ID,
        employeeId: FIXTURE_TEACHER_EMP_ID,
        firstName: 'Exam',
        lastName: 'Teacher',
        email: FIXTURE_TEACHER_EMAIL,
        status: TeacherStatus.ACTIVE,
      },
    });

    // 3. Students 1, 2, 3, 4
    const studentConfigs = [
      {
        userId: FIXTURE_STUDENT1_USER_ID,
        profileId: FIXTURE_STUDENT1_PROFILE_ID,
        email: FIXTURE_STUDENT1_EMAIL,
        adm: FIXTURE_STUDENT1_ADM,
        name: 'Exam Student 1',
      },
      {
        userId: FIXTURE_STUDENT2_USER_ID,
        profileId: FIXTURE_STUDENT2_PROFILE_ID,
        email: FIXTURE_STUDENT2_EMAIL,
        adm: FIXTURE_STUDENT2_ADM,
        name: 'Exam Student 2',
      },
      {
        userId: FIXTURE_STUDENT3_USER_ID,
        profileId: FIXTURE_STUDENT3_PROFILE_ID,
        email: FIXTURE_STUDENT3_EMAIL,
        adm: FIXTURE_STUDENT3_ADM,
        name: 'Exam Student 3',
      },
      {
        userId: FIXTURE_STUDENT4_USER_ID,
        profileId: FIXTURE_STUDENT4_PROFILE_ID,
        email: FIXTURE_STUDENT4_EMAIL,
        adm: FIXTURE_STUDENT4_ADM,
        name: 'Exam Student 4',
      },
    ];

    for (const sc of studentConfigs) {
      await prisma.user.create({
        data: {
          id: sc.userId,
          email: sc.email,
          passwordHash: hashedPw,
          name: sc.name,
          role: UserRole.STUDENT,
          schoolId: FIXTURE_SCHOOL_ID,
          status: 'ACTIVE',
        },
      });
      await prisma.student.create({
        data: {
          id: sc.profileId,
          userId: sc.userId,
          schoolId: FIXTURE_SCHOOL_ID,
          admissionNumber: sc.adm,
          firstName: sc.name.split(' ')[0] || 'Exam',
          lastName: sc.name.split(' ').slice(1).join(' ') || 'Student',
          gradeId: FIXTURE_GRADE_ID,
          sectionId: FIXTURE_SECTION_ID,
          academicYearId: FIXTURE_AY_ID,
          status: StudentStatus.ACTIVE,
        },
      });
    }

    // 4. Parent for Student 3
    await prisma.user.create({
      data: {
        id: FIXTURE_PARENT_USER_ID,
        email: FIXTURE_PARENT_EMAIL,
        passwordHash: hashedPw,
        name: 'Exam Parent 3',
        role: UserRole.PARENT,
        schoolId: FIXTURE_SCHOOL_ID,
        status: 'ACTIVE',
      },
    });
    await prisma.parentStudentRelation.create({
      data: {
        id: FIXTURE_PARENT_REL_ID,
        schoolId: FIXTURE_SCHOOL_ID,
        parentId: FIXTURE_PARENT_USER_ID,
        studentId: FIXTURE_STUDENT3_PROFILE_ID,
        relationshipType: 'FATHER',
        isVerified: true,
      },
    });

    // 5. Unrelated Parent
    await prisma.user.create({
      data: {
        id: FIXTURE_UNAUTH_PARENT_USER_ID,
        email: FIXTURE_UNAUTH_PARENT_EMAIL,
        passwordHash: hashedPw,
        name: 'Unrelated Parent',
        role: UserRole.PARENT,
        schoolId: FIXTURE_SCHOOL_ID,
        status: 'ACTIVE',
      },
    });

    // -------------------------------------------------------------------------
    // Bootstrap NestJS Test Application
    // -------------------------------------------------------------------------
    console.log('[SETUP] Bootstrapping NestJS testing module...');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    const server = app.getHttpServer();

    // -------------------------------------------------------------------------
    // Authenticate Personas via Real Login Flow
    // -------------------------------------------------------------------------
    console.log('[AUTH] Acquiring authenticated JWT tokens via /api/v1/auth/login...');
    async function login(email: string): Promise<string> {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: TEST_PASSWORD, schoolId: FIXTURE_SCHOOL_ID })
        .expect(200);

      if (!res.body?.accessToken) {
        throw new Error(`[AUTH ERROR] Login failed for ${email}`);
      }
      return res.body.accessToken;
    }

    const adminToken = await login(FIXTURE_ADMIN_EMAIL);
    const teacherToken = await login(FIXTURE_TEACHER_EMAIL);
    const student1Token = await login(FIXTURE_STUDENT1_EMAIL);
    const student3Token = await login(FIXTURE_STUDENT3_EMAIL);
    const student4Token = await login(FIXTURE_STUDENT4_EMAIL);
    const parentToken = await login(FIXTURE_PARENT_EMAIL);
    const unauthParentToken = await login(FIXTURE_UNAUTH_PARENT_EMAIL);

    console.log('[AUTH] Persona tokens successfully acquired.\n');

    // -------------------------------------------------------------------------
    // SQL Helpers for Examination Entity Persistence
    // -------------------------------------------------------------------------
    async function createAssessmentFixture(titleSuffix: string) {
      const assessmentId = crypto.randomUUID();
      const question1Id = crypto.randomUUID();
      const question2Id = crypto.randomUUID();

      // In accordance with trg_question_paper_immutability, assessment MUST be created in DRAFT
      await prisma!.$executeRawUnsafe(
        `INSERT INTO "assessments" (
          "id", "schoolId", "academicYearId", "gradeId", "sectionId", "teacherId",
          "title", "description", "subject", "mode", "status", "totalMarks", "passingMarks",
          "durationMinutes", "startWindowAt", "endWindowAt", "shuffleQuestions", "shuffleOptions",
          "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10::"AssessmentMode", 'DRAFT'::"AssessmentStatus", $11, $12,
          $13, $14, $15, $16, $17,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`,
        assessmentId,
        FIXTURE_SCHOOL_ID,
        FIXTURE_AY_ID,
        FIXTURE_GRADE_ID,
        FIXTURE_SECTION_ID,
        FIXTURE_TEACHER_PROFILE_ID,
        `Assessment ${titleSuffix} ${RUN_SHORT}`,
        'Assessment Description',
        'Mathematics',
        AssessmentMode.NORMAL_QUIZ,
        10.0,
        4.0,
        60,
        new Date(Date.now() - 3600000),
        new Date(Date.now() + 7200000),
        false,
        false,
      );

      // Insert questions while assessment is in DRAFT
      await prisma!.$executeRawUnsafe(
        `INSERT INTO "assessment_questions" (
          "id", "schoolId", "assessmentId", "orderIndex",
          "questionText", "options", "correctOption", "marks", "explanation",
          "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6::jsonb, $7, $8, $9,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`,
        question1Id,
        FIXTURE_SCHOOL_ID,
        assessmentId,
        0,
        'What is 2 + 2?',
        JSON.stringify(['4', '3', '5', '6']),
        0,
        5.0,
        '2 + 2 = 4',
      );

      await prisma!.$executeRawUnsafe(
        `INSERT INTO "assessment_questions" (
          "id", "schoolId", "assessmentId", "orderIndex",
          "questionText", "options", "correctOption", "marks", "explanation",
          "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6::jsonb, $7, $8, $9,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`,
        question2Id,
        FIXTURE_SCHOOL_ID,
        assessmentId,
        1,
        'What is 3 * 3?',
        JSON.stringify(['6', '9', '12', '15']),
        1,
        5.0,
        '3 * 3 = 9',
      );

      return { assessmentId, question1Id, question2Id };
    }

    async function transitionAssessmentStatus(
      assessmentId: string,
      toStatus: AssessmentStatus,
    ) {
      await prisma!.$executeRawUnsafe(
        `UPDATE "assessments" SET "status" = $1::"AssessmentStatus", "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2 AND "schoolId" = $3`,
        toStatus,
        assessmentId,
        FIXTURE_SCHOOL_ID,
      );
    }

    async function getAssessmentById(id: string) {
      const rows = await prisma!.$queryRawUnsafe<any[]>(
        `SELECT * FROM "assessments" WHERE "schoolId" = $1 AND "id" = $2`,
        FIXTURE_SCHOOL_ID,
        id,
      );
      return rows[0] || null;
    }

    async function getAttemptById(id: string) {
      const rows = await prisma!.$queryRawUnsafe<any[]>(
        `SELECT a.*, r.id as "resultId", r.score as "resultScore", r."isPassing" as "resultIsPassing", r."createdAt" as "resultCreatedAt"
         FROM "assessment_attempts" a
         LEFT JOIN "assessment_results" r ON r."attemptId" = a.id
         WHERE a."schoolId" = $1 AND a."id" = $2`,
        FIXTURE_SCHOOL_ID,
        id,
      );
      return rows[0] || null;
    }

    // =========================================================================
    // TEST SCENARIOS
    // =========================================================================
    console.log('[TESTS] Executing Examination PostgreSQL Integration Scenarios:\n');

    // -------------------------------------------------------------------------
    // Scenario 1: Barrier-Controlled Concurrent Submission vs. Result Release
    // -------------------------------------------------------------------------
    await recordTest(
      'Scenario 1: Barrier-Controlled Concurrent Submission vs. Result Release',
      async () => {
        const { assessmentId, question1Id, question2Id } =
          await createAssessmentFixture('Scenario1');

        await transitionAssessmentStatus(assessmentId, AssessmentStatus.PUBLISHED);

        const attemptId = crypto.randomUUID();
        const ans1Id = crypto.randomUUID();
        const ans2Id = crypto.randomUUID();

        // Setup active attempt with answers
        await prisma!.$executeRawUnsafe(
          `INSERT INTO "assessment_attempts" (
            "id", "schoolId", "assessmentId", "studentId", "status", "startedAt", "deadlineAt", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, 'IN_PROGRESS'::"AttemptStatus", $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )`,
          attemptId,
          FIXTURE_SCHOOL_ID,
          assessmentId,
          FIXTURE_STUDENT1_PROFILE_ID,
          new Date(Date.now() - 600000),
          new Date(Date.now() + 1800000),
        );

        await prisma!.$executeRawUnsafe(
          `INSERT INTO "attempt_answers" (
            "id", "schoolId", "assessmentId", "attemptId", "questionId", "selectedOption", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )`,
          ans1Id,
          FIXTURE_SCHOOL_ID,
          assessmentId,
          attemptId,
          question1Id,
          0, // correct
        );

        await prisma!.$executeRawUnsafe(
          `INSERT INTO "attempt_answers" (
            "id", "schoolId", "assessmentId", "attemptId", "questionId", "selectedOption", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )`,
          ans2Id,
          FIXTURE_SCHOOL_ID,
          assessmentId,
          attemptId,
          question2Id,
          1, // correct
        );

        await transitionAssessmentStatus(assessmentId, AssessmentStatus.CLOSED);

        // Coordinate concurrent execution via barrier
        const barrier = new ConcurrencyBarrier(2);
        let submitResponse: any = null;
        let releaseResponse: any = null;

        const workerSubmit = async () => {
          await barrier.wait();
          submitResponse = await request(server)
            .post(`/api/v1/examination/student/attempts/${attemptId}/submit`)
            .set('Authorization', `Bearer ${student1Token}`);
        };

        const workerRelease = async () => {
          await barrier.wait();
          releaseResponse = await request(server)
            .post(`/api/v1/examination/assessments/${assessmentId}/release-results`)
            .set('Authorization', `Bearer ${adminToken}`);
        };

        await Promise.all([workerSubmit(), workerRelease()]);

        const assessmentAfter = await getAssessmentById(assessmentId);
        const attemptAfter = await getAttemptById(attemptId);

        // Invariant 1: Attempt MUST be SUBMITTED
        if (attemptAfter?.status !== AttemptStatus.SUBMITTED) {
          throw new Error(
            `Expected attempt status SUBMITTED, got '${attemptAfter?.status}'`,
          );
        }

        // Invariant 2: Result MUST be persisted atomically with attempt finalization
        if (!attemptAfter?.resultId) {
          throw new Error('AssessmentResult was not persisted for the submitted attempt');
        }

        // Invariant 3: Verify Score Accuracy
        const score = Number(attemptAfter.resultScore);
        if (score !== 10) {
          throw new Error(`Expected score 10.00, got ${score}`);
        }

        // Invariant 4: Either Release Won After Submission OR Release Safely Rejected Active Attempt
        if (releaseResponse.status === 200) {
          if (assessmentAfter?.status !== AssessmentStatus.RESULTS_RELEASED) {
            throw new Error(
              `Expected assessment status RESULTS_RELEASED, got '${assessmentAfter?.status}'`,
            );
          }
        } else if (releaseResponse.status === 400) {
          if (assessmentAfter?.status !== AssessmentStatus.CLOSED) {
            throw new Error(
              `Release failed with 400, but assessment status is '${assessmentAfter?.status}' instead of CLOSED`,
            );
          }

          // Retry release after finalization succeeds
          await request(server)
            .post(`/api/v1/examination/assessments/${assessmentId}/release-results`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

          const finalAssessment = await getAssessmentById(assessmentId);
          if (finalAssessment?.status !== AssessmentStatus.RESULTS_RELEASED) {
            throw new Error(
              `Expected assessment status RESULTS_RELEASED on retry, got '${finalAssessment?.status}'`,
            );
          }
        } else {
          throw new Error(
            `Unexpected release response status ${releaseResponse.status}: ${JSON.stringify(releaseResponse.body)}`,
          );
        }

        // Invariant 5: Exactly 1 result row in total for this assessment
        const totalResults = await prisma!.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int as count FROM "assessment_results" WHERE "assessmentId" = $1`,
          assessmentId,
        );
        if (totalResults[0]?.count !== 1) {
          throw new Error(
            `Expected exactly 1 result row for assessment, found ${totalResults[0]?.count}`,
          );
        }
      },
    )();

    // -------------------------------------------------------------------------
    // Scenario 2: Release Rejection when a Terminal Attempt has No Result
    // -------------------------------------------------------------------------
    await recordTest(
      'Scenario 2: Release Rejection when a Terminal Attempt has No Result',
      async () => {
        const { assessmentId } = await createAssessmentFixture('Scenario2');
        await transitionAssessmentStatus(assessmentId, AssessmentStatus.PUBLISHED);

        const terminalAttemptId = crypto.randomUUID();

        // Setup terminal attempt: insert as IN_PROGRESS first, then transition to TIMED_OUT
        await prisma!.$executeRawUnsafe(
          `INSERT INTO "assessment_attempts" (
            "id", "schoolId", "assessmentId", "studentId", "status", "startedAt", "deadlineAt", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, 'IN_PROGRESS'::"AttemptStatus", $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )`,
          terminalAttemptId,
          FIXTURE_SCHOOL_ID,
          assessmentId,
          FIXTURE_STUDENT2_PROFILE_ID,
          new Date(Date.now() - 7200000),
          new Date(Date.now() - 3600000),
        );

        await prisma!.$executeRawUnsafe(
          `UPDATE "assessment_attempts"
           SET "status" = 'TIMED_OUT'::"AttemptStatus", "submittedAt" = $1, "updatedAt" = CURRENT_TIMESTAMP
           WHERE "id" = $2 AND "schoolId" = $3`,
          new Date(Date.now() - 3600000),
          terminalAttemptId,
          FIXTURE_SCHOOL_ID,
        );

        await transitionAssessmentStatus(assessmentId, AssessmentStatus.CLOSED);

        // Attempt release: must be rejected with HTTP 400
        const releaseRes = await request(server)
          .post(`/api/v1/examination/assessments/${assessmentId}/release-results`)
          .set('Authorization', `Bearer ${teacherToken}`);

        if (releaseRes.status !== 400) {
          throw new Error(
            `Expected HTTP 400 for release with missing terminal result, got ${releaseRes.status}: ${JSON.stringify(releaseRes.body)}`,
          );
        }

        const errMsg = releaseRes.body?.message || '';
        if (
          !errMsg.includes('terminal attempts do not have calculated results') &&
          !errMsg.includes('missing')
        ) {
          throw new Error(
            `Expected rejection message regarding missing results, got: '${errMsg}'`,
          );
        }

        // Verify Assessment status in PostgreSQL remains CLOSED
        const dbAssessment = await getAssessmentById(assessmentId);
        if (dbAssessment?.status !== AssessmentStatus.CLOSED) {
          throw new Error(
            `Assessment status was mutated to '${dbAssessment?.status}' instead of remaining CLOSED`,
          );
        }

        // Verify 0 results exist
        const dbResults = await prisma!.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int as count FROM "assessment_results" WHERE "assessmentId" = $1`,
          assessmentId,
        );
        if (dbResults[0]?.count !== 0) {
          throw new Error(
            `Expected 0 results for assessment, but found ${dbResults[0]?.count}`,
          );
        }
      },
    )();

    // -------------------------------------------------------------------------
    // Scenario 3: Read-Only Student & Parent Result Retrieval After Release
    // -------------------------------------------------------------------------
    await recordTest(
      'Scenario 3: Read-Only Student & Parent Result Retrieval After Release',
      async () => {
        // A. Setup Released Assessment
        const { assessmentId: releasedAssessmentId } = await createAssessmentFixture(
          'Scenario3Released',
        );
        await transitionAssessmentStatus(releasedAssessmentId, AssessmentStatus.PUBLISHED);

        const releasedAttemptId = crypto.randomUUID();
        const releasedResultId = crypto.randomUUID();

        await prisma!.$executeRawUnsafe(
          `INSERT INTO "assessment_attempts" (
            "id", "schoolId", "assessmentId", "studentId", "status", "startedAt", "deadlineAt", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, 'IN_PROGRESS'::"AttemptStatus", $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )`,
          releasedAttemptId,
          FIXTURE_SCHOOL_ID,
          releasedAssessmentId,
          FIXTURE_STUDENT3_PROFILE_ID,
          new Date(Date.now() - 3600000),
          new Date(Date.now() - 1800000),
        );

        await prisma!.$executeRawUnsafe(
          `UPDATE "assessment_attempts"
           SET "status" = 'SUBMITTED'::"AttemptStatus", "submittedAt" = $1, "updatedAt" = CURRENT_TIMESTAMP
           WHERE "id" = $2 AND "schoolId" = $3`,
          new Date(Date.now() - 1800000),
          releasedAttemptId,
          FIXTURE_SCHOOL_ID,
        );

        await prisma!.$executeRawUnsafe(
          `INSERT INTO "assessment_results" (
            "id", "schoolId", "assessmentId", "attemptId", "studentId",
            "totalQuestions", "attemptedQuestions", "correctAnswers", "incorrectAnswers",
            "score", "percentage", "isPassing", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )`,
          releasedResultId,
          FIXTURE_SCHOOL_ID,
          releasedAssessmentId,
          releasedAttemptId,
          FIXTURE_STUDENT3_PROFILE_ID,
          2,
          2,
          2,
          0,
          10.0,
          100.0,
          true,
        );

        await transitionAssessmentStatus(releasedAssessmentId, AssessmentStatus.CLOSED);
        await transitionAssessmentStatus(releasedAssessmentId, AssessmentStatus.RESULTS_RELEASED);

        // B. Setup Unreleased Assessment for 403 checks
        const { assessmentId: unreleasedAssessmentId } = await createAssessmentFixture(
          'Scenario3Unreleased',
        );
        await transitionAssessmentStatus(unreleasedAssessmentId, AssessmentStatus.PUBLISHED);

        const unreleasedAttemptId = crypto.randomUUID();
        await prisma!.$executeRawUnsafe(
          `INSERT INTO "assessment_attempts" (
            "id", "schoolId", "assessmentId", "studentId", "status", "startedAt", "deadlineAt", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, 'IN_PROGRESS'::"AttemptStatus", $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )`,
          unreleasedAttemptId,
          FIXTURE_SCHOOL_ID,
          unreleasedAssessmentId,
          FIXTURE_STUDENT3_PROFILE_ID,
          new Date(Date.now() - 1800000),
          new Date(Date.now() + 1800000),
        );

        // Baseline count checks
        const preCountRes = await prisma!.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int as count FROM "assessment_results"`,
        );
        const baselineResultCount = preCountRes[0]?.count;

        const preCountAtt = await prisma!.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int as count FROM "assessment_attempts"`,
        );
        const baselineAttemptCount = preCountAtt[0]?.count;

        const preAttempt = await getAttemptById(releasedAttemptId);

        // Verification Steps
        // 1. Student access to unreleased -> 403
        await request(server)
          .get(`/api/v1/examination/student/assessments/${unreleasedAssessmentId}/result`)
          .set('Authorization', `Bearer ${student3Token}`)
          .expect(403);

        // 2. Parent access to unreleased -> 403
        await request(server)
          .get(
            `/api/v1/examination/parent/students/${FIXTURE_STUDENT3_PROFILE_ID}/assessments/${unreleasedAssessmentId}/result`,
          )
          .set('Authorization', `Bearer ${parentToken}`)
          .expect(403);

        // 3. Student access to released -> 200
        const studentRes = await request(server)
          .get(`/api/v1/examination/student/assessments/${releasedAssessmentId}/result`)
          .set('Authorization', `Bearer ${student3Token}`)
          .expect(200);

        const studentScore = Number(studentRes.body.result?.score ?? studentRes.body.score);
        if (studentScore !== 10) {
          throw new Error(
            `Expected student result score 10, got ${studentScore} (body: ${JSON.stringify(studentRes.body)})`,
          );
        }

        // 4. Parent access to released -> 200
        const parentRes = await request(server)
          .get(
            `/api/v1/examination/parent/students/${FIXTURE_STUDENT3_PROFILE_ID}/assessments/${releasedAssessmentId}/result`,
          )
          .set('Authorization', `Bearer ${parentToken}`)
          .expect(200);

        const parentScore = Number(parentRes.body.result?.score ?? parentRes.body.score);
        if (parentScore !== 10) {
          throw new Error(
            `Expected parent result score 10, got ${parentScore} (body: ${JSON.stringify(parentRes.body)})`,
          );
        }

        // 5. Verify Strictly Read-Only Invariants in PostgreSQL
        const postCountRes = await prisma!.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int as count FROM "assessment_results"`,
        );
        const postResultCount = postCountRes[0]?.count;

        const postCountAtt = await prisma!.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int as count FROM "assessment_attempts"`,
        );
        const postAttemptCount = postCountAtt[0]?.count;

        const postAttempt = await getAttemptById(releasedAttemptId);

        if (postResultCount !== baselineResultCount) {
          throw new Error(
            `[READ-ONLY VIOLATION] Result count changed from ${baselineResultCount} to ${postResultCount}`,
          );
        }
        if (postAttemptCount !== baselineAttemptCount) {
          throw new Error(
            `[READ-ONLY VIOLATION] Attempt count changed from ${baselineAttemptCount} to ${postAttemptCount}`,
          );
        }
        if (
          new Date(preAttempt?.updatedAt).getTime() !==
          new Date(postAttempt?.updatedAt).getTime()
        ) {
          throw new Error(
            `[READ-ONLY VIOLATION] Attempt updatedAt was modified during result retrieval`,
          );
        }

        // 6. Unrelated Parent Rejection -> 403
        await request(server)
          .get(
            `/api/v1/examination/parent/students/${FIXTURE_STUDENT3_PROFILE_ID}/assessments/${releasedAssessmentId}/result`,
          )
          .set('Authorization', `Bearer ${unauthParentToken}`)
          .expect(403);
      },
    )();

    // -------------------------------------------------------------------------
    // Scenario 4: Post-Release Late Submission Rejection (Redesigned)
    // -------------------------------------------------------------------------
    await recordTest('Scenario 4: Post-Release Late Submission Rejection', async () => {
      const { assessmentId, question1Id } = await createAssessmentFixture('Scenario4');
      await transitionAssessmentStatus(assessmentId, AssessmentStatus.PUBLISHED);

      const lateAttemptId = crypto.randomUUID();
      const ansId = crypto.randomUUID();

      // Student 4 starts an attempt
      await prisma!.$executeRawUnsafe(
        `INSERT INTO "assessment_attempts" (
          "id", "schoolId", "assessmentId", "studentId", "status", "startedAt", "deadlineAt", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, 'IN_PROGRESS'::"AttemptStatus", $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`,
        lateAttemptId,
        FIXTURE_SCHOOL_ID,
        assessmentId,
        FIXTURE_STUDENT4_PROFILE_ID,
        new Date(Date.now() - 3600000),
        new Date(Date.now() + 1800000),
      );

      // Student 4 saves an answer
      await prisma!.$executeRawUnsafe(
        `INSERT INTO "attempt_answers" (
          "id", "schoolId", "assessmentId", "attemptId", "questionId", "selectedOption", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`,
        ansId,
        FIXTURE_SCHOOL_ID,
        assessmentId,
        lateAttemptId,
        question1Id,
        0,
      );

      // Transition assessment: PUBLISHED -> CLOSED
      await transitionAssessmentStatus(assessmentId, AssessmentStatus.CLOSED);

      // Step A: Attempting results release while an attempt is IN_PROGRESS must be rejected
      const earlyReleaseRes = await request(server)
        .post(`/api/v1/examination/assessments/${assessmentId}/release-results`)
        .set('Authorization', `Bearer ${adminToken}`);

      if (earlyReleaseRes.status !== 400) {
        throw new Error(
          `Expected HTTP 400 for release with active attempt, got ${earlyReleaseRes.status}: ${JSON.stringify(earlyReleaseRes.body)}`,
        );
      }

      // Step B: Submit attempt normally via application endpoint (transitions to SUBMITTED and scores)
      await request(server)
        .post(`/api/v1/examination/student/attempts/${lateAttemptId}/submit`)
        .set('Authorization', `Bearer ${student4Token}`)
        .expect(201);

      // Step C: Now with 0 active attempts, release results successfully
      await request(server)
        .post(`/api/v1/examination/assessments/${assessmentId}/release-results`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const dbAssessment = await getAssessmentById(assessmentId);
      if (dbAssessment?.status !== AssessmentStatus.RESULTS_RELEASED) {
        throw new Error(
          `Expected assessment status RESULTS_RELEASED, got '${dbAssessment?.status}'`,
        );
      }

      // Step D: Attempt late / duplicate submission against already released assessment: MUST BE REJECTED
      const lateRes = await request(server)
        .post(`/api/v1/examination/student/attempts/${lateAttemptId}/submit`)
        .set('Authorization', `Bearer ${student4Token}`);

      if (lateRes.status !== 400) {
        throw new Error(
          `Expected HTTP 400 for submission to released assessment, got ${lateRes.status}: ${JSON.stringify(lateRes.body)}`,
        );
      }

      // Assert attempt status remained SUBMITTED (not corrupted)
      const attemptAfter = await getAttemptById(lateAttemptId);
      if (attemptAfter?.status !== AttemptStatus.SUBMITTED) {
        throw new Error(
          `Attempt status was unexpectedly changed to '${attemptAfter?.status}'`,
        );
      }

      // Assert exactly 1 result exists in total for this attempt (no duplicate result created)
      const resultsCount = await prisma!.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int as count FROM "assessment_results" WHERE "attemptId" = $1`,
        lateAttemptId,
      );
      if (resultsCount[0]?.count !== 1) {
        throw new Error(
          `Expected exactly 1 result row for attempt, found ${resultsCount[0]?.count}`,
        );
      }
    })();
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP & TEARDOWN STAGE: Guaranteed in finally block
    // -------------------------------------------------------------------------
    console.log('\n[TEARDOWN] Commencing test teardown...');
    try {
      if (app) {
        await app.close();
        console.log('[TEARDOWN] NestJS application closed.');
      }
    } catch (appErr: any) {
      console.error('[TEARDOWN ERROR] Error closing NestJS app:', appErr.message || appErr);
    }

    try {
      if (prisma) {
        await prisma.$disconnect();
        console.log('[TEARDOWN] Application Prisma client disconnected.');
      }
    } catch (prismaErr: any) {
      console.error('[TEARDOWN ERROR] Error disconnecting Prisma:', prismaErr.message || prismaErr);
    }

    // Drop the disposable database via Admin connection
    try {
      await teardownDisposableDatabase(adminUrl, dbName, dbCreated);
    } catch (dropErr: any) {
      console.error('[TEARDOWN FATAL] Failed to drop disposable database:', dropErr.message || dropErr);
    }
  }

  // ---------------------------------------------------------------------------
  // Summary Reporting
  // ---------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('  TEST EXECUTION SUMMARY');
  console.log('===============================================================');
  let passCount = 0;
  for (const t of testResults) {
    console.log(`  [${t.passed ? 'PASS' : 'FAIL'}] ${t.name}`);
    if (t.passed) passCount++;
  }
  console.log(
    `\n  Total: ${testResults.length} | Passed: ${passCount} | Failed: ${testResults.length - passCount}`,
  );
  console.log('===============================================================\n');

  if (passCount !== testResults.length) {
    process.exit(1);
  }
}

// Global invocation guard: execute only when called directly as main script
if (require.main === module) {
  main().catch((err) => {
    console.error('\n[FATAL RUNNER ERROR]:', err);
    process.exit(1);
  });
}
