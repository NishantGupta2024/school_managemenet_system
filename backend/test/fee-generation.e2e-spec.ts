import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FeeHeadCategory, FeeFrequency, ConcessionType, InvoiceStatus, UserRole } from '@prisma/client';
import { FeeGenerationService } from '../src/fee-generation/fee-generation.service';

describe('Phase 2C: Monthly Fee Generation Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let feeGenerationService: FeeGenerationService;

  const schoolAId = '00000000-0000-0000-0000-000000000001';
  const schoolBId = '00000000-0000-0000-0000-000000000002';

  let tokenSchoolAAdmin: string;
  let tokenSchoolBAdmin: string;
  let tokenSchoolAStaff: string;
  let tokenSchoolAStudent: string;
  let tokenSchoolAParent: string;
  let tokenSchoolAUnlinkedParent: string;
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

    feeGenerationService = app.get<FeeGenerationService>(FeeGenerationService);

    const loginAStudent = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'student@greenwood.edu', password: 'Password123!' });
    tokenSchoolAStudent = loginAStudent.body.accessToken;

    const studentUser = await prisma.user.findFirst({ where: { email: 'student@greenwood.edu' } });
    if (studentUser) {
      await prisma.student.update({
        where: { id: studentAId },
        data: { userId: studentUser.id },
      });
    }

    // Seed verified parent user and relationship
    let parentUser = await prisma.user.findFirst({
      where: { schoolId: schoolAId, email: 'parent@greenwood.edu' },
    });
    if (!parentUser) {
      parentUser = await prisma.user.create({
        data: {
          schoolId: schoolAId,
          email: 'parent@greenwood.edu',
          passwordHash: studentUser!.passwordHash,
          name: 'Priya Sharma (Parent)',
          role: UserRole.PARENT,
        },
      });
    }

    await prisma.parentStudentRelation.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.parentStudentRelation.create({
      data: {
        schoolId: schoolAId,
        parentId: parentUser.id,
        studentId: studentAId,
        relationshipType: 'MOTHER',
        isVerified: true,
      },
    });

    let unlinkedParent = await prisma.user.findFirst({
      where: { schoolId: schoolAId, email: 'unlinkedparent@greenwood.edu' },
    });
    if (!unlinkedParent) {
      unlinkedParent = await prisma.user.create({
        data: {
          schoolId: schoolAId,
          email: 'unlinkedparent@greenwood.edu',
          passwordHash: studentUser!.passwordHash,
          name: 'Unlinked Parent',
          role: UserRole.PARENT,
        },
      });
    }

    const loginParent = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'parent@greenwood.edu', password: 'Password123!' });
    tokenSchoolAParent = loginParent.body.accessToken;

    const loginUnlinkedParent = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'unlinkedparent@greenwood.edu', password: 'Password123!' });
    tokenSchoolAUnlinkedParent = loginUnlinkedParent.body.accessToken;

    const loginSuper = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@fee-platform.com', password: 'Password123!' });
    tokenPlatformAdmin = loginSuper.body.accessToken;

    // Clean existing invoices, runs, allocations, items, structures, heads, one-time billings
    await prisma.studentOneTimeFeeBilling.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
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
    await prisma.studentOneTimeFeeBilling.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
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

    it('allows student user to view their own fee statement via self-service /me/fee-statement', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students/me/fee-statement')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`);

      expect(res.status).toBe(200);
      expect(res.body.student.id).toBe(studentAId);
      expect(res.body.student.admissionNumber).toBe('ADM-2026-001');
      expect(res.body.invoices.length).toBe(12);
    });

    it('returns only the authenticated student profile via /students/accessible for STUDENT role', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students/accessible')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(studentAId);
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

  describe('5. Verified Parent-Student Relationship Model (SEC-03)', () => {
    it('allows verified parent to view their linked child statement', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentAId}/fee-statement`)
        .set('Authorization', `Bearer ${tokenSchoolAParent}`);

      expect(res.status).toBe(200);
      expect(res.body.student.id).toBe(studentAId);
      expect(res.body.student.admissionNumber).toBe('ADM-2026-001');
    });

    it('allows verified parent to use self-service /students/me/fee-statement', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students/me/fee-statement')
        .set('Authorization', `Bearer ${tokenSchoolAParent}`);

      expect(res.status).toBe(200);
      expect(res.body.student.id).toBe(studentAId);
    });

    it('returns only verified linked children in /students/accessible for PARENT', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students/accessible')
        .set('Authorization', `Bearer ${tokenSchoolAParent}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(studentAId);
    });

    it('forbids verified parent from accessing another unlinked student fee statement (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentPctId}/fee-statement`)
        .set('Authorization', `Bearer ${tokenSchoolAParent}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('forbids unlinked parent without a verified relationship from accessing student (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentAId}/fee-statement`)
        .set('Authorization', `Bearer ${tokenSchoolAUnlinkedParent}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('returns empty array from /students/accessible for unlinked parent', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students/accessible')
        .set('Authorization', `Bearer ${tokenSchoolAUnlinkedParent}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('returns 404 from /students/me/fee-statement for unlinked parent', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students/me/fee-statement')
        .set('Authorization', `Bearer ${tokenSchoolAUnlinkedParent}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('No verified student profiles linked');
    });
  });

  describe('6. School Timezone & Invoice Due-Date Calculations (TIME-01, TIME-02)', () => {
    it('verifies generated due date is pegged to 23:59:59.999 local school time (Asia/Kolkata)', async () => {
      const invoice = await prisma.feeInvoice.findFirst({
        where: { schoolId: schoolAId, studentId: studentAId, billingMonth: 1 },
      });

      expect(invoice).toBeDefined();
      const dueDateIso = invoice!.dueDate.toISOString();
      // In Asia/Kolkata (UTC+5:30), 23:59:59.999 corresponds to 18:29:59.999 UTC
      expect(dueDateIso).toContain('18:29:59.999Z');

      // Local string formatting in en-IN must render strictly on the 10th of April, NOT the 11th!
      const formattedDate = invoice!.dueDate.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      expect(formattedDate).toContain('10');
      expect(formattedDate).not.toContain('11');
    });

    it('verifies dynamic invoice status state machine transitions', () => {
      const sessionStart = new Date('2026-04-01T00:00:00.000Z');
      const fakeAcademicYear: any = { startDate: sessionStart };

      // April due date in Asia/Kolkata: 2026-04-10T18:29:59.999Z (10 Apr 23:59:59.999 IST)
      const aprilDueDate = feeGenerationService.getDueDateForBillingMonth(fakeAcademicYear, 1, 'Asia/Kolkata');
      expect(aprilDueDate.toISOString()).toBe('2026-04-10T18:29:59.999Z');

      // 1. Before billing cycle opens (e.g. March 25, 2026) -> UPCOMING
      const beforeCycle = new Date('2026-03-25T12:00:00.000Z');
      expect(feeGenerationService.deriveCurrentInvoiceStatus(InvoiceStatus.UPCOMING, aprilDueDate, beforeCycle)).toBe(InvoiceStatus.UPCOMING);

      // 2. During billing cycle before due date (e.g. April 5, 2026) -> DUE
      const duringCycle = new Date('2026-04-05T12:00:00.000Z');
      expect(feeGenerationService.deriveCurrentInvoiceStatus(InvoiceStatus.UPCOMING, aprilDueDate, duringCycle)).toBe(InvoiceStatus.DUE);

      // 3. Exactly at the due date deadline (10 Apr 2026, 23:59:59 IST = 18:29:59.999 UTC) -> DUE
      const atDueDeadline = new Date('2026-04-10T18:29:59.999Z');
      expect(feeGenerationService.deriveCurrentInvoiceStatus(InvoiceStatus.UPCOMING, aprilDueDate, atDueDeadline)).toBe(InvoiceStatus.DUE);

      // 4. During 5-day grace period (e.g. April 14, 2026) -> DUE
      const duringGrace = new Date('2026-04-14T12:00:00.000Z');
      expect(feeGenerationService.deriveCurrentInvoiceStatus(InvoiceStatus.UPCOMING, aprilDueDate, duringGrace)).toBe(InvoiceStatus.DUE);

      // 5. At end of 5-day grace period (15 Apr 2026, 23:59:59 IST = 15 Apr 18:29:59.999 UTC) -> DUE
      const atGraceDeadline = new Date('2026-04-15T18:29:59.999Z');
      expect(feeGenerationService.deriveCurrentInvoiceStatus(InvoiceStatus.UPCOMING, aprilDueDate, atGraceDeadline)).toBe(InvoiceStatus.DUE);

      // 6. After grace period (e.g. April 16, 2026 00:00:01 IST = 15 Apr 18:30:01 UTC) -> OVERDUE
      const afterGrace = new Date('2026-04-15T18:30:01.000Z');
      expect(feeGenerationService.deriveCurrentInvoiceStatus(InvoiceStatus.UPCOMING, aprilDueDate, afterGrace)).toBe(InvoiceStatus.OVERDUE);

      // 7. VOID invoice is permanently VOID regardless of date
      expect(feeGenerationService.deriveCurrentInvoiceStatus(InvoiceStatus.VOID, aprilDueDate, afterGrace)).toBe(InvoiceStatus.VOID);
    });
  });

  describe('7. ONE_TIME Fee Frequency Cross-Session Non-Duplication (FIN-01)', () => {
    let admissionFeeHeadId: string;
    let nextAcademicYearId: string;
    let testStudentId: string;

    it('creates a ONE_TIME Admission Fee head and sets up student for session 1', async () => {
      const head = await prisma.feeHead.create({
        data: {
          schoolId: schoolAId,
          name: 'One-Time Admission Fee',
          code: 'ADM-ONETIME',
          category: FeeHeadCategory.INSTITUTIONAL,
          description: 'Non-recurring admission fee for new joiners',
        },
      });
      admissionFeeHeadId = head.id;

      const section = await prisma.section.findFirst({ where: { schoolId: schoolAId, gradeId: gradeAId } });
      const stu = await prisma.student.create({
        data: {
          schoolId: schoolAId,
          academicYearId: sessionAId,
          gradeId: gradeAId,
          sectionId: section!.id,
          admissionNumber: 'ADM-2C-ONETIME-01',
          firstName: 'Rohit',
          lastName: 'Verma',
        },
      });
      testStudentId = stu.id;

      // Create fee structure with Monthly Tuition and ONE_TIME Admission Fee
      const struct = await prisma.feeStructure.create({
        data: {
          schoolId: schoolAId,
          academicYearId: sessionAId,
          gradeId: gradeAId,
          name: 'Grade 10 with Admission Fee 2026-27',
        },
      });
      await prisma.feeStructureItem.createMany({
        data: [
          {
            schoolId: schoolAId,
            feeStructureId: struct.id,
            feeHeadId: tuitionHeadId,
            amount: 4000.0,
            frequency: FeeFrequency.MONTHLY,
          },
          {
            schoolId: schoolAId,
            feeStructureId: struct.id,
            feeHeadId: admissionFeeHeadId,
            amount: 15000.0,
            frequency: FeeFrequency.ONE_TIME,
          },
        ],
      });

      // Allocate to test student for Session 1 (starting month 1)
      await prisma.studentFeeAllocation.create({
        data: {
          schoolId: schoolAId,
          studentId: testStudentId,
          academicYearId: sessionAId,
          feeStructureId: struct.id,
          startBillingMonth: 1,
        },
      });
    });

    it('generates fees for Session 1 and bills ONE_TIME Admission Fee in Month 1 only', async () => {
      // Execute fee generation for Session 1
      const execRes = await request(app.getHttpServer())
        .post('/api/v1/fee-generation/execute')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({ academicYearId: sessionAId });

      expect(execRes.status).toBe(201);

      // Verify Month 1 invoice includes Admission Fee
      const m1 = await prisma.feeInvoice.findFirst({
        where: { schoolId: schoolAId, studentId: testStudentId, academicYearId: sessionAId, billingMonth: 1 },
        include: { items: true },
      });
      expect(m1).toBeDefined();
      expect(Number(m1!.grossAmount)).toBe(19000); // 4000 + 15000
      const admItem = m1!.items.find((it) => it.feeHeadId === admissionFeeHeadId);
      expect(admItem).toBeDefined();
      expect(Number(admItem!.grossAmount)).toBe(15000);
      expect(admItem!.billingFrequencySnapshot).toBe(FeeFrequency.ONE_TIME);

      // Verify Months 2-12 do NOT include Admission Fee
      const m2 = await prisma.feeInvoice.findFirst({
        where: { schoolId: schoolAId, studentId: testStudentId, academicYearId: sessionAId, billingMonth: 2 },
        include: { items: true },
      });
      expect(m2).toBeDefined();
      expect(Number(m2!.grossAmount)).toBe(4000);
      expect(m2!.items.length).toBe(1);

      // Verify StudentOneTimeFeeBilling record is durably persisted
      const oneTimeRecord = await prisma.studentOneTimeFeeBilling.findUnique({
        where: {
          schoolId_studentId_feeHeadId: {
            schoolId: schoolAId,
            studentId: testStudentId,
            feeHeadId: admissionFeeHeadId,
          },
        },
      });
      expect(oneTimeRecord).toBeDefined();
      expect(oneTimeRecord!.academicYearId).toBe(sessionAId);
    });

    it('creates Session 2 (2027-2028), re-allocates student with structure containing Admission Fee, and verifies non-duplication', async () => {
      // Find or create Session 2
      let nextSession = await prisma.academicYear.findFirst({
        where: {
          schoolId: schoolAId,
          name: 'Academic Year 2027-2028',
        },
      });
      if (!nextSession) {
        nextSession = await prisma.academicYear.create({
          data: {
            schoolId: schoolAId,
            name: 'Academic Year 2027-2028',
            startDate: new Date('2027-04-01T00:00:00.000Z'),
            endDate: new Date('2028-03-31T23:59:59.999Z'),
            isCurrent: false,
          },
        });
      }
      nextAcademicYearId = nextSession.id;

      // Clean any residual Session 2 test data from previous runs
      await prisma.feeInvoice.deleteMany({ where: { schoolId: schoolAId, academicYearId: nextAcademicYearId } });
      await prisma.studentFeeAllocation.deleteMany({ where: { schoolId: schoolAId, academicYearId: nextAcademicYearId } });
      await prisma.feeStructureItem.deleteMany({ where: { schoolId: schoolAId, feeStructure: { academicYearId: nextAcademicYearId } } });
      await prisma.feeStructure.deleteMany({ where: { schoolId: schoolAId, academicYearId: nextAcademicYearId } });

      // Create fee structure for Session 2 that also includes the ONE_TIME Admission Fee
      const struct2 = await prisma.feeStructure.create({
        data: {
          schoolId: schoolAId,
          academicYearId: nextAcademicYearId,
          gradeId: gradeAId,
          name: 'Grade 10 with Admission Fee 2027-28',
        },
      });
      await prisma.feeStructureItem.createMany({
        data: [
          {
            schoolId: schoolAId,
            feeStructureId: struct2.id,
            feeHeadId: tuitionHeadId,
            amount: 4500.0,
            frequency: FeeFrequency.MONTHLY,
          },
          {
            schoolId: schoolAId,
            feeStructureId: struct2.id,
            feeHeadId: admissionFeeHeadId,
            amount: 15000.0,
            frequency: FeeFrequency.ONE_TIME,
          },
        ],
      });

      // Allocate student for Session 2
      await prisma.studentFeeAllocation.create({
        data: {
          schoolId: schoolAId,
          studentId: testStudentId,
          academicYearId: nextAcademicYearId,
          feeStructureId: struct2.id,
          startBillingMonth: 1,
        },
      });

      // Preview Session 2: verifies Admission Fee is excluded from projected totals
      const previewRes = await request(app.getHttpServer())
        .post('/api/v1/fee-generation/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({ academicYearId: nextAcademicYearId });

      expect(previewRes.status).toBe(201);
      // 12 months * 4500 monthly tuition = 54000. Admission Fee (15000) must NOT be added!
      expect(previewRes.body.projectedGrossTotal).toBe(54000);

      // Execute Session 2
      const execRes2 = await request(app.getHttpServer())
        .post('/api/v1/fee-generation/execute')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({ academicYearId: nextAcademicYearId });

      expect(execRes2.status).toBe(201);
      expect(execRes2.body.totalGrossAmount).toBe(54000);

      // Verify Session 2 Month 1 invoice does NOT contain Admission Fee
      const m1S2 = await prisma.feeInvoice.findFirst({
        where: { schoolId: schoolAId, studentId: testStudentId, academicYearId: nextAcademicYearId, billingMonth: 1 },
        include: { items: true },
      });
      expect(m1S2).toBeDefined();
      expect(Number(m1S2!.grossAmount)).toBe(4500); // ONLY monthly tuition!
      const admItemS2 = m1S2!.items.find((it) => it.feeHeadId === admissionFeeHeadId);
      expect(admItemS2).toBeUndefined(); // STRICTLY excluded

      // Check all 12 invoices in Session 2: none contain Admission Fee
      const allS2Invoices = await prisma.feeInvoice.findMany({
        where: { schoolId: schoolAId, studentId: testStudentId, academicYearId: nextAcademicYearId },
        include: { items: true },
      });
      expect(allS2Invoices.length).toBe(12);
      for (const inv of allS2Invoices) {
        expect(inv.items.some((it) => it.feeHeadId === admissionFeeHeadId)).toBe(false);
      }

      // Verify StudentOneTimeFeeBilling still has exactly 1 record for this student and feeHead
      const count = await prisma.studentOneTimeFeeBilling.count({
        where: {
          schoolId: schoolAId,
          studentId: testStudentId,
          feeHeadId: admissionFeeHeadId,
        },
      });
      expect(count).toBe(1);
    });
  });
});
