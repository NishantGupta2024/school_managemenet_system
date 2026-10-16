import axios from 'axios';

// Current active school/tenant
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_SCHOOL_CODE = 'SCH001';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'x-school-id': DEFAULT_TENANT_ID,
  },
});

// Attach Bearer token from localStorage if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
    const stored = localStorage.getItem('auth_user');
    return stored ? JSON.parse(stored) : null;
  },
  getToken: () => localStorage.getItem('auth_token'),
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
export type InvoiceStatus = 'UPCOMING' | 'DUE' | 'OVERDUE' | 'VOID';

export interface FeeInvoiceItem {
  id: string;
  feeHeadId: string;
  feeHeadNameSnapshot: string;
  billingFrequencySnapshot: FeeFrequency;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
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
    totalCalculatedFinePreview?: number;
    invoiceCount: number;
    statusBreakdown: {
      UPCOMING: number;
      DUE: number;
      OVERDUE: number;
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
    const res = await api.get(`/excel-imports/template`, {
      params: { type },
      responseType: 'blob',
    });
    return res.data;
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

export const fetchSystemHealth = async (): Promise<HealthResponse> => {
  const response = await api.get<HealthResponse>('/health');
  return response.data;
};

export default api;



