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

export function getActiveSchoolId(): string | null {
  return activeSchoolId;
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
  TEACHER: 'TEACHER',
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

// Response interceptor: global 401 handling with automatic refresh token retry
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/forgot-password') ||
      originalRequest?.url?.includes('/auth/reset-password');

    if (error.response?.status === 401 && !isAuthEndpoint && !originalRequest._retry) {
      const storedRefreshToken = localStorage.getItem('auth_refresh_token');

      if (storedRefreshToken) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return api(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const res = await axios.post(
            `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/auth/refresh`,
            { refreshToken: storedRefreshToken },
            { headers: { 'Content-Type': 'application/json' } },
          );

          const { accessToken, refreshToken: newRefreshToken } = res.data;
          localStorage.setItem('auth_token', accessToken);
          if (newRefreshToken) {
            localStorage.setItem('auth_refresh_token', newRefreshToken);
          }

          api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
          processQueue(null, accessToken);

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch (refreshErr) {
          processQueue(refreshErr, null);
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_refresh_token');
          localStorage.removeItem('auth_user');
          if (onUnauthorizedHandler) {
            onUnauthorizedHandler();
          }
          return Promise.reject(refreshErr);
        } finally {
          isRefreshing = false;
        }
      } else {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_refresh_token');
        localStorage.removeItem('auth_user');
        if (onUnauthorizedHandler) {
          onUnauthorizedHandler();
        }
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

export interface Section {
  id: string;
  schoolId: string;
  gradeId: string;
  name: string;
  capacity: number;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    students: number;
  };
}

export interface GradeClass {
  id: string;
  schoolId: string;
  name: string;
  code: string;
  sections?: Section[];
  _count?: {
    students?: number;
    sections?: number;
    feeStructures?: number;
  };
}

export interface AcademicYear {
  id: string;
  schoolId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    students?: number;
    feeStructures?: number;
    invoices?: number;
    studentFeeAllocations?: number;
    payments?: number;
  };
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

export type StudentStatus = 'ACTIVE' | 'PROMOTED' | 'TRANSFERRED' | 'ALUMNI';

export interface Student {
  id: string;
  schoolId: string;
  admissionNumber: string;
  rollNumber?: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  gradeId: string;
  sectionId?: string;
  academicYearId: string;
  admissionDate?: string | null;
  status?: StudentStatus;
  userId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  grade?: GradeClass;
  section?: { id: string; name: string };
  academicYear?: AcademicYear;
  userAccount?: {
    id: string;
    email: string;
    name: string;
    status: string;
    createdAt?: string;
  } | null;
  parentRelations?: Array<{
    id: string;
    relationshipType: string;
    isVerified: boolean;
    parent: {
      id: string;
      email: string;
      name: string;
      status: string;
    };
  }>;
  _count?: {
    feeAllocations: number;
    invoices: number;
    payments: number;
  };
}

export interface QueryStudentsParams {
  page?: number;
  limit?: number;
  search?: string;
  academicYearId?: string;
  gradeId?: string;
  sectionId?: string;
  status?: StudentStatus;
}

export interface PaginatedStudentsResponse {
  data: Student[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CreateStudentPayload {
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gradeId: string;
  sectionId: string;
  academicYearId: string;
  rollNumber?: string;
  dateOfBirth?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  admissionDate?: string;
  status?: StudentStatus;
}

export interface UpdateStudentPayload {
  admissionNumber?: string;
  firstName?: string;
  lastName?: string;
  gradeId?: string;
  sectionId?: string;
  academicYearId?: string;
  rollNumber?: string;
  dateOfBirth?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  admissionDate?: string;
  status?: StudentStatus;
}

// Phase 3A: Teacher Management Types
export type TeacherStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';

export interface TeacherAssignment {
  id: string;
  teacherId: string;
  schoolId: string;
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  subject: string;
  isClassTeacher: boolean;
  createdAt: string;
  updatedAt: string;
  academicYear?: {
    id: string;
    name: string;
    isCurrent?: boolean;
  };
  grade?: {
    id: string;
    name: string;
    code: string;
  };
  section?: {
    id: string;
    name: string;
    capacity?: number;
  };
}

export interface Teacher {
  id: string;
  schoolId: string;
  userId?: string | null;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  department?: string | null;
  designation?: string | null;
  joiningDate?: string | null;
  status: TeacherStatus;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
    name?: string;
    role: string;
    status: string;
  } | null;
  userAccount?: {
    id: string;
    email: string;
    name?: string;
    role: string;
    status: string;
  } | null;
  assignments?: TeacherAssignment[];
}

export interface QueryTeachersParams {
  page?: number;
  limit?: number;
  search?: string;
  department?: string;
  status?: TeacherStatus;
  sortBy?: 'createdAt' | 'name' | 'employeeId';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedTeachersResponse {
  data: Teacher[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateTeacherPayload {
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  department?: string;
  designation?: string;
  joiningDate?: string;
  status?: TeacherStatus;
}

export interface UpdateTeacherPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  department?: string;
  designation?: string;
  joiningDate?: string;
  status?: TeacherStatus;
}

export interface AssignTeacherPayload {
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  subject?: string;
  isClassTeacher?: boolean;
}

export interface ProvisionTeacherAccountPayload {
  email?: string;
  password: string;
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
  login: async (email: string, password: string, schoolId?: string) => {
    const payload: { email: string; password: string; schoolId?: string } = {
      email,
      password,
      ...(schoolId ? { schoolId } : {}),
    };
    const res = await api.post('/auth/login', payload);
    if (res.data.accessToken) {
      localStorage.setItem('auth_token', res.data.accessToken);
      if (res.data.refreshToken) {
        localStorage.setItem('auth_refresh_token', res.data.refreshToken);
      }
      localStorage.setItem('auth_user', JSON.stringify(res.data.user));
    }
    return res.data;
  },
  refresh: async (refreshToken: string) => {
    const res = await api.post('/auth/refresh', { refreshToken });
    if (res.data.accessToken) {
      localStorage.setItem('auth_token', res.data.accessToken);
      if (res.data.refreshToken) {
        localStorage.setItem('auth_refresh_token', res.data.refreshToken);
      }
    }
    return res.data;
  },
  logout: async () => {
    try {
      const refreshToken = localStorage.getItem('auth_refresh_token');
      await api.post('/auth/logout', { refreshToken });
    } catch {
      // Ignore network/server errors during logout
    } finally {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_refresh_token');
      localStorage.removeItem('auth_user');
    }
  },
  logoutAll: async () => {
    try {
      await api.post('/auth/logout-all');
    } finally {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_refresh_token');
      localStorage.removeItem('auth_user');
    }
  },
  forgotPassword: async (email: string) => {
    const res = await api.post('/auth/forgot-password', { email });
    return res.data;
  },
  resetPassword: async (token: string, newPassword: string) => {
    const res = await api.post('/auth/reset-password', { token, newPassword });
    return res.data;
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await api.post('/auth/change-password', { currentPassword, newPassword });
    return res.data;
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
  getRefreshToken: () => localStorage.getItem('auth_refresh_token'),
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

export interface BulkAllocationResult {
  totalRequested: number;
  allocatedCount: number;
  skippedCount: number;
  failedCount: number;
  results: {
    studentId: string;
    studentName: string;
    admissionNumber: string;
    status: 'ALLOCATED' | 'SKIPPED' | 'FAILED';
    allocationId?: string;
    reason?: string;
  }[];
}

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
  bulkCreate: async (data: {
    academicYearId: string;
    feeStructureId: string;
    studentIds: string[];
    concessionType?: ConcessionType;
    concessionValue?: number;
    concessionReason?: string;
    optedFeeHeadIds?: string[];
  }) => {
    const res = await api.post<BulkAllocationResult>('/student-allocations/bulk', data);
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

// Phase 1A: Academics API
export const academicsApi = {
  getAcademicYears: async () => {
    const res = await api.get<AcademicYear[]>('/academics/academic-years');
    return res.data;
  },
  getAcademicYearById: async (id: string) => {
    const res = await api.get<AcademicYear>(`/academics/academic-years/${id}`);
    return res.data;
  },
  createAcademicYear: async (data: {
    name: string;
    startDate: string;
    endDate: string;
    isCurrent?: boolean;
  }) => {
    const res = await api.post<AcademicYear>('/academics/academic-years', data);
    return res.data;
  },
  updateAcademicYear: async (
    id: string,
    data: {
      name?: string;
      startDate?: string;
      endDate?: string;
      isCurrent?: boolean;
    },
  ) => {
    const res = await api.patch<AcademicYear>(`/academics/academic-years/${id}`, data);
    return res.data;
  },
  setCurrentAcademicYear: async (id: string) => {
    const res = await api.post<AcademicYear>(`/academics/academic-years/${id}/set-current`);
    return res.data;
  },
  deleteAcademicYear: async (id: string) => {
    const res = await api.delete(`/academics/academic-years/${id}`);
    return res.data;
  },
  getGrades: async () => {
    const res = await api.get<GradeClass[]>('/academics/grades');
    return res.data;
  },
  getGradeById: async (id: string) => {
    const res = await api.get<GradeClass>(`/academics/grades/${id}`);
    return res.data;
  },
  createGrade: async (data: { name: string; code: string }) => {
    const res = await api.post<GradeClass>('/academics/grades', data);
    return res.data;
  },
  updateGrade: async (id: string, data: { name?: string; code?: string }) => {
    const res = await api.patch<GradeClass>(`/academics/grades/${id}`, data);
    return res.data;
  },
  deleteGrade: async (id: string) => {
    const res = await api.delete(`/academics/grades/${id}`);
    return res.data;
  },
  createSection: async (
    gradeId: string,
    data: { name: string; capacity?: number },
  ) => {
    const res = await api.post<Section>(`/academics/grades/${gradeId}/sections`, data);
    return res.data;
  },
  updateSection: async (
    id: string,
    data: { name?: string; capacity?: number },
  ) => {
    const res = await api.patch<Section>(`/academics/sections/${id}`, data);
    return res.data;
  },
  deleteSection: async (id: string) => {
    const res = await api.delete(`/academics/sections/${id}`);
    return res.data;
  },
};

// Phase 1B: Students Management & Admissions API
export const studentsApi = {
  getStudents: async (params?: QueryStudentsParams) => {
    const res = await api.get<PaginatedStudentsResponse>('/students', { params });
    return res.data;
  },
  getStudentById: async (id: string) => {
    const res = await api.get<Student>(`/students/${id}`);
    return res.data;
  },
  getStudentProfile: async (id: string) => {
    const res = await api.get<Student>(`/students/${id}/profile`);
    return res.data;
  },
  createStudent: async (payload: CreateStudentPayload) => {
    const res = await api.post<Student>('/students', payload);
    return res.data;
  },
  updateStudent: async (id: string, payload: UpdateStudentPayload) => {
    const res = await api.patch<Student>(`/students/${id}`, payload);
    return res.data;
  },
  getFeeStatement: async (studentId: string, academicYearId?: string) => {
    const res = await api.get<StudentFeeStatement>(`/students/${studentId}/fee-statement`, {
      params: academicYearId ? { academicYearId } : undefined,
    });
    return res.data;
  },
};

// Phase 3A: Teachers API Client
const normalizeTeacherRecord = (t: Teacher): Teacher => {
  const account = t.user || t.userAccount || null;
  return {
    ...t,
    user: account,
    userAccount: account,
  };
};

export const teachersApi = {
  getTeachers: async (params?: QueryTeachersParams) => {
    const res = await api.get<PaginatedTeachersResponse>('/teachers', { params });
    if (res.data?.data) {
      res.data.data = res.data.data.map(normalizeTeacherRecord);
    }
    return res.data;
  },
  getDepartments: async () => {
    const res = await api.get<string[]>('/teachers/meta/departments');
    return res.data;
  },
  getTeacherById: async (id: string) => {
    const res = await api.get<Teacher>(`/teachers/${id}`);
    return res.data ? normalizeTeacherRecord(res.data) : res.data;
  },
  createTeacher: async (payload: CreateTeacherPayload) => {
    const res = await api.post<Teacher>('/teachers', payload);
    return res.data ? normalizeTeacherRecord(res.data) : res.data;
  },
  updateTeacher: async (id: string, payload: UpdateTeacherPayload) => {
    const res = await api.patch<Teacher>(`/teachers/${id}`, payload);
    return res.data ? normalizeTeacherRecord(res.data) : res.data;
  },
  deactivateTeacher: async (id: string) => {
    const res = await api.post<Teacher>(`/teachers/${id}/deactivate`);
    return res.data ? normalizeTeacherRecord(res.data) : res.data;
  },
  deleteTeacher: async (id: string) => {
    const res = await api.delete<{ message: string }>(`/teachers/${id}`);
    return res.data;
  },
  assignTeacher: async (id: string, payload: AssignTeacherPayload) => {
    const res = await api.post<TeacherAssignment>(`/teachers/${id}/assignments`, payload);
    return res.data;
  },
  removeAssignment: async (teacherId: string, assignmentId: string) => {
    const res = await api.delete<{ message: string }>(`/teachers/${teacherId}/assignments/${assignmentId}`);
    return res.data;
  },
  provisionAccount: async (id: string, payload: ProvisionTeacherAccountPayload) => {
    const res = await api.post<{ message: string; user: any }>(`/teachers/${id}/account`, payload);
    return res.data;
  },
};

// Cached authenticated teacher profile for Class Teacher authorization & UX gating
let cachedTeacherProfile: { userId: string; teacher: Teacher | null; timestamp: number } | null = null;

export const getMyTeacherProfile = async (user: { id: string; email: string }): Promise<Teacher | null> => {
  if (
    cachedTeacherProfile &&
    cachedTeacherProfile.userId === user.id &&
    Date.now() - cachedTeacherProfile.timestamp < 30000
  ) {
    return cachedTeacherProfile.teacher;
  }
  try {
    const res = await teachersApi.getTeachers({ search: user.email, limit: 10 });
    const match =
      res.data?.find(
        (t) =>
          t.userId === user.id ||
          (t.email && t.email.toLowerCase() === user.email.toLowerCase()),
      ) || null;
    cachedTeacherProfile = { userId: user.id, teacher: match, timestamp: Date.now() };
    return match;
  } catch {
    return null;
  }
};

export const clearTeacherProfileCache = () => {
  cachedTeacherProfile = null;
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
    const res = await api.get<ReceiptRecord>(`/payments/receipts/${encodeURIComponent(receiptNumber)}`);
    return res.data;
  },

  downloadReceiptPdf: async (
    receiptNumber: string,
    options?: { layout?: 'compact' | 'standard'; copies?: number },
  ): Promise<void> => {
    const res = await api.get(`/payments/receipts/${encodeURIComponent(receiptNumber)}/pdf`, {
      params: options,
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeFileName = receiptNumber.replace(/[^A-Za-z0-9._-]/g, '_');
    link.setAttribute('download', `${safeFileName}.pdf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  downloadBatchReceiptsPdf: async (
    receiptNumbers: string[],
    options?: { layout?: 'compact' | 'standard' },
  ): Promise<void> => {
    const res = await api.post(
      '/payments/receipts/batch-pdf',
      { receiptNumbers, layout: options?.layout || 'compact' },
      { responseType: 'blob' },
    );
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `selected_receipts_${receiptNumbers.length}.pdf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
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

export interface SchoolRecord {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  currency: string;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
  _count?: {
    users?: number;
    students?: number;
    invoices?: number;
    payments?: number;
    grades?: number;
    academicYears?: number;
    feeStructures?: number;
  };
  hasAdmin?: boolean;
  admin?: {
    id: string;
    name: string;
    email: string;
    status: string;
  } | null;
}

export interface ListSchoolsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

export interface ListSchoolsResponse {
  data: SchoolRecord[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CreateSchoolPayload {
  code: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  currency?: string;
  timezone?: string;
}

export interface UpdateSchoolPayload {
  code?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  currency?: string;
  timezone?: string;
}

export interface SchoolAdminRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  failedLoginAttempts?: number;
  lockedUntil?: string | null;
  passwordChangedAt?: string | null;
  school?: {
    id: string;
    name: string;
    code: string;
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  } | null;
}

export interface SchoolAdminProfile extends SchoolAdminRecord {
  auditHistory?: Array<{
    id: string;
    eventType: string;
    details?: any;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt: string;
  }>;
}

export interface ListSchoolAdminsResponse {
  data: SchoolAdminRecord[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const schoolsApi = {
  list: async (params?: ListSchoolsParams): Promise<ListSchoolsResponse> => {
    const res = await api.get<ListSchoolsResponse>('/schools', { params });
    return res.data;
  },
  get: async (id: string): Promise<SchoolRecord> => {
    const res = await api.get<SchoolRecord>(`/schools/${id}`);
    return res.data;
  },
  getById: async (id: string): Promise<SchoolRecord> => {
    const res = await api.get<SchoolRecord>(`/schools/${id}`);
    return res.data;
  },
  create: async (payload: CreateSchoolPayload): Promise<SchoolRecord> => {
    const res = await api.post<SchoolRecord>('/schools', payload);
    return res.data;
  },
  update: async (id: string, payload: UpdateSchoolPayload): Promise<SchoolRecord> => {
    const res = await api.patch<SchoolRecord>(`/schools/${id}`, payload);
    return res.data;
  },
  updateStatus: async (
    id: string,
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
  ): Promise<SchoolRecord> => {
    const res = await api.patch<SchoolRecord>(`/schools/${id}/status`, { status });
    return res.data;
  },
  provisionAdmin: async (
    id: string,
    payload: { name: string; email: string; password: string },
  ): Promise<{ message: string; user: UserProfile }> => {
    const res = await api.post<{ message: string; user: UserProfile }>(
      `/schools/${id}/admins`,
      payload,
    );
    return res.data;
  },

  // -------------------------------------------------------------
  // Platform Super Admin: School Administrator Account Management
  // -------------------------------------------------------------
  listAdmins: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    schoolId?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  }): Promise<ListSchoolAdminsResponse> => {
    const res = await api.get<ListSchoolAdminsResponse>('/schools/administrators', { params });
    return res.data;
  },
  getAdminProfile: async (adminId: string): Promise<SchoolAdminProfile> => {
    const res = await api.get<SchoolAdminProfile>(`/schools/administrators/${adminId}`);
    return res.data;
  },
  createAdminForSchool: async (
    schoolId: string,
    payload: { name: string; email: string; password: string },
  ): Promise<{ message: string; user: SchoolAdminRecord }> => {
    const res = await api.post<{ message: string; user: SchoolAdminRecord }>(
      `/schools/${schoolId}/administrators`,
      payload,
    );
    return res.data;
  },
  suspendAdmin: async (
    adminId: string,
    reason: string,
  ): Promise<{ message: string; user: SchoolAdminRecord }> => {
    const res = await api.patch<{ message: string; user: SchoolAdminRecord }>(
      `/schools/administrators/${adminId}/suspend`,
      { reason },
    );
    return res.data;
  },
  activateAdmin: async (
    adminId: string,
    reason?: string,
  ): Promise<{ message: string; user: SchoolAdminRecord }> => {
    const res = await api.patch<{ message: string; user: SchoolAdminRecord }>(
      `/schools/administrators/${adminId}/activate`,
      { reason },
    );
    return res.data;
  },
  initiateAdminPasswordReset: async (
    adminId: string,
  ): Promise<{ success: boolean; message: string }> => {
    const res = await api.post<{ success: boolean; message: string }>(
      `/schools/administrators/${adminId}/reset-password`,
      {},
    );
    return res.data;
  },
};

export interface UserProfile {
  id: string;
  schoolId: string | null;
  name: string;
  email: string;
  role: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt?: string;
  studentProfile?: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
  } | null;
  parentRelations?: Array<{
    id: string;
    studentId: string;
    relationshipType: string;
    student?: {
      id: string;
      admissionNumber: string;
      firstName: string;
      lastName: string;
      grade?: { name: string };
      section?: { name: string };
    };
  }>;
}

export interface UnlinkedStudentRecord {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  guardianName?: string | null;
  guardianEmail?: string | null;
  guardianPhone?: string | null;
  grade?: { id: string; name: string };
  section?: { id: string; name: string };
  academicYear?: { id: string; name: string };
}

export const usersApi = {
  list: async (params?: { role?: string; status?: string; search?: string }): Promise<UserProfile[]> => {
    const res = await api.get<UserProfile[]>('/users', { params });
    return res.data;
  },
  getMe: async (): Promise<UserProfile> => {
    const res = await api.get<UserProfile>('/users/me');
    return res.data;
  },
  createStaff: async (payload: { name: string; email: string; password: string }): Promise<UserProfile> => {
    const res = await api.post<UserProfile>('/users/staff', payload);
    return res.data;
  },
  update: async (id: string, payload: { name?: string }): Promise<UserProfile> => {
    const res = await api.patch<UserProfile>(`/users/${id}`, payload);
    return res.data;
  },
  updateStatus: async (id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<UserProfile> => {
    const res = await api.patch<UserProfile>(`/users/${id}/status`, { status });
    return res.data;
  },
  getUnlinkedStudents: async (): Promise<UnlinkedStudentRecord[]> => {
    const res = await api.get<UnlinkedStudentRecord[]>('/users/students/unlinked');
    return res.data;
  },
  provisionStudentAccount: async (
    studentId: string,
    payload: { email: string; password: string; name?: string },
  ): Promise<{ message: string; user: UserProfile; studentId: string }> => {
    const res = await api.post<{ message: string; user: UserProfile; studentId: string }>(
      `/users/students/${studentId}/account`,
      payload,
    );
    return res.data;
  },
  listParents: async (): Promise<UserProfile[]> => {
    const res = await api.get<UserProfile[]>('/users/parents');
    return res.data;
  },
  createParent: async (payload: {
    name: string;
    email: string;
    password: string;
    studentIds?: string[];
    relationshipType?: string;
  }): Promise<UserProfile> => {
    const res = await api.post<UserProfile>('/users/parents', payload);
    return res.data;
  },
  linkParentStudent: async (
    parentId: string,
    studentId: string,
    payload?: { relationshipType?: string },
  ): Promise<any> => {
    const res = await api.post(`/users/parents/${parentId}/students/${studentId}`, payload || {});
    return res.data;
  },
  unlinkParentStudent: async (parentId: string, studentId: string): Promise<{ message: string }> => {
    const res = await api.delete<{ message: string }>(`/users/parents/${parentId}/students/${studentId}`);
    return res.data;
  },
};

// ==========================================
// School Payment Gateway Configuration Types & API (Phase D)
// ==========================================
export type GatewayStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'DISABLED';
export type GatewayEnvironment = 'TEST' | 'LIVE';
export type GatewayProvider = 'RAZORPAY';

export interface PaymentGatewayConfig {
  id: string;
  schoolId: string;
  provider: GatewayProvider;
  merchantName: string | null;
  keyId: string;
  keySecretMasked: string;
  hasKeySecret: boolean;
  hasWebhookSecret: boolean;
  webhookSecretMasked: string | null;
  environment: GatewayEnvironment;
  status: GatewayStatus;
  lastVerifiedAt: string | null;
  lastVerificationError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigurePaymentGatewayPayload {
  keyId: string;
  keySecret?: string;
  merchantName?: string;
  webhookSecret?: string;
}

export interface VerifyGatewayResult {
  success: boolean;
  status: GatewayStatus;
  message: string;
  testedAt: string;
}

export const paymentGatewayApi = {
  getConfig: async (): Promise<PaymentGatewayConfig | null> => {
    const res = await api.get<PaymentGatewayConfig | null>('/payment-gateway/config');
    return res.data;
  },
  configure: async (payload: ConfigurePaymentGatewayPayload): Promise<PaymentGatewayConfig> => {
    const res = await api.put<PaymentGatewayConfig>('/payment-gateway/config', payload);
    return res.data;
  },
  verify: async (): Promise<VerifyGatewayResult> => {
    const res = await api.post<VerifyGatewayResult>('/payment-gateway/verify');
    return res.data;
  },
  disconnect: async (): Promise<{ success: boolean; message: string }> => {
    const res = await api.delete<{ success: boolean; message: string }>('/payment-gateway/config');
    return res.data;
  },
};

// ==========================================
// Online Payment Orders API (Phase E / F)
// ==========================================
export interface CreateOnlinePaymentOrderPayload {
  invoiceId: string;
  amount?: number;
  idempotencyKey?: string;
}

export interface OnlinePaymentOrderResponse {
  orderId: string;
  keyId: string;
  amount: number;
  amountInPaise: number;
  currency: string;
  invoiceId: string;
  studentId: string;
  schoolName: string;
  studentName: string;
  studentEmail?: string;
  studentPhone?: string;
  idempotencyKey: string;
  status: string;
  createdAt: string;
}

export const onlinePaymentsApi = {
  createOrder: async (
    payload: CreateOnlinePaymentOrderPayload,
    idempotencyKey?: string,
  ): Promise<OnlinePaymentOrderResponse> => {
    const headers: Record<string, string> = {};
    const key = idempotencyKey || payload.idempotencyKey;
    if (key) {
      headers['idempotency-key'] = key;
    }
    const res = await api.post<OnlinePaymentOrderResponse>(
      '/payments/online/create-order',
      payload,
      { headers },
    );
    return res.data;
  },
};

export type AcademicYearFormat = 'SHORT_6DIGIT' | 'FULL_8DIGIT' | 'START_YEAR_4DIGIT' | 'NONE';

export interface ReceiptNumberConfigResponse {
  id?: string;
  schoolId: string;
  prefix: string;
  yearFormat: AcademicYearFormat;
  paddingDigits: number;
  separator: string;
  previewSample: string;
  isCustomized: boolean;
  updatedAt?: string;
}

export interface UpdateReceiptNumberConfigPayload {
  prefix: string;
  yearFormat: AcademicYearFormat;
  paddingDigits: number;
  separator: string;
}

export interface PreviewReceiptNumberPayload {
  prefix: string;
  yearFormat: AcademicYearFormat;
  paddingDigits: number;
  separator: string;
  sampleYearName?: string;
  sampleSequence?: number;
}

export const receiptNumberingApi = {
  getConfig: async (schoolId?: string): Promise<ReceiptNumberConfigResponse> => {
    const res = await api.get<ReceiptNumberConfigResponse>('/receipt-numbering/config', {
      params: schoolId ? { schoolId } : undefined,
    });
    return res.data;
  },
  updateConfig: async (
    payload: UpdateReceiptNumberConfigPayload,
    schoolId?: string,
  ): Promise<ReceiptNumberConfigResponse> => {
    const res = await api.put<ReceiptNumberConfigResponse>('/receipt-numbering/config', payload, {
      params: schoolId ? { schoolId } : undefined,
    });
    return res.data;
  },
  preview: async (payload: PreviewReceiptNumberPayload): Promise<{ preview: string }> => {
    const res = await api.post<{ preview: string }>('/receipt-numbering/preview', payload);
    return res.data;
  },
};

// =========================================================================
// Attendance Management Types & API (Phase 3B MVP)
// =========================================================================

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'EXCUSED';
export type VirtualAttendanceStatus = AttendanceStatus | 'NOT_MARKED';
export type RegisterStatus = 'UNMARKED' | 'PARTIALLY_MARKED' | 'SUBMITTED' | 'LOCKED';
export type AttendanceType = 'DAILY' | 'PERIOD';

export interface AttendanceRosterItem {
  studentId: string;
  admissionNumber: string;
  rollNumber: string | null;
  firstName: string;
  lastName: string;
  gradeId: string;
  sectionId: string;
  status: VirtualAttendanceStatus;
  remarks: string | null;
  attendanceRecordId: string | null;
  markedAt: string | Date | null;
}

export interface RegisterSummary {
  totalEnrolled: number;
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  totalHalfDay: number;
  totalExcused: number;
  totalUnmarked: number;
  status: RegisterStatus;
  isLocked: boolean;
}

export interface AttendanceRegisterResponse {
  data: AttendanceRosterItem[];
  register: RegisterSummary;
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface BulkMarkAttendanceEntry {
  studentId: string;
  status: AttendanceStatus;
  remarks?: string;
}

export interface BulkMarkAttendancePayload {
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  attendanceDate: string; // YYYY-MM-DD
  entries: BulkMarkAttendanceEntry[];
}

export interface BulkMarkResult {
  registerId: string;
  attendanceDate: string;
  sectionId: string;
  totalSubmitted: number;
  createdCount: number;
  updatedCount: number;
  summary: RegisterSummary;
}

export interface CorrectAttendancePayload {
  status: AttendanceStatus;
  reason: string;
}

export interface AttendanceCorrectionEntry {
  id: string;
  schoolId: string;
  attendanceId: string;
  studentId: string;
  attendanceDate: string;
  previousStatus: AttendanceStatus;
  newStatus: AttendanceStatus;
  reason: string;
  changedById: string;
  changedAt: string | Date;
}

export interface StudentAttendanceRecord {
  id: string;
  schoolId: string;
  registerId: string | null;
  studentId: string;
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  attendanceDate: string;
  attendanceType: AttendanceType;
  periodNumber: number;
  status: AttendanceStatus;
  remarks: string | null;
  markedById: string | null;
  markedAt: string | Date;
  lastUpdatedBy: string | null;
  updatedAt: string | Date;
}

export interface AttendanceCorrectionResult {
  updatedRecord: StudentAttendanceRecord;
  correctionLog: AttendanceCorrectionEntry;
}

export interface StudentAttendanceStats {
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  halfDays: number;
  excusedDays: number;
  attendanceRate: number;
}

export interface StudentAttendanceHistoryResponse {
  student: {
    id: string;
    admissionNumber: string;
    rollNumber: string | null;
    firstName: string;
    lastName: string;
    gradeId: string;
    sectionId: string;
  };
  stats: StudentAttendanceStats;
  data: StudentAttendanceRecord[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface QueryRegisterParams {
  date: string;
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface QueryStudentHistoryParams {
  startDate?: string;
  endDate?: string;
  academicYearId?: string;
  page?: number;
  limit?: number;
}

export const attendanceApi = {
  getRegister: async (params: QueryRegisterParams): Promise<AttendanceRegisterResponse> => {
    const res = await api.get<AttendanceRegisterResponse>('/attendance/register', { params });
    return res.data;
  },

  bulkMark: async (payload: BulkMarkAttendancePayload): Promise<BulkMarkResult> => {
    const res = await api.post<BulkMarkResult>('/attendance/register/bulk-mark', payload);
    return res.data;
  },

  correctAttendance: async (
    id: string,
    payload: CorrectAttendancePayload,
  ): Promise<AttendanceCorrectionResult> => {
    const res = await api.patch<AttendanceCorrectionResult>(`/attendance/${id}`, payload);
    return res.data;
  },

  getStudentHistory: async (
    studentId: string,
    params?: QueryStudentHistoryParams,
  ): Promise<StudentAttendanceHistoryResponse> => {
    const res = await api.get<StudentAttendanceHistoryResponse>(`/attendance/students/${studentId}`, {
      params,
    });
    return res.data;
  },
};

// =========================================================================
// Notification Administration API Types & Client
// =========================================================================

export type NotificationChannel = 'EMAIL';

export type NotificationEventType =
  | 'RECEIPT_ISSUED'
  | 'PAYMENT_REVERSED'
  | 'REFUND_SUCCEEDED'
  | 'REFUND_FAILED'
  | 'FEE_DUE_REMINDER'
  | 'STUDENT_ADMITTED'
  | 'ATTENDANCE_ABSENT'
  | 'EXAM_SCHEDULE_PUBLISHED'
  | 'EXAM_RESULTS_RELEASED';

export type NotificationStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED'
  | 'CANCELLED';

export interface SchoolNotificationSettings {
  id?: string;
  schoolId: string;
  receiptEmailEnabled: boolean;
  paymentReversalEmailEnabled: boolean;
  refundSuccessEmailEnabled: boolean;
  refundFailureEmailEnabled: boolean;
  feeReminderEmailEnabled: boolean;
  studentAdmissionEmailEnabled: boolean;
  attendanceAbsenceEmailEnabled: boolean;
  examScheduleEmailEnabled: boolean;
  examResultsEmailEnabled: boolean;
  senderDisplayName?: string | null;
  replyToEmail?: string | null;
  updatedAt: string;
}

export interface UpdateSchoolNotificationSettingsPayload {
  receiptEmailEnabled?: boolean;
  paymentReversalEmailEnabled?: boolean;
  refundSuccessEmailEnabled?: boolean;
  refundFailureEmailEnabled?: boolean;
  feeReminderEmailEnabled?: boolean;
  studentAdmissionEmailEnabled?: boolean;
  attendanceAbsenceEmailEnabled?: boolean;
  examScheduleEmailEnabled?: boolean;
  examResultsEmailEnabled?: boolean;
  senderDisplayName?: string | null;
  replyToEmail?: string | null;
}

export interface NotificationLogItem {
  id: string;
  channel: NotificationChannel;
  eventType: NotificationEventType;
  recipientEmail?: string | null;
  recipientName?: string | null;
  status: NotificationStatus;
  templateKey: string;
  attemptCount: number;
  sentAt?: string | null;
  createdAt: string;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
}

export interface QueryNotificationLogsParams {
  page?: number;
  limit?: number;
  status?: NotificationStatus;
  eventType?: NotificationEventType;
  channel?: NotificationChannel;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface PaginatedNotificationLogsResponse {
  data: NotificationLogItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const notificationsApi = {
  getSettings: async (): Promise<SchoolNotificationSettings> => {
    const res = await api.get<SchoolNotificationSettings>('/notifications/settings');
    return res.data;
  },

  updateSettings: async (
    payload: UpdateSchoolNotificationSettingsPayload,
  ): Promise<SchoolNotificationSettings> => {
    const res = await api.patch<SchoolNotificationSettings>('/notifications/settings', payload);
    return res.data;
  },

  getLogs: async (
    params?: QueryNotificationLogsParams,
  ): Promise<PaginatedNotificationLogsResponse> => {
    const res = await api.get<PaginatedNotificationLogsResponse>('/notifications/logs', { params });
    return res.data;
  },

  getLogById: async (id: string): Promise<NotificationLogItem> => {
    const res = await api.get<NotificationLogItem>(`/notifications/logs/${id}`);
    return res.data;
  },
};

export default api;




