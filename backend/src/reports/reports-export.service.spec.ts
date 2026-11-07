import { BadRequestException } from '@nestjs/common';
import { School, UserRole } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { ReportsExportService, sanitizeCellValue, escapeCsvField } from './reports-export.service';
import { ReportsService } from './reports.service';
import { ReportConfigService } from './report-config.service';
import { ReportType } from './dto/report-config.dto';
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

function getPdfPageCount(buf: Buffer): number {
  const matches = buf.toString('latin1').match(/\/Type\s*\/Page\b[^\w]/g);
  return matches ? matches.length : 1;
}

describe('ReportsExportService — CSV & Excel Export Engine', () => {
  let exportService: ReportsExportService;
  let mockReportsService: Partial<ReportsService>;
  let reportConfigService: ReportConfigService;

  const mockSchool: School = {
    id: 'school-1',
    name: 'Greenwood International Academy',
    code: 'GIA',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    address: '123 Education Lane',
    city: 'Bangalore',
    state: 'Karnataka',
    country: 'India',
    status: 'ACTIVE' as any,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    defaultReceiptTemplateId: null,
  };

  beforeEach(() => {
    reportConfigService = new ReportConfigService();

    mockReportsService = {
      getDailyCollection: jest.fn().mockResolvedValue({
        school: { id: 'school-1', name: 'Greenwood International Academy', currency: 'INR', timezone: 'Asia/Kolkata' },
        period: { date: '2026-10-17' },
        summary: {
          grossCollections: 15000,
          totalReversals: 3000,
          totalRefunds: 2000,
          netCollections: 10000,
          transactionCount: 2,
        },
        transactions: [
          {
            receiptNumber: 'REC-001',
            paymentDate: new Date('2026-10-17T10:30:00Z'),
            student: { admissionNumber: 'ADM-101', name: 'Rohan Sharma', grade: 'Grade 10', section: 'A' },
            paymentMethod: 'BANK_TRANSFER',
            referenceNumber: 'REF-8899',
            amount: 10000,
          },
          {
            receiptNumber: 'REC-002',
            paymentDate: new Date('2026-10-17T11:45:00Z'),
            student: { admissionNumber: 'ADM-102', name: 'Priya Singh', grade: 'Grade 10', section: 'B' },
            paymentMethod: 'CASH',
            referenceNumber: null,
            amount: 5000,
          },
        ],
      }),
      getMonthlyCollection: jest.fn().mockResolvedValue({
        school: { id: 'school-1', name: 'Greenwood International Academy', currency: 'INR', timezone: 'Asia/Kolkata' },
        period: { year: 2026, month: 10 },
        summary: {
          grossCollections: 25000,
          totalReversals: 3000,
          totalRefunds: 2000,
          netCollections: 20000,
          transactionCount: 5,
        },
        dailyBreakdown: [
          {
            date: '2026-10-01',
            grossCollections: 10000,
            totalReversals: 0,
            totalRefunds: 0,
            netCollections: 10000,
            transactionCount: 2,
          },
          {
            date: '2026-10-17',
            grossCollections: 15000,
            totalReversals: 3000,
            totalRefunds: 2000,
            netCollections: 10000,
            transactionCount: 3,
          },
        ],
      }),
      getCollectionSummary: jest.fn().mockResolvedValue({
        school: { id: 'school-1', name: 'Greenwood International Academy', currency: 'INR', timezone: 'Asia/Kolkata' },
        period: { startDate: '2026-10-01', endDate: '2026-10-17' },
        summary: {
          grossCollections: 25000,
          totalReversals: 3000,
          totalRefunds: 2000,
          netCollections: 20000,
          transactionCount: 5,
        },
        periodicBreakdown: [
          {
            period: '2026-10-01',
            grossCollections: 10000,
            totalReversals: 0,
            totalRefunds: 0,
            netCollections: 10000,
            transactionCount: 2,
          },
        ],
      }),
      getOutstandingDues: jest.fn().mockResolvedValue({
        school: { id: 'school-1', name: 'Greenwood International Academy', currency: 'INR', timezone: 'Asia/Kolkata' },
        filters: { onlyWithDues: false },
        summary: {
          totalStudents: 2,
          totalBilledAmount: 50000,
          totalPaidAmount: 30000,
          totalOutstandingAmount: 20000,
          totalOverdueAmount: 15000,
        },
        records: [
          {
            admissionNumber: 'ADM-101',
            studentName: 'Rohan Sharma',
            grade: { name: 'Grade 10' },
            section: { name: 'A' },
            totalBilled: 25000,
            totalPaid: 15000,
            fineBalance: 500,
            outstandingBalance: 10500,
            maxOverdueDays: 14,
            status: 'ACTIVE',
          },
        ],
      }),
      getClassCollections: jest.fn().mockResolvedValue({
        school: { id: 'school-1', name: 'Greenwood International Academy', currency: 'INR', timezone: 'Asia/Kolkata' },
        summary: {
          grossCollections: 15000,
          totalReversals: 3000,
          totalRefunds: 2000,
          netCollections: 10000,
          totalTxnCount: 2,
        },
        byClass: [
          {
            gradeName: 'Grade 10',
            sectionName: 'A',
            grossCollections: 15000,
            totalReversals: 3000,
            totalRefunds: 2000,
            netCollections: 10000,
            transactionCount: 2,
          },
        ],
      }),
      getFineSummary: jest.fn().mockResolvedValue({
        school: { id: 'school-1', name: 'Greenwood International Academy', currency: 'INR', timezone: 'Asia/Kolkata' },
        summary: {
          totalAssessed: 5000,
          totalWaived: 1000,
          netObligation: 4000,
          totalCollected: 2000,
          totalReversals: 0,
          totalRefunds: 0,
          netCollected: 2000,
          remainingBalance: 2000,
          fineCount: 3,
        },
        byClass: [
          {
            gradeName: 'Grade 10',
            sectionName: 'A',
            totalAssessed: 5000,
            totalWaived: 1000,
            totalCollected: 2000,
            totalReversals: 0,
            totalRefunds: 0,
            netCollected: 2000,
            remainingBalance: 2000,
            fineCount: 3,
          },
        ],
      }),
      getDefaultersReport: jest.fn().mockResolvedValue({
        school: { id: 'school-1', name: 'Greenwood International Academy', currency: 'INR', timezone: 'Asia/Kolkata' },
        summary: {
          overdueStudentsCount: 1,
          totalOverduePrincipal: 10000,
          totalOverdueFines: 500,
          totalOverdueAmount: 10500,
          totalOutstandingAmount: 10500,
        },
        records: [
          {
            admissionNumber: 'ADM-101',
            studentName: 'Rohan Sharma',
            grade: { name: 'Grade 10' },
            section: { name: 'A' },
            overduePrincipal: 10000,
            overdueFines: 500,
            overdueAmount: 10500,
            maxOverdueDays: 14,
            outstandingBalance: 10500,
            guardian: { phone: '+91 9876543210' },
          },
        ],
      }),
    };

    exportService = new ReportsExportService(
      mockReportsService as ReportsService,
      reportConfigService,
    );
  });

  describe('1. Formula Injection Sanitization (CWE-1236)', () => {
    it('prepends single quote to values starting with =, +, -, @, tab, or carriage return', () => {
      expect(sanitizeCellValue('=cmd|"/C calc"!A0')).toBe('\'=cmd|"/C calc"!A0');
      expect(sanitizeCellValue('+919876543210')).toBe('\'+919876543210');
      expect(sanitizeCellValue('-REF-123')).toBe('\'-REF-123');
      expect(sanitizeCellValue('@username')).toBe('\'@username');
      expect(sanitizeCellValue('\tINDENTED')).toBe('\'\tINDENTED');
      expect(sanitizeCellValue('\rRETURN')).toBe('\'\rRETURN');
    });

    it('leaves standard text, numbers, booleans, and nulls safe without single quote', () => {
      expect(sanitizeCellValue('John Doe')).toBe('John Doe');
      expect(sanitizeCellValue(15000.5)).toBe(15000.5);
      expect(sanitizeCellValue(true)).toBe('Yes');
      expect(sanitizeCellValue(false)).toBe('No');
      expect(sanitizeCellValue(null)).toBe('');
      expect(sanitizeCellValue(undefined)).toBe('');
    });

    it('escapes CSV fields with quotes when commas, quotes, or newlines are present', () => {
      expect(escapeCsvField('Greenwood, Academy')).toBe('"Greenwood, Academy"');
      expect(escapeCsvField('Said "Hello"')).toBe('"Said ""Hello"""');
      expect(escapeCsvField('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
      expect(escapeCsvField('=SUM(A1:A5)')).toBe('\'=SUM(A1:A5)');
      expect(escapeCsvField('=SUM(A1, A5)')).toBe('"\'=SUM(A1, A5)"');
    });
  });

  describe('2. CSV Export Validation for All 7 Report Types', () => {
    it('exports DAILY_COLLECTION as CSV with correct headers and totals', async () => {
      const res = await exportService.exportReport(mockSchool, 'DAILY_COLLECTION', {
        format: 'csv',
        date: '2026-10-17',
      });

      expect(res.contentType).toBe('text/csv; charset=utf-8');
      expect(res.filename).toMatch(/^daily_collection_\d{4}-\d{2}-\d{2}\.csv$/);

      const csvText = res.buffer.toString('utf-8');
      const lines = csvText.split('\r\n');

      // Header row
      expect(lines[0]).toBe(
        'Receipt #,Time,Adm #,Student Name,Class / Sec,Method,Reference / Cheque #,Amount',
      );
      // Data row 1
      expect(lines[1]).toContain('REC-001');
      expect(lines[1]).toContain('ADM-101');
      expect(lines[1]).toContain('Rohan Sharma');
      expect(lines[1]).toContain('10000');
      // Totals row
      const lastLine = lines[lines.length - 1];
      expect(lastLine).toContain('TOTAL');
      expect(lastLine).toContain('15000');
    });

    it('exports MONTHLY_COLLECTION as CSV', async () => {
      const res = await exportService.exportReport(mockSchool, 'MONTHLY_COLLECTION', {
        format: 'csv',
        year: 2026,
        month: 10,
      });

      const csvText = res.buffer.toString('utf-8');
      expect(csvText).toContain('Date,Gross Collection,Reversals,Refunds,Net Collection,Txn Count');
      expect(csvText).toContain('2026-10-17,15000,3000,2000,10000,3');
    });

    it('exports COLLECTION_SUMMARY as CSV', async () => {
      const res = await exportService.exportReport(mockSchool, 'COLLECTION_SUMMARY', {
        format: 'csv',
        startDate: '2026-10-01',
        endDate: '2026-10-17',
      });

      const csvText = res.buffer.toString('utf-8');
      expect(csvText).toContain('Period / Date,Gross Collection,Reversals,Refunds,Net Collection,Txn Count');
      expect(csvText).toContain('2026-10-01,10000,0,0,10000,2');
    });

    it('exports OUTSTANDING_DUES as CSV', async () => {
      const res = await exportService.exportReport(mockSchool, 'OUTSTANDING_DUES', {
        format: 'csv',
      });

      const csvText = res.buffer.toString('utf-8');
      expect(csvText).toContain(
        'Adm #,Student Name,Class / Sec,Total Billed,Total Paid,Fine Balance,Outstanding Balance,Max Overdue Days,Status',
      );
      expect(csvText).toContain('ADM-101,Rohan Sharma,Grade 10 - A,25000,15000,500,10500,14,ACTIVE');
    });

    it('exports CLASS_COLLECTION as CSV', async () => {
      const res = await exportService.exportReport(mockSchool, 'CLASS_COLLECTION', {
        format: 'csv',
      });

      const csvText = res.buffer.toString('utf-8');
      expect(csvText).toContain('Class,Section,Gross Collection,Reversals,Refunds,Net Collection,Txn Count');
      expect(csvText).toContain('Grade 10,A,15000,3000,2000,10000,2');
    });

    it('exports FINE_SUMMARY as CSV', async () => {
      const res = await exportService.exportReport(mockSchool, 'FINE_SUMMARY', {
        format: 'csv',
      });

      const csvText = res.buffer.toString('utf-8');
      expect(csvText).toContain(
        'Class / Sec,Assessed Fines,Waived Fines,Collected Fines,Reversals,Refunds,Net Collected,Fine Balance,Fine Count',
      );
      expect(csvText).toContain('Grade 10 - A,5000,1000,2000,0,0,2000,2000,3');
    });

    it('exports DEFAULTER_REPORT as CSV', async () => {
      const res = await exportService.exportReport(mockSchool, 'DEFAULTER_REPORT', {
        format: 'csv',
      });

      const csvText = res.buffer.toString('utf-8');
      expect(csvText).toContain(
        'Adm #,Student Name,Class / Sec,Overdue Principal,Overdue Fines,Total Overdue,Days Overdue,Total Outstanding,Guardian Phone',
      );
      expect(csvText).toContain('ADM-101,Rohan Sharma,Grade 10 - A,10000,500,10500,14,10500');
      // Phone sanitized with '
      expect(csvText).toContain("'+91 9876543210");
    });
  });

  describe('3. Excel (.xlsx) Export Validation & Formatting', () => {
    it('exports DAILY_COLLECTION as valid XLSX buffer with branding and summary cards', async () => {
      const res = await exportService.exportReport(mockSchool, 'DAILY_COLLECTION', {
        format: 'xlsx',
        date: '2026-10-17',
      });

      expect(res.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(res.filename).toMatch(/^daily_collection_\d{4}-\d{2}-\d{2}\.xlsx$/);

      // Load buffer with ExcelJS to assert structural integrity
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.buffer as any);

      const sheet = workbook.worksheets[0];
      expect(sheet).toBeDefined();

      // Check branding row 1
      const cellA1 = sheet.getCell('A1');
      expect(cellA1.value).toBe('Greenwood International Academy');
      expect(cellA1.font?.bold).toBe(true);

      // Check title row
      const titleCell = sheet.getCell('A3');
      expect(titleCell.value).toBe('Daily Fee Collection Report');

      // Check headers and data
      let headerRowNumber = 0;
      sheet.eachRow((row, rowNumber) => {
        if (row.getCell(1).value === 'Receipt #') {
          headerRowNumber = rowNumber;
        }
      });
      expect(headerRowNumber).toBeGreaterThan(0);

      const dataRow = sheet.getRow(headerRowNumber + 1);
      expect(dataRow.getCell(1).value).toBe('REC-001');
      expect(dataRow.getCell(3).value).toBe('ADM-101');
      expect(dataRow.getCell(4).value).toBe('Rohan Sharma');
      expect(dataRow.getCell(8).value).toBe(10000);
      expect(dataRow.getCell(8).numFmt).toBe('#,##0.00');
    });

    it('exports DEFAULTER_REPORT as XLSX in landscape orientation with correct columns', async () => {
      const res = await exportService.exportReport(mockSchool, 'DEFAULTER_REPORT', {
        format: 'xlsx',
      });

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.buffer as any);
      const sheet = workbook.worksheets[0];

      expect(sheet.pageSetup.orientation).toBe('landscape');
      expect(sheet.getCell('A1').value).toBe('Greenwood International Academy');

      let foundGuardianPhone = false;
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value === "'+91 9876543210") {
            foundGuardianPhone = true;
          }
        });
      });
      expect(foundGuardianPhone).toBe(true);
    });
  });

  describe('4. PDF Export Validation & Multi-Page Layout', () => {
    it('exports DAILY_COLLECTION as valid print-ready PDF with school branding, title, and metadata', async () => {
      const res = await exportService.exportReport(mockSchool, 'DAILY_COLLECTION', {
        format: 'pdf',
        date: '2026-10-17',
      });

      expect(res.contentType).toBe('application/pdf');
      expect(res.filename).toMatch(/^daily_collection_\d{4}-\d{2}-\d{2}\.pdf$/);

      // Verify PDF binary header
      const headerMagic = res.buffer.subarray(0, 5).toString('ascii');
      expect(headerMagic).toBe('%PDF-');

      // Deep parse text and verify contents
      const text = extractPdfText(res.buffer);

      expect(text).toContain('Greenwood International Academy');
      expect(text).toContain('Daily Fee Collection Report');
      expect(text).toContain('Receipt #');
      expect(text).toContain('REC-001');
      expect(text).toContain('Rohan Sharma');
      expect(text).toContain('TOTAL');
      expect(getPdfPageCount(res.buffer)).toBeGreaterThanOrEqual(1);
    });

    it('exports OUTSTANDING_DUES and DEFAULTER_REPORT in landscape orientation as PDF', async () => {
      // 1. OUTSTANDING_DUES PDF
      const resDues = await exportService.exportReport(mockSchool, 'OUTSTANDING_DUES', {
        format: 'pdf',
      });
      expect(resDues.contentType).toBe('application/pdf');
      const textDues = extractPdfText(resDues.buffer);
      expect(textDues).toContain('Outstanding Dues and Defaulters Report');
      expect(textDues).toContain('ADM-101');
      expect(textDues).toContain('Rohan Sharma');

      // 2. DEFAULTER_REPORT PDF
      const resDefaulters = await exportService.exportReport(mockSchool, 'DEFAULTER_REPORT', {
        format: 'pdf',
      });
      expect(resDefaulters.contentType).toBe('application/pdf');
      const textDef = extractPdfText(resDefaulters.buffer);
      expect(textDef).toContain('Fee Defaulters and Overdue Aging Report');
      expect(textDef).toContain('Overdue Principal');
      expect(textDef).toContain('Overdue Fines');
      expect(textDef).toContain('ADM-101');
    });

    it('exports MONTHLY_COLLECTION, COLLECTION_SUMMARY, CLASS_COLLECTION, and FINE_SUMMARY as PDF', async () => {
      // Monthly Collection PDF
      const resMonthly = await exportService.exportReport(mockSchool, 'MONTHLY_COLLECTION', {
        format: 'pdf',
        year: 2026,
        month: 10,
      });
      expect(resMonthly.contentType).toBe('application/pdf');
      const textMonthly = extractPdfText(resMonthly.buffer);
      expect(textMonthly).toContain('Monthly Fee Collection Summary');

      // Collection Summary PDF
      const resSummary = await exportService.exportReport(mockSchool, 'COLLECTION_SUMMARY', {
        format: 'pdf',
        startDate: '2026-10-01',
        endDate: '2026-10-17',
      });
      expect(resSummary.contentType).toBe('application/pdf');
      const textSummary = extractPdfText(resSummary.buffer);
      expect(textSummary).toContain('Fee Collection Summary Report');

      // Class Collection PDF
      const resClass = await exportService.exportReport(mockSchool, 'CLASS_COLLECTION', {
        format: 'pdf',
      });
      expect(resClass.contentType).toBe('application/pdf');
      const textClass = extractPdfText(resClass.buffer);
      expect(textClass).toContain('Class-Wise Fee Collection Report');

      // Fine Summary PDF
      const resFines = await exportService.exportReport(mockSchool, 'FINE_SUMMARY', {
        format: 'pdf',
      });
      expect(resFines.contentType).toBe('application/pdf');
      const textFines = extractPdfText(resFines.buffer);
      expect(textFines).toContain('Late Fine and Penalty Summary Report');
      expect(textFines).toContain('Assessed Fines');
    });

    it('cleanly handles empty report datasets in PDF without crashing', async () => {
      (mockReportsService.getDailyCollection as jest.Mock).mockResolvedValueOnce({
        school: { id: 'school-1', name: 'Greenwood International Academy', currency: 'INR', timezone: 'Asia/Kolkata' },
        period: { date: '2026-10-17' },
        summary: {
          grossCollections: 0,
          totalReversals: 0,
          totalRefunds: 0,
          netCollections: 0,
          transactionCount: 0,
        },
        transactions: [],
      });

      const res = await exportService.exportReport(mockSchool, 'DAILY_COLLECTION', {
        format: 'pdf',
        date: '2026-10-17',
      });

      expect(res.contentType).toBe('application/pdf');
      const textData = extractPdfText(res.buffer);
      expect(textData).toContain('No records found for the selected criteria.');
    });

    it('generates multi-page PDF with running footers and repeating headers for large tables', async () => {
      // Create 50 transaction records to trigger automatic page breaks
      const largeTransactions = [];
      for (let i = 1; i <= 50; i++) {
        largeTransactions.push({
          receiptNumber: `REC-${String(i).padStart(4, '0')}`,
          paymentDate: new Date('2026-10-17T10:30:00Z'),
          student: { admissionNumber: `ADM-${i}`, name: `Student ${i}`, grade: 'Grade 10', section: 'A' },
          paymentMethod: 'CASH',
          referenceNumber: `REF-${i}`,
          amount: 1000 * i,
        });
      }

      (mockReportsService.getDailyCollection as jest.Mock).mockResolvedValueOnce({
        school: { id: 'school-1', name: 'Greenwood International Academy', currency: 'INR', timezone: 'Asia/Kolkata' },
        period: { date: '2026-10-17' },
        summary: {
          grossCollections: 1275000,
          totalReversals: 0,
          totalRefunds: 0,
          netCollections: 1275000,
          transactionCount: 50,
        },
        transactions: largeTransactions,
      });

      const res = await exportService.exportReport(mockSchool, 'DAILY_COLLECTION', {
        format: 'pdf',
        date: '2026-10-17',
      });

      const textData = extractPdfText(res.buffer);
      const pageMatch = /Page 1 of (\d+)/.exec(textData);
      expect(pageMatch).not.toBeNull();
      const pageCount = parseInt(pageMatch[1], 10);

      // Multi-page assertion
      expect(pageCount).toBeGreaterThan(1);
      expect(textData).toContain(`Page 1 of ${pageCount}`);
      expect(textData).toContain(`Page ${pageCount} of ${pageCount}`);
    });
  });

  describe('5. Input Validation & Error Handling', () => {
    it('throws BadRequestException for unsupported export format (e.g. docx)', async () => {
      await expect(
        exportService.exportReport(mockSchool, 'DAILY_COLLECTION', {
          format: 'docx',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for unsupported report type', async () => {
      await expect(
        exportService.exportReport(mockSchool, 'INVALID_REPORT', {
          format: 'csv',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('handles empty report datasets cleanly in CSV without error', async () => {
      (mockReportsService.getDailyCollection as jest.Mock).mockResolvedValueOnce({
        school: { id: 'school-1', name: 'Greenwood International Academy', currency: 'INR', timezone: 'Asia/Kolkata' },
        period: { date: '2026-10-17' },
        summary: {
          grossCollections: 0,
          totalReversals: 0,
          totalRefunds: 0,
          netCollections: 0,
          transactionCount: 0,
        },
        transactions: [],
      });

      const res = await exportService.exportReport(mockSchool, 'DAILY_COLLECTION', {
        format: 'csv',
        date: '2026-10-17',
      });

      const lines = res.buffer.toString('utf-8').split('\r\n');
      expect(lines.length).toBe(1);
      expect(lines[0]).toContain('Receipt #');
    });
  });
});
