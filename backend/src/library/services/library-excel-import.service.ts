import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AllowedImportCondition,
  CatalogueImportConfirmResult,
  CatalogueImportPreviewResult,
  ConfirmCatalogueImportDto,
  ValidatedCatalogueCopyRowDto,
} from '../dto/catalogue-import.dto';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';

@Injectable()
export class LibraryExcelImportService {
  private readonly logger = new Logger(LibraryExcelImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a downloadable .xlsx template containing:
   * 1. 'Library Catalogue' - styled data sheet with sample rows.
   * 2. 'Allowed Values & Instructions' - clear guidelines and allowed enums.
   */
  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'School Library Management System';
    workbook.created = new Date();

    // -------------------------------------------------------------
    // Sheet 1: Library Catalogue
    // -------------------------------------------------------------
    const dataSheet = workbook.addWorksheet('Library Catalogue', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    const columns = [
      { header: 'Book Title*', key: 'title', width: 32 },
      { header: 'Author*', key: 'author', width: 25 },
      { header: 'Category*', key: 'category', width: 20 },
      { header: 'Accession Number*', key: 'accessionNumber', width: 22 },
      { header: 'ISBN', key: 'isbn', width: 20 },
      { header: 'Publisher', key: 'publisher', width: 24 },
      { header: 'Edition', key: 'edition', width: 18 },
      { header: 'Publication Year', key: 'publicationYear', width: 18 },
      { header: 'Language', key: 'language', width: 16 },
      { header: 'Rack Location', key: 'rackLocation', width: 16 },
      { header: 'Shelf Location', key: 'shelfLocation', width: 16 },
      { header: 'Barcode', key: 'barcode', width: 20 },
      { header: 'Condition', key: 'condition', width: 16 },
      { header: 'Purchase Price', key: 'purchasePrice', width: 16 },
      { header: 'Description', key: 'description', width: 36 },
    ];
    dataSheet.columns = columns;

    // Header styling
    const headerRow = dataSheet.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '4F46E5' }, // Indigo 600
      };
      cell.font = {
        name: 'Segoe UI',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFF' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: '3730A3' } },
        bottom: { style: 'medium', color: { argb: '312E81' } },
        left: { style: 'thin', color: { argb: '3730A3' } },
        right: { style: 'thin', color: { argb: '3730A3' } },
      };
    });

    // Sample data rows showing one-row-per-physical-copy convention
    const sampleRows = [
      {
        title: 'To Kill a Mockingbird',
        author: 'Harper Lee',
        category: 'Fiction',
        accessionNumber: 'ACC-2026-001',
        isbn: '978-0-06-112008-4',
        publisher: 'HarperCollins',
        edition: '50th Anniversary Ed.',
        publicationYear: 2010,
        language: 'English',
        rackLocation: 'Rack-A',
        shelfLocation: 'Shelf-1',
        barcode: 'BC-10001',
        condition: 'GOOD',
        purchasePrice: 499.0,
        description: 'Classic American fiction novel.',
      },
      {
        title: 'To Kill a Mockingbird',
        author: 'Harper Lee',
        category: 'Fiction',
        accessionNumber: 'ACC-2026-002',
        isbn: '978-0-06-112008-4',
        publisher: 'HarperCollins',
        edition: '50th Anniversary Ed.',
        publicationYear: 2010,
        language: 'English',
        rackLocation: 'Rack-A',
        shelfLocation: 'Shelf-1',
        barcode: 'BC-10002',
        condition: 'NEW',
        purchasePrice: 499.0,
        description: 'Second physical copy on shelf.',
      },
      {
        title: 'Introduction to Algorithms',
        author: 'Thomas H. Cormen',
        category: 'Computer Science',
        accessionNumber: 'ACC-2026-003',
        isbn: '978-0-262-03384-8',
        publisher: 'MIT Press',
        edition: '3rd Edition',
        publicationYear: 2009,
        language: 'English',
        rackLocation: 'Rack-C',
        shelfLocation: 'Shelf-4',
        barcode: 'BC-10003',
        condition: 'GOOD',
        purchasePrice: 1250.0,
        description: 'Core computer science reference textbook.',
      },
    ];

    sampleRows.forEach((item) => {
      const row = dataSheet.addRow(item);
      row.height = 20;
      row.eachCell((cell) => {
        cell.font = { name: 'Segoe UI', size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
          left: { style: 'thin', color: { argb: 'E2E8F0' } },
          right: { style: 'thin', color: { argb: 'E2E8F0' } },
        };
      });
    });

    // -------------------------------------------------------------
    // Sheet 2: Allowed Values & Instructions
    // -------------------------------------------------------------
    const guideSheet = workbook.addWorksheet('Allowed Values & Instructions');
    guideSheet.columns = [
      { header: 'Rule / Topic', key: 'topic', width: 28 },
      { header: 'Requirement & Allowed Values', key: 'requirement', width: 45 },
      { header: 'Explanation & Guidance', key: 'guidance', width: 50 },
    ];

    const guideHeader = guideSheet.getRow(1);
    guideHeader.height = 26;
    guideHeader.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1E293B' }, // Slate 800
      };
      cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    const guidelines = [
      {
        topic: 'One Row Per Copy',
        requirement: 'Each row represents exactly one physical book copy',
        guidance:
          'Multiple physical copies of the same book share Title and Author metadata, but MUST have distinct Accession Numbers.',
      },
      {
        topic: 'Accession Number*',
        requirement: 'Mandatory string (max 100 chars); unique per school',
        guidance:
          'Missing accession numbers are NOT auto-generated. Every physical copy must have a unique identifier.',
      },
      {
        topic: 'Accepted Conditions',
        requirement: 'NEW, GOOD, or FAIR (case-insensitive)',
        guidance:
          'Initial catalogue inventory accepts only circulating conditions. Blank defaults to GOOD. DAMAGED, LOST, or RETIRED are rejected.',
      },
      {
        topic: 'Title Matching',
        requirement: 'Matched via ISBN or (Title + Author + Edition)',
        guidance:
          'If a book title already exists in your library, new copies will be attached to it and available counts incremented automatically.',
      },
      {
        topic: 'Strict All-or-Nothing',
        requirement: 'Zero errors allowed in batch',
        guidance:
          'If any row has validation or duplicate errors, the entire import is blocked. Correct highlighted rows and re-upload.',
      },
      {
        topic: 'Formulas Prohibited',
        requirement: 'Formula cells (=, +, -, @) are strictly forbidden',
        guidance:
          'Cells must contain plain text or numbers only. Any cell starting with a formula operator will be rejected for security.',
      },
      {
        topic: 'Batch Limits',
        requirement: 'Maximum 1,000 data rows; maximum 5 MB file size',
        guidance: 'For larger collections, split your spreadsheet into multiple batches of up to 1,000 rows each.',
      },
    ];

    guidelines.forEach((g) => {
      const row = guideSheet.addRow(g);
      row.height = 22;
      row.eachCell((cell) => {
        cell.font = { name: 'Segoe UI', size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
          left: { style: 'thin', color: { argb: 'E2E8F0' } },
          right: { style: 'thin', color: { argb: 'E2E8F0' } },
        };
      });
    });

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  /**
   * Normalizes header key for tolerant column matching.
   */
  private normalizeKey(header: string): string {
    if (!header) return '';
    return header
      .toString()
      .replace(/\(.*?\)/g, '')
      .replace(/\*/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Checks if a cell value contains a formula or formula prefix.
   * Enforces strict rejection rather than silent modification.
   */
  private isFormulaValue(cell: ExcelJS.Cell): boolean {
    if (cell.type === ExcelJS.ValueType.Formula) {
      return true;
    }
    const val = cell.value;
    if (typeof val === 'object' && val !== null && 'formula' in val) {
      return true;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (
        trimmed.startsWith('=') ||
        trimmed.startsWith('+') ||
        trimmed.startsWith('-') ||
        trimmed.startsWith('@')
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Reads raw cell string safely.
   */
  private getCellString(cell: ExcelJS.Cell): string {
    if (cell.value === null || cell.value === undefined) return '';
    if (cell.text !== undefined && cell.text !== null) {
      return cell.text.trim();
    }
    return cell.value.toString().trim();
  }

  /**
   * Normalizes ISBN by stripping hyphens and whitespace.
   */
  private normalizeIsbn(isbn?: string | null): string | null {
    if (!isbn) return null;
    const cleaned = isbn.replace(/[-\s]/g, '').trim().toUpperCase();
    return cleaned.length > 0 ? cleaned : null;
  }

  /**
   * Parses and validates an uploaded Excel workbook for library catalogue import.
   * Strictly read-only: does NOT modify database state.
   */
  async previewImport(schoolId: string, fileBuffer: Buffer): Promise<CatalogueImportPreviewResult> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(fileBuffer as any);
    } catch {
      throw new BadRequestException('Failed to parse Excel file. Please ensure it is a valid .xlsx document.');
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      throw new BadRequestException('Spreadsheet contains no data rows to import.');
    }

    const MAX_DATA_ROWS = 1000;
    const totalDataRows = worksheet.rowCount - 1;
    if (totalDataRows > MAX_DATA_ROWS) {
      throw new BadRequestException(
        `File exceeds maximum limit of ${MAX_DATA_ROWS} data rows (found ${totalDataRows} rows). Please split into smaller files.`,
      );
    }

    // Map Header Columns
    const headerRow = worksheet.getRow(1);
    const colMap = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      const normalized = this.normalizeKey(cell.text || cell.value?.toString() || '');
      if (normalized) {
        colMap.set(normalized, colNumber);
      }
    });

    const getColIndex = (candidates: string[]): number | undefined => {
      for (const c of candidates) {
        if (colMap.has(c)) return colMap.get(c);
      }
      return undefined;
    };

    const titleCol = getColIndex(['booktitle', 'title']);
    const authorCol = getColIndex(['author']);
    const categoryCol = getColIndex(['category']);
    const accessionCol = getColIndex(['accessionnumber', 'accessionno', 'accession']);
    const isbnCol = getColIndex(['isbn']);
    const publisherCol = getColIndex(['publisher']);
    const editionCol = getColIndex(['edition']);
    const yearCol = getColIndex(['publicationyear', 'year']);
    const languageCol = getColIndex(['language']);
    const rackCol = getColIndex(['racklocation', 'rack']);
    const shelfCol = getColIndex(['shelflocation', 'shelf']);
    const barcodeCol = getColIndex(['barcode']);
    const conditionCol = getColIndex(['condition']);
    const priceCol = getColIndex(['purchasePrice', 'price', 'cost']);
    const descCol = getColIndex(['description', 'notes']);

    if (!titleCol || !authorCol || !categoryCol || !accessionCol) {
      throw new BadRequestException(
        'Missing required columns in spreadsheet. Required: Book Title*, Author*, Category*, Accession Number*',
      );
    }

    const validRows: ValidatedCatalogueCopyRowDto[] = [];
    const invalidRows: { rowNumber: number; data: any; errors: string[] }[] = [];
    const duplicateRows: { rowNumber: number; accessionNumber: string; barcode?: string; reason: string; data: any }[] = [];

    const seenAccessionsInFile = new Map<string, number>();
    const seenBarcodesInFile = new Map<string, number>();

    // 1. First Pass: Row validation & in-file duplicate detection
    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      if (!row.hasValues) continue;

      const titleCell = row.getCell(titleCol);
      const authorCell = row.getCell(authorCol);
      const categoryCell = row.getCell(categoryCol);
      const accessionCell = row.getCell(accessionCol);
      const isbnCell = isbnCol ? row.getCell(isbnCol) : null;
      const publisherCell = publisherCol ? row.getCell(publisherCol) : null;
      const editionCell = editionCol ? row.getCell(editionCol) : null;
      const yearCell = yearCol ? row.getCell(yearCol) : null;
      const languageCell = languageCol ? row.getCell(languageCol) : null;
      const rackCell = rackCol ? row.getCell(rackCol) : null;
      const shelfCell = shelfCol ? row.getCell(shelfCol) : null;
      const barcodeCell = barcodeCol ? row.getCell(barcodeCol) : null;
      const conditionCell = conditionCol ? row.getCell(conditionCol) : null;
      const priceCell = priceCol ? row.getCell(priceCol) : null;
      const descCell = descCol ? row.getCell(descCol) : null;

      const titleStr = this.getCellString(titleCell);
      const authorStr = this.getCellString(authorCell);
      const categoryStr = this.getCellString(categoryCell);
      const accessionStr = this.getCellString(accessionCell);
      const isbnStr = isbnCell ? this.getCellString(isbnCell) : '';
      const publisherStr = publisherCell ? this.getCellString(publisherCell) : '';
      const editionStr = editionCell ? this.getCellString(editionCell) : '';
      const yearStr = yearCell ? this.getCellString(yearCell) : '';
      const languageStr = languageCell ? this.getCellString(languageCell) : '';
      const rackStr = rackCell ? this.getCellString(rackCell) : '';
      const shelfStr = shelfCell ? this.getCellString(shelfCell) : '';
      const barcodeStr = barcodeCell ? this.getCellString(barcodeCell) : '';
      const conditionStr = conditionCell ? this.getCellString(conditionCell) : '';
      const priceStr = priceCell ? this.getCellString(priceCell) : '';
      const descStr = descCell ? this.getCellString(descCell) : '';

      // Skip completely blank rows
      if (
        !titleStr &&
        !authorStr &&
        !categoryStr &&
        !accessionStr &&
        !isbnStr &&
        !barcodeStr
      ) {
        continue;
      }

      const rowErrors: string[] = [];

      // Formula rejection check
      const cellsToCheck = [
        { name: 'Book Title', cell: titleCell },
        { name: 'Author', cell: authorCell },
        { name: 'Category', cell: categoryCell },
        { name: 'Accession Number', cell: accessionCell },
        ...(isbnCell ? [{ name: 'ISBN', cell: isbnCell }] : []),
        ...(publisherCell ? [{ name: 'Publisher', cell: publisherCell }] : []),
        ...(editionCell ? [{ name: 'Edition', cell: editionCell }] : []),
        ...(barcodeCell ? [{ name: 'Barcode', cell: barcodeCell }] : []),
        ...(descCell ? [{ name: 'Description', cell: descCell }] : []),
      ];

      for (const item of cellsToCheck) {
        if (this.isFormulaValue(item.cell)) {
          rowErrors.push(
            `Field '${item.name}' contains a formula or formula operator. Formulas are prohibited for security.`,
          );
        }
      }

      // Required field checks
      if (!titleStr) rowErrors.push('Book Title is required');
      if (!authorStr) rowErrors.push('Author is required');
      if (!categoryStr) rowErrors.push('Category is required');
      if (!accessionStr) {
        rowErrors.push('Accession Number is required (no auto-generation)');
      }

      // Field length checks
      if (titleStr.length > 255) rowErrors.push('Book Title exceeds 255 characters');
      if (authorStr.length > 255) rowErrors.push('Author exceeds 255 characters');
      if (categoryStr.length > 100) rowErrors.push('Category exceeds 100 characters');
      if (accessionStr.length > 100) rowErrors.push('Accession Number exceeds 100 characters');
      if (isbnStr.length > 50) rowErrors.push('ISBN exceeds 50 characters');
      if (publisherStr.length > 255) rowErrors.push('Publisher exceeds 255 characters');
      if (editionStr.length > 100) rowErrors.push('Edition exceeds 100 characters');
      if (rackStr.length > 100) rowErrors.push('Rack Location exceeds 100 characters');
      if (shelfStr.length > 100) rowErrors.push('Shelf Location exceeds 100 characters');
      if (barcodeStr.length > 100) rowErrors.push('Barcode exceeds 100 characters');
      if (descStr.length > 2000) rowErrors.push('Description exceeds 2000 characters');

      // Publication year check
      let parsedYear: number | null = null;
      if (yearStr) {
        const yNum = Number(yearStr);
        if (!Number.isInteger(yNum) || yNum < 1000 || yNum > new Date().getFullYear() + 1) {
          rowErrors.push(
            `Publication Year must be a valid 4-digit year up to ${new Date().getFullYear() + 1}`,
          );
        } else {
          parsedYear = yNum;
        }
      }

      // Condition validation: STRICTLY NEW, GOOD, FAIR only
      let parsedCondition: AllowedImportCondition = AllowedImportCondition.GOOD;
      if (conditionStr) {
        const upperCondition = conditionStr.toUpperCase();
        if (upperCondition in AllowedImportCondition) {
          parsedCondition = upperCondition as AllowedImportCondition;
        } else {
          rowErrors.push(
            `Invalid Condition '${conditionStr}'. Catalogue import accepts only 'NEW', 'GOOD', or 'FAIR' (blank defaults to GOOD). DAMAGED, LOST, and RETIRED are prohibited.`,
          );
        }
      }

      // Purchase price check
      let parsedPrice: number | null = null;
      if (priceStr) {
        const pNum = Number(priceStr);
        if (isNaN(pNum) || pNum < 0) {
          rowErrors.push('Purchase Price must be a non-negative numeric amount');
        } else {
          parsedPrice = Math.round(pNum * 100) / 100;
        }
      }

      const rowData = {
        rowNumber: r,
        title: titleStr,
        author: authorStr,
        category: categoryStr,
        accessionNumber: accessionStr,
        isbn: this.normalizeIsbn(isbnStr) || (isbnStr || null),
        publisher: publisherStr || null,
        edition: editionStr || null,
        publicationYear: parsedYear,
        language: languageStr || 'English',
        rackLocation: rackStr || null,
        shelfLocation: shelfStr || null,
        barcode: barcodeStr || null,
        condition: parsedCondition,
        purchasePrice: parsedPrice,
        description: descStr || null,
      };

      // In-file duplicate accession check
      if (accessionStr) {
        const lowerAcc = accessionStr.toLowerCase();
        if (seenAccessionsInFile.has(lowerAcc)) {
          duplicateRows.push({
            rowNumber: r,
            accessionNumber: accessionStr,
            barcode: barcodeStr || undefined,
            reason: `Duplicate Accession Number in file: matches row ${seenAccessionsInFile.get(lowerAcc)}`,
            data: rowData,
          });
          continue;
        }
        seenAccessionsInFile.set(lowerAcc, r);
      }

      // In-file duplicate barcode check
      if (barcodeStr) {
        const lowerBc = barcodeStr.toLowerCase();
        if (seenBarcodesInFile.has(lowerBc)) {
          duplicateRows.push({
            rowNumber: r,
            accessionNumber: accessionStr,
            barcode: barcodeStr,
            reason: `Duplicate Barcode in file: matches row ${seenBarcodesInFile.get(lowerBc)}`,
            data: rowData,
          });
          continue;
        }
        seenBarcodesInFile.set(lowerBc, r);
      }

      if (rowErrors.length > 0) {
        invalidRows.push({
          rowNumber: r,
          data: rowData,
          errors: rowErrors,
        });
      } else {
        validRows.push(rowData);
      }
    }

    // 2. Second Pass: Check existing Database duplicates (Accession & Barcode)
    if (validRows.length > 0) {
      const candidateAccessions = validRows.map((v) => v.accessionNumber);
      const candidateBarcodes = validRows.map((v) => v.barcode).filter((b): b is string => !!b);

      const [existingAccessionCopies, existingBarcodeCopies] = await Promise.all([
        this.prisma.bookCopy.findMany({
          where: {
            schoolId,
            accessionNumber: { in: candidateAccessions },
          },
          select: { accessionNumber: true },
        }),
        candidateBarcodes.length > 0
          ? this.prisma.bookCopy.findMany({
              where: {
                schoolId,
                barcode: { in: candidateBarcodes },
              },
              select: { barcode: true },
            })
          : Promise.resolve([]),
      ]);

      const existingAccessionSet = new Set(
        existingAccessionCopies.map((c) => c.accessionNumber.toLowerCase()),
      );
      const existingBarcodeSet = new Set(
        existingBarcodeCopies.map((c) => (c.barcode ? c.barcode.toLowerCase() : '')),
      );

      for (let i = validRows.length - 1; i >= 0; i--) {
        const row = validRows[i];
        if (existingAccessionSet.has(row.accessionNumber.toLowerCase())) {
          duplicateRows.push({
            rowNumber: row.rowNumber,
            accessionNumber: row.accessionNumber,
            barcode: row.barcode || undefined,
            reason: `Accession Number '${row.accessionNumber}' already exists in the school inventory.`,
            data: row,
          });
          validRows.splice(i, 1);
        } else if (row.barcode && existingBarcodeSet.has(row.barcode.toLowerCase())) {
          duplicateRows.push({
            rowNumber: row.rowNumber,
            accessionNumber: row.accessionNumber,
            barcode: row.barcode,
            reason: `Barcode '${row.barcode}' already exists in the school inventory.`,
            data: row,
          });
          validRows.splice(i, 1);
        }
      }
    }

    // 3. Third Pass: Title Matching & Breakdown
    let newTitlesCount = 0;
    let existingTitlesCount = 0;

    if (validRows.length > 0) {
      // Group candidate valid rows by title key
      const titleKeys = new Set<string>();
      const candidateIsbns = validRows
        .map((r) => this.normalizeIsbn(r.isbn))
        .filter((isbn): isbn is string => !!isbn);

      const existingBooksByIsbn =
        candidateIsbns.length > 0
          ? await this.prisma.book.findMany({
              where: {
                schoolId,
                isbn: { in: candidateIsbns },
              },
              select: { id: true, isbn: true },
            })
          : [];
      const dbIsbnSet = new Set(existingBooksByIsbn.map((b) => (b.isbn ? this.normalizeIsbn(b.isbn) : '')));

      // Group rows by book signature
      const uniqueBookGroups = new Map<string, ValidatedCatalogueCopyRowDto[]>();
      for (const row of validRows) {
        const normIsbn = this.normalizeIsbn(row.isbn);
        const groupKey = normIsbn
          ? `ISBN:${normIsbn}`
          : `META:${row.title.toLowerCase()}|${row.author.toLowerCase()}|${(row.edition || '').toLowerCase()}`;

        if (!uniqueBookGroups.has(groupKey)) {
          uniqueBookGroups.set(groupKey, []);
        }
        uniqueBookGroups.get(groupKey)!.push(row);
      }

      for (const [key, groupRows] of uniqueBookGroups.entries()) {
        const first = groupRows[0];
        const normIsbn = this.normalizeIsbn(first.isbn);

        if (normIsbn && dbIsbnSet.has(normIsbn)) {
          existingTitlesCount++;
        } else {
          // Check by composite title/author/edition in DB
          const existingBook = await this.prisma.book.findFirst({
            where: {
              schoolId,
              title: { equals: first.title, mode: 'insensitive' },
              author: { equals: first.author, mode: 'insensitive' },
              edition: first.edition ? { equals: first.edition, mode: 'insensitive' } : null,
            },
            select: { id: true },
          });

          if (existingBook) {
            existingTitlesCount++;
          } else {
            newTitlesCount++;
          }
        }
      }
    }

    const totalRows = validRows.length + invalidRows.length + duplicateRows.length;
    const canImport = invalidRows.length === 0 && duplicateRows.length === 0 && validRows.length > 0;

    let summaryMessage = '';
    if (canImport) {
      summaryMessage = `Ready to import! Found ${validRows.length} valid copies (${newTitlesCount} new titles to create, ${existingTitlesCount} existing titles receiving copies).`;
    } else if (totalRows === 0) {
      summaryMessage = 'Spreadsheet contains no valid copy records.';
    } else {
      summaryMessage = `Import blocked by All-or-Nothing policy: ${invalidRows.length} invalid rows and ${duplicateRows.length} duplicate copies found. Please correct your spreadsheet and re-upload.`;
    }

    return {
      totalRows,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      duplicateCount: duplicateRows.length,
      newTitlesCount,
      existingTitlesCount,
      canImport,
      validRows,
      invalidRows,
      duplicateRows,
      summaryMessage,
    };
  }

  /**
   * Commits validated catalogue records to the database atomically within a Prisma transaction.
   * If any failure occurs, the entire transaction rolls back cleanly.
   */
  async confirmImport(
    schoolId: string,
    userId: string,
    dto: ConfirmCatalogueImportDto,
  ): Promise<CatalogueImportConfirmResult> {
    const rows = dto.rows;
    if (!rows || rows.length === 0) {
      throw new BadRequestException('No validated rows provided for catalogue import.');
    }

    // 1. In-payload duplicate safety check
    const seenAccessions = new Set<string>();
    const seenBarcodes = new Set<string>();
    for (const r of rows) {
      const acc = r.accessionNumber.trim().toLowerCase();
      if (seenAccessions.has(acc)) {
        throw new BadRequestException(
          `Payload contains duplicate accession number '${r.accessionNumber}'. Strict all-or-nothing blocked.`,
        );
      }
      seenAccessions.add(acc);

      if (r.barcode) {
        const bc = r.barcode.trim().toLowerCase();
        if (seenBarcodes.has(bc)) {
          throw new BadRequestException(
            `Payload contains duplicate barcode '${r.barcode}'. Strict all-or-nothing blocked.`,
          );
        }
        seenBarcodes.add(bc);
      }

      // Enforce condition validation
      if (r.condition && !['NEW', 'GOOD', 'FAIR'].includes(r.condition)) {
        throw new BadRequestException(
          `Invalid condition '${r.condition}' for row ${r.rowNumber}. Only NEW, GOOD, or FAIR are allowed.`,
        );
      }
    }

    // 2. Execute Atomic Transaction
    return this.prisma.$transaction(
      async (tx) => {
        // A. Concurrency race defense: verify none of the accessions or barcodes exist
        const candidateAccessions = rows.map((r) => r.accessionNumber.trim());
        const candidateBarcodes = rows
          .map((r) => (r.barcode ? r.barcode.trim() : ''))
          .filter((b) => b.length > 0);

        const [conflictAccessions, conflictBarcodes] = await Promise.all([
          tx.bookCopy.findMany({
            where: { schoolId, accessionNumber: { in: candidateAccessions } },
            select: { accessionNumber: true },
          }),
          candidateBarcodes.length > 0
            ? tx.bookCopy.findMany({
                where: { schoolId, barcode: { in: candidateBarcodes } },
                select: { barcode: true },
              })
            : Promise.resolve([]),
        ]);

        if (conflictAccessions.length > 0) {
          throw new ConflictException(
            `Accession number '${conflictAccessions[0].accessionNumber}' already exists in the database. Entire batch rolled back.`,
          );
        }

        if (conflictBarcodes.length > 0) {
          throw new ConflictException(
            `Barcode '${conflictBarcodes[0].barcode}' already exists in the database. Entire batch rolled back.`,
          );
        }

        // B. Group copies by Book Title
        const titleGroups = new Map<string, ValidatedCatalogueCopyRowDto[]>();
        for (const row of rows) {
          const normIsbn = this.normalizeIsbn(row.isbn);
          const groupKey = normIsbn
            ? `ISBN:${normIsbn}`
            : `META:${row.title.trim().toLowerCase()}|${row.author.trim().toLowerCase()}|${(row.edition || '').trim().toLowerCase()}`;

          if (!titleGroups.has(groupKey)) {
            titleGroups.set(groupKey, []);
          }
          titleGroups.get(groupKey)!.push(row);
        }

        let titlesCreated = 0;
        let booksUpdated = 0;
        let copiesInserted = 0;

        for (const [groupKey, groupRows] of titleGroups.entries()) {
          const first = groupRows[0];
          const normIsbn = this.normalizeIsbn(first.isbn);

          let targetBookId: string;

          // Check if Book exists by ISBN or composite metadata
          let existingBook = null;
          if (normIsbn) {
            existingBook = await tx.book.findFirst({
              where: { schoolId, isbn: normIsbn },
            });
          }

          if (!existingBook) {
            existingBook = await tx.book.findFirst({
              where: {
                schoolId,
                title: { equals: first.title.trim(), mode: 'insensitive' },
                author: { equals: first.author.trim(), mode: 'insensitive' },
                edition: first.edition
                  ? { equals: first.edition.trim(), mode: 'insensitive' }
                  : null,
              },
            });
          }

          const copiesCount = groupRows.length;

          if (existingBook) {
            targetBookId = existingBook.id;
            await tx.book.update({
              where: { schoolId_id: { schoolId, id: existingBook.id } },
              data: {
                totalCopies: { increment: copiesCount },
                availableCopies: { increment: copiesCount },
              },
            });
            booksUpdated++;
          } else {
            const newBook = await tx.book.create({
              data: {
                schoolId,
                title: first.title.trim(),
                author: first.author.trim(),
                category: first.category.trim(),
                isbn: normIsbn || (first.isbn ? first.isbn.trim() : null),
                publisher: first.publisher ? first.publisher.trim() : null,
                edition: first.edition ? first.edition.trim() : null,
                publicationYear: first.publicationYear || null,
                language: first.language ? first.language.trim() : 'English',
                description: first.description ? first.description.trim() : null,
                totalCopies: copiesCount,
                availableCopies: copiesCount,
              },
            });
            targetBookId = newBook.id;
            titlesCreated++;
          }

          // Create BookCopy records
          for (const copyRow of groupRows) {
            await tx.bookCopy.create({
              data: {
                schoolId,
                bookId: targetBookId,
                accessionNumber: copyRow.accessionNumber.trim(),
                barcode: copyRow.barcode ? copyRow.barcode.trim() : null,
                rackLocation: copyRow.rackLocation ? copyRow.rackLocation.trim() : null,
                shelfLocation: copyRow.shelfLocation ? copyRow.shelfLocation.trim() : null,
                condition: (copyRow.condition as any) || 'GOOD',
                status: 'AVAILABLE',
                purchasePrice:
                  copyRow.purchasePrice !== undefined && copyRow.purchasePrice !== null
                    ? new Prisma.Decimal(copyRow.purchasePrice)
                    : null,
                notes: copyRow.description ? copyRow.description.trim() : null,
              },
            });
            copiesInserted++;
          }
        }

        this.logger.log(
          `Catalogue import successful in school ${schoolId}: ${titlesCreated} titles created, ${booksUpdated} titles updated, ${copiesInserted} copies added by user ${userId}`,
        );

        return {
          totalSubmitted: rows.length,
          titlesCreated,
          copiesInserted,
          booksUpdated,
          message: `Successfully ingested ${copiesInserted} physical copies across ${titlesCreated + booksUpdated} book titles.`,
        };
      },
      { timeout: 30000 },
    );
  }
}
