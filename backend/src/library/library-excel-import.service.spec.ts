import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { LibraryExcelImportService } from './services/library-excel-import.service';
import { PrismaService } from '../prisma/prisma.service';
import { AllowedImportCondition, ConfirmCatalogueImportDto } from './dto/catalogue-import.dto';
import * as ExcelJS from 'exceljs';

describe('LibraryExcelImportService', () => {
  let service: LibraryExcelImportService;
  let prisma: any;

  const mockSchoolId = 'school-uuid-1111';
  const mockUserId = 'user-librarian-1';

  beforeEach(async () => {
    prisma = {
      book: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'book-new-1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'book-updated-1', ...data })),
      },
      bookCopy: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'copy-new-1', ...data })),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(prisma);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryExcelImportService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<LibraryExcelImportService>(LibraryExcelImportService);
  });

  // Helper to create an in-memory .xlsx buffer
  async function createTestWorkbookBuffer(rows: any[], includeHeaders = true): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Library Catalogue');

    if (includeHeaders) {
      sheet.addRow([
        'Book Title*',
        'Author*',
        'Category*',
        'Accession Number*',
        'ISBN',
        'Publisher',
        'Edition',
        'Publication Year',
        'Language',
        'Rack Location',
        'Shelf Location',
        'Barcode',
        'Condition',
        'Purchase Price',
        'Description',
      ]);
    }

    for (const r of rows) {
      sheet.addRow(r);
    }

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  describe('generateTemplate()', () => {
    it('creates a styled .xlsx buffer with 2 sheets and correct headers', async () => {
      const buffer = await service.generateTemplate();
      expect(buffer).toBeInstanceOf(Buffer);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);

      expect(workbook.worksheets.length).toBe(2);
      expect(workbook.worksheets[0].name).toBe('Library Catalogue');
      expect(workbook.worksheets[1].name).toBe('Allowed Values & Instructions');

      const dataSheet = workbook.worksheets[0];
      expect(dataSheet.getRow(1).getCell(1).value).toBe('Book Title*');
      expect(dataSheet.getRow(1).getCell(4).value).toBe('Accession Number*');
      expect(dataSheet.rowCount).toBeGreaterThanOrEqual(4); // Header + 3 sample rows
    });
  });

  describe('previewImport() - Validation & Rules', () => {
    it('rejects workbooks with no data rows', async () => {
      const buffer = await createTestWorkbookBuffer([]);
      await expect(service.previewImport(mockSchoolId, buffer)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects workbooks exceeding 1,000 data rows', async () => {
      const largeRows = [];
      for (let i = 1; i <= 1005; i++) {
        largeRows.push([
          `Title ${i}`,
          'Author',
          'Fiction',
          `ACC-${i}`,
          null,
          null,
          null,
          null,
          'English',
          null,
          null,
          null,
          'GOOD',
          null,
          null,
        ]);
      }
      const buffer = await createTestWorkbookBuffer(largeRows);
      await expect(service.previewImport(mockSchoolId, buffer)).rejects.toThrow(
        /exceeds maximum limit of 1000 data rows/i,
      );
    });

    it('rejects formula cells in imported fields', async () => {
      const rows = [
        [
          '=cmd|/C calc!A0', // Formula attack
          'Harper Lee',
          'Fiction',
          'ACC-001',
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          'GOOD',
          null,
          null,
        ],
      ];
      const buffer = await createTestWorkbookBuffer(rows);
      const res = await service.previewImport(mockSchoolId, buffer);

      expect(res.canImport).toBe(false);
      expect(res.invalidCount).toBe(1);
      expect(res.invalidRows[0].errors.some((e) => e.includes('formula'))).toBe(true);
    });

    it('requires Accession Number for every copy and does not auto-generate', async () => {
      const rows = [
        [
          'Clean Code',
          'Robert C. Martin',
          'Computer Science',
          '', // Missing accession number
          '978-0132350884',
          'Prentice Hall',
          '1st',
          2008,
          'English',
          'R-1',
          'S-2',
          null,
          'GOOD',
          450,
          'Clean Code book',
        ],
      ];
      const buffer = await createTestWorkbookBuffer(rows);
      const res = await service.previewImport(mockSchoolId, buffer);

      expect(res.canImport).toBe(false);
      expect(res.invalidCount).toBe(1);
      expect(res.invalidRows[0].errors.some((e) => e.includes('Accession Number is required'))).toBe(true);
    });

    it('accepts NEW, GOOD, FAIR and defaults blank condition to GOOD', async () => {
      const rows = [
        ['Book 1', 'Author 1', 'Cat', 'ACC-001', null, null, null, null, null, null, null, null, 'NEW', null, null],
        ['Book 2', 'Author 2', 'Cat', 'ACC-002', null, null, null, null, null, null, null, null, 'good', null, null],
        ['Book 3', 'Author 3', 'Cat', 'ACC-003', null, null, null, null, null, null, null, null, 'FAIR', null, null],
        ['Book 4', 'Author 4', 'Cat', 'ACC-004', null, null, null, null, null, null, null, null, '', null, null], // Blank
      ];
      const buffer = await createTestWorkbookBuffer(rows);
      const res = await service.previewImport(mockSchoolId, buffer);

      expect(res.canImport).toBe(true);
      expect(res.validCount).toBe(4);
      expect(res.validRows[0].condition).toBe(AllowedImportCondition.NEW);
      expect(res.validRows[1].condition).toBe(AllowedImportCondition.GOOD);
      expect(res.validRows[2].condition).toBe(AllowedImportCondition.FAIR);
      expect(res.validRows[3].condition).toBe(AllowedImportCondition.GOOD); // Defaulted
    });

    it('strictly rejects DAMAGED, LOST, and RETIRED condition values', async () => {
      const rows = [
        ['Book 1', 'Author 1', 'Cat', 'ACC-001', null, null, null, null, null, null, null, null, 'DAMAGED', null, null],
        ['Book 2', 'Author 2', 'Cat', 'ACC-002', null, null, null, null, null, null, null, null, 'LOST', null, null],
        ['Book 3', 'Author 3', 'Cat', 'ACC-003', null, null, null, null, null, null, null, null, 'RETIRED', null, null],
      ];
      const buffer = await createTestWorkbookBuffer(rows);
      const res = await service.previewImport(mockSchoolId, buffer);

      expect(res.canImport).toBe(false);
      expect(res.invalidCount).toBe(3);
      expect(res.invalidRows[0].errors[0]).toContain('Catalogue import accepts only \'NEW\', \'GOOD\', or \'FAIR\'');
      expect(res.invalidRows[1].errors[0]).toContain('Catalogue import accepts only \'NEW\', \'GOOD\', or \'FAIR\'');
      expect(res.invalidRows[2].errors[0]).toContain('Catalogue import accepts only \'NEW\', \'GOOD\', or \'FAIR\'');
    });

    it('detects in-file duplicate accession numbers and blocks import', async () => {
      const rows = [
        ['Book A', 'Author', 'Cat', 'ACC-DUP-1', null, null, null, null, null, null, null, null, 'GOOD', null, null],
        ['Book B', 'Author', 'Cat', 'ACC-DUP-1', null, null, null, null, null, null, null, null, 'GOOD', null, null], // Duplicate
      ];
      const buffer = await createTestWorkbookBuffer(rows);
      const res = await service.previewImport(mockSchoolId, buffer);

      expect(res.canImport).toBe(false);
      expect(res.duplicateCount).toBe(1);
      expect(res.duplicateRows[0].reason).toContain('Duplicate Accession Number in file');
    });

    it('detects database duplicate accession numbers within the active school', async () => {
      prisma.bookCopy.findMany.mockResolvedValueOnce([{ accessionNumber: 'ACC-EXISTING-1' }]);

      const rows = [
        ['Book A', 'Author', 'Cat', 'ACC-EXISTING-1', null, null, null, null, null, null, null, null, 'GOOD', null, null],
      ];
      const buffer = await createTestWorkbookBuffer(rows);
      const res = await service.previewImport(mockSchoolId, buffer);

      expect(res.canImport).toBe(false);
      expect(res.duplicateCount).toBe(1);
      expect(res.duplicateRows[0].reason).toContain('already exists in the school inventory');
    });

    it('groups multiple copies under the same book title and matches existing database books', async () => {
      // One book already exists in DB
      prisma.book.findMany.mockResolvedValueOnce([{ id: 'existing-book-1', isbn: '9780061120084' }]);

      const rows = [
        // Two copies of existing book
        ['To Kill a Mockingbird', 'Harper Lee', 'Fiction', 'ACC-101', '978-0-06-112008-4', null, null, null, null, null, null, null, 'GOOD', null, null],
        ['To Kill a Mockingbird', 'Harper Lee', 'Fiction', 'ACC-102', '978-0-06-112008-4', null, null, null, null, null, null, null, 'NEW', null, null],
        // One copy of a brand new book
        ['Brand New Book', 'New Author', 'Science', 'ACC-103', '978-1-234-56789-0', null, null, null, null, null, null, null, 'GOOD', null, null],
      ];

      const buffer = await createTestWorkbookBuffer(rows);
      const res = await service.previewImport(mockSchoolId, buffer);

      expect(res.canImport).toBe(true);
      expect(res.validCount).toBe(3);
      expect(res.existingTitlesCount).toBe(1);
      expect(res.newTitlesCount).toBe(1);
    });
  });

  describe('confirmImport() - Atomic Transaction & Rollback', () => {
    it('rejects confirmation if payload contains duplicate accession numbers', async () => {
      const dto: ConfirmCatalogueImportDto = {
        rows: [
          {
            rowNumber: 2,
            title: 'Book A',
            author: 'Author',
            category: 'Cat',
            accessionNumber: 'ACC-SAME',
            condition: AllowedImportCondition.GOOD,
          },
          {
            rowNumber: 3,
            title: 'Book B',
            author: 'Author',
            category: 'Cat',
            accessionNumber: 'ACC-SAME',
            condition: AllowedImportCondition.GOOD,
          },
        ],
      };

      await expect(service.confirmImport(mockSchoolId, mockUserId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects confirmation if any row has an invalid condition', async () => {
      const dto: any = {
        rows: [
          {
            rowNumber: 2,
            title: 'Book A',
            author: 'Author',
            category: 'Cat',
            accessionNumber: 'ACC-1',
            condition: 'DAMAGED', // Disallowed condition
          },
        ],
      };

      await expect(service.confirmImport(mockSchoolId, mockUserId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('atomically creates new books, updates existing books, and inserts copies', async () => {
      // Mock existing book matching
      prisma.book.findFirst.mockResolvedValueOnce({
        id: 'existing-book-uuid',
        title: 'Existing Book',
        author: 'Existing Author',
      });

      const dto: ConfirmCatalogueImportDto = {
        rows: [
          // 2 copies for existing book
          {
            rowNumber: 2,
            title: 'Existing Book',
            author: 'Existing Author',
            category: 'Fiction',
            accessionNumber: 'ACC-EXIST-1',
            condition: AllowedImportCondition.GOOD,
          },
          {
            rowNumber: 3,
            title: 'Existing Book',
            author: 'Existing Author',
            category: 'Fiction',
            accessionNumber: 'ACC-EXIST-2',
            condition: AllowedImportCondition.NEW,
          },
          // 1 copy for brand new book
          {
            rowNumber: 4,
            title: 'New Book Title',
            author: 'New Author',
            category: 'Science',
            accessionNumber: 'ACC-NEW-1',
            condition: AllowedImportCondition.GOOD,
          },
        ],
      };

      const result = await service.confirmImport(mockSchoolId, mockUserId, dto);

      expect(result.totalSubmitted).toBe(3);
      expect(result.copiesInserted).toBe(3);
      expect(result.booksUpdated).toBe(1);
      expect(result.titlesCreated).toBe(1);

      // Verify copies inserted as AVAILABLE
      expect(prisma.bookCopy.create).toHaveBeenCalledTimes(3);
      expect(prisma.bookCopy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            schoolId: mockSchoolId,
            status: 'AVAILABLE',
            accessionNumber: 'ACC-EXIST-1',
          }),
        }),
      );
    });

    it('rolls back completely if a database conflict or error occurs inside transaction', async () => {
      // Simulate conflict inside transaction
      prisma.bookCopy.findMany.mockResolvedValueOnce([{ accessionNumber: 'ACC-RACE-CONFLICT' }]);

      const dto: ConfirmCatalogueImportDto = {
        rows: [
          {
            rowNumber: 2,
            title: 'Book A',
            author: 'Author',
            category: 'Cat',
            accessionNumber: 'ACC-RACE-CONFLICT',
            condition: AllowedImportCondition.GOOD,
          },
        ],
      };

      await expect(service.confirmImport(mockSchoolId, mockUserId, dto)).rejects.toThrow(
        ConflictException,
      );

      // Zero writes executed
      expect(prisma.book.create).not.toHaveBeenCalled();
      expect(prisma.bookCopy.create).not.toHaveBeenCalled();
    });
  });
});
