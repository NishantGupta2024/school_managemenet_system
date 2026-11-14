import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AssessmentAttemptsModal } from '../components/AssessmentAttemptsModal';
import examinationApi, {
  AssessmentDraft,
  AssessmentMode,
  AssessmentStatus,
  AttemptStatus,
  AssessmentAttemptSummary,
} from '../services/examination.api';

vi.mock('../services/examination.api', async () => {
  const actual = await vi.importActual<any>('../services/examination.api');
  return {
    ...actual,
    examinationApi: {
      ...actual.examinationApi,
      listAssessmentAttempts: vi.fn(),
    },
    default: {
      ...actual.default,
      listAssessmentAttempts: vi.fn(),
    },
  };
});

describe('AssessmentAttemptsModal Component', () => {
  const mockAssessment: AssessmentDraft = {
    id: 'as-200',
    schoolId: 'sch-1',
    academicYearId: 'yr-1',
    gradeId: 'gr-1',
    sectionId: null,
    teacherId: 'tch-1',
    chapterId: null,
    title: 'Mathematics Midterm Test',
    description: 'Calculus and Algebra',
    subject: 'Mathematics',
    mode: AssessmentMode.NORMAL_QUIZ,
    status: AssessmentStatus.CLOSED,
    totalMarks: 100,
    passingMarks: 40,
    durationMinutes: 60,
    startWindowAt: null,
    endWindowAt: null,
    shuffleQuestions: false,
    shuffleOptions: false,
    enableProctoring: true,
    monitoringConfig: { requireFullscreen: true, maxWarnings: 3 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockAttempts: AssessmentAttemptSummary[] = [
    {
      id: 'att-locked-1',
      studentId: 'st-1',
      studentName: 'Nishu Gupta',
      admissionNumber: 'ADM-2026-001',
      rollNumber: '1',
      status: AttemptStatus.IN_PROGRESS,
      warningCount: 3,
      totalViolationsCount: 3,
      maxWarnings: 3,
      isLocked: true,
      flaggedForReview: true,
      startedAt: '2026-11-12T10:00:00Z',
      deadlineAt: '2026-11-12T11:00:00Z',
      submittedAt: null,
    },
    {
      id: 'att-submitted-2',
      studentId: 'st-2',
      studentName: 'Aarav Sharma',
      admissionNumber: 'ADM-2026-002',
      rollNumber: '2',
      status: AttemptStatus.SUBMITTED,
      warningCount: 0,
      totalViolationsCount: 0,
      maxWarnings: 3,
      isLocked: false,
      flaggedForReview: false,
      startedAt: '2026-11-12T10:05:00Z',
      deadlineAt: '2026-11-12T11:05:00Z',
      submittedAt: '2026-11-12T10:55:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders attempts list with student details, lock indicators, and status badges', async () => {
    (examinationApi.listAssessmentAttempts as any).mockResolvedValue(mockAttempts);

    render(
      <AssessmentAttemptsModal
        assessment={mockAssessment}
        onClose={vi.fn()}
        onAuditAttempt={vi.fn()}
      />,
    );

    expect(screen.getByText('Loading student attempts...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Nishu Gupta')).toBeInTheDocument();
      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
      expect(screen.getByText('ADM-2026-001')).toBeInTheDocument();
      expect(screen.getByText('Locked (3/3)')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Submitted')).toBeInTheDocument();
      expect(screen.getByText(/Total Attempts/i)).toBeInTheDocument();
      expect(screen.getByText(/1 Locked/i)).toBeInTheDocument();
    });
  });

  it('calls onAuditAttempt with the selected attemptId when Audit is clicked', async () => {
    (examinationApi.listAssessmentAttempts as any).mockResolvedValue(mockAttempts);
    const onAuditAttempt = vi.fn();

    render(
      <AssessmentAttemptsModal
        assessment={mockAssessment}
        onClose={vi.fn()}
        onAuditAttempt={onAuditAttempt}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Nishu Gupta')).toBeInTheDocument();
    });

    const auditUnlockBtn = screen.getByRole('button', { name: /audit & unlock/i });
    fireEvent.click(auditUnlockBtn);

    expect(onAuditAttempt).toHaveBeenCalledWith('att-locked-1');
  });

  it('filters attempts dynamically by search query', async () => {
    (examinationApi.listAssessmentAttempts as any).mockResolvedValue(mockAttempts);

    render(
      <AssessmentAttemptsModal
        assessment={mockAssessment}
        onClose={vi.fn()}
        onAuditAttempt={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Nishu Gupta')).toBeInTheDocument();
      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search student name/i);
    fireEvent.change(searchInput, { target: { value: 'Nishu' } });

    expect(screen.getByText('Nishu Gupta')).toBeInTheDocument();
    expect(screen.queryByText('Aarav Sharma')).not.toBeInTheDocument();
  });

  it('displays empty state when zero student attempts exist', async () => {
    (examinationApi.listAssessmentAttempts as any).mockResolvedValue([]);

    render(
      <AssessmentAttemptsModal
        assessment={mockAssessment}
        onClose={vi.fn()}
        onAuditAttempt={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No Student Attempts')).toBeInTheDocument();
      expect(
        screen.getByText(/No students have started or submitted an attempt/i),
      ).toBeInTheDocument();
    });
  });

  it('displays clear 403 Forbidden unauthorized error message', async () => {
    const forbiddenError = {
      response: {
        status: 403,
        data: { message: 'You may only view attempts for assessments you authored' },
      },
    };
    (examinationApi.listAssessmentAttempts as any).mockRejectedValue(forbiddenError);

    render(
      <AssessmentAttemptsModal
        assessment={mockAssessment}
        onClose={vi.fn()}
        onAuditAttempt={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText('You are not authorized to view attempts for this assessment.'),
      ).toBeInTheDocument();
    });
  });

  it('handles general error with a functional retry button', async () => {
    (examinationApi.listAssessmentAttempts as any)
      .mockRejectedValueOnce(new Error('Network error loading attempts'))
      .mockResolvedValueOnce(mockAttempts);

    render(
      <AssessmentAttemptsModal
        assessment={mockAssessment}
        onClose={vi.fn()}
        onAuditAttempt={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Network error loading attempts')).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Nishu Gupta')).toBeInTheDocument();
    });
  });
});
