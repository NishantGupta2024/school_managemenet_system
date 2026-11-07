import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SchoolAdminExaminationMonitoringView } from '../components/SchoolAdminExaminationMonitoringView';
import { PlatformSuperAdminExaminationMonitoringView } from '../components/PlatformSuperAdminExaminationMonitoringView';
import {
  AssessmentMode,
  AssessmentStatus,
  AssessmentDraft,
} from '../services/examination.api';
import {
  setActiveSchoolId,
} from '../services/api';

const mockAssessments: AssessmentDraft[] = [
  {
    id: 'as-01',
    schoolId: 'school-1',
    academicYearId: 'ay-2026',
    gradeId: 'grade-10',
    sectionId: 'sec-10a',
    teacherId: 'teacher-1',
    chapterId: null,
    title: 'Algebra Quarterly Exam',
    description: 'Quadratic equations and polynomials.',
    subject: 'Mathematics',
    mode: AssessmentMode.NORMAL_QUIZ,
    status: AssessmentStatus.DRAFT,
    totalMarks: 50,
    passingMarks: 20,
    durationMinutes: 45,
    startWindowAt: null,
    endWindowAt: null,
    shuffleQuestions: false,
    shuffleOptions: false,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 'as-02',
    schoolId: 'school-1',
    academicYearId: 'ay-2026',
    gradeId: 'grade-10',
    sectionId: null,
    teacherId: 'teacher-2',
    chapterId: null,
    title: 'Physics Synchronous Exam',
    description: 'Optics and mechanics.',
    subject: 'Physics',
    mode: AssessmentMode.LIVE_EXAM,
    status: AssessmentStatus.PUBLISHED,
    totalMarks: 100,
    passingMarks: 40,
    durationMinutes: 90,
    startWindowAt: '2026-08-10T09:00:00Z',
    endWindowAt: '2026-08-10T12:00:00Z',
    shuffleQuestions: true,
    shuffleOptions: true,
    createdAt: '2026-08-02T10:00:00Z',
    updatedAt: '2026-08-02T10:00:00Z',
  },
  {
    id: 'as-03',
    schoolId: 'school-1',
    academicYearId: 'ay-2026',
    gradeId: 'grade-11',
    sectionId: null,
    teacherId: 'teacher-1',
    chapterId: null,
    title: 'Calculus Final Scorecard',
    description: 'Derivatives and integrals.',
    subject: 'Mathematics',
    mode: AssessmentMode.NORMAL_QUIZ,
    status: AssessmentStatus.RESULTS_RELEASED,
    totalMarks: 60,
    passingMarks: 24,
    durationMinutes: 60,
    startWindowAt: null,
    endWindowAt: null,
    shuffleQuestions: false,
    shuffleOptions: false,
    createdAt: '2026-07-20T10:00:00Z',
    updatedAt: '2026-08-05T10:00:00Z',
  },
];

const mockTeachers = [
  {
    id: 'teacher-1',
    schoolId: 'school-1',
    employeeId: 'EMP-01',
    firstName: 'Isaac',
    lastName: 'Newton',
    email: 'newton@school.edu',
    department: 'Mathematics',
    status: 'ACTIVE' as any,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'teacher-2',
    schoolId: 'school-1',
    employeeId: 'EMP-02',
    firstName: 'Albert',
    lastName: 'Einstein',
    email: 'einstein@school.edu',
    department: 'Physics',
    status: 'ACTIVE' as any,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const mockGrades = [
  {
    id: 'grade-10',
    schoolId: 'school-1',
    name: 'Grade 10',
    code: 'G10',
    sections: [{ id: 'sec-10a', schoolId: 'school-1', gradeId: 'grade-10', name: 'A', capacity: 30 }],
  },
  {
    id: 'grade-11',
    schoolId: 'school-1',
    name: 'Grade 11',
    code: 'G11',
    sections: [],
  },
];

const mockSchools = [
  {
    id: 'school-1',
    name: 'Oakridge International School',
    code: 'OIS',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'school-2',
    name: 'Heritage Valley Academy',
    code: 'HVA',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    teachersApi: {
      ...actual.teachersApi,
      getTeachers: vi.fn().mockImplementation(() => Promise.resolve({ data: mockTeachers })),
    },
    academicsApi: {
      ...actual.academicsApi,
      getGrades: vi.fn().mockImplementation(() => Promise.resolve(mockGrades)),
    },
    schoolsApi: {
      ...actual.schoolsApi,
      list: vi.fn().mockImplementation(() => Promise.resolve({ data: mockSchools })),
    },
    setActiveSchoolId: vi.fn(),
  };
});

vi.mock('../services/examination.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/examination.api')>();
  return {
    ...actual,
    examinationApi: {
      ...actual.examinationApi,
      listAssessments: vi.fn().mockImplementation(() => Promise.resolve(mockAssessments)),
    },
  };
});

describe('SchoolAdminExaminationMonitoringView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders school examination monitoring dashboard with stats and oversight tables', async () => {
    render(<SchoolAdminExaminationMonitoringView />);

    await waitFor(() => {
      expect(screen.getByText('School Examination Monitoring')).toBeInTheDocument();
      expect(screen.getByText('Administrative Oversight')).toBeInTheDocument();
      expect(screen.getByText('Algebra Quarterly Exam')).toBeInTheDocument();
      expect(screen.getByText('Physics Synchronous Exam')).toBeInTheDocument();
      expect(screen.getByText('Calculus Final Scorecard')).toBeInTheDocument();
    });

    // Check stats (3 total assessments, 1 draft, 1 published, 1 released, 2 active faculty)
    expect(screen.getByText('Total Assessments')).toBeInTheDocument();
    expect(screen.getByText('Drafts')).toBeInTheDocument();
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Results Released').length).toBeGreaterThan(0);
    expect(screen.getByText('Active Faculty')).toBeInTheDocument();

    // Check student telemetry notice regarding the proposed API
    expect(screen.getByText('Student Participation & Completion Telemetry')).toBeInTheDocument();
    expect(screen.getByText(/Analytics API Contract Proposed/i)).toBeInTheDocument();
    expect(screen.getByText(/completion percentages are not estimated in the frontend/i)).toBeInTheDocument();

    // Verify absence of teacher creation controls
    expect(screen.queryByRole('button', { name: /create assessment draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new chapter/i })).not.toBeInTheDocument();
  });

  it('filters assessments by status in the admin oversight table', async () => {
    render(<SchoolAdminExaminationMonitoringView />);

    await waitFor(() => {
      expect(screen.getByText('Algebra Quarterly Exam')).toBeInTheDocument();
    });

    // Select "Drafts Only"
    const statusSelect = screen.getByLabelText(/filter by status/i);
    fireEvent.change(statusSelect, { target: { value: AssessmentStatus.DRAFT } });

    expect(screen.getByText('Algebra Quarterly Exam')).toBeInTheDocument();
    expect(screen.queryByText('Physics Synchronous Exam')).not.toBeInTheDocument();
    expect(screen.queryByText('Calculus Final Scorecard')).not.toBeInTheDocument();
  });

  it('switches to teacher activity tab and lists faculty authoring volume', async () => {
    render(<SchoolAdminExaminationMonitoringView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /teacher activity/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /teacher activity/i }));

    await waitFor(() => {
      expect(screen.getByText('Isaac Newton')).toBeInTheDocument();
      expect(screen.getByText('Albert Einstein')).toBeInTheDocument();
      expect(screen.getByText('EMP-01')).toBeInTheDocument();
      expect(screen.getByText('EMP-02')).toBeInTheDocument();
    });
  });

  it('opens read-only assessment details modal without authoring or modification buttons', async () => {
    render(<SchoolAdminExaminationMonitoringView />);

    await waitFor(() => {
      expect(screen.getByText('Algebra Quarterly Exam')).toBeInTheDocument();
    });

    const inspectBtns = screen.getAllByRole('button', { name: /^inspect$/i });
    expect(inspectBtns.length).toBe(3);
    fireEvent.click(inspectBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Administrative Inspection')).toBeInTheDocument();
    });
    expect(screen.getByText('Read-Only Administrative View')).toBeInTheDocument();
    expect(screen.getAllByText('Isaac Newton (EMP-01)').length).toBeGreaterThan(0);

    // Close inspection
    fireEvent.click(screen.getByRole('button', { name: /close inspection/i }));
    expect(screen.queryByText('Administrative Inspection')).not.toBeInTheDocument();
  });
});

describe('PlatformSuperAdminExaminationMonitoringView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders platform telemetry oversight and handles tenant selection with setActiveSchoolId', async () => {
    render(<PlatformSuperAdminExaminationMonitoringView />);

    await waitFor(() => {
      expect(screen.getByText('Platform Examination Telemetry')).toBeInTheDocument();
      expect(screen.getByText('Super Admin Monitoring')).toBeInTheDocument();
      expect(screen.getByText('Tenant Boundary & Telemetry Integrity')).toBeInTheDocument();
      expect(screen.getByText('Total Schools')).toBeInTheDocument();
    });

    // Verify that setActiveSchoolId was invoked for tenant isolation
    expect(setActiveSchoolId).toHaveBeenCalledWith('school-1');

    // Switch school in dropdown
    const schoolSelect = screen.getByLabelText(/target school/i);
    fireEvent.change(schoolSelect, { target: { value: 'school-2' } });

    await waitFor(() => {
      expect(setActiveSchoolId).toHaveBeenCalledWith('school-2');
    });

    // Confirms strictly read-only monitoring: no teacher authoring controls
    expect(screen.queryByRole('button', { name: /create assessment draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new chapter/i })).not.toBeInTheDocument();
  });
});
