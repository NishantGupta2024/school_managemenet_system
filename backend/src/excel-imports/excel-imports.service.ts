import {
  Injectable,
  BadRequestException,
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
  constructor(private readonly prisma: PrismaService) {}

  private normalizeKey(header: string): string {
    return header ? header.toString().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  }

  private parseDateValue(val: any): Date | null {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val.getTime())) {
      return val;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        return d;
      }
      // Check DD/MM/YYYY or DD-MM-YYYY format
      const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const year = parseInt(match[3], 10);
        const parsed = new Date(Date.UTC(year, month, day));
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }
    return null;
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
        { header: 'Date of Birth (YYYY-MM-DD)', key: 'dateOfBirth', width: 26 },
        { header: 'Guardian Name', key: 'guardianName', width: 22 },
        { header: 'Guardian Phone', key: 'guardianPhone', width: 18 },
        { header: 'Guardian Email', key: 'guardianEmail', width: 26 },
        { header: 'Admission Date (YYYY-MM-DD)', key: 'admissionDate', width: 26 },
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
    } else if (dto.importType === ImportType.FEE_ALLOCATION) {
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
          const text = cell.text ? cell.text.trim() : null;
          if (text) return text;
          const val = cell.value ? cell.value.toString().trim() : null;
          if (val) return val;
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
        if (concTypeRaw) {
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

        let concessionValue = new Prisma.Decimal(0);
        if (concValRaw !== null && concValRaw !== undefined) {
          const parsedVal = Number(concValRaw);
          if (isNaN(parsedVal) || parsedVal < 0) {
            rowErrors.push(`Concession value must be a non-negative number (received: '${concValRaw}')`);
          } else {
            concessionValue = new Prisma.Decimal(parsedVal);
          }
        }

        if (concessionType === ConcessionType.PERCENTAGE) {
          if (concessionValue.greaterThan(100)) {
            rowErrors.push('Percentage concession cannot exceed 100%');
          }
        } else if (concessionType === ConcessionType.FLAT_DISCOUNT && structure) {
          const totalBase = this.calculateTotalBaseFee(structure.items);
          if (concessionValue.greaterThan(totalBase)) {
            rowErrors.push(
              `Flat concession (${concessionValue}) exceeds structure annual gross fee (${totalBase})`,
            );
          }
        }

        // Start billing month validation (1 = April ... 12 = March)
        let startBillingMonth = 1;
        if (startMonthRaw) {
          const parsedMonth = parseInt(startMonthRaw.toString(), 10);
          if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
            rowErrors.push('Start billing month must be an integer between 1 (April) and 12 (March)');
          } else {
            startBillingMonth = parsedMonth;
          }
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
    let failedCount = 0;
    const errors: { rowNumber: number; message: string }[] = [];

    if (importType === ImportType.STUDENT_MASTER) {
      // Re-fetch existing grades, sections and existing admission numbers to guarantee atomicity
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

      // Execute transactional batch inserts
      await this.prisma.$transaction(
        async (tx) => {
          for (const row of dto.rows) {
            const rowNumber = row.rowNumber || 0;
            const adm = row.admissionNumber ? row.admissionNumber.toString().trim() : null;

            if (!adm) {
              failedCount++;
              errors.push({ rowNumber, message: 'Admission number is required' });
              continue;
            }

            const admUpper = adm.toUpperCase();
            if (existingAdmSet.has(admUpper)) {
              skippedCount++;
              continue;
            }

            if (!row.firstName || !row.lastName || !row.gradeCode || !row.section) {
              failedCount++;
              errors.push({ rowNumber, message: 'Missing required student fields' });
              continue;
            }

            const grade = gradeByCodeOrName.get(row.gradeCode.toString().trim().toUpperCase());
            if (!grade) {
              failedCount++;
              errors.push({ rowNumber, message: `Grade '${row.gradeCode}' not found` });
              continue;
            }

            const secStr = row.section.toString().trim().toUpperCase();
            const section = grade.sections.find(
              (s: any) =>
                s.name.trim().toUpperCase() === secStr ||
                s.name.trim().toUpperCase() === `SECTION ${secStr}` ||
                s.name.trim().toUpperCase().replace(/^SECTION\s*/i, '') === secStr,
            );
            if (!section) {
              failedCount++;
              errors.push({ rowNumber, message: `Section '${row.section}' not found in grade` });
              continue;
            }

            try {
              await tx.student.create({
                data: {
                  schoolId,
                  admissionNumber: adm,
                  firstName: row.firstName.toString().trim(),
                  lastName: row.lastName.toString().trim(),
                  gradeId: grade.id,
                  sectionId: section.id,
                  academicYearId: dto.academicYearId,
                  rollNumber: row.rollNumber ? row.rollNumber.toString().trim() : null,
                  dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
                  guardianName: row.guardianName ? row.guardianName.toString().trim() : null,
                  guardianPhone: row.guardianPhone ? row.guardianPhone.toString().trim() : null,
                  guardianEmail: row.guardianEmail ? row.guardianEmail.toString().trim() : null,
                  admissionDate: row.admissionDate ? new Date(row.admissionDate) : null,
                  status: StudentStatus.ACTIVE,
                },
              });

              existingAdmSet.add(admUpper);
              insertedCount++;
            } catch (err: any) {
              if (err.code === 'P2002') {
                // Concurrent duplicate caught safely by unique constraint
                skippedCount++;
              } else {
                failedCount++;
                errors.push({ rowNumber, message: err.message || 'Database insert failed' });
              }
            }
          }
        },
        { timeout: 30000 },
      );
    } else if (importType === ImportType.FEE_ALLOCATION) {
      // Re-fetch existing students and fee structures in this school
      const [students, structures, existingAllocations] = await Promise.all([
        this.prisma.student.findMany({
          where: { schoolId },
          include: { grade: true },
        }),
        this.prisma.feeStructure.findMany({
          where: {
            schoolId,
            academicYearId: dto.academicYearId,
            status: 'ACTIVE',
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

      await this.prisma.$transaction(
        async (tx) => {
          for (const row of dto.rows) {
            const rowNumber = row.rowNumber || 0;
            const adm = row.admissionNumber ? row.admissionNumber.toString().trim() : null;
            const structName = row.feeStructureName ? row.feeStructureName.toString().trim() : null;

            if (!adm || !structName) {
              failedCount++;
              errors.push({ rowNumber, message: 'Missing admission number or fee structure name' });
              continue;
            }

            const student = studentByAdmission.get(adm.toUpperCase());
            if (!student) {
              failedCount++;
              errors.push({ rowNumber, message: `Student '${adm}' not found` });
              continue;
            }

            const structure = structureByName.get(structName.toUpperCase());
            if (!structure) {
              failedCount++;
              errors.push({ rowNumber, message: `Active fee structure '${structName}' not found` });
              continue;
            }

            if (structure.gradeId !== student.gradeId) {
              failedCount++;
              errors.push({
                rowNumber,
                message: `Grade mismatch: structure is for '${structure.grade.name}', student is in '${student.grade.name}'`,
              });
              continue;
            }

            if (allocatedStudentIdSet.has(student.id)) {
              skippedCount++;
              continue;
            }

            const concType = (row.concessionType as ConcessionType) || ConcessionType.NONE;
            const concVal = new Prisma.Decimal(row.concessionValue || 0);

            try {
              await tx.studentFeeAllocation.create({
                data: {
                  schoolId,
                  studentId: student.id,
                  feeStructureId: structure.id,
                  academicYearId: dto.academicYearId,
                  concessionType: concType,
                  concessionValue: concVal,
                  concessionReason: row.concessionReason ? row.concessionReason.toString().trim() : null,
                  authorizedByUserId: userId,
                  startBillingMonth: row.startBillingMonth ? parseInt(row.startBillingMonth, 10) : 1,
                  status: 'ACTIVE',
                },
              });

              allocatedStudentIdSet.add(student.id);
              insertedCount++;
            } catch (err: any) {
              if (err.code === 'P2002') {
                skippedCount++;
              } else {
                failedCount++;
                errors.push({ rowNumber, message: err.message || 'Database insert failed' });
              }
            }
          }
        },
        { timeout: 30000 },
      );
    }

    return {
      importType,
      academicYearId: dto.academicYearId,
      totalSubmitted: dto.rows.length,
      insertedCount,
      skippedCount,
      failedCount,
      errors,
    };
  }
}
