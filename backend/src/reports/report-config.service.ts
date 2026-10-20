import { BadRequestException, Injectable } from '@nestjs/common';
import { School } from '@prisma/client';
import {
  ReportConfig,
  ReportType,
  TableColumnConfig,
} from './dto/report-config.dto';

@Injectable()
export class ReportConfigService {
  private readonly currencySymbolMap: Record<string, string> = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
    AED: 'AED',
  };

  /**
   * Generates default presentation configuration for a school and report type.
   */
  public getReportConfig(school: School, reportTypeInput: string): ReportConfig {
    const reportType = this.validateReportType(reportTypeInput);

    const currencyCode = school.currency || 'INR';
    const currencySymbol = this.currencySymbolMap[currencyCode] || currencyCode;
    const timeZone = school.timezone || 'Asia/Kolkata';

    const headerAddress = [
      school.address,
      school.city,
      school.state,
      school.country,
    ]
      .filter((part): part is string => Boolean(part && part.trim().length > 0))
      .join(', ');

    return {
      reportType,
      title: this.getDefaultTitle(reportType),
      branding: {
        schoolName: school.name,
        logoUrl: null,
        headerAddress: headerAddress || null,
        phone: null,
        email: null,
        affiliationNumber: null,
      },
      styling: {
        primaryColor: '#1E3A8A',
        secondaryColor: '#3B82F6',
        fontFamily: 'Inter, sans-serif',
        pageSize: 'A4',
        orientation: [
          ReportType.COLLECTION_SUMMARY,
          ReportType.OUTSTANDING_DUES,
          ReportType.CLASS_COLLECTION,
          ReportType.FINE_SUMMARY,
          ReportType.DEFAULTER_REPORT,
        ].includes(reportType)
          ? 'LANDSCAPE'
          : 'PORTRAIT',
      },
      display: {
        currencyCode,
        currencySymbol,
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '12_HOUR',
        timeZone,
        showFeeHeadBreakdown: true,
        showPaymentMethodBreakdown: true,
        visibleSummaryCards: this.getDefaultSummaryCards(reportType),
      },
      table: {
        columns: this.getDefaultColumns(reportType),
      },
      signatures: {
        signatoryTitle: 'Accounts Officer / Bursar',
        signatoryName: '',
        showSignatoryLine: true,
        footerNote: 'This is a computer-generated report verified against the school ledger.',
      },
    };
  }

  /**
   * Returns default configurations for all supported report types.
   */
  public getAllReportConfigs(school: School): Record<ReportType, ReportConfig> {
    return {
      [ReportType.DAILY_COLLECTION]: this.getReportConfig(
        school,
        ReportType.DAILY_COLLECTION,
      ),
      [ReportType.MONTHLY_COLLECTION]: this.getReportConfig(
        school,
        ReportType.MONTHLY_COLLECTION,
      ),
      [ReportType.COLLECTION_SUMMARY]: this.getReportConfig(
        school,
        ReportType.COLLECTION_SUMMARY,
      ),
      [ReportType.OUTSTANDING_DUES]: this.getReportConfig(
        school,
        ReportType.OUTSTANDING_DUES,
      ),
      [ReportType.CLASS_COLLECTION]: this.getReportConfig(
        school,
        ReportType.CLASS_COLLECTION,
      ),
      [ReportType.FINE_SUMMARY]: this.getReportConfig(
        school,
        ReportType.FINE_SUMMARY,
      ),
      [ReportType.DEFAULTER_REPORT]: this.getReportConfig(
        school,
        ReportType.DEFAULTER_REPORT,
      ),
    };
  }

  private validateReportType(input: string): ReportType {
    const normalized = (input || '').trim().toUpperCase();
    if (Object.values(ReportType).includes(normalized as ReportType)) {
      return normalized as ReportType;
    }
    throw new BadRequestException(
      `Unsupported reportType '${input}'. Supported types: ${Object.values(ReportType).join(', ')}`,
    );
  }

  private getDefaultTitle(reportType: ReportType): string {
    switch (reportType) {
      case ReportType.DAILY_COLLECTION:
        return 'Daily Fee Collection Report';
      case ReportType.MONTHLY_COLLECTION:
        return 'Monthly Fee Collection Summary';
      case ReportType.COLLECTION_SUMMARY:
        return 'Fee Collection Summary Report';
      case ReportType.OUTSTANDING_DUES:
        return 'Outstanding Dues and Defaulters Report';
      case ReportType.CLASS_COLLECTION:
        return 'Class-Wise Fee Collection Report';
      case ReportType.FINE_SUMMARY:
        return 'Late Fine and Penalty Summary Report';
      case ReportType.DEFAULTER_REPORT:
        return 'Fee Defaulters and Overdue Aging Report';
    }
  }

  private getDefaultSummaryCards(reportType: ReportType): string[] {
    switch (reportType) {
      case ReportType.OUTSTANDING_DUES:
        return [
          'TOTAL_STUDENTS',
          'TOTAL_BILLED',
          'TOTAL_PAID',
          'FINE_BALANCE',
          'OUTSTANDING_BALANCE',
          'OVERDUE_STUDENTS',
        ];
      case ReportType.FINE_SUMMARY:
        return [
          'TOTAL_ASSESSED',
          'TOTAL_WAIVED',
          'NET_COLLECTED',
          'REMAINING_FINE_BALANCE',
          'FINE_COUNT',
        ];
      case ReportType.DEFAULTER_REPORT:
        return [
          'OVERDUE_STUDENTS',
          'OVERDUE_AMOUNT',
          'OVERDUE_PRINCIPAL',
          'OVERDUE_FINES',
          'TOTAL_OUTSTANDING',
        ];
      default:
        return [
          'GROSS_COLLECTIONS',
          'TOTAL_REVERSALS',
          'TOTAL_REFUNDS',
          'NET_COLLECTIONS',
          'TRANSACTION_COUNT',
        ];
    }
  }

  private getDefaultColumns(reportType: ReportType): TableColumnConfig[] {
    switch (reportType) {
      case ReportType.DAILY_COLLECTION:
        return [
          { key: 'receiptNumber', label: 'Receipt #', visible: true, order: 1 },
          { key: 'paymentTime', label: 'Time', visible: true, order: 2 },
          { key: 'admissionNumber', label: 'Adm #', visible: true, order: 3 },
          { key: 'studentName', label: 'Student Name', visible: true, order: 4 },
          { key: 'gradeSection', label: 'Class / Sec', visible: true, order: 5 },
          { key: 'paymentMethod', label: 'Method', visible: true, order: 6 },
          { key: 'referenceNumber', label: 'Reference / Cheque #', visible: true, order: 7 },
          { key: 'amount', label: 'Amount', visible: true, order: 8 },
        ];
      case ReportType.MONTHLY_COLLECTION:
        return [
          { key: 'date', label: 'Date', visible: true, order: 1 },
          { key: 'grossCollections', label: 'Gross Collection', visible: true, order: 2 },
          { key: 'totalReversals', label: 'Reversals', visible: true, order: 3 },
          { key: 'totalRefunds', label: 'Refunds', visible: true, order: 4 },
          { key: 'netCollections', label: 'Net Collection', visible: true, order: 5 },
          { key: 'transactionCount', label: 'Txn Count', visible: true, order: 6 },
        ];
      case ReportType.COLLECTION_SUMMARY:
        return [
          { key: 'period', label: 'Period / Date', visible: true, order: 1 },
          { key: 'grossCollections', label: 'Gross Collection', visible: true, order: 2 },
          { key: 'totalReversals', label: 'Reversals', visible: true, order: 3 },
          { key: 'totalRefunds', label: 'Refunds', visible: true, order: 4 },
          { key: 'netCollections', label: 'Net Collection', visible: true, order: 5 },
          { key: 'transactionCount', label: 'Txn Count', visible: true, order: 6 },
        ];
      case ReportType.OUTSTANDING_DUES:
        return [
          { key: 'admissionNumber', label: 'Adm #', visible: true, order: 1 },
          { key: 'studentName', label: 'Student Name', visible: true, order: 2 },
          { key: 'gradeSection', label: 'Class / Sec', visible: true, order: 3 },
          { key: 'totalBilled', label: 'Total Billed', visible: true, order: 4 },
          { key: 'totalPaid', label: 'Total Paid', visible: true, order: 5 },
          { key: 'fineBalance', label: 'Fine Balance', visible: true, order: 6 },
          { key: 'outstandingBalance', label: 'Outstanding Balance', visible: true, order: 7 },
          { key: 'overdueDays', label: 'Max Overdue Days', visible: true, order: 8 },
          { key: 'status', label: 'Status', visible: true, order: 9 },
        ];
      case ReportType.CLASS_COLLECTION:
        return [
          { key: 'gradeName', label: 'Class', visible: true, order: 1 },
          { key: 'sectionName', label: 'Section', visible: true, order: 2 },
          { key: 'grossCollections', label: 'Gross Collection', visible: true, order: 3 },
          { key: 'totalReversals', label: 'Reversals', visible: true, order: 4 },
          { key: 'totalRefunds', label: 'Refunds', visible: true, order: 5 },
          { key: 'netCollections', label: 'Net Collection', visible: true, order: 6 },
          { key: 'transactionCount', label: 'Txn Count', visible: true, order: 7 },
        ];
      case ReportType.FINE_SUMMARY:
        return [
          { key: 'gradeSection', label: 'Class / Sec', visible: true, order: 1 },
          { key: 'totalAssessed', label: 'Assessed Fines', visible: true, order: 2 },
          { key: 'totalWaived', label: 'Waived Fines', visible: true, order: 3 },
          { key: 'totalCollected', label: 'Collected Fines', visible: true, order: 4 },
          { key: 'totalReversals', label: 'Reversals', visible: true, order: 5 },
          { key: 'totalRefunds', label: 'Refunds', visible: true, order: 6 },
          { key: 'netCollected', label: 'Net Collected', visible: true, order: 7 },
          { key: 'remainingBalance', label: 'Fine Balance', visible: true, order: 8 },
          { key: 'fineCount', label: 'Fine Count', visible: true, order: 9 },
        ];
      case ReportType.DEFAULTER_REPORT:
        return [
          { key: 'admissionNumber', label: 'Adm #', visible: true, order: 1 },
          { key: 'studentName', label: 'Student Name', visible: true, order: 2 },
          { key: 'gradeSection', label: 'Class / Sec', visible: true, order: 3 },
          { key: 'overduePrincipal', label: 'Overdue Principal', visible: true, order: 4 },
          { key: 'overdueFines', label: 'Overdue Fines', visible: true, order: 5 },
          { key: 'overdueAmount', label: 'Total Overdue', visible: true, order: 6 },
          { key: 'maxOverdueDays', label: 'Days Overdue', visible: true, order: 7 },
          { key: 'outstandingBalance', label: 'Total Outstanding', visible: true, order: 8 },
          { key: 'guardianPhone', label: 'Guardian Phone', visible: true, order: 9 },
        ];
    }
  }
}
