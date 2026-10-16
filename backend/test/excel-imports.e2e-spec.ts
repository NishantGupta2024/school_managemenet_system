import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as ExcelJS from 'exceljs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConcessionType, FeeFrequency, FeeHeadCategory, UserRole } from '@prisma/client';

describe('Phase 2D-A: Excel Import Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const schoolAId = '00000000-0000-0000-0000-000000000001';
  const schoolBId = '00000000-0000-0000-0000-000000000002';

  let tokenSchoolAAdmin: string;
  let tokenSchoolBAdmin: string;
  let tokenSchoolAStaff: string;
  let tokenSchoolAStudent: string;
  let tokenSchoolAParent: string;
  let tokenPlatformAdmin: string;

  let gradeAId: string;
  let gradeACode: string;
  let gradeAName: string;
  let sessionAId: string;

  let gradeBId: string;
  let sessionBId: string;

  let feeHeadAId: string;
  let feeStructureAId: string;
  let feeStructureAName: string;

  // Helper to build test Excel buffers
  async function createWorkbookBuffer(sheetName: string, headers: string[], rows: any[][]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);
    ws.addRow(headers);
    for (const row of rows) {
      ws.addRow(row);
    }
    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

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
    gradeAId = gradeA!.id;
    gradeACode = gradeA!.code;
    gradeAName = gradeA!.name;
    sessionAId = sessionA!.id;

    // Retrieve School B references
    const gradeB = await prisma.gradeClass.findFirst({ where: { schoolId: schoolBId } });
    const sessionB = await prisma.academicYear.findFirst({ where: { schoolId: schoolBId } });
    gradeBId = gradeB!.id;
    sessionBId = sessionB!.id;

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

    const studentUser = await prisma.user.findFirst({ where: { email: 'student@greenwood.edu' } });

    // Create or find a parent user for authorization checks
    let parentUser = await prisma.user.findFirst({
      where: { schoolId: schoolAId, email: 'parent-import-test@greenwood.edu' },
    });
    if (!parentUser) {
      parentUser = await prisma.user.create({
        data: {
          schoolId: schoolAId,
          email: 'parent-import-test@greenwood.edu',
          passwordHash: studentUser!.passwordHash,
          name: 'Parent Test User',
          role: UserRole.PARENT,
        },
      });
    } else {
      await prisma.user.update({
        where: { id: parentUser.id },
        data: { passwordHash: studentUser!.passwordHash },
      });
    }
    const loginParent = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'parent-import-test@greenwood.edu', password: 'Password123!' });
    tokenSchoolAParent = loginParent.body.accessToken;

    // Create test FeeHead and FeeStructure for allocation imports in School A
    let feeHead = await prisma.feeHead.findFirst({
      where: { schoolId: schoolAId, code: 'TUITION-IMPORT' },
    });
    if (!feeHead) {
      feeHead = await prisma.feeHead.create({
        data: {
          schoolId: schoolAId,
          name: 'Import Test Tuition',
          code: 'TUITION-IMPORT',
          category: FeeHeadCategory.ACADEMIC,
          isOptional: false,
          status: 'ACTIVE',
        },
      });
    }
    feeHeadAId = feeHead.id;

    feeStructureAName = `Import Grade ${gradeACode} Standard`;
    let structure = await prisma.feeStructure.findFirst({
      where: { schoolId: schoolAId, name: feeStructureAName },
    });
    if (!structure) {
      structure = await prisma.feeStructure.create({
        data: {
          schoolId: schoolAId,
          academicYearId: sessionAId,
          gradeId: gradeAId,
          name: feeStructureAName,
          status: 'ACTIVE',
        },
      });

      await prisma.feeStructureItem.create({
        data: {
          schoolId: schoolAId,
          feeStructureId: structure.id,
          feeHeadId: feeHeadAId,
          amount: 3000,
          frequency: FeeFrequency.MONTHLY,
          isOptional: false,
        },
      });
    }
    feeStructureAId = structure.id;

    // Clean up any test-created students or allocations
    await prisma.studentFeeAllocation.deleteMany({
      where: {
        student: { admissionNumber: { startsWith: 'ADM-IMP-' } },
      },
    });
    await prisma.student.deleteMany({
      where: { admissionNumber: { startsWith: 'ADM-IMP-' } },
    });
  });

  afterAll(async () => {
    // Clean up test records
    await prisma.studentFeeAllocation.deleteMany({
      where: {
        student: { admissionNumber: { startsWith: 'ADM-IMP-' } },
      },
    });
    await prisma.student.deleteMany({
      where: { admissionNumber: { startsWith: 'ADM-IMP-' } },
    });
    await prisma.feeStructureItem.deleteMany({
      where: { feeStructureId: feeStructureAId },
    });
    await prisma.feeStructure.deleteMany({
      where: { id: feeStructureAId },
    });
    await prisma.feeHead.deleteMany({
      where: { id: feeHeadAId },
    });
    await prisma.user.deleteMany({
      where: { email: 'parent-import-test@greenwood.edu' },
    });

    if (app) {
      await app.close();
    }
  });

  describe('1. Template Generation', () => {
    it('downloads student master template as .xlsx with sample rows', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/excel-imports/template?type=STUDENT_MASTER')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .responseType('blob')
        .expect(200);

      expect(res.headers['content-type']).toContain('openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('template_student_master.xlsx');

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body);
      const ws = wb.getWorksheet('Students');
      expect(ws).toBeDefined();

      const headerRow = ws!.getRow(1);
      expect(headerRow.getCell(1).value).toContain('Admission Number');
      expect(headerRow.getCell(2).value).toContain('First Name');
      expect(headerRow.getCell(3).value).toContain('Last Name');
      expect(headerRow.getCell(4).value).toContain('Grade Code');
      expect(headerRow.getCell(7).value).toContain('Date of Birth');

      // Verify sample rows exist
      expect(ws!.rowCount).toBeGreaterThanOrEqual(2);
    });

    it('downloads fee allocation template as .xlsx with sample rows', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/excel-imports/template?type=FEE_ALLOCATION')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .responseType('blob')
        .expect(200);

      expect(res.headers['content-type']).toContain('openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('template_fee_allocation.xlsx');

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body);
      const ws = wb.getWorksheet('Fee Allocations');
      expect(ws).toBeDefined();

      const headerRow = ws!.getRow(1);
      expect(headerRow.getCell(1).value).toContain('Admission Number');
      expect(headerRow.getCell(2).value).toContain('Fee Structure Name');
      expect(headerRow.getCell(3).value).toContain('Concession Type');
      expect(headerRow.getCell(4).value).toContain('Concession Value');
      expect(headerRow.getCell(6).value).toContain('Start Billing Month');
    });

    it('rejects invalid import type with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/excel-imports/template?type=UNKNOWN_TYPE')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);

      expect(res.body.message).toContain('Valid type query parameter is required');
    });
  });

  describe('2. Role-Based Access Control (RBAC)', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/excel-imports/template?type=STUDENT_MASTER')
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/v1/excel-imports/preview')
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/v1/excel-imports/confirm')
        .expect(401);
    });

    it('rejects STUDENT role with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/excel-imports/template?type=STUDENT_MASTER')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/excel-imports/preview')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/excel-imports/confirm')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .send({ importType: 'STUDENT_MASTER', academicYearId: sessionAId, rows: [] })
        .expect(403);
    });

    it('rejects PARENT role with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/excel-imports/template?type=STUDENT_MASTER')
        .set('Authorization', `Bearer ${tokenSchoolAParent}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/excel-imports/preview')
        .set('Authorization', `Bearer ${tokenSchoolAParent}`)
        .expect(403);
    });

    it('allows FEE_STAFF and PLATFORM_SUPER_ADMIN access', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/excel-imports/template?type=STUDENT_MASTER')
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/excel-imports/template?type=STUDENT_MASTER')
        .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
        .set('x-school-id', schoolAId)
        .expect(200);
    });
  });

  describe('3. File Validation & Upload Filtering', () => {
    it('rejects requests without a file attachment with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/excel-imports/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .field('type', 'STUDENT_MASTER')
        .field('academicYearId', sessionAId)
        .expect(400);

      expect(res.body.message).toContain('file');
    });

    it('rejects non-.xlsx files (e.g. .txt or .csv) with 400 Bad Request', async () => {
      const txtBuffer = Buffer.from('hello world, this is a plain text file');
      const res = await request(app.getHttpServer())
        .post('/api/v1/excel-imports/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .attach('file', txtBuffer, 'data.txt')
        .field('type', 'STUDENT_MASTER')
        .field('academicYearId', sessionAId)
        .expect(400);

      expect(res.body.message).toMatch(/xlsx/i);
    });

    it('rejects missing or invalid academic year session with 404 Not Found', async () => {
      const validBuffer = await createWorkbookBuffer(
        'Sheet1',
        ['Admission Number', 'First Name', 'Grade Code'],
        [['ADM-IMP-001', 'Test', gradeACode]],
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/excel-imports/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .attach('file', validBuffer, 'data.xlsx')
        .field('type', 'STUDENT_MASTER')
        .field('academicYearId', 'a0000000-0000-4000-a000-000000000000')
        .expect(404);

      expect(res.body.message).toContain('Academic session');
    });

    it('rejects spreadsheet with no data rows with 400 Bad Request', async () => {
      const emptyBuffer = await createWorkbookBuffer('Sheet1', ['Admission Number', 'First Name'], []);

      const res = await request(app.getHttpServer())
        .post('/api/v1/excel-imports/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .attach('file', emptyBuffer, 'empty.xlsx')
        .field('type', 'STUDENT_MASTER')
        .field('academicYearId', sessionAId)
        .expect(400);

      expect(res.body.message).toContain('contains no data rows');
    });
  });

  describe('4. Student Master Preview & Validation', () => {
    it('categorizes rows into valid, invalid, in-file duplicates, and db duplicates', async () => {
      const headers = [
        'Admission Number',
        'First Name',
        'Last Name',
        'Grade Code',
        'Section Name',
        'Roll Number',
        'Date of Birth',
        'Gender',
        'Guardian Name',
        'Guardian Phone',
        'Guardian Email',
      ];

      const rows = [
        // 1. Valid Row
        ['ADM-IMP-101', 'Aman', 'Verma', gradeACode, 'A', '10', '2010-06-15', 'Male', 'Mr. Verma', '9876543210', 'verma@test.com'],
        // 2. Missing required fields (First Name missing)
        ['ADM-IMP-102', '', 'Singh', gradeACode, 'A', '11', '2010-06-15', 'Male', 'Mr. Singh', '', ''],
        // 3. Invalid Grade Code
        ['ADM-IMP-103', 'Priya', 'Sharma', 'GRADE-NONEXISTENT', 'A', '12', '2010-06-15', 'Female', '', '', ''],
        // 4. Invalid Date of Birth format
        ['ADM-IMP-104', 'Karan', 'Mehta', gradeACode, 'A', '13', 'not-a-valid-date', 'Male', '', '', ''],
        // 5. In-file duplicate admission number (first occurrence is ADM-IMP-105)
        ['ADM-IMP-105', 'Sneha', 'Patel', gradeACode, 'A', '14', '2010-06-15', 'Female', '', '', ''],
        // 6. Duplicate of row 5
        ['ADM-IMP-105', 'Sneha Duplicate', 'Patel', gradeACode, 'A', '15', '2010-06-15', 'Female', '', '', ''],
        // 7. Database duplicate (ADM-2026-001 already exists in School A seed)
        ['ADM-2026-001', 'Existing', 'Student', gradeACode, 'A', '16', '2010-06-15', 'Male', '', '', ''],
      ];

      const buffer = await createWorkbookBuffer('Students', headers, rows);

      const res = await request(app.getHttpServer())
        .post('/api/v1/excel-imports/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .attach('file', buffer, 'students.xlsx')
        .field('type', 'STUDENT_MASTER')
        .field('academicYearId', sessionAId)
        .expect(201);

      const preview = res.body;
      expect(preview.importType).toBe('STUDENT_MASTER');
      expect(preview.totalRows).toBe(7);

      // Valid: row 1 (ADM-IMP-101) and row 5 (ADM-IMP-105 first instance)
      expect(preview.validCount).toBe(2);
      expect(preview.validRows.map((r: any) => r.admissionNumber)).toEqual(['ADM-IMP-101', 'ADM-IMP-105']);

      // Invalid: row 2 (missing first name), row 3 (nonexistent grade), row 4 (invalid DOB)
      expect(preview.invalidCount).toBe(3);
      const invalidRowNumbers = preview.invalidRows.map((r: any) => r.rowNumber);
      expect(invalidRowNumbers).toContain(3); // row 2 (header is row 1)
      expect(invalidRowNumbers).toContain(4); // row 3
      expect(invalidRowNumbers).toContain(5); // row 4

      // Duplicates: row 6 (in-file duplicate of ADM-IMP-105) and row 7 (db duplicate ADM-2026-001)
      expect(preview.duplicateCount).toBe(2);
      const duplicateAdmissions = preview.duplicateRows.map((r: any) => r.admissionNumber);
      expect(duplicateAdmissions).toContain('ADM-IMP-105');
      expect(duplicateAdmissions).toContain('ADM-2026-001');

      const inFileDup = preview.duplicateRows.find((r: any) => r.admissionNumber === 'ADM-IMP-105');
      expect(inFileDup.reason).toContain('Duplicate admission number');

      const inDbDup = preview.duplicateRows.find((r: any) => r.admissionNumber === 'ADM-2026-001');
      expect(inDbDup.reason).toContain('already exists in this school');
    });
  });

  describe('5. Student Master Confirmation & Execution', () => {
    it('atomically creates valid student records in active school tenant', async () => {
      const headers = ['Admission Number', 'First Name', 'Last Name', 'Grade Code', 'Section Name', 'Roll Number'];
      const rows = [
        ['ADM-IMP-201', 'Rahul', 'Dravid', gradeACode, 'A', '101'],
        ['ADM-IMP-202', 'Sourav', 'Ganguly', gradeACode, 'A', '102'],
      ];

      const buffer = await createWorkbookBuffer('Students', headers, rows);

      // 1. Preview
      const previewRes = await request(app.getHttpServer())
        .post('/api/v1/excel-imports/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .attach('file', buffer, 'students.xlsx')
        .field('type', 'STUDENT_MASTER')
        .field('academicYearId', sessionAId)
        .expect(201);

      expect(previewRes.body.validCount).toBe(2);

      // 2. Confirm
      const confirmRes = await request(app.getHttpServer())
        .post('/api/v1/excel-imports/confirm')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          importType: 'STUDENT_MASTER',
          academicYearId: sessionAId,
          rows: previewRes.body.validRows,
        })
        .expect(201);

      expect(confirmRes.body.insertedCount).toBe(2);
      expect(confirmRes.body.skippedCount).toBe(0);
      expect(confirmRes.body.failedCount).toBe(0);

      // 3. Database verification
      const student1 = await prisma.student.findFirst({
        where: { schoolId: schoolAId, admissionNumber: 'ADM-IMP-201' },
      });
      expect(student1).toBeDefined();
      expect(student1!.firstName).toBe('Rahul');
      expect(student1!.lastName).toBe('Dravid');
      expect(student1!.gradeId).toBe(gradeAId);

      const student2 = await prisma.student.findFirst({
        where: { schoolId: schoolAId, admissionNumber: 'ADM-IMP-202', rollNumber: '102' },
      });
      expect(student2).toBeDefined();

      // 4. Verify tenant isolation: Students do NOT exist in School B
      const studentInB = await prisma.student.findFirst({
        where: { schoolId: schoolBId, admissionNumber: 'ADM-IMP-201' },
      });
      expect(studentInB).toBeNull();
    });

    it('safely handles re-confirmation (idempotency) and skips existing records without crashing', async () => {
      // Attempting to re-import ADM-IMP-201 which was just inserted
      const rows = [
        {
          rowNumber: 2,
          admissionNumber: 'ADM-IMP-201',
          firstName: 'Rahul',
          lastName: 'Dravid',
          gradeCode: gradeACode,
        },
      ];

      const confirmRes = await request(app.getHttpServer())
        .post('/api/v1/excel-imports/confirm')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          importType: 'STUDENT_MASTER',
          academicYearId: sessionAId,
          rows,
        })
        .expect(201);

      // Should be recognized as existing and skipped
      expect(confirmRes.body.insertedCount).toBe(0);
      expect(confirmRes.body.skippedCount).toBe(1);
      expect(confirmRes.body.failedCount).toBe(0);
    });
  });

  describe('6. Fee Allocation Preview & Validation', () => {
    it('categorizes fee allocation rows (valid, invalid student, invalid structure, grade mismatch, duplicate)', async () => {
      const headers = [
        'Admission Number',
        'Fee Structure Name',
        'Concession Type',
        'Concession Value',
        'Concession Reason',
        'Start Billing Month',
      ];

      // First create a structure in Grade B to test grade mismatch
      let structB = await prisma.feeStructure.findFirst({
        where: { schoolId: schoolAId, name: 'Import Grade Mismatch Structure' },
      });
      if (!structB) {
        // Let's create a structure pointing to another grade in school A if another grade exists
        const otherGrade = await prisma.gradeClass.findFirst({
          where: { schoolId: schoolAId, id: { not: gradeAId } },
        });
        if (otherGrade) {
          structB = await prisma.feeStructure.create({
            data: {
              schoolId: schoolAId,
              academicYearId: sessionAId,
              gradeId: otherGrade.id,
              name: 'Import Grade Mismatch Structure',
              status: 'ACTIVE',
            },
          });
        }
      }

      const rows = [
        // 1. Valid allocation for ADM-IMP-201 with 15% concession starting in Month 1
        ['ADM-IMP-201', feeStructureAName, 'PERCENTAGE', '15', 'Merit Scholarship', '1'],
        // 2. Nonexistent student admission number
        ['ADM-IMP-999', feeStructureAName, 'NONE', '0', '', '1'],
        // 3. Nonexistent fee structure name
        ['ADM-IMP-202', 'Totally Fake Fee Structure', 'NONE', '0', '', '1'],
        // 4. Invalid Concession: PERCENTAGE greater than 100%
        ['ADM-IMP-202', feeStructureAName, 'PERCENTAGE', '150', 'Over 100%', '1'],
        // 5. In-file duplicate for student ADM-IMP-201
        ['ADM-IMP-201', feeStructureAName, 'FLAT_DISCOUNT', '500', 'Duplicate attempt', '1'],
      ];

      if (structB) {
        // Add Grade Mismatch row
        rows.push(['ADM-IMP-202', structB.name, 'NONE', '0', '', '1']);
      }

      const buffer = await createWorkbookBuffer('FeeAllocations', headers, rows);

      const res = await request(app.getHttpServer())
        .post('/api/v1/excel-imports/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .attach('file', buffer, 'allocations.xlsx')
        .field('type', 'FEE_ALLOCATION')
        .field('academicYearId', sessionAId)
        .expect(201);

      const preview = res.body;
      expect(preview.importType).toBe('FEE_ALLOCATION');

      // Valid: row 1 (ADM-IMP-201)
      expect(preview.validCount).toBe(1);
      expect(preview.validRows[0].admissionNumber).toBe('ADM-IMP-201');
      expect(preview.validRows[0].concessionType).toBe('PERCENTAGE');
      expect(preview.validRows[0].concessionValue).toBe(15);

      // In-file duplicate: row 5
      expect(preview.duplicateCount).toBe(1);
      expect(preview.duplicateRows[0].admissionNumber).toBe('ADM-IMP-201');
      expect(preview.duplicateRows[0].reason).toContain('Duplicate allocation for student');

      // Invalid rows: nonexistent student, nonexistent structure, percentage > 100%, and optional grade mismatch
      expect(preview.invalidCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('7. Fee Allocation Confirmation & Execution', () => {
    it('atomically creates student fee allocation in database with exact concession values', async () => {
      const rows = [
        {
          rowNumber: 2,
          admissionNumber: 'ADM-IMP-201',
          feeStructureName: feeStructureAName,
          concessionType: 'PERCENTAGE',
          concessionValue: 15,
          concessionReason: 'Merit Scholarship',
          startBillingMonth: 1,
        },
      ];

      const confirmRes = await request(app.getHttpServer())
        .post('/api/v1/excel-imports/confirm')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          importType: 'FEE_ALLOCATION',
          academicYearId: sessionAId,
          rows,
        })
        .expect(201);

      expect(confirmRes.body.insertedCount).toBe(1);
      expect(confirmRes.body.skippedCount).toBe(0);
      expect(confirmRes.body.failedCount).toBe(0);

      // Verify in PostgreSQL
      const student = await prisma.student.findFirst({
        where: { schoolId: schoolAId, admissionNumber: 'ADM-IMP-201' },
      });
      const allocation = await prisma.studentFeeAllocation.findFirst({
        where: {
          schoolId: schoolAId,
          studentId: student!.id,
          academicYearId: sessionAId,
        },
      });

      expect(allocation).toBeDefined();
      expect(allocation!.feeStructureId).toBe(feeStructureAId);
      expect(allocation!.concessionType).toBe(ConcessionType.PERCENTAGE);
      expect(allocation!.concessionValue.toString()).toBe('15');
      expect(allocation!.concessionReason).toBe('Merit Scholarship');
      expect(allocation!.startBillingMonth).toBe(1);
      expect(allocation!.status).toBe('ACTIVE');
    });

    it('detects existing allocation as duplicate in preview and skips on confirm', async () => {
      // ADM-IMP-201 now has an allocation in sessionAId
      const headers = ['Admission Number', 'Fee Structure Name', 'Concession Type', 'Concession Value'];
      const rows = [['ADM-IMP-201', feeStructureAName, 'NONE', '0']];
      const buffer = await createWorkbookBuffer('FeeAllocations', headers, rows);

      const previewRes = await request(app.getHttpServer())
        .post('/api/v1/excel-imports/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .attach('file', buffer, 'allocations.xlsx')
        .field('type', 'FEE_ALLOCATION')
        .field('academicYearId', sessionAId)
        .expect(201);

      expect(previewRes.body.duplicateCount).toBe(1);
      expect(previewRes.body.duplicateRows[0].reason).toContain('already has an active fee allocation');
    });
  });

  describe('8. Zero Invoice Side-Effects Guarantee', () => {
    it('verifies that importing students and allocations never generates invoices automatically', async () => {
      const student = await prisma.student.findFirst({
        where: { schoolId: schoolAId, admissionNumber: 'ADM-IMP-201' },
      });

      const invoices = await prisma.feeInvoice.findMany({
        where: {
          schoolId: schoolAId,
          studentId: student!.id,
        },
      });

      // Excel import must NOT auto-generate invoices as a side effect
      expect(invoices.length).toBe(0);
    });
  });

  describe('9. Cross-Tenant Isolation Enforcement', () => {
    it('prevents School B user from importing or seeing School A data', async () => {
      // School B admin attempts to preview an allocation for a student that exists in School A (ADM-IMP-201)
      const headers = ['Admission Number', 'Fee Structure Name'];
      const rows = [['ADM-IMP-201', feeStructureAName]];
      const buffer = await createWorkbookBuffer('FeeAllocations', headers, rows);

      const previewRes = await request(app.getHttpServer())
        .post('/api/v1/excel-imports/preview')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .attach('file', buffer, 'allocations.xlsx')
        .field('type', 'FEE_ALLOCATION')
        .field('academicYearId', sessionBId)
        .expect(201);

      // Student ADM-IMP-201 does not exist in School B, so must be marked INVALID
      expect(previewRes.body.validCount).toBe(0);
      expect(previewRes.body.invalidCount).toBe(1);
      expect(previewRes.body.invalidRows[0].errors[0]).toContain("Student with admission number 'ADM-IMP-201' not found");
    });
  });
});
