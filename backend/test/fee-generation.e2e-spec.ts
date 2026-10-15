import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FeeHeadCategory, FeeFrequency, ConcessionType, InvoiceStatus } from '@prisma/client';

describe('Phase 2C: Monthly Fee Generation Engine (e2e)', () => {
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

  // Tracked IDs for Phase 2C tests
  let tuitionHeadId: string;
  let labHeadId: string;
  let transportHeadId: string;
  let structureId: string;
  let studentPctId: string;
  let studentFlatId: string;
  let studentMidYearId: string;

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
    const studentA = await prisma.student.findFirst({ where: { schoolId: schoolAId, admissionNumber: 'ADM-2026-001' } });

    gradeAId = gradeA!.id;
    sessionAId = sessionA!.id;
    studentAId = studentA!.id;

    // Retrieve School B references
    const gradeB = await prisma.gradeClass.findFirst({ where: { schoolId: schoolBId } });
    const sessionB = await prisma.academicYear.findFirst({ where: { schoolId: schoolBId } });
    const studentB = await prisma.student.findFirst({ where: { schoolId: schoolBId, admissionNumber: 'ADM-2026-002' } });

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

    // Clean existing invoices, runs, allocations, items, structures, heads
    await prisma.invoiceItem.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeInvoice.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeGenerationRun.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.studentFeeAllocation.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeStructureItem.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeStructure.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeHead.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.student.deleteMany({ where: { admissionNumber: { startsWith: 'ADM-2C-' } } });

    // 1. Create Baseline Fee Heads for School A
    const headTuit = await prisma.feeHead.create({
      data: {
        schoolId: schoolAId,
        name: 'Tuition Fee',
        code: 'TUIT',
        category: FeeHeadCategory.ACADEMIC,
        description: 'Standard monthly tuition fee',
      },
    });
    tuitionHeadId = headTuit.id;

    const headLab = await prisma.feeHead.create({
      data: {
        schoolId: schoolAId,
        name: 'Annual Laboratory Fee',
        code: 'LAB',
        category: FeeHeadCategory.FACILITY,
        description: 'Annual science lab fee',
      },
    });
    labHeadId = headLab.id;

    const headTrans = await prisma.feeHead.create({
      data: {
        schoolId: schoolAId,
        name: 'Transport Bus Fee',
        code: 'TRANS',
        category: FeeHeadCategory.FACILITY,
        description: 'Optional monthly transportation service',
      },
    });
    transportHeadId = headTrans.id;

    // 2. Create Fee Structure for Grade 10 in School A via API
    const structRes = await request(app.getHttpServer())
      .post('/api/v1/fee-structures')
      .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
      .send({
        academicYearId: sessionAId,
        gradeId: gradeAId,
        name: 'Grade 10 General Fee Structure 2026-27',
        description: 'Comprehensive syllabus and facility breakdown',
        items: [
          {
            feeHeadId: tuitionHeadId,
            amount: 5000.0,
            frequency: FeeFrequency.MONTHLY,
            isOptional: false,
          },
          {
            feeHeadId: labHeadId,
            amount: 2500.0,
            frequency: FeeFrequency.ANNUAL,
            isOptional: false,
          },
          {
            feeHeadId: transportHeadId,
            amount: 1500.0,
            frequency: FeeFrequency.MONTHLY,
            isOptional: true,
          },
        ],
      });
    expect(structRes.status).toBe(201);
    structureId = structRes.body.id;

    // 3. Allocate structure to Student A (opted in for transport, no discount)
    await prisma.studentFeeAllocation.create({
      data: {
        schoolId: schoolAId,
        studentId: studentAId,
        academicYearId: sessionAId,
        feeStructureId: structureId,
        concessionType: ConcessionType.NONE,
        concessionValue: 0,
        optedFeeHeadIds: [transportHeadId],
        startBillingMonth: 1,
      },
    });

    // 4. Create Student with 10% Percentage concession
    const sectionA = await prisma.section.findFirst({ where: { schoolId: schoolAId, gradeId: gradeAId } });
    const studentPct = await prisma.student.create({
      data: {
        schoolId: schoolAId,
        admissionNumber: 'ADM-2C-PCT',
        rollNumber: '3001',
        firstName: 'Priya',
        lastName: 'Nair',
        gradeId: gradeAId,
        sectionId: sectionA!.id,
        academicYearId: sessionAId,
        guardianName: 'Sunil Nair',
        guardianEmail: 'sunil.nair@example.com',
      },
    });
    studentPctId = studentPct.id;

    await prisma.studentFeeAllocation.create({
      data: {
        schoolId: schoolAId,
        studentId: studentPctId,
        academicYearId: sessionAId,
        feeStructureId: structureId,
        concessionType: ConcessionType.PERCENTAGE,
        concessionValue: 10, // 10% discount
        optedFeeHeadIds: [], // no transport
        startBillingMonth: 1,
      },
    });

    // 5. Create Student with Flat Annual Discount of 6000 (500/month)
    const studentFlat = await prisma.student.create({
      data: {
        schoolId: schoolAId,
        admissionNumber: 'ADM-2C-FLAT',
        rollNumber: '3002',
        firstName: 'Dev',
        lastName: 'Patel',
        gradeId: gradeAId,
        sectionId: sectionA!.id,
        academicYearId: sessionAId,
        guardianName: 'Kishore Patel',
        guardianEmail: 'kishore.patel@example.com',
      },
    });
    studentFlatId = studentFlat.id;

    await prisma.studentFeeAllocation.create({
      data: {
        schoolId: schoolAId,
        studentId: studentFlatId,
        academicYearId: sessionAId,
        feeStructureId: structureId,
        concessionType: ConcessionType.FLAT_DISCOUNT,
        concessionValue: 6000, // 6000 annual discount
        optedFeeHeadIds: [],
        startBillingMonth: 1,
      },
    });

    // 6. Create Student with Mid-Year Admission in Month 4 (July)
    const studentMid = await prisma.student.create({
      data: {
        schoolId: schoolAId,
        admissionNumber: 'ADM-2C-MID',
        rollNumber: '3003',
        firstName: 'Kavya',
        lastName: 'Reddy',
        gradeId: gradeAId,
        sectionId: sectionA!.id,
        academicYearId: sessionAId,
        admissionDate: new Date('2026-07-01T00:00:00.000Z'),
        guardianName: 'Suresh Reddy',
        guardianEmail: 'suresh.reddy@example.com',
      },
    });
    studentMidYearId = studentMid.id;

    await prisma.studentFeeAllocation.create({
      data: {
        schoolId: schoolAId,
        studentId: studentMidYearId,
        academicYearId: sessionAId,
        feeStructureId: structureId,
        concessionType: ConcessionType.NONE,
        concessionValue: 0,
        optedFeeHeadIds: [],
        startBillingMonth: 4, // Starts in July (Month 4)
      },
    });
  });

  afterAll(async () => {
    // Cleanup created test records
    await prisma.invoiceItem.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeInvoice.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeGenerationRun.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.studentFeeAllocation.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeStructureItem.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeStructure.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.feeHead.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.student.deleteMany({ where: { admissionNumber: { startsWith: 'ADM-2C-' } } });

    if (app) {
      await app.close();
    }
  });

  describe('1. Fee Generation Preview (Dry-Run)', () => {
    it('previews prospective invoice generation without writing to database', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fee-generation/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          gradeId: gradeAId,
        });

      expect(res.status).toBe(201); // Standard POST status
      expect(res.body.academicYearId).toBe(sessionAId);
      expect(res.body.totalEligibleAllocations).toBe(4);
      expect(res.body.totalStudents).toBe(4);
      // Student A: 12 months (startMonth 1)
      // Student PCT: 12 months (startMonth 1)
      // Student FLAT: 12 months (startMonth 1)
      // Student MID: 9 months (startMonth 4 to 12)
      // Total planned = 12 + 12 + 12 + 9 = 45 invoices
      expect(res.body.totalPlannedInvoices).toBe(45);
      expect(res.body.newInvoicesToCreate).toBe(45);
      expect(res.body.existingInvoicesToSkip).toBe(0);
      expect(res.body.projectedGrossTotal).toBeGreaterThan(0);
      expect(res.body.projectedNetTotal).toBeGreaterThan(0);

      // Verify ZERO invoices have been written to database
      const dbInvoices = await prisma.feeInvoice.count({
        where: { schoolId: schoolAId },
      });
      expect(dbInvoices).toBe(0);
    });

    it('rejects preview with invalid academic year', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fee-generation/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: '99999999-9999-4999-a999-999999999999',
        });

      expect(res.status).toBe(404);
    });

    it('rejects preview request by student or parent', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fee-generation/preview')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .send({
          academicYearId: sessionAId,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('2. Execute Fee Generation & Idempotency', () => {
    it('executes generation for School A Grade 10 and writes invoices and audit run', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fee-generation/execute')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          gradeId: gradeAId,
        });

      expect(res.status).toBe(201);
      expect(res.body.totalStudents).toBe(4);
      expect(res.body.totalInvoicesCreated).toBe(45);
      expect(res.body.totalInvoicesSkipped).toBe(0);
      expect(res.body.totalInvoicesFailed).toBe(0);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.runId).toBeDefined();

      // Verify audit run in DB
      const runRecord = await prisma.feeGenerationRun.findUnique({
        where: { id: res.body.runId },
      });
      expect(runRecord).toBeDefined();
      expect(runRecord?.totalInvoicesCreated).toBe(45);
      expect(runRecord?.schoolId).toBe(schoolAId);

      // Verify exactly 45 invoices in DB for School A
      const count = await prisma.feeInvoice.count({
        where: { schoolId: schoolAId, academicYearId: sessionAId },
      });
      expect(count).toBe(45);
    });

    it('enforces idempotency on re-run (skips existing invoices, creates zero duplicates)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fee-generation/execute')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          gradeId: gradeAId,
        });

      expect(res.status).toBe(201);
      expect(res.body.totalInvoicesCreated).toBe(0);
      expect(res.body.totalInvoicesSkipped).toBe(45);
      expect(res.body.totalInvoicesFailed).toBe(0);

      // Total count remains exactly 45
      const count = await prisma.feeInvoice.count({
        where: { schoolId: schoolAId, academicYearId: sessionAId },
      });
      expect(count).toBe(45);
    });

    it('allows FEE_STAFF to preview and view generation runs, but forbids FEE_STAFF from executing', async () => {
      const execRes = await request(app.getHttpServer())
        .post('/api/v1/fee-generation/execute')
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .send({
          academicYearId: sessionAId,
        });
      expect(execRes.status).toBe(403);

      const runsRes = await request(app.getHttpServer())
        .get('/api/v1/fee-generation/runs')
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`);
      expect(runsRes.status).toBe(200);
      expect(Array.isArray(runsRes.body)).toBe(true);
      expect(runsRes.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('3. Financial & Concession Verification', () => {
    it('verifies Student A full 12-month schedule with Tuition, Lab (Annual), and Transport (Optional)', async () => {
      const invoices = await prisma.feeInvoice.findMany({
        where: {
          schoolId: schoolAId,
          studentId: studentAId,
          academicYearId: sessionAId,
        },
        include: {
          items: true,
        },
        orderBy: { billingMonth: 'asc' },
      });

      expect(invoices.length).toBe(12);

      // Month 1 (April): Tuition (5000) + Lab (2500, Annual) + Transport (1500) = 9000
      const month1 = invoices.find((inv) => inv.billingMonth === 1);
      expect(month1).toBeDefined();
      expect(Number(month1!.grossAmount)).toBe(9000);
      expect(Number(month1!.discountAmount)).toBe(0);
      expect(Number(month1!.netAmount)).toBe(9000);
      expect(month1!.items.length).toBe(3);

      const labItem = month1!.items.find((it) => it.feeHeadId === labHeadId);
      expect(labItem).toBeDefined();
      expect(Number(labItem!.grossAmount)).toBe(2500);
      expect(labItem!.billingFrequencySnapshot).toBe(FeeFrequency.ANNUAL);

      // Months 2-12: Tuition (5000) + Transport (1500) = 6500 each. NO Lab fee!
      for (let m = 2; m <= 12; m++) {
        const inv = invoices.find((i) => i.billingMonth === m);
        expect(inv).toBeDefined();
        expect(Number(inv!.grossAmount)).toBe(6500);
        expect(Number(inv!.discountAmount)).toBe(0);
        expect(Number(inv!.netAmount)).toBe(6500);
        expect(inv!.items.length).toBe(2);
        const hasLab = inv!.items.some((it) => it.feeHeadId === labHeadId);
        expect(hasLab).toBe(false);
      }
    });

    it('verifies 10% PERCENTAGE concession applied accurately across all items', async () => {
      const invoices = await prisma.feeInvoice.findMany({
        where: {
          schoolId: schoolAId,
          studentId: studentPctId,
          academicYearId: sessionAId,
        },
        include: { items: true },
        orderBy: { billingMonth: 'asc' },
      });

      expect(invoices.length).toBe(12);

      // Month 1: Tuition (5000, 10% disc = 500) + Lab (2500, 10% disc = 250) = Gross 7500, Disc 750, Net 6750
      const m1 = invoices.find((i) => i.billingMonth === 1)!;
      expect(Number(m1.grossAmount)).toBe(7500);
      expect(Number(m1.discountAmount)).toBe(750);
      expect(Number(m1.netAmount)).toBe(6750);

      // Months 2-12: Tuition (5000, 10% disc = 500) = Gross 5000, Disc 500, Net 4500
      for (let m = 2; m <= 12; m++) {
        const inv = invoices.find((i) => i.billingMonth === m)!;
        expect(Number(inv.grossAmount)).toBe(5000);
        expect(Number(inv.discountAmount)).toBe(500);
        expect(Number(inv.netAmount)).toBe(4500);
      }
    });

    it('verifies FLAT_DISCOUNT concession distribution and rounding reconciliation', async () => {
      const invoices = await prisma.feeInvoice.findMany({
        where: {
          schoolId: schoolAId,
          studentId: studentFlatId,
          academicYearId: sessionAId,
        },
        orderBy: { billingMonth: 'asc' },
      });

      expect(invoices.length).toBe(12);

      // 6000 flat discount across 12 months = 500.00 / month
      let totalDiscountAccumulated = 0;
      for (const inv of invoices) {
        expect(Number(inv.discountAmount)).toBe(500);
        expect(Number(inv.netAmount)).toBe(Number(inv.grossAmount) - 500);
        totalDiscountAccumulated += Number(inv.discountAmount);
      }
      expect(totalDiscountAccumulated).toBe(6000);
    });

    it('verifies mid-year admission (Month 4 / July enrollment) generates 9 invoices and bills annual fee in month 4', async () => {
      const invoices = await prisma.feeInvoice.findMany({
        where: {
          schoolId: schoolAId,
          studentId: studentMidYearId,
          academicYearId: sessionAId,
        },
        include: { items: true },
        orderBy: { billingMonth: 'asc' },
      });

      expect(invoices.length).toBe(9);

      // Invoices exist for months 4 through 12
      const months = invoices.map((i) => i.billingMonth);
      expect(months).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);

      // Month 4 is the enrollment month, so Annual Lab fee appears in Month 4!
      const m4 = invoices.find((i) => i.billingMonth === 4)!;
      expect(Number(m4.grossAmount)).toBe(7500); // 5000 tuition + 2500 lab
      expect(m4.items.length).toBe(2);
      const labItem = m4.items.find((it) => it.feeHeadId === labHeadId);
      expect(labItem).toBeDefined();

      // Months 5-12 have only monthly tuition (5000)
      for (let m = 5; m <= 12; m++) {
        const inv = invoices.find((i) => i.billingMonth === m)!;
        expect(Number(inv.grossAmount)).toBe(5000);
        expect(inv.items.length).toBe(1);
      }
    });

    it('confirms snapshot immutability: changing fee structure does not alter existing invoices', async () => {
      // Alter original fee structure item amount
      const tuitItem = await prisma.feeStructureItem.findFirst({
        where: { schoolId: schoolAId, feeStructureId: structureId, feeHeadId: tuitionHeadId },
      });
      await prisma.feeStructureItem.update({
        where: { id: tuitItem!.id },
        data: { amount: 9999.0 },
      });

      // Fetch Student A Month 1 invoice from DB
      const m1 = await prisma.feeInvoice.findFirst({
        where: { schoolId: schoolAId, studentId: studentAId, billingMonth: 1 },
        include: { items: true },
      });

      // Must remain original 9000, and tuition item remains 5000
      expect(Number(m1!.grossAmount)).toBe(9000);
      const snapItem = m1!.items.find((i) => i.feeHeadId === tuitionHeadId);
      expect(Number(snapItem!.grossAmount)).toBe(5000);

      // Restore original amount
      await prisma.feeStructureItem.update({
        where: { id: tuitItem!.id },
        data: { amount: 5000.0 },
      });
    });
  });

  describe('4. Student Fee Statement API & Tenant/Role Isolation', () => {
    it('allows SCHOOL_ADMIN to retrieve Student A fee statement with dynamic status derivation', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentAId}/fee-statement?academicYearId=${sessionAId}`)
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.student.id).toBe(studentAId);
      expect(res.body.student.admissionNumber).toBe('ADM-2026-001');
      expect(res.body.academicYear.id).toBe(sessionAId);
      expect(res.body.allocation).toBeDefined();
      expect(res.body.summary.invoiceCount).toBe(12);
      expect(res.body.summary.totalGrossAmount).toBe(80500);
      expect(res.body.summary.statusBreakdown).toBeDefined();

      expect(Array.isArray(res.body.invoices)).toBe(true);
      expect(res.body.invoices.length).toBe(12);

      const inv1 = res.body.invoices[0];
      expect(inv1.billingMonth).toBe(1);
      expect(inv1.monthName).toBe('April');
      expect(inv1.status).toBeDefined();
      expect(inv1.items.length).toBe(3);
    });

    it('allows student user Aarav Sharma to view his own fee statement', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentAId}/fee-statement`)
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`);

      expect(res.status).toBe(200);
      expect(res.body.student.id).toBe(studentAId);
      expect(res.body.student.admissionNumber).toBe('ADM-2026-001');
    });

    it('forbids student user from accessing another student fee statement (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentPctId}/fee-statement`)
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('prevents School B admin from viewing School A student fee statement (cross-tenant isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentAId}/fee-statement`)
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`);

      expect(res.status).toBe(404);
    });

    it('prevents School B admin from executing fee generation for School A academic year', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fee-generation/execute')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .send({
          academicYearId: sessionAId,
        });

      expect(res.status).toBe(404);
    });
  });
});
