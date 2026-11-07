import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '../context/AuthContext';
import { TeacherExaminationView } from '../components/TeacherExaminationView';
import { UserRole } from '../services/api';
import {
  examinationApi,
  AssessmentMode,
  AssessmentStatus,
  AssessmentDraft,
  AssessmentChapter,
} from '../services/examination.api';

let currentMockUser: any = null;

const { mockGrades, mockAcademicYears, mockTeacherProfile } = vi.hoisted(() => {
  const mockGrades = [
    {
      id: 'grade-10',
      schoolId: 'school-1',
      name: 'Grade 10',
      code: 'G10',
      sections: [
        { id: 'sec-10a', schoolId: 'school-1', gradeId: 'grade-10', name: 'A', capacity: 30 },
        { id: 'sec-10b', schoolId: 'school-1', gradeId: 'grade-10', name: 'B', capacity: 30 },
      ],
    },
    {
      id: 'grade-11',
      schoolId: 'school-1',
      name: 'Grade 11',
      code: 'G11',
      sections: [],
    },
  ];

  const mockAcademicYears = [
    {
      id: 'ay-2026',
      schoolId: 'school-1',
      name: '2026-2027',
      startDate: '2026-06-01',
      endDate: '2027-05-31',
      isCurrent: true,
    },
  ];

  const mockTeacherProfile = {
    id: 'teacher-1',
    schoolId: 'school-1',
    userId: 'usr-teacher-1',
    employeeId: 'EMP-T100',
    firstName: 'Sarah',
    lastName: 'Connor',
    email: 'sarah@school.edu',
    status: 'ACTIVE' as any,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    assignments: [
      {
        id: 'asg-1',
        teacherId: 'teacher-1',
        schoolId: 'school-1',
        academicYearId: 'ay-2026',
        gradeId: 'grade-10',
        sectionId: 'sec-10a',
        subject: 'Mathematics',
        isClassTeacher: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
  };

  return { mockGrades, mockAcademicYears, mockTeacherProfile };
});

const mockChapters: AssessmentChapter[] = [
  {
    id: 'ch-math-01',
    schoolId: 'school-1',
    academicYearId: 'ay-2026',
    createdByTeacherId: 'teacher-1',
    gradeId: 'grade-10',
    subject: 'Mathematics',
    chapterCode: 'MATH-101',
    title: 'Linear Equations',
    orderIndex: 1,
    createdAt: '2026-06-10T00:00:00Z',
    updatedAt: '2026-06-10T00:00:00Z',
  },
  {
    id: 'ch-sci-01',
    schoolId: 'school-1',
    academicYearId: null,
    createdByTeacherId: null,
    gradeId: 'grade-10',
    subject: 'Science',
    chapterCode: 'SCI-101',
    title: 'Thermodynamics',
    orderIndex: 2,
    createdAt: '2026-06-15T00:00:00Z',
    updatedAt: '2026-06-15T00:00:00Z',
  },
  {
    id: 'ch-other-01',
    schoolId: 'school-1',
    academicYearId: 'ay-2026',
    createdByTeacherId: 'teacher-other',
    gradeId: 'grade-10',
    subject: 'Mathematics',
    chapterCode: 'MATH-999',
    title: 'Other Faculty Private Chapter',
    orderIndex: 99,
    createdAt: '2026-06-20T00:00:00Z',
    updatedAt: '2026-06-20T00:00:00Z',
  },
];

const mockAssessments: AssessmentDraft[] = [
  {
    id: 'exam-draft-1',
    schoolId: 'school-1',
    academicYearId: 'ay-2026',
    gradeId: 'grade-10',
    sectionId: 'sec-10a',
    teacherId: 'teacher-1',
    chapterId: 'ch-math-01',
    title: 'Algebra Unit Test',
    description: 'Covers linear equations and graphing.',
    subject: 'Mathematics',
    mode: AssessmentMode.NORMAL_QUIZ,
    status: AssessmentStatus.DRAFT,
    totalMarks: 50,
    passingMarks: 20,
    durationMinutes: 45,
    startWindowAt: null,
    endWindowAt: null,
    shuffleQuestions: true,
    shuffleOptions: true,
    createdAt: '2026-07-01T10:00:00Z',
    updatedAt: '2026-07-01T10:00:00Z',
  },
  {
    id: 'exam-published-2',
    schoolId: 'school-1',
    academicYearId: 'ay-2026',
    gradeId: 'grade-10',
    sectionId: null,
    teacherId: 'teacher-1',
    chapterId: null,
    title: 'Science Midterm Examination',
    description: 'Comprehensive physics and chemistry exam.',
    subject: 'Science',
    mode: AssessmentMode.LIVE_EXAM,
    status: AssessmentStatus.PUBLISHED,
    totalMarks: 100,
    passingMarks: 40,
    durationMinutes: 90,
    startWindowAt: '2026-08-01T09:00:00Z',
    endWindowAt: '2026-08-01T12:00:00Z',
    shuffleQuestions: false,
    shuffleOptions: false,
    createdAt: '2026-07-05T10:00:00Z',
    updatedAt: '2026-07-05T10:00:00Z',
  },
  {
    id: 'exam-closed-3',
    schoolId: 'school-1',
    academicYearId: 'ay-2026',
    gradeId: 'grade-10',
    sectionId: null,
    teacherId: 'teacher-1',
    chapterId: null,
    title: 'History Pop Quiz',
    description: null,
    subject: 'History',
    mode: AssessmentMode.NORMAL_QUIZ,
    status: AssessmentStatus.CLOSED,
    totalMarks: 25,
    passingMarks: 10,
    durationMinutes: 20,
    startWindowAt: null,
    endWindowAt: null,
    shuffleQuestions: false,
    shuffleOptions: false,
    createdAt: '2026-07-10T10:00:00Z',
    updatedAt: '2026-07-10T10:00:00Z',
  },
];

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
      getProfile: vi.fn(() =>
        currentMockUser ? Promise.resolve(currentMockUser) : Promise.reject(new Error('No token')),
      ),
    },
    academicsApi: {
      ...actual.academicsApi,
      getAcademicYears: vi.fn().mockImplementation(() => Promise.resolve(mockAcademicYears)),
      getGrades: vi.fn().mockImplementation(() => Promise.resolve(mockGrades)),
    },
    teachersApi: {
      ...actual.teachersApi,
      getTeachers: vi.fn().mockResolvedValue({ data: [mockTeacherProfile] }),
    },
    getMyTeacherProfile: vi.fn().mockImplementation(() => Promise.resolve(mockTeacherProfile)),
    default: {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({ data: {} }),
      patch: vi.fn().mockResolvedValue({ data: {} }),
      put: vi.fn().mockResolvedValue({ data: {} }),
      delete: vi.fn().mockResolvedValue({ data: {} }),
    },
  };
});

vi.mock('../services/examination.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/examination.api')>();
  return {
    ...actual,
    examinationApi: {
      ...actual.examinationApi,
      listAssessments: vi.fn(),
      listChapters: vi.fn(),
      createChapter: vi.fn(),
      createDraft: vi.fn(),
      updateDraft: vi.fn(),
      deleteDraft: vi.fn(),
      listQuestions: vi.fn(),
      publishAssessment: vi.fn(),
      closeAssessment: vi.fn(),
      releaseResults: vi.fn(),
    },
  };
});

vi.mock('../utils/questionTemplateGenerator', () => ({
  downloadQuestionTemplate: vi.fn().mockResolvedValue(undefined),
  generateQuestionTemplateWorkbook: vi.fn(),
  generateQuestionTemplateWorkbookBuffer: vi.fn(),
  buildQuestionTemplateWorkbook: vi.fn(),
}));

describe('TeacherExaminationView Component', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getMyTeacherProfile } = await import('../services/api');
    (getMyTeacherProfile as any).mockImplementation(() => Promise.resolve(mockTeacherProfile));

    currentMockUser = {
      id: 'usr-teacher-1',
      email: 'sarah@school.edu',
      name: 'Sarah Connor',
      role: UserRole.TEACHER,
      schoolId: 'school-1',
    };

    (examinationApi.listAssessments as any).mockResolvedValue(mockAssessments);
    (examinationApi.listChapters as any).mockResolvedValue(mockChapters);
    (examinationApi.listQuestions as any).mockResolvedValue({
      questions: [],
      summary: {
        targetTotalMarks: 50,
        currentAllocatedMarks: 0,
        remainingMarks: 50,
        totalQuestions: 0,
        isReconciled: false,
      },
    });
  });

  it('renders teacher workspace with statistics and assessments', async () => {
    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Faculty Examination Workspace')).toBeInTheDocument();
      expect(screen.getByText('Algebra Unit Test')).toBeInTheDocument();
      expect(screen.getByText('Science Midterm Examination')).toBeInTheDocument();
      expect(screen.getByText('History Pop Quiz')).toBeInTheDocument();
    });

    // Check stats
    expect(screen.getByText('Total Assessments')).toBeInTheDocument();
    expect(screen.getByText('Curriculum Chapters')).toBeInTheDocument();
    // 3 total assessments, 1 draft, 1 published, 1 closed
    expect(screen.getByText('Drafts (Editable)')).toBeInTheDocument();
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Closed').length).toBeGreaterThan(0);
  });

  it('filters assessments by status', async () => {
    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Algebra Unit Test')).toBeInTheDocument();
    });

    // Select "Drafts Only" from status select
    const statusSelect = screen.getByLabelText(/filter by status/i);
    fireEvent.change(statusSelect, { target: { value: AssessmentStatus.DRAFT } });

    expect(screen.getByText('Algebra Unit Test')).toBeInTheDocument();
    expect(screen.queryByText('Science Midterm Examination')).not.toBeInTheDocument();
    expect(screen.queryByText('History Pop Quiz')).not.toBeInTheDocument();

    // Select "Published"
    fireEvent.change(statusSelect, { target: { value: AssessmentStatus.PUBLISHED } });
    expect(screen.queryByText('Algebra Unit Test')).not.toBeInTheDocument();
    expect(screen.getByText('Science Midterm Examination')).toBeInTheDocument();
  });

  it('searches assessments by title or subject', async () => {
    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Algebra Unit Test')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search by title or subject/i);
    fireEvent.change(searchInput, { target: { value: 'science' } });

    expect(screen.queryByText('Algebra Unit Test')).not.toBeInTheDocument();
    expect(screen.getByText('Science Midterm Examination')).toBeInTheDocument();
  });

  it('switches to curriculum chapters tab and lists chapters with ownership indicators and read-only state', async () => {
    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Assessments \(3\)/i)).toBeInTheDocument();
    });

    const chaptersTab = screen.getByRole('button', { name: /curriculum chapters/i });
    fireEvent.click(chaptersTab);

    await waitFor(() => {
      expect(screen.getByText('MATH-101')).toBeInTheDocument();
      expect(screen.getByText('Linear Equations')).toBeInTheDocument();
      expect(screen.getByText('SCI-101')).toBeInTheDocument();
      expect(screen.getByText('Thermodynamics')).toBeInTheDocument();
    });

    // Verify ownership indicators
    expect(screen.getByText('My Chapter')).toBeInTheDocument();
    expect(screen.getByText('Institutional Standard')).toBeInTheDocument();

    // Verify legacy chapter displays Read-Only indicator
    expect(screen.getByText('Read-Only')).toBeInTheDocument();

    // Verify another teacher's chapter is not exposed
    expect(screen.queryByText('MATH-999')).not.toBeInTheDocument();
    expect(screen.queryByText('Other Faculty Private Chapter')).not.toBeInTheDocument();
  });

  it('creates a new curriculum chapter through the modal', async () => {
    const newChapter: AssessmentChapter = {
      id: 'ch-math-02',
      schoolId: 'school-1',
      academicYearId: 'ay-2026',
      createdByTeacherId: 'teacher-1',
      gradeId: 'grade-10',
      subject: 'Mathematics',
      chapterCode: 'MATH-102',
      title: 'Quadratic Equations',
      orderIndex: 2,
      createdAt: '2026-07-20T00:00:00Z',
      updatedAt: '2026-07-20T00:00:00Z',
    };
    (examinationApi.createChapter as any).mockResolvedValueOnce(newChapter);

    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Faculty Examination Workspace')).toBeInTheDocument();
    });

    // Click "New Chapter"
    const newChapterBtn = screen.getByRole('button', { name: /new chapter/i });
    fireEvent.click(newChapterBtn);

    // Modal is open
    expect(screen.getByText('New Curriculum Chapter')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. CH-01/i), {
      target: { value: 'MATH-102' },
    });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Linear Equations in Two Variables/i), {
      target: { value: 'Quadratic Equations' },
    });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /^create chapter$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(examinationApi.createChapter).toHaveBeenCalledWith(
        expect.objectContaining({
          chapterCode: 'MATH-102',
          title: 'Quadratic Equations',
          gradeId: 'grade-10',
        }),
      );
      expect(screen.getByText(/created successfully/i)).toBeInTheDocument();
    });
  });

  it('creates a new assessment draft through the modal with validation', async () => {
    const createdDraft: AssessmentDraft = {
      id: 'exam-draft-new',
      schoolId: 'school-1',
      academicYearId: 'ay-2026',
      gradeId: 'grade-10',
      sectionId: 'sec-10a',
      teacherId: 'teacher-1',
      chapterId: 'ch-math-01',
      title: 'Linear Equations',
      description: 'Introductory geometry.',
      subject: 'Mathematics',
      mode: AssessmentMode.NORMAL_QUIZ,
      status: AssessmentStatus.DRAFT,
      totalMarks: 40,
      passingMarks: 16,
      durationMinutes: 30,
      startWindowAt: null,
      endWindowAt: null,
      shuffleQuestions: false,
      shuffleOptions: false,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    };
    (examinationApi.createDraft as any).mockResolvedValueOnce(createdDraft);

    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Faculty Examination Workspace')).toBeInTheDocument();
    });

    // Click "Create Assessment Draft"
    const createBtn = screen.getAllByRole('button', { name: /create assessment draft/i })[0];
    fireEvent.click(createBtn);

    expect(screen.getByRole('heading', { name: /create assessment draft/i })).toBeInTheDocument();

    // Select Chapter / Test Name from dropdown
    const chapterSelect = screen.getByLabelText(/chapter \/ test name/i);
    fireEvent.change(chapterSelect, { target: { value: 'ch-math-01' } });

    // Validate that passing marks cannot exceed total marks
    const totalMarksInput = screen.getByLabelText(/total marks \*/i);
    const passingMarksInput = screen.getByLabelText(/passing marks \*/i);
    fireEvent.change(totalMarksInput, { target: { value: '20' } });
    fireEvent.change(passingMarksInput, { target: { value: '30' } });

    const submitBtn = screen.getByRole('button', { name: /^create draft$/i });
    fireEvent.click(submitBtn);

    // Validation error should show
    expect(screen.getByText(/passing marks cannot exceed total marks/i)).toBeInTheDocument();

    // Fix passing marks
    fireEvent.change(passingMarksInput, { target: { value: '16' } });
    fireEvent.change(totalMarksInput, { target: { value: '40' } });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(examinationApi.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          chapterId: 'ch-math-01',
          title: 'Linear Equations',
          totalMarks: 40,
          passingMarks: 16,
        }),
      );
      expect(screen.getByText(/created successfully/i)).toBeInTheDocument();
      expect(screen.getByText('Linear Equations')).toBeInTheDocument();
    });
  });

  it('allows editing an assessment draft and enforces immutability for non-drafts', async () => {
    const updatedDraft: AssessmentDraft = {
      ...mockAssessments[0],
      chapterId: 'ch-math-01',
      title: 'Linear Equations',
      durationMinutes: 60,
    };
    (examinationApi.updateDraft as any).mockResolvedValueOnce(updatedDraft);

    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Algebra Unit Test')).toBeInTheDocument();
    });

    // Draft card should have Edit and Delete buttons
    const editBtn = screen.getByTitle('Edit Draft Assessment');
    fireEvent.click(editBtn);

    // Modal opens in Edit mode
    expect(screen.getByText('Edit Assessment Draft')).toBeInTheDocument();

    const chapterSelect = screen.getByLabelText(/chapter \/ test name/i);
    fireEvent.change(chapterSelect, { target: { value: 'ch-math-01' } });

    const updateBtn = screen.getByRole('button', { name: /update draft/i });
    fireEvent.click(updateBtn);

    await waitFor(() => {
      expect(examinationApi.updateDraft).toHaveBeenCalledWith(
        'exam-draft-1',
        expect.objectContaining({
          chapterId: 'ch-math-01',
        }),
      );
    });

    // Published assessment card should show "Immutable" badge instead of edit/delete
    expect(screen.getByText('Science Midterm Examination')).toBeInTheDocument();
    expect(screen.getAllByText('Immutable').length).toBeGreaterThan(0);
  });

  it('deletes a draft assessment after confirmation', async () => {
    (examinationApi.deleteDraft as any).mockResolvedValueOnce({
      success: true,
      message: 'Draft deleted',
    });

    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Algebra Unit Test')).toBeInTheDocument();
    });

    // Click delete icon on draft card
    const deleteBtn = screen.getByTitle('Delete Draft');
    fireEvent.click(deleteBtn);

    // Confirmation dialog opens
    expect(screen.getByText('Delete Assessment Draft?')).toBeInTheDocument();
    expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /confirm delete/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(examinationApi.deleteDraft).toHaveBeenCalledWith('exam-draft-1');
      expect(screen.queryByText('Algebra Unit Test')).not.toBeInTheDocument();
      expect(screen.getByText(/was deleted/i)).toBeInTheDocument();
    });
  });

  it('opens assessment details modal and displays immutable notice for published tests', async () => {
    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Science Midterm Examination')).toBeInTheDocument();
    });

    // Click view details (eye icon) on the published exam
    const viewButtons = screen.getAllByTitle('View Assessment Details');
    fireEvent.click(viewButtons[1]); // second card is Science Midterm

    await waitFor(() => {
      expect(screen.getByText('PostgreSQL Trigger Protection Active')).toBeInTheDocument();
      expect(screen.getByText(/Locked by database invariants/i)).toBeInTheDocument();
    });

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: /close assessment details/i }));
    expect(screen.queryByText('PostgreSQL Trigger Protection Active')).not.toBeInTheDocument();
  });

  it('launches Question Management Workspace when clicking Questions on a draft assessment and navigates back', async () => {
    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Algebra Unit Test')).toBeInTheDocument();
    });

    // Click Questions button
    const questionsBtns = screen.getAllByRole('button', { name: /questions/i });
    fireEvent.click(questionsBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Question Management & Paper Preparation')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add question/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /download excel template/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /import questions from excel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /preview question paper/i })).toBeInTheDocument();
    });

    // Click "Back to Assessments" to return
    fireEvent.click(screen.getByRole('button', { name: /back to assessments/i }));

    await waitFor(() => {
      expect(screen.getByText('Algebra Unit Test')).toBeInTheDocument();
      expect(screen.queryByText('Question Management & Paper Preparation')).not.toBeInTheDocument();
    });
  });

  it('downloads Excel question template when Download Excel Template button is clicked', async () => {
    const { downloadQuestionTemplate } = await import('../utils/questionTemplateGenerator');

    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Faculty Examination Workspace')).toBeInTheDocument();
    });

    const downloadBtn = screen.getByRole('button', { name: /download excel template/i });
    expect(downloadBtn).toBeInTheDocument();
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(downloadQuestionTemplate).toHaveBeenCalledWith('Examination_MCQs_Template.xlsx');
      expect(screen.getByText(/template downloaded successfully/i)).toBeInTheDocument();
    });
  });

  it('filters grades, sections, and subjects strictly based on active teacher assignments', async () => {
    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Faculty Examination Workspace')).toBeInTheDocument();
    });

    const createBtn = screen.getAllByRole('button', { name: /create assessment draft/i })[0];
    fireEvent.click(createBtn);

    // Verify Grade options: Grade 10 should be present (assigned), Grade 11 should not (unassigned)
    const gradeSelect = screen.getByRole('combobox', { name: /grade class \*/i });
    expect(gradeSelect).toBeInTheDocument();
    const gradeOptions = Array.from(gradeSelect.querySelectorAll('option')).map((o) => o.textContent);
    expect(gradeOptions.some((t) => t?.includes('Grade 10'))).toBe(true);
    expect(gradeOptions.some((t) => t?.includes('Grade 11'))).toBe(false);

    // Verify Subject options: Mathematics should be present
    const subjectSelect = screen.getByRole('combobox', { name: /subject \*/i });
    expect(subjectSelect).toBeInTheDocument();
    const subjectOptions = Array.from(subjectSelect.querySelectorAll('option')).map((o) => o.textContent);
    expect(subjectOptions.some((t) => t?.includes('Mathematics'))).toBe(true);

    // Verify Section: only assigned section sec-10a should be present
    const sectionSelect = screen.getByRole('combobox', { name: /^section$/i });
    const sectionOptions = Array.from(sectionSelect.querySelectorAll('option')).map((o) => o.textContent);
    expect(sectionOptions.some((t) => t?.includes('Section A'))).toBe(true);
    expect(sectionOptions.some((t) => t?.includes('Section B'))).toBe(false);
  });

  it('displays warning banner and disables creation buttons when teacher has 0 active assignments', async () => {
    const { getMyTeacherProfile } = await import('../services/api');
    (getMyTeacherProfile as any).mockResolvedValueOnce({
      ...mockTeacherProfile,
      assignments: [],
    });

    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('No Active Teaching Assignments Found')).toBeInTheDocument();
      expect(
        screen.getByText(/you do not have any active class or subject teaching assignments/i),
      ).toBeInTheDocument();
    });

    // Verify New Chapter and Create Assessment Draft buttons are disabled
    const newChapterBtn = screen.getByRole('button', { name: /new chapter/i });
    const createDraftBtn = screen.getByRole('button', { name: /create assessment draft/i });
    expect(newChapterBtn).toBeDisabled();
    expect(createDraftBtn).toBeDisabled();
  });

  it('handles empty chapter state in Create Test modal with link to create chapter', async () => {
    // Return empty chapters
    (examinationApi.listChapters as any).mockResolvedValue([]);

    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Faculty Examination Workspace')).toBeInTheDocument();
    });

    const createBtn = screen.getAllByRole('button', { name: /create assessment draft/i })[0];
    fireEvent.click(createBtn);

    // Verify empty chapter state warning
    await waitFor(() => {
      expect(screen.getByText('No curriculum chapters found')).toBeInTheDocument();
      expect(
        screen.getByText(/tests must be based on a curriculum chapter/i),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\+ create chapter/i })).toBeInTheDocument();
    });

    // Clicking "+ Create Chapter" should switch to New Curriculum Chapter modal
    fireEvent.click(screen.getByRole('button', { name: /\+ create chapter/i }));
    await waitFor(() => {
      expect(screen.getByText('New Curriculum Chapter')).toBeInTheDocument();
    });
  });

  it('displays ownership indicators in assessment draft chapter dropdown using chapter UUID and hides other teachers private chapters', async () => {
    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Faculty Examination Workspace')).toBeInTheDocument();
    });

    const createBtn = screen.getAllByRole('button', { name: /create assessment draft/i })[0];
    fireEvent.click(createBtn);

    const chapterSelect = screen.getByLabelText(/chapter \/ test name/i);
    expect(chapterSelect).toBeInTheDocument();

    const options = Array.from(chapterSelect.querySelectorAll('option'));
    // Option value should be UUID
    const mathOption = options.find((o) => o.value === 'ch-math-01');
    expect(mathOption).toBeDefined();
    expect(mathOption?.textContent).toContain('MATH-101: Linear Equations (My Chapter)');

    // Other teacher's private chapter should NOT be in options
    const otherOption = options.find((o) => o.value === 'ch-other-01');
    expect(otherOption).toBeUndefined();
  });

  it('enforces mandatory chapter selection validation before submitting draft assessment', async () => {
    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Faculty Examination Workspace')).toBeInTheDocument();
    });

    const createBtn = screen.getAllByRole('button', { name: /create assessment draft/i })[0];
    fireEvent.click(createBtn);

    // Unselect chapter
    const chapterSelect = screen.getByLabelText(/chapter \/ test name/i);
    fireEvent.change(chapterSelect, { target: { value: '' } });

    // Try submitting
    const submitBtn = screen.getByRole('button', { name: /^create draft$/i });
    fireEvent.click(submitBtn);

    // Should display validation error
    await waitFor(() => {
      expect(screen.getByText('Please select a curriculum chapter for this assessment.')).toBeInTheDocument();
      expect(examinationApi.createDraft).not.toHaveBeenCalled();
    });
  });

  it('renders School Admin chapter view as read-only without New Chapter button', async () => {
    currentMockUser = {
      id: 'usr-admin-1',
      email: 'admin@school.edu',
      name: 'Principal Skinner',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: 'school-1',
    };

    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Faculty Examination Workspace')).toBeInTheDocument();
    });

    // New Chapter button should not exist for admin
    expect(screen.queryByRole('button', { name: /new chapter/i })).not.toBeInTheDocument();

    // Switch to chapters tab
    const chaptersTab = screen.getByRole('button', { name: /curriculum chapters/i });
    fireEvent.click(chaptersTab);

    await waitFor(() => {
      expect(screen.getByText('MATH-101')).toBeInTheDocument();
      expect(screen.getByText('SCI-101')).toBeInTheDocument();
    });

    // Legacy chapter is visibly marked Read-Only
    expect(screen.getByText('Read-Only')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Lifecycle Controls (Publish, Close, Release Results)
  // ---------------------------------------------------------------------------
  it('displays Publish button on DRAFT cards and executes publishing workflow after confirmation', async () => {
    (examinationApi.publishAssessment as any).mockResolvedValueOnce({
      ...mockAssessments[0],
      status: AssessmentStatus.PUBLISHED,
    });

    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Algebra Unit Test')).toBeInTheDocument();
    });

    // Check Publish button exists on draft card
    const publishBtn = screen.getByRole('button', { name: /^publish$/i });
    expect(publishBtn).toBeInTheDocument();

    // Click Publish button
    fireEvent.click(publishBtn);

    // Confirmation dialog opens
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /publish assessment/i })).toBeInTheDocument();
    expect(screen.getByText(/publishing locks question editing/i)).toBeInTheDocument();
    expect(examinationApi.publishAssessment).not.toHaveBeenCalled();

    // Confirm Publish
    const confirmBtn = screen.getByRole('button', { name: /confirm publish/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(examinationApi.publishAssessment).toHaveBeenCalledWith('exam-draft-1');
      expect(screen.getByText(/has been published successfully/i)).toBeInTheDocument();
    });
  });

  it('displays Close and Release Results buttons on PUBLISHED assessments and executes close workflow', async () => {
    (examinationApi.closeAssessment as any).mockResolvedValueOnce({
      ...mockAssessments[1],
      status: AssessmentStatus.CLOSED,
    });

    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Science Midterm Examination')).toBeInTheDocument();
    });

    // Published assessment displays Close and Release Results
    const closeBtn = screen.getByRole('button', { name: /^close$/i });
    const releaseButtons = screen.getAllByRole('button', { name: /^release results$/i });
    expect(closeBtn).toBeInTheDocument();
    expect(releaseButtons.length).toBeGreaterThan(0);

    // Click Close
    fireEvent.click(closeBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /close assessment/i })).toBeInTheDocument();
    expect(screen.getByText(/closing prevents students from starting new attempts/i)).toBeInTheDocument();

    // Cancel does not call API
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(examinationApi.closeAssessment).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Click Close again and confirm
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm close/i }));

    await waitFor(() => {
      expect(examinationApi.closeAssessment).toHaveBeenCalledWith('exam-published-2');
      expect(screen.getByText(/has been closed/i)).toBeInTheDocument();
    });
  });

  it('displays Release Results on CLOSED assessment and disables it before end window', async () => {
    // Create a closed assessment whose end window is in the future
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const closedAssessment: AssessmentDraft = {
      ...mockAssessments[0],
      id: 'exam-closed-1',
      title: 'History Finals Exam',
      status: AssessmentStatus.CLOSED,
      endWindowAt: futureDate,
    };

    (examinationApi.listAssessments as any).mockResolvedValue([closedAssessment]);

    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('History Finals Exam')).toBeInTheDocument();
    });

    // Release button is present but disabled because end window is in future
    const releaseBtn = screen.getByRole('button', { name: /release results/i });
    expect(releaseBtn).toBeInTheDocument();
    expect(releaseBtn).toBeDisabled();
  });

  it('releases results after confirmation when eligible and displays error on API rejection', async () => {
    // Closed assessment whose end window is in past
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const closedAssessment: AssessmentDraft = {
      ...mockAssessments[0],
      id: 'exam-closed-past',
      title: 'Civics Examination',
      status: AssessmentStatus.CLOSED,
      endWindowAt: pastDate,
    };

    (examinationApi.listAssessments as any).mockResolvedValue([closedAssessment]);
    (examinationApi.releaseResults as any).mockRejectedValueOnce({
      response: {
        data: {
          message: 'Cannot release results: assessment has 1 active attempt(s) in progress',
        },
      },
    });

    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Civics Examination')).toBeInTheDocument();
    });

    const releaseBtn = screen.getByRole('button', { name: /release results/i });
    expect(releaseBtn).toBeEnabled();

    // Click release
    fireEvent.click(releaseBtn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /release assessment results/i })).toBeInTheDocument();

    // Confirm
    fireEvent.click(screen.getByRole('button', { name: /confirm release results/i }));

    await waitFor(() => {
      expect(examinationApi.releaseResults).toHaveBeenCalledWith('exam-closed-past');
      expect(
        screen.getByText(/cannot release results: assessment has 1 active attempt\(s\) in progress/i),
      ).toBeInTheDocument();
    });
  });

  it('does not display Publish, Close or Release Results on RESULTS_RELEASED assessments', async () => {
    const releasedAssessment: AssessmentDraft = {
      ...mockAssessments[0],
      id: 'exam-released-1',
      title: 'Geography Term Exam',
      status: AssessmentStatus.RESULTS_RELEASED,
    };

    (examinationApi.listAssessments as any).mockResolvedValue([releasedAssessment]);

    render(
      <AuthProvider>
        <TeacherExaminationView />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Geography Term Exam')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /release results/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /leaderboard/i })).toBeInTheDocument();
  });
});
