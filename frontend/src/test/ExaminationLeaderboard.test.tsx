import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ExaminationLeaderboardModal } from '../components/ExaminationLeaderboardModal';
import { SchoolAdminExaminationMonitoringView } from '../components/SchoolAdminExaminationMonitoringView';
import { PlatformSuperAdminExaminationMonitoringView } from '../components/PlatformSuperAdminExaminationMonitoringView';
import { StudentExaminationPortal } from '../components/StudentExaminationPortal';
import { ParentExaminationResultsView } from '../components/ParentExaminationResultsView';
import { TeacherExaminationView } from '../components/TeacherExaminationView';
import { ExaminationWorkspace } from '../components/ExaminationWorkspace';
import {
  AssessmentMode,
  AssessmentStatus,
  AttemptStatus,
  type LeaderboardResponse,
  type PlatformLeaderboardMetrics,
} from '../services/examination.api';
import { UserRole } from '../services/api';

// =============================================================================
// API Mocks Setup
// =============================================================================

const mockExaminationApi = vi.hoisted(() => ({
  listAssessments: vi.fn(),
  listStudentAssessments: vi.fn(),
  getStudentAssessmentResult: vi.fn(),
  getAttempt: vi.fn(),
  startAssessment: vi.fn(),
  saveAnswer: vi.fn(),
  submitAttempt: vi.fn(),
  getParentStudentAssessments: vi.fn(),
  getParentAssessmentResult: vi.fn(),
  getStudentLeaderboard: vi.fn(),
  getParentLeaderboard: vi.fn(),
  getStaffLeaderboard: vi.fn(),
  getLeaderboardPrivacySetting: vi.fn(),
  updateLeaderboardPrivacySetting: vi.fn(),
  getPlatformLeaderboardMetrics: vi.fn(),
  listChapters: vi.fn(),
  getQuestionImageBlob: vi.fn(),
}));

const mockMetaApi = vi.hoisted(() => ({
  getAccessibleStudents: vi.fn(),
}));

const mockTeachersApi = vi.hoisted(() => ({
  getTeachers: vi.fn(),
}));

const mockAcademicsApi = vi.hoisted(() => ({
  getGrades: vi.fn(),
  getAcademicYears: vi.fn(),
}));

const mockSchoolsApi = vi.hoisted(() => ({
  list: vi.fn(),
}));

const mockAuthContext = vi.hoisted(() => ({
  user: {
    id: 'user-1',
    name: 'Test User',
    role: 'STUDENT' as UserRole,
    schoolId: 'school-1',
  },
  token: 'mock-token',
  isAuthenticated: true,
  isLoading: false,
  selectedSchoolId: 'school-1',
  selectedSchool: { id: 'school-1', name: 'Springfield High', code: 'SPH' },
  availableSchools: [{ id: 'school-1', name: 'Springfield High', code: 'SPH' }],
  organizationContextLoading: false,
  organizationContextError: null,
  selectSchool: vi.fn(),
  clearSelectedSchool: vi.fn(),
  refreshAvailableSchools: vi.fn(),
  setSelectedSchoolId: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
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
    teachersApi: mockTeachersApi,
    academicsApi: mockAcademicsApi,
    schoolsApi: mockSchoolsApi,
    getMyTeacherProfile: vi.fn().mockResolvedValue({ id: 'teacher-1', schoolId: 'school-1' }),
    setActiveSchoolId: vi.fn(),
  };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthContext,
  useOptionalAuth: () => mockAuthContext,
}));

// =============================================================================
// Test Suites for TASK-P4-09B-7A
// =============================================================================

describe('Examination Leaderboard Frontend Integration (TASK-P4-09B-7A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSchoolsApi.list.mockResolvedValue({
      data: [{ id: 'school-1', name: 'Springfield High', code: 'SPH' }],
    });
  });

  // ---------------------------------------------------------------------------
  // 1 & 2. Student Leaderboard Visibility (Released vs Pending)
  // ---------------------------------------------------------------------------
  describe('Student Portal Leaderboard Visibility', () => {
    it('1. shows "View Official Leaderboard" button when results are released', async () => {
      mockAuthContext.user = {
        id: 'student-usr-1',
        name: 'Alice Johnson',
        role: UserRole.STUDENT,
        schoolId: 'school-1',
      };

      // Mock listStudentAssessments with a completed attempt
      mockExaminationApi.listStudentAssessments.mockResolvedValue([
        {
          id: 'exam-1',
          title: 'Mathematics Final Exam',
          subject: 'Mathematics',
          mode: AssessmentMode.NORMAL_QUIZ,
          totalMarks: 100,
          passingMarks: 40,
          durationMinutes: 60,
          startWindowAt: null,
          endWindowAt: null,
          hasAttempt: true,
          attemptStatus: AttemptStatus.SUBMITTED,
          attemptId: 'att-1',
        },
      ]);

      mockExaminationApi.getAttempt.mockResolvedValue({
        id: 'att-1',
        assessmentId: 'exam-1',
        status: AttemptStatus.SUBMITTED,
        remainingSeconds: 0,
        answers: {},
      });

      // Mock getStudentAssessmentResult returning released result
      mockExaminationApi.getStudentAssessmentResult.mockResolvedValue({
        assessmentId: 'exam-1',
        title: 'Mathematics Final Exam',
        subject: 'Mathematics',
        totalMarks: 100,
        passingMarks: 40,
        hasAttempt: true,
        result: {
          assessmentResultId: 'res-1',
          score: 88,
          percentage: 88.0,
          isPassing: true,
          attemptedQuestions: 10,
          totalQuestions: 10,
          correctAnswers: 9,
          incorrectAnswers: 1,
          unattemptedQuestions: 0,
          submittedAt: '2026-10-30T10:00:00Z',
        },
      });

      render(
        <BrowserRouter>
          <StudentExaminationPortal />
        </BrowserRouter>,
      );

      // Wait for assessments list
      await waitFor(() => {
        expect(screen.getByText('Mathematics Final Exam')).toBeInTheDocument();
      });

      // Click "View Submission & Result"
      const viewResultBtn = screen.getByText(/View Submission & Result/i);
      fireEvent.click(viewResultBtn);

      // Verify "View Official Leaderboard" button appears
      await waitFor(() => {
        expect(screen.getByText(/View Official Leaderboard/i)).toBeInTheDocument();
      });
    });

    it('2. hides "View Official Leaderboard" button when results are pending release', async () => {
      mockAuthContext.user = {
        id: 'student-usr-1',
        name: 'Alice Johnson',
        role: UserRole.STUDENT,
        schoolId: 'school-1',
      };

      mockExaminationApi.listStudentAssessments.mockResolvedValue([
        {
          id: 'exam-2',
          title: 'Science Midterm',
          subject: 'Science',
          mode: AssessmentMode.NORMAL_QUIZ,
          totalMarks: 50,
          passingMarks: 20,
          durationMinutes: 30,
          startWindowAt: null,
          endWindowAt: null,
          hasAttempt: true,
          attemptStatus: AttemptStatus.SUBMITTED,
          attemptId: 'att-2',
        },
      ]);

      mockExaminationApi.getAttempt.mockResolvedValue({
        id: 'att-2',
        assessmentId: 'exam-2',
        status: AttemptStatus.SUBMITTED,
        remainingSeconds: 0,
        answers: {},
      });

      // Mock getStudentAssessmentResult returning null result (unreleased)
      mockExaminationApi.getStudentAssessmentResult.mockResolvedValue({
        assessmentId: 'exam-2',
        title: 'Science Midterm',
        subject: 'Science',
        totalMarks: 50,
        passingMarks: 20,
        hasAttempt: true,
        result: null,
        message: 'Assessment results have not been released yet.',
      });

      render(
        <BrowserRouter>
          <StudentExaminationPortal />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Science Midterm')).toBeInTheDocument();
      });

      const viewResultBtn = screen.getByText(/View Submission & Result/i);
      fireEvent.click(viewResultBtn);

      await waitFor(() => {
        expect(screen.getByText(/Official Results Pending Release/i)).toBeInTheDocument();
      });

      // Assert leaderboard button is NOT in the document
      expect(screen.queryByText(/View Official Leaderboard/i)).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 3, 4, 5, 6. Leaderboard Modal Features: Current User Highlight, Masking & Pagination
  // ---------------------------------------------------------------------------
  describe('Leaderboard Modal: Current User Highlight, Masking & Pagination', () => {
    it('3 & 4. highlights own student row and displays masked peer labels when privacy is OFF', async () => {
      const mockLeaderboardData: LeaderboardResponse = {
        entries: [
          {
            rank: 1,
            studentName: 'Participant #1',
            score: 95,
            percentage: 95.0,
            isPassing: true,
            isCurrentUser: false,
          },
          {
            rank: 2,
            studentName: 'Alice Johnson',
            score: 88,
            percentage: 88.0,
            isPassing: true,
            isCurrentUser: true,
          },
          {
            rank: 3,
            studentName: 'Participant #3',
            score: 72,
            percentage: 72.0,
            isPassing: true,
            isCurrentUser: false,
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          totalCount: 3,
          totalPages: 1,
        },
        totalParticipants: 3,
      };

      mockExaminationApi.getStudentLeaderboard.mockResolvedValueOnce(mockLeaderboardData);

      render(
        <ExaminationLeaderboardModal
          isOpen={true}
          onClose={vi.fn()}
          assessmentId="exam-1"
          assessmentTitle="Mathematics Final Exam"
          subject="Mathematics"
          totalMarks={100}
          userRole="STUDENT"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Mathematics Final Exam')).toBeInTheDocument();
      });

      // 4. Verify masked peer labels
      expect(screen.getByText('Participant #1')).toBeInTheDocument();
      expect(screen.getByText('Participant #3')).toBeInTheDocument();

      // 3. Verify own student row is visible with "You" badge
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('You')).toBeInTheDocument();

      // Verify privacy indicator badge
      expect(
        screen.getByText(/Peer names masked per school privacy policy/i),
      ).toBeInTheDocument();
    });

    it('5. displays unmasked peer names when backend returns visible identities', async () => {
      const mockVisibleData: LeaderboardResponse = {
        entries: [
          {
            rank: 1,
            studentName: 'Charlie Brown',
            score: 95,
            percentage: 95.0,
            isPassing: true,
            isCurrentUser: false,
          },
          {
            rank: 2,
            studentName: 'Alice Johnson',
            score: 88,
            percentage: 88.0,
            isPassing: true,
            isCurrentUser: true,
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          totalCount: 2,
          totalPages: 1,
        },
        totalParticipants: 2,
      };

      mockExaminationApi.getStudentLeaderboard.mockResolvedValueOnce(mockVisibleData);

      render(
        <ExaminationLeaderboardModal
          isOpen={true}
          onClose={vi.fn()}
          assessmentId="exam-1"
          assessmentTitle="Mathematics Final Exam"
          subject="Mathematics"
          totalMarks={100}
          userRole="STUDENT"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
      });

      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText(/Transparent Public Rankings/i)).toBeInTheDocument();
    });

    it('6. handles pagination requests when moving to the next page', async () => {
      const page1Data: LeaderboardResponse = {
        entries: [
          {
            rank: 1,
            studentName: 'Participant #1',
            score: 100,
            percentage: 100.0,
            isPassing: true,
            isCurrentUser: false,
          },
        ],
        pagination: {
          page: 1,
          limit: 1,
          totalCount: 2,
          totalPages: 2,
        },
        totalParticipants: 2,
      };

      const page2Data: LeaderboardResponse = {
        entries: [
          {
            rank: 2,
            studentName: 'Alice Johnson',
            score: 90,
            percentage: 90.0,
            isPassing: true,
            isCurrentUser: true,
          },
        ],
        pagination: {
          page: 2,
          limit: 1,
          totalCount: 2,
          totalPages: 2,
        },
        totalParticipants: 2,
      };

      mockExaminationApi.getStudentLeaderboard
        .mockResolvedValueOnce(page1Data)
        .mockResolvedValueOnce(page2Data);

      render(
        <ExaminationLeaderboardModal
          isOpen={true}
          onClose={vi.fn()}
          assessmentId="exam-1"
          assessmentTitle="Mathematics Final Exam"
          userRole="STUDENT"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Participant #1')).toBeInTheDocument();
      });

      // Click Next page button
      const nextBtn = screen.getByRole('button', { name: /Next/i });
      expect(nextBtn).toBeEnabled();
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(mockExaminationApi.getStudentLeaderboard).toHaveBeenCalledWith('exam-1', 2, 20);
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 7, 8, 9. Parent Portal Leaderboard, Child Highlight & Privacy
  // ---------------------------------------------------------------------------
  describe('Parent Portal Integration', () => {
    it('7, 8 & 9. loads child leaderboard, highlights child row and masks peers', async () => {
      mockAuthContext.user = {
        id: 'parent-usr-1',
        name: 'Martha Johnson',
        role: UserRole.PARENT,
        schoolId: 'school-1',
      };

      // Mock accessible children
      mockMetaApi.getAccessibleStudents.mockResolvedValue([
        {
          id: 'child-1',
          schoolId: 'school-1',
          admissionNumber: 'ADM-001',
          firstName: 'Alice',
          lastName: 'Johnson',
          status: 'ACTIVE',
          grade: { id: 'grade-1', name: 'Grade 10' },
          section: { id: 'sec-1', name: 'Section A' },
        },
      ]);

      // Mock parent assessment history
      mockExaminationApi.getParentStudentAssessments.mockResolvedValue({
        studentId: 'child-1',
        assessments: [
          {
            assessmentId: 'exam-1',
            title: 'Mathematics Final Exam',
            subject: 'Mathematics',
            assessmentStatus: AssessmentStatus.RESULTS_RELEASED,
            totalMarks: 100,
            durationMinutes: 60,
            hasAttempt: true,
            attemptStatus: AttemptStatus.SUBMITTED,
            submittedAt: '2026-10-30T10:00:00Z',
          },
        ],
      });

      // Mock parent leaderboard response
      mockExaminationApi.getParentLeaderboard.mockResolvedValue({
        entries: [
          {
            rank: 1,
            studentName: 'Participant #1',
            score: 95,
            percentage: 95.0,
            isPassing: true,
            isCurrentUser: false,
          },
          {
            rank: 2,
            studentName: 'Alice Johnson',
            score: 88,
            percentage: 88.0,
            isPassing: true,
            isCurrentUser: true,
          },
        ],
        pagination: { page: 1, limit: 20, totalCount: 2, totalPages: 1 },
        totalParticipants: 2,
      });

      render(
        <BrowserRouter>
          <ParentExaminationResultsView />
        </BrowserRouter>,
      );

      // Wait for assessment item to appear
      await waitFor(() => {
        expect(screen.getByText('Mathematics Final Exam')).toBeInTheDocument();
      });

      // 7. Click Leaderboard button for the released assessment
      const leaderboardBtn = screen.getByRole('button', { name: /Leaderboard/i });
      fireEvent.click(leaderboardBtn);

      // 8 & 9. Check child row highlight & masked peers
      await waitFor(() => {
        expect(mockExaminationApi.getParentLeaderboard).toHaveBeenCalledWith(
          'child-1',
          'exam-1',
          1,
          20,
        );
        expect(screen.getByText('Participant #1')).toBeInTheDocument();
        expect(screen.getAllByText('Alice Johnson').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/Child \(Alice Johnson\)/i)).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Teacher Identifiable Leaderboard
  // ---------------------------------------------------------------------------
  describe('Teacher Portal Identifiable Leaderboard', () => {
    it('10. displays identifiable student names on staff leaderboard for released tests', async () => {
      mockAuthContext.user = {
        id: 'teacher-usr-1',
        name: 'Prof. Xavier',
        role: UserRole.TEACHER,
        schoolId: 'school-1',
      };

      mockExaminationApi.listAssessments.mockResolvedValueOnce([
        {
          id: 'exam-1',
          schoolId: 'school-1',
          title: 'Physics Term 1',
          subject: 'Physics',
          status: AssessmentStatus.RESULTS_RELEASED,
          totalMarks: 100,
          passingMarks: 40,
          durationMinutes: 90,
          mode: AssessmentMode.NORMAL_QUIZ,
        },
      ]);
      mockAcademicsApi.getGrades.mockResolvedValueOnce([]);
      mockAcademicsApi.getAcademicYears.mockResolvedValueOnce([]);
      mockExaminationApi.listChapters.mockResolvedValueOnce([]);

      mockExaminationApi.getStaffLeaderboard.mockResolvedValueOnce({
        entries: [
          {
            rank: 1,
            studentName: 'Daniel Craig',
            score: 98,
            percentage: 98.0,
            isPassing: true,
            isCurrentUser: false,
          },
          {
            rank: 2,
            studentName: 'Emma Watson',
            score: 94,
            percentage: 94.0,
            isPassing: true,
            isCurrentUser: false,
          },
        ],
        pagination: { page: 1, limit: 20, totalCount: 2, totalPages: 1 },
        totalParticipants: 2,
      });

      render(
        <BrowserRouter>
          <TeacherExaminationView />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Physics Term 1')).toBeInTheDocument();
      });

      const leaderboardBtn = screen.getByRole('button', { name: /Leaderboard/i });
      fireEvent.click(leaderboardBtn);

      await waitFor(() => {
        expect(mockExaminationApi.getStaffLeaderboard).toHaveBeenCalledWith('exam-1', 1, 20);
        expect(screen.getByText('Daniel Craig')).toBeInTheDocument();
        expect(screen.getByText('Emma Watson')).toBeInTheDocument();
        expect(screen.getByText(/Educator Inspection/i)).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 11, 12, 13, 14. School Admin Privacy Settings & Safety
  // ---------------------------------------------------------------------------
  describe('School Admin Privacy Settings & Safety', () => {
    it('11. loads current privacy setting correctly (default OFF)', async () => {
      mockAuthContext.user = {
        id: 'admin-usr-1',
        name: 'Principal Skinner',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-1',
      };

      mockExaminationApi.listAssessments.mockResolvedValueOnce([]);
      mockTeachersApi.getTeachers.mockResolvedValueOnce({ data: [] });
      mockAcademicsApi.getGrades.mockResolvedValueOnce([]);

      mockExaminationApi.getLeaderboardPrivacySetting.mockResolvedValueOnce({
        schoolId: 'school-1',
        showStudentNamesOnLeaderboards: false,
        updatedAt: null,
        updatedByUserId: null,
      });

      render(
        <BrowserRouter>
          <SchoolAdminExaminationMonitoringView />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(mockExaminationApi.getLeaderboardPrivacySetting).toHaveBeenCalled();
        expect(screen.getByText(/Status: Masked/i)).toBeInTheDocument();
        expect(
          screen.getByText(/Student names masked on student and parent leaderboards/i),
        ).toBeInTheDocument();
      });
    });

    it('12. allows School Admin to toggle ON/OFF and updates backend', async () => {
      mockAuthContext.user = {
        id: 'admin-usr-1',
        name: 'Principal Skinner',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-1',
      };

      mockExaminationApi.listAssessments.mockResolvedValueOnce([]);
      mockTeachersApi.getTeachers.mockResolvedValueOnce({ data: [] });
      mockAcademicsApi.getGrades.mockResolvedValueOnce([]);

      mockExaminationApi.getLeaderboardPrivacySetting.mockResolvedValueOnce({
        schoolId: 'school-1',
        showStudentNamesOnLeaderboards: false,
        updatedAt: null,
        updatedByUserId: null,
      });

      mockExaminationApi.updateLeaderboardPrivacySetting.mockResolvedValueOnce({
        schoolId: 'school-1',
        showStudentNamesOnLeaderboards: true,
        updatedAt: '2026-10-30T22:00:00Z',
        updatedByUserId: 'admin-usr-1',
      });

      render(
        <BrowserRouter>
          <SchoolAdminExaminationMonitoringView />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText(/Status: Masked/i)).toBeInTheDocument();
      });

      const switchBtn = screen.getByRole('switch', { name: /Toggle Show Student Names/i });
      fireEvent.click(switchBtn);

      await waitFor(() => {
        expect(mockExaminationApi.updateLeaderboardPrivacySetting).toHaveBeenCalledWith({
          showStudentNamesOnLeaderboards: true,
        });
        expect(screen.getByText(/Status: Visible/i)).toBeInTheDocument();
        expect(
          screen.getByText(/Student names will now appear on student and parent leaderboards/i),
        ).toBeInTheDocument();
      });
    });

    it('13. prevents duplicate toggle submissions while saving is in-flight', async () => {
      mockAuthContext.user = {
        id: 'admin-usr-1',
        name: 'Principal Skinner',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'school-1',
      };

      mockExaminationApi.listAssessments.mockResolvedValueOnce([]);
      mockTeachersApi.getTeachers.mockResolvedValueOnce({ data: [] });
      mockAcademicsApi.getGrades.mockResolvedValueOnce([]);

      mockExaminationApi.getLeaderboardPrivacySetting.mockResolvedValueOnce({
        schoolId: 'school-1',
        showStudentNamesOnLeaderboards: false,
        updatedAt: null,
        updatedByUserId: null,
      });

      let resolvePatch: any;
      const patchPromise = new Promise((resolve) => {
        resolvePatch = resolve;
      });
      mockExaminationApi.updateLeaderboardPrivacySetting.mockReturnValueOnce(patchPromise);

      render(
        <BrowserRouter>
          <SchoolAdminExaminationMonitoringView />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText(/Status: Masked/i)).toBeInTheDocument();
      });

      const switchBtn = screen.getByRole('switch', { name: /Toggle Show Student Names/i });
      fireEvent.click(switchBtn);

      // Attempt rapid second click while in-flight
      fireEvent.click(switchBtn);

      // Should only have called once
      expect(mockExaminationApi.updateLeaderboardPrivacySetting).toHaveBeenCalledTimes(1);

      // Resolve in-flight request
      resolvePatch({
        schoolId: 'school-1',
        showStudentNamesOnLeaderboards: true,
        updatedAt: '2026-10-30T22:00:00Z',
        updatedByUserId: 'admin-usr-1',
      });

      await waitFor(() => {
        expect(screen.getByText(/Status: Visible/i)).toBeInTheDocument();
      });
    });

    it('14. handles API errors gracefully without fabricating data', async () => {
      mockExaminationApi.getStudentLeaderboard.mockRejectedValueOnce({
        response: { status: 403, data: { message: 'Results not released' } },
      });

      render(
        <ExaminationLeaderboardModal
          isOpen={true}
          onClose={vi.fn()}
          assessmentId="exam-unreleased"
          assessmentTitle="Unreleased Exam"
          userRole="STUDENT"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/Results not released/i)).toBeInTheDocument();
      });

      // No fake rankings or fake scores should be rendered
      expect(screen.queryByText(/Participant #1/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/100%/i)).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 15 & 16. Platform Super Admin Aggregate Telemetry & Read-Only Nature
  // ---------------------------------------------------------------------------
  describe('Platform Super Admin Portal', () => {
    it('15. loads and displays aggregate platform leaderboard metrics only', async () => {
      mockSchoolsApi.list.mockResolvedValueOnce({
        data: [{ id: 'school-1', name: 'Springfield High', code: 'SPH' }],
      });
      mockExaminationApi.listAssessments.mockResolvedValueOnce([]);

      const mockMetrics: PlatformLeaderboardMetrics = {
        totalSchoolsReporting: 5,
        totalReleasedAssessments: 18,
        totalEligibleResults: 350,
        schoolsWithNamesVisibleCount: 1,
        schoolsWithNamesMaskedCount: 4,
      };

      mockExaminationApi.getPlatformLeaderboardMetrics.mockResolvedValueOnce(mockMetrics);

      render(
        <BrowserRouter>
          <PlatformSuperAdminExaminationMonitoringView />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(mockExaminationApi.getPlatformLeaderboardMetrics).toHaveBeenCalled();
        expect(
          screen.getByText(/Cross-Tenant Leaderboard Adoption & Privacy/i),
        ).toBeInTheDocument();
      });

      expect(screen.getByText('350')).toBeInTheDocument(); // Persisted Results
      expect(screen.getByText('18')).toBeInTheDocument(); // Released Exams
      expect(screen.getByText('Transparent mode')).toBeInTheDocument();
      expect(screen.getByText('Privacy default mode')).toBeInTheDocument();
    });

    it('16. contains no assessment or leaderboard authoring controls for Super Admin', async () => {
      mockSchoolsApi.list.mockResolvedValueOnce({
        data: [{ id: 'school-1', name: 'Springfield High', code: 'SPH' }],
      });
      mockExaminationApi.listAssessments.mockResolvedValueOnce([]);
      mockExaminationApi.getPlatformLeaderboardMetrics.mockResolvedValueOnce({
        totalSchoolsReporting: 0,
        totalReleasedAssessments: 0,
        totalEligibleResults: 0,
        schoolsWithNamesVisibleCount: 0,
        schoolsWithNamesMaskedCount: 0,
      });

      render(
        <BrowserRouter>
          <PlatformSuperAdminExaminationMonitoringView />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Platform Examination Telemetry/i),
        ).toBeInTheDocument();
      });

      // Assert no create draft, edit, or publish buttons exist
      expect(screen.queryByText(/Create Assessment/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Create Chapter/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Edit Questions/i)).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 17 & 18. Runner Safety & Role Separation Invariants
  // ---------------------------------------------------------------------------
  describe('Workspace Invariants: Runner Safety & Role Separation', () => {
    it('17. preserves existing examination runner behavior', async () => {
      mockAuthContext.user = {
        id: 'student-usr-1',
        name: 'Alice Johnson',
        role: UserRole.STUDENT,
        schoolId: 'school-1',
      };

      mockExaminationApi.listStudentAssessments.mockResolvedValueOnce([
        {
          id: 'exam-live-1',
          title: 'Live Algebra Test',
          subject: 'Algebra',
          mode: AssessmentMode.NORMAL_QUIZ,
          totalMarks: 50,
          passingMarks: 20,
          durationMinutes: 30,
          startWindowAt: null,
          endWindowAt: null,
          hasAttempt: false,
          attemptStatus: null,
          attemptId: null,
        },
      ]);

      render(
        <BrowserRouter>
          <StudentExaminationPortal />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Live Algebra Test')).toBeInTheDocument();
      });

      // Runner start flow remains available
      const takeExamBtn = screen.getByRole('button', { name: /Take Examination/i });
      expect(takeExamBtn).toBeInTheDocument();
    });

    it('18. enforces role separation in ExaminationWorkspace', () => {
      mockAuthContext.user = {
        id: 'unauthorized-user',
        name: 'Guest',
        role: 'AUDITOR' as any,
        schoolId: 'school-1',
      };

      render(
        <BrowserRouter>
          <ExaminationWorkspace />
        </BrowserRouter>,
      );

      expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument();
      expect(screen.getByText('AUDITOR')).toBeInTheDocument();
      expect(screen.getByText(/is not authorized to access/i)).toBeInTheDocument();
    });
  });
});
