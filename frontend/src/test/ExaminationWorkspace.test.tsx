import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ExaminationWorkspace } from '../components/ExaminationWorkspace';
import { UserRole } from '../services/api';
import examinationApi, {
  AssessmentStatus,
  AttemptStatus,
} from '../services/examination.api';
import api from '../services/api';

let currentMockUser: any = null;

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      login: vi.fn(),
      logout: vi.fn(),
      getToken: vi.fn(() => (currentMockUser ? 'mock-jwt-token' : null)),
      getUser: vi.fn(() => currentMockUser),
      getProfile: vi.fn(() => (currentMockUser ? Promise.resolve(currentMockUser) : Promise.reject(new Error('No token')))),
    },
    academicsApi: {
      ...actual.academicsApi,
      getAcademicYears: vi.fn().mockResolvedValue([]),
      getGrades: vi.fn().mockResolvedValue([]),
    },
    teachersApi: {
      ...actual.teachersApi,
      getTeachers: vi.fn().mockResolvedValue({ data: [] }),
    },
    schoolsApi: {
      ...actual.schoolsApi,
      list: vi.fn().mockResolvedValue({
        data: [{ id: 'school-1', name: 'Springfield Academy', code: 'SP-01' }],
      }),
    },
    metaApi: {
      ...actual.metaApi,
      getAccessibleStudents: vi.fn().mockResolvedValue([]),
      getStudents: vi.fn().mockResolvedValue([]),
      getGrades: vi.fn().mockResolvedValue([]),
      getAcademicYears: vi.fn().mockResolvedValue([]),
    },
    getMyTeacherProfile: vi.fn().mockResolvedValue(null),
    default: {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({ data: {} }),
      patch: vi.fn().mockResolvedValue({ data: {} }),
      put: vi.fn().mockResolvedValue({ data: {} }),
      delete: vi.fn().mockResolvedValue({ data: {} }),
    },
  };
});

describe('Examination API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createChapter with expected endpoint and payload', async () => {
    const mockData = { id: 'ch-1', title: 'Chapter 1' };
    (api.post as any).mockResolvedValueOnce({ data: mockData });

    const payload = {
      gradeId: 'grade-1',
      subject: 'Math',
      chapterCode: 'M101',
      title: 'Chapter 1',
    };
    const result = await examinationApi.createChapter(payload);

    expect(api.post).toHaveBeenCalledWith('/examination/chapters', payload);
    expect(result).toEqual(mockData);
  });

  it('calls listAssessments with query parameters', async () => {
    const mockData = [{ id: 'as-1', title: 'Midterm Quiz' }];
    (api.get as any).mockResolvedValueOnce({ data: mockData });

    const query = { status: AssessmentStatus.PUBLISHED, subject: 'Physics' };
    const result = await examinationApi.listAssessments(query);

    expect(api.get).toHaveBeenCalledWith('/examination/assessments', { params: query });
    expect(result).toEqual(mockData);
  });

  it('calls startAssessment and submitAttempt with student endpoints', async () => {
    const mockAttempt = { id: 'att-1', remainingSeconds: 3600 };
    (api.post as any).mockResolvedValueOnce({ data: mockAttempt });

    const startRes = await examinationApi.startAssessment('as-1');
    expect(api.post).toHaveBeenCalledWith('/examination/student/assessments/as-1/start');
    expect(startRes).toEqual(mockAttempt);

    const mockSubmit = { success: true, attemptId: 'att-1', status: AttemptStatus.SUBMITTED };
    (api.post as any).mockResolvedValueOnce({ data: mockSubmit });

    const submitRes = await examinationApi.submitAttempt('att-1');
    expect(api.post).toHaveBeenCalledWith('/examination/student/attempts/att-1/submit');
    expect(submitRes).toEqual(mockSubmit);
  });

  it('calls saveAnswer with PUT and payload', async () => {
    const mockRes = { success: true, questionId: 'q-1', selectedOption: 2 };
    (api.put as any).mockResolvedValueOnce({ data: mockRes });

    const result = await examinationApi.saveAnswer('att-1', 'q-1', { selectedOption: 2 });
    expect(api.put).toHaveBeenCalledWith(
      '/examination/student/attempts/att-1/answers/q-1',
      { selectedOption: 2 },
    );
    expect(result).toEqual(mockRes);
  });

  it('calls getParentAssessmentResult with student and assessment params', async () => {
    const mockResult = {
      assessmentId: 'as-1',
      title: 'Final Test',
      subject: 'Math',
      totalMarks: 50,
      passingMarks: 20,
      hasAttempt: true,
      result: { score: 45, percentage: 90, isPassing: true },
    };
    (api.get as any).mockResolvedValueOnce({ data: mockResult });

    const res = await examinationApi.getParentAssessmentResult('st-1', 'as-1');
    expect(api.get).toHaveBeenCalledWith('/examination/parent/students/st-1/assessments/as-1/result');
    expect(res).toEqual(mockResult);
  });

  it('calls previewImport with FormData and multipart header', async () => {
    const mockPreview = { totalRows: 5, validCount: 5, invalidCount: 0 };
    (api.post as any).mockResolvedValueOnce({ data: mockPreview });

    const file = new File(['dummy content'], 'questions.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const res = await examinationApi.previewImport('as-1', file);

    expect(api.post).toHaveBeenCalledWith(
      '/examination/assessments/as-1/questions/import/preview',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    expect(res).toEqual(mockPreview);
  });
});

describe('ExaminationWorkspace Component', () => {
  beforeEach(() => {
    currentMockUser = null;
    (api.get as any).mockResolvedValue({ data: [] });
  });

  it('renders Access Restricted when user role is not authorized', async () => {
    currentMockUser = {
      id: 'usr-guest',
      email: 'guest@example.com',
      name: 'Guest User',
      role: 'UNKNOWN_ROLE' as any,
      schoolId: 'sch-1',
    };

    render(
      <MemoryRouter initialEntries={['/app/examinations']}>
        <AuthProvider>
          <ExaminationWorkspace />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Access Restricted')).toBeInTheDocument();
      expect(screen.getByText(/Return to System Launcher/i)).toBeInTheDocument();
    });
  });

  it('renders Teacher view by default for teacher role', async () => {
    currentMockUser = {
      id: 'usr-teacher',
      email: 'teacher@school.edu',
      name: 'Teacher Smith',
      role: UserRole.TEACHER,
      schoolId: 'sch-1',
    };

    render(
      <MemoryRouter initialEntries={['/app/examinations']}>
        <AuthProvider>
          <ExaminationWorkspace />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Examinations & Assessments')).toBeInTheDocument();
      expect(screen.getByText('Faculty Workspace')).toBeInTheDocument();
      expect(screen.getByText('Faculty Examination Workspace')).toBeInTheDocument();
      expect(screen.getAllByText('Create Assessment Draft').length).toBeGreaterThan(0);
    });
  });

  it('renders Student view for student role', async () => {
    currentMockUser = {
      id: 'usr-student',
      email: 'student@school.edu',
      name: 'Student Alex',
      role: UserRole.STUDENT,
      schoolId: 'sch-1',
    };

    render(
      <MemoryRouter initialEntries={['/app/examinations']}>
        <AuthProvider>
          <ExaminationWorkspace />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Student Examination Portal').length).toBeGreaterThan(0);
      expect(screen.getByText('Available Assessments')).toBeInTheDocument();
      expect(screen.getByText('Autosave Quiz Runner')).toBeInTheDocument();
      expect(screen.getByText('Released Results')).toBeInTheDocument();
    });
  });

  it('renders Parent view for parent role', async () => {
    currentMockUser = {
      id: 'usr-parent',
      email: 'parent@school.edu',
      name: 'Parent Maria',
      role: UserRole.PARENT,
      schoolId: 'sch-1',
    };

    render(
      <MemoryRouter initialEntries={['/app/examinations']}>
        <AuthProvider>
          <ExaminationWorkspace />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Parent Examination Portal')).toBeInTheDocument();
      expect(screen.getByText('Released Scorecards')).toBeInTheDocument();
      expect(screen.getByText('Curriculum Progression')).toBeInTheDocument();
    });
  });

  it('routes SCHOOL_ADMIN to dedicated School Examination Monitoring and hides teacher creation controls', async () => {
    currentMockUser = {
      id: 'usr-admin',
      email: 'admin@school.edu',
      name: 'Admin Skinner',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: 'sch-1',
    };

    render(
      <MemoryRouter initialEntries={['/app/examinations']}>
        <AuthProvider>
          <ExaminationWorkspace />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Examination Monitoring & Oversight')).toBeInTheDocument();
      expect(screen.getByText('School Admin Oversight')).toBeInTheDocument();
      expect(screen.getByText('School Examination Monitoring')).toBeInTheDocument();
      expect(screen.getByText('Student Participation & Completion Telemetry')).toBeInTheDocument();
    });

    // Verification of Role Separation:
    // Perspective switcher must NOT exist
    expect(screen.queryByRole('button', { name: /Teacher View/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Student View/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Parent View/i })).not.toBeInTheDocument();

    // Teacher authoring controls must NOT exist in the admin interface
    expect(screen.queryByRole('button', { name: /Create Assessment Draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New Chapter/i })).not.toBeInTheDocument();
  });

  it('routes PLATFORM_SUPER_ADMIN to Platform Examination Telemetry', async () => {
    currentMockUser = {
      id: 'usr-super',
      email: 'super@platform.org',
      name: 'Super Admin Gary',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: 'sch-1',
    };

    render(
      <MemoryRouter initialEntries={['/app/examinations']}>
        <AuthProvider>
          <ExaminationWorkspace />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Platform Examination Telemetry').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Super Admin Monitoring').length).toBeGreaterThan(0);
      expect(screen.getByText('Tenant Boundary & Telemetry Integrity')).toBeInTheDocument();
      expect(screen.getByText('Total Schools')).toBeInTheDocument();
    });

    // Verification of Role Separation:
    expect(screen.queryByRole('button', { name: /Teacher View/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create Assessment Draft/i })).not.toBeInTheDocument();
  });
});
