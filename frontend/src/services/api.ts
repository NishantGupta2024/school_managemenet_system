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
  getGrades: async () => {
    const res = await api.get<GradeClass[]>('/students/meta/grades');
    return res.data;
  },
  getAcademicYears: async () => {
    const res = await api.get<AcademicYear[]>('/students/meta/academic-years');
    return res.data;
  },
};

export const fetchSystemHealth = async (): Promise<HealthResponse> => {
  const response = await api.get<HealthResponse>('/health');
  return response.data;
};

export default api;
