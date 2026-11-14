import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AssessmentIntegrityAuditModal } from '../components/AssessmentIntegrityAuditModal';
import examinationApi, {
  AssessmentDraft,
  AssessmentMode,
  AssessmentStatus,
  ViolationEventType,
} from '../services/examination.api';

vi.mock('../services/examination.api', async () => {
  const actual = await vi.importActual<any>('../services/examination.api');
  return {
    ...actual,
    examinationApi: {
      ...actual.examinationApi,
      getAttemptIntegrityAudit: vi.fn(),
      dismissViolationEvent: vi.fn(),
      unlockAttempt: vi.fn(),
    },
    default: {
      ...actual.default,
      getAttemptIntegrityAudit: vi.fn(),
      dismissViolationEvent: vi.fn(),
      unlockAttempt: vi.fn(),
    },
  };
});

describe('AssessmentIntegrityAuditModal Component', () => {
  const mockAssessment: AssessmentDraft = {
    id: 'as-100',
    schoolId: 'sch-1',
    academicYearId: 'yr-1',
    gradeId: 'gr-1',
    sectionId: null,
    teacherId: 'tch-1',
    chapterId: null,
    title: 'Science Diagnostic Test',
    description: 'Unit test',
    subject: 'Science',
    mode: AssessmentMode.NORMAL_QUIZ,
    status: AssessmentStatus.CLOSED,
    totalMarks: 50,
    passingMarks: 20,
    durationMinutes: 30,
    startWindowAt: null,
    endWindowAt: null,
    shuffleQuestions: false,
    shuffleOptions: false,
    enableProctoring: true,
    monitoringConfig: { requireFullscreen: true, maxWarnings: 3 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockAuditData = {
    attempt: {
      id: 'att-100',
      status: 'SUBMITTED' as any,
      startedAt: new Date().toISOString(),
      deadlineAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      proctoringPassed: true,
      preflightData: { latencyMs: 38, downloadMbps: 15.4, uploadMbps: 4.2, fullscreenSupported: true },
      flaggedForReview: true,
      studentExplanation: 'A system popup minimized the exam for 2 seconds.',
    },
    assessment: {
      id: 'as-100',
      title: 'Science Diagnostic Test',
      enableProctoring: true,
      monitoringConfig: { requireFullscreen: true },
    },
    student: {
      id: 'st-100',
      admissionNumber: 'ADM-2026-99',
      rollNumber: '12',
      firstName: 'Rahul',
      lastName: 'Sharma',
    },
    events: [
      {
        id: 'ev-1',
        eventType: ViolationEventType.FULLSCREEN_EXIT,
        timestamp: new Date().toISOString(),
        durationMs: 2500,
        dismissed: false,
        createdAt: new Date().toISOString(),
      },
    ],
    summary: {
      totalEvents: 1,
      activeViolations: 1,
      eventCounts: { [ViolationEventType.FULLSCREEN_EXIT]: 1 },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders student details, preflight telemetry, and violation timeline', async () => {
    (examinationApi.getAttemptIntegrityAudit as any).mockResolvedValue(mockAuditData);

    render(
      <AssessmentIntegrityAuditModal
        assessment={mockAssessment}
        attemptId="att-100"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Rahul Sharma')).toBeInTheDocument();
      expect(screen.getByText(/ADM-2026-99/)).toBeInTheDocument();
      expect(screen.getByText('38 ms')).toBeInTheDocument();
      expect(screen.getByText('15.4 Mbps')).toBeInTheDocument();
      expect(screen.getByText('4.2 Mbps')).toBeInTheDocument();
      expect(screen.getByText('Fullscreen Exited')).toBeInTheDocument();
      expect(screen.getByText(/A system popup minimized/)).toBeInTheDocument();
    });
  });

  it('allows dismissing violation events and calls dismissViolationEvent API', async () => {
    (examinationApi.getAttemptIntegrityAudit as any).mockResolvedValue(mockAuditData);
    (examinationApi.dismissViolationEvent as any).mockResolvedValue({
      success: true,
      remainingActiveViolations: 0,
    });

    render(
      <AssessmentIntegrityAuditModal
        assessment={mockAssessment}
        attemptId="att-100"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Dismiss')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dismiss'));

    await waitFor(() => {
      expect(examinationApi.dismissViolationEvent).toHaveBeenCalledWith(
        'as-100',
        'att-100',
        'ev-1',
      );
    });
  });

  it('renders NETWORK_ANOMALY event badge and outage duration', async () => {
    const netAuditData = {
      ...mockAuditData,
      events: [
        {
          id: 'ev-net-1',
          eventType: ViolationEventType.NETWORK_ANOMALY,
          timestamp: new Date().toISOString(),
          durationMs: 8400,
          dismissed: false,
          createdAt: new Date().toISOString(),
        },
      ],
      summary: {
        totalEvents: 1,
        activeViolations: 1,
        eventCounts: { [ViolationEventType.NETWORK_ANOMALY]: 1 },
      },
    };
    (examinationApi.getAttemptIntegrityAudit as any).mockResolvedValue(netAuditData);

    render(
      <AssessmentIntegrityAuditModal
        assessment={mockAssessment}
        attemptId="att-100"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Network Disconnect')).toBeInTheDocument();
      expect(screen.getByText(/Duration: 8.4s/)).toBeInTheDocument();
    });
  });

  it('renders NO_FACE and MULTIPLE_FACES pilot event badges and camera telemetry', async () => {
    const faceAuditData = {
      ...mockAuditData,
      attempt: {
        ...mockAuditData.attempt,
        preflightData: {
          ...mockAuditData.attempt.preflightData,
          cameraTested: true,
        },
      },
      events: [
        {
          id: 'ev-face-1',
          eventType: ViolationEventType.NO_FACE,
          timestamp: new Date().toISOString(),
          durationMs: 10000,
          dismissed: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'ev-face-2',
          eventType: ViolationEventType.MULTIPLE_FACES,
          timestamp: new Date().toISOString(),
          durationMs: 5000,
          dismissed: false,
          createdAt: new Date().toISOString(),
        },
      ],
      summary: {
        totalEvents: 2,
        activeViolations: 2,
        eventCounts: {
          [ViolationEventType.NO_FACE]: 1,
          [ViolationEventType.MULTIPLE_FACES]: 1,
        },
      },
    };
    (examinationApi.getAttemptIntegrityAudit as any).mockResolvedValue(faceAuditData);

    render(
      <AssessmentIntegrityAuditModal
        assessment={mockAssessment}
        attemptId="att-100"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Face Absent (Pilot)')).toBeInTheDocument();
      expect(screen.getByText('Multiple Faces (Pilot)')).toBeInTheDocument();
      expect(screen.getByText('Tested & Ready')).toBeInTheDocument();
    });
  });

  it('renders SUSPICIOUS_AUDIO pilot event badge and mic telemetry', async () => {
    const audioAuditData = {
      ...mockAuditData,
      attempt: {
        ...mockAuditData.attempt,
        preflightData: {
          ...mockAuditData.attempt.preflightData,
          micTested: true,
          ambientBaselineDb: -42,
        },
      },
      events: [
        {
          id: 'ev-audio-1',
          eventType: ViolationEventType.SUSPICIOUS_AUDIO,
          timestamp: new Date().toISOString(),
          durationMs: 4200,
          dismissed: false,
          createdAt: new Date().toISOString(),
        },
      ],
      summary: {
        totalEvents: 1,
        activeViolations: 1,
        eventCounts: {
          [ViolationEventType.SUSPICIOUS_AUDIO]: 1,
        },
      },
    };
    (examinationApi.getAttemptIntegrityAudit as any).mockResolvedValue(audioAuditData);

    render(
      <AssessmentIntegrityAuditModal
        assessment={mockAssessment}
        attemptId="att-100"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Suspicious Audio (Pilot)')).toBeInTheDocument();
      expect(screen.getByText('-42 dB')).toBeInTheDocument();
    });
  });

  it('renders locked status and requires confirmation before teacher unlocks attempt', async () => {
    const lockedAuditData = {
      ...mockAuditData,
      attempt: {
        ...mockAuditData.attempt,
        isLocked: true,
        activeMisconductViolations: 3,
        maxAllowed: 3,
      },
      summary: {
        totalEvents: 3,
        activeViolations: 3,
        activeMisconductViolations: 3,
        maxAllowed: 3,
        isLocked: true,
        eventCounts: {
          [ViolationEventType.FULLSCREEN_EXIT]: 3,
        },
      },
    };

    (examinationApi.getAttemptIntegrityAudit as any).mockResolvedValue(lockedAuditData);
    (examinationApi.unlockAttempt as any).mockResolvedValue({
      success: true,
      message: 'Attempt unlocked',
      isLocked: false,
    });

    render(
      <AssessmentIntegrityAuditModal
        assessment={mockAssessment}
        attemptId="att-100"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Locked (Threshold Reached)')).toBeInTheDocument();
      expect(screen.getByText('Student Attempt is Currently Locked')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /unlock attempt/i })).toBeInTheDocument();
    });

    // 1. Initial click prompts confirmation
    fireEvent.click(screen.getByRole('button', { name: /unlock attempt/i }));

    expect(screen.getByText('Confirm Unlocking Attempt?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm unlock/i })).toBeInTheDocument();
    expect(examinationApi.unlockAttempt).not.toHaveBeenCalled();

    // 2. Clicking Confirm Unlock triggers the API
    fireEvent.click(screen.getByRole('button', { name: /confirm unlock/i }));

    await waitFor(() => {
      expect(examinationApi.unlockAttempt).toHaveBeenCalledWith('as-100', 'att-100');
    });
  });

  it('cancels unlock confirmation safely without triggering unlock API', async () => {
    const lockedAuditData = {
      ...mockAuditData,
      attempt: {
        ...mockAuditData.attempt,
        isLocked: true,
        activeMisconductViolations: 3,
        maxAllowed: 3,
      },
      summary: {
        totalEvents: 3,
        activeViolations: 3,
        activeMisconductViolations: 3,
        maxAllowed: 3,
        isLocked: true,
        eventCounts: {
          [ViolationEventType.FULLSCREEN_EXIT]: 3,
        },
      },
    };

    (examinationApi.getAttemptIntegrityAudit as any).mockResolvedValue(lockedAuditData);

    render(
      <AssessmentIntegrityAuditModal
        assessment={mockAssessment}
        attemptId="att-100"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /unlock attempt/i })).toBeInTheDocument();
    });

    // Click Unlock Attempt
    fireEvent.click(screen.getByRole('button', { name: /unlock attempt/i }));
    expect(screen.getByText('Confirm Unlocking Attempt?')).toBeInTheDocument();

    // Click Cancel
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText('Confirm Unlocking Attempt?')).not.toBeInTheDocument();
    expect(examinationApi.unlockAttempt).not.toHaveBeenCalled();
  });
});
