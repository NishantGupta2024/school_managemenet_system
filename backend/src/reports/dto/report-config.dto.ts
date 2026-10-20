export enum ReportType {
  DAILY_COLLECTION = 'DAILY_COLLECTION',
  MONTHLY_COLLECTION = 'MONTHLY_COLLECTION',
  COLLECTION_SUMMARY = 'COLLECTION_SUMMARY',
  OUTSTANDING_DUES = 'OUTSTANDING_DUES',
  CLASS_COLLECTION = 'CLASS_COLLECTION',
  FINE_SUMMARY = 'FINE_SUMMARY',
  DEFAULTER_REPORT = 'DEFAULTER_REPORT',
}

export interface BrandingConfig {
  schoolName: string;
  logoUrl: string | null;
  headerAddress: string | null;
  phone: string | null;
  email: string | null;
  affiliationNumber?: string | null;
}

export interface StylingConfig {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  pageSize: 'A4' | 'LETTER' | 'LEGAL';
  orientation: 'PORTRAIT' | 'LANDSCAPE';
}

export interface DisplayConfig {
  currencyCode: string;
  currencySymbol: string;
  dateFormat: string;
  timeFormat: '12_HOUR' | '24_HOUR';
  timeZone: string;
  showFeeHeadBreakdown: boolean;
  showPaymentMethodBreakdown: boolean;
  visibleSummaryCards: string[];
}

export interface TableColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  order: number;
}

export interface SignatureConfig {
  signatoryTitle: string;
  signatoryName: string;
  showSignatoryLine: boolean;
  footerNote: string;
}

export interface ReportConfig {
  reportType: ReportType;
  title: string;
  branding: BrandingConfig;
  styling: StylingConfig;
  display: DisplayConfig;
  table: {
    columns: TableColumnConfig[];
  };
  signatures: SignatureConfig;
}
