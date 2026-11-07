import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AssessmentQuestionManagementView } from '../components/AssessmentQuestionManagementView';
import {
  examinationApi,
  AssessmentDraft,
  AssessmentQuestion,
  AssessmentChapter,
  AssessmentStatus,
  AssessmentMode,
  QuestionMarksReconciliation,
  QuestionImportPreviewResponse,
} from '../services/examination.api';
import * as templateGen from '../utils/questionTemplateGenerator';

// Mock assessments
const mockDraftAssessment: AssessmentDraft = {
  id: 'as-draft-01',
  schoolId: 'school-1',
  academicYearId: 'ay-2026',
  gradeId: 'grade-10',
  sectionId: 'sec-10a',
  teacherId: 'teacher-1',
  chapterId: 'ch-math-1',
  title: 'Algebra Quarterly Examination',
  description: 'Comprehensive assessment on linear equations and polynomials.',
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
};

const mockPublishedAssessment: AssessmentDraft = {
  ...mockDraftAssessment,
  id: 'as-pub-02',
  title: 'Physics Synchronous Examination',
  subject: 'Physics',
  status: AssessmentStatus.PUBLISHED,
};

const mockQuestions: AssessmentQuestion[] = [
  {
    id: 'q-01',
    schoolId: 'school-1',
    assessmentId: 'as-draft-01',
    sectionId: null,
    orderIndex: 1,
    questionText: 'What is the root of the equation 2x + 6 = 0?',
    options: ['-3', '3', '0', '-6'],
    correctOption: 0,
    marks: 2.0,
    explanation: '2x = -6 => x = -3',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 'q-02',
    schoolId: 'school-1',
    assessmentId: 'as-draft-01',
    sectionId: null,
    orderIndex: 2,
    questionText: 'Which polynomial has degree 2?',
    options: ['x + 1', 'x^2 + 2x + 1', 'x^3 - 1', '5'],
    correctOption: 1,
    marks: 3.0,
    explanation: 'Degree is the highest exponent, which is 2.',
    createdAt: '2026-08-01T10:05:00Z',
    updatedAt: '2026-08-01T10:05:00Z',
  },
];

const mockReconciliation: QuestionMarksReconciliation = {
  targetTotalMarks: 50,
  currentAllocatedMarks: 5,
  remainingMarks: 45,
  totalQuestions: 2,
  isReconciled: false,
};

const mockGrades = [
  {
    id: 'grade-10',
    name: 'Grade 10',
    sections: [{ id: 'sec-10a', name: 'Section A' }],
  },
];

const mockChapters: AssessmentChapter[] = [
  {
    id: 'ch-math-1',
    schoolId: 'school-1',
    academicYearId: 'ay-2026',
    createdByTeacherId: 'teacher-1',
    gradeId: 'grade-10',
    subject: 'Mathematics',
    chapterCode: 'M101',
    title: 'Polynomials & Linear Equations',
    orderIndex: 1,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  },
];

vi.mock('../services/examination.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/examination.api')>();
  return {
    ...actual,
    examinationApi: {
      ...actual.examinationApi,
      listQuestions: vi.fn(),
      createQuestion: vi.fn(),
      updateQuestion: vi.fn(),
      deleteQuestion: vi.fn(),
      previewImport: vi.fn(),
      confirmImport: vi.fn(),
      uploadQuestionImage: vi.fn(),
      deleteQuestionImage: vi.fn(),
      getQuestionImageBlob: vi.fn(),
      publishAssessment: vi.fn(),
      closeAssessment: vi.fn(),
      releaseResults: vi.fn(),
    },
  };
});

describe('AssessmentQuestionManagementView Component', () => {
  const mockOnBack = vi.fn();
  const mockOnUpdated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (examinationApi.listQuestions as any).mockResolvedValue({
      summary: mockReconciliation,
      questions: mockQuestions,
    });
    // Default image 404 (no attached image)
    (examinationApi.getQuestionImageBlob as any).mockRejectedValue(new Error('Question has no attached image'));
  });

  // ---------------------------------------------------------------------------
  // 1. Overview & Statistics
  // ---------------------------------------------------------------------------
  it('renders assessment metadata header, marks reconciliation, and action buttons', async () => {
    render(
      <AssessmentQuestionManagementView
        assessment={mockDraftAssessment}
        grades={mockGrades}
        chapters={mockChapters}
        onBack={mockOnBack}
        onAssessmentUpdated={mockOnUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Question Management & Paper Preparation')).toBeInTheDocument();
      expect(screen.getByText('Algebra Quarterly Examination')).toBeInTheDocument();
      expect(screen.getByText('Grade 10 (Section A)')).toBeInTheDocument();
      expect(screen.getByText('Polynomials & Linear Equations')).toBeInTheDocument();
      expect(screen.getByText('45 Minutes')).toBeInTheDocument();
    });

    // Marks Reconciliation cards
    expect(screen.getAllByText('50').length).toBeGreaterThan(0); // Target marks
    expect(screen.getAllByText('5').length).toBeGreaterThan(0); // Current allocated marks
    expect(screen.getByText('45')).toBeInTheDocument(); // Remaining marks
    expect(screen.getByText('Under-allocated')).toBeInTheDocument();

    // Main action buttons
    expect(screen.getByRole('button', { name: /add question/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download excel template/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import questions from excel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /preview question paper/i })).toBeInTheDocument();

    // Question table rows
    expect(screen.getByText('What is the root of the equation 2x + 6 = 0?')).toBeInTheDocument();
    expect(screen.getByText('Which polynomial has degree 2?')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // 2. Manual Question Creation
  // ---------------------------------------------------------------------------
  it('validates required fields and creates a new MCQ question', async () => {
    (examinationApi.createQuestion as any).mockResolvedValue({
      id: 'q-new-03',
      schoolId: 'school-1',
      assessmentId: 'as-draft-01',
      sectionId: null,
      orderIndex: 3,
      questionText: 'Evaluate 5 * 4',
      options: ['20', '25', '15', '30'],
      correctOption: 0,
      marks: 1.0,
      explanation: '5 times 4 is 20',
      createdAt: '2026-08-01T10:10:00Z',
      updatedAt: '2026-08-01T10:10:00Z',
    });

    render(
      <AssessmentQuestionManagementView
        assessment={mockDraftAssessment}
        grades={mockGrades}
        chapters={mockChapters}
        onBack={mockOnBack}
        onAssessmentUpdated={mockOnUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add question/i })).toBeInTheDocument();
    });

    // Open Add Question modal
    fireEvent.click(screen.getByRole('button', { name: /add question/i }));

    expect(screen.getByText('Add MCQ Question')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/enter the examination question prompt/i), {
      target: { value: 'Evaluate 5 * 4' },
    });
    fireEvent.change(screen.getByPlaceholderText(/choice a text/i), { target: { value: '20' } });
    fireEvent.change(screen.getByPlaceholderText(/choice b text/i), { target: { value: '25' } });
    fireEvent.change(screen.getByPlaceholderText(/choice c text/i), { target: { value: '15' } });
    fireEvent.change(screen.getByPlaceholderText(/choice d text/i), { target: { value: '30' } });

    // Submit question
    fireEvent.click(screen.getByRole('button', { name: /save question/i }));

    await waitFor(() => {
      expect(examinationApi.createQuestion).toHaveBeenCalledWith(
        'as-draft-01',
        expect.objectContaining({
          questionText: 'Evaluate 5 * 4',
          options: ['20', '25', '15', '30'],
          correctOption: 0,
          marks: 1,
        }),
      );
      expect(screen.getByText('Question added successfully')).toBeInTheDocument();
    });
  });

  it('rejects duplicate options when authoring manual question', async () => {
    render(
      <AssessmentQuestionManagementView
        assessment={mockDraftAssessment}
        grades={mockGrades}
        chapters={mockChapters}
        onBack={mockOnBack}
        onAssessmentUpdated={mockOnUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add question/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /add question/i }));

    // Duplicate choices A and B both set to "Same Choice"
    fireEvent.change(screen.getByPlaceholderText(/enter the examination question prompt/i), {
      target: { value: 'What is 1+1?' },
    });
    fireEvent.change(screen.getByPlaceholderText(/choice a text/i), { target: { value: 'Same Choice' } });
    fireEvent.change(screen.getByPlaceholderText(/choice b text/i), { target: { value: 'Same Choice' } });
    fireEvent.change(screen.getByPlaceholderText(/choice c text/i), { target: { value: 'Distinct C' } });
    fireEvent.change(screen.getByPlaceholderText(/choice d text/i), { target: { value: 'Distinct D' } });

    fireEvent.click(screen.getByRole('button', { name: /save question/i }));

    await waitFor(() => {
      expect(screen.getByText(/All four options must be distinct/i)).toBeInTheDocument();
      expect(examinationApi.createQuestion).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Manual Question Editing & Deletion
  // ---------------------------------------------------------------------------
  it('opens edit modal with pre-filled question and calls updateQuestion', async () => {
    (examinationApi.updateQuestion as any).mockResolvedValue({
      ...mockQuestions[0],
      questionText: 'Updated root equation text?',
    });

    render(
      <AssessmentQuestionManagementView
        assessment={mockDraftAssessment}
        grades={mockGrades}
        chapters={mockChapters}
        onBack={mockOnBack}
        onAssessmentUpdated={mockOnUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('What is the root of the equation 2x + 6 = 0?')).toBeInTheDocument();
    });

    const editBtns = screen.getAllByTitle('Edit Question');
    fireEvent.click(editBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Edit Question')).toBeInTheDocument();
      expect(screen.getByDisplayValue('What is the root of the equation 2x + 6 = 0?')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('What is the root of the equation 2x + 6 = 0?'), {
      target: { value: 'Updated root equation text?' },
    });

    fireEvent.click(screen.getByRole('button', { name: /update question/i }));

    await waitFor(() => {
      expect(examinationApi.updateQuestion).toHaveBeenCalledWith(
        'as-draft-01',
        'q-01',
        expect.objectContaining({
          questionText: 'Updated root equation text?',
        }),
      );
      expect(screen.getByText('Question updated successfully')).toBeInTheDocument();
    });
  });

  it('confirms question deletion and calls deleteQuestion', async () => {
    (examinationApi.deleteQuestion as any).mockResolvedValue({
      success: true,
      message: 'Question deleted successfully',
    });

    render(
      <AssessmentQuestionManagementView
        assessment={mockDraftAssessment}
        grades={mockGrades}
        chapters={mockChapters}
        onBack={mockOnBack}
        onAssessmentUpdated={mockOnUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Which polynomial has degree 2?')).toBeInTheDocument();
    });

    const deleteBtns = screen.getAllByTitle('Delete Question');
    fireEvent.click(deleteBtns[1]);

    await waitFor(() => {
      expect(screen.getByText('Delete Question?')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete this question\?/i)).toBeInTheDocument();
    });

    // Confirm Delete
    const confirmDeleteBtn = screen.getByRole('button', { name: /^delete$/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(examinationApi.deleteQuestion).toHaveBeenCalledWith('as-draft-01', 'q-02');
      expect(screen.getByText('Question deleted successfully')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Excel Template Download
  // ---------------------------------------------------------------------------
  it('triggers official MCQ Excel template download', async () => {
    const downloadSpy = vi.spyOn(templateGen, 'downloadQuestionTemplate').mockResolvedValue(undefined);

    render(
      <AssessmentQuestionManagementView
        assessment={mockDraftAssessment}
        grades={mockGrades}
        chapters={mockChapters}
        onBack={mockOnBack}
        onAssessmentUpdated={mockOnUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /download excel template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /download excel template/i }));

    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalledWith('Examination_MCQs_Template.xlsx');
      expect(screen.getByText(/Official MCQ Excel template downloaded/i)).toBeInTheDocument();
    });

    downloadSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // 5. Excel Import Workflow (Preview & Confirm)
  // ---------------------------------------------------------------------------
  it('executes 2-step Excel import workflow: preview and explicit confirmation', async () => {
    const mockPreviewResponse: QuestionImportPreviewResponse = {
      totalRows: 3,
      validCount: 2,
      invalidCount: 1,
      validQuestions: [
        {
          rowNumber: 2,
          serialNumber: 1,
          orderIndex: 1,
          questionText: 'What is 10 + 20?',
          options: ['30', '40', '50', '60'],
          correctOption: 0,
          marks: 2,
          explanation: null,
        },
        {
          rowNumber: 3,
          serialNumber: 2,
          orderIndex: 2,
          questionText: 'What is 5 * 5?',
          options: ['10', '25', '30', '35'],
          correctOption: 1,
          marks: 2,
          explanation: null,
        },
      ],
      invalidRows: [
        {
          rowNumber: 4,
          data: { serialNumber: 3, questionText: 'Invalid Row Question' },
          errors: ['Option D is required and cannot be empty'],
        },
      ],
      duplicateSerialErrors: [],
      duplicateQuestionWarnings: [],
      importedCount: 2,
      importedMarks: 4,
      existingCount: 2,
      existingAllocatedMarks: 5,
      projectedTotalMarks: 9,
      targetTotalMarks: 50,
      remainingMarks: 41,
      isReconciled: false,
      reconciliationWarning: null,
    };

    (examinationApi.previewImport as any).mockResolvedValue(mockPreviewResponse);
    (examinationApi.confirmImport as any).mockResolvedValue({
      success: true,
      message: 'Questions imported successfully',
      importedCount: 2,
      importedMarks: 4,
      totalQuestions: 4,
      currentAllocatedMarks: 9,
      remainingMarks: 41,
      isReconciled: false,
    });

    render(
      <AssessmentQuestionManagementView
        assessment={mockDraftAssessment}
        grades={mockGrades}
        chapters={mockChapters}
        onBack={mockOnBack}
        onAssessmentUpdated={mockOnUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /import questions from excel/i })).toBeInTheDocument();
    });

    // Open import modal
    fireEvent.click(screen.getByRole('button', { name: /import questions from excel/i }));
    expect(screen.getByText('Import MCQ Questions from Excel')).toBeInTheDocument();

    // Select file
    const file = new File(['dummy xlsx content'], 'questions.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Click "Upload & Preview"
    const previewBtn = screen.getByRole('button', { name: /upload & preview/i });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(examinationApi.previewImport).toHaveBeenCalledWith('as-draft-01', file);
      expect(screen.getByText('Valid Questions')).toBeInTheDocument();
      expect(screen.getByText('Invalid Rows')).toBeInTheDocument();
      expect(screen.getByText('Option D is required and cannot be empty')).toBeInTheDocument();
    });

    // Switch to valid questions tab
    fireEvent.click(screen.getByRole('button', { name: /valid questions/i }));
    expect(screen.getByText('What is 10 + 20?')).toBeInTheDocument();
    expect(screen.getByText('What is 5 * 5?')).toBeInTheDocument();

    // Confirm and commit
    const confirmBtn = screen.getByRole('button', { name: /confirm & commit/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(examinationApi.confirmImport).toHaveBeenCalledWith(
        'as-draft-01',
        expect.objectContaining({
          questions: expect.arrayContaining([
            expect.objectContaining({ questionText: 'What is 10 + 20?' }),
            expect.objectContaining({ questionText: 'What is 5 * 5?' }),
          ]),
        }),
      );
      expect(screen.getByText(/Successfully imported 2 questions/i)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Question Image Management
  // ---------------------------------------------------------------------------
  it('handles question image upload and diagram removal', async () => {
    (examinationApi.uploadQuestionImage as any).mockResolvedValue({
      id: 'img-artifact-1',
      questionId: 'q-01',
      fileName: 'diagram.png',
      fileSize: 1024,
      mimeType: 'image/png',
      checksumSha256: 'sha256',
      status: 'UPLOADED',
    });
    (examinationApi.deleteQuestionImage as any).mockResolvedValue({
      success: true,
      message: 'Question image removed successfully',
    });

    render(
      <AssessmentQuestionManagementView
        assessment={mockDraftAssessment}
        grades={mockGrades}
        chapters={mockChapters}
        onBack={mockOnBack}
        onAssessmentUpdated={mockOnUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('What is the root of the equation 2x + 6 = 0?')).toBeInTheDocument();
    });

    // Click manage image on q-01
    const imageBtns = screen.getAllByTitle(/attach diagram|manage/i);
    fireEvent.click(imageBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Question Diagram Attachment')).toBeInTheDocument();
    });

    // Select valid image file
    const imgFile = new File(['fake image bytes'], 'geometry.png', { type: 'image/png' });
    const imgInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(imgInput, { target: { files: [imgFile] } });

    // Upload
    const uploadBtn = screen.getByRole('button', { name: /upload diagram/i });
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(examinationApi.uploadQuestionImage).toHaveBeenCalledWith('as-draft-01', 'q-01', imgFile);
      expect(screen.getByText('Question image diagram attached successfully')).toBeInTheDocument();
    });

    // Reopen modal to test removal
    fireEvent.click(imageBtns[0]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove diagram/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /remove diagram/i }));

    await waitFor(() => {
      expect(examinationApi.deleteQuestionImage).toHaveBeenCalledWith('as-draft-01', 'q-01');
      expect(screen.getByText('Question image removed successfully')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Question Paper Preview Modal
  // ---------------------------------------------------------------------------
  it('opens teacher question paper preview and toggles answer keys', async () => {
    render(
      <AssessmentQuestionManagementView
        assessment={mockDraftAssessment}
        grades={mockGrades}
        chapters={mockChapters}
        onBack={mockOnBack}
        onAssessmentUpdated={mockOnUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('What is the root of the equation 2x + 6 = 0?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /preview question paper/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /preview question paper/i }));

    await waitFor(() => {
      expect(screen.getByText('Question Paper Preview')).toBeInTheDocument();
      expect(screen.getByText('Teacher Inspection View')).toBeInTheDocument();
      expect(screen.getByText(/Q1\. What is the root of the equation 2x \+ 6 = 0\?/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Correct Key:/i).length).toBeGreaterThan(0);
    });

    // Toggle off Answer Keys checkbox
    const answerKeyCheckbox = screen.getByLabelText(/show answer keys/i);
    fireEvent.click(answerKeyCheckbox);

    // Answer keys should be hidden
    expect(screen.queryByText(/Correct Key:/i)).not.toBeInTheDocument();

    // Close preview
    fireEvent.click(screen.getByRole('button', { name: /close preview/i }));
    expect(screen.queryByText('Question Paper Preview')).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // 8. Lifecycle Protection (Published Assessment)
  // ---------------------------------------------------------------------------
  it('locks question creation, import, editing and deletion when assessment is PUBLISHED', async () => {
    render(
      <AssessmentQuestionManagementView
        assessment={mockPublishedAssessment}
        grades={mockGrades}
        chapters={mockChapters}
        onBack={mockOnBack}
        onAssessmentUpdated={mockOnUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Assessment Locked (PUBLISHED)')).toBeInTheDocument();
    });

    // Add Question & Import buttons are disabled
    const addBtn = screen.getByRole('button', { name: /add question/i });
    expect(addBtn).toBeDisabled();

    const importBtn = screen.getByRole('button', { name: /import questions from excel/i });
    expect(importBtn).toBeDisabled();

    // Edit and Delete buttons are not rendered for published assessments
    expect(screen.queryByTitle('Edit Question')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete Question')).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // 9. Publish Control in Question Management Header
  // ---------------------------------------------------------------------------
  it('displays Publish Assessment button for DRAFT, prompts confirmation, and publishes assessment', async () => {
    (examinationApi.publishAssessment as any).mockResolvedValueOnce({
      ...mockDraftAssessment,
      status: AssessmentStatus.PUBLISHED,
    });

    render(
      <AssessmentQuestionManagementView
        assessment={mockDraftAssessment}
        grades={mockGrades}
        chapters={mockChapters}
        onBack={mockOnBack}
        onAssessmentUpdated={mockOnUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('What is the root of the equation 2x + 6 = 0?')).toBeInTheDocument();
    });

    // Publish button is present in header
    const publishBtn = screen.getByRole('button', { name: /publish assessment/i });
    expect(publishBtn).toBeInTheDocument();

    // Click Publish button
    fireEvent.click(publishBtn);

    // Confirmation dialog opens
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /publish assessment/i })).toBeInTheDocument();
    expect(screen.getByText(/marks pre-flight notice/i)).toBeInTheDocument();
    expect(examinationApi.publishAssessment).not.toHaveBeenCalled();

    // Confirm publish
    const confirmBtn = screen.getByRole('button', { name: /confirm publish/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(examinationApi.publishAssessment).toHaveBeenCalledWith('as-draft-01');
      expect(mockOnUpdated).toHaveBeenCalled();
      expect(screen.getByText(/has been published successfully/i)).toBeInTheDocument();
      // Locked banner should now appear since status became PUBLISHED
      expect(screen.getByText('Assessment Locked (PUBLISHED)')).toBeInTheDocument();
    });

    // Publish button should no longer be rendered
    expect(screen.queryByRole('button', { name: /publish assessment/i })).not.toBeInTheDocument();
  });

  it('does not display Publish Assessment button when assessment is already PUBLISHED', async () => {
    render(
      <AssessmentQuestionManagementView
        assessment={mockPublishedAssessment}
        grades={mockGrades}
        chapters={mockChapters}
        onBack={mockOnBack}
        onAssessmentUpdated={mockOnUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Assessment Locked (PUBLISHED)')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /publish assessment/i })).not.toBeInTheDocument();
  });
});
