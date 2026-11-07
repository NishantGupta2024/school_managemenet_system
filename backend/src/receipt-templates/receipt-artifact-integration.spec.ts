import { ForbiddenException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  AllocationType,
  AssessedFineStatus,
  GatewayEnvironment,
  GatewayStatus,
  InvoiceStatus,
  OnlinePaymentStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReceiptArtifactStatus,
  ReceiptStatus,
  ReceiptTemplateStatus,
  TemplateVersionStatus,
  UserRole,
} from '@prisma/client';
import { DocxPopulationService } from './docx-population.service';
import { ReceiptArtifactService } from './receipt-artifact.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentsController } from '../payments/payments.controller';
import { RazorpayWebhookService } from '../payments/razorpay-webhook.service';

describe('Receipt Artifact Integration (R1.28)', () => {
  const schoolAId = '00000000-0000-0000-0000-00000000000a';
  const schoolBId = '00000000-0000-0000-0000-00000000000b';
  const academicYearId = '00000000-0000-0000-0000-0000000000a1';
  const studentId = '00000000-0000-0000-0000-000000000051';
  const invoiceId = '00000000-0000-0000-0000-000000000061';
  const invoiceItemId = '00000000-0000-0000-0000-000000000062';
  const templateAId = '00000000-0000-0000-0000-000000000071';
  const versionA1Id = '00000000-0000-0000-0000-000000000072';

  const fixturePath = path.join(
    __dirname,
    'fixtures',
    'representative-receipt-template.docx',
  );
  const templateDocxBuffer = fs.readFileSync(fixturePath);
  const mockPdfBuffer = Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n'),
    Buffer.alloc(600, 0x20),
    Buffer.from('\n%%EOF\n'),
  ]);

  let docxPopulationService: DocxPopulationService;
  let mockStorageService: any;
  let mockPdfEngineService: any;

  beforeEach(() => {
    docxPopulationService = new DocxPopulationService();

    mockStorageService = {
      readTemplateDocx: jest.fn().mockResolvedValue(templateDocxBuffer),
      storeReceiptArtifactPdf: jest.fn().mockResolvedValue({
        storagePath: `receipt-artifacts/${schoolAId}/${academicYearId}/RCT-202627-00001.pdf`,
        checksumSha256: 'sha256-official-pdf',
        fileSize: mockPdfBuffer.length,
      }),
      readReceiptArtifactPdf: jest.fn().mockResolvedValue(mockPdfBuffer),
    };

    mockPdfEngineService = {
      isEngineAvailable: jest.fn().mockResolvedValue(true),
      convertToPdf: jest.fn().mockResolvedValue(mockPdfBuffer),
    };
  });

  function buildOfflineMocks(options?: {
    defaultReceiptTemplateId?: string | null;
    templateRecord?: any;
    versionRecord?: any;
  }) {
    const events: string[] = [];
    const hasTemplate = options?.defaultReceiptTemplateId !== undefined
      ? options.defaultReceiptTemplateId
      : templateAId;

    const schoolRecord = {
      id: schoolAId,
      code: 'SCH_A',
      name: 'Alpha High School',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      address: '10 Main Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      defaultReceiptTemplateId: hasTemplate,
    };

    const defaultTemplateRecord =
      options?.templateRecord !== undefined
        ? options.templateRecord
        : {
            id: templateAId,
            schoolId: schoolAId,
            status: ReceiptTemplateStatus.ACTIVE,
            activeVersionId: versionA1Id,
            activeVersion:
              options?.versionRecord !== undefined
                ? options.versionRecord
                : {
                    id: versionA1Id,
                    schoolId: schoolAId,
                    templateId: templateAId,
                    versionNumber: 1,
                    storagePath: `receipt-templates/${schoolAId}/${templateAId}/v1.docx`,
                    status: TemplateVersionStatus.ACTIVE,
                  },
          };

    let storedReceipt: any = null;
    let storedArtifact: any = null;

    const mockPrisma: any = {
      $transaction: jest.fn(async (cb: any) => {
        events.push('tx:start');
        const res = await cb(mockPrisma);
        events.push('tx:commit');
        return res;
      }),
      $queryRaw: jest.fn().mockResolvedValue([{ id: invoiceId }]),
      student: {
        findUnique: jest.fn().mockResolvedValue({
          id: studentId,
          schoolId: schoolAId,
          userId: 'student-user-1',
          admissionNumber: 'ADM-101',
          firstName: 'Rohan',
          lastName: 'Verma',
          grade: { name: 'Grade 8' },
          section: { name: 'B' },
        }),
      },
      academicYear: {
        findUnique: jest.fn().mockResolvedValue({
          id: academicYearId,
          schoolId: schoolAId,
          name: '2026-2027',
        }),
      },
      school: {
        findUnique: jest.fn().mockResolvedValue(schoolRecord),
      },
      receiptTemplate: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (
            defaultTemplateRecord &&
            where?.schoolId_id?.schoolId === defaultTemplateRecord.schoolId &&
            where?.schoolId_id?.id === defaultTemplateRecord.id
          ) {
            return defaultTemplateRecord;
          }
          return null;
        }),
      },
      receiptTemplateVersion: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          const ver = defaultTemplateRecord?.activeVersion;
          if (
            ver &&
            where?.schoolId_id?.schoolId === ver.schoolId &&
            where?.schoolId_id?.id === ver.id
          ) {
            return ver;
          }
          return null;
        }),
      },
      feeInvoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: invoiceId,
            schoolId: schoolAId,
            studentId,
            academicYearId,
            status: InvoiceStatus.DUE,
            netAmount: new Prisma.Decimal(2500),
            dueDate: new Date('2026-10-01T00:00:00.000Z'),
            billingMonth: 10,
            items: [
              {
                id: invoiceItemId,
                invoiceId,
                schoolId: schoolAId,
                feeHeadNameSnapshot: 'Term 2 Tuition Fee',
                netAmount: new Prisma.Decimal(2500),
                createdAt: new Date('2026-09-01T00:00:00.000Z'),
              },
            ],
            paymentAllocations: [],
            assessedFines: [],
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      payment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'pay-uuid-101',
          ...data,
        })),
      },
      paymentAllocation: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'alloc-uuid-101',
          ...data,
        })),
      },
      receipt: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          events.push('tx:receipt.create');
          storedReceipt = {
            id: 'rcpt-uuid-101',
            ...data,
            payment: {
              id: data.paymentId,
              studentId,
              student: {
                id: studentId,
                userId: 'student-user-1',
              },
              allocations: [],
            },
            academicYear: { id: academicYearId, name: '2026-2027' },
          };
          return storedReceipt;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (!storedReceipt) return null;
          if (where?.schoolId_id) {
            if (
              where.schoolId_id.schoolId === storedReceipt.schoolId &&
              where.schoolId_id.id === storedReceipt.id
            ) {
              return {
                ...storedReceipt,
                artifact: storedArtifact,
                templateVersion: defaultTemplateRecord?.activeVersion ?? null,
              };
            }
            return null;
          }
          if (where?.schoolId_receiptNumber) {
            if (
              where.schoolId_receiptNumber.schoolId === storedReceipt.schoolId &&
              where.schoolId_receiptNumber.receiptNumber ===
                storedReceipt.receiptNumber
            ) {
              return storedReceipt;
            }
            return null;
          }
          return null;
        }),
      },
      receiptArtifact: {
        findUnique: jest.fn().mockImplementation(async () => storedArtifact),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          if (storedArtifact) {
            throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
          }
          events.push('outside:artifact.create');
          storedArtifact = {
            id: 'artifact-uuid-101',
            ...data,
          };
          return storedArtifact;
        }),
        updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
          if (!storedArtifact) return { count: 0 };
          const matches = Object.entries(where).every(
            ([k, v]) => storedArtifact[k] === v,
          );
          if (!matches) return { count: 0 };
          events.push(`outside:artifact.update:${data.status}`);
          storedArtifact = { ...storedArtifact, ...data };
          return { count: 1 };
        }),
      },
      parentStudentRelation: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const mockReceiptSeq = {
      allocateNextReceiptNumber: jest.fn().mockResolvedValue({
        receiptNumber: 'RCT-202627-00001',
        sequenceNumber: 1,
      }),
    };

    const mockReversalSeq = {};
    const mockFeeGen = {
      reconcileAutomatedFinesForStudent: jest.fn().mockResolvedValue(undefined),
      deriveCurrentInvoiceStatus: jest.fn().mockReturnValue(InvoiceStatus.DUE),
    };
    const mockOutbox = {
      enqueueReceiptIssued: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    };

    return {
      mockPrisma,
      mockReceiptSeq,
      mockReversalSeq,
      mockFeeGen,
      mockOutbox,
      events,
      getStoredReceipt: () => storedReceipt,
      getStoredArtifact: () => storedArtifact,
      setStoredArtifact: (a: any) => {
        storedArtifact = a;
      },
    };
  }

  describe('1. Template Selection & Post-Transaction Artifact Generation (Offline & Online)', () => {
    it('selects active template version during offline payment collection and generates PDF outside the financial transaction', async () => {
      const ctx = buildOfflineMocks();
      const populateSpy = jest.spyOn(docxPopulationService, 'populateTemplate');
      mockPdfEngineService.convertToPdf.mockImplementation(async () => {
        ctx.events.push('outside:pdf.convert');
        return mockPdfBuffer;
      });

      const artifactService = new ReceiptArtifactService(
        ctx.mockPrisma,
        docxPopulationService,
        mockStorageService,
        mockPdfEngineService,
      );

      const paymentsService = new PaymentsService(
        ctx.mockPrisma,
        ctx.mockReceiptSeq as any,
        ctx.mockReversalSeq as any,
        ctx.mockFeeGen as any,
        ctx.mockOutbox as any,
        artifactService,
      );

      const staffUser = {
        id: 'staff-1',
        schoolId: schoolAId,
        name: 'Cashier Anita',
        role: UserRole.FEE_STAFF,
      };

      const result = await paymentsService.collectPayment(schoolAId, staffUser, {
        studentId,
        academicYearId,
        amount: 2500,
        paymentMethod: PaymentMethod.CASH,
      });

      // 1. Selected templateVersionId stored on Receipt
      expect(result.receipt.templateVersionId).toBe(versionA1Id);
      expect(ctx.mockPrisma.receipt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            schoolId: schoolAId,
            templateVersionId: versionA1Id,
          }),
        }),
      );

      // 2. Artifact generation ran strictly AFTER transaction committed (no financial locks held)
      expect(ctx.events).toEqual([
        'tx:start',
        'tx:receipt.create',
        'tx:commit',
        'outside:artifact.create',
        'outside:pdf.convert',
        'outside:artifact.update:READY',
      ]);

      // 3. Populated in OFFICIAL mode using the frozen receipt snapshot (never preview mode)
      expect(populateSpy).toHaveBeenCalledWith(
        templateDocxBuffer,
        expect.objectContaining({
          receiptNumber: 'RCT-202627-00001',
          amount: 2500,
        }),
        { isPreview: false, mode: 'OFFICIAL' },
      );

      // 4. Artifact status is READY
      const artifact = ctx.getStoredArtifact();
      expect(artifact.status).toBe(ReceiptArtifactStatus.READY);
      expect(artifact.generationAttempts).toBe(1);
      expect(artifact.checksumSha256).toBe('sha256-official-pdf');
    });

    it('selects active template version and generates artifact after verified Razorpay webhook settlement', async () => {
      const ctx = buildOfflineMocks();
      const testSecret = 'whsec_test_rzp_secret';
      const providerOrderId = 'order_rzp_999';
      const providerPaymentId = 'pay_rzp_999';

      ctx.mockPrisma.onlinePaymentOrder = {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ord-local-1',
          schoolId: schoolAId,
          studentId,
          invoiceId,
          academicYearId,
          providerOrderId,
          amount: new Prisma.Decimal(2500),
          currency: 'INR',
          status: OnlinePaymentStatus.CREATED,
          metadata: {},
        }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      };
      ctx.mockPrisma.feeInvoice.findUnique = jest.fn().mockResolvedValue({
        id: invoiceId,
        schoolId: schoolAId,
        studentId,
        academicYearId,
        netAmount: new Prisma.Decimal(2500),
        status: InvoiceStatus.DUE,
        items: [
          {
            id: invoiceItemId,
            feeHeadNameSnapshot: 'Term 2 Tuition Fee',
            netAmount: new Prisma.Decimal(2500),
          },
        ],
        paymentAllocations: [],
        assessedFines: [],
      });
      ctx.mockPrisma.$queryRaw = jest
        .fn()
        .mockResolvedValue([{ id: 'ord-local-1', status: OnlinePaymentStatus.CREATED }]);

      const mockGatewayConfig = {
        decryptCredentialsForInternalUse: jest.fn().mockResolvedValue({
          status: GatewayStatus.ACTIVE,
          environment: GatewayEnvironment.TEST,
          keyId: 'rzp_test_123',
          keySecret: 'secret_123',
          webhookSecret: testSecret,
        }),
      };

      const artifactService = new ReceiptArtifactService(
        ctx.mockPrisma,
        docxPopulationService,
        mockStorageService,
        mockPdfEngineService,
      );

      const webhookService = new RazorpayWebhookService(
        ctx.mockPrisma,
        mockGatewayConfig as any,
        ctx.mockReceiptSeq as any,
        artifactService,
      );

      const payloadObj = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: providerPaymentId,
              amount: 250000,
              currency: 'INR',
              status: 'captured',
              order_id: providerOrderId,
            },
          },
        },
      };
      const rawBody = JSON.stringify(payloadObj);
      const sig = crypto
        .createHmac('sha256', testSecret)
        .update(rawBody)
        .digest('hex');

      const res = await webhookService.handleWebhook(rawBody, sig);

      expect(res.status).toBe('success');
      expect(res.receiptNumber).toBe('RCT-202627-00001');
      expect(ctx.getStoredReceipt().templateVersionId).toBe(versionA1Id);
      expect(ctx.getStoredArtifact().status).toBe(ReceiptArtifactStatus.READY);

      // Webhook redelivery: order is already SUCCESS, so no second receipt/number is issued.
      ctx.mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'ord-local-1', status: OnlinePaymentStatus.SUCCESS, paymentId: 'pay-uuid-101' },
      ]);
      await webhookService.handleWebhook(rawBody, sig);
      expect(ctx.mockPrisma.receipt.create).toHaveBeenCalledTimes(1);
      expect(ctx.mockReceiptSeq.allocateNextReceiptNumber).toHaveBeenCalledTimes(1);
      expect(ctx.mockPrisma.payment.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Tenant Isolation & Cross-Tenant Template Rejection', () => {
    it('prevents a school from referencing another school template and falls back to null templateVersionId', async () => {
      // School A has defaultReceiptTemplateId pointing to a template owned by School B
      const crossTenantTemplate = {
        id: 'tpl-school-b',
        schoolId: schoolBId,
        status: ReceiptTemplateStatus.ACTIVE,
        activeVersionId: 'ver-school-b',
        activeVersion: {
          id: 'ver-school-b',
          schoolId: schoolBId,
          templateId: 'tpl-school-b',
          status: TemplateVersionStatus.ACTIVE,
        },
      };

      const ctx = buildOfflineMocks({
        defaultReceiptTemplateId: 'tpl-school-b',
        templateRecord: crossTenantTemplate,
      });

      const artifactService = new ReceiptArtifactService(
        ctx.mockPrisma,
        docxPopulationService,
        mockStorageService,
        mockPdfEngineService,
      );

      const paymentsService = new PaymentsService(
        ctx.mockPrisma,
        ctx.mockReceiptSeq as any,
        ctx.mockReversalSeq as any,
        ctx.mockFeeGen as any,
        ctx.mockOutbox as any,
        artifactService,
      );

      const adminA = {
        id: 'admin-a',
        schoolId: schoolAId,
        role: UserRole.SCHOOL_ADMIN,
      };

      const res = await paymentsService.collectPayment(schoolAId, adminA, {
        studentId,
        academicYearId,
        amount: 2500,
        paymentMethod: PaymentMethod.CASH,
      });

      expect(res.receipt.templateVersionId).toBeNull();
      expect(ctx.mockPrisma.receiptArtifact.create).not.toHaveBeenCalled();
      expect(mockPdfEngineService.convertToPdf).not.toHaveBeenCalled();
    });
  });

  describe('3. Failure Isolation, Safe Retry, and Artifact Idempotency', () => {
    it('does not roll back committed payment when PDF conversion fails, records FAILED status, and succeeds on retry without issuing a new receipt', async () => {
      const ctx = buildOfflineMocks();

      // First attempt: PDF engine throws unavailable error
      mockPdfEngineService.convertToPdf
        .mockRejectedValueOnce(new Error('PDF conversion engine offline'))
        .mockResolvedValueOnce(mockPdfBuffer);

      const artifactService = new ReceiptArtifactService(
        ctx.mockPrisma,
        docxPopulationService,
        mockStorageService,
        mockPdfEngineService,
      );

      const paymentsService = new PaymentsService(
        ctx.mockPrisma,
        ctx.mockReceiptSeq as any,
        ctx.mockReversalSeq as any,
        ctx.mockFeeGen as any,
        ctx.mockOutbox as any,
        artifactService,
      );

      const adminA = {
        id: 'admin-a',
        schoolId: schoolAId,
        role: UserRole.SCHOOL_ADMIN,
      };

      // 1. Payment collection succeeds despite PDF failure
      const payRes = await paymentsService.collectPayment(schoolAId, adminA, {
        studentId,
        academicYearId,
        amount: 2500,
        paymentMethod: PaymentMethod.CASH,
      });

      expect(payRes.payment.id).toBe('pay-uuid-101');
      expect(payRes.receipt.receiptNumber).toBe('RCT-202627-00001');
      expect(ctx.mockReceiptSeq.allocateNextReceiptNumber).toHaveBeenCalledTimes(1);

      const failedArtifact = ctx.getStoredArtifact();
      expect(failedArtifact.status).toBe(ReceiptArtifactStatus.FAILED);
      expect(failedArtifact.generationAttempts).toBe(1);
      expect(failedArtifact.failureReason).toContain('PDF conversion engine offline');

      // 2. Retry via downloadReceiptPdf recovers using original receipt & frozen snapshot
      const downloaded = await paymentsService.downloadReceiptPdf(
        schoolAId,
        adminA,
        'RCT-202627-00001',
      );

      expect(downloaded.buffer).toEqual(mockPdfBuffer);
      expect(downloaded.isLegacy).toBe(false);
      expect(downloaded.receiptNumber).toBe('RCT-202627-00001');

      // Same logical artifact row updated to READY on attempt 2
      const recoveredArtifact = ctx.getStoredArtifact();
      expect(recoveredArtifact.id).toBe('artifact-uuid-101');
      expect(recoveredArtifact.status).toBe(ReceiptArtifactStatus.READY);
      expect(recoveredArtifact.generationAttempts).toBe(2);
      expect(recoveredArtifact.failureReason).toBeNull();
      expect(ctx.mockPrisma.receiptArtifact.create).toHaveBeenCalledTimes(1);

      // Crucial: No new receipt number allocated and no new payment created
      expect(ctx.mockReceiptSeq.allocateNextReceiptNumber).toHaveBeenCalledTimes(1);
      expect(ctx.mockPrisma.payment.create).toHaveBeenCalledTimes(1);

      // 3. Subsequent reprint is idempotent: reuses READY artifact without re-running PDF conversion
      const reprint = await paymentsService.downloadReceiptPdf(
        schoolAId,
        adminA,
        'RCT-202627-00001',
      );
      expect(reprint.buffer).toEqual(mockPdfBuffer);
      expect(mockPdfEngineService.convertToPdf).toHaveBeenCalledTimes(2); // 1 failed + 1 retry; 0 on reprint
      expect(ctx.getStoredArtifact().generationAttempts).toBe(2);
      expect(ctx.mockReceiptSeq.allocateNextReceiptNumber).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. R1.29 Concurrency, Stability, Webhook Retry, and Download Headers', () => {
    async function issueFailedReceipt() {
      const ctx = buildOfflineMocks();
      mockPdfEngineService.convertToPdf.mockRejectedValueOnce(new Error('engine offline'));
      const artifactService = new ReceiptArtifactService(
        ctx.mockPrisma,
        docxPopulationService,
        mockStorageService,
        mockPdfEngineService,
      );
      const paymentsService = new PaymentsService(
        ctx.mockPrisma,
        ctx.mockReceiptSeq as any,
        ctx.mockReversalSeq as any,
        ctx.mockFeeGen as any,
        ctx.mockOutbox as any,
        artifactService,
      );
      const adminA = { id: 'admin-a', schoolId: schoolAId, role: UserRole.SCHOOL_ADMIN };
      await paymentsService.collectPayment(schoolAId, adminA, {
        studentId,
        academicYearId,
        amount: 2500,
        paymentMethod: PaymentMethod.CASH,
      });
      return { ctx, artifactService, paymentsService, adminA };
    }

    it('concurrent retries of a FAILED artifact convert once and never create a duplicate artifact row', async () => {
      const { ctx, artifactService } = await issueFailedReceipt();
      expect(ctx.getStoredArtifact().status).toBe(ReceiptArtifactStatus.FAILED);
      mockPdfEngineService.convertToPdf.mockClear();

      const [a, b] = await Promise.all([
        artifactService.ensureArtifactForReceipt(schoolAId, 'rcpt-uuid-101'),
        artifactService.ensureArtifactForReceipt(schoolAId, 'rcpt-uuid-101'),
      ]);

      expect(mockPdfEngineService.convertToPdf).toHaveBeenCalledTimes(1);
      expect(ctx.mockPrisma.receiptArtifact.create).toHaveBeenCalledTimes(1);
      expect(ctx.getStoredArtifact().status).toBe(ReceiptArtifactStatus.READY);
      expect(ctx.getStoredArtifact().generationAttempts).toBe(2);
      expect([a, b].some((r) => r?.status === ReceiptArtifactStatus.READY)).toBe(true);
    });

    it('does not start a second conversion while a fresh PENDING claim exists', async () => {
      const { ctx, artifactService } = await issueFailedReceipt();
      ctx.setStoredArtifact({
        ...ctx.getStoredArtifact(),
        status: ReceiptArtifactStatus.PENDING,
        lastAttemptAt: new Date(),
        storagePath: null,
      });
      mockPdfEngineService.convertToPdf.mockClear();

      const res = await artifactService.ensureArtifactForReceipt(schoolAId, 'rcpt-uuid-101');

      expect(res.status).toBe(ReceiptArtifactStatus.PENDING);
      expect(mockPdfEngineService.convertToPdf).not.toHaveBeenCalled();
    });

    it('a late failure can never overwrite an artifact that became READY', async () => {
      const { ctx, artifactService } = await issueFailedReceipt();
      mockPdfEngineService.convertToPdf.mockImplementationOnce(async () => {
        // Another worker completes successfully while this attempt is converting.
        ctx.setStoredArtifact({
          ...ctx.getStoredArtifact(),
          status: ReceiptArtifactStatus.READY,
          generationAttempts: 99,
          storagePath: 'receipt-artifacts/winner.pdf',
        });
        throw new Error('late failure');
      });

      const res = await artifactService.ensureArtifactForReceipt(schoolAId, 'rcpt-uuid-101');

      expect(res.status).toBe(ReceiptArtifactStatus.READY);
      expect(ctx.getStoredArtifact().storagePath).toBe('receipt-artifacts/winner.pdf');
      expect(ctx.getStoredArtifact().failureReason).not.toBe('late failure');
    });

    it('retry uses the receipt-pinned template version even after the school default changes', async () => {
      const { ctx, artifactService, paymentsService, adminA } = await issueFailedReceipt();
      const schoolLookupsBefore = ctx.mockPrisma.school.findUnique.mock.calls.length;
      // School later switches default template; receipt row must still point at v1.
      ctx.mockPrisma.school.findUnique.mockResolvedValue({
        id: schoolAId,
        defaultReceiptTemplateId: 'some-other-template',
      });

      await paymentsService.downloadReceiptPdf(schoolAId, adminA, 'RCT-202627-00001');

      expect(ctx.getStoredReceipt().templateVersionId).toBe(versionA1Id);
      expect(mockStorageService.readTemplateDocx).toHaveBeenLastCalledWith(
        `receipt-templates/${schoolAId}/${templateAId}/v1.docx`,
      );
      expect(ctx.mockPrisma.school.findUnique.mock.calls.length).toBe(schoolLookupsBefore);
      expect(artifactService).toBeDefined();
    });

    it('sets safe PDF headers and sanitizes the download filename', async () => {
      const controller = new PaymentsController(
        {
          downloadReceiptPdf: jest.fn().mockResolvedValue({
            buffer: mockPdfBuffer,
            fileName: 'RCT"\r\nX-Evil: 1.pdf',
            contentType: 'application/pdf',
          }),
        } as any,
        {} as any,
      );
      const res: any = { setHeader: jest.fn(), send: jest.fn() };

      await controller.downloadReceiptPdf(
        { school: { id: schoolAId }, user: { id: 'u', role: UserRole.SCHOOL_ADMIN } },
        'x',
        res,
      );

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="RCT___X-Evil__1.pdf"',
      );
    });
  });

  describe('4. Legacy Receipts (templateVersionId is null) & Reprint Authorization', () => {
    it('preserves legacy receipt issuance and renders legacy PDF on download when no template is active', async () => {
      const ctx = buildOfflineMocks({ defaultReceiptTemplateId: null });

      const artifactService = new ReceiptArtifactService(
        ctx.mockPrisma,
        docxPopulationService,
        mockStorageService,
        mockPdfEngineService,
      );

      const paymentsService = new PaymentsService(
        ctx.mockPrisma,
        ctx.mockReceiptSeq as any,
        ctx.mockReversalSeq as any,
        ctx.mockFeeGen as any,
        ctx.mockOutbox as any,
        artifactService,
      );

      const adminA = {
        id: 'admin-a',
        schoolId: schoolAId,
        role: UserRole.SCHOOL_ADMIN,
      };

      const payRes = await paymentsService.collectPayment(schoolAId, adminA, {
        studentId,
        academicYearId,
        amount: 2500,
        paymentMethod: PaymentMethod.CASH,
      });

      expect(payRes.receipt.templateVersionId).toBeNull();
      expect(ctx.mockPrisma.receiptArtifact.create).not.toHaveBeenCalled();
      expect(mockPdfEngineService.convertToPdf).not.toHaveBeenCalled();

      // Legacy PDF download renders from frozen snapshot without calling custom DOCX/PDF engine
      const legacyDownload = await paymentsService.downloadReceiptPdf(
        schoolAId,
        adminA,
        'RCT-202627-00001',
      );

      expect(legacyDownload.isLegacy).toBe(true);
      expect(legacyDownload.templateVersionId).toBeNull();
      expect(legacyDownload.fileName).toBe('RCT-202627-00001.pdf');
      expect(legacyDownload.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(mockPdfEngineService.convertToPdf).not.toHaveBeenCalled();
      expect(ctx.mockReceiptSeq.allocateNextReceiptNumber).toHaveBeenCalledTimes(1);
    });

    it('enforces student, parent, and tenant authorization rules on receipt PDF download controller endpoint', async () => {
      const ctx = buildOfflineMocks();
      const artifactService = new ReceiptArtifactService(
        ctx.mockPrisma,
        docxPopulationService,
        mockStorageService,
        mockPdfEngineService,
      );
      const paymentsService = new PaymentsService(
        ctx.mockPrisma,
        ctx.mockReceiptSeq as any,
        ctx.mockReversalSeq as any,
        ctx.mockFeeGen as any,
        ctx.mockOutbox as any,
        artifactService,
      );
      const controller = new PaymentsController(paymentsService, {} as any);

      const adminA = {
        id: 'admin-a',
        schoolId: schoolAId,
        role: UserRole.SCHOOL_ADMIN,
      };

      await paymentsService.collectPayment(schoolAId, adminA, {
        studentId,
        academicYearId,
        amount: 2500,
        paymentMethod: PaymentMethod.CASH,
      });

      const makeMockRes = () => ({
        setHeader: jest.fn(),
        send: jest.fn(),
      });

      // 1. Linked student succeeds
      const resStudentOk = makeMockRes();
      await controller.downloadReceiptPdf(
        {
          school: { id: schoolAId },
          user: { id: 'student-user-1', schoolId: schoolAId, role: UserRole.STUDENT },
        },
        'RCT-202627-00001',
        resStudentOk as any,
      );
      expect(resStudentOk.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(resStudentOk.send).toHaveBeenCalledWith(mockPdfBuffer);

      // 2. Unlinked student is rejected with ForbiddenException
      await expect(
        controller.downloadReceiptPdf(
          {
            school: { id: schoolAId },
            user: { id: 'other-student-user', schoolId: schoolAId, role: UserRole.STUDENT },
          },
          'RCT-202627-00001',
          makeMockRes() as any,
        ),
      ).rejects.toThrow(ForbiddenException);

      // 3. Unverified parent is rejected with ForbiddenException
      ctx.mockPrisma.parentStudentRelation.findFirst.mockResolvedValueOnce(null);
      await expect(
        controller.downloadReceiptPdf(
          {
            school: { id: schoolAId },
            user: { id: 'parent-user-1', schoolId: schoolAId, role: UserRole.PARENT },
          },
          'RCT-202627-00001',
          makeMockRes() as any,
        ),
      ).rejects.toThrow(ForbiddenException);

      // 4. Verified parent succeeds
      ctx.mockPrisma.parentStudentRelation.findFirst.mockResolvedValueOnce({
        id: 'rel-1',
        schoolId: schoolAId,
        parentId: 'parent-user-1',
        studentId,
        isVerified: true,
      });
      const resParentOk = makeMockRes();
      await controller.downloadReceiptPdf(
        {
          school: { id: schoolAId },
          user: { id: 'parent-user-1', schoolId: schoolAId, role: UserRole.PARENT },
        },
        'RCT-202627-00001',
        resParentOk as any,
      );
      expect(resParentOk.send).toHaveBeenCalledWith(mockPdfBuffer);

      // 5. Cross-tenant school query is rejected with NotFoundException
      await expect(
        controller.downloadReceiptPdf(
          {
            school: { id: schoolBId },
            user: { id: 'admin-b', schoolId: schoolBId, role: UserRole.SCHOOL_ADMIN },
          },
          'RCT-202627-00001',
          makeMockRes() as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
