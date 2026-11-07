import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import {
  DocxPopulationService,
  SAMPLE_PREVIEW_WATERMARK,
} from './docx-population.service';
import { DocxValidatorService } from './docx-validator.service';
import { createInMemoryZip } from './test-helpers';
import {
  createSyntheticReceiptSnapshot,
  ReceiptSnapshot,
} from './fixtures/synthetic-receipt.fixture';

describe('DocxPopulationService', () => {
  let service: DocxPopulationService;
  let validator: DocxValidatorService;

  beforeEach(() => {
    service = new DocxPopulationService();
    validator = new DocxValidatorService();
  });

  describe('Synthetic ZIP unit tests', () => {
    const buildSyntheticZipTemplate = () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Receipt: {receipt.number}</w:t></w:r></w:p>
    <w:p><w:r><w:t>School: {school.name}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Student: {student.fullName}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Amount: {payment.amount}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Principal: {totalPrincipal} | Fines: {totalFines} | Allocated: {totalAllocated}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Words: {payment.amountInWords}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Notes: {payment.notes}</w:t></w:r></w:p>
    <w:p><w:r><w:t>WatermarkToken: {watermark}</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{#allocations}{index}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{feeHead}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{amount}{/allocations}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

      const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

      return createInMemoryZip([
        { filename: '[Content_Types].xml', content: contentTypesXml },
        { filename: 'word/document.xml', content: documentXml },
      ]);
    };

    it('populates placeholders, repeats allocation rows, and injects watermark banner in PREVIEW mode', () => {
      const zipBuffer = buildSyntheticZipTemplate();
      const snapshot = createSyntheticReceiptSnapshot();
      const populated = service.populateTemplate(zipBuffer, snapshot, {
        isPreview: true,
      });

      expect(populated).toBeDefined();
      expect(populated.length).toBeGreaterThan(0);

      const zip = new PizZip(populated);
      const populatedXml = zip.file('word/document.xml')!.asText();

      expect(populatedXml).toContain('Receipt: RCT-202627-SAMPLE');
      expect(populatedXml).toContain('Student: Aarav Sharma');
      expect(populatedXml).toContain('Amount: 8000.00');
      expect(populatedXml).toContain('Principal: 7500.00 | Fines: 500.00 | Allocated: 8000.00');
      expect(populatedXml).toContain(`*** ${SAMPLE_PREVIEW_WATERMARK} ***`);
      expect(populatedXml).toContain(`WatermarkToken: ${SAMPLE_PREVIEW_WATERMARK}`);

      expect(populatedXml).toContain('Tuition Fee (Q3)');
      expect(populatedXml).toContain('6000.00');
      expect(populatedXml).toContain('Laboratory &amp; Computer Fee');
      expect(populatedXml).toContain('1500.00');
      expect(populatedXml).toContain('Late Payment Fine');
      expect(populatedXml).toContain('500.00');

      expect(populatedXml).not.toContain('{receipt.number}');
      expect(populatedXml).not.toContain('{#allocations}');
    });

    it('omits preview watermark banner and token in OFFICIAL mode (default and explicit)', () => {
      const zipBuffer = buildSyntheticZipTemplate();
      const snapshot = createSyntheticReceiptSnapshot();

      const populatedDefault = service.populateTemplate(zipBuffer, snapshot);
      const populatedExplicit = service.populateTemplate(zipBuffer, snapshot, {
        isPreview: false,
      });

      for (const buf of [populatedDefault, populatedExplicit]) {
        const zip = new PizZip(buf);
        const xml = zip.file('word/document.xml')!.asText();

        expect(xml).not.toContain(SAMPLE_PREVIEW_WATERMARK);
        expect(xml).not.toContain('SAMPLE PREVIEW');
        expect(xml).toContain('WatermarkToken: </w:t>');
        expect(xml).toContain('Receipt: RCT-202627-SAMPLE');
        expect(xml).toContain('Amount: 8000.00');
        expect(xml).toContain('Principal: 7500.00 | Fines: 500.00 | Allocated: 8000.00');
      }
    });

    it('populates alias tags like {{#feeItems}} and {{payment.totalAmount}}', () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Receipt: {{receipt.issueDate}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total: {{payment.totalAmount}}</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{{#feeItems}}{{feeHead}} - {{amount}}{{/feeItems}}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

      const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

      const zipBuffer = createInMemoryZip([
        { filename: '[Content_Types].xml', content: contentTypesXml },
        { filename: 'word/document.xml', content: documentXml },
      ]);

      const snapshot = createSyntheticReceiptSnapshot();
      const populated = service.populateTemplate(zipBuffer, snapshot, {
        isPreview: false,
      });

      const zip = new PizZip(populated);
      const populatedXml = zip.file('word/document.xml')!.asText();

      expect(populatedXml).toContain('Total: 8000.00');
      expect(populatedXml).toContain('Tuition Fee (Q3) - 6000.00');
      expect(populatedXml).not.toContain('{{payment.totalAmount}}');
      expect(populatedXml).not.toContain(SAMPLE_PREVIEW_WATERMARK);
    });

    it('rejects empty or corrupt docx buffer or missing snapshot', () => {
      expect(() =>
        service.populateTemplate(Buffer.alloc(0), createSyntheticReceiptSnapshot()),
      ).toThrow(/Template DOCX buffer is empty/);

      expect(() =>
        service.populateTemplate(buildSyntheticZipTemplate(), null as any),
      ).toThrow(/Receipt snapshot is required/);
    });
  });

  describe('Real OpenXML DOCX fixture validation and population (representative-receipt-template.docx)', () => {
    const fixturePath = path.join(
      __dirname,
      'fixtures',
      'representative-receipt-template.docx',
    );
    let realDocxBuffer: Buffer;

    beforeAll(() => {
      realDocxBuffer = fs.readFileSync(fixturePath);
    });

    it('passes full security, structure, and placeholder validation on the real DOCX fixture', () => {
      const validation = validator.validateDocx(
        realDocxBuffer,
        'representative-receipt-template.docx',
      );
      expect(validation.isValid).toBe(true);
      expect(validation.diagnostics.errors).toHaveLength(0);
      expect(validation.diagnostics.hasRepeatingAllocations).toBe(true);
    });

    it('populates the real DOCX fixture in PREVIEW mode with sample watermark in body and footer', () => {
      const snapshot = createSyntheticReceiptSnapshot();
      const populated = service.populateTemplate(realDocxBuffer, snapshot, {
        isPreview: true,
      });

      const zip = new PizZip(populated);
      const docXml = zip.file('word/document.xml')!.asText();
      const headerXml = zip.file('word/header1.xml')!.asText();
      const footerXml = zip.file('word/footer1.xml')!.asText();

      // Watermark present in preview mode
      expect(docXml).toContain(`*** ${SAMPLE_PREVIEW_WATERMARK} ***`);
      expect(footerXml).toContain(SAMPLE_PREVIEW_WATERMARK);

      // Header & footer populated
      expect(headerXml).toContain('Sample Educational Academy (SCH_SAMPLE)');
      expect(footerXml).toContain('Collected By: Administrator (SCHOOL_ADMIN)');

      // Repeating table rows expanded (1 header row + 3 allocation rows = 4 <w:tr> rows)
      const tableRows = docXml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) || [];
      expect(tableRows).toHaveLength(4);
    });

    it('populates the real DOCX fixture in OFFICIAL mode with synthetic receipt data and zero preview watermark', () => {
      const snapshot = createSyntheticReceiptSnapshot();
      const populated = service.populateTemplate(realDocxBuffer, snapshot, {
        isPreview: false,
      });

      const zip = new PizZip(populated);
      const docXml = zip.file('word/document.xml')!.asText();
      const headerXml = zip.file('word/header1.xml')!.asText();
      const footerXml = zip.file('word/footer1.xml')!.asText();

      // 1. Preview watermark NEVER appears in official output
      expect(docXml).not.toContain(SAMPLE_PREVIEW_WATERMARK);
      expect(docXml).not.toContain('SAMPLE PREVIEW');
      expect(headerXml).not.toContain('SAMPLE PREVIEW');
      expect(footerXml).not.toContain('SAMPLE PREVIEW');

      // 2. Populated official amounts match supplied synthetic receipt data
      expect(docXml).toContain('Receipt No: RCT-202627-SAMPLE (Seq #1)');
      expect(docXml).toContain('Student: Aarav Sharma | Admission No: ADM-2026-SAMPLE | Class: Grade 10 Section A');
      expect(docXml).toContain('Principal Total: 7500.00 | Fines Total: 500.00 | Allocated Total: 8000.00');
      expect(docXml).toContain('Grand Total Paid: 8000.00 (8000.00)');
      expect(docXml).toContain('Amount in Words: Eight Thousand Rupees Only');
      expect(docXml).toContain('Remarks: Quarter 3 Fee Installment');

      // 3. Repeating fee rows are populated as separate table rows
      const tableRows = docXml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) || [];
      expect(tableRows).toHaveLength(4);
      expect(tableRows[1]).toContain('Tuition Fee (Q3)');
      expect(tableRows[1]).toContain('6000.00');
      expect(tableRows[2]).toContain('Laboratory &amp; Computer Fee');
      expect(tableRows[2]).toContain('1500.00');
      expect(tableRows[3]).toContain('Late Payment Fine');
      expect(tableRows[3]).toContain('500.00');
    });

    it('derives all official amounts, totals, words, and absent fields strictly from custom receipt data without hardcoded values', () => {
      const customOfficialSnapshot: ReceiptSnapshot = {
        receiptNumber: 'RCT-202627-00412',
        sequenceNumber: 412,
        paymentNumber: 'PAY-202627-00412',
        paymentDate: '2026-10-15T09:15:00.000Z',
        amount: 14750.5,
        paymentMethod: 'NEFT',
        referenceNumber: 'NEFT-UTR-88442211',
        chequeNumber: null,
        chequeDate: null,
        bankName: null,
        notes: null,
        chequeDisclaimer: null,
        school: {
          id: 'sch-live-01',
          code: 'KV_BLR',
          name: 'National Public Vidyalaya',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          address: null,
          city: 'Mysuru',
          state: 'Karnataka',
        },
        student: {
          id: 'stu-live-01',
          admissionNumber: 'NPV-2024-089',
          firstName: 'Meera',
          lastName: 'Nair',
          fullName: 'Meera Nair',
          grade: null,
          section: null,
        },
        academicYear: {
          id: 'ay-2026-27',
          name: '2026-2027',
        },
        allocations: [
          {
            id: 'alloc-1',
            invoiceId: 'inv-101',
            invoiceItemId: 'item-101',
            assessedFineId: null,
            allocationType: 'PRINCIPAL',
            allocatedAmount: 9500.0,
            feeHeadNameSnapshot: 'Annual Tuition Fee',
          },
          {
            id: 'alloc-2',
            invoiceId: 'inv-101',
            invoiceItemId: 'item-102',
            assessedFineId: null,
            allocationType: 'PRINCIPAL',
            allocatedAmount: 3200.5,
            feeHeadNameSnapshot: 'Science Lab Fee',
          },
          {
            id: 'alloc-3',
            invoiceId: 'inv-101',
            invoiceItemId: 'item-103',
            assessedFineId: null,
            allocationType: 'PRINCIPAL',
            allocatedAmount: 1800.0,
            feeHeadNameSnapshot: 'Library & Sports Fee',
          },
          {
            id: 'alloc-4',
            invoiceId: 'inv-101',
            invoiceItemId: null,
            assessedFineId: 'fine-101',
            allocationType: 'FINE',
            allocatedAmount: 250.0,
            feeHeadNameSnapshot: 'Overdue Installment Fine',
          },
        ],
        collector: null,
        issuedAt: '2026-10-15T09:15:30.000Z',
      };

      const populated = service.populateTemplate(
        realDocxBuffer,
        customOfficialSnapshot,
        { mode: 'OFFICIAL' },
      );

      const zip = new PizZip(populated);
      const docXml = zip.file('word/document.xml')!.asText();
      const footerXml = zip.file('word/footer1.xml')!.asText();

      // Verify derived totals and words
      expect(docXml).toContain('Receipt No: RCT-202627-00412 (Seq #412)');
      expect(docXml).toContain('Principal Total: 14500.50 | Fines Total: 250.00 | Allocated Total: 14750.50');
      expect(docXml).toContain('Grand Total Paid: 14750.50 (14750.50)');
      expect(docXml).toContain(
        'Amount in Words: Fourteen Thousand Seven Hundred Fifty Rupees and Fifty Paise Only',
      );

      // Verify 4 repeating allocation rows + 1 header row = 5 <w:tr> rows
      const tableRows = docXml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) || [];
      expect(tableRows).toHaveLength(5);
      expect(tableRows[1]).toContain('Annual Tuition Fee');
      expect(tableRows[1]).toContain('9500.00');
      expect(tableRows[2]).toContain('Science Lab Fee');
      expect(tableRows[2]).toContain('3200.50');
      expect(tableRows[3]).toContain('Library &amp; Sports Fee');
      expect(tableRows[3]).toContain('1800.00');
      expect(tableRows[4]).toContain('Overdue Installment Fine');
      expect(tableRows[4]).toContain('250.00');

      // Verify no hardcoded sample values or invented collector/notes
      expect(docXml).not.toContain('8000.00');
      expect(docXml).not.toContain('Principal Total: 6000.00');
      expect(docXml).not.toContain('Fines Total: 500.00');
      expect(docXml).not.toContain('Eight Thousand');
      expect(docXml).not.toContain('SAMPLE PREVIEW');
      expect(footerXml).not.toContain('Administrator');
      expect(footerXml).not.toContain('SCHOOL_ADMIN');
      expect(footerXml).toContain('Collected By:  ()');
      expect(docXml).not.toContain('undefined');
      expect(docXml).not.toContain('null');
    });
  });
});
