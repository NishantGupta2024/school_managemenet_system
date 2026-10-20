import { BadRequestException, Injectable } from '@nestjs/common';
import { School } from '@prisma/client';
import * as ExcelJS from 'exceljs';
const PDFDocument = require('pdfkit');
import { ReportsService } from './reports.service';
import { ReportConfigService } from './report-config.service';
import { ReportConfig, ReportType, TableColumnConfig } from './dto/report-config.dto';
import { ExportFormat, ExportReportQueryDto } from './dto/export-report-query.dto';

/**
 * Sanitizes cell values against CSV/Spreadsheet formula injection (CWE-1236).
 * Prepends a single quote if the first character is =, +, -, @, tab, or carriage return.
 */
export function sanitizeCellValue(val: any): any {
  if (val === null || val === undefined) {
    return '';
  }
  if (typeof val === 'number') {
    return val;
  }
  if (typeof val === 'boolean') {
    return val ? 'Yes' : 'No';
  }
  if (val instanceof Date) {
    return val.toISOString();
  }

  let str = String(val);
  // Detect formula prefix characters: =, +, -, @, \t, \r
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return str;
}

/**
 * Escapes a cell value for RFC 4180 CSV compliance.
 * Quotes the string if it contains commas, double quotes, or newlines.
 */
export function escapeCsvField(val: any): string {
  if (val === null || val === undefined) {
    return '';
  }
  const sanitized = sanitizeCellValue(val);
  let str = String(sanitized);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

@Injectable()
export class ReportsExportService {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportConfigService: ReportConfigService,
  ) {}

  /**
   * Authoritative entry point for exporting fee reports as CSV or XLSX.
   */
  async exportReport(
    school: School,
    reportTypeInput: string,
    query: ExportReportQueryDto,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    // 1. Validate format
    const format = (query.format || '').toLowerCase().trim();
    if (
      format !== ExportFormat.CSV &&
      format !== ExportFormat.XLSX &&
      format !== ExportFormat.PDF
    ) {
      throw new BadRequestException(
        "format must be one of: 'csv', 'xlsx', 'pdf'",
      );
    }

    // 2. Validate and normalize report type
    const normalizedReportType = reportTypeInput.replace(/-/g, '_').toUpperCase();
    if (!Object.values(ReportType).includes(normalizedReportType as ReportType)) {
      throw new BadRequestException(
        `Unsupported reportType '${reportTypeInput}'. Supported types: ${Object.values(ReportType).join(', ')}`,
      );
    }
    const reportType = normalizedReportType as ReportType;

    // 3. Retrieve authoritative report data from ReportsService
    const reportData = await this.getReportData(school, reportType, query);
    const config: ReportConfig =
      reportData.config || this.reportConfigService.getReportConfig(school, reportType);

    // 4. Resolve visible columns in configured order
    const visibleColumns = config.table.columns
      .filter((col) => col.visible !== false)
      .sort((a, b) => a.order - b.order);

    // 5. Map data into rows matching column keys
    const rows = this.extractReportRows(reportType, reportData, school);

    // 6. Generate filename
    const dateStamp = new Intl.DateTimeFormat('en-CA', {
      timeZone: school.timezone || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const filename = `${reportType.toLowerCase()}_${dateStamp}.${format}`;

    // 7. Render appropriate format
    if (format === ExportFormat.CSV) {
      const csvBuffer = this.renderCsv(visibleColumns, rows, config, reportData);
      return {
        buffer: csvBuffer,
        filename,
        contentType: 'text/csv; charset=utf-8',
      };
    } else if (format === ExportFormat.XLSX) {
      const xlsxBuffer = await this.renderXlsx(
        visibleColumns,
        rows,
        config,
        reportData,
        school,
      );
      return {
        buffer: xlsxBuffer,
        filename,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    } else {
      const pdfBuffer = await this.renderPdf(
        visibleColumns,
        rows,
        config,
        reportData,
        school,
      );
      return {
        buffer: pdfBuffer,
        filename,
        contentType: 'application/pdf',
      };
    }
  }

  /**
   * Delegates query execution to authoritative reporting methods.
   */
  private async getReportData(
    school: School,
    reportType: ReportType,
    query: ExportReportQueryDto,
  ): Promise<any> {
    switch (reportType) {
      case ReportType.DAILY_COLLECTION:
        return this.reportsService.getDailyCollection(school, {
          date: query.date,
          academicYearId: query.academicYearId,
          paymentMethod: query.paymentMethod,
        });

      case ReportType.MONTHLY_COLLECTION:
        return this.reportsService.getMonthlyCollection(school, {
          year: query.year,
          month: query.month,
          academicYearId: query.academicYearId,
          paymentMethod: query.paymentMethod,
        });

      case ReportType.COLLECTION_SUMMARY:
        if (!query.startDate || !query.endDate) {
          throw new BadRequestException(
            'Both startDate and endDate are required for collection summary report',
          );
        }
        return this.reportsService.getCollectionSummary(school, {
          startDate: query.startDate,
          endDate: query.endDate,
          academicYearId: query.academicYearId,
          paymentMethod: query.paymentMethod,
        });

      case ReportType.OUTSTANDING_DUES:
        return this.reportsService.getOutstandingDues(school, {
          ...query,
          isExport: true,
        } as any);

      case ReportType.CLASS_COLLECTION:
        return this.reportsService.getClassCollections(school, {
          startDate: query.startDate,
          endDate: query.endDate,
          academicYearId: query.academicYearId,
          gradeId: query.gradeId,
          sectionId: query.sectionId,
          paymentMethod: query.paymentMethod,
        });

      case ReportType.FINE_SUMMARY:
        return this.reportsService.getFineSummary(school, {
          startDate: query.startDate,
          endDate: query.endDate,
          academicYearId: query.academicYearId,
          gradeId: query.gradeId,
          sectionId: query.sectionId,
          fineRuleId: query.fineRuleId,
        });

      case ReportType.DEFAULTER_REPORT:
        return this.reportsService.getDefaultersReport(school, {
          ...query,
          isExport: true,
        } as any);
    }
  }

  /**
   * Extracts flat tabular rows from raw report data corresponding to table column keys.
   */
  private extractReportRows(
    reportType: ReportType,
    reportData: any,
    school: School,
  ): Record<string, any>[] {
    const timeZone = school.timezone || 'Asia/Kolkata';

    switch (reportType) {
      case ReportType.DAILY_COLLECTION: {
        const txs: any[] = reportData.transactions || [];
        return txs.map((t) => {
          let paymentTime = 'N/A';
          if (t.paymentDate) {
            try {
              paymentTime = new Intl.DateTimeFormat('en-US', {
                timeZone,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              }).format(new Date(t.paymentDate));
            } catch {
              paymentTime = new Date(t.paymentDate).toISOString().substring(11, 19);
            }
          }
          const gradeSec = [t.student?.grade, t.student?.section]
            .filter(Boolean)
            .join(' - ');

          return {
            receiptNumber: t.receiptNumber || 'N/A',
            paymentTime,
            admissionNumber: t.student?.admissionNumber || 'N/A',
            studentName: t.student?.name || 'N/A',
            gradeSection: gradeSec || 'N/A',
            paymentMethod: t.paymentMethod || 'N/A',
            referenceNumber: t.referenceNumber || 'N/A',
            amount: Number(t.amount || 0),
          };
        });
      }

      case ReportType.MONTHLY_COLLECTION: {
        const items: any[] = reportData.dailyBreakdown || [];
        return items.map((i) => ({
          date: i.date,
          grossCollections: Number(i.grossCollections || 0),
          totalReversals: Number(i.totalReversals || 0),
          totalRefunds: Number(i.totalRefunds || 0),
          netCollections: Number(i.netCollections || 0),
          transactionCount: Number(i.transactionCount || 0),
        }));
      }

      case ReportType.COLLECTION_SUMMARY: {
        const items: any[] = reportData.periodicBreakdown || [];
        return items.map((i) => ({
          period: i.period,
          grossCollections: Number(i.grossCollections || 0),
          totalReversals: Number(i.totalReversals || 0),
          totalRefunds: Number(i.totalRefunds || 0),
          netCollections: Number(i.netCollections || 0),
          transactionCount: Number(i.transactionCount || 0),
        }));
      }

      case ReportType.OUTSTANDING_DUES: {
        const records: any[] = reportData.records || [];
        return records.map((r) => {
          const gradeSec = [r.grade?.name, r.section?.name].filter(Boolean).join(' - ');
          return {
            admissionNumber: r.admissionNumber || 'N/A',
            studentName: r.studentName || 'N/A',
            gradeSection: gradeSec || 'N/A',
            totalBilled: Number(r.totalBilled || 0),
            totalPaid: Number(r.totalPaid || 0),
            fineBalance: Number(r.fineBalance || 0),
            outstandingBalance: Number(r.outstandingBalance || 0),
            overdueDays: Number(r.maxOverdueDays || 0),
            status: r.status || 'N/A',
          };
        });
      }

      case ReportType.CLASS_COLLECTION: {
        const items: any[] = reportData.byClass || [];
        return items.map((c) => ({
          gradeName: c.gradeName || 'N/A',
          sectionName: c.sectionName || 'N/A',
          grossCollections: Number(c.grossCollections || 0),
          totalReversals: Number(c.totalReversals || 0),
          totalRefunds: Number(c.totalRefunds || 0),
          netCollections: Number(c.netCollections || 0),
          transactionCount: Number(c.transactionCount || 0),
        }));
      }

      case ReportType.FINE_SUMMARY: {
        const items: any[] = reportData.byClass || [];
        return items.map((f) => ({
          gradeSection: `${f.gradeName || 'N/A'} - ${f.sectionName || 'N/A'}`,
          totalAssessed: Number(f.totalAssessed || 0),
          totalWaived: Number(f.totalWaived || 0),
          totalCollected: Number(f.totalCollected || 0),
          totalReversals: Number(f.totalReversals || 0),
          totalRefunds: Number(f.totalRefunds || 0),
          netCollected: Number(f.netCollected || 0),
          remainingBalance: Number(f.remainingBalance || 0),
          fineCount: Number(f.fineCount || 0),
        }));
      }

      case ReportType.DEFAULTER_REPORT: {
        const records: any[] = reportData.records || [];
        return records.map((r) => {
          const gradeSec = [r.grade?.name, r.section?.name].filter(Boolean).join(' - ');
          return {
            admissionNumber: r.admissionNumber || 'N/A',
            studentName: r.studentName || 'N/A',
            gradeSection: gradeSec || 'N/A',
            overduePrincipal: Number(r.overduePrincipal || 0),
            overdueFines: Number(r.overdueFines || 0),
            overdueAmount: Number(r.overdueAmount || 0),
            maxOverdueDays: Number(r.maxOverdueDays || 0),
            outstandingBalance: Number(r.outstandingBalance || 0),
            guardianPhone: r.guardian?.phone || 'N/A',
          };
        });
      }
    }
  }

  /**
   * Builds an RFC 4180 compliant CSV string with formula sanitization.
   */
  private renderCsv(
    columns: TableColumnConfig[],
    rows: Record<string, any>[],
    config: ReportConfig,
    reportData: any,
  ): Buffer {
    const lines: string[] = [];

    // Header row
    const headerRow = columns.map((col) => escapeCsvField(col.label)).join(',');
    lines.push(headerRow);

    // Data rows
    for (const row of rows) {
      const line = columns
        .map((col) => {
          const val = row[col.key];
          return escapeCsvField(val);
        })
        .join(',');
      lines.push(line);
    }

    // Totals row if data rows exist
    if (rows.length > 0) {
      const totalsRow = columns.map((col, idx) => {
        if (idx === 0) {
          return escapeCsvField('TOTAL');
        }
        const numericSum = this.calculateColumnSum(rows, col.key);
        if (numericSum !== null) {
          return escapeCsvField(Number(numericSum.toFixed(2)));
        }
        return '';
      });
      lines.push(totalsRow.join(','));
    }

    return Buffer.from(lines.join('\r\n'), 'utf-8');
  }

  /**
   * Generates a professionally formatted Excel spreadsheet with school branding,
   * summary cards, styled tables, and typed cell formulas.
   */
  private async renderXlsx(
    columns: TableColumnConfig[],
    rows: Record<string, any>[],
    config: ReportConfig,
    reportData: any,
    school: School,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = config.branding.schoolName || 'School Fee Management SaaS';
    workbook.created = new Date();

    const safeSheetTitle = config.title
      .substring(0, 31)
      .replace(/[:*?/\\[\\]]/g, '');
    const sheet = workbook.addWorksheet(safeSheetTitle, {
      pageSetup: {
        orientation:
          config.styling.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait',
        paperSize: 9, // A4
        fitToPage: true,
      },
    });

    const primaryColorHex =
      (config.styling.primaryColor || '#1E3A8A').replace('#', '').toUpperCase();
    const secondaryColorHex =
      (config.styling.secondaryColor || '#3B82F6').replace('#', '').toUpperCase();

    // 1. School Branding Banner
    const schoolRow = sheet.addRow([config.branding.schoolName]);
    schoolRow.font = {
      name: 'Calibri',
      size: 16,
      bold: true,
      color: { argb: `FF${primaryColorHex}` },
    };
    schoolRow.height = 24;

    if (config.branding.headerAddress) {
      const addrRow = sheet.addRow([config.branding.headerAddress]);
      addrRow.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } };
      addrRow.height = 16;
    }

    // 2. Report Title
    const titleRow = sheet.addRow([config.title]);
    titleRow.font = {
      name: 'Calibri',
      size: 13,
      bold: true,
      color: { argb: 'FF0F172A' },
    };
    titleRow.height = 20;

    // 3. Metadata Subtitle (Date, Currency, Timezone)
    const timeZone = school.timezone || 'Asia/Kolkata';
    const genDateStr = new Intl.DateTimeFormat('en-IN', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date());

    let periodStr = '';
    if (reportData.period) {
      if (reportData.period.date) {
        periodStr = `Date: ${reportData.period.date} | `;
      } else if (reportData.period.startDate && reportData.period.endDate) {
        periodStr = `Period: ${reportData.period.startDate} to ${reportData.period.endDate} | `;
      } else if (reportData.period.year && reportData.period.month) {
        periodStr = `Period: ${reportData.period.year}-${String(reportData.period.month).padStart(2, '0')} | `;
      }
    }

    const metaRow = sheet.addRow([
      `${periodStr}Currency: ${config.display.currencyCode} (${config.display.currencySymbol}) | Generated: ${genDateStr} (${timeZone})`,
    ]);
    metaRow.font = { name: 'Calibri', size: 9, color: { argb: 'FF64748B' } };
    metaRow.height = 16;

    // Empty spacer row
    sheet.addRow([]);

    // 4. Summary KPI Cards Row (if summary is present)
    if (reportData.summary) {
      const summaryEntries = this.buildSummaryCardList(config.reportType, reportData.summary);
      if (summaryEntries.length > 0) {
        const labels = summaryEntries.map((e) => e.label);
        const values = summaryEntries.map((e) => e.value);

        const cardLabelRow = sheet.addRow(labels);
        cardLabelRow.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF475569' } };
        cardLabelRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
        cardLabelRow.height = 18;

        const cardValRow = sheet.addRow(values);
        cardValRow.font = {
          name: 'Calibri',
          size: 11,
          bold: true,
          color: { argb: `FF${primaryColorHex}` },
        };
        cardValRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
        cardValRow.height = 22;

        sheet.addRow([]);
      }
    }

    // 5. Table Header Row
    const headerLabels = columns.map((col) => col.label);
    const tableHeaderRow = sheet.addRow(headerLabels);
    tableHeaderRow.height = 24;

    tableHeaderRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${primaryColorHex}` },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    // 6. Data Rows
    let rowIndex = 0;
    for (const row of rows) {
      const cellValues = columns.map((col) => {
        const val = row[col.key];
        return sanitizeCellValue(val);
      });
      const dataRow = sheet.addRow(cellValues);
      dataRow.height = 20;

      const isEven = rowIndex % 2 === 0;
      const rowBgColor = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

      dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const col = columns[colNumber - 1];
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBgColor },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        // Format numeric cells
        if (typeof cell.value === 'number') {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          if (
            col.key.toLowerCase().includes('count') ||
            col.key.toLowerCase().includes('days') ||
            col.key.toLowerCase().includes('year')
          ) {
            cell.numFmt = '#,##0';
          } else {
            cell.numFmt = '#,##0.00';
          }
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });

      rowIndex++;
    }

    // 7. Totals Row
    if (rows.length > 0) {
      const totals = columns.map((col, idx) => {
        if (idx === 0) return 'TOTAL';
        const sum = this.calculateColumnSum(rows, col.key);
        return sum !== null ? Number(sum.toFixed(2)) : '';
      });

      const totalRow = sheet.addRow(totals);
      totalRow.height = 22;

      totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const col = columns[colNumber - 1];
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF0F172A' } },
          bottom: { style: 'double', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        if (typeof cell.value === 'number') {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          if (col.key.toLowerCase().includes('count')) {
            cell.numFmt = '#,##0';
          } else {
            cell.numFmt = '#,##0.00';
          }
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
    }

    // 8. Auto-fit column widths
    columns.forEach((col, index) => {
      let maxLen = col.label.length;
      rows.forEach((r) => {
        const val = r[col.key];
        if (val !== undefined && val !== null) {
          const str = String(val);
          if (str.length > maxLen) maxLen = str.length;
        }
      });
      const column = sheet.getColumn(index + 1);
      column.width = Math.max(14, Math.min(45, maxLen + 4));
    });

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  /**
   * Calculates numeric sum for a column if all row values for that key are numeric.
   */
  private calculateColumnSum(rows: Record<string, any>[], key: string): number | null {
    if (rows.length === 0) return null;

    let hasNumeric = false;
    let sum = 0;

    for (const r of rows) {
      const v = r[key];
      if (typeof v === 'number' && !isNaN(v)) {
        hasNumeric = true;
        sum += v;
      } else if (v !== null && v !== undefined && v !== '') {
        // Non-empty non-numeric value means this column is not summable
        return null;
      }
    }

    // Do not sum days or identifiers
    if (key.toLowerCase().includes('day') || key.toLowerCase().includes('id')) {
      return null;
    }

    return hasNumeric ? sum : null;
  }

  /**
   * Formats KPI cards for the XLSX summary banner.
   */
  private buildSummaryCardList(
    reportType: ReportType,
    summary: any,
  ): { label: string; value: string }[] {
    const list: { label: string; value: string }[] = [];

    switch (reportType) {
      case ReportType.OUTSTANDING_DUES:
        if (summary.totalStudents !== undefined)
          list.push({ label: 'TOTAL STUDENTS', value: String(summary.totalStudents) });
        if (summary.totalBilledAmount !== undefined)
          list.push({ label: 'TOTAL BILLED', value: summary.totalBilledAmount.toFixed(2) });
        if (summary.totalPaidAmount !== undefined)
          list.push({ label: 'TOTAL PAID', value: summary.totalPaidAmount.toFixed(2) });
        if (summary.totalOutstandingAmount !== undefined)
          list.push({ label: 'OUTSTANDING', value: summary.totalOutstandingAmount.toFixed(2) });
        if (summary.totalOverdueAmount !== undefined)
          list.push({ label: 'TOTAL OVERDUE', value: summary.totalOverdueAmount.toFixed(2) });
        break;

      case ReportType.DEFAULTER_REPORT:
        if (summary.overdueStudentsCount !== undefined)
          list.push({ label: 'OVERDUE STUDENTS', value: String(summary.overdueStudentsCount) });
        if (summary.totalOverduePrincipal !== undefined)
          list.push({ label: 'OVERDUE PRINCIPAL', value: summary.totalOverduePrincipal.toFixed(2) });
        if (summary.totalOverdueFines !== undefined)
          list.push({ label: 'OVERDUE FINES', value: summary.totalOverdueFines.toFixed(2) });
        if (summary.totalOverdueAmount !== undefined)
          list.push({ label: 'TOTAL OVERDUE', value: summary.totalOverdueAmount.toFixed(2) });
        if (summary.totalOutstandingAmount !== undefined)
          list.push({ label: 'TOTAL OUTSTANDING', value: summary.totalOutstandingAmount.toFixed(2) });
        break;

      case ReportType.FINE_SUMMARY:
        if (summary.totalAssessed !== undefined)
          list.push({ label: 'TOTAL ASSESSED', value: summary.totalAssessed.toFixed(2) });
        if (summary.totalWaived !== undefined)
          list.push({ label: 'TOTAL WAIVED', value: summary.totalWaived.toFixed(2) });
        if (summary.netObligation !== undefined)
          list.push({ label: 'NET OBLIGATION', value: summary.netObligation.toFixed(2) });
        if (summary.netCollected !== undefined)
          list.push({ label: 'NET COLLECTED', value: summary.netCollected.toFixed(2) });
        if (summary.remainingBalance !== undefined)
          list.push({ label: 'FINE BALANCE', value: summary.remainingBalance.toFixed(2) });
        break;

      default:
        // Collections reports
        if (summary.grossCollections !== undefined)
          list.push({ label: 'GROSS COLLECTION', value: summary.grossCollections.toFixed(2) });
        if (summary.totalReversals !== undefined)
          list.push({ label: 'TOTAL REVERSALS', value: summary.totalReversals.toFixed(2) });
        if (summary.totalRefunds !== undefined)
          list.push({ label: 'TOTAL REFUNDS', value: summary.totalRefunds.toFixed(2) });
        if (summary.netCollections !== undefined)
          list.push({ label: 'NET COLLECTION', value: summary.netCollections.toFixed(2) });
        if (summary.transactionCount !== undefined)
          list.push({ label: 'TRANSACTIONS', value: String(summary.transactionCount) });
        break;
    }

    return list;
  }

  /**
   * Generates a print-ready vector PDF report with school branding,
   * summary cards, styled tables with auto-pagination, repeating headers,
   * running footers, and page numbers.
   */
  private async renderPdf(
    columns: TableColumnConfig[],
    rows: Record<string, any>[],
    config: ReportConfig,
    reportData: any,
    school: School,
  ): Promise<Buffer> {
    const isLandscape = config.styling.orientation === 'LANDSCAPE';
    const doc = new PDFDocument({
      size: 'A4',
      layout: isLandscape ? 'landscape' : 'portrait',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: config.title,
        Author: config.branding.schoolName,
        Subject: `${config.title} for ${config.branding.schoolName}`,
        Creator: 'School Fee Management SaaS',
      },
    });

    const pageWidth = isLandscape ? 841.89 : 595.28;
    const pageHeight = isLandscape ? 595.28 : 841.89;
    const margin = 36;
    const printableWidth = pageWidth - margin * 2;
    const bottomLimit = pageHeight - margin - 35; // Reserve 35pt for signature/running footer

    const primaryColor = config.styling.primaryColor || '#1E3A8A';

    // Calculate column widths proportional to printableWidth
    const totalWeight = columns.reduce(
      (sum, col) => sum + this.getColumnWeight(col.key),
      0,
    );
    const colWidths = columns.map(
      (col) => (this.getColumnWeight(col.key) / totalWeight) * printableWidth,
    );

    // Helper: Draw Table Header Row
    const drawTableHeader = (yPos: number): number => {
      const headerHeight = 20;
      doc.rect(margin, yPos, printableWidth, headerHeight).fill(primaryColor);

      let currentX = margin;
      columns.forEach((col, idx) => {
        const w = colWidths[idx];
        const isNumeric = this.isNumericColumn(col.key);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FFFFFF');
        doc.text(col.label, currentX + 3, yPos + 5, {
          width: w - 6,
          align: isNumeric ? 'right' : 'left',
          ellipsis: true,
        });
        currentX += w;
      });

      return yPos + headerHeight;
    };

    // 1. Draw School Branding Banner
    doc.font('Helvetica-Bold').fontSize(15).fillColor(primaryColor);
    doc.text(config.branding.schoolName, margin, margin, { width: printableWidth });

    let currentY = doc.y;
    if (config.branding.headerAddress) {
      doc.font('Helvetica').fontSize(8).fillColor('#64748B');
      doc.text(config.branding.headerAddress, margin, currentY, { width: printableWidth });
      currentY = doc.y;
    }

    // 2. Report Title
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0F172A');
    doc.text(config.title, margin, currentY + 3, { width: printableWidth });
    currentY = doc.y;

    // 3. Metadata Subtitle (Date, Currency, Timezone)
    const timeZone = school.timezone || 'Asia/Kolkata';
    const genDateStr = new Intl.DateTimeFormat('en-IN', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date());

    let periodStr = '';
    if (reportData.period) {
      if (reportData.period.date) {
        periodStr = `Date: ${reportData.period.date} | `;
      } else if (reportData.period.startDate && reportData.period.endDate) {
        periodStr = `Period: ${reportData.period.startDate} to ${reportData.period.endDate} | `;
      } else if (reportData.period.year && reportData.period.month) {
        periodStr = `Period: ${reportData.period.year}-${String(reportData.period.month).padStart(2, '0')} | `;
      }
    }

    const currencyDisplay =
      config.display.currencyCode === 'INR'
        ? 'INR (Rs.)'
        : config.display.currencyCode;
    doc.font('Helvetica').fontSize(8).fillColor('#64748B');
    doc.text(
      `${periodStr}Currency: ${currencyDisplay} | Generated: ${genDateStr} (${timeZone})`,
      margin,
      currentY + 2,
      { width: printableWidth },
    );

    // Divider Line
    currentY = doc.y + 6;
    doc
      .strokeColor('#CBD5E1')
      .lineWidth(0.75)
      .moveTo(margin, currentY)
      .lineTo(pageWidth - margin, currentY)
      .stroke();
    currentY += 8;

    // 4. Summary KPI Cards Block
    if (reportData.summary) {
      const summaryEntries = this.buildSummaryCardList(
        config.reportType,
        reportData.summary,
      );
      if (summaryEntries.length > 0) {
        const cardCount = summaryEntries.length;
        const cardGap = 6;
        const totalGap = (cardCount - 1) * cardGap;
        const cardWidth = (printableWidth - totalGap) / cardCount;
        const cardHeight = 30;

        summaryEntries.forEach((entry, idx) => {
          const cardX = margin + idx * (cardWidth + cardGap);
          doc.rect(cardX, currentY, cardWidth, cardHeight).fillAndStroke('#F8FAFC', '#E2E8F0');

          doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#64748B');
          doc.text(entry.label, cardX + 3, currentY + 4, {
            width: cardWidth - 6,
            align: 'center',
          });

          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(primaryColor);
          doc.text(entry.value, cardX + 3, currentY + 16, {
            width: cardWidth - 6,
            align: 'center',
          });
        });

        currentY += cardHeight + 10;
      }
    }

    // 5. Table Header
    currentY = drawTableHeader(currentY);

    // 6. Data Rows
    if (rows.length === 0) {
      const emptyRowHeight = 24;
      doc.rect(margin, currentY, printableWidth, emptyRowHeight).fillAndStroke('#FFFFFF', '#E2E8F0');
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#64748B');
      doc.text('No records found for the selected criteria.', margin, currentY + 7, {
        width: printableWidth,
        align: 'center',
      });
      currentY += emptyRowHeight;
    } else {
      let isEven = false;
      for (const row of rows) {
        const rowHeight = 17;
        // Automatic page break
        if (currentY + rowHeight > bottomLimit) {
          doc.addPage();
          currentY = margin;
          currentY = drawTableHeader(currentY);
        }

        const rowBg = isEven ? '#F8FAFC' : '#FFFFFF';
        doc.rect(margin, currentY, printableWidth, rowHeight).fillAndStroke(rowBg, '#F1F5F9');

        let currentX = margin;
        columns.forEach((col, idx) => {
          const w = colWidths[idx];
          const val = row[col.key];
          const isNumeric = this.isNumericColumn(col.key);

          let displayVal = '';
          if (val !== null && val !== undefined) {
            if (typeof val === 'number') {
              if (
                col.key.toLowerCase().includes('count') ||
                col.key.toLowerCase().includes('days')
              ) {
                displayVal = val.toLocaleString('en-IN');
              } else {
                displayVal = val.toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                });
              }
            } else {
              displayVal = String(val);
            }
          }

          doc.font('Helvetica').fontSize(7.5).fillColor('#1E293B');
          doc.text(displayVal, currentX + 3, currentY + 4, {
            width: w - 6,
            align: isNumeric ? 'right' : 'left',
            ellipsis: true,
          });
          currentX += w;
        });

        currentY += rowHeight;
        isEven = !isEven;
      }

      // 7. Totals Row
      const totalRowHeight = 19;
      if (currentY + totalRowHeight > bottomLimit) {
        doc.addPage();
        currentY = margin;
        currentY = drawTableHeader(currentY);
      }

      doc.rect(margin, currentY, printableWidth, totalRowHeight).fillAndStroke('#F1F5F9', '#CBD5E1');
      doc
        .strokeColor('#0F172A')
        .lineWidth(0.75)
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .stroke();

      let currentX = margin;
      columns.forEach((col, idx) => {
        const w = colWidths[idx];
        let displayVal = '';
        if (idx === 0) {
          displayVal = 'TOTAL';
        } else {
          const sum = this.calculateColumnSum(rows, col.key);
          if (sum !== null) {
            if (col.key.toLowerCase().includes('count')) {
              displayVal = sum.toLocaleString('en-IN');
            } else {
              displayVal = sum.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
            }
          }
        }

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0F172A');
        doc.text(displayVal, currentX + 3, currentY + 5, {
          width: w - 6,
          align: idx === 0 ? 'left' : 'right',
          ellipsis: true,
        });
        currentX += w;
      });

      currentY += totalRowHeight;
      // Double bottom border
      doc
        .strokeColor('#0F172A')
        .lineWidth(0.75)
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .stroke();
      doc
        .strokeColor('#0F172A')
        .lineWidth(0.75)
        .moveTo(margin, currentY + 2)
        .lineTo(pageWidth - margin, currentY + 2)
        .stroke();
      currentY += 6;
    }

    // 8. Signatures Block
    if (config.signatures && config.signatures.showSignatoryLine) {
      if (currentY + 45 > bottomLimit) {
        doc.addPage();
        currentY = margin + 20;
      } else {
        currentY += 15;
      }

      const sigWidth = 160;
      const sigX = pageWidth - margin - sigWidth;
      doc
        .strokeColor('#64748B')
        .lineWidth(0.75)
        .moveTo(sigX, currentY + 20)
        .lineTo(sigX + sigWidth, currentY + 20)
        .stroke();
      doc.font('Helvetica').fontSize(8).fillColor('#475569');
      doc.text(config.signatures.signatoryTitle, sigX, currentY + 24, {
        width: sigWidth,
        align: 'center',
      });
    }

    // 9. Running Footers across all pages
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      const footerY = pageHeight - margin + 12;

      // Divider line
      doc
        .strokeColor('#E2E8F0')
        .lineWidth(0.5)
        .moveTo(margin, footerY - 4)
        .lineTo(pageWidth - margin, footerY - 4)
        .stroke();

      // Left footer
      doc.font('Helvetica').fontSize(7).fillColor('#94A3B8');
      doc.text(
        config.signatures?.footerNote ||
          'This is a computer-generated report verified against the school ledger.',
        margin,
        footerY,
        { width: printableWidth * 0.7, ellipsis: true },
      );

      // Right footer: Page X of Y
      doc.text(
        `Page ${i + 1} of ${totalPages}`,
        margin + printableWidth * 0.7,
        footerY,
        { width: printableWidth * 0.3, align: 'right' },
      );
    }

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));
      doc.end();
    });
  }

  private getColumnWeight(key: string): number {
    const k = key.toLowerCase();
    if (k.includes('studentname') || k.includes('name')) return 2.2;
    if (k.includes('admissionnumber') || k.includes('adm')) return 1.3;
    if (
      k.includes('gradesection') ||
      k.includes('gradename') ||
      k.includes('sectionname')
    )
      return 1.5;
    if (k.includes('receiptnumber') || k.includes('referencenumber')) return 1.4;
    if (
      k.includes('paymentmethod') ||
      k.includes('paymenttime') ||
      k.includes('period') ||
      k.includes('date')
    )
      return 1.2;
    if (
      k.includes('amount') ||
      k.includes('collection') ||
      k.includes('reversal') ||
      k.includes('refund') ||
      k.includes('billed') ||
      k.includes('paid') ||
      k.includes('balance') ||
      k.includes('assessed') ||
      k.includes('waived')
    )
      return 1.3;
    if (k.includes('days') || k.includes('count') || k.includes('status'))
      return 1.0;
    if (k.includes('phone') || k.includes('guardian')) return 1.4;
    return 1.2;
  }

  private isNumericColumn(key: string): boolean {
    const lower = key.toLowerCase();
    return (
      lower.includes('amount') ||
      lower.includes('collection') ||
      lower.includes('reversal') ||
      lower.includes('refund') ||
      lower.includes('billed') ||
      lower.includes('paid') ||
      lower.includes('balance') ||
      lower.includes('assessed') ||
      lower.includes('waived') ||
      lower.includes('count') ||
      lower.includes('days')
    );
  }
}
