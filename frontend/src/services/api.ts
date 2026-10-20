import axios from 'axios';

// Default fallbacks for legacy/display references only
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_SCHOOL_CODE = 'SCH001';

// Dynamic tenant context and 401 callback in memory
let activeSchoolId: string | null = null;
let onUnauthorizedHandler: (() => void) | null = null;

export function setActiveSchoolId(schoolId: string | null) {
  activeSchoolId = schoolId;
}

export function setOnUnauthorized(handler: (() => void) | null) {
  onUnauthorizedHandler = handler;
}

export const UserRole = {
  PLATFORM_SUPER_ADMIN: 'PLATFORM_SUPER_ADMIN',
  SCHOOL_ADMIN: 'SCHOOL_ADMIN',
  FEE_STAFF: 'FEE_STAFF',
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach bearer token and dynamic tenant context
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Determine if request is public (login, health)
  const isPublicEndpoint =
    config.url?.includes('/auth/login') || config.url?.includes('/health');

  if (!isPublicEndpoint && activeSchoolId) {
    config.headers['x-school-id'] = activeSchoolId;
  } else if (config.headers['x-school-id']) {
    delete config.headers['x-school-id'];
  }

  return config;
});

// Response interceptor: global 401 handling for expired/invalid sessions
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      if (onUnauthorizedHandler) {
        onUnauthorizedHandler();
      }
    }
    // 403 Forbidden is NOT treated as an expired session; let callers handle permission rejection
    return Promise.reject(error);
  },
);

// Types & Interfaces
export type FeeHeadCategory = 'ACADEMIC' | 'FACILITY' | 'INSTITUTIONAL' | 'ACTIVITY' | 'MISCELLANEOUS';
export type FeeHeadStatus = 'ACTIVE' | 'INACTIVE';
export type FeeFrequency = 'MONTHLY' | 'ANNUAL' | 'ONE_TIME';
export type FeeStructureStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type ConcessionType = 'NONE' | 'PERCENTAGE' | 'FLAT_DISCOUNT';
export type AllocationStatus = 'ACTIVE' | 'INACTIVE';

export interface FeeHead {
  id: string;
  schoolId: string;
  name: string;
  code: string;
  description?: string | null;
  category: FeeHeadCategory;
  isOptional: boolean;
  status: FeeHeadStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FeeStructureItem {
  id: string;
  feeStructureId: string;
  feeHeadId: string;
  amount: string | number;
  frequency: FeeFrequency;
  isOptional: boolean;
  feeHead?: FeeHead;
}

export interface GradeClass {
  id: string;
  schoolId: string;
  name: string;
  code: string;
}

export interface AcademicYear {
  id: string;
  schoolId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface FeeStructure {
  id: string;
  schoolId: string;
  academicYearId: string;
  gradeId: string;
  name: string;
  description?: string | null;
  status: FeeStructureStatus;
  createdAt: string;
  items: FeeStructureItem[];
  grade?: GradeClass;
  academicYear?: AcademicYear;
  _count?: {
    allocations: number;
  };
}

export interface Student {
  id: string;
  schoolId: string;
  admissionNumber: string;
  rollNumber?: string | null;
  firstName: string;
  lastName: string;
  gradeId: string;
  grade?: GradeClass;
  section?: { id: string; name: string };
  academicYear?: AcademicYear;
}

export interface StudentFeeAllocation {
  id: string;
  schoolId: string;
  studentId: string;
  feeStructureId: string;
  academicYearId: string;
  status: AllocationStatus;
  concessionType: ConcessionType;
  concessionValue: string | number;
  concessionReason?: string | null;
  authorizedByUserId?: string | null;
  optedFeeHeadIds: string[];
  createdAt: string;
  student: Student;
  feeStructure: FeeStructure;
  academicYear: AcademicYear;
  authorizedBy?: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  environment: string;
  database: {
    status: 'connected' | 'disconnected';
    latencyMs?: number;
    tenantCount?: number;
    userCount?: number;
    studentCount?: number;
  };
  tenantContext: {
    activeSchoolId: string;
  };
}

// Authentication Helpers
export const authApi = {
  login: async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.data.accessToken) {
      localStorage.setItem('auth_token', res.data.accessToken);
      localStorage.setItem('auth_user', JSON.stringify(res.data.user));
    }
    return res.data;
  },
  logout: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  },
  getUser: () => {
    try {
      const stored = localStorage.getItem('auth_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },
  getToken: () => localStorage.getItem('auth_token'),
  getProfile: async () => {
    const res = await api.get<{
      id: string;
      email: string;
      name: string;
      role: UserRole;
      schoolId: string | null;
    }>('/auth/me');
    return res.data;
  },
};

// Fee Heads API
export const feeHeadsApi = {
  list: async (filters?: { category?: string; status?: string; isOptional?: boolean }) => {
    const res = await api.get<FeeHead[]>('/fee-heads', { params: filters });
    return res.data;
  },
  get: async (id: string) => {
    const res = await api.get<FeeHead>(`/fee-heads/${id}`);
    return res.data;
  },
  create: async (data: {
    name: string;
    code: string;
    description?: string;
    category?: FeeHeadCategory;
    isOptional?: boolean;
  }) => {
    const res = await api.post<FeeHead>('/fee-heads', data);
    return res.data;
  },
  update: async (
    id: string,
    data: {
      name?: string;
      code?: string;
      description?: string;
      category?: FeeHeadCategory;
      isOptional?: boolean;
      status?: FeeHeadStatus;
    },
  ) => {
    const res = await api.patch<FeeHead>(`/fee-heads/${id}`, data);
    return res.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/fee-heads/${id}`);
    return res.data;
  },
};

// Fee Structures API
export const feeStructuresApi = {
  list: async (filters?: { academicYearId?: string; gradeId?: string; status?: string }) => {
    const res = await api.get<FeeStructure[]>('/fee-structures', { params: filters });
    return res.data;
  },
  get: async (id: string) => {
    const res = await api.get<FeeStructure>(`/fee-structures/${id}`);
    return res.data;
  },
  create: async (data: {
    academicYearId: string;
    gradeId: string;
    name: string;
    description?: string;
    items: {
      feeHeadId: string;
      amount: number;
      frequency: FeeFrequency;
      isOptional?: boolean;
    }[];
  }) => {
    const res = await api.post<FeeStructure>('/fee-structures', data);
    return res.data;
  },
  update: async (
    id: string,
    data: {
      name?: string;
      description?: string;
      status?: FeeStructureStatus;
      items?: {
        feeHeadId: string;
        amount: number;
        frequency: FeeFrequency;
        isOptional?: boolean;
      }[];
    },
  ) => {
    const res = await api.patch<FeeStructure>(`/fee-structures/${id}`, data);
    return res.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/fee-structures/${id}`);
    return res.data;
  },
};

// Student Allocations API
export const studentAllocationsApi = {
  list: async (filters?: { academicYearId?: string; gradeId?: string; studentId?: string }) => {
    const res = await api.get<StudentFeeAllocation[]>('/student-allocations', { params: filters });
    return res.data;
  },
  get: async (id: string) => {
    const res = await api.get<StudentFeeAllocation>(`/student-allocations/${id}`);
    return res.data;
  },
  create: async (data: {
    studentId: string;
    feeStructureId: string;
    academicYearId: string;
    concessionType?: ConcessionType;
    concessionValue?: number;
    concessionReason?: string;
    optedFeeHeadIds?: string[];
  }) => {
    const res = await api.post<StudentFeeAllocation>('/student-allocations', data);
    return res.data;
  },
  update: async (
    id: string,
    data: {
      feeStructureId?: string;
      concessionType?: ConcessionType;
      concessionValue?: number;
      concessionReason?: string;
      optedFeeHeadIds?: string[];
      status?: AllocationStatus;
    },
  ) => {
    const res = await api.patch<StudentFeeAllocation>(`/student-allocations/${id}`, data);
    return res.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/student-allocations/${id}`);
    return res.data;
  },
};

// Metadata API
export const metaApi = {
  getStudents: async () => {
    const res = await api.get<Student[]>('/students');
    return res.data;
  },
  getAccessibleStudents: async () => {
    const res = await api.get<Student[]>('/students/accessible');
    return res.data;
  },
  getGrades: async () => {
    const res = await api.get<GradeClass[]>('/students/meta/grades');
    return res.data;
  },
  getAcademicYears: async () => {
    const res = await api.get<AcademicYear[]>('/students/meta/academic-years');
    return res.data;
  },
};

// Phase 2C: Fee Generation & Statement Types
export type InvoiceStatus = 'UPCOMING' | 'DUE' | 'OVERDUE' | 'PAID' | 'PARTIALLY_PAID' | 'VOID';

export interface FeeInvoiceItem {
  id: string;
  feeHeadId: string;
  feeHeadNameSnapshot: string;
  billingFrequencySnapshot: FeeFrequency;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount?: number;
  remainingBalance?: number;
  createdAt: string;
}

export interface StatementFinePreview {
  calculatedFine: number;
  overdueDays: number;
  gracePeriodDays: number;
  fineRuleName: string | null;
  fineType: FineType | null;
  capApplied: boolean;
  isPaymentOrCollected: false;
  reason: string;
}

export interface FeeInvoice {
  id: string;
  schoolId: string;
  studentId: string;
  academicYearId: string;
  billingMonth: number;
  monthName: string;
  dueDate: string;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  grossAssessedFineAmount?: number;
  waivedFineAmount?: number;
  assessedFineAmount?: number;
  paidAmount?: number;
  remainingBalance?: number;
  paidPrincipal?: number;
  remainingPrincipal?: number;
  paidFines?: number;
  remainingFines?: number;
  status: InvoiceStatus;
  storedStatus: InvoiceStatus;
  generatedAt: string;
  items: FeeInvoiceItem[];
  finePreview?: StatementFinePreview | null;
}

export interface FeeGenerationPreview {
  academicYearId: string;
  gradeId?: string | null;
  totalEligibleAllocations: number;
  totalStudents: number;
  totalPlannedInvoices: number;
  newInvoicesToCreate: number;
  existingInvoicesToSkip: number;
  totalPlannedItems: number;
  projectedGrossTotal: number;
  projectedDiscountTotal: number;
  projectedNetTotal: number;
  validationErrors: string[];
}

export interface FeeGenerationExecution {
  runId: string;
  academicYearId: string;
  gradeId?: string | null;
  totalStudents: number;
  totalInvoicesCreated: number;
  totalInvoicesSkipped: number;
  totalInvoicesFailed: number;
  totalGrossAmount: number;
  totalDiscountAmount: number;
  totalNetAmount: number;
  status: string;
  executedAt: string;
}

export interface FeeGenerationRun {
  id: string;
  schoolId: string;
  academicYearId: string;
  gradeId?: string | null;
  executedByUserId?: string | null;
  totalStudents: number;
  totalInvoicesCreated: number;
  totalInvoicesSkipped: number;
  totalGrossAmount: string | number;
  totalDiscountAmount: string | number;
  totalNetAmount: string | number;
  status: string;
  createdAt: string;
  academicYear?: AcademicYear;
  executedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface StudentFeeStatement {
  student: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    grade?: string;
    section?: string;
    status: string;
    guardianName?: string;
    guardianEmail?: string;
    guardianPhone?: string;
  };
  academicYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  };
  allocation: {
    id: string;
    feeStructureId: string;
    feeStructureName: string;
    concessionType: ConcessionType;
    concessionValue: number;
    startBillingMonth: number;
    optedFeeHeadIds: string[];
    status: string;
  } | null;
  summary: {
    totalGrossAmount: number;
    totalDiscountAmount: number;
    totalNetAmount: number;
    totalGrossAssessedFineAmount?: number;
    totalWaivedFineAmount?: number;
    totalAssessedFineAmount?: number;
    totalPaidAmount?: number;
    totalRemainingAmount?: number;
    totalCalculatedFinePreview?: number;
    invoiceCount: number;
    statusBreakdown: {
      UPCOMING: number;
      DUE: number;
      OVERDUE: number;
      PAID?: number;
      PARTIALLY_PAID?: number;
      VOID: number;
    };
  };
  invoices: FeeInvoice[];
}

// Phase 2C APIs
export const feeGenerationApi = {
  preview: async (data: { academicYearId: string; gradeId?: string }) => {
    const res = await api.post<FeeGenerationPreview>('/fee-generation/preview', data);
    return res.data;
  },
  execute: async (data: { academicYearId: string; gradeId?: string }) => {
    const res = await api.post<FeeGenerationExecution>('/fee-generation/execute', data);
    return res.data;
  },
  getRuns: async (academicYearId?: string) => {
    const res = await api.get<FeeGenerationRun[]>('/fee-generation/runs', {
      params: academicYearId ? { academicYearId } : undefined,
    });
    return res.data;
  },
};

export const feeStatementApi = {
  getStatement: async (studentId: string, academicYearId?: string) => {
    const res = await api.get<StudentFeeStatement>(`/students/${studentId}/fee-statement`, {
      params: academicYearId ? { academicYearId } : undefined,
    });
    return res.data;
  },
  getMyStatement: async (academicYearId?: string) => {
    const res = await api.get<StudentFeeStatement>('/students/me/fee-statement', {
      params: academicYearId ? { academicYearId } : undefined,
    });
    return res.data;
  },
};

// Phase 2D-A: Excel Import Types & APIs
export type ImportType = 'STUDENT_MASTER' | 'FEE_ALLOCATION';

export interface ImportPreviewRowError {
  rowNumber: number;
  data: any;
  errors: string[];
}

export interface ImportPreviewDuplicateRow {
  rowNumber: number;
  admissionNumber: string;
  reason: string;
  data: any;
}

export interface ImportPreviewResult {
  importType: ImportType;
  academicYearId: string;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  validRows: any[];
  invalidRows: ImportPreviewRowError[];
  duplicateRows: ImportPreviewDuplicateRow[];
  summaryMessage: string;
}

export interface ImportConfirmResult {
  importType: ImportType;
  academicYearId: string;
  totalSubmitted: number;
  insertedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: { rowNumber: number; message: string }[];
}

export const excelImportsApi = {
  downloadTemplate: async (type: ImportType): Promise<Blob> => {
    try {
      const res = await api.get(`/excel-imports/template`, {
        params: { type },
        responseType: 'blob',
      });
      return new Blob([res.data], {
        type: String(res.headers['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      });
    } catch (err: any) {
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          throw new Error(json.message || `Template download failed with status ${err.response.status}`);
        } catch (parseErr: any) {
          if (parseErr.message && !parseErr.message.includes('JSON')) {
            throw parseErr;
          }
        }
      }
      throw err;
    }
  },
  preview: async (file: File, type: ImportType, academicYearId: string): Promise<ImportPreviewResult> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    formData.append('academicYearId', academicYearId);

    const res = await api.post<ImportPreviewResult>('/excel-imports/preview', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },
  confirm: async (data: {
    importType: ImportType;
    academicYearId: string;
    rows: any[];
  }): Promise<ImportConfirmResult> => {
    const res = await api.post<ImportConfirmResult>('/excel-imports/confirm', data);
    return res.data;
  },
};

// Phase 2D-B: Fine Configuration & Late Fine Rules Engine Types & APIs
export type FineType = 'FIXED' | 'PER_DAY' | 'PERCENTAGE';
export type FineDayCountPolicy = 'CALENDAR_DAYS' | 'WORKING_DAYS';
export type FineRuleStatus = 'ACTIVE' | 'INACTIVE';

export interface FineRule {
  id: string;
  schoolId: string;
  academicYearId: string;
  academicYearName?: string | null;
  name: string;
  description?: string | null;
  fineType: FineType;
  fineValue: number;
  gracePeriodDays: number;
  maxFineCap?: number | null;
  dayCountPolicy: FineDayCountPolicy;
  applicableFeeHeadId?: string | null;
  applicableFeeHeadName?: string | null;
  applicableFeeHeadCode?: string | null;
  applicableCategory?: string | null;
  status: FineRuleStatus;
  effectiveStartDate?: string | null;
  effectiveEndDate?: string | null;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinePreviewInvoiceItem {
  id: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  gradeName?: string | null;
  sectionName?: string | null;
  academicYearId: string;
  academicYearName?: string | null;
  billingMonth: number;
  monthName: string;
  dueDate: string;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  status: InvoiceStatus;
}

export interface FinePreviewResponse {
  invoiceId: string;
  dueDate: string;
  dueLocalDate: string;
  gracePeriodDays: number;
  graceEndLocalDate: string;
  asOfDate: string;
  asOfLocalDate: string;
  timeZone: string;
  dayCountPolicy: FineDayCountPolicy;
  isPastGracePeriod: boolean;
  calendarOverdueDays: number;
  overdueDays: number;
  invoiceGrossAmount: number;
  invoiceDiscountAmount: number;
  invoiceNetAmount: number;
  authoritativePaidAmount: number;
  paidAmountUsed: number;
  isPaymentSimulated: boolean;
  isFullyPaid: boolean;
  scopedBaseAmount: number;
  eligibleOutstandingBasis: number;
  ruleApplied: {
    id: string;
    name: string;
    fineType: FineType;
    fineValue: number;
    gracePeriodDays: number;
    maxFineCap: number | null;
    dayCountPolicy: FineDayCountPolicy;
    applicableFeeHeadId: string | null;
    applicableCategory: string | null;
    status: FineRuleStatus;
  } | null;
  fineType: FineType | null;
  fineValue: number;
  uncappedFine: number;
  maxFineCap: number | null;
  capApplied: boolean;
  alreadyRecordedFineAmount: number;
  calculatedFine: number;
  isPaymentOrCollected: false;
  reason: string;
  invoiceSummary: {
    id: string;
    studentId: string;
    studentName: string;
    admissionNumber: string;
    gradeName?: string | null;
    academicYearId: string;
    academicYearName?: string | null;
    billingMonth: number;
    monthName: string;
    dueDate: string;
    grossAmount: number;
    discountAmount: number;
    netAmount: number;
    status: string;
  };
}

export const fineRulesApi = {
  list: async (params?: { academicYearId?: string; status?: FineRuleStatus }) => {
    const res = await api.get<FineRule[]>('/fine-rules', { params });
    return res.data;
  },
  get: async (id: string) => {
    const res = await api.get<FineRule>(`/fine-rules/${id}`);
    return res.data;
  },
  create: async (data: {
    academicYearId: string;
    name: string;
    description?: string;
    fineType: FineType;
    fineValue: number;
    gracePeriodDays?: number;
    maxFineCap?: number | null;
    dayCountPolicy?: FineDayCountPolicy;
    applicableFeeHeadId?: string | null;
    applicableCategory?: string | null;
    status?: FineRuleStatus;
    effectiveStartDate?: string | null;
    effectiveEndDate?: string | null;
  }) => {
    const res = await api.post<FineRule>('/fine-rules', data);
    return res.data;
  },
  update: async (
    id: string,
    data: Partial<{
      academicYearId: string;
      name: string;
      description?: string;
      fineType: FineType;
      fineValue: number;
      gracePeriodDays: number;
      maxFineCap?: number | null;
      dayCountPolicy: FineDayCountPolicy;
      applicableFeeHeadId?: string | null;
      applicableCategory?: string | null;
      status: FineRuleStatus;
      effectiveStartDate?: string | null;
      effectiveEndDate?: string | null;
    }>,
  ) => {
    const res = await api.patch<FineRule>(`/fine-rules/${id}`, data);
    return res.data;
  },
  updateStatus: async (id: string, status: FineRuleStatus) => {
    const res = await api.patch<FineRule>(`/fine-rules/${id}/status`, { status });
    return res.data;
  },
  delete: async (id: string) => {
    const res = await api.delete<{ deleted: boolean; id: string }>(`/fine-rules/${id}`);
    return res.data;
  },
  listInvoices: async (academicYearId?: string) => {
    const res = await api.get<FinePreviewInvoiceItem[]>('/fine-rules/invoices', {
      params: academicYearId ? { academicYearId } : undefined,
    });
    return res.data;
  },
  preview: async (data: {
    invoiceId: string;
    fineRuleId?: string;
    asOfDate?: string;
    paidAmount?: number;
  }) => {
    const res = await api.post<FinePreviewResponse>('/fine-rules/preview', data);
    return res.data;
  },
};

// Phase 2H: Fee Reporting Types & API Client
export type ReportType =
  | 'DAILY_COLLECTION'
  | 'MONTHLY_COLLECTION'
  | 'COLLECTION_SUMMARY'
  | 'OUTSTANDING_DUES'
  | 'CLASS_COLLECTION'
  | 'FINE_SUMMARY'
  | 'DEFAULTER_REPORT';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ReportSchool {
  id: string;
  name: string;
  currency: string;
  timezone: string;
}

export interface CollectionSummaryMetrics {
  grossCollections: number;
  totalReversals: number;
  totalRefunds: number;
  netCollections: number;
  transactionCount: number;
  receiptCount?: number;
  cancelledReceiptCount?: number;
  reversalCount?: number;
  refundCount?: number;
}

export interface BreakdownItem {
  name: string;
  count: number;
  total: number;
}

export interface DailyTransactionItem {
  paymentId: string;
  paymentNumber: string;
  receiptNumber: string | null;
  receiptStatus: string | null;
  student: {
    id: string;
    admissionNumber: string;
    name: string;
    grade: string | null;
    section: string | null;
  };
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  referenceNumber: string | null;
  status: string;
  collectedBy: string | null;
}

export interface DailyCollectionReport {
  school: ReportSchool;
  period: {
    date: string;
    startDateTime?: string;
    endDateTime?: string;
  };
  summary: CollectionSummaryMetrics;
  byPaymentMethod: BreakdownItem[];
  byFeeHead: BreakdownItem[];
  transactions: DailyTransactionItem[];
  config?: any;
}

export interface MonthlyCollectionReport {
  school: ReportSchool;
  period: {
    year: number;
    month: number;
    startDateTime?: string;
    endDateTime?: string;
    daysInMonth?: number;
  };
  summary: CollectionSummaryMetrics;
  byPaymentMethod: BreakdownItem[];
  byFeeHead: BreakdownItem[];
  dailyBreakdown: {
    date: string;
    grossCollections: number;
    totalReversals: number;
    totalRefunds: number;
    netCollections: number;
    transactionCount: number;
  }[];
  config?: any;
}

export interface CollectionSummaryReport {
  school: ReportSchool;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: CollectionSummaryMetrics;
  byPaymentMethod: BreakdownItem[];
  byFeeHead: BreakdownItem[];
  periodicBreakdown: {
    period: string;
    grossCollections: number;
    totalReversals: number;
    totalRefunds: number;
    netCollections: number;
    transactionCount: number;
  }[];
  config?: any;
}

export interface StudentDuesRecordItem {
  studentId: string;
  admissionNumber: string;
  rollNumber: string | null;
  studentName: string;
  grade: {
    id: string;
    name: string;
    code: string;
  };
  section: {
    id: string;
    name: string;
  };
  guardian: {
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  status: string;
  totalBilled: number;
  grossAmount: number;
  discountAmount: number;
  totalPaid: number;
  paidPrincipal: number;
  paidFines: number;
  remainingPrincipal: number;
  fineBalance: number;
  outstandingBalance: number;
  overduePrincipal: number;
  overdueFines: number;
  overdueAmount: number;
  overdueInvoicesCount: number;
  maxOverdueDays: number;
  hasOverdue: boolean;
  invoiceCount: number;
}

export interface OutstandingDuesReport {
  school: ReportSchool;
  filters: any;
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  summary: {
    totalStudents: number;
    totalBilledAmount: number;
    totalPaidAmount: number;
    totalPaidPrincipal: number;
    totalPaidFines: number;
    totalRemainingPrincipal: number;
    totalFineBalance: number;
    totalOutstandingAmount: number;
    totalOverduePrincipal: number;
    totalOverdueFines: number;
    totalOverdueAmount: number;
    overdueStudentsCount: number;
  };
  records: StudentDuesRecordItem[];
  config?: any;
}

export interface ClassCollectionItem {
  gradeId: string;
  gradeName: string;
  gradeCode?: string;
  sectionId: string;
  sectionName: string;
  grossCollections: number;
  totalReversals: number;
  totalRefunds: number;
  netCollections: number;
  transactionCount: number;
}

export interface ClassCollectionReport {
  school: ReportSchool;
  period: {
    startDate: string | null;
    endDate: string | null;
    academicYearId?: string | null;
  };
  filters: any;
  summary: CollectionSummaryMetrics;
  byClass: ClassCollectionItem[];
  config?: any;
}

export interface FineSummaryClassItem {
  gradeId: string;
  gradeName: string;
  gradeCode?: string;
  sectionId: string;
  sectionName: string;
  assessedAmount: number;
  waivedAmount: number;
  netObligation: number;
  collectedAmount: number;
  reversalAmount: number;
  refundAmount: number;
  netCollected: number;
  remainingBalance: number;
  fineCount: number;
}

export interface FineSummaryReport {
  school: ReportSchool;
  filters: any;
  summary: {
    totalAssessed: number;
    totalWaived: number;
    netObligation: number;
    totalCollected: number;
    totalReversals: number;
    totalRefunds: number;
    netCollected: number;
    remainingBalance: number;
    fineCount: number;
  };
  byClass: FineSummaryClassItem[];
  statusBreakdown?: {
    status: string;
    count: number;
    totalAssessed: number;
    remainingBalance: number;
  }[];
  ruleBreakdown?: {
    ruleId: string;
    ruleName: string;
    count: number;
    totalAssessed: number;
    remainingBalance: number;
  }[];
  config?: any;
}

export const reportsApi = {
  getDailyCollection: async (params?: {
    date?: string;
    academicYearId?: string;
    paymentMethod?: string;
  }) => {
    const res = await api.get<DailyCollectionReport>('/reports/collections/daily', { params });
    return res.data;
  },

  getMonthlyCollection: async (params?: {
    year?: number;
    month?: number;
    academicYearId?: string;
    paymentMethod?: string;
  }) => {
    const res = await api.get<MonthlyCollectionReport>('/reports/collections/monthly', { params });
    return res.data;
  },

  getCollectionSummary: async (params: {
    startDate: string;
    endDate: string;
    academicYearId?: string;
    paymentMethod?: string;
  }) => {
    const res = await api.get<CollectionSummaryReport>('/reports/collections/summary', { params });
    return res.data;
  },

  getOutstandingDues: async (params?: {
    academicYearId?: string;
    gradeId?: string;
    sectionId?: string;
    search?: string;
    minOverdueDays?: number;
    onlyWithDues?: boolean;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    const res = await api.get<OutstandingDuesReport>('/reports/dues/outstanding', { params });
    return res.data;
  },

  getDefaultersReport: async (params?: {
    academicYearId?: string;
    gradeId?: string;
    sectionId?: string;
    search?: string;
    minOverdueDays?: number;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    const res = await api.get<OutstandingDuesReport>('/reports/dues/defaulters', { params });
    return res.data;
  },

  getClassCollections: async (params?: {
    startDate?: string;
    endDate?: string;
    academicYearId?: string;
    gradeId?: string;
    sectionId?: string;
    paymentMethod?: string;
  }) => {
    const res = await api.get<ClassCollectionReport>('/reports/collections/by-class', { params });
    return res.data;
  },

  getFineSummary: async (params?: {
    startDate?: string;
    endDate?: string;
    academicYearId?: string;
    gradeId?: string;
    sectionId?: string;
    fineRuleId?: string;
  }) => {
    const res = await api.get<FineSummaryReport>('/reports/fines/summary', { params });
    return res.data;
  },

  getReportConfig: async (reportType: string) => {
    const res = await api.get(`/reports/config/${reportType}`);
    return res.data;
  },

  getAllReportConfigs: async () => {
    const res = await api.get('/reports/config');
    return res.data;
  },

  exportReport: async (
    reportType: ReportType,
    format: ExportFormat,
    params?: Record<string, any>,
  ): Promise<string> => {
    try {
      const res = await api.get(`/reports/${reportType}/export`, {
        params: { ...params, format },
        responseType: 'blob',
      });

      // Extract filename from Content-Disposition header
      const disposition = String(res.headers['content-disposition'] || '');
      let filename = '';
      const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
      if (match && match[1]) {
        filename = decodeURIComponent(match[1].trim());
      } else {
        const todayStr = new Date().toISOString().split('T')[0];
        filename = `${reportType.toLowerCase()}_${todayStr}.${format}`;
      }

      // Download file in browser
      const blob = new Blob([res.data], {
        type: String(res.headers['content-type'] || 'application/octet-stream'),
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return filename;
    } catch (err: any) {
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          throw new Error(json.message || `Export failed with status ${err.response.status}`);
        } catch (parseErr: any) {
          if (parseErr.message && !parseErr.message.includes('JSON')) {
            throw parseErr;
          }
        }
      }
      throw err;
    }
  },
};

// ==========================================
// Phase 1: Payment & Receipt Types & APIs
// ==========================================

export type PaymentMethod =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'UPI'
  | 'POS_CARD'
  | 'DEMAND_DRAFT'
  | 'OTHER';

export type PaymentStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'VOIDED'
  | 'BOUNCED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export type ReceiptStatus = 'ACTIVE' | 'CANCELLED';

export type ReversalType = 'VOID' | 'BOUNCE' | 'CORRECTION';

export type RefundStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export type PaymentAllocationType = 'PRINCIPAL' | 'FINE' | 'REVERSAL';

export interface ExplicitPaymentAllocation {
  invoiceId: string;
  invoiceItemId?: string;
  assessedFineId?: string;
  allocationType: 'PRINCIPAL' | 'FINE';
  amount: number;
}

export interface CollectPaymentPayload {
  studentId: string;
  academicYearId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate?: string;
  referenceNumber?: string;
  bankName?: string;
  notes?: string;
  idempotencyKey?: string;
  allocations?: ExplicitPaymentAllocation[];
}

export interface PaymentAllocationRecord {
  id: string;
  schoolId: string;
  paymentId: string;
  invoiceId: string;
  invoiceItemId?: string | null;
  assessedFineId?: string | null;
  allocationType: PaymentAllocationType;
  allocatedAmount: number;
  feeHeadNameSnapshot?: string;
  createdAt: string;
  updatedAt: string;
  refundAllocations?: Array<{
    id: string;
    amount: number;
    paymentRefund: {
      id: string;
      status: RefundStatus;
    };
  }>;
}

export interface ReceiptSnapshot {
  receiptNumber: string;
  sequenceNumber: number;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string | null;
  bankName?: string | null;
  notes?: string | null;
  school: {
    id: string;
    code: string;
    name: string;
    currency: string;
    timezone: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  };
  student: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    grade?: string;
    section?: string;
  };
  academicYear: {
    id: string;
    name: string;
  };
  allocations: Array<{
    id: string;
    invoiceId: string;
    invoiceItemId?: string | null;
    assessedFineId?: string | null;
    allocationType: PaymentAllocationType;
    allocatedAmount: number;
    feeHeadNameSnapshot?: string;
  }>;
  collector?: {
    id: string;
    name: string;
    role: string;
  } | null;
  issuedAt: string;
}

export interface ReceiptRecord {
  id: string;
  schoolId: string;
  paymentId: string;
  receiptNumber: string;
  receiptSequence: number;
  academicYearId: string;
  totalAmount: number;
  status: ReceiptStatus;
  receiptSnapshot: ReceiptSnapshot;
  createdAt: string;
  updatedAt: string;
  payment?: PaymentRecord;
  academicYear?: AcademicYear;
}

export interface PaymentRecord {
  id: string;
  schoolId: string;
  studentId: string;
  academicYearId: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string | null;
  bankName?: string | null;
  notes?: string | null;
  status: PaymentStatus;
  idempotencyKey?: string | null;
  collectedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  receipt?: ReceiptRecord | null;
  student?: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    grade?: { id: string; name: string };
    section?: { id: string; name: string };
  };
  academicYear?: AcademicYear;
  collectedByUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
  allocations?: PaymentAllocationRecord[];
}

export interface CollectPaymentResponse {
  payment: PaymentRecord;
  receipt: ReceiptRecord;
  allocations: PaymentAllocationRecord[];
  isIdempotentReplay: boolean;
}

export interface ReversePaymentPayload {
  reversalType: ReversalType;
  reason: string;
  idempotencyKey?: string;
  allocations?: Array<{ allocationId: string; amount: number }>;
}

export interface CreateRefundPayload {
  amount: number;
  reason: string;
  mode?: string;
  referenceNumber?: string;
  status?: 'SUCCEEDED' | 'PENDING';
  idempotencyKey?: string;
  allocations?: Array<{ allocationId: string; amount: number }>;
}

export interface PaymentRefundRecord {
  id: string;
  schoolId: string;
  paymentId: string;
  amount: number;
  refundAmount?: number;
  reason: string;
  mode?: string | null;
  referenceNumber?: string | null;
  status: RefundStatus;
  idempotencyKey?: string | null;
  createdAt: string;
  authorizedByUser?: { id: string; name: string; email: string } | null;
  processedByUser?: { id: string; name: string; email: string } | null;
  allocations?: Array<{
    id: string;
    amount: number;
    originalAllocation?: PaymentAllocationRecord;
  }>;
}

export interface ListPaymentsParams {
  studentId?: string;
  academicYearId?: string;
  status?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface ListPaymentsResponse {
  data: PaymentRecord[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface IdempotencyLookupResponse {
  found: boolean;
  operationType?: 'COLLECTION' | 'REFUND' | 'REVERSAL';
  status?: string;
  payment?: PaymentRecord;
  receipt?: ReceiptRecord | null;
  refund?: PaymentRefundRecord;
  reversal?: {
    id: string;
    paymentId: string;
    reversalNumber: string;
    reversalType: ReversalType;
    totalAmount: number;
    reason: string;
    createdAt: string;
  };
}

export const paymentsApi = {
  collect: async (
    data: CollectPaymentPayload,
    idempotencyKey?: string,
  ): Promise<CollectPaymentResponse> => {
    const key = idempotencyKey || data.idempotencyKey;
    const headers: Record<string, string> = {};
    if (key) {
      headers['idempotency-key'] = key;
    }
    const res = await api.post<CollectPaymentResponse>('/payments/collect', data, { headers });
    return res.data;
  },

  list: async (params?: ListPaymentsParams): Promise<ListPaymentsResponse> => {
    const res = await api.get<ListPaymentsResponse>('/payments', { params });
    return res.data;
  },

  getById: async (id: string): Promise<PaymentRecord> => {
    const res = await api.get<PaymentRecord>(`/payments/${id}`);
    return res.data;
  },

  getReceiptByNumber: async (receiptNumber: string): Promise<ReceiptRecord> => {
    const res = await api.get<ReceiptRecord>(`/payments/receipts/${receiptNumber}`);
    return res.data;
  },

  reverse: async (
    id: string,
    data: ReversePaymentPayload,
    idempotencyKey?: string,
  ): Promise<any> => {
    const key = idempotencyKey || data.idempotencyKey;
    const headers: Record<string, string> = {};
    if (key) {
      headers['idempotency-key'] = key;
    }
    const res = await api.post(`/payments/${id}/reverse`, data, { headers });
    return res.data;
  },

  refund: async (
    id: string,
    data: CreateRefundPayload,
    idempotencyKey?: string,
  ): Promise<PaymentRefundRecord> => {
    const key = idempotencyKey || data.idempotencyKey;
    const headers: Record<string, string> = {};
    if (key) {
      headers['idempotency-key'] = key;
    }
    const res = await api.post<PaymentRefundRecord>(`/payments/${id}/refund`, data, { headers });
    return res.data;
  },

  getRefunds: async (paymentId: string): Promise<PaymentRefundRecord[]> => {
    const res = await api.get<PaymentRefundRecord[]>(`/payments/${paymentId}/refunds`);
    return res.data;
  },

  lookupIdempotency: async (key: string): Promise<IdempotencyLookupResponse> => {
    const res = await api.get<IdempotencyLookupResponse>(`/payments/idempotency/${encodeURIComponent(key)}`);
    return res.data;
  },
};

export const fetchSystemHealth = async (): Promise<HealthResponse> => {
  const response = await api.get<HealthResponse>('/health');
  return response.data;
};

export default api;



