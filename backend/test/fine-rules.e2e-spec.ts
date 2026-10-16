import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  FeeFrequency,
  FeeHeadCategory,
  FineDayCountPolicy,
  FineRuleStatus,
  FineType,
  InvoiceStatus,
  UserRole,
} from '@prisma/client';

describe('Phase 2D-B: Fine Configuration & Late Fine Rules Engine (e2e)', () => {
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

  let sessionAId: string;
  let sessionBId: string;
  let gradeAId: string;
  let feeHeadTuitionAId: string;
  let feeHeadTransportAId: string;
  let feeHeadSchoolBId: string;
  let testStudentAId: string;
  let testInvoiceAId: string;
  let testInvoiceBId: string;

  const createdRuleIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Fetch School A and School B sessions, grades & sections
    const sessionA = await prisma.academicYear.findFirst({
      where: { schoolId: schoolAId },
    });
    const sessionB = await prisma.academicYear.findFirst({
      where: { schoolId: schoolBId },
    });
    const gradeA = await prisma.gradeClass.findFirst({
      where: { schoolId: schoolAId },
    });
    const gradeB = await prisma.gradeClass.findFirst({
      where: { schoolId: schoolBId },
    });
    const sectionA = await prisma.section.findFirst({
      where: { schoolId: schoolAId, gradeId: gradeA!.id },
    });
    const sectionB = await prisma.section.findFirst({
      where: { schoolId: schoolBId, gradeId: gradeB!.id },
    });

    sessionAId = sessionA!.id;
    sessionBId = sessionB!.id;
    gradeAId = gradeA!.id;

    // Clean up any leftover test fine rules from previous interrupted runs
    await prisma.fineRule.deleteMany({
      where: {
        name: { startsWith: 'E2E Fine Rule' },
      },
    });

    // Authenticate all role tokens
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

    const studentUser = await prisma.user.findFirst({
      where: { email: 'student@greenwood.edu' },
    });

    let parentUser = await prisma.user.findFirst({
      where: { schoolId: schoolAId, email: 'parent-fine-e2e@greenwood.edu' },
    });
    if (!parentUser) {
      parentUser = await prisma.user.create({
        data: {
          schoolId: schoolAId,
          email: 'parent-fine-e2e@greenwood.edu',
          passwordHash: studentUser!.passwordHash,
          name: 'Parent Fine E2E',
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
      .send({
        email: 'parent-fine-e2e@greenwood.edu',
        password: 'Password123!',
      });
    tokenSchoolAParent = loginParent.body.accessToken;

    // Ensure test FeeHeads in School A and School B
    let headTuitionA = await prisma.feeHead.findFirst({
      where: { schoolId: schoolAId, code: 'FINETUIT-A' },
    });
    if (!headTuitionA) {
      headTuitionA = await prisma.feeHead.create({
        data: {
          schoolId: schoolAId,
          name: 'Fine Test Tuition',
          code: 'FINETUIT-A',
          category: FeeHeadCategory.ACADEMIC,
          isOptional: false,
          status: 'ACTIVE',
        },
      });
    }
    feeHeadTuitionAId = headTuitionA.id;

    let headTransportA = await prisma.feeHead.findFirst({
      where: { schoolId: schoolAId, code: 'FINETRN-A' },
    });
    if (!headTransportA) {
      headTransportA = await prisma.feeHead.create({
        data: {
          schoolId: schoolAId,
          name: 'Fine Test Transport',
          code: 'FINETRN-A',
          category: FeeHeadCategory.FACILITY,
          isOptional: true,
          status: 'ACTIVE',
        },
      });
    }
    feeHeadTransportAId = headTransportA.id;

    let headB = await prisma.feeHead.findFirst({
      where: { schoolId: schoolBId, code: 'FINETUIT-B' },
    });
    if (!headB) {
      headB = await prisma.feeHead.create({
        data: {
          schoolId: schoolBId,
          name: 'School B Tuition',
          code: 'FINETUIT-B',
          category: FeeHeadCategory.ACADEMIC,
          isOptional: false,
          status: 'ACTIVE',
        },
      });
    }
    feeHeadSchoolBId = headB.id;

    // Ensure dedicated test student + invoice in School A for deterministic preview & non-mutation checks
    let studentA = await prisma.student.findFirst({
      where: { schoolId: schoolAId, admissionNumber: 'FINE-E2E-STU-001' },
    });
    if (!studentA) {
      studentA = await prisma.student.create({
        data: {
          schoolId: schoolAId,
          academicYearId: sessionAId,
          gradeId: gradeAId,
          sectionId: sectionA!.id,
          admissionNumber: 'FINE-E2E-STU-001',
          firstName: 'Aarav',
          lastName: 'FineTest',
          status: 'ACTIVE',
        },
      });
    }
    testStudentAId = studentA.id;

    // Ensure an invoice on Billing Month 1 (Due 2026-04-10 in Asia/Kolkata) with ₹5,000 Tuition + ₹1,500 Transport = ₹6,000 net
    let invoiceA = await prisma.feeInvoice.findFirst({
      where: {
        schoolId: schoolAId,
        studentId: testStudentAId,
        academicYearId: sessionAId,
        billingMonth: 1,
      },
    });
    if (!invoiceA) {
      invoiceA = await prisma.feeInvoice.create({
        data: {
          schoolId: schoolAId,
          studentId: testStudentAId,
          academicYearId: sessionAId,
          billingMonth: 1,
          dueDate: new Date('2026-04-10T00:00:00.000Z'),
          grossAmount: '6500.00',
          discountAmount: '500.00',
          netAmount: '6000.00',
          status: InvoiceStatus.DUE,
          items: {
            create: [
              {
                feeHeadId: feeHeadTuitionAId,
                feeHeadNameSnapshot: 'Fine Test Tuition',
                billingFrequencySnapshot: FeeFrequency.MONTHLY,
                grossAmount: '5000.00',
                discountAmount: '500.00',
                netAmount: '4500.00',
              },
              {
                feeHeadId: feeHeadTransportAId,
                feeHeadNameSnapshot: 'Fine Test Transport',
                billingFrequencySnapshot: FeeFrequency.MONTHLY,
                grossAmount: '1500.00',
                discountAmount: '0.00',
                netAmount: '1500.00',
              },
            ],
          },
        },
      });
    }
    testInvoiceAId = invoiceA.id;

    // Ensure a test student + invoice in School B for cross-tenant isolation tests
    let studentB = await prisma.student.findFirst({
      where: { schoolId: schoolBId, admissionNumber: 'FINE-E2E-STU-B01' },
    });
    if (!studentB) {
      studentB = await prisma.student.create({
        data: {
          schoolId: schoolBId,
          academicYearId: sessionBId,
          gradeId: gradeB!.id,
          sectionId: sectionB!.id,
          admissionNumber: 'FINE-E2E-STU-B01',
          firstName: 'Vivaan',
          lastName: 'Starlight',
          status: 'ACTIVE',
        },
      });
    }
    let invoiceB = await prisma.feeInvoice.findFirst({
      where: {
        schoolId: schoolBId,
        studentId: studentB.id,
        academicYearId: sessionBId,
        billingMonth: 1,
      },
    });
    if (!invoiceB) {
      invoiceB = await prisma.feeInvoice.create({
        data: {
          schoolId: schoolBId,
          studentId: studentB.id,
          academicYearId: sessionBId,
          billingMonth: 1,
          dueDate: new Date('2026-04-10T00:00:00.000Z'),
          grossAmount: '4000.00',
          discountAmount: '0.00',
          netAmount: '4000.00',
          status: InvoiceStatus.DUE,
        },
      });
    }
    testInvoiceBId = invoiceB.id;
  });

  afterAll(async () => {
    if (createdRuleIds.length > 0) {
      await prisma.fineRule.deleteMany({
        where: { id: { in: createdRuleIds } },
      });
    }
    await prisma.fineRule.deleteMany({
      where: { name: { startsWith: 'E2E Fine Rule' } },
    });
    if (testInvoiceAId) {
      await prisma.invoiceItem.deleteMany({
        where: { invoiceId: testInvoiceAId },
      });
      await prisma.feeInvoice.deleteMany({
        where: { id: testInvoiceAId },
      });
    }
    if (testStudentAId) {
      await prisma.student.deleteMany({
        where: { id: testStudentAId },
      });
    }
    if (testInvoiceBId) {
      await prisma.feeInvoice.deleteMany({
        where: { id: testInvoiceBId },
      });
    }
    await prisma.student.deleteMany({
      where: { schoolId: schoolBId, admissionNumber: 'FINE-E2E-STU-B01' },
    });
    await app.close();
  });

  // =========================================================================
  // 1. CRUD Lifecycle (Create, List, Get, Update, Status Toggle, Delete)
  // =========================================================================
  describe('1. Fine Rule CRUD Lifecycle', () => {
    let ruleId: string;

    it('should allow SCHOOL_ADMIN to create a FIXED fine rule', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Fine Rule Fixed 200',
          description: 'Flat ₹200 late fee after 5 days grace',
          fineType: FineType.FIXED,
          fineValue: 200,
          gracePeriodDays: 5,
          maxFineCap: 200,
          dayCountPolicy: FineDayCountPolicy.CALENDAR_DAYS,
          status: FineRuleStatus.ACTIVE,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.schoolId).toBe(schoolAId);
      expect(res.body.name).toBe('E2E Fine Rule Fixed 200');
      expect(res.body.fineType).toBe('FIXED');
      expect(res.body.fineValue).toBe(200);
      expect(res.body.gracePeriodDays).toBe(5);
      expect(res.body.status).toBe('ACTIVE');

      ruleId = res.body.id;
      createdRuleIds.push(ruleId);
    });

    it('should reject duplicate rule name within the same school and academic session (409)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Fine Rule Fixed 200',
          fineType: FineType.FIXED,
          fineValue: 150,
          gracePeriodDays: 3,
        })
        .expect(409);
    });

    it('should list fine rules for the tenant and filter by academicYearId', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/fine-rules')
        .query({ academicYearId: sessionAId })
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((r: any) => r.id === ruleId)).toBe(true);
    });

    it('should get a single fine rule by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/fine-rules/${ruleId}`)
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.id).toBe(ruleId);
      expect(res.body.name).toBe('E2E Fine Rule Fixed 200');
    });

    it('should update a fine rule via PATCH /api/v1/fine-rules/:id', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/fine-rules/${ruleId}`)
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          fineType: FineType.PER_DAY,
          fineValue: 25,
          gracePeriodDays: 4,
          maxFineCap: 300,
          dayCountPolicy: FineDayCountPolicy.WORKING_DAYS,
        })
        .expect(200);

      expect(res.body.fineType).toBe('PER_DAY');
      expect(res.body.fineValue).toBe(25);
      expect(res.body.gracePeriodDays).toBe(4);
      expect(res.body.maxFineCap).toBe(300);
      expect(res.body.dayCountPolicy).toBe('WORKING_DAYS');
    });

    it('should deactivate and reactivate a fine rule via PATCH /api/v1/fine-rules/:id/status', async () => {
      const resInactive = await request(app.getHttpServer())
        .patch(`/api/v1/fine-rules/${ruleId}/status`)
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({ status: FineRuleStatus.INACTIVE })
        .expect(200);
      expect(resInactive.body.status).toBe('INACTIVE');

      const resActive = await request(app.getHttpServer())
        .patch(`/api/v1/fine-rules/${ruleId}/status`)
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({ status: FineRuleStatus.ACTIVE })
        .expect(200);
      expect(resActive.body.status).toBe('ACTIVE');
    });

    it('should delete a fine rule via DELETE /api/v1/fine-rules/:id', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/fine-rules/${ruleId}`)
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.deleted).toBe(true);

      await request(app.getHttpServer())
        .get(`/api/v1/fine-rules/${ruleId}`)
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(404);
    });
  });

  // =========================================================================
  // 2. Role-Based Access Control (RBAC)
  // =========================================================================
  describe('2. Role-Based Access Control (RBAC)', () => {
    let sharedRuleId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Fine Rule RBAC Shared',
          fineType: FineType.PER_DAY,
          fineValue: 20,
          gracePeriodDays: 5,
          maxFineCap: 250,
        })
        .expect(201);
      sharedRuleId = res.body.id;
      createdRuleIds.push(sharedRuleId);
    });

    it('should allow FEE_STAFF to read rules and preview calculations, but forbid creating/updating/deleting rules', async () => {
      // Allowed: list rules
      await request(app.getHttpServer())
        .get('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .expect(200);

      // Allowed: get rule
      await request(app.getHttpServer())
        .get(`/api/v1/fine-rules/${sharedRuleId}`)
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .expect(200);

      // Allowed: preview calculation
      await request(app.getHttpServer())
        .post('/api/v1/fine-rules/preview')
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .send({
          invoiceId: testInvoiceAId,
          fineRuleId: sharedRuleId,
          asOfDate: '2026-04-20',
        })
        .expect(200);

      // Forbidden: create
      await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Staff Unauthorized Rule',
          fineType: FineType.FIXED,
          fineValue: 100,
        })
        .expect(403);

      // Forbidden: update
      await request(app.getHttpServer())
        .patch(`/api/v1/fine-rules/${sharedRuleId}`)
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .send({ fineValue: 50 })
        .expect(403);

      // Forbidden: status toggle
      await request(app.getHttpServer())
        .patch(`/api/v1/fine-rules/${sharedRuleId}/status`)
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .send({ status: FineRuleStatus.INACTIVE })
        .expect(403);

      // Forbidden: delete
      await request(app.getHttpServer())
        .delete(`/api/v1/fine-rules/${sharedRuleId}`)
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .expect(403);
    });

    it('should forbid STUDENT from all fine configuration and preview endpoints (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Student Rule',
          fineType: FineType.FIXED,
          fineValue: 100,
        })
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/fine-rules/preview')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .send({ invoiceId: testInvoiceAId })
        .expect(403);
    });

    it('should forbid PARENT from all fine configuration and preview endpoints (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAParent}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAParent}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Parent Rule',
          fineType: FineType.FIXED,
          fineValue: 100,
        })
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/fine-rules/preview')
        .set('Authorization', `Bearer ${tokenSchoolAParent}`)
        .send({ invoiceId: testInvoiceAId })
        .expect(403);
    });

    it('should allow PLATFORM_SUPER_ADMIN with x-school-id header to manage rules', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
        .set('x-school-id', schoolAId)
        .expect(200);

      expect(res.body.some((r: any) => r.id === sharedRuleId)).toBe(true);
    });
  });

  // =========================================================================
  // 3. Multi-Tenant Isolation
  // =========================================================================
  describe('3. Cross-Tenant Isolation', () => {
    let schoolARuleId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Fine Rule School A Secret',
          fineType: FineType.FIXED,
          fineValue: 300,
          gracePeriodDays: 5,
        })
        .expect(201);
      schoolARuleId = res.body.id;
      createdRuleIds.push(schoolARuleId);
    });

    it('should not leak School A fine rules when School B lists or fetches by ID', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .expect(200);
      expect(listRes.body.some((r: any) => r.id === schoolARuleId)).toBe(false);

      await request(app.getHttpServer())
        .get(`/api/v1/fine-rules/${schoolARuleId}`)
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .expect(404);
    });

    it('should reject School B attempting to update, toggle status, or delete School A fine rule', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/fine-rules/${schoolARuleId}`)
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .send({ fineValue: 999 })
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/v1/fine-rules/${schoolARuleId}/status`)
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .send({ status: FineRuleStatus.INACTIVE })
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/fine-rules/${schoolARuleId}`)
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .expect(404);
    });

    it('should reject creating a fine rule referencing another tenant academicYearId or applicableFeeHeadId', async () => {
      // School A Admin trying to use School B's academicYearId
      await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionBId,
          name: 'E2E Cross Tenant Session',
          fineType: FineType.FIXED,
          fineValue: 100,
        })
        .expect(404);

      // School A Admin trying to use School B's applicableFeeHeadId
      await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Cross Tenant FeeHead',
          fineType: FineType.FIXED,
          fineValue: 100,
          applicableFeeHeadId: feeHeadSchoolBId,
        })
        .expect(404);
    });

    it('should reject cross-tenant invoice or rule references in preview endpoint', async () => {
      // School B Admin trying to preview School A's invoice
      await request(app.getHttpServer())
        .post('/api/v1/fine-rules/preview')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .send({
          invoiceId: testInvoiceAId,
          asOfDate: '2026-04-20',
        })
        .expect(404);

      // School B Admin trying to apply School A's fine rule to School B's invoice
      await request(app.getHttpServer())
        .post('/api/v1/fine-rules/preview')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .send({
          invoiceId: testInvoiceBId,
          fineRuleId: schoolARuleId,
          asOfDate: '2026-04-20',
        })
        .expect(404);
    });
  });

  // =========================================================================
  // 4. Input & Financial Invariant Validation Errors
  // =========================================================================
  describe('4. Validation Errors', () => {
    it('should reject zero or negative fineValue (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Negative Fine',
          fineType: FineType.FIXED,
          fineValue: -50,
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Zero Fine',
          fineType: FineType.PER_DAY,
          fineValue: 0,
        })
        .expect(400);
    });

    it('should reject percentage fineValue > 100% (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Excessive Percentage',
          fineType: FineType.PERCENTAGE,
          fineValue: 125.5,
        })
        .expect(400);
    });

    it('should reject negative or excessive gracePeriodDays (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Negative Grace',
          fineType: FineType.FIXED,
          fineValue: 100,
          gracePeriodDays: -1,
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Huge Grace',
          fineType: FineType.FIXED,
          fineValue: 100,
          gracePeriodDays: 400,
        })
        .expect(400);
    });

    it('should reject invalid maxFineCap (<= 0 or less than FIXED fineValue)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Zero Cap',
          fineType: FineType.PER_DAY,
          fineValue: 20,
          maxFineCap: 0,
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Cap Lower Than Fixed',
          fineType: FineType.FIXED,
          fineValue: 500,
          maxFineCap: 250,
        })
        .expect(400);
    });

    it('should reject effectiveEndDate earlier than effectiveStartDate (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Reversed Effective Dates',
          fineType: FineType.FIXED,
          fineValue: 100,
          effectiveStartDate: '2026-06-01',
          effectiveEndDate: '2026-05-01',
        })
        .expect(400);
    });
  });

  // =========================================================================
  // 5. Fine Calculation Preview Engine & Non-Mutation Verification
  // =========================================================================
  describe('5. Calculation Preview & Statement Integration', () => {
    let generalRuleId: string;
    let transportRuleId: string;
    let percentageRuleId: string;

    beforeAll(async () => {
      // Remove any existing E2E rules so auto-match is deterministic
      await prisma.fineRule.deleteMany({
        where: { name: { startsWith: 'E2E Fine Rule' } },
      });

      // 1. General PER_DAY rule: ₹30/day after 5 days grace, cap ₹200
      const resGeneral = await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Fine Rule General PerDay',
          fineType: FineType.PER_DAY,
          fineValue: 30,
          gracePeriodDays: 5,
          maxFineCap: 200,
          dayCountPolicy: FineDayCountPolicy.CALENDAR_DAYS,
        })
        .expect(201);
      generalRuleId = resGeneral.body.id;
      createdRuleIds.push(generalRuleId);

      // 2. Fee-head specific FIXED rule on Transport: ₹120 flat after 2 days grace
      const resTransport = await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Fine Rule Transport Fixed',
          fineType: FineType.FIXED,
          fineValue: 120,
          gracePeriodDays: 2,
          applicableFeeHeadId: feeHeadTransportAId,
          status: FineRuleStatus.INACTIVE, // start inactive so general rule is default
        })
        .expect(201);
      transportRuleId = resTransport.body.id;
      createdRuleIds.push(transportRuleId);

      // 3. PERCENTAGE rule: 5% on ACADEMIC category after 5 days grace, cap ₹250
      const resPct = await request(app.getHttpServer())
        .post('/api/v1/fine-rules')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          academicYearId: sessionAId,
          name: 'E2E Fine Rule Academic Percentage',
          fineType: FineType.PERCENTAGE,
          fineValue: 5,
          gracePeriodDays: 5,
          maxFineCap: 250,
          applicableCategory: FeeHeadCategory.ACADEMIC,
          status: FineRuleStatus.INACTIVE,
        })
        .expect(201);
      percentageRuleId = resPct.body.id;
      createdRuleIds.push(percentageRuleId);
    });

    it('should return 0 fine within the grace period and calculate PER_DAY + cap after grace period', async () => {
      // Invoice due 2026-04-10, grace 5 days -> grace ends 2026-04-15
      // At 2026-04-15 (within grace): fine = 0
      const withinGrace = await request(app.getHttpServer())
        .post('/api/v1/fine-rules/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          invoiceId: testInvoiceAId,
          fineRuleId: generalRuleId,
          asOfDate: '2026-04-15',
        })
        .expect(200);

      expect(withinGrace.body.isPastGracePeriod).toBe(false);
      expect(withinGrace.body.overdueDays).toBe(0);
      expect(withinGrace.body.calculatedFine).toBe(0);
      expect(withinGrace.body.isPaymentOrCollected).toBe(false);

      // At 2026-04-19 (4 days past grace): 4 * ₹30 = ₹120 (under ₹200 cap)
      const fourDaysLate = await request(app.getHttpServer())
        .post('/api/v1/fine-rules/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          invoiceId: testInvoiceAId,
          fineRuleId: generalRuleId,
          asOfDate: '2026-04-19',
        })
        .expect(200);

      expect(fourDaysLate.body.isPastGracePeriod).toBe(true);
      expect(fourDaysLate.body.overdueDays).toBe(4);
      expect(fourDaysLate.body.uncappedFine).toBe(120);
      expect(fourDaysLate.body.capApplied).toBe(false);
      expect(fourDaysLate.body.calculatedFine).toBe(120);

      // At 2026-04-25 (10 days past grace): 10 * ₹30 = ₹300 -> capped at ₹200
      const tenDaysLate = await request(app.getHttpServer())
        .post('/api/v1/fine-rules/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          invoiceId: testInvoiceAId,
          fineRuleId: generalRuleId,
          asOfDate: '2026-04-25',
        })
        .expect(200);

      expect(tenDaysLate.body.overdueDays).toBe(10);
      expect(tenDaysLate.body.uncappedFine).toBe(300);
      expect(tenDaysLate.body.capApplied).toBe(true);
      expect(tenDaysLate.body.calculatedFine).toBe(200);
    });

    it('should calculate PERCENTAGE fine on scoped ACADEMIC base and respect partial/full paid simulation', async () => {
      // Activate percentageRuleId first
      await request(app.getHttpServer())
        .patch(`/api/v1/fine-rules/${percentageRuleId}/status`)
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({ status: FineRuleStatus.ACTIVE })
        .expect(200);

      // Invoice has ₹4500 ACADEMIC net + ₹1500 TRANSPORT net = ₹6000 total net.
      // 5% of ₹4500 = ₹225.00
      const unpaidPreview = await request(app.getHttpServer())
        .post('/api/v1/fine-rules/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          invoiceId: testInvoiceAId,
          fineRuleId: percentageRuleId,
          asOfDate: '2026-04-20',
          paidAmount: 0,
        })
        .expect(200);

      expect(unpaidPreview.body.scopedBaseAmount).toBe(4500);
      expect(unpaidPreview.body.eligibleOutstandingBasis).toBe(4500);
      expect(unpaidPreview.body.calculatedFine).toBe(225);

      // Simulate partial payment of ₹4000 -> remaining invoice unpaid = ₹2000 -> eligible basis = min(4500, 2000) = ₹2000 -> 5% = ₹100
      const partialPaidPreview = await request(app.getHttpServer())
        .post('/api/v1/fine-rules/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          invoiceId: testInvoiceAId,
          fineRuleId: percentageRuleId,
          asOfDate: '2026-04-20',
          paidAmount: 4000,
        })
        .expect(200);

      expect(partialPaidPreview.body.eligibleOutstandingBasis).toBe(2000);
      expect(partialPaidPreview.body.calculatedFine).toBe(100);

      // Simulate full payment of ₹6000 -> fine = 0
      const fullPaidPreview = await request(app.getHttpServer())
        .post('/api/v1/fine-rules/preview')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          invoiceId: testInvoiceAId,
          fineRuleId: percentageRuleId,
          asOfDate: '2026-04-20',
          paidAmount: 6000,
        })
        .expect(200);

      expect(fullPaidPreview.body.isFullyPaid).toBe(true);
      expect(fullPaidPreview.body.calculatedFine).toBe(0);
    });

    it('should include non-mutating finePreview on Student Fee Statement without altering stored FeeInvoice or InvoiceItem amounts', async () => {
      const beforeInvoice = await prisma.feeInvoice.findUnique({
        where: { id: testInvoiceAId },
        include: { items: true },
      });

      const stmtRes = await request(app.getHttpServer())
        .get(`/api/v1/students/${testStudentAId}/fee-statement`)
        .query({ academicYearId: sessionAId })
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(stmtRes.body.summary.totalCalculatedFinePreview).toBeDefined();
      const invEntry = stmtRes.body.invoices.find(
        (i: any) => i.id === testInvoiceAId,
      );
      expect(invEntry).toBeDefined();
      expect(invEntry.finePreview).toBeDefined();
      expect(invEntry.finePreview.isPaymentOrCollected).toBe(false);
      // Evaluated at current date (2026-10-16) against 2026-04-10 due date, percentage rule (5% of 4500 = 225) is higher priority than general rule
      expect(invEntry.finePreview.calculatedFine).toBe(225);

      const afterInvoice = await prisma.feeInvoice.findUnique({
        where: { id: testInvoiceAId },
        include: { items: true },
      });

      expect(afterInvoice!.grossAmount.toString()).toBe(
        beforeInvoice!.grossAmount.toString(),
      );
      expect(afterInvoice!.discountAmount.toString()).toBe(
        beforeInvoice!.discountAmount.toString(),
      );
      expect(afterInvoice!.netAmount.toString()).toBe(
        beforeInvoice!.netAmount.toString(),
      );
      expect(afterInvoice!.items.length).toBe(beforeInvoice!.items.length);
    });
  });
});
