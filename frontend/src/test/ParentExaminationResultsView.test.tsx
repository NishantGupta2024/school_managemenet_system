import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ParentExaminationResultsView } from '../components/ParentExaminationResultsView';
import {
  AssessmentMode,
  AssessmentStatus,
  AttemptStatus,
} from '../services/examination.api';
import { Student } from '../services/api';

const mockExaminationApi = vi.hoisted(() => ({
  getParentStudentAssessments: vi.fn(),
  getParentAssessmentResult: vi.fn(),
}));

const mockMetaApi = vi.hoisted(() => ({
  getAccessibleStudents: vi.fn(),
}));

vi.mock('../services/examination.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/examination.api')>();
  return {
    ...actual,
    examinationApi: mockExaminationApi,
    default: mockExaminationApi,
  };
});

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    metaApi: mockMetaApi,
  };
});

describe('ParentExaminationResultsView Component', () => {
  const mockActiveStudent1: Student = {
    id: 'student-1',
    schoolId: 'school-1',
    admissionNumber: 'ADM-001',
    firstName: 'Alice',
    lastName: 'Johnson',
    status: 'ACTIVE',
    gradeId: 'grade-1',
    academicYearId: 'year-1',
    grade: { id: 'grade-1', name: 'Grade 10', code: 'G10', schoolId: 'school-1' },
    section: { id: 'sec-1', name: 'Section A' },
    academicYear: { id: 'year-1', name: '2026-2027', schoolId: 'school-1', isCurrent: true, startDate: '', endDate: '' },
  };

  const mockActiveStudent2: Student = {
    id: 'student-2',
    schoolId: 'school-1',
    admissionNumber: 'ADM-002',
    firstName: 'Bob',
    lastName: 'Johnson',
    status: 'ACTIVE',
    gradeId: 'grade-2',
    academicYearId: 'year-1',
    grade: { id: 'grade-2', name: 'Grade 8', code: 'G8', schoolId: 'school-1' },
    section: { id: 'sec-2', name: 'Section B' },
    academicYear: { id: 'year-1', name: '2026-2027', schoolId: 'school-1', isCurrent: true, startDate: '', endDate: '' },
  };

  const mockInactiveStudent: Student = {
    id: 'student-inactive',
    schoolId: 'school-1',
    admissionNumber: 'ADM-999',
    firstName: 'Charlie',
    lastName: 'Inactive',
    status: 'ALUMNI',
    gradeId: 'grade-12',
    academicYearId: 'year-1',
  };

  const mockAssessmentsHistory = [
    {
      assessmentId: 'asm-released-1',
      title: 'Mathematics Term Final',
      subject: 'Mathematics',
      chapterId: 'ch-1',
      chapterCode: 'MATH-101',
      chapterTitle: 'Quadratic Equations',
      mode: AssessmentMode.NORMAL_QUIZ,
      totalMarks: 50,
      passingMarks: 20,
      durationMinutes: 45,
      startWindowAt: '2026-10-01T10:00:00Z',
      endWindowAt: '2026-10-01T18:00:00Z',
      assessmentStatus: AssessmentStatus.RESULTS_RELEASED,
      hasAttempt: true,
      attemptId: 'att-1',
      attemptStatus: AttemptStatus.SUBMITTED,
      submittedAt: '2026-10-01T11:00:00Z',
      releasedResultSummary: {
        attemptId: 'att-1',
        totalQuestions: 10,
        attemptedQuestions: 10,
        correctAnswers: 9,
        incorrectAnswers: 1,
        score: 45,
        percentage: 90,
        isPassing: true,
        submittedAt: '2026-10-01T11:00:00Z',
      },
    },
    {
      assessmentId: 'asm-submitted-pending-2',
      title: 'Physics Midterm Assessment',
      subject: 'Physics',
      chapterId: null,
      chapterCode: null,
      chapterTitle: null,
      mode: AssessmentMode.LIVE_EXAM,
      totalMarks: 100,
      passingMarks: 40,
      durationMinutes: 90,
      startWindowAt: '2026-10-15T09:00:00Z',
      endWindowAt: '2026-10-15T11:00:00Z',
      assessmentStatus: AssessmentStatus.PUBLISHED,
      hasAttempt: true,
      attemptId: 'att-2',
      attemptStatus: AttemptStatus.SUBMITTED,
      submittedAt: '2026-10-15T10:25:00Z',
      releasedResultSummary: null,
    },
    {
      assessmentId: 'asm-timedout-3',
      title: 'Chemistry Speed Test',
      subject: 'Chemistry',
      chapterId: 'ch-2',
      chapterCode: 'CHEM-201',
      chapterTitle: 'Organic Synthesis',
      mode: AssessmentMode.NORMAL_QUIZ,
      totalMarks: 30,
      passingMarks: 12,
      durationMinutes: 20,
      startWindowAt: '2026-10-20T10:00:00Z',
      endWindowAt: '2026-10-20T12:00:00Z',
      assessmentStatus: AssessmentStatus.PUBLISHED,
      hasAttempt: true,
      attemptId: 'att-3',
      attemptStatus: AttemptStatus.TIMED_OUT,
      submittedAt: '2026-10-20T10:20:00Z',
      releasedResultSummary: null,
    },
    {
      assessmentId: 'asm-inprogress-4',
      title: 'Biology Unit Quiz',
      subject: 'Biology',
      chapterId: 'ch-3',
      chapterCode: 'BIO-101',
      chapterTitle: 'Cell Division',
      mode: AssessmentMode.NORMAL_QUIZ,
      totalMarks: 25,
      passingMarks: 10,
      durationMinutes: 30,
      startWindowAt: '2026-10-28T08:00:00Z',
      endWindowAt: '2026-10-28T20:00:00Z',
      assessmentStatus: AssessmentStatus.PUBLISHED,
      hasAttempt: true,
      attemptId: 'att-4',
      attemptStatus: AttemptStatus.IN_PROGRESS,
      submittedAt: null,
      releasedResultSummary: null,
    },
    {
      assessmentId: 'asm-available-5',
      title: 'History General Test',
      subject: 'History',
      chapterId: null,
      chapterCode: null,
      chapterTitle: null,
      mode: AssessmentMode.NORMAL_QUIZ,
      totalMarks: 40,
      passingMarks: 16,
      durationMinutes: 40,
      startWindowAt: '2026-10-29T08:00:00Z',
      endWindowAt: '2026-11-05T20:00:00Z',
      assessmentStatus: AssessmentStatus.PUBLISHED,
      hasAttempt: false,
      attemptId: null,
      attemptStatus: null,
      submittedAt: null,
      releasedResultSummary: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockMetaApi.getAccessibleStudents.mockResolvedValue([mockActiveStudent1]);
    mockExaminationApi.getParentStudentAssessments.mockResolvedValue({
      studentId: 'student-1',
      assessments: mockAssessmentsHistory,
    });
  });

  // ===========================================================================
  // 1. Child Selection Tests
  // ===========================================================================
  describe('Child Selection', () => {
    it('renders child info for a single linked active student and fetches examination history', async () => {
      mockMetaApi.getAccessibleStudents.mockResolvedValue([mockActiveStudent1]);

      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
        expect(screen.getByText('ADM-001')).toBeInTheDocument();
        expect(screen.getByText('Grade 10')).toBeInTheDocument();
        expect(screen.getByText('Section A')).toBeInTheDocument();
        expect(mockExaminationApi.getParentStudentAssessments).toHaveBeenCalledWith('student-1');
      });

      expect(screen.queryByLabelText(/Select Ward:/i)).not.toBeInTheDocument();
    });

    it('renders a child selector when multiple active children are linked and allows switching', async () => {
      mockMetaApi.getAccessibleStudents.mockResolvedValue([mockActiveStudent1, mockActiveStudent2]);
      mockExaminationApi.getParentStudentAssessments
        .mockResolvedValueOnce({ studentId: 'student-1', assessments: mockAssessmentsHistory })
        .mockResolvedValueOnce({ studentId: 'student-2', assessments: [] });

      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByText(/Select Ward:/i)).toBeInTheDocument();
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      const selector = screen.getByLabelText(/Select Ward:/i);
      fireEvent.change(selector, { target: { value: 'student-2' } });

      await waitFor(() => {
        expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
        expect(screen.getByText('ADM-002')).toBeInTheDocument();
      });

      expect(mockExaminationApi.getParentStudentAssessments).toHaveBeenCalledWith('student-2');
    });

    it('handles no accessible students gracefully by displaying the designated empty state', async () => {
      mockMetaApi.getAccessibleStudents.mockResolvedValue([]);

      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(
          screen.getByText('No verified student profiles are linked to your parent account. Please contact the school administration.'),
        ).toBeInTheDocument();
      });

      expect(mockExaminationApi.getParentStudentAssessments).not.toHaveBeenCalled();
    });

    it('filters out inactive students and displays only ACTIVE students', async () => {
      mockMetaApi.getAccessibleStudents.mockResolvedValue([mockActiveStudent1, mockInactiveStudent]);

      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      expect(screen.queryByText('Charlie Inactive')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Select Ward:/i)).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 2. Examination History & Filtering Tests
  // ===========================================================================
  describe('Examination History & Filtering', () => {
    it('renders examination history list with titles, subjects, modes, marks, and status badges', async () => {
      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByText('Mathematics Term Final')).toBeInTheDocument();
        expect(screen.getByText('Physics Midterm Assessment')).toBeInTheDocument();
        expect(screen.getByText('Chemistry Speed Test')).toBeInTheDocument();
        expect(screen.getByText('Biology Unit Quiz')).toBeInTheDocument();
        expect(screen.getByText('History General Test')).toBeInTheDocument();
      });

      // Status badges
      expect(screen.getAllByText('Results Released').length).toBeGreaterThan(0);
      expect(screen.getByText('Submitted — Results Pending')).toBeInTheDocument();
      expect(screen.getByText('Timed Out — Results Pending')).toBeInTheDocument();
      expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
      expect(screen.getByText('Available')).toBeInTheDocument();
    });

    it('handles nullable chapter metadata by rendering General Assessment fallback', async () => {
      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByText('Physics Midterm Assessment')).toBeInTheDocument();
      });

      // Non-chapter assessment shows "General Assessment"
      const generalLabels = screen.getAllByText('General Assessment');
      expect(generalLabels.length).toBeGreaterThan(0);

      // Chapter-linked assessment shows chapter code and title
      expect(screen.getByText('MATH-101: Quadratic Equations')).toBeInTheDocument();
    });

    it('renders empty examination state when student has no assessments', async () => {
      mockExaminationApi.getParentStudentAssessments.mockResolvedValue({
        studentId: 'student-1',
        assessments: [],
      });

      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByText('No examinations found for this student.')).toBeInTheDocument();
      });
    });

    it('filters assessments by Results Released tab', async () => {
      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByText('Mathematics Term Final')).toBeInTheDocument();
      });

      // Click "Results Released" filter tab
      const tabButton = screen.getByRole('button', { name: /Results Released \(/i });
      fireEvent.click(tabButton);

      await waitFor(() => {
        expect(screen.getByText('Mathematics Term Final')).toBeInTheDocument();
        expect(screen.queryByText('Physics Midterm Assessment')).not.toBeInTheDocument();
        expect(screen.queryByText('Biology Unit Quiz')).not.toBeInTheDocument();
      });
    });

    it('filters assessments by In Progress tab', async () => {
      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByText('Biology Unit Quiz')).toBeInTheDocument();
      });

      const tabButton = screen.getByRole('button', { name: /In Progress \(/i });
      fireEvent.click(tabButton);

      await waitFor(() => {
        expect(screen.getByText('Biology Unit Quiz')).toBeInTheDocument();
        expect(screen.queryByText('Mathematics Term Final')).not.toBeInTheDocument();
        expect(screen.queryByText('History General Test')).not.toBeInTheDocument();
      });
    });

    it('filters assessments by Completed tab', async () => {
      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByText('Mathematics Term Final')).toBeInTheDocument();
      });

      const tabButton = screen.getByRole('button', { name: /Completed \(/i });
      fireEvent.click(tabButton);

      await waitFor(() => {
        expect(screen.getByText('Mathematics Term Final')).toBeInTheDocument();
        expect(screen.getByText('Physics Midterm Assessment')).toBeInTheDocument();
        expect(screen.getByText('Chemistry Speed Test')).toBeInTheDocument();
        expect(screen.queryByText('Biology Unit Quiz')).not.toBeInTheDocument();
        expect(screen.queryByText('History General Test')).not.toBeInTheDocument();
      });
    });

    it('opens unreleased result notice modal when clicking Results Pending on completed test without exposing marks', async () => {
      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByText('Physics Midterm Assessment')).toBeInTheDocument();
      });

      // Find Results Pending button
      const pendingButtons = screen.getAllByRole('button', { name: /Results Pending/i });
      expect(pendingButtons.length).toBeGreaterThan(0);
      fireEvent.click(pendingButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Result Under Institutional Review')).toBeInTheDocument();
        expect(
          screen.getByText("Your child's examination has been completed. The school has not published the result yet."),
        ).toBeInTheDocument();
      });

      // Ensure no fabricated marks or scores are present in the notification
      expect(screen.queryByText(/% Score/i)).not.toBeInTheDocument();
      expect(screen.queryByText('PASSED')).not.toBeInTheDocument();
      expect(screen.queryByText('NEEDS IMPROVEMENT')).not.toBeInTheDocument();

      // Dismiss modal
      fireEvent.click(screen.getByRole('button', { name: /Understood/i }));
      await waitFor(() => {
        expect(screen.queryByText('Result Under Institutional Review')).not.toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // 3. Individual Scorecard Tests
  // ===========================================================================
  describe('Scorecard Modal & Privacy', () => {
    const mockScorecardView = {
      assessmentId: 'asm-released-1',
      title: 'Mathematics Term Final',
      subject: 'Mathematics',
      chapterId: 'ch-1',
      chapterCode: 'MATH-101',
      chapterTitle: 'Quadratic Equations',
      mode: AssessmentMode.NORMAL_QUIZ,
      totalMarks: 50,
      passingMarks: 20,
      durationMinutes: 45,
      hasAttempt: true,
      assessmentStatus: AssessmentStatus.RESULTS_RELEASED,
      attemptStatus: AttemptStatus.SUBMITTED,
      result: {
        attemptId: 'att-1',
        totalQuestions: 10,
        attemptedQuestions: 10,
        correctAnswers: 9,
        incorrectAnswers: 1,
        score: 45,
        percentage: 90,
        isPassing: true,
        submittedAt: '2026-10-01T11:00:00Z',
      },
    };

    it('loads and displays released scorecard with certified breakdown', async () => {
      mockExaminationApi.getParentAssessmentResult.mockResolvedValue(mockScorecardView);

      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /View Scorecard/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /View Scorecard/i }));

      await waitFor(() => {
        expect(screen.getByText('Official Examination Scorecard')).toBeInTheDocument();
        expect(screen.getByText('PASSED')).toBeInTheDocument();
        expect(screen.getByText('90.0% Score')).toBeInTheDocument();
        expect(screen.getByText('45')).toBeInTheDocument();
        expect(screen.getByText('Total Questions')).toBeInTheDocument();
        expect(screen.getByText('Attempted')).toBeInTheDocument();
        expect(screen.getByText('Correct Answers')).toBeInTheDocument();
        expect(screen.getByText('Incorrect Answers')).toBeInTheDocument();
      });

      expect(mockExaminationApi.getParentAssessmentResult).toHaveBeenCalledWith('student-1', 'asm-released-1');

      // Verify answer keys or option selections are not rendered
      expect(screen.queryByText(/Correct Option/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Explanation/i)).not.toBeInTheDocument();

      // Close scorecard
      fireEvent.click(screen.getByRole('button', { name: /Back to History/i }));
      await waitFor(() => {
        expect(screen.queryByText('Official Examination Scorecard')).not.toBeInTheDocument();
      });
    });

    it('does not refetch scorecard if already open', async () => {
      mockExaminationApi.getParentAssessmentResult.mockResolvedValue(mockScorecardView);

      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /View Scorecard/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /View Scorecard/i }));

      await waitFor(() => {
        expect(screen.getByText('Official Examination Scorecard')).toBeInTheDocument();
      });

      expect(mockExaminationApi.getParentAssessmentResult).toHaveBeenCalledTimes(1);
    });

    it('handles 403 unreleased error safely without displaying marks', async () => {
      mockExaminationApi.getParentAssessmentResult.mockRejectedValue({
        response: { status: 403, data: { message: 'Assessment results have not been released yet' } },
      });

      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /View Scorecard/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /View Scorecard/i }));

      await waitFor(() => {
        expect(screen.getByText('Assessment results have not been released yet')).toBeInTheDocument();
      });

      expect(screen.queryByText('PASSED')).not.toBeInTheDocument();
      expect(screen.queryByText('Score')).not.toBeInTheDocument();
    });

    it('handles no-attempt response when hasAttempt is false', async () => {
      mockExaminationApi.getParentAssessmentResult.mockResolvedValue({
        assessmentId: 'asm-released-1',
        title: 'Mathematics Term Final',
        subject: 'Mathematics',
        totalMarks: 50,
        passingMarks: 20,
        hasAttempt: false,
        result: null,
      });

      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /View Scorecard/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /View Scorecard/i }));

      await waitFor(() => {
        expect(screen.getByText('No examination attempt was recorded for this assessment.')).toBeInTheDocument();
      });
    });

    it('handles missing persisted result when result is null', async () => {
      mockExaminationApi.getParentAssessmentResult.mockResolvedValue({
        assessmentId: 'asm-released-1',
        title: 'Mathematics Term Final',
        subject: 'Mathematics',
        totalMarks: 50,
        passingMarks: 20,
        hasAttempt: true,
        result: null,
      });

      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /View Scorecard/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /View Scorecard/i }));

      await waitFor(() => {
        expect(
          screen.getByText('Result details are currently unavailable. Please contact the school administration.'),
        ).toBeInTheDocument();
      });
    });

    it('handles network failure gracefully', async () => {
      mockExaminationApi.getParentAssessmentResult.mockRejectedValue(new Error('Network error'));

      render(<ParentExaminationResultsView />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /View Scorecard/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /View Scorecard/i }));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });
});
