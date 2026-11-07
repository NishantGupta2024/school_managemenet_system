import { Test, TestingModule } from '@nestjs/testing';
import { AcademicYearFormat, AllocationType, PaymentMethod, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { ReceiptSequenceService } from './receipt-sequence.service';
import { ReceiptNumberingService } from './receipt-numbering.service';
import { PaymentsService, SAFE_RECEIPT_SELECT } from './payments.service';
import { NotificationOutboxService } from '../notifications/outbox/notification-outbox.service';
import { FeeGenerationService } from '../fee-generation/fee-generation.service';
import { ReversalSequenceService } from './reversal-sequence.service';
import {
  ISO_SCHOOL_ID,
  ISO_AY_ID,
  ISO_STUDENT_ID,
  ISO_ADMIN_USER_ID,
  ISO_ADMIN_EMAIL,
} from '../../scripts/seed-iso-test-tenant';

const { checkDatabaseTarget, resolveDatabaseUrl } = require('../../scripts/preflight-db-check');

describe('Isolated Staging Validation — Custom Receipt Numbering on fee_iso_test', () => {
  let prisma: PrismaService;
  let receiptSequenceService: ReceiptSequenceService;
  let receiptNumberingService: ReceiptNumberingService;
  let paymentsService: PaymentsService;
  let moduleRef: TestingModule;

  const testAdminUser = {
    id: ISO_ADMIN_USER_ID,
    schoolId: ISO_SCHOOL_ID,
    email: ISO_ADMIN_EMAIL,
    name: 'ISO Test School Admin',
    role: UserRole.SCHOOL_ADMIN,
  };

  beforeAll(async () => {
    // 1. Mandatory Fail-Closed Preflight Target Guard
    const { url } = resolveDatabaseUrl();
    const targetCheck = checkDatabaseTarget(url);

    if (!targetCheck.ok || targetCheck.dbName !== 'fee_iso_test') {
      throw new Error(
        `[SECURITY HALT] iso-staging-validation spec requires target database 'fee_iso_test' on localhost, but detected '${targetCheck.dbName}'. Aborting test execution to protect fee_dev and production.`,
      );
    }

    // 2. Instantiate and connect real Prisma Service
    prisma = new PrismaService();
    await prisma.$connect();

    // 3. Confirm connected database identity via SQL query
    const dbIdentity = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() as db`;
    const connectedDb = dbIdentity[0]?.db;

    if (connectedDb !== 'fee_iso_test') {
      throw new Error(
        `[SECURITY HALT] Connected database identity is '${connectedDb}', which does not match required 'fee_iso_test'. Execution halted.`,
      );
    }

    // 4. Build Testing Module with real sequence and payment services, mocking only external outbox
    moduleRef = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: prisma },
        TenantContextService,
        ReceiptSequenceService,
        ReceiptNumberingService,
        PaymentsService,
        {
          provide: NotificationOutboxService,
          useValue: {
            enqueueReceiptIssued: jest.fn().mockResolvedValue(true),
            enqueuePaymentReversed: jest.fn().mockResolvedValue(true),
            enqueueRefundSucceeded: jest.fn().mockResolvedValue(true),
            enqueueRefundFailed: jest.fn().mockResolvedValue(true),
          },
        },
        { provide: FeeGenerationService, useValue: {} },
        { provide: ReversalSequenceService, useValue: {} },
      ],
    }).compile();

    receiptSequenceService = moduleRef.get<ReceiptSequenceService>(ReceiptSequenceService);
    receiptNumberingService = moduleRef.get<ReceiptNumberingService>(ReceiptNumberingService);
    paymentsService = moduleRef.get<PaymentsService>(PaymentsService);
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('verifies test tenant presence in fee_iso_test', async () => {
    const school = await prisma.school.findUnique({ where: { id: ISO_SCHOOL_ID } });
    expect(school).toBeDefined();
    expect(school?.id).toBe(ISO_SCHOOL_ID);

    const academicYear = await prisma.academicYear.findUnique({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_AY_ID } },
    });
    expect(academicYear).toBeDefined();
    expect(academicYear?.id).toBe(ISO_AY_ID);

    const student = await prisma.student.findUnique({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_STUDENT_ID } },
    });
    expect(student).toBeDefined();
  });

  it('executes full custom receipt numbering lifecycle with dynamic calculations and historical immutability', async () => {
    const academicYear = await prisma.academicYear.findUniqueOrThrow({
      where: { schoolId_id: { schoolId: ISO_SCHOOL_ID, id: ISO_AY_ID } },
    });

    // STEP 1: Inspect baseline sequence dynamically (no hardcoded assumption)
    const baselineStatus = await receiptSequenceService.getCurrentSequence({
      schoolId: ISO_SCHOOL_ID,
      academicYearId: ISO_AY_ID,
      user: testAdminUser,
    });
    const baselineNextSeq = baselineStatus.nextSequence;
    expect(baselineNextSeq).toBeGreaterThanOrEqual(1);

    // STEP 2: Configure School Receipt Numbering — Scenario A: Year-Token Enabled (SHORT_6DIGIT)
    const prefixA = 'DPMS';
    const yearFormatA = AcademicYearFormat.SHORT_6DIGIT;
    const paddingA = 5;
    const separatorA = '-';

    await receiptNumberingService.updateConfig(testAdminUser, {
      prefix: prefixA,
      yearFormat: yearFormatA,
      paddingDigits: paddingA,
      separator: separatorA,
    });

    const configAfterA = await receiptNumberingService.getConfig(testAdminUser);
    expect(configAfterA.prefix).toBe(prefixA);
    expect(configAfterA.yearFormat).toBe(yearFormatA);
    expect(configAfterA.paddingDigits).toBe(paddingA);
    expect(configAfterA.separator).toBe(separatorA);

    // Dynamically calculate expected values for Payment 1
    const expectedSeq1 = baselineNextSeq;
    const yearTokenA = receiptSequenceService.formatAcademicYearToken(academicYear.name, yearFormatA);
    const expectedReceiptNumber1 = receiptSequenceService.formatReceiptNumber({
      prefix: prefixA,
      yearToken: yearTokenA,
      sequenceNumber: expectedSeq1,
      paddingDigits: paddingA,
      separator: separatorA,
    });
    const expectedPaymentNumber1 = `PAY-${yearTokenA}-${String(expectedSeq1).padStart(5, '0')}`;

    // STEP 3: Collect Payment 1
    const payment1Result = await paymentsService.collectPayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      {
        studentId: ISO_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        amount: 150.0,
        paymentMethod: PaymentMethod.CASH,
        notes: 'Isolated Staging Test Payment 1',
      },
      'idemp-iso-test-payment-1-' + Date.now(),
    );

    expect(payment1Result.payment).toBeDefined();
    expect(payment1Result.receipt).toBeDefined();

    // Verify Payment 1 Receipt Number & Sequence match dynamically calculated expectations
    expect(payment1Result.receipt.receiptNumber).toBe(expectedReceiptNumber1);
    expect(payment1Result.receipt.receiptSequence).toBe(expectedSeq1);

    // Verify decoupled paymentNumber (remains PAY-<token>-<seq> for 100% backward compatibility)
    expect(payment1Result.payment.paymentNumber).toBe(expectedPaymentNumber1);
    expect(payment1Result.payment.paymentNumber).not.toContain(prefixA);

    // Verify Receipt Snapshot stored in database matches expectations
    const receipt1Db = await prisma.receipt.findUniqueOrThrow({
      where: { id: payment1Result.receipt.id },
      select: SAFE_RECEIPT_SELECT,
    });
    expect(receipt1Db.receiptNumber).toBe(expectedReceiptNumber1);
    const snapshot1 = receipt1Db.receiptSnapshot as any;
    expect(snapshot1.receiptNumber).toBe(expectedReceiptNumber1);
    expect(snapshot1.sequenceNumber).toBe(expectedSeq1);
    expect(snapshot1.paymentNumber).toBe(expectedPaymentNumber1);

    // STEP 4: Reconfigure School Receipt Numbering — Scenario B: Year Token Disabled (NONE) with Delimiter '/'
    const prefixB = 'ABC';
    const yearFormatB = AcademicYearFormat.NONE;
    const paddingB = 6;
    const separatorB = '/';

    await receiptNumberingService.updateConfig(testAdminUser, {
      prefix: prefixB,
      yearFormat: yearFormatB,
      paddingDigits: paddingB,
      separator: separatorB,
    });

    const configAfterB = await receiptNumberingService.getConfig(testAdminUser);
    expect(configAfterB.prefix).toBe(prefixB);
    expect(configAfterB.yearFormat).toBe(yearFormatB);
    expect(configAfterB.paddingDigits).toBe(paddingB);
    expect(configAfterB.separator).toBe(separatorB);

    // Dynamically calculate expected values for Payment 2
    const expectedSeq2 = baselineNextSeq + 1;
    const yearTokenB = receiptSequenceService.formatAcademicYearToken(academicYear.name, yearFormatB);
    expect(yearTokenB).toBe(''); // AcademicYearFormat.NONE produces empty year token

    const expectedReceiptNumber2 = receiptSequenceService.formatReceiptNumber({
      prefix: prefixB,
      yearToken: yearTokenB,
      sequenceNumber: expectedSeq2,
      paddingDigits: paddingB,
      separator: separatorB,
    });
    // Expected format e.g. "ABC/000002" (no double slashes, padded to 6)
    expect(expectedReceiptNumber2).toBe(`${prefixB}${separatorB}${String(expectedSeq2).padStart(paddingB, '0')}`);

    // STEP 5: Collect Payment 2
    const payment2Result = await paymentsService.collectPayment(
      ISO_SCHOOL_ID,
      testAdminUser,
      {
        studentId: ISO_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        amount: 250.0,
        paymentMethod: PaymentMethod.CASH,
        notes: 'Isolated Staging Test Payment 2',
      },
      'idemp-iso-test-payment-2-' + Date.now(),
    );

    expect(payment2Result.payment).toBeDefined();
    expect(payment2Result.receipt).toBeDefined();

    // Verify Payment 2 Receipt Number matches Scenario B calculations
    expect(payment2Result.receipt.receiptNumber).toBe(expectedReceiptNumber2);
    expect(payment2Result.receipt.receiptSequence).toBe(expectedSeq2);
    expect(payment2Result.receipt.receiptSequence).toBe(payment1Result.receipt.receiptSequence + 1);

    // Verify Payment 2 Snapshot stored in database
    const receipt2Db = await prisma.receipt.findUniqueOrThrow({
      where: { id: payment2Result.receipt.id },
      select: SAFE_RECEIPT_SELECT,
    });
    expect(receipt2Db.receiptNumber).toBe(expectedReceiptNumber2);
    const snapshot2 = receipt2Db.receiptSnapshot as any;
    expect(snapshot2.receiptNumber).toBe(expectedReceiptNumber2);
    expect(snapshot2.sequenceNumber).toBe(expectedSeq2);

    // STEP 6: Historical Snapshot Immutability (Non-Retroactivity Guard)
    // Verify that reconfiguring to 'ABC' / 'NONE' has NOT modified Payment 1's receipt or snapshot
    const receipt1Recheck = await prisma.receipt.findUniqueOrThrow({
      where: { id: payment1Result.receipt.id },
      select: SAFE_RECEIPT_SELECT,
    });
    expect(receipt1Recheck.receiptNumber).toBe(expectedReceiptNumber1);
    expect(receipt1Recheck.receiptSequence).toBe(expectedSeq1);
    const recheckedSnapshot1 = receipt1Recheck.receiptSnapshot as any;
    expect(recheckedSnapshot1.receiptNumber).toBe(expectedReceiptNumber1);
    expect(recheckedSnapshot1.sequenceNumber).toBe(expectedSeq1);
    expect(recheckedSnapshot1.receiptNumber).toContain(prefixA);
    expect(recheckedSnapshot1.receiptNumber).not.toContain(prefixB);

    // STEP 7: Verify final sequence status reflects exactly 2 allocations
    const finalStatus = await receiptSequenceService.getCurrentSequence({
      schoolId: ISO_SCHOOL_ID,
      academicYearId: ISO_AY_ID,
      user: testAdminUser,
    });
    expect(finalStatus.currentSequence).toBe(expectedSeq2);
    expect(finalStatus.nextSequence).toBe(expectedSeq2 + 1);
  });
});
