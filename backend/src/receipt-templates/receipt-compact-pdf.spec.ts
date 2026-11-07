import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as zlib from 'zlib';
import {
  ReceiptArtifactService,
  ReceiptPdfOptions,
} from './receipt-artifact.service';
import {
  createSyntheticReceiptSnapshot,
  ReceiptSnapshot,
} from './fixtures/synthetic-receipt.fixture';
import { PaymentsService } from '../payments/payments.service';

describe('ReceiptCompactPdf — 3 Receipts Per A4 Page Optimization', () => {
  let service: ReceiptArtifactService;
  let mockPrisma: any;
  let mockDocxPopulationService: any;
  let mockStorageService: any;
  let mockPdfEngineService: any;

  beforeEach(() => {
    mockPrisma = {
      receiptArtifact: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    mockDocxPopulationService = {
      populateTemplate: jest.fn(),
    };
    mockStorageService = {
      storeReceiptArtifactPdf: jest.fn(),
      readReceiptArtifactPdf: jest.fn(),
    };
    mockPdfEngineService = {
      isEngineAvailable: jest.fn().mockResolvedValue(true),
      convertToPdf: jest.fn(),
    };

    service = new ReceiptArtifactService(
      mockPrisma,
      mockDocxPopulationService,
      mockStorageService,
      mockPdfEngineService,
    );
  });

  function parsePdf(buffer: Buffer): { pageCount: number; text: string } {
    const str = buffer.toString('latin1');
    const pageCountMatches = str.match(/\/Type\s*\/Page\b/g);
    const pageCount = pageCountMatches ? pageCountMatches.length : 0;

    let text = '';
    const regex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(str)) !== null) {
      const streamData = Buffer.from(match[1], 'latin1');
      let streamText = '';
      try {
        streamText = zlib.inflateSync(streamData).toString('latin1');
      } catch {
        streamText = streamData.toString('latin1');
      }

      // Match all TJ arrays: [ ... ] TJ
      const tjRegex = /\[([\s\S]*?)\]\s*TJ/g;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjRegex.exec(streamText)) !== null) {
        const inner = tjMatch[1];
        const hexRegex = /<([0-9a-fA-F]+)>/g;
        let hexMatch: RegExpExecArray | null;
        let tjText = '';
        while ((hexMatch = hexRegex.exec(inner)) !== null) {
          tjText += Buffer.from(hexMatch[1], 'hex').toString('latin1');
        }
        text += tjText + '\n';
      }

      // Match single hex Tj: <hex> Tj
      const tjSingleRegex = /<([0-9a-fA-F]+)>\s*Tj/g;
      let tjSingleMatch: RegExpExecArray | null;
      while ((tjSingleMatch = tjSingleRegex.exec(streamText)) !== null) {
        text += Buffer.from(tjSingleMatch[1], 'hex').toString('latin1') + '\n';
      }

      // Match plain text Tj: (text) Tj
      const tjPlainRegex = /\(([^)]+)\)\s*Tj/g;
      let tjPlainMatch: RegExpExecArray | null;
      while ((tjPlainMatch = tjPlainRegex.exec(streamText)) !== null) {
        text += tjPlainMatch[1] + '\n';
      }
    }

    return { pageCount, text };
  }

  function buildSyntheticReceipt(
    overrides?: Omit<Partial<ReceiptSnapshot>, 'student'> & {
      student?: Partial<ReceiptSnapshot['student']>;
      id?: string;
      schoolId?: string;
      status?: string;
      totalAmount?: number;
      itemCount?: number;
    },
  ) {
    const baseSnapshot = createSyntheticReceiptSnapshot({
      id: overrides?.schoolId || 'school-uuid-1',
      code: 'DPS_NORTH',
      name: 'Delhi Public Model School',
      city: 'North Campus, New Delhi',
    });

    const allocs = overrides?.allocations
      ? overrides.allocations
      : overrides?.itemCount !== undefined
      ? Array.from({ length: overrides.itemCount }, (_, i) => ({
          id: `alloc-${i + 1}`,
          invoiceId: 'inv-1',
          allocationType: 'PRINCIPAL',
          allocatedAmount: 1000 * (i + 1),
          feeHeadNameSnapshot: `Fee Obligation Head #${i + 1}`,
          period: 'Term 1',
        }))
      : baseSnapshot.allocations;

    const receiptNumber = overrides?.receiptNumber || baseSnapshot.receiptNumber;
    const totalAmount =
      overrides?.totalAmount !== undefined
        ? overrides.totalAmount
        : allocs.reduce((sum, it) => sum + it.allocatedAmount, 0);

    const snapshot: ReceiptSnapshot = {
      ...baseSnapshot,
      receiptNumber,
      allocations: allocs,
      amount: totalAmount,
      student: overrides?.student ? { ...baseSnapshot.student, ...overrides.student } : baseSnapshot.student,
      paymentMethod: overrides?.paymentMethod || baseSnapshot.paymentMethod,
    };

    return {
      id: overrides?.id || 'rcpt-uuid-1',
      schoolId: overrides?.schoolId || 'school-uuid-1',
      receiptNumber,
      receiptSequence: overrides?.sequenceNumber || 1,
      totalAmount,
      status: overrides?.status || 'ACTIVE',
      templateVersionId: null,
      receiptSnapshot: snapshot,
    };
  }

  describe('Core 3-per-page Pagination & Layout for Different Receipts', () => {
    it('fits three different existing receipts on 1 A4 page with distinct student and receipt details', async () => {
      const receipt1 = buildSyntheticReceipt({
        id: 'rcpt-1',
        receiptNumber: 'RCT-202627-00001',
        student: { fullName: 'Aarav Gupta', admissionNumber: 'DPS-G1-001', grade: 'Grade 1', section: 'A' },
        itemCount: 2,
      });
      const receipt2 = buildSyntheticReceipt({
        id: 'rcpt-2',
        receiptNumber: 'RCT-202627-00002',
        student: { fullName: 'Riya Sharma', admissionNumber: 'DPS-G1-002', grade: 'Grade 1', section: 'B' },
        itemCount: 2,
      });
      const receipt3 = buildSyntheticReceipt({
        id: 'rcpt-3',
        receiptNumber: 'RCT-202627-00003',
        student: { fullName: 'Kabir Mehta', admissionNumber: 'DPS-G10-001', grade: 'Grade 10', section: 'A' },
        itemCount: 2,
      });

      const pdfBuffer = await service.renderCompactReceiptsPdf([receipt1, receipt2, receipt3]);
      expect(pdfBuffer).toBeDefined();
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      const { pageCount, text } = parsePdf(pdfBuffer);
      expect(pageCount).toBe(1);

      // Verify all 3 DIFFERENT receipt numbers appear on page 1
      expect(text).toContain('RCT-202627-00001');
      expect(text).toContain('RCT-202627-00002');
      expect(text).toContain('RCT-202627-00003');

      // Verify all 3 DIFFERENT student names and admission numbers appear on page 1
      expect(text).toContain('Aarav Gupta');
      expect(text).toContain('DPS-G1-001');
      expect(text).toContain('Riya Sharma');
      expect(text).toContain('DPS-G1-002');
      expect(text).toContain('Kabir Mehta');
      expect(text).toContain('DPS-G10-001');

      // Verify cut lines separate the 3 distinct receipts
      expect(text).toContain('Cut Here');
    });

    it('paginates four receipts correctly onto exactly two pages (3 on page 1, 1 on page 2)', async () => {
      const receipts = [
        buildSyntheticReceipt({ receiptNumber: 'RCT-001', itemCount: 3 }),
        buildSyntheticReceipt({ receiptNumber: 'RCT-002', itemCount: 3 }),
        buildSyntheticReceipt({ receiptNumber: 'RCT-003', itemCount: 3 }),
        buildSyntheticReceipt({ receiptNumber: 'RCT-004', itemCount: 3 }),
      ];

      const pdfBuffer = await service.renderCompactReceiptsPdf(receipts);
      const { pageCount, text } = await parsePdf(pdfBuffer);
      expect(pageCount).toBe(2);

      expect(text).toContain('RCT-001');
      expect(text).toContain('RCT-002');
      expect(text).toContain('RCT-003');
      expect(text).toContain('RCT-004');
    });

    it('paginates six receipts correctly onto exactly two pages (3 on page 1, 3 on page 2)', async () => {
      const receipts = Array.from({ length: 6 }, (_, i) =>
        buildSyntheticReceipt({ receiptNumber: `RCT-00${i + 1}`, itemCount: 2 }),
      );

      const pdfBuffer = await service.renderCompactReceiptsPdf(receipts);
      const { pageCount, text } = await parsePdf(pdfBuffer);
      expect(pageCount).toBe(2);

      for (let i = 1; i <= 6; i++) {
        expect(text).toContain(`RCT-00${i}`);
      }
    });

    it('paginates seven receipts correctly onto exactly three pages (3 on page 1, 3 on page 2, 1 on page 3)', async () => {
      const receipts = Array.from({ length: 7 }, (_, i) =>
        buildSyntheticReceipt({ receiptNumber: `RCT-00${i + 1}`, itemCount: 2 }),
      );

      const pdfBuffer = await service.renderCompactReceiptsPdf(receipts);
      const { pageCount, text } = await parsePdf(pdfBuffer);
      expect(pageCount).toBe(3);

      for (let i = 1; i <= 7; i++) {
        expect(text).toContain(`RCT-00${i}`);
      }
    });

    it('renders a single compact receipt on 1 page without errors', async () => {
      const receipt = buildSyntheticReceipt({ receiptNumber: 'RCT-SINGLE-1', itemCount: 3 });
      const pdfBuffer = await service.renderCompactReceiptsPdf([receipt]);
      const { pageCount, text } = await parsePdf(pdfBuffer);

      expect(pageCount).toBe(1);
      expect(text).toContain('RCT-SINGLE-1');
      expect(text).toContain('Delhi Public Model School');
    });

    it('renders two compact receipts on 1 page with exactly one cut line', async () => {
      const receipts = [
        buildSyntheticReceipt({ receiptNumber: 'RCT-PAIR-1', itemCount: 2 }),
        buildSyntheticReceipt({ receiptNumber: 'RCT-PAIR-2', itemCount: 2 }),
      ];

      const pdfBuffer = await service.renderCompactReceiptsPdf(receipts);
      const { pageCount, text } = await parsePdf(pdfBuffer);

      expect(pageCount).toBe(1);
      expect(text).toContain('RCT-PAIR-1');
      expect(text).toContain('RCT-PAIR-2');
      expect(text).toContain('Cut Here');
    });
  });

  describe('Financial Line Items, Overflow Protection & Non-Truncation', () => {
    it('safely falls back to full-page mode for a receipt with 15 line items without truncating any items', async () => {
      const longReceipt = buildSyntheticReceipt({
        receiptNumber: 'RCT-LONG-15',
        itemCount: 15,
      });

      const pdfBuffer = await service.renderCompactReceiptsPdf([longReceipt]);
      const { pageCount, text } = await parsePdf(pdfBuffer);

      expect(pageCount).toBe(1);
      expect(text).toContain('RCT-LONG-15');

      // Verify all 15 line items exist in output (zero truncation)
      for (let i = 1; i <= 15; i++) {
        expect(text).toContain(`Fee Obligation Head #${i}`);
      }

      // Verify financial total is present and calculated accurately
      // sum(1000..15000) = 120,000.00
      expect(text).toContain('120000.00');
    });

    it('handles mixed batches where normal receipts compact to 3-per-page and long receipts fall back without clipping', async () => {
      const mixed = [
        buildSyntheticReceipt({ receiptNumber: 'RCT-MIX-1', itemCount: 3 }),
        buildSyntheticReceipt({ receiptNumber: 'RCT-MIX-LONG-15', itemCount: 15 }),
        buildSyntheticReceipt({ receiptNumber: 'RCT-MIX-3', itemCount: 3 }),
        buildSyntheticReceipt({ receiptNumber: 'RCT-MIX-4', itemCount: 3 }),
      ];

      const pdfBuffer = await service.renderCompactReceiptsPdf(mixed);
      const { pageCount, text } = await parsePdf(pdfBuffer);

      // Receipt 1 on page 1, Receipt 2 (long) on page 2, Receipts 3 & 4 on page 3 -> 3 pages total
      expect(pageCount).toBe(3);

      expect(text).toContain('RCT-MIX-1');
      expect(text).toContain('RCT-MIX-LONG-15');
      expect(text).toContain('RCT-MIX-3');
      expect(text).toContain('RCT-MIX-4');

      for (let i = 1; i <= 15; i++) {
        expect(text).toContain(`Fee Obligation Head #${i}`);
      }
    });
  });

  describe('Single-Receipt Options & Copies', () => {
    it('renders 3 copies (Student, Office, Accounts) on 1 page when copies: 3 is requested', async () => {
      const receipt = buildSyntheticReceipt({
        receiptNumber: 'RCT-COPY-TEST',
        itemCount: 2,
      });

      const pdfBuffer = await service.renderLegacyReceiptPdf(receipt, {
        layout: 'compact',
        copies: 3,
      });

      const { pageCount, text } = await parsePdf(pdfBuffer);
      expect(pageCount).toBe(1);

      expect(text).toContain('STUDENT COPY');
      expect(text).toContain('OFFICE COPY');
      expect(text).toContain('ACCOUNTS COPY');
      expect(text).toContain('RCT-COPY-TEST');
    });

    it('preserves legacy standard single-receipt PDF format when layout: "standard" is explicitly requested', async () => {
      const receipt = buildSyntheticReceipt({
        receiptNumber: 'RCT-LEGACY-STD',
        itemCount: 3,
      });

      const pdfBuffer = await service.renderLegacyReceiptPdf(receipt, {
        layout: 'standard',
      });

      const { pageCount, text } = await parsePdf(pdfBuffer);
      expect(pageCount).toBe(1);
      expect(text).toContain('OFFICIAL FEE RECEIPT');
      expect(text).toContain('RCT-LEGACY-STD');
      // Cut line should NOT be present in standard layout
      expect(text).not.toContain('Cut Here');
    });

    it('correctly formats and reflects CANCELLED status badge in receipt', async () => {
      const cancelledReceipt = buildSyntheticReceipt({
        receiptNumber: 'RCT-VOID-001',
        status: 'CANCELLED',
        itemCount: 2,
      });

      const pdfBuffer = await service.renderCompactReceiptsPdf([cancelledReceipt]);
      const { text } = await parsePdf(pdfBuffer);

      expect(text).toContain('STATUS: CANCELLED');
    });
  });

  describe('Reprinting & Data Immutability', () => {
    it('renders identical deterministic outputs for reprints without altering receipt numbers', async () => {
      const originalReceipt = buildSyntheticReceipt({
        receiptNumber: 'RCT-REPRINT-001',
        sequenceNumber: 42,
        itemCount: 3,
      });

      const firstRender = await service.getOrGenerateReceiptPdf('school-uuid-1', originalReceipt, {
        layout: 'compact',
      });
      const secondRender = await service.getOrGenerateReceiptPdf('school-uuid-1', originalReceipt, {
        layout: 'compact',
      });

      expect(firstRender.receiptNumber).toBe('RCT-REPRINT-001');
      expect(secondRender.receiptNumber).toBe('RCT-REPRINT-001');
      expect(firstRender.buffer.length).toBe(secondRender.buffer.length);
    });

    it('enforces tenant isolation and throws ForbiddenException on cross-tenant access', async () => {
      const receipt = buildSyntheticReceipt({
        schoolId: 'school-A',
        receiptNumber: 'RCT-A-001',
      });

      await expect(
        service.getOrGenerateReceiptPdf('school-B', receipt, { layout: 'compact' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('PaymentsService Batch Operations & Financial Safeguards', () => {
    let paymentsService: PaymentsService;
    let mockReceiptSeq: any;
    let mockReversalSeq: any;
    let mockFeeGen: any;
    let mockOutbox: any;

    const schoolA = 'school-alpha';
    const adminUser = {
      id: 'admin-1',
      schoolId: schoolA,
      role: UserRole.SCHOOL_ADMIN,
    };

    beforeEach(() => {
      mockReceiptSeq = {
        allocateNextReceiptNumber: jest.fn(),
      };
      mockReversalSeq = {
        allocateNextReversalNumber: jest.fn(),
      };
      mockFeeGen = {};
      mockOutbox = {};

      mockPrisma.payment = {
        create: jest.fn(),
      };
      mockPrisma.receipt = {
        create: jest.fn(),
        findUnique: jest.fn(),
      };

      paymentsService = new PaymentsService(
        mockPrisma,
        mockReceiptSeq,
        mockReversalSeq,
        mockFeeGen,
        mockOutbox,
        service,
      );
    });

    it('deduplicates duplicate receipt numbers deliberately and generates distinct sections', async () => {
      const receiptA = buildSyntheticReceipt({
        id: 'rcpt-a',
        schoolId: schoolA,
        receiptNumber: 'RCT-A',
        student: { fullName: 'Student Alpha' },
        itemCount: 2,
      });
      const receiptB = buildSyntheticReceipt({
        id: 'rcpt-b',
        schoolId: schoolA,
        receiptNumber: 'RCT-B',
        student: { fullName: 'Student Beta' },
        itemCount: 2,
      });

      mockPrisma.receipt.findUnique.mockImplementation(({ where }: any) => {
        if (where.schoolId_receiptNumber?.receiptNumber === 'RCT-A') return Promise.resolve(receiptA);
        if (where.schoolId_receiptNumber?.receiptNumber === 'RCT-B') return Promise.resolve(receiptB);
        return Promise.resolve(null);
      });

      // Pass duplicate 'RCT-A'
      const { buffer } = await paymentsService.downloadBatchReceiptsPdf(
        schoolA,
        adminUser,
        ['RCT-A', 'RCT-A', 'RCT-B', 'RCT-B'],
        { layout: 'compact' },
      );

      const { pageCount, text } = parsePdf(buffer);
      expect(pageCount).toBe(1);

      // Verify both unique receipts appear
      expect(text).toContain('RCT-A');
      expect(text).toContain('RCT-B');
      expect(text).toContain('Student Alpha');
      expect(text).toContain('Student Beta');

      // Verify NO new receipt numbers or sequence numbers were created
      expect(mockReceiptSeq.allocateNextReceiptNumber).not.toHaveBeenCalled();
      expect(mockPrisma.receipt.create).not.toHaveBeenCalled();
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('supports batch download by receiptIds and deduplicates ID list', async () => {
      const receipt1 = buildSyntheticReceipt({
        id: 'uuid-1',
        schoolId: schoolA,
        receiptNumber: 'RCT-ID-1',
        student: { fullName: 'First Student' },
        itemCount: 2,
      });
      const receipt2 = buildSyntheticReceipt({
        id: 'uuid-2',
        schoolId: schoolA,
        receiptNumber: 'RCT-ID-2',
        student: { fullName: 'Second Student' },
        itemCount: 2,
      });

      mockPrisma.receipt.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'uuid-1') return Promise.resolve(receipt1);
        if (where.id === 'uuid-2') return Promise.resolve(receipt2);
        return Promise.resolve(null);
      });

      const { buffer } = await paymentsService.downloadBatchReceiptsPdf(
        schoolA,
        adminUser,
        { receiptIds: ['uuid-1', 'uuid-2', 'uuid-1'] },
        { layout: 'compact' },
      );

      const { pageCount, text } = parsePdf(buffer);
      expect(pageCount).toBe(1);
      expect(text).toContain('RCT-ID-1');
      expect(text).toContain('RCT-ID-2');
      expect(text).toContain('First Student');
      expect(text).toContain('Second Student');
    });

    it('rejects cross-tenant receipt requests with NotFoundException without leaking data', async () => {
      mockPrisma.receipt.findUnique.mockResolvedValue(null);

      await expect(
        paymentsService.downloadBatchReceiptsPdf(
          schoolA,
          adminUser,
          ['RCT-OTHER-SCHOOL-999'],
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects empty batch requests with BadRequestException', async () => {
      await expect(
        paymentsService.downloadBatchReceiptsPdf(schoolA, adminUser, []),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
