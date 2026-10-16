import {
  Injectable,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImportType, PreviewImportDto } from './dto/preview-import.dto';
import { ConfirmImportDto } from './dto/confirm-import.dto';
import { ConcessionType, FeeFrequency, Prisma, StudentStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';

export interface RowError {
  rowNumber: number;
  field?: string;
  value?: any;
  message: string;
}

export interface PreviewResult {
  importType: ImportType;
  academicYearId: string;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  validRows: any[];
  invalidRows: { rowNumber: number; data: any; errors: string[] }[];
  duplicateRows: { rowNumber: number; admissionNumber: string; reason: string; data: any }[];
  summaryMessage: string;
}

export interface ConfirmResult {
  importType: ImportType;
  academicYearId: string;
  totalSubmitted: number;
  insertedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: { rowNumber: number; message: string }[];
}

@Injectable()
export class ExcelImportsService {
  private readonly logger = new Logger(ExcelImportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalizeKey(header: string): string {
    if (!header) return '';
    return header
      .toString()
      .replace(/\(.*?\)/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Parses a date value strictly supporting:
   * 1. Excel-native Date objects
   * 2. Indian day-first formats: DD/MM/YYYY and DD-MM-YYYY
   * 3. ISO year-first formats: YYYY-MM-DD and YYYY/MM/DD
   * Rejects ambiguous JS Date strings and impossible calendar dates (e.g., 31/02/2026, 29/02/2026).
   */
  private parseDateValue(val: any): Date | null {
    if (val === null || val === undefined || val === '') return null;

    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null;
      const year = val.getUTCFullYear();
      if (year < 1900 || year > 2100) return null;
      return new Date(Date.UTC(year, val.getUTCMonth(), val.getUTCDate()));
    }

    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return null;

      // 1. Explicit Indian format: DD/MM/YYYY or DD-MM-YYYY (evaluated BEFORE any JS Date parsing)
      const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10);
        const year = parseInt(dmyMatch[3], 10);
        if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
          return null;
        }
        const parsed = new Date(Date.UTC(year, month - 1, day));
        if (
          !isNaN(parsed.getTime()) &&
          parsed.getUTCFullYear() === year &&
          parsed.getUTCMonth() === month - 1 &&
          parsed.getUTCDate() === day
        ) {
          return parsed;
        }
        return null;
      }

      // 2. Explicit ISO format: YYYY-MM-DD or YYYY/MM/DD (with optional ISO time suffix)
      const ymdMatch = trimmed.match(
        /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/,
      );
      if (ymdMatch) {
        const year = parseInt(ymdMatch[1], 10);
        const month = parseInt(ymdMatch[2], 10);
        const day = parseInt(ymdMatch[3], 10);
        if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
          return null;
        }
        const parsed = new Date(Date.UTC(year, month - 1, day));
        if (
          !isNaN(parsed.getTime()) &&
          parsed.getUTCFullYear() === year &&
          parsed.getUTCMonth() === month - 1 &&
          parsed.getUTCDate() === day
        ) {
          return parsed;
        }
        return null;
      }
    }

    return null;
  }

  private parseStartBillingMonth(val: any): number | null {
    if (val === null || val === undefined || val === '') {
      return 1;
    }
    if (typeof val === 'number') {
      if (!Number.isInteger(val) || val < 1 || val > 12) {
        return null;
      }
      return val;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed === '') return 1;
      if (!/^\d+$/.test(trimmed)) {
        return null;
      }
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
        return null;
      }
      return parsed;
    }
    return null;
  }

  private parseConcessionValue(val: any): Prisma.Decimal | null {
    if (val === null || val === undefined || val === '') {
      return new Prisma.Decimal(0);
    }
    if (typeof val === 'boolean' || typeof val === 'object') {
      return null;
    }
    if (typeof val === 'number' && !Number.isFinite(val)) {
      return null;
    }
    const str = val.toString().trim();
    if (str === '') {
      return new Prisma.Decimal(0);
    }
    if (!/^\d+(\.\d{1,2})?$/.test(str)) {
      return null;
    }
    const num = Number(str);
    if (!Number.isFinite(num) || num < 0) {
      return null;
    }
    try {
      return new Prisma.Decimal(str);
    } catch {
      return null;
    }
  }

  private parseCleanString(val: any): string | null {
    if (val === null || val === undefined) return null;
    const str = val.toString().trim();
    return str.length > 0 ? str : null;
  }

  private calculateTotalBaseFee(
    items: { feeHeadId: string; amount: Prisma.Decimal; frequency: FeeFrequency; isOptional: boolean }[],
    optedHeadIds: string[] = [],
  ): Prisma.Decimal {
    const optedSet = new Set(optedHeadIds);
    let total = new Prisma.Decimal(0);

    for (const item of items) {
      if (item.isOptional && !optedSet.has(item.feeHeadId)) {
        continue;
      }

      let multiplier = 1;
      if (item.frequency === FeeFrequency.MONTHLY) {
        multiplier = 12;
      } else if (item.frequency === FeeFrequency.ANNUAL || item.frequency === FeeFrequency.ONE_TIME) {
        multiplier = 1;
      }

      const itemAmount = new Prisma.Decimal(item.amount);
      total = total.add(itemAmount.mul(multiplier));
    }

    return total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  async generateTemplate(type: ImportType): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'School Fee Management System';
    workbook.created = new Date();

    if (type === ImportType.STUDENT_MASTER) {
      const sheet = workbook.addWorksheet('Students');
      sheet.columns = [
        { header: 'Admission Number*', key: 'admissionNumber', width: 22 },
        { header: 'First Name*', key: 'firstName', width: 18 },
        { header: 'Last Name*', key: 'lastName', width: 18 },
        { header: 'Grade Code*', key: 'gradeCode', width: 15 },
        { header: 'Section*', key: 'section', width: 12 },
        { header: 'Roll Number', key: 'rollNumber', width: 15 },
        { header: 'Date of Birth (YYYY-MM-DD / DD/MM/YYYY)', key: 'dateOfBirth', width: 34 },
        { header: 'Guardian Name', key: 'guardianName', width: 22 },
        { header: 'Guardian Phone', key: 'guardianPhone', width: 18 },
        { header: 'Guardian Email', key: 'guardianEmail', width: 26 },
        { header: 'Admission Date (YYYY-MM-DD / DD/MM/YYYY)', key: 'admissionDate', width: 34 },
      ];

      // Format Header Row
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FF1E293B' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
      headerRow.height = 24;

      // Add Sample Demonstration Rows
      sheet.addRow({
        admissionNumber: 'ADM-2026-101',
        firstName: 'Rohan',
        lastName: 'Sharma',
        gradeCode: 'G10',
        section: 'A',
        rollNumber: '101',
        dateOfBirth: '2010-05-15',
        guardianName: 'Rajesh Sharma',
        guardianPhone: '9876543210',
        guardianEmail: 'rajesh.sharma@example.com',
        admissionDate: '2026-04-01',
      });
      sheet.addRow({
        admissionNumber: 'ADM-2026-102',
        firstName: 'Ananya',
        lastName: 'Iyer',
        gradeCode: 'G10',
        section: 'B',
        rollNumber: '102',
        dateOfBirth: '2010-08-22',
        guardianName: 'Venkatesh Iyer',
        guardianPhone: '9876543211',
        guardianEmail: 'venkat.iyer@example.com',
        admissionDate: '2026-04-01',
      });
    } else if (type === ImportType.FEE_ALLOCATION) {
      const sheet = workbook.addWorksheet('Fee Allocations');
      sheet.columns = [
        { header: 'Admission Number*', key: 'admissionNumber', width: 24 },
        { header: 'Fee Structure Name*', key: 'feeStructureName', width: 34 },
        { header: 'Concession Type (NONE/PERCENTAGE/FLAT_DISCOUNT)', key: 'concessionType', width: 44 },
        { header: 'Concession Value', key: 'concessionValue', width: 20 },
        { header: 'Concession Reason', key: 'concessionReason', width: 28 },
        { header: 'Start Billing Month (1=Apr..12=Mar)', key: 'startBillingMonth', width: 34 },
      ];

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FF1E293B' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD1FAE5' },
      };
      headerRow.height = 24;

      sheet.addRow({
        admissionNumber: 'ADM-2026-101',
        feeStructureName: 'Grade 10 General Fee Structure 2026-27',
        concessionType: 'NONE',
        concessionValue: 0,
        concessionReason: '',
        startBillingMonth: 1,
      });
      sheet.addRow({
        admissionNumber: 'ADM-2026-102',
        feeStructureName: 'Grade 10 General Fee Structure 2026-27',
        concessionType: 'PERCENTAGE',
        concessionValue: 10,
        concessionReason: 'Merit Scholarship',
        startBillingMonth: 1,
      });
    }

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  async previewImport(
    schoolId: string,
    fileBuffer: Buffer,
    dto: PreviewImportDto,
  ): Promise<PreviewResult> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty');
    }

    // 1. Verify Academic Year in this school
    const academicYear = await this.prisma.academicYear.findUnique({
      where: { schoolId_id: { schoolId, id: dto.academicYearId } },
    });
    if (!academicYear) {
      throw new NotFoundException(`Academic session ${dto.academicYearId} not found in this school`);
    }

    const importType = dto.importType || dto.type;
    if (!importType) {
      throw new BadRequestException('Import type is required (STUDENT_MASTER or FEE_ALLOCATION)');
    }

    // 2. Parse workbook with ExcelJS
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(fileBuffer as any);
    } catch (err: any) {
      throw new BadRequestException('Failed to parse Excel file. Please ensure it is a valid .xlsx document');
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      throw new BadRequestException('Spreadsheet contains no data rows to import');
    }

    // Row limit safeguard (1,000 data rows maximum per batch)
    const MAX_DATA_ROWS = 1000;
    const totalDataRows = worksheet.rowCount - 1;
    if (totalDataRows > MAX_DATA_ROWS) {
      throw new BadRequestException(
        `File exceeds maximum limit of ${MAX_DATA_ROWS} rows (found ${totalDataRows} rows). Please split into smaller files.`,
      );
    }

    // 3. Map Header Row
    const headerRow = worksheet.getRow(1);
    const colMap = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      const normalized = this.normalizeKey(cell.text || cell.value?.toString() || '');
      if (normalized) {
        colMap.set(normalized, colNumber);
      }
    });

    // Check required columns based on import type
    if (importType === ImportType.STUDENT_MASTER) {
      const hasAdm = colMap.has('admissionnumber') || colMap.has('admissionno');
      const hasFirst = colMap.has('firstname');
      const hasLast = colMap.has('lastname');
      const hasGrade = colMap.has('gradecode') || colMap.has('grade') || colMap.has('class');
      const hasSec = colMap.has('section') || colMap.has('sectionname');

      if (!hasAdm || !hasFirst || !hasLast || !hasGrade || !hasSec) {
        throw new BadRequestException(
          'Missing required column headers for Student Master import. Required: Admission Number, First Name, Last Name, Grade Code, Section',
        );
      }
    } else if (importType === ImportType.FEE_ALLOCATION) {
      const hasAdm = colMap.has('admissionnumber') || colMap.has('admissionno');
      const hasStruct =
        colMap.has('feestructurename') || colMap.has('feestructure') || colMap.has('structurename');

      if (!hasAdm || !hasStruct) {
        throw new BadRequestException(
          'Missing required column headers for Fee Allocation import. Required: Admission Number, Fee Structure Name',
        );
      }
    }

    // Helper to get cell value by possible keys
    const getCellVal = (row: ExcelJS.Row, keys: string[]) => {
      for (const k of keys) {
        const colNum = colMap.get(k);
        if (colNum) {
          const cell = row.getCell(colNum);
          if (cell.value instanceof Date) return cell.value;
          const text = cell.text !== null && cell.text !== undefined ? cell.text.trim() : '';
          if (text !== '') return text;
          const val = cell.value !== null && cell.value !== undefined ? cell.value.toString().trim() : '';
          if (val !== '') return val;
        }
      }
      return null;
    };

    const validRows: any[] = [];
    const invalidRows: { rowNumber: number; data: any; errors: string[] }[] = [];
    const duplicateRows: { rowNumber: number; admissionNumber: string; reason: string; data: any }[] = [];
    const seenAdmissionNumbersInFile = new Set<string>();

    if (importType === ImportType.STUDENT_MASTER) {
      // Pre-load reference metadata for this school
      const [grades, existingStudents] = await Promise.all([
        this.prisma.gradeClass.findMany({
          where: { schoolId },
          include: { sections: true },
        }),
        this.prisma.student.findMany({
          where: { schoolId },
          select: { admissionNumber: true },
        }),
      ]);

      const gradeByCodeOrName = new Map<string, any>();
      for (const g of grades) {
        gradeByCodeOrName.set(g.code.trim().toUpperCase(), g);
        gradeByCodeOrName.set(g.name.trim().toUpperCase(), g);
      }

      const existingAdmSet = new Set(
        existingStudents.map((s) => s.admissionNumber.trim().toUpperCase()),
      );

      for (let r = 2; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        // Skip completely empty rows
        if (!row.hasValues) continue;

        const admRaw = getCellVal(row, ['admissionnumber', 'admissionno']);
        const firstRaw = getCellVal(row, ['firstname']);
        const lastRaw = getCellVal(row, ['lastname']);
        const gradeRaw = getCellVal(row, ['gradecode', 'grade', 'class']);
        const secRaw = getCellVal(row, ['section', 'sectionname']);
        const rollRaw = getCellVal(row, ['rollnumber', 'rollno']);
        const dobRaw = getCellVal(row, ['dateofbirth', 'dob', 'birthdate']);
        const gNameRaw = getCellVal(row, ['guardianname', 'parentname']);
        const gPhoneRaw = getCellVal(row, ['guardianphone', 'parentphone', 'phone']);
        const gEmailRaw = getCellVal(row, ['guardianemail', 'parentemail', 'email']);
        const admDateRaw = getCellVal(row, ['admissiondate', 'enrolldate']);

        // Check if row is blank across all columns
        if (!admRaw && !firstRaw && !lastRaw && !gradeRaw && !secRaw) {
          continue;
        }

        const rowErrors: string[] = [];
        const admissionNumber = this.parseCleanString(admRaw);
        const firstName = this.parseCleanString(firstRaw);
        const lastName = this.parseCleanString(lastRaw);
        const gradeStr = this.parseCleanString(gradeRaw);
        const sectionStr = this.parseCleanString(secRaw);

        if (!admissionNumber) rowErrors.push('Admission number is required');
        if (!firstName) rowErrors.push('First name is required');
        if (!lastName) rowErrors.push('Last name is required');
        if (!gradeStr) rowErrors.push('Grade is required');
        if (!sectionStr) rowErrors.push('Section is required');

        const dob = this.parseDateValue(dobRaw);
        if (dobRaw && !dob) rowErrors.push(`Invalid Date of Birth format: '${dobRaw}'`);

        const admissionDate = this.parseDateValue(admDateRaw);
        if (admDateRaw && !admissionDate) rowErrors.push(`Invalid Admission Date format: '${admDateRaw}'`);

        // Email format check
        const guardianEmail = this.parseCleanString(gEmailRaw);
        if (guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)) {
          rowErrors.push(`Invalid guardian email address format: '${guardianEmail}'`);
        }

        // Grade & Section validation
        let resolvedGrade: any = null;
        let resolvedSection: any = null;

        if (gradeStr) {
          resolvedGrade = gradeByCodeOrName.get(gradeStr.toUpperCase());
          if (!resolvedGrade) {
            rowErrors.push(`Grade '${gradeStr}' does not exist in this school`);
          } else if (sectionStr) {
            resolvedSection = resolvedGrade.sections.find(
              (s: any) =>
                s.name.trim().toUpperCase() === sectionStr.toUpperCase() ||
                s.name.trim().toUpperCase() === `SECTION ${sectionStr.toUpperCase()}` ||
                s.name.trim().toUpperCase().replace(/^SECTION\s*/i, '') === sectionStr.toUpperCase(),
            );
            if (!resolvedSection) {
              rowErrors.push(
                `Section '${sectionStr}' does not exist under Grade '${resolvedGrade.name}' in this school`,
              );
            }
          }
        }

        const rowData = {
          rowNumber: r,
          admissionNumber,
          firstName,
          lastName,
          gradeCode: gradeStr,
          gradeName: resolvedGrade?.name,
          gradeId: resolvedGrade?.id,
          section: sectionStr,
          sectionId: resolvedSection?.id,
          rollNumber: this.parseCleanString(rollRaw),
          dateOfBirth: dob ? dob.toISOString().split('T')[0] : null,
          guardianName: this.parseCleanString(gNameRaw),
          guardianPhone: this.parseCleanString(gPhoneRaw),
          guardianEmail,
          admissionDate: admissionDate ? admissionDate.toISOString().split('T')[0] : null,
          academicYearId: dto.academicYearId,
          academicYearName: academicYear.name,
        };

        if (rowErrors.length > 0) {
          invalidRows.push({
            rowNumber: r,
            data: rowData,
            errors: rowErrors,
          });
          continue;
        }

        // Duplicate checks
        const admUpper = admissionNumber!.toUpperCase();
        if (seenAdmissionNumbersInFile.has(admUpper)) {
          duplicateRows.push({
            rowNumber: r,
            admissionNumber: admissionNumber!,
            reason: `Duplicate admission number '${admissionNumber}' appears multiple times in uploaded file`,
            data: rowData,
          });
          continue;
        }
        seenAdmissionNumbersInFile.add(admUpper);

        if (existingAdmSet.has(admUpper)) {
          duplicateRows.push({
            rowNumber: r,
            admissionNumber: admissionNumber!,
            reason: `Student with admission number '${admissionNumber}' already exists in this school`,
            data: rowData,
          });
          continue;
        }

        validRows.push(rowData);
      }
    } else if (importType === ImportType.FEE_ALLOCATION) {
      // Pre-load reference metadata for Fee Allocations
      const [students, structures] = await Promise.all([
        this.prisma.student.findMany({
          where: { schoolId },
          include: {
            grade: true,
            feeAllocations: {
              where: { academicYearId: dto.academicYearId },
            },
          },
        }),
        this.prisma.feeStructure.findMany({
          where: {
            schoolId,
            academicYearId: dto.academicYearId,
          },
          include: {
            grade: true,
            items: true,
          },
        }),
      ]);

      const studentByAdmission = new Map<string, any>();
      for (const s of students) {
        studentByAdmission.set(s.admissionNumber.trim().toUpperCase(), s);
      }

      const structureByName = new Map<string, any>();
      for (const st of structures) {
        structureByName.set(st.name.trim().toUpperCase(), st);
      }

      for (let r = 2; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        if (!row.hasValues) continue;

        const admRaw = getCellVal(row, ['admissionnumber', 'admissionno']);
        const structRaw = getCellVal(row, ['feestructurename', 'feestructure', 'structurename']);
        const concTypeRaw = getCellVal(row, ['concessiontype', 'discounttype']);
        const concValRaw = getCellVal(row, ['concessionvalue', 'discountvalue', 'discount']);
        const concReasonRaw = getCellVal(row, ['concessionreason', 'discountreason']);
        const startMonthRaw = getCellVal(row, ['startbillingmonth', 'startmonth', 'billingmonth']);

        if (!admRaw && !structRaw) continue;

        const rowErrors: string[] = [];
        const admissionNumber = this.parseCleanString(admRaw);
        const structureName = this.parseCleanString(structRaw);

        if (!admissionNumber) rowErrors.push('Admission number is required');
        if (!structureName) rowErrors.push('Fee structure name is required');

        // Resolve student
        let student: any = null;
        if (admissionNumber) {
          student = studentByAdmission.get(admissionNumber.toUpperCase());
          if (!student) {
            rowErrors.push(`Student with admission number '${admissionNumber}' not found in this school`);
          }
        }

        // Resolve fee structure
        let structure: any = null;
        if (structureName) {
          structure = structureByName.get(structureName.toUpperCase());
          if (!structure) {
            rowErrors.push(
              `Fee structure '${structureName}' not found for academic session '${academicYear.name}' in this school`,
            );
          } else if (structure.status !== 'ACTIVE') {
            rowErrors.push(`Fee structure '${structure.name}' is inactive or archived`);
          }
        }

        // Validate Grade compatibility
        if (student && structure) {
          if (structure.gradeId !== student.gradeId) {
            rowErrors.push(
              `Fee structure is for '${structure.grade.name}', but student is enrolled in '${student.grade.name}'`,
            );
          }
        }

        // Concession validation
        let concessionType: ConcessionType = ConcessionType.NONE;
        if (concTypeRaw !== null && concTypeRaw !== undefined && concTypeRaw !== '') {
          const typeUpper = concTypeRaw.toString().trim().toUpperCase();
          if (typeUpper === 'PERCENTAGE' || typeUpper === 'PCT') {
            concessionType = ConcessionType.PERCENTAGE;
          } else if (typeUpper === 'FLAT_DISCOUNT' || typeUpper === 'FLAT' || typeUpper === 'DISCOUNT') {
            concessionType = ConcessionType.FLAT_DISCOUNT;
          } else if (typeUpper === 'NONE' || typeUpper === '') {
            concessionType = ConcessionType.NONE;
          } else {
            rowErrors.push(`Invalid concession type: '${concTypeRaw}'. Allowed: NONE, PERCENTAGE, FLAT_DISCOUNT`);
          }
        }

        const parsedConcessionVal = this.parseConcessionValue(concValRaw);
        let concessionValue = new Prisma.Decimal(0);
        if (!parsedConcessionVal) {
          rowErrors.push(`Concession value must be a non-negative number (received: '${concValRaw}')`);
        } else {
          concessionValue = parsedConcessionVal;
          if (concessionType === ConcessionType.NONE && concessionValue.greaterThan(0)) {
            rowErrors.push('Concession value must be 0 when concession type is NONE');
          } else if (concessionType === ConcessionType.PERCENTAGE && concessionValue.greaterThan(100)) {
            rowErrors.push('Percentage concession cannot exceed 100%');
          } else if (concessionType === ConcessionType.FLAT_DISCOUNT && structure) {
            const totalBase = this.calculateTotalBaseFee(structure.items);
            if (concessionValue.greaterThan(totalBase)) {
              rowErrors.push(
                `Flat concession (${concessionValue}) exceeds structure annual gross fee (${totalBase})`,
              );
            }
          }
        }

        // Start billing month validation (1 = April ... 12 = March)
        const parsedMonth = this.parseStartBillingMonth(startMonthRaw);
        let startBillingMonth = 1;
        if (parsedMonth === null) {
          rowErrors.push('Start billing month must be an integer between 1 (April) and 12 (March)');
        } else {
          startBillingMonth = parsedMonth;
        }

        const rowData = {
          rowNumber: r,
          admissionNumber,
          studentId: student?.id,
          studentName: student ? `${student.firstName} ${student.lastName}` : null,
          gradeName: student?.grade?.name,
          feeStructureName: structure?.name || structureName,
          feeStructureId: structure?.id,
          concessionType,
          concessionValue: concessionValue.toNumber(),
          concessionReason: this.parseCleanString(concReasonRaw),
          startBillingMonth,
          academicYearId: dto.academicYearId,
          academicYearName: academicYear.name,
        };

        if (rowErrors.length > 0) {
          invalidRows.push({
            rowNumber: r,
            data: rowData,
            errors: rowErrors,
          });
          continue;
        }

        // Duplicate checks
        const admUpper = admissionNumber!.toUpperCase();
        if (seenAdmissionNumbersInFile.has(admUpper)) {
          duplicateRows.push({
            rowNumber: r,
            admissionNumber: admissionNumber!,
            reason: `Duplicate allocation for student '${admissionNumber}' appears multiple times in file`,
            data: rowData,
          });
          continue;
        }
        seenAdmissionNumbersInFile.add(admUpper);

        // Check if student already has active allocation in this session
        if (student && student.feeAllocations.length > 0) {
          duplicateRows.push({
            rowNumber: r,
            admissionNumber: admissionNumber!,
            reason: `Student '${admissionNumber}' already has an active fee allocation in session '${academicYear.name}'`,
            data: rowData,
          });
          continue;
        }

        validRows.push(rowData);
      }
    }

    const totalRows = validRows.length + invalidRows.length + duplicateRows.length;
    return {
      importType,
      academicYearId: dto.academicYearId,
      totalRows,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      duplicateCount: duplicateRows.length,
      validRows,
      invalidRows,
      duplicateRows,
      summaryMessage: `Analyzed ${totalRows} rows: ${validRows.length} valid, ${duplicateRows.length} duplicate, ${invalidRows.length} invalid.`,
    };
  }

  async confirmImport(
    schoolId: string,
    userId: string,
    dto: ConfirmImportDto,
  ): Promise<ConfirmResult> {
    if (!dto.rows || !Array.isArray(dto.rows) || dto.rows.length === 0) {
      throw new BadRequestException('No rows submitted for import confirmation');
    }

    const MAX_CONFIRM_ROWS = 1000;
    if (dto.rows.length > MAX_CONFIRM_ROWS) {
      throw new BadRequestException(
        `Batch size (${dto.rows.length}) exceeds maximum limit of ${MAX_CONFIRM_ROWS} rows per import confirmation`,
      );
    }

    // 1. Verify Academic Year in active tenant
    const academicYear = await this.prisma.academicYear.findUnique({
      where: { schoolId_id: { schoolId, id: dto.academicYearId } },
    });
    if (!academicYear) {
      throw new NotFoundException(`Academic session ${dto.academicYearId} not found in this school`);
    }

    const importType = dto.importType || dto.type;
    if (!importType) {
      throw new BadRequestException('Import type is required (STUDENT_MASTER or FEE_ALLOCATION)');
    }

    let insertedCount = 0;
    let skippedCount = 0;
    const errors: { rowNumber: number; message: string }[] = [];

    if (importType === ImportType.STUDENT_MASTER) {
      // Re-fetch existing grades, sections and existing admission numbers to guarantee tenant-scoped validation
      const [grades, existingStudents] = await Promise.all([
        this.prisma.gradeClass.findMany({
          where: { schoolId },
          include: { sections: true },
        }),
        this.prisma.student.findMany({
          where: { schoolId },
          select: { admissionNumber: true },
        }),
      ]);

      const gradeByCodeOrName = new Map<string, any>();
      for (const g of grades) {
        gradeByCodeOrName.set(g.code.trim().toUpperCase(), g);
        gradeByCodeOrName.set(g.name.trim().toUpperCase(), g);
      }

      const existingAdmSet = new Set(
        existingStudents.map((s) => s.admissionNumber.trim().toUpperCase()),
      );
      const seenAdmInBatch = new Set<string>();
      const studentsToCreate: Prisma.StudentUncheckedCreateInput[] = [];

      // Phase 1: Comprehensive server-side validation of entire batch BEFORE any DB write
      for (let i = 0; i < dto.rows.length; i++) {
        const row = dto.rows[i];
        const rowNumber = typeof row?.rowNumber === 'number' ? row.rowNumber : i + 2;
        if (!row || typeof row !== 'object') {
          errors.push({ rowNumber, message: 'Invalid row structure' });
          continue;
        }

        const rowErrors: string[] = [];
        const adm = this.parseCleanString(row.admissionNumber);
        const firstName = this.parseCleanString(row.firstName);
        const lastName = this.parseCleanString(row.lastName);
        const gradeStr = this.parseCleanString(row.gradeCode);
        const secStr = this.parseCleanString(row.section);
        const rollNumber = this.parseCleanString(row.rollNumber);
        const guardianName = this.parseCleanString(row.guardianName);
        const guardianPhone = this.parseCleanString(row.guardianPhone);
        const guardianEmail = this.parseCleanString(row.guardianEmail);

        if (!adm) rowErrors.push('Admission number is required');
        if (!firstName) rowErrors.push('First name is required');
        if (!lastName) rowErrors.push('Last name is required');
        if (!gradeStr) rowErrors.push('Grade is required');

        let dob: Date | null = null;
        if (row.dateOfBirth !== null && row.dateOfBirth !== undefined && row.dateOfBirth !== '') {
          dob = this.parseDateValue(row.dateOfBirth);
          if (!dob) {
            rowErrors.push(`Invalid Date of Birth format: '${row.dateOfBirth}'`);
          }
        }

        let admissionDate: Date | null = null;
        if (row.admissionDate !== null && row.admissionDate !== undefined && row.admissionDate !== '') {
          admissionDate = this.parseDateValue(row.admissionDate);
          if (!admissionDate) {
            rowErrors.push(`Invalid Admission Date format: '${row.admissionDate}'`);
          }
        }

        if (guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)) {
          rowErrors.push(`Invalid guardian email address format: '${guardianEmail}'`);
        }

        let resolvedGrade: any = null;
        let resolvedSection: any = null;
        if (gradeStr) {
          resolvedGrade = gradeByCodeOrName.get(gradeStr.toUpperCase());
          if (!resolvedGrade) {
            rowErrors.push(`Grade '${gradeStr}' does not exist in this school`);
          } else if (secStr) {
            resolvedSection = resolvedGrade.sections.find(
              (s: any) =>
                s.name.trim().toUpperCase() === secStr.toUpperCase() ||
                s.name.trim().toUpperCase() === `SECTION ${secStr.toUpperCase()}` ||
                s.name.trim().toUpperCase().replace(/^SECTION\s*/i, '') === secStr.toUpperCase(),
            );
            if (!resolvedSection) {
              rowErrors.push(
                `Section '${secStr}' does not exist under Grade '${resolvedGrade.name}' in this school`,
              );
            }
          }
        }

        if (adm) {
          const admUpper = adm.toUpperCase();
          if (seenAdmInBatch.has(admUpper)) {
            rowErrors.push(
              `Duplicate admission number '${adm}' appears multiple times in confirmation batch`,
            );
          } else {
            seenAdmInBatch.add(admUpper);
          }

          // If student already exists in DB and row has no validation errors, safely mark as skipped (idempotent)
          if (existingAdmSet.has(admUpper) && rowErrors.length === 0) {
            skippedCount++;
            continue;
          }
        }

        if (!secStr) {
          rowErrors.push('Section is required');
        }

        if (rowErrors.length > 0) {
          for (const msg of rowErrors) {
            errors.push({ rowNumber, message: msg });
          }
          continue;
        }

        studentsToCreate.push({
          schoolId,
          admissionNumber: adm!,
          firstName: firstName!,
          lastName: lastName!,
          gradeId: resolvedGrade.id,
          sectionId: resolvedSection.id,
          academicYearId: dto.academicYearId,
          rollNumber,
          dateOfBirth: dob,
          guardianName,
          guardianPhone,
          guardianEmail,
          admissionDate,
          status: StudentStatus.ACTIVE,
        });
      }

      // Phase 2: Strict All-or-Nothing Validation Gate
      if (errors.length > 0) {
        const failedRowCount = new Set(errors.map((e) => e.rowNumber)).size;
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: `Import batch rejected: ${failedRowCount} row(s) failed server-side validation. Zero records were written to the database.`,
          importType,
          academicYearId: dto.academicYearId,
          totalSubmitted: dto.rows.length,
          insertedCount: 0,
          skippedCount: 0,
          failedCount: failedRowCount,
          errors,
        });
      }

      // Phase 3: Atomic Prisma transaction for all accepted records (no inner error swallowing)
      if (studentsToCreate.length > 0) {
        try {
          await this.prisma.$transaction(
            async (tx) => {
              for (const studentData of studentsToCreate) {
                await tx.student.create({ data: studentData });
              }
            },
            { timeout: 30000 },
          );
          insertedCount = studentsToCreate.length;
        } catch (err: any) {
          this.logger.error(
            `Student Master import transaction rolled back for school ${schoolId} (code=${err?.code || 'UNKNOWN'})`,
          );
          if (err?.code === 'P2002') {
            throw new ConflictException({
              statusCode: 409,
              error: 'Conflict',
              message:
                'Import transaction rolled back because one or more student admission numbers already exist. Zero records were committed.',
              importType,
              academicYearId: dto.academicYearId,
              totalSubmitted: dto.rows.length,
              insertedCount: 0,
              skippedCount: 0,
              failedCount: studentsToCreate.length,
              errors: [],
            });
          }
          if (err?.code === 'P2003') {
            throw new BadRequestException({
              statusCode: 400,
              error: 'Bad Request',
              message:
                'Import transaction rolled back due to an invalid reference constraint. Zero records were committed.',
              importType,
              academicYearId: dto.academicYearId,
              totalSubmitted: dto.rows.length,
              insertedCount: 0,
              skippedCount: 0,
              failedCount: studentsToCreate.length,
              errors: [],
            });
          }
          throw new InternalServerErrorException({
            statusCode: 500,
            error: 'Internal Server Error',
            message:
              'A database error occurred during import execution. The transaction was completely rolled back and zero records were committed.',
            importType,
            academicYearId: dto.academicYearId,
            totalSubmitted: dto.rows.length,
            insertedCount: 0,
            skippedCount: 0,
            failedCount: studentsToCreate.length,
            errors: [],
          });
        }
      }
    } else if (importType === ImportType.FEE_ALLOCATION) {
      // Re-fetch existing students, fee structures (including items for base fee check), and allocations
      const [students, structures, existingAllocations] = await Promise.all([
        this.prisma.student.findMany({
          where: { schoolId },
          include: { grade: true },
        }),
        this.prisma.feeStructure.findMany({
          where: {
            schoolId,
            academicYearId: dto.academicYearId,
          },
          include: { grade: true, items: true },
        }),
        this.prisma.studentFeeAllocation.findMany({
          where: {
            schoolId,
            academicYearId: dto.academicYearId,
          },
          select: { studentId: true },
        }),
      ]);

      const studentByAdmission = new Map<string, any>();
      for (const s of students) {
        studentByAdmission.set(s.admissionNumber.trim().toUpperCase(), s);
      }

      const structureByName = new Map<string, any>();
      for (const st of structures) {
        structureByName.set(st.name.trim().toUpperCase(), st);
      }

      const allocatedStudentIdSet = new Set(existingAllocations.map((a) => a.studentId));
      const seenAdmInBatch = new Set<string>();
      const allocationsToCreate: Prisma.StudentFeeAllocationUncheckedCreateInput[] = [];

      // Phase 1: Comprehensive server-side validation of entire batch BEFORE any DB write
      for (let i = 0; i < dto.rows.length; i++) {
        const row = dto.rows[i];
        const rowNumber = typeof row?.rowNumber === 'number' ? row.rowNumber : i + 2;
        if (!row || typeof row !== 'object') {
          errors.push({ rowNumber, message: 'Invalid row structure' });
          continue;
        }

        const rowErrors: string[] = [];
        const adm = this.parseCleanString(row.admissionNumber);
        const structName = this.parseCleanString(row.feeStructureName);

        if (!adm) rowErrors.push('Admission number is required');
        if (!structName) rowErrors.push('Fee structure name is required');

        let student: any = null;
        if (adm) {
          const admUpper = adm.toUpperCase();
          if (seenAdmInBatch.has(admUpper)) {
            rowErrors.push(
              `Duplicate allocation for student '${adm}' appears multiple times in confirmation batch`,
            );
          } else {
            seenAdmInBatch.add(admUpper);
          }

          student = studentByAdmission.get(admUpper);
          if (!student) {
            rowErrors.push(`Student with admission number '${adm}' not found in this school`);
          }
        }

        let structure: any = null;
        if (structName) {
          structure = structureByName.get(structName.toUpperCase());
          if (!structure) {
            rowErrors.push(
              `Fee structure '${structName}' not found for academic session '${academicYear.name}' in this school`,
            );
          } else if (structure.status !== 'ACTIVE') {
            rowErrors.push(`Fee structure '${structure.name}' is inactive or archived`);
          }
        }

        if (student && structure && structure.gradeId !== student.gradeId) {
          rowErrors.push(
            `Grade mismatch: fee structure is for '${structure.grade.name}', but student is enrolled in '${student.grade.name}'`,
          );
        }

        // Re-validate concessionType against allowed enum
        let concessionType: ConcessionType = ConcessionType.NONE;
        if (row.concessionType !== null && row.concessionType !== undefined && row.concessionType !== '') {
          const rawType = row.concessionType.toString().trim().toUpperCase();
          if (rawType === ConcessionType.NONE) {
            concessionType = ConcessionType.NONE;
          } else if (rawType === ConcessionType.PERCENTAGE) {
            concessionType = ConcessionType.PERCENTAGE;
          } else if (rawType === ConcessionType.FLAT_DISCOUNT) {
            concessionType = ConcessionType.FLAT_DISCOUNT;
          } else {
            rowErrors.push(
              `Invalid concession type: '${row.concessionType}'. Allowed: NONE, PERCENTAGE, FLAT_DISCOUNT`,
            );
          }
        }

        // Re-validate concessionValue as finite, non-negative monetary value and enforce caps
        const parsedConcessionVal = this.parseConcessionValue(row.concessionValue);
        let concessionValue = new Prisma.Decimal(0);
        if (!parsedConcessionVal) {
          rowErrors.push(
            `Concession value must be a finite, non-negative number (received: '${row.concessionValue}')`,
          );
        } else {
          concessionValue = parsedConcessionVal;
          if (concessionType === ConcessionType.NONE && concessionValue.greaterThan(0)) {
            rowErrors.push('Concession value must be 0 when concession type is NONE');
          } else if (concessionType === ConcessionType.PERCENTAGE && concessionValue.greaterThan(100)) {
            rowErrors.push('Percentage concession cannot exceed 100%');
          } else if (concessionType === ConcessionType.FLAT_DISCOUNT && structure) {
            const totalBase = this.calculateTotalBaseFee(structure.items);
            if (concessionValue.greaterThan(totalBase)) {
              rowErrors.push(
                `Flat concession (${concessionValue}) exceeds structure annual gross fee (${totalBase})`,
              );
            }
          }
        }

        // Re-validate startBillingMonth as integer 1..12
        const parsedMonth = this.parseStartBillingMonth(row.startBillingMonth);
        let startBillingMonth = 1;
        if (parsedMonth === null) {
          rowErrors.push('Start billing month must be an integer between 1 (April) and 12 (March)');
        } else {
          startBillingMonth = parsedMonth;
        }

        if (rowErrors.length > 0) {
          for (const msg of rowErrors) {
            errors.push({ rowNumber, message: msg });
          }
          continue;
        }

        // If student already has an active allocation in DB and row has no validation errors, safely mark as skipped
        if (student && allocatedStudentIdSet.has(student.id)) {
          skippedCount++;
          continue;
        }

        allocationsToCreate.push({
          schoolId,
          studentId: student.id,
          feeStructureId: structure.id,
          academicYearId: dto.academicYearId,
          concessionType,
          concessionValue,
          concessionReason: this.parseCleanString(row.concessionReason),
          authorizedByUserId: userId,
          startBillingMonth,
          status: 'ACTIVE',
        });
      }

      // Phase 2: Strict All-or-Nothing Validation Gate
      if (errors.length > 0) {
        const failedRowCount = new Set(errors.map((e) => e.rowNumber)).size;
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: `Import batch rejected: ${failedRowCount} row(s) failed server-side validation. Zero records were written to the database.`,
          importType,
          academicYearId: dto.academicYearId,
          totalSubmitted: dto.rows.length,
          insertedCount: 0,
          skippedCount: 0,
          failedCount: failedRowCount,
          errors,
        });
      }

      // Phase 3: Atomic Prisma transaction for all accepted records (no inner error swallowing)
      if (allocationsToCreate.length > 0) {
        try {
          await this.prisma.$transaction(
            async (tx) => {
              for (const allocData of allocationsToCreate) {
                await tx.studentFeeAllocation.create({ data: allocData });
              }
            },
            { timeout: 30000 },
          );
          insertedCount = allocationsToCreate.length;
        } catch (err: any) {
          this.logger.error(
            `Fee Allocation import transaction rolled back for school ${schoolId} (code=${err?.code || 'UNKNOWN'})`,
          );
          if (err?.code === 'P2002') {
            throw new ConflictException({
              statusCode: 409,
              error: 'Conflict',
              message:
                'Import transaction rolled back because one or more students already have a fee allocation in this session. Zero records were committed.',
              importType,
              academicYearId: dto.academicYearId,
              totalSubmitted: dto.rows.length,
              insertedCount: 0,
              skippedCount: 0,
              failedCount: allocationsToCreate.length,
              errors: [],
            });
          }
          if (err?.code === 'P2003') {
            throw new BadRequestException({
              statusCode: 400,
              error: 'Bad Request',
              message:
                'Import transaction rolled back due to an invalid reference constraint. Zero records were committed.',
              importType,
              academicYearId: dto.academicYearId,
              totalSubmitted: dto.rows.length,
              insertedCount: 0,
              skippedCount: 0,
              failedCount: allocationsToCreate.length,
              errors: [],
            });
          }
          throw new InternalServerErrorException({
            statusCode: 500,
            error: 'Internal Server Error',
            message:
              'A database error occurred during import execution. The transaction was completely rolled back and zero records were committed.',
            importType,
            academicYearId: dto.academicYearId,
            totalSubmitted: dto.rows.length,
            insertedCount: 0,
            skippedCount: 0,
            failedCount: allocationsToCreate.length,
            errors: [],
          });
        }
      }
    }

    return {
      importType,
      academicYearId: dto.academicYearId,
      totalSubmitted: dto.rows.length,
      insertedCount,
      skippedCount,
      failedCount: 0,
      errors: [],
    };
  }
}

