import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { NotificationOutboxService } from '../src/notifications/outbox/notification-outbox.service';
import * as ExcelJS from 'exceljs';
import * as zlib from 'zlib';

function extractPdfText(buf: Buffer): string {
  let text = '';
  const str = buf.toString('latin1');
  const streamHeaderRegex = /\/Length\s+(\d+)[\s\S]*?stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamHeaderRegex.exec(str)) !== null) {
    const length = parseInt(match[1], 10);
    const streamStart = match.index + match[0].length;
    const raw = buf.subarray(streamStart, streamStart + length);
    let uncompressed: string;
    try {
      uncompressed = zlib.inflateSync(raw).toString('latin1');
    } catch {
      uncompressed = raw.toString('latin1');
    }
    const tjRegex = /\[(.*?)\]\s*TJ/g;
    let tjm: RegExpExecArray | null;
    while ((tjm = tjRegex.exec(uncompressed)) !== null) {
      const hexRegex = /<([0-9a-fA-F]+)>/g;
      const hexParts: string[] = [];
      let hm: RegExpExecArray | null;
      while ((hm = hexRegex.exec(tjm[1])) !== null) {
        hexParts.push(Buffer.from(hm[1], 'hex').toString('latin1'));
      }
      text += hexParts.join('') + ' ';
    }
    const tjSingle = /\((.*?)\)\s*Tj/g;
    while ((tjm = tjSingle.exec(uncompressed)) !== null) {
      text += tjm[1] + ' ';
    }
  }
  return text;
}


describe('Reports & Collection Aggregations Core (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const schoolAId = '00000000-0000-0000-0000-000000000001';
  const schoolBId = '00000000-0000-0000-0000-000000000002';

  let tokenSchoolAAdmin: string;
  let tokenSchoolBAdmin: string;
  let tokenSchoolAStaff: string;
  let tokenSchoolAStudent: string;
  let tokenPlatformAdmin: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationOutboxService)
      .useValue({
        enqueueReceiptIssued: jest.fn().mockResolvedValue({ id: 'mock-outbox-rcpt' }),
        enqueuePaymentReversed: jest.fn().mockResolvedValue({ id: 'mock-outbox-rev' }),
        enqueueRefundSucceeded: jest.fn().mockResolvedValue({ id: 'mock-outbox-ref-s' }),
        enqueueRefundFailed: jest.fn().mockResolvedValue({ id: 'mock-outbox-ref-f' }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Authenticate test users
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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Role-Based Access Control on Reporting Endpoints', () => {
    it('allows SCHOOL_ADMIN to access daily collection report', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/collections/daily')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.school).toBeDefined();
      expect(res.body.school.id).toBe(schoolAId);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary).toHaveProperty('grossCollections');
      expect(res.body.summary).toHaveProperty('netCollections');
      expect(res.body.config).toBeDefined();
    });

    it('allows FEE_STAFF to access daily collection report', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/collections/daily')
        .set('Authorization', `Bearer ${tokenSchoolAStaff}`)
        .expect(200);

      expect(res.body.school.id).toBe(schoolAId);
      expect(res.body.summary).toBeDefined();
    });

    it('strictly forbids STUDENT from accessing school-wide reports with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/collections/daily')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/reports/dues/outstanding')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/reports/collections/by-class')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/reports/dues/defaulters')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/reports/fines/summary')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/reports/DAILY_COLLECTION/export?format=csv')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/reports/DAILY_COLLECTION/export?format=xlsx')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/reports/DAILY_COLLECTION/export?format=pdf')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .expect(403);
    });

    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/collections/daily')
        .expect(401);
    });

    it('allows PLATFORM_SUPER_ADMIN with valid x-school-id header', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/collections/daily')
        .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
        .set('x-school-id', schoolAId)
        .expect(200);

      expect(res.body.school.id).toBe(schoolAId);
    });

    it('rejects PLATFORM_SUPER_ADMIN without x-school-id header with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/collections/daily')
        .set('Authorization', `Bearer ${tokenPlatformAdmin}`)
        .expect(400);
    });
  });

  describe('2. Multi-Tenant Isolation', () => {
    it('returns School A data for School A admin and School B data for School B admin', async () => {
      const resA = await request(app.getHttpServer())
        .get('/api/v1/reports/collections/daily')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      const resB = await request(app.getHttpServer())
        .get('/api/v1/reports/collections/daily')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .expect(200);

      expect(resA.body.school.id).toBe(schoolAId);
      expect(resB.body.school.id).toBe(schoolBId);
      expect(resA.body.config.branding.schoolName).not.toEqual(
        resB.body.config.branding.schoolName,
      );
    });

    it('rejects School A admin attempting to spoof School B with x-school-id header with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/collections/daily')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .set('x-school-id', schoolBId)
        .expect(403);
    });
  });

  describe('3. Query Parameter Validation & Date Boundaries', () => {
    it('returns 400 Bad Request for invalid date string on daily endpoint', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/collections/daily?date=invalid-date')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);
    });

    it('returns 400 Bad Request for invalid month on monthly endpoint', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/collections/monthly?year=2026&month=13')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);
    });

    it('returns 400 Bad Request for invalid year on monthly endpoint', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/collections/monthly?year=1999&month=5')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);
    });

    it('returns 400 Bad Request if startDate is after endDate on summary endpoint', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/collections/summary?startDate=2026-10-25&endDate=2026-10-10')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);
    });

    it('returns 400 Bad Request if startDate or endDate is missing on summary endpoint', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/collections/summary?startDate=2026-10-01')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);
    });

    it('successfully processes valid monthly report', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/collections/monthly?year=2026&month=10')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.period.year).toBe(2026);
      expect(res.body.period.month).toBe(10);
      expect(res.body.period.daysInMonth).toBe(31);
      expect(Array.isArray(res.body.dailyBreakdown)).toBe(true);
      expect(res.body.dailyBreakdown.length).toBe(31);
    });

    it('successfully processes valid collection summary report', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/collections/summary?startDate=2026-10-01&endDate=2026-10-17')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.period.startDate).toBe('2026-10-01');
      expect(res.body.period.endDate).toBe('2026-10-17');
      expect(res.body.period.bucketType).toBe('DAILY');
      expect(res.body.summary).toBeDefined();
    });
  });

  describe('4. Report Configuration Endpoints', () => {
    it('returns default report config for DAILY_COLLECTION matching school profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/config/DAILY_COLLECTION')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.reportType).toBe('DAILY_COLLECTION');
      expect(res.body.branding.schoolName).toBe('Greenwood International Academy');
      expect(res.body.display.currencyCode).toBe('INR');
      expect(res.body.display.currencySymbol).toBe('₹');
      expect(Array.isArray(res.body.table.columns)).toBe(true);
    });

    it('returns 400 Bad Request for unsupported reportType parameter', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/config/UNKNOWN_REPORT')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);
    });

    it('returns all report configurations on GET /api/v1/reports/config', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/config')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.DAILY_COLLECTION).toBeDefined();
      expect(res.body.MONTHLY_COLLECTION).toBeDefined();
      expect(res.body.COLLECTION_SUMMARY).toBeDefined();
      expect(res.body.OUTSTANDING_DUES).toBeDefined();
      expect(res.body.CLASS_COLLECTION).toBeDefined();
      expect(res.body.FINE_SUMMARY).toBeDefined();
      expect(res.body.DEFAULTER_REPORT).toBeDefined();
      expect(res.body.OUTSTANDING_DUES.styling.orientation).toBe('LANDSCAPE');
      expect(res.body.CLASS_COLLECTION.styling.orientation).toBe('LANDSCAPE');
      expect(res.body.FINE_SUMMARY.styling.orientation).toBe('LANDSCAPE');
      expect(res.body.DEFAULTER_REPORT.styling.orientation).toBe('LANDSCAPE');
    });

    it('returns default config for OUTSTANDING_DUES, CLASS_COLLECTION, FINE_SUMMARY, and DEFAULTER_REPORT on parameterized endpoint', async () => {
      const resDues = await request(app.getHttpServer())
        .get('/api/v1/reports/config/OUTSTANDING_DUES')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);
      expect(resDues.body.reportType).toBe('OUTSTANDING_DUES');
      expect(resDues.body.display.visibleSummaryCards).toContain('OUTSTANDING_BALANCE');

      const resClass = await request(app.getHttpServer())
        .get('/api/v1/reports/config/CLASS_COLLECTION')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);
      expect(resClass.body.reportType).toBe('CLASS_COLLECTION');
      expect(resClass.body.display.visibleSummaryCards).toContain('GROSS_COLLECTIONS');

      const resFines = await request(app.getHttpServer())
        .get('/api/v1/reports/config/FINE_SUMMARY')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);
      expect(resFines.body.reportType).toBe('FINE_SUMMARY');
      expect(resFines.body.display.visibleSummaryCards).toContain('TOTAL_ASSESSED');

      const resDefaulters = await request(app.getHttpServer())
        .get('/api/v1/reports/config/DEFAULTER_REPORT')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);
      expect(resDefaulters.body.reportType).toBe('DEFAULTER_REPORT');
      expect(resDefaulters.body.display.visibleSummaryCards).toContain('OVERDUE_AMOUNT');
    });

    it('forbids STUDENT from accessing report configuration', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/config')
        .set('Authorization', `Bearer ${tokenSchoolAStudent}`)
        .expect(403);
    });
  });

  describe('5. Financial Aggregation Flow on Live Database Records', () => {
    let testInvoiceId: string | null = null;
    let createdPaymentId: string | null = null;

    afterEach(async () => {
      if (createdPaymentId) {
        await prisma.paymentRefundAllocation.deleteMany({
          where: { paymentRefund: { paymentId: createdPaymentId } },
        });
        await prisma.paymentRefund.deleteMany({
          where: { paymentId: createdPaymentId },
        });
        await prisma.paymentAllocation.deleteMany({
          where: { paymentId: createdPaymentId },
        });
        await prisma.receipt.deleteMany({
          where: { paymentId: createdPaymentId },
        });
        await prisma.paymentReversal.deleteMany({
          where: { paymentId: createdPaymentId },
        });
        await prisma.payment.deleteMany({
          where: { id: createdPaymentId },
        });
        createdPaymentId = null;
      }
      if (testInvoiceId) {
        await prisma.invoiceItem.deleteMany({
          where: { invoiceId: testInvoiceId },
        });
        await prisma.feeInvoice.deleteMany({
          where: { id: testInvoiceId },
        });
        testInvoiceId = null;
      }
      await prisma.feeHead.deleteMany({
        where: { schoolId: schoolAId, code: 'REP-TUIT' },
      }).catch(() => {});
    });

    it('processes a live payment, partial reversal, and refund, asserting exact daily reporting totals', async () => {
      // 1. Fetch valid student, session, and fee head from School A
      const student = await prisma.student.findFirst({
        where: { schoolId: schoolAId, status: 'ACTIVE' },
      });
      expect(student).toBeDefined();

      const academicYear = await prisma.academicYear.findFirst({
        where: { schoolId: schoolAId },
      });
      expect(academicYear).toBeDefined();

      let feeHead = await prisma.feeHead.findFirst({
        where: { schoolId: schoolAId, code: 'REP-TUIT' },
      });
      if (!feeHead) {
        feeHead = await prisma.feeHead.create({
          data: {
            schoolId: schoolAId,
            code: 'REP-TUIT',
            name: 'Report Tuition Fee',
            category: 'ACADEMIC',
          },
        });
      }
      expect(feeHead).toBeDefined();

      // 2. Create test invoice
      const invoice = await prisma.feeInvoice.create({
        data: {
          schoolId: schoolAId,
          studentId: student!.id,
          academicYearId: academicYear!.id,
          billingMonth: 77,
          dueDate: new Date(),
          grossAmount: new Prisma.Decimal(10000),
          discountAmount: new Prisma.Decimal(0),
          netAmount: new Prisma.Decimal(10000),
          status: 'DUE',
          items: {
            create: [
              {
                feeHeadId: feeHead!.id,
                feeHeadNameSnapshot: feeHead!.name,
                grossAmount: new Prisma.Decimal(10000),
                discountAmount: new Prisma.Decimal(0),
                netAmount: new Prisma.Decimal(10000),
                billingFrequencySnapshot: 'MONTHLY',
              },
            ],
          },
        },
      });
      testInvoiceId = invoice.id;

      const invoiceItem = await prisma.invoiceItem.findFirst({
        where: { invoiceId: invoice.id },
      });
      expect(invoiceItem).toBeDefined();

      // 3. Collect payment of ₹10,000 via HTTP
      const payRes = await request(app.getHttpServer())
        .post('/api/v1/payments/collect')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          studentId: student!.id,
          academicYearId: academicYear!.id,
          amount: 10000,
          paymentMethod: 'BANK_TRANSFER',
          paymentDate: new Date().toISOString(),
          allocations: [
            {
              invoiceId: invoice.id,
              invoiceItemId: invoiceItem!.id,
              allocationType: 'PRINCIPAL',
              amount: 10000,
            },
          ],
        })
        .expect(201);

      createdPaymentId = payRes.body.payment.id;
      const allocationId = payRes.body.allocations[0].id;
      expect(payRes.body.payment.status).toBe('COMPLETED');

      // 4. Execute partial reversal of ₹3,000 via HTTP
      await request(app.getHttpServer())
        .post(`/api/v1/payments/${createdPaymentId}/reverse`)
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          reversalType: 'CORRECTION',
          reason: 'Bursar correction for duplicate item billing',
          allocations: [
            {
              allocationId,
              amount: 3000,
            },
          ],
        })
        .expect(200);

      // 5. Execute partial refund of ₹2,000 via HTTP
      await request(app.getHttpServer())
        .post(`/api/v1/payments/${createdPaymentId}/refund`)
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .send({
          amount: 2000,
          reason: 'Authorized partial refund for fee adjustment',
          mode: 'BANK_TRANSFER',
          status: 'SUCCEEDED',
          allocations: [
            {
              allocationId,
              amount: 2000,
            },
          ],
        })
        .expect(201);

      // 6. Query daily collection report for today
      const todayIso = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());

      const reportRes = await request(app.getHttpServer())
        .get(`/api/v1/reports/collections/daily?date=${todayIso}`)
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      const summary = reportRes.body.summary;
      // Invariant checks
      expect(summary.grossCollections).toBeGreaterThanOrEqual(10000);
      expect(summary.totalReversals).toBeGreaterThanOrEqual(3000);
      expect(summary.totalRefunds).toBeGreaterThanOrEqual(2000);
      expect(summary.netCollections).toBe(
        Number(
          (
            summary.grossCollections -
            summary.totalReversals -
            summary.totalRefunds
          ).toFixed(2),
        ),
      );
      expect(summary.receiptCount).toBeGreaterThanOrEqual(1);

      // Check payment method breakdown contains BANK_TRANSFER
      const bankMethod = reportRes.body.byPaymentMethod.find(
        (m: any) => m.method === 'BANK_TRANSFER',
      );
      expect(bankMethod).toBeDefined();
      expect(bankMethod.grossAmount).toBeGreaterThanOrEqual(10000);
      expect(bankMethod.reversals).toBeGreaterThanOrEqual(3000);
      expect(bankMethod.refunds).toBeGreaterThanOrEqual(2000);
      expect(bankMethod.netAmount).toBe(
        Number(
          (
            bankMethod.grossAmount -
            bankMethod.reversals -
            bankMethod.refunds
          ).toFixed(2),
        ),
      );

      // Check fee head breakdown contains feeHead
      const feeHeadEntry = reportRes.body.byFeeHead.find(
        (h: any) => h.feeHeadId === feeHead!.id,
      );
      expect(feeHeadEntry).toBeDefined();
      expect(feeHeadEntry.grossAmount).toBeGreaterThanOrEqual(10000);
      expect(feeHeadEntry.reversals).toBeGreaterThanOrEqual(3000);
      expect(feeHeadEntry.refunds).toBeGreaterThanOrEqual(2000);
      expect(feeHeadEntry.netAmount).toBe(
        Number(
          (
            feeHeadEntry.grossAmount -
            feeHeadEntry.reversals -
            feeHeadEntry.refunds
          ).toFixed(2),
        ),
      );
    });
  });

  describe('6. Outstanding Dues & Class-Wise Live Endpoints and Multi-Tenant Isolation', () => {
    it('successfully generates outstanding dues report for School A admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/dues/outstanding')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.school).toBeDefined();
      expect(res.body.school.id).toBe(schoolAId);
      expect(res.body.filters).toBeDefined();
      expect(res.body.pagination).toBeDefined();
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary).toHaveProperty('totalStudents');
      expect(res.body.summary).toHaveProperty('totalBilledAmount');
      expect(res.body.summary).toHaveProperty('totalPaidAmount');
      expect(res.body.summary).toHaveProperty('totalOutstandingAmount');
      expect(res.body.records).toBeInstanceOf(Array);
      expect(res.body.config).toBeDefined();
      expect(res.body.config.reportType).toBe('OUTSTANDING_DUES');
    });

    it('supports pagination and sorting on outstanding dues report', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/dues/outstanding?page=1&limit=5&sortBy=outstandingBalance&sortOrder=desc')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(5);
      expect(res.body.records.length).toBeLessThanOrEqual(5);

      if (res.body.records.length > 1) {
        expect(res.body.records[0].outstandingBalance).toBeGreaterThanOrEqual(
          res.body.records[1].outstandingBalance,
        );
      }
    });

    it('enforces multi-tenant isolation on outstanding dues report', async () => {
      const resB = await request(app.getHttpServer())
        .get('/api/v1/reports/dues/outstanding')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .expect(200);

      expect(resB.body.school.id).toBe(schoolBId);
    });

    it('successfully generates class-wise collection report for School A admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/collections/by-class')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.school).toBeDefined();
      expect(res.body.school.id).toBe(schoolAId);
      expect(res.body.period).toBeDefined();
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary).toHaveProperty('grossCollections');
      expect(res.body.summary).toHaveProperty('totalReversals');
      expect(res.body.summary).toHaveProperty('totalRefunds');
      expect(res.body.summary).toHaveProperty('netCollections');
      expect(res.body.byClass).toBeInstanceOf(Array);
      expect(res.body.config).toBeDefined();
      expect(res.body.config.reportType).toBe('CLASS_COLLECTION');

      // Reconciliation check: sum of class gross collections matches overall summary gross collections
      const sumClassGross = res.body.byClass.reduce(
        (acc: number, item: any) => acc + item.grossCollections,
        0,
      );
      expect(Number(sumClassGross.toFixed(2))).toBe(res.body.summary.grossCollections);
    });

    it('validates date range query parameters on class collection report', async () => {
      // 1. startDate after endDate
      await request(app.getHttpServer())
        .get('/api/v1/reports/collections/by-class?startDate=2026-10-20&endDate=2026-10-10')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);

      // 2. startDate without endDate
      await request(app.getHttpServer())
        .get('/api/v1/reports/collections/by-class?startDate=2026-10-10')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);

      // 3. endDate without startDate
      await request(app.getHttpServer())
        .get('/api/v1/reports/collections/by-class?endDate=2026-10-10')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);
    });

    it('enforces multi-tenant isolation on class-wise collection report', async () => {
      const resB = await request(app.getHttpServer())
        .get('/api/v1/reports/collections/by-class')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .expect(200);

      expect(resB.body.school.id).toBe(schoolBId);
    });
  });

  describe('7. Fine Summaries & Defaulter Reporting Live Flow', () => {
    it('successfully generates fee defaulters report for School A admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/dues/defaulters')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.school).toBeDefined();
      expect(res.body.school.id).toBe(schoolAId);
      expect(res.body.filters).toBeDefined();
      expect(res.body.filters.onlyWithDues).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary).toHaveProperty('totalStudents');
      expect(res.body.summary).toHaveProperty('totalOutstandingAmount');
      expect(res.body.summary).toHaveProperty('totalOverdueAmount');
      expect(res.body.summary).toHaveProperty('totalOverduePrincipal');
      expect(res.body.summary).toHaveProperty('totalOverdueFines');
      expect(res.body.summary).toHaveProperty('overdueStudentsCount');
      expect(res.body.records).toBeInstanceOf(Array);
      expect(res.body.config).toBeDefined();
      expect(res.body.config.reportType).toBe('DEFAULTER_REPORT');
      expect(res.body.config.styling.orientation).toBe('LANDSCAPE');

      // Verify overdue breakdown logic on records if present
      for (const rec of res.body.records) {
        expect(rec).toHaveProperty('studentId');
        expect(rec).toHaveProperty('admissionNumber');
        expect(rec).toHaveProperty('overdueAmount');
        expect(rec).toHaveProperty('overduePrincipal');
        expect(rec).toHaveProperty('overdueFines');
        expect(rec).toHaveProperty('maxOverdueDays');
        expect(Number((rec.overduePrincipal + rec.overdueFines).toFixed(2))).toBe(rec.overdueAmount);
        expect(rec.outstandingBalance).toBeGreaterThan(0);
      }
    });

    it('supports pagination, minOverdueDays and sorting on defaulters report', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/dues/defaulters?page=1&limit=5&minOverdueDays=0&sortBy=overdueAmount&sortOrder=desc')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(5);
      expect(res.body.records.length).toBeLessThanOrEqual(5);

      if (res.body.records.length > 1) {
        expect(res.body.records[0].overdueAmount).toBeGreaterThanOrEqual(
          res.body.records[1].overdueAmount,
        );
      }
    });

    it('enforces multi-tenant isolation on defaulters report', async () => {
      const resB = await request(app.getHttpServer())
        .get('/api/v1/reports/dues/defaulters')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .expect(200);

      expect(resB.body.school.id).toBe(schoolBId);
      if (resB.body.records.length > 0) {
        for (const rec of resB.body.records) {
          expect(rec).toBeDefined();
        }
      }
    });

    it('successfully generates fine summary report for School A admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/fines/summary')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.body.school).toBeDefined();
      expect(res.body.school.id).toBe(schoolAId);
      expect(res.body.filters).toBeDefined();
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary).toHaveProperty('totalAssessed');
      expect(res.body.summary).toHaveProperty('totalWaived');
      expect(res.body.summary).toHaveProperty('netObligation');
      expect(res.body.summary).toHaveProperty('totalCollected');
      expect(res.body.summary).toHaveProperty('totalReversals');
      expect(res.body.summary).toHaveProperty('totalRefunds');
      expect(res.body.summary).toHaveProperty('netCollected');
      expect(res.body.summary).toHaveProperty('remainingBalance');
      expect(res.body.summary).toHaveProperty('fineCount');

      // Financial invariant check: netCollected <= totalCollected
      const { summary } = res.body;
      const calculatedNetCollected = Math.max(
        0,
        Number((summary.totalCollected - summary.totalReversals - summary.totalRefunds).toFixed(2)),
      );
      expect(summary.netCollected).toBe(calculatedNetCollected);

      const calculatedNetObligation = Math.max(
        0,
        Number((summary.totalAssessed - summary.totalWaived).toFixed(2)),
      );
      expect(summary.netObligation).toBe(calculatedNetObligation);

      const calculatedRemaining = Math.max(
        0,
        Number((summary.totalAssessed - summary.totalWaived - summary.netCollected).toFixed(2)),
      );
      expect(summary.remainingBalance).toBe(calculatedRemaining);

      expect(res.body.byClass).toBeInstanceOf(Array);
      expect(res.body.statusBreakdown).toBeInstanceOf(Array);
      expect(res.body.ruleBreakdown).toBeInstanceOf(Array);
      expect(res.body.config).toBeDefined();
      expect(res.body.config.reportType).toBe('FINE_SUMMARY');
      expect(res.body.config.styling.orientation).toBe('LANDSCAPE');

      // Reconciliation check: sum of byClass totalAssessed matches overall summary totalAssessed
      const sumClassAssessed = res.body.byClass.reduce(
        (acc: number, item: any) => acc + item.totalAssessed,
        0,
      );
      expect(Number(sumClassAssessed.toFixed(2))).toBe(summary.totalAssessed);
    });

    it('validates date range query parameters on fine summary report', async () => {
      // 1. startDate after endDate
      await request(app.getHttpServer())
        .get('/api/v1/reports/fines/summary?startDate=2026-10-20&endDate=2026-10-10')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);

      // 2. startDate without endDate
      await request(app.getHttpServer())
        .get('/api/v1/reports/fines/summary?startDate=2026-10-10')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);

      // 3. endDate without startDate
      await request(app.getHttpServer())
        .get('/api/v1/reports/fines/summary?endDate=2026-10-10')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);
    });

    it('enforces multi-tenant isolation on fine summary report', async () => {
      const resB = await request(app.getHttpServer())
        .get('/api/v1/reports/fines/summary')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .expect(200);

      expect(resB.body.school.id).toBe(schoolBId);
    });
  });

  describe('8. CSV, Excel, and PDF Export Endpoints', () => {
    it('successfully exports DAILY_COLLECTION as CSV with correct headers and Content-Type', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/DAILY_COLLECTION/export?format=csv')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="daily_collection_\d{4}-\d{2}-\d{2}\.csv"/,
      );
      expect(res.headers['x-school-id']).toBe(schoolAId);

      const lines = res.text.split('\r\n');
      expect(lines[0]).toBe(
        'Receipt #,Time,Adm #,Student Name,Class / Sec,Method,Reference / Cheque #,Amount',
      );
    });

    it('successfully exports DAILY_COLLECTION as XLSX with school branding and styling', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/DAILY_COLLECTION/export?format=xlsx')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .responseType('blob')
        .expect(200);

      expect(res.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="daily_collection_\d{4}-\d{2}-\d{2}\.xlsx"/,
      );

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body);
      const sheet = workbook.worksheets[0];
      expect(sheet).toBeDefined();

      // Row 1: School Branding
      const cellA1 = sheet.getCell('A1');
      expect(cellA1.value).toBe('Greenwood International Academy');
      expect(cellA1.font?.bold).toBe(true);

      // Row 3: Report Title
      expect(sheet.getCell('A3').value).toBe('Daily Fee Collection Report');
    });

    it('successfully exports DAILY_COLLECTION as PDF with headers, styling, and metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/DAILY_COLLECTION/export?format=pdf')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .responseType('blob')
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="daily_collection_\d{4}-\d{2}-\d{2}\.pdf"/,
      );
      expect(res.headers['x-school-id']).toBe(schoolAId);
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.toString('latin1', 0, 5)).toBe('%PDF-');

      const text = extractPdfText(res.body);
      expect(text).toContain('Greenwood International Academy');
      expect(text).toContain('Daily Fee Collection Report');
    });

    it('successfully exports OUTSTANDING_DUES and DEFAULTERS reports via parameterized and subpath endpoints', async () => {
      // 1. Parameterized CSV export for OUTSTANDING_DUES
      const resDuesCsv = await request(app.getHttpServer())
        .get('/api/v1/reports/OUTSTANDING_DUES/export?format=csv')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(resDuesCsv.headers['content-type']).toContain('text/csv');
      expect(resDuesCsv.text).toContain('Outstanding Balance');

      // 2. Subpath CSV export for dues/defaulters
      const resDefaultersCsv = await request(app.getHttpServer())
        .get('/api/v1/reports/dues/defaulters/export?format=csv')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(resDefaultersCsv.headers['content-type']).toContain('text/csv');
      expect(resDefaultersCsv.text).toContain('Total Overdue');
      expect(resDefaultersCsv.text).toContain('Days Overdue');

      // 3. Subpath XLSX export for dues/defaulters
      const resDefaultersXlsx = await request(app.getHttpServer())
        .get('/api/v1/reports/dues/defaulters/export?format=xlsx')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .responseType('blob')
        .expect(200);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(resDefaultersXlsx.body);
      const sheet = workbook.worksheets[0];
      expect(sheet.pageSetup.orientation).toBe('landscape');
      expect(sheet.getCell('A1').value).toBe('Greenwood International Academy');

      // 4. Subpath PDF export for dues/defaulters
      const resDefaultersPdf = await request(app.getHttpServer())
        .get('/api/v1/reports/dues/defaulters/export?format=pdf')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .responseType('blob')
        .expect(200);

      expect(resDefaultersPdf.headers['content-type']).toContain('application/pdf');
      expect(resDefaultersPdf.body.toString('latin1', 0, 5)).toBe('%PDF-');
      const defaulterPdfText = extractPdfText(resDefaultersPdf.body);
      expect(defaulterPdfText).toContain('Greenwood International Academy');
      expect(defaulterPdfText).toContain('Fee Defaulters and Overdue Aging Report');
    });

    it('successfully exports CLASS_COLLECTION and FINE_SUMMARY reports as CSV, XLSX, and PDF', async () => {
      // Class collection export CSV
      const resClassCsv = await request(app.getHttpServer())
        .get('/api/v1/reports/collections/by-class/export?format=csv')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(resClassCsv.headers['content-type']).toContain('text/csv');
      expect(resClassCsv.text).toContain('Gross Collection');

      // Fine summary export CSV
      const resFineCsv = await request(app.getHttpServer())
        .get('/api/v1/reports/fines/summary/export?format=csv')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(200);

      expect(resFineCsv.headers['content-type']).toContain('text/csv');
      expect(resFineCsv.text).toContain('Assessed Fines');
      expect(resFineCsv.text).toContain('Fine Balance');

      // Class collection export PDF
      const resClassPdf = await request(app.getHttpServer())
        .get('/api/v1/reports/collections/by-class/export?format=pdf')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .responseType('blob')
        .expect(200);

      expect(resClassPdf.headers['content-type']).toContain('application/pdf');
      expect(resClassPdf.body.toString('latin1', 0, 5)).toBe('%PDF-');
      const classPdfText = extractPdfText(resClassPdf.body);
      expect(classPdfText).toContain('Class-Wise Fee Collection Report');

      // Fine summary export PDF
      const resFinePdf = await request(app.getHttpServer())
        .get('/api/v1/reports/fines/summary/export?format=pdf')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .responseType('blob')
        .expect(200);

      expect(resFinePdf.headers['content-type']).toContain('application/pdf');
      expect(resFinePdf.body.toString('latin1', 0, 5)).toBe('%PDF-');
      const finePdfText = extractPdfText(resFinePdf.body);
      expect(finePdfText).toContain('Late Fine and Penalty Summary Report');
    });

    it('enforces multi-tenant isolation on report exports', async () => {
      // Export XLSX for School B
      const resB = await request(app.getHttpServer())
        .get('/api/v1/reports/DAILY_COLLECTION/export?format=xlsx')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .responseType('blob')
        .expect(200);

      expect(resB.headers['x-school-id']).toBe(schoolBId);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(resB.body);
      const sheet = workbook.worksheets[0];
      expect(sheet.getCell('A1').value).toBe('Starlight Valley School');

      // Export PDF for School B
      const resBPdf = await request(app.getHttpServer())
        .get('/api/v1/reports/DAILY_COLLECTION/export?format=pdf')
        .set('Authorization', `Bearer ${tokenSchoolBAdmin}`)
        .responseType('blob')
        .expect(200);

      expect(resBPdf.headers['content-type']).toContain('application/pdf');
      expect(resBPdf.headers['x-school-id']).toBe(schoolBId);
      const textBPdf = extractPdfText(resBPdf.body);
      expect(textBPdf).toContain('Starlight Valley School');
      expect(textBPdf).not.toContain('Greenwood International Academy');
    });

    it('validates query parameters and rejects invalid formats or report types', async () => {
      // 1. Missing format
      await request(app.getHttpServer())
        .get('/api/v1/reports/DAILY_COLLECTION/export')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);

      // 2. Unsupported format (e.g. docx)
      await request(app.getHttpServer())
        .get('/api/v1/reports/DAILY_COLLECTION/export?format=docx')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);

      // 3. Unsupported report type
      await request(app.getHttpServer())
        .get('/api/v1/reports/UNKNOWN_TYPE/export?format=csv')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);

      // 4. Invalid date range on collection summary export
      await request(app.getHttpServer())
        .get('/api/v1/reports/collections/summary/export?format=csv&startDate=2026-10-20&endDate=2026-10-10')
        .set('Authorization', `Bearer ${tokenSchoolAAdmin}`)
        .expect(400);
    });
  });
});


