import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudentExaminationPortal } from '../components/StudentExaminationPortal';
import {
  examinationApi,
  AssessmentMode,
  AssessmentStatus,
  AttemptStatus,
  ProgressionAssessmentStatus,
} from '../services/examination.api';

const mockExaminationApi = vi.hoisted(() => ({
  listStudentAssessments: vi.fn(),
  startAssessment: vi.fn(),
  getAttempt: vi.fn(),
  saveAnswer: vi.fn(),
  submitAttempt: vi.fn(),
  getStudentAssessmentResult: vi.fn(),
  getStudentChapters: vi.fn(),
  getChapterProgression: vi.fn(),
  getQuestionImageBlob: vi.fn(),
  recordViolationEvent: vi.fn(),
  completePreflightCheck: vi.fn(),
  recordStudentExplanation: vi.fn(),
}));

// Mock the examinationApi service
vi.mock('../services/examination.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/examination.api')>();
  return {
    ...actual,
    examinationApi: mockExaminationApi,
    default: mockExaminationApi,
  };
});

describe('StudentExaminationPortal Component', () => {
  const mockAssessments = [
    {
      id: 'asm-quiz-1',
      title: 'Mathematics Unit 1 Quiz',
      description: 'Algebra fundamentals and quadratic equations',
      subject: 'Mathematics',
      mode: AssessmentMode.NORMAL_QUIZ,
      totalMarks: 20,
      passingMarks: 8,
      durationMinutes: 30,
      startWindowAt: new Date(Date.now() - 3600000).toISOString(),
      endWindowAt: new Date(Date.now() + 86400000).toISOString(),
      hasAttempt: false,
      attemptStatus: null,
      attemptId: null,
    },
    {
      id: 'asm-live-2',
      title: 'Physics Midterm Live Exam',
      description: 'Optics and Wave Mechanics',
      subject: 'Physics',
      mode: AssessmentMode.LIVE_EXAM,
      totalMarks: 50,
      passingMarks: 20,
      durationMinutes: 60,
      startWindowAt: new Date(Date.now() - 1800000).toISOString(),
      endWindowAt: new Date(Date.now() + 3600000).toISOString(),
      hasAttempt: true,
      attemptStatus: AttemptStatus.IN_PROGRESS,
      attemptId: 'att-live-2',
    },
    {
      id: 'asm-done-3',
      title: 'Chemistry Chapter 2 Quiz',
      description: 'Periodic table and chemical bonding',
      subject: 'Chemistry',
      mode: AssessmentMode.NORMAL_QUIZ,
      totalMarks: 25,
      passingMarks: 10,
      durationMinutes: 30,
      startWindowAt: new Date(Date.now() - 7200000).toISOString(),
      endWindowAt: new Date(Date.now() + 3600000).toISOString(),
      hasAttempt: true,
      attemptStatus: AttemptStatus.SUBMITTED,
      attemptId: 'att-done-3',
    },
  ];

  const mockAttemptDetail = {
    id: 'att-quiz-1',
    assessmentId: 'asm-quiz-1',
    studentId: 'stu-alex-1',
    status: AttemptStatus.IN_PROGRESS,
    startedAt: new Date(Date.now() - 300000).toISOString(),
    deadlineAt: new Date(Date.now() + 1500000).toISOString(), // 25 mins remaining
    remainingSeconds: 1500,
    submittedAt: null,
    questions: [
      {
        id: 'q-1',
        sectionId: null,
        orderIndex: 1,
        questionText: 'What is the solution to 2x + 6 = 14?',
        options: ['x = 2', 'x = 4', 'x = 6', 'x = 8'],
        marks: 2,
        hasImage: false,
        imageUrl: null,
      },
      {
        id: 'q-2',
        sectionId: null,
        orderIndex: 2,
        questionText: 'Identify the vertex of y = (x - 3)^2 + 4 from the figure below:',
        options: ['(3, 4)', '(-3, 4)', '(3, -4)', '(-3, -4)'],
        marks: 3,
        hasImage: true,
        imageUrl: '/api/v1/examination/assessments/asm-quiz-1/questions/q-2/image',
      },
    ],
    answers: {
      'q-1': 1, // Option B (x = 4) selected
      'q-2': null,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (examinationApi.listStudentAssessments as any).mockResolvedValue(mockAssessments);
    (examinationApi.getStudentChapters as any).mockResolvedValue([]);
    (examinationApi.startAssessment as any).mockResolvedValue(mockAttemptDetail);
    (examinationApi.getAttempt as any).mockResolvedValue(mockAttemptDetail);
    (examinationApi.saveAnswer as any).mockResolvedValue({
      success: true,
      questionId: 'q-2',
      selectedOption: 0,
    });
    (examinationApi.submitAttempt as any).mockResolvedValue({
      success: true,
      message: 'Attempt submitted',
      attemptId: 'att-quiz-1',
      status: AttemptStatus.SUBMITTED,
      submittedAt: new Date().toISOString(),
    });
    (examinationApi.getQuestionImageBlob as any).mockResolvedValue(
      new Blob(['dummy-image'], { type: 'image/png' }),
    );
    (examinationApi.getStudentAssessmentResult as any).mockResolvedValue({
      assessmentId: 'asm-quiz-1',
      title: 'Mathematics Unit 1 Quiz',
      subject: 'Mathematics',
      totalMarks: 20,
      passingMarks: 8,
      hasAttempt: true,
      result: null,
      message: 'Result is not available for this attempt',
    });

    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test-diagram');
      window.URL.revokeObjectURL = vi.fn();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Dashboard Listing & Filtering
  // ---------------------------------------------------------------------------
  it('loads and displays authorized student assessments on dashboard', async () => {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument();
      expect(screen.getByText('Physics Midterm Live Exam')).toBeInTheDocument();
      expect(screen.getByText('Chemistry Chapter 2 Quiz')).toBeInTheDocument();
    });

    // Check mode badges
    expect(screen.getByText('Live Exam')).toBeInTheDocument();
    expect(screen.getAllByText('Normal Quiz').length).toBe(2);

    // Check attempt status buttons
    expect(screen.getByRole('button', { name: /Take Examination/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resume In-Progress Attempt/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View Submission & Result/i })).toBeInTheDocument();
  });

  it('filters assessments by status tab', async () => {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument();
    });

    // Filter to IN_PROGRESS tab
    const inProgressTab = screen.getByRole('button', { name: 'In Progress' });
    fireEvent.click(inProgressTab);

    expect(screen.getByText('Physics Midterm Live Exam')).toBeInTheDocument();
    expect(screen.queryByText('Mathematics Unit 1 Quiz')).not.toBeInTheDocument();
    expect(screen.queryByText('Chemistry Chapter 2 Quiz')).not.toBeInTheDocument();

    // Filter to SUBMITTED tab
    const submittedTab = screen.getByRole('button', { name: 'Submitted' });
    fireEvent.click(submittedTab);

    expect(screen.getByText('Chemistry Chapter 2 Quiz')).toBeInTheDocument();
    expect(screen.queryByText('Physics Midterm Live Exam')).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // 2. Chapter Progression Display
  // ---------------------------------------------------------------------------
  it('checks chapter progression status on demand via chapter selector', async () => {
    (examinationApi.getStudentChapters as any).mockResolvedValueOnce([
      {
        id: '00000000-0000-0000-0000-000000000001',
        chapterCode: 'CH-1',
        title: 'Algebra Foundations',
        subject: 'Mathematics',
        orderIndex: 1,
      },
    ]);
    (examinationApi.getChapterProgression as any).mockResolvedValueOnce({
      chapterId: '00000000-0000-0000-0000-000000000001',
      isUnlocked: true,
      unlockedAt: new Date().toISOString(),
      configuredModes: [AssessmentMode.NORMAL_QUIZ],
      assessments: [
        {
          assessmentId: 'asm-quiz-1',
          mode: AssessmentMode.NORMAL_QUIZ,
          title: 'Mathematics Unit 1 Quiz',
          status: ProgressionAssessmentStatus.RESOLVED_SUBMITTED,
          resolved: true,
        },
      ],
    });

    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /Select Chapter/i })).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox', { name: /Select Chapter/i });
    fireEvent.change(select, { target: { value: '00000000-0000-0000-0000-000000000001' } });

    await waitFor(() => {
      expect(examinationApi.getChapterProgression).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001');
      expect(screen.getByText('Unlocked')).toBeInTheDocument();
      expect(screen.getByText('RESOLVED_SUBMITTED')).toBeInTheDocument();
    });
  });

  it('displays empty state message when no chapters are configured for student grade', async () => {
    (examinationApi.getStudentChapters as any).mockResolvedValueOnce([]);

    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(
        screen.getByText(/No chapters are configured for your grade yet\. Please contact your teacher\./i),
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Instructions Screen & Explicit Start Confirmation
  // ---------------------------------------------------------------------------
  it('opens instruction screen and requires explicit acknowledgment before starting attempt', async () => {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument();
    });

    // Click "Take Examination"
    const takeExamBtn = screen.getByRole('button', { name: /Take Examination/i });
    fireEvent.click(takeExamBtn);

    // Verify Instructions View is open
    expect(screen.getByText('Important Examination Rules & Guidelines')).toBeInTheDocument();
    expect(screen.getByText('Carefully Read Every Question')).toBeInTheDocument();
    expect(screen.getByText('Server-Synchronized Autosave')).toBeInTheDocument();
    expect(screen.getByText('Strict Single Attempt Submission')).toBeInTheDocument();

    // Start button must be disabled before checkbox is checked
    const startBtn = screen.getByRole('button', { name: /Start Examination Now/i });
    expect(startBtn).toBeDisabled();

    // Check explicit acknowledgment
    const ackCheckbox = screen.getByRole('checkbox');
    fireEvent.click(ackCheckbox);

    // Start button is now enabled
    expect(startBtn).not.toBeDisabled();

    // Click Start
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(examinationApi.startAssessment).toHaveBeenCalledWith('asm-quiz-1');
      expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    });
  });

  it('allows returning back to dashboard from instructions without starting', async () => {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    expect(screen.getByText('Important Examination Rules & Guidelines')).toBeInTheDocument();

    const returnBtn = screen.getByRole('button', { name: /Cancel & Return/i });
    fireEvent.click(returnBtn);

    expect(screen.getByText('Active Tests & Chapter Progression')).toBeInTheDocument();
    expect(examinationApi.startAssessment).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 4. Examination Runner & Question Navigation
  // ---------------------------------------------------------------------------
  it('renders question, radio options, and navigates between questions', async () => {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(screen.getByText('What is the solution to 2x + 6 = 14?')).toBeInTheDocument();
    });

    // Check Question 1 options
    expect(screen.getByText('x = 2')).toBeInTheDocument();
    expect(screen.getByText('x = 4')).toBeInTheDocument();

    // Option B was pre-answered (index 1) in mockAttemptDetail
    const radioB = screen.getByLabelText(/Option B: x = 4/i) as HTMLInputElement;
    expect(radioB.checked).toBe(true);

    // Navigate to Question 2
    const nextBtn = screen.getByRole('button', { name: /Next/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Identify the vertex of y = (x - 3)^2 + 4 from the figure below:'),
      ).toBeInTheDocument();
      expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
    });

    // Check that diagram image was fetched
    expect(examinationApi.getQuestionImageBlob).toHaveBeenCalledWith('asm-quiz-1', 'q-2');

    // On last question, button changes to "Review & Submit"
    expect(screen.getByRole('button', { name: /Review & Submit/i })).toBeInTheDocument();

    // Navigate back to Question 1
    const prevBtn = screen.getByRole('button', { name: /Previous/i });
    fireEvent.click(prevBtn);
    expect(screen.getByText('What is the solution to 2x + 6 = 14?')).toBeInTheDocument();
  });

  it('allows jumping between questions using the Question Palette', async () => {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(screen.getByText('Question Palette')).toBeInTheDocument();
    });

    // Jump to Question 2 directly
    const q2PaletteBtn = screen.getByRole('button', { name: 'Jump to Question 2' });
    fireEvent.click(q2PaletteBtn);

    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // 5. Autosave Engine & Error Handling
  // ---------------------------------------------------------------------------
  it('autosaves selected answer and displays Saved status indicator', async () => {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(screen.getByText('What is the solution to 2x + 6 = 14?')).toBeInTheDocument();
    });

    // Select Option A (index 0)
    const radioA = screen.getByLabelText(/Option A: x = 2/i);
    fireEvent.click(radioA);

    await waitFor(() => {
      expect(examinationApi.saveAnswer).toHaveBeenCalledWith('att-quiz-1', 'q-1', {
        selectedOption: 0,
      });
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  it('handles autosave failure and displays Save Failed retry indicator', async () => {
    (examinationApi.saveAnswer as any).mockRejectedValueOnce(new Error('Network disconnected'));

    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(screen.getByText('What is the solution to 2x + 6 = 14?')).toBeInTheDocument();
    });

    // Select Option C (index 2)
    const radioC = screen.getByLabelText(/Option C: x = 6/i);
    fireEvent.click(radioC);

    await waitFor(() => {
      expect(screen.getByText('Save Failed (Retry)')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Resume In-Progress Attempt & Timer Synchronization
  // ---------------------------------------------------------------------------
  it('resumes an in-progress attempt directly without creating duplicate attempts', async () => {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Physics Midterm Live Exam')).toBeInTheDocument();
    });

    // Click "Resume In-Progress Attempt"
    const resumeBtn = screen.getByRole('button', { name: /Resume In-Progress Attempt/i });
    fireEvent.click(resumeBtn);

    await waitFor(() => {
      expect(examinationApi.getAttempt).toHaveBeenCalledWith('att-live-2');
      expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Submission Workflow & Results Release Rules
  // ---------------------------------------------------------------------------
  it('opens submit modal with unanswered count warning and confirms final submission', async () => {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    });

    // Click top Submit button
    const submitTrigger = screen.getByRole('button', { name: 'Submit' });
    fireEvent.click(submitTrigger);

    // Verify confirmation modal
    expect(screen.getByText('Confirm Final Submission?')).toBeInTheDocument();
    expect(screen.getByText(/1 unanswered question\(s\)/i)).toBeInTheDocument();

    // Confirm submit
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Submit/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(examinationApi.submitAttempt).toHaveBeenCalledWith('att-quiz-1');
      expect(screen.getByText('Examination Submitted Successfully')).toBeInTheDocument();
      expect(screen.getByText('Official Results Pending Release')).toBeInTheDocument();
    });
  });

  it('displays scorecard when results are officially released', async () => {
    (examinationApi.getStudentAssessmentResult as any).mockResolvedValueOnce({
      assessmentId: 'asm-quiz-1',
      title: 'Mathematics Unit 1 Quiz',
      subject: 'Mathematics',
      totalMarks: 20,
      passingMarks: 8,
      hasAttempt: true,
      result: {
        attemptId: 'att-quiz-1',
        totalQuestions: 2,
        attemptedQuestions: 2,
        correctAnswers: 2,
        incorrectAnswers: 0,
        score: 20,
        percentage: 100,
        isPassing: true,
        submittedAt: new Date().toISOString(),
      },
    });

    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Submit/i }));

    await waitFor(() => {
      expect(screen.getByText('Official Performance Scorecard Released')).toBeInTheDocument();
      expect(screen.getByText('20 / 20')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();
      expect(screen.getByText('PASSED')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Security & Leak Prevention
  // ---------------------------------------------------------------------------
  it('strictly prevents correct-answer leakage to the student runner interface', async () => {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(screen.getByText('What is the solution to 2x + 6 = 14?')).toBeInTheDocument();
    });

    // Verify no answer key / correct option text exists in the document
    expect(screen.queryByText(/Correct Option/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Answer Key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rationale/i)).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // 9. Reconnection & Offline Warning Banner
  // ---------------------------------------------------------------------------
  it('displays offline warning when browser loses connection and recovers when online', async () => {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
      expect(screen.getByText('Online')).toBeInTheDocument();
    });

    // Trigger offline event
    fireEvent(window, new Event('offline'));

    await waitFor(() => {
      expect(screen.getByText('Offline')).toBeInTheDocument();
      expect(screen.getByText(/Internet connection lost/i)).toBeInTheDocument();
    });

    // Trigger online event
    fireEvent(window, new Event('online'));

    await waitFor(() => {
      expect(screen.getByText('Online')).toBeInTheDocument();
      expect(screen.queryByText(/Internet connection lost/i)).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Expired / Timed Out Handling
  // ---------------------------------------------------------------------------
  it('handles expired attempt deadline and transitions to TIMED_OUT screen', async () => {
    const expiredAttempt = {
      ...mockAttemptDetail,
      deadlineAt: new Date(Date.now() - 5000).toISOString(), // Expired 5 seconds ago
      remainingSeconds: 0,
    };
    (examinationApi.startAssessment as any).mockResolvedValueOnce(expiredAttempt);
    (examinationApi.getAttempt as any).mockResolvedValueOnce({
      ...expiredAttempt,
      status: AttemptStatus.TIMED_OUT,
    });

    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(screen.getByText('Examination Concluded (Timed Out)')).toBeInTheDocument();
      expect(screen.getByText(/allotted test time has elapsed/i)).toBeInTheDocument();
      expect(screen.getByText('TIMED_OUT')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Terminal Attempt Restrictions
  // ---------------------------------------------------------------------------
  it('immediately transitions to completed view if starting an already submitted attempt', async () => {
    const submittedAttempt = {
      ...mockAttemptDetail,
      status: AttemptStatus.SUBMITTED,
      submittedAt: new Date().toISOString(),
    };
    (examinationApi.startAssessment as any).mockResolvedValueOnce(submittedAttempt);

    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(screen.getByText('Examination Submitted Successfully')).toBeInTheDocument();
      expect(screen.getByText('SUBMITTED')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // P4-09B-4B RELIABILITY & CONCURRENCY HARDENING REGRESSION SUITE (18 TESTS)
  // ===========================================================================

  // Helper to create deterministic deferred promises
  function createDeferred<T>() {
    let resolve!: (val: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  // 1. Device clock 10 minutes ahead does not prematurely expire the attempt
  it('P4-09B-4B #1: device clock 10 minutes ahead does not prematurely expire the attempt', async () => {
    const skewedAheadAttempt = {
      ...mockAttemptDetail,
      // Local Date.now() thinks deadline passed 10 minutes ago, but server says 25 mins (1500s) remain
      deadlineAt: new Date(Date.now() - 600000).toISOString(),
      remainingSeconds: 1500,
    };
    (examinationApi.startAssessment as any).mockResolvedValueOnce(skewedAheadAttempt);

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
      expect(screen.getByText('25:00')).toBeInTheDocument();
    });

    // Must not falsely transition to COMPLETED
    expect(screen.queryByText(/Examination Concluded/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Examination Submitted Successfully/i)).not.toBeInTheDocument();
  });

  // 2. Device clock 10 minutes behind does not display phantom additional time
  it('P4-09B-4B #2: device clock 10 minutes behind does not display phantom additional time', async () => {
    const skewedBehindAttempt = {
      ...mockAttemptDetail,
      // Local Date.now() would compute 35 minutes (2100s), but server remainingSeconds is 1500s (25:00)
      deadlineAt: new Date(Date.now() + 2100000).toISOString(),
      remainingSeconds: 1500,
    };
    (examinationApi.startAssessment as any).mockResolvedValueOnce(skewedBehindAttempt);

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
      expect(screen.getByText('25:00')).toBeInTheDocument();
    });
    expect(screen.queryByText('35:00')).not.toBeInTheDocument();
  });

  // 3. Local countdown reaches zero but backend returns IN_PROGRESS: runner remains active and re-synchronizes
  it('P4-09B-4B #3: local countdown reaches zero but backend returns IN_PROGRESS: runner stays active and re-anchors timer', async () => {
    const zeroRemainingAttempt = {
      ...mockAttemptDetail,
      remainingSeconds: 0,
    };
    (examinationApi.startAssessment as any).mockResolvedValueOnce(zeroRemainingAttempt);
    (examinationApi.getAttempt as any).mockResolvedValueOnce({
      ...mockAttemptDetail,
      status: AttemptStatus.IN_PROGRESS,
      remainingSeconds: 120, // Server still has 02:00 left
    });

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(examinationApi.getAttempt).toHaveBeenCalledWith('att-quiz-1');
      expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
      expect(screen.getByText('02:00')).toBeInTheDocument();
    });

    // Must remain in RUNNER and not declare completion
    expect(screen.queryByText(/Examination Submitted Successfully/i)).not.toBeInTheDocument();
  });

  // 4. Backend returns TIMED_OUT: runner transitions to completion
  it('P4-09B-4B #4: when countdown reaches zero and backend returns TIMED_OUT, runner transitions to completion', async () => {
    (examinationApi.startAssessment as any).mockResolvedValueOnce({
      ...mockAttemptDetail,
      remainingSeconds: 0,
    });
    (examinationApi.getAttempt as any).mockResolvedValueOnce({
      ...mockAttemptDetail,
      status: AttemptStatus.TIMED_OUT,
      remainingSeconds: 0,
      submittedAt: new Date().toISOString(),
    });

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(screen.getByText('Examination Concluded (Timed Out)')).toBeInTheDocument();
      expect(screen.getByText('TIMED_OUT')).toBeInTheDocument();
    });
  });

  // 5. Rapid A -> B -> C selection sends serialized requests
  it('P4-09B-4B #5: rapid A -> B -> C selection sends serialized requests without overlapping writes', async () => {
    const req1Deferred = createDeferred<{ success: boolean; questionId: string; selectedOption: number | null }>();
    const req2Deferred = createDeferred<{ success: boolean; questionId: string; selectedOption: number | null }>();

    (examinationApi.saveAnswer as any)
      .mockImplementationOnce(() => req1Deferred.promise)
      .mockImplementationOnce(() => req2Deferred.promise);

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => expect(screen.getByText('What is the solution to 2x + 6 = 14?')).toBeInTheDocument());

    // Navigate to Question 2 (initially unanswered)
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    await waitFor(() => expect(screen.getByText('Question 2 of 2')).toBeInTheDocument());

    // Rapidly select Option A (0) -> Option B (1) -> Option C (2)
    fireEvent.click(screen.getByLabelText(/Option A:/i));
    fireEvent.click(screen.getByLabelText(/Option B:/i));
    fireEvent.click(screen.getByLabelText(/Option C:/i));

    // Only Request 1 (Option A = 0) should have been dispatched while in flight!
    expect(examinationApi.saveAnswer).toHaveBeenCalledTimes(1);
    expect(examinationApi.saveAnswer).toHaveBeenNthCalledWith(1, 'att-quiz-1', 'q-2', {
      selectedOption: 0,
    });

    // Resolve Request 1 (Option A) -> Worker loop immediately dispatches Option C (2), skipping superseded Option B (1)
    req1Deferred.resolve({ success: true, questionId: 'q-2', selectedOption: 0 });

    await waitFor(() => {
      expect(examinationApi.saveAnswer).toHaveBeenCalledTimes(2);
      expect(examinationApi.saveAnswer).toHaveBeenNthCalledWith(2, 'att-quiz-1', 'q-2', {
        selectedOption: 2,
      });
    });

    req2Deferred.resolve({ success: true, questionId: 'q-2', selectedOption: 2 });
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
  });

  // 6. Latest answer C is the final acknowledged answer
  it('P4-09B-4B #6: latest answer C is the final acknowledged and persisted answer after rapid changes', async () => {
    const req1Deferred = createDeferred<{ success: boolean; questionId: string; selectedOption: number | null }>();
    const req2Deferred = createDeferred<{ success: boolean; questionId: string; selectedOption: number | null }>();

    (examinationApi.saveAnswer as any)
      .mockImplementationOnce(() => req1Deferred.promise)
      .mockImplementationOnce(() => req2Deferred.promise);

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeInTheDocument());

    // Rapidly select Option A (0) -> Option C (2) -> Option D (3) on Question 1
    fireEvent.click(screen.getByLabelText(/Option A: x = 2/i));
    fireEvent.click(screen.getByLabelText(/Option C: x = 6/i));
    fireEvent.click(screen.getByLabelText(/Option D: x = 8/i));

    req1Deferred.resolve({ success: true, questionId: 'q-1', selectedOption: 0 });
    await waitFor(() => {
      expect(examinationApi.saveAnswer).toHaveBeenNthCalledWith(2, 'att-quiz-1', 'q-1', {
        selectedOption: 3,
      });
    });

    req2Deferred.resolve({ success: true, questionId: 'q-1', selectedOption: 3 });
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
      expect(screen.getByText('Answer confirmed saved')).toBeInTheDocument();
    });

    const radioD = screen.getByLabelText(/Option D: x = 8/i) as HTMLInputElement;
    expect(radioD.checked).toBe(true);
  });

  // 7. Question 1 save failure remains visible after successfully saving Question 2
  it('P4-09B-4B #7: Question 1 save failure remains visible after successfully saving Question 2', async () => {
    (examinationApi.saveAnswer as any)
      .mockRejectedValueOnce(new Error('Q1 network timeout')) // Q1 fails
      .mockResolvedValueOnce({ success: true, questionId: 'q-2', selectedOption: 0 }); // Q2 succeeds

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/Option A: x = 2/i));
    await waitFor(() => expect(screen.getByText('Save Failed (Retry)')).toBeInTheDocument());

    // Navigate to Question 2 and save Option A successfully
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    await waitFor(() => expect(screen.getByText('Question 2 of 2')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/Option A:/i));

    await waitFor(() => {
      expect(examinationApi.saveAnswer).toHaveBeenCalledWith('att-quiz-1', 'q-2', {
        selectedOption: 0,
      });
    });

    // Q1 failure must remain visible in the header and alert banner
    expect(screen.getByText('Save Failed (Retry)')).toBeInTheDocument();
    expect(screen.getByText(/Question\(s\) 1 could not be saved/i)).toBeInTheDocument();
  });

  // 8. Retry targets the failed question, not the current question
  it('P4-09B-4B #8: clicking Retry targets the failed Question 1 even while viewing Question 2', async () => {
    (examinationApi.saveAnswer as any)
      .mockRejectedValueOnce(new Error('Q1 network timeout')) // Q1 fails
      .mockResolvedValueOnce({ success: true, questionId: 'q-2', selectedOption: 0 }) // Q2 succeeds
      .mockResolvedValueOnce({ success: true, questionId: 'q-1', selectedOption: 0 }); // Q1 retry succeeds

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeInTheDocument());

    // Q1 fails with Option A (0)
    fireEvent.click(screen.getByLabelText(/Option A: x = 2/i));
    await waitFor(() => expect(screen.getByText('Save Failed (Retry)')).toBeInTheDocument());

    // Move to Q2 and save Option A (0)
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    await waitFor(() => expect(screen.getByText('Question 2 of 2')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/Option A:/i));
    await waitFor(() => expect(examinationApi.saveAnswer).toHaveBeenCalledTimes(2));

    // Click Retry while viewing Q2 -> must retry Q1 ('q-1')
    fireEvent.click(screen.getByText('Save Failed (Retry)'));

    await waitFor(() => {
      expect(examinationApi.saveAnswer).toHaveBeenCalledTimes(3);
      expect(examinationApi.saveAnswer).toHaveBeenNthCalledWith(3, 'att-quiz-1', 'q-1', {
        selectedOption: 0,
      });
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  // 9. Header never displays Saved while any question remains dirty
  it('P4-09B-4B #9: header never displays Saved while any question has a pending or dirty save', async () => {
    const q1Deferred = createDeferred<{ success: boolean; questionId: string; selectedOption: number | null }>();
    (examinationApi.saveAnswer as any)
      .mockImplementationOnce(() => q1Deferred.promise)
      .mockResolvedValueOnce({ success: true, questionId: 'q-2', selectedOption: 0 });

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeInTheDocument());

    // Start save on Q1 (stays pending)
    fireEvent.click(screen.getByLabelText(/Option A: x = 2/i));

    // Move to Q2 and save immediately
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    await waitFor(() => expect(screen.getByText('Question 2 of 2')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/Option A:/i));

    await waitFor(() => {
      expect(examinationApi.saveAnswer).toHaveBeenCalledWith('att-quiz-1', 'q-2', {
        selectedOption: 0,
      });
    });

    // Because Q1 is still pending, header must show Saving... and NEVER Saved
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();

    q1Deferred.resolve({ success: true, questionId: 'q-1', selectedOption: 0 });
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
  });

  // 10. Question palette distinguishes pending from confirmed answers
  it('P4-09B-4B #10: question palette distinguishes Pending Save from Confirmed Answered', async () => {
    const q2Deferred = createDeferred<{ success: boolean; questionId: string; selectedOption: number | null }>();
    (examinationApi.saveAnswer as any).mockImplementationOnce(() => q2Deferred.promise);

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeInTheDocument());

    // Q1 was pre-confirmed in mockAttemptDetail; jump to Q2
    const q1Btn = screen.getByRole('button', { name: 'Jump to Question 1' });
    const q2Btn = screen.getByRole('button', { name: 'Jump to Question 2' });
    expect(q1Btn.getAttribute('data-status')).toBe('CONFIRMED');
    expect(q2Btn.getAttribute('data-status')).toBe('UNANSWERED');

    fireEvent.click(q2Btn);
    fireEvent.click(screen.getByLabelText(/Option A:/i));

    // While Q2 save is in flight, Q2 palette status must be PENDING
    await waitFor(() => {
      expect(q2Btn.getAttribute('data-status')).toBe('PENDING');
      expect(screen.getByText('Pending Save (1)')).toBeInTheDocument();
    });

    // Resolve Q2 save -> Q2 palette status becomes CONFIRMED
    q2Deferred.resolve({ success: true, questionId: 'q-2', selectedOption: 0 });
    await waitFor(() => {
      expect(q2Btn.getAttribute('data-status')).toBe('CONFIRMED');
      expect(screen.getByText('Confirmed Answered (2)')).toBeInTheDocument();
    });
  });

  // 11. Submission waits for all active saves
  it('P4-09B-4B #11: submission waits for all active in-flight saves to settle before calling submitAttempt', async () => {
    const saveDeferred = createDeferred<{ success: boolean; questionId: string; selectedOption: number | null }>();
    (examinationApi.saveAnswer as any).mockImplementationOnce(() => saveDeferred.promise);

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeInTheDocument());

    // Select Option A on Q1 (save stays in-flight)
    fireEvent.click(screen.getByLabelText(/Option A: x = 2/i));

    // Open Submit Modal and click Confirm & Submit while save is still pending
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Submit/i }));

    // submitAttempt MUST NOT be called while saveAnswer is still pending
    expect(examinationApi.submitAttempt).not.toHaveBeenCalled();

    // Now resolve the in-flight saveAnswer
    saveDeferred.resolve({ success: true, questionId: 'q-1', selectedOption: 0 });

    await waitFor(() => {
      expect(examinationApi.submitAttempt).toHaveBeenCalledTimes(1);
    });
  });

  // 12. Submission does not run if a save remains unresolved
  it('P4-09B-4B #12: blocks final submission and warns student if a question save remains failed', async () => {
    (examinationApi.saveAnswer as any).mockRejectedValue(new Error('Persistent network error'));

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeInTheDocument());

    // Select Option A on Q1 -> fails
    fireEvent.click(screen.getByLabelText(/Option A: x = 2/i));
    await waitFor(() => expect(screen.getByText('Save Failed (Retry)')).toBeInTheDocument());

    // Open Submit Modal and click Confirm & Submit
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Submit/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Cannot submit examination yet: Question 1 could not be saved/i),
      ).toBeInTheDocument();
    });

    // submitAttempt must NOT have been called
    expect(examinationApi.submitAttempt).not.toHaveBeenCalled();
    expect(screen.queryByText('Examination Submitted Successfully')).not.toBeInTheDocument();
  });

  // 13. Successful save synchronization permits submission
  it('P4-09B-4B #13: retries failed saves during submission synchronization and submits when all answers are confirmed', async () => {
    (examinationApi.saveAnswer as any)
      .mockRejectedValueOnce(new Error('Initial transient network error')) // First save fails
      .mockResolvedValueOnce({ success: true, questionId: 'q-1', selectedOption: 0 }); // Retry inside submit succeeds

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeInTheDocument());

    // Select Option A on Q1 -> initial save fails
    fireEvent.click(screen.getByLabelText(/Option A: x = 2/i));
    await waitFor(() => expect(screen.getByText('Save Failed (Retry)')).toBeInTheDocument());

    // Open Submit Modal and click Confirm & Submit -> automatically retries Q1, succeeds, and submits
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Submit/i }));

    await waitFor(() => {
      expect(examinationApi.saveAnswer).toHaveBeenCalledTimes(2);
      expect(examinationApi.submitAttempt).toHaveBeenCalledWith('att-quiz-1');
      expect(screen.getByText('Examination Submitted Successfully')).toBeInTheDocument();
    });
  });

  // 14. Reconnection retries failed answers
  it('P4-09B-4B #14: browser reconnection automatically reconciles and retries failed answers', async () => {
    (examinationApi.saveAnswer as any)
      .mockRejectedValueOnce(new Error('Offline error'))
      .mockResolvedValueOnce({ success: true, questionId: 'q-1', selectedOption: 0 });

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeInTheDocument());

    fireEvent(window, new Event('offline'));
    fireEvent.click(screen.getByLabelText(/Option A: x = 2/i));

    await waitFor(() => expect(screen.getByText('Save Failed (Retry)')).toBeInTheDocument());

    // Reconnect online -> getAttempt returns IN_PROGRESS -> automatically retries Q1
    fireEvent(window, new Event('online'));

    await waitFor(() => {
      expect(examinationApi.getAttempt).toHaveBeenCalledWith('att-quiz-1');
      expect(examinationApi.saveAnswer).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  // 15. Reconnection discovers a terminal attempt and exits the runner
  it('P4-09B-4B #15: reconnection discovers a terminal attempt and exits the runner without retrying saves', async () => {
    (examinationApi.saveAnswer as any).mockRejectedValueOnce(new Error('Offline error'));

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeInTheDocument());

    fireEvent(window, new Event('offline'));
    fireEvent.click(screen.getByLabelText(/Option A: x = 2/i));
    await waitFor(() => expect(screen.getByText('Save Failed (Retry)')).toBeInTheDocument());

    // While offline, attempt expired on server
    (examinationApi.getAttempt as any).mockResolvedValueOnce({
      ...mockAttemptDetail,
      status: AttemptStatus.TIMED_OUT,
      remainingSeconds: 0,
      submittedAt: new Date().toISOString(),
    });

    fireEvent(window, new Event('online'));

    await waitFor(() => {
      expect(screen.getByText('Examination Concluded (Timed Out)')).toBeInTheDocument();
      expect(screen.getByText('TIMED_OUT')).toBeInTheDocument();
    });

    // Must not have dispatched a second saveAnswer after discovering TIMED_OUT
    expect(examinationApi.saveAnswer).toHaveBeenCalledTimes(1);
  });

  // 16. Multiple-tab submission is detected when the other tab receives a terminal response
  it('P4-09B-4B #16: detects terminal status when another tab submits attempt and exits the runner cleanly', async () => {
    (examinationApi.saveAnswer as any).mockRejectedValueOnce({
      response: {
        status: 400,
        data: { message: 'Cannot save answer: attempt is already submitted' },
      },
    });
    (examinationApi.getAttempt as any).mockResolvedValueOnce({
      ...mockAttemptDetail,
      status: AttemptStatus.SUBMITTED,
      remainingSeconds: 0,
      submittedAt: new Date().toISOString(),
    });

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeInTheDocument());

    // Student selects an option in Tab B after Tab A already submitted
    fireEvent.click(screen.getByLabelText(/Option A: x = 2/i));

    await waitFor(() => {
      expect(examinationApi.getAttempt).toHaveBeenCalledWith('att-quiz-1');
      expect(screen.getByText('Examination Submitted Successfully')).toBeInTheDocument();
      expect(screen.getByText('SUBMITTED')).toBeInTheDocument();
    });
  });

  // 17. No answer modifications are sent after terminal status
  it('P4-09B-4B #17: prevents any answer save requests while expiry verification or terminal state is active', async () => {
    const getAttemptDeferred = createDeferred<any>();
    (examinationApi.startAssessment as any).mockResolvedValueOnce({
      ...mockAttemptDetail,
      remainingSeconds: 0,
    });
    (examinationApi.getAttempt as any).mockImplementationOnce(() => getAttemptDeferred.promise);

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Synchronizing timer status with examination server/i),
      ).toBeInTheDocument();
    });

    // Attempt to click an option while expiry verification is in flight
    const radioA = screen.getByLabelText(/Option A: x = 2/i);
    expect(radioA).toBeDisabled();
    fireEvent.click(radioA);
    expect(examinationApi.saveAnswer).not.toHaveBeenCalled();

    // Resolve as TIMED_OUT
    getAttemptDeferred.resolve({
      ...mockAttemptDetail,
      status: AttemptStatus.TIMED_OUT,
      remainingSeconds: 0,
      submittedAt: new Date().toISOString(),
    });

    await waitFor(() => {
      expect(screen.getByText('Examination Concluded (Timed Out)')).toBeInTheDocument();
    });
    expect(examinationApi.saveAnswer).not.toHaveBeenCalled();
  });

  // 18. Duplicate submit actions invoke only one submission workflow
  it('P4-09B-4B #18: prevents duplicate submit invocations on rapid double-click', async () => {
    const submitDeferred = createDeferred<{
      success: boolean;
      message: string;
      attemptId: string;
      status: AttemptStatus;
      submittedAt: string;
    }>();
    (examinationApi.submitAttempt as any).mockImplementation(() => submitDeferred.promise);

    render(<StudentExaminationPortal />);
    await waitFor(() => expect(screen.getByText('Mathematics Unit 1 Quiz')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Take Examination/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Start Examination Now/i }));

    await waitFor(() => expect(screen.getByText('Question 1 of 2')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Submit/i });

    // Rapidly click Confirm & Submit multiple times
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(examinationApi.submitAttempt).toHaveBeenCalledTimes(1);
    });

    submitDeferred.resolve({
      success: true,
      message: 'Attempt submitted',
      attemptId: 'att-quiz-1',
      status: AttemptStatus.SUBMITTED,
      submittedAt: new Date().toISOString(),
    });

    await waitFor(() => {
      expect(screen.getByText('Examination Submitted Successfully')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // FINDING-02: Student Assessment History & Lifecycle Visibility
  // ---------------------------------------------------------------------------
  describe('FINDING-02: Assessment Lifecycle Status & History Visibility', () => {
    it('displays "View Submission & Result" for RESULTS_RELEASED assessments with SUBMITTED attempt', async () => {
      const releasedAssessment = {
        ...mockAssessments[2],
        id: 'asm-rel-01',
        title: 'Released History Exam',
        status: AssessmentStatus.RESULTS_RELEASED,
        hasAttempt: true,
        attemptStatus: AttemptStatus.SUBMITTED,
        attemptId: 'att-rel-01',
      };

      (examinationApi.listStudentAssessments as any).mockResolvedValue([releasedAssessment]);
      (examinationApi.getStudentAssessmentResult as any).mockResolvedValue({
        assessmentId: 'asm-rel-01',
        title: 'Released History Exam',
        subject: 'History',
        totalMarks: 50,
        passingMarks: 20,
        hasAttempt: true,
        result: {
          score: 42,
          percentage: 84,
          isPassing: true,
          totalQuestions: 10,
          attemptedQuestions: 10,
          correctAnswers: 8,
          incorrectAnswers: 2,
        },
      });

      (examinationApi.getAttempt as any).mockResolvedValueOnce({
        id: 'att-rel-01',
        assessmentId: 'asm-rel-01',
        status: AttemptStatus.SUBMITTED,
      });

      render(<StudentExaminationPortal />);
      await waitFor(() => expect(screen.getByText('Released History Exam')).toBeInTheDocument());

      const viewBtn = screen.getByRole('button', { name: /view submission & result/i });
      expect(viewBtn).toBeInTheDocument();

      fireEvent.click(viewBtn);

      await waitFor(() => {
        expect(screen.getByText('Official Performance Scorecard Released')).toBeInTheDocument();
        expect(screen.getByText('42 / 50')).toBeInTheDocument();
      });
    });

    it('displays "Examination Concluded" and never "Take Examination" for unattempted CLOSED assessments', async () => {
      const closedUnattempted = {
        ...mockAssessments[0],
        id: 'asm-closed-no-att',
        title: 'Closed Civics Quiz',
        status: AssessmentStatus.CLOSED,
        hasAttempt: false,
        attemptStatus: null,
        attemptId: null,
      };

      (examinationApi.listStudentAssessments as any).mockResolvedValue([closedUnattempted]);

      render(<StudentExaminationPortal />);
      await waitFor(() => expect(screen.getByText('Closed Civics Quiz')).toBeInTheDocument());

      expect(screen.getByText('Examination Concluded')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /take examination/i })).not.toBeInTheDocument();
    });

    it('displays "Results Released (Unattempted)" for unattempted RESULTS_RELEASED assessments', async () => {
      const releasedUnattempted = {
        ...mockAssessments[0],
        id: 'asm-rel-no-att',
        title: 'Unattempted Biology Exam',
        status: AssessmentStatus.RESULTS_RELEASED,
        hasAttempt: false,
        attemptStatus: null,
        attemptId: null,
      };

      (examinationApi.listStudentAssessments as any).mockResolvedValue([releasedUnattempted]);

      render(<StudentExaminationPortal />);
      await waitFor(() => expect(screen.getByText('Unattempted Biology Exam')).toBeInTheDocument());

      expect(screen.getByText('Results Released (Unattempted)')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /take examination/i })).not.toBeInTheDocument();
    });

    it('displays "Resume In-Progress Attempt" for CLOSED assessment when attempt is IN_PROGRESS', async () => {
      const closedInProgress = {
        ...mockAssessments[1],
        id: 'asm-closed-in-prog',
        title: 'Closed Exam with Active Attempt',
        status: AssessmentStatus.CLOSED,
        hasAttempt: true,
        attemptStatus: AttemptStatus.IN_PROGRESS,
        attemptId: 'att-closed-prog',
      };

      (examinationApi.listStudentAssessments as any).mockResolvedValue([closedInProgress]);

      render(<StudentExaminationPortal />);
      await waitFor(() => expect(screen.getByText('Closed Exam with Active Attempt')).toBeInTheDocument());

      expect(screen.getByRole('button', { name: /resume in-progress attempt/i })).toBeInTheDocument();
    });

    it('preserves submission record view for CLOSED assessment when attempt is SUBMITTED', async () => {
      const closedSubmitted = {
        ...mockAssessments[2],
        id: 'asm-closed-sub',
        title: 'Closed Exam Already Submitted',
        status: AssessmentStatus.CLOSED,
        hasAttempt: true,
        attemptStatus: AttemptStatus.SUBMITTED,
        attemptId: 'att-closed-sub',
      };

      (examinationApi.listStudentAssessments as any).mockResolvedValue([closedSubmitted]);

      render(<StudentExaminationPortal />);
      await waitFor(() => expect(screen.getByText('Closed Exam Already Submitted')).toBeInTheDocument());

      expect(screen.getByRole('button', { name: /view submission & result/i })).toBeInTheDocument();
    });

    it('renders locked screen and disables answer options when attempt is locked', async () => {
      const lockedAssessment = {
        ...mockAssessments[0],
        id: 'asm-locked-1',
        title: 'Monitored Exam at Limit',
        hasAttempt: true,
        attemptStatus: AttemptStatus.IN_PROGRESS,
        attemptId: 'att-locked-1',
        enableProctoring: true,
      };

      const lockedAttempt = {
        id: 'att-locked-1',
        assessmentId: 'asm-locked-1',
        studentId: 'st-1',
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date().toISOString(),
        deadlineAt: new Date(Date.now() + 600000).toISOString(),
        remainingSeconds: 600,
        submittedAt: null,
        enableProctoring: true,
        monitoringConfig: { requireFullscreen: true, maxWarnings: 3 },
        proctoringPassed: true,
        isLocked: true,
        activeWarningsCount: 3,
        maxWarnings: 3,
        questions: [
          {
            id: 'q-1',
            sectionId: 's1',
            orderIndex: 1,
            questionText: 'What is 2 + 2?',
            options: ['3', '4', '5'],
            marks: 1,
            hasImage: false,
            imageUrl: null,
          },
        ],
        answers: { 'q-1': 1 },
      };

      (examinationApi.listStudentAssessments as any).mockResolvedValue([lockedAssessment]);
      (examinationApi.getAttempt as any).mockResolvedValue(lockedAttempt);

      render(<StudentExaminationPortal />);
      await waitFor(() => expect(screen.getByText('Monitored Exam at Limit')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /resume in-progress attempt/i }));

      await waitFor(() => {
        expect(screen.getByText('Examination Locked by Proctoring Policy')).toBeInTheDocument();
        expect(
          screen.getByText(/Your exam session has been locked because you reached the proctoring warning threshold/i),
        ).toBeInTheDocument();
        expect(screen.getByText(/All 1 answer\(s\) saved prior to this lock have been securely stored/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /check status \/ re-check lock/i })).toBeInTheDocument();
      });

      // Confirm question card and radio options are not rendered while locked
      expect(screen.queryByText('What is 2 + 2?')).not.toBeInTheDocument();
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    });
  });
});
