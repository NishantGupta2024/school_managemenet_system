import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudentExaminationPortal } from '../components/StudentExaminationPortal';
import {
  AssessmentMode,
  AttemptStatus,
} from '../services/examination.api';
import faceDetectionService from '../services/faceDetection.service';
import livenessDetectionService from '../services/livenessDetection.service';

const mockExaminationApi = vi.hoisted(() => ({
  listStudentAssessments: vi.fn(),
  startAssessment: vi.fn(),
  getAttempt: vi.fn(),
  completePreflight: vi.fn(),
  saveAnswer: vi.fn(),
  testBandwidthSpeed: vi.fn().mockResolvedValue({
    latencyMs: 18,
    downloadMbps: 25.4,
    uploadMbps: 12.1,
    bandwidthStatus: 'OPTIMAL',
  }),
  recordViolationEvent: vi.fn(),
  recordAnomalyDuration: vi.fn(),
  submitAttempt: vi.fn(),
  getStudentAssessmentResult: vi.fn(),
  getStudentProgressions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/examination.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/examination.api')>();
  return {
    ...actual,
    examinationApi: mockExaminationApi,
    default: mockExaminationApi,
  };
});

vi.mock('../services/faceDetection.service', () => ({
  default: {
    requestCameraStream: vi.fn(),
    listVideoDevices: vi.fn().mockResolvedValue([]),
    getStreamDeviceLabel: vi.fn().mockReturnValue('Integrated HD Webcam'),
    getDetector: vi.fn().mockResolvedValue({}),
    detectFaces: vi.fn().mockReturnValue({ faceCount: 1, confidences: [0.9] }),
    stopCameraStream: vi.fn(),
  },
  faceDetectionService: {
    requestCameraStream: vi.fn(),
    listVideoDevices: vi.fn().mockResolvedValue([]),
    getStreamDeviceLabel: vi.fn().mockReturnValue('Integrated HD Webcam'),
    getDetector: vi.fn().mockResolvedValue({}),
    detectFaces: vi.fn().mockReturnValue({ faceCount: 1, confidences: [0.9] }),
    stopCameraStream: vi.fn(),
  },
}));

vi.mock('../services/audioMonitoring.service', () => ({
  default: {
    requestMicrophoneStream: vi.fn(),
    getStreamDeviceLabel: vi.fn().mockReturnValue('Default Microphone'),
    calibrateAmbientBaseline: vi.fn(),
    stopMicrophoneStream: vi.fn(),
  },
  audioMonitoringService: {
    requestMicrophoneStream: vi.fn(),
    getStreamDeviceLabel: vi.fn().mockReturnValue('Default Microphone'),
    calibrateAmbientBaseline: vi.fn(),
    stopMicrophoneStream: vi.fn(),
  },
}));

describe('Student Examination Portal - Active Liveness Check Pilot', () => {
  const mockCameraStream = {
    getTracks: vi.fn(() => [
      {
        stop: vi.fn(),
        kind: 'video',
      },
    ]),
  } as unknown as MediaStream;

  const mockAssessment = {
    id: 'as-liveness-pilot',
    title: 'Biology Integrity Pilot Exam',
    subject: 'Biology',
    mode: AssessmentMode.LIVE_EXAM,
    status: 'ACTIVE',
    hasAttempt: true,
    attemptId: 'att-liveness-1',
    attemptStatus: AttemptStatus.IN_PROGRESS,
    enableProctoring: true,
    monitoringConfig: {
      requireWebcam: true,
      requireMic: false,
      maxWarnings: 3,
    },
  };

  const mockAttempt = {
    id: 'att-liveness-1',
    assessmentId: 'as-liveness-pilot',
    assessmentTitle: 'Biology Integrity Pilot Exam',
    status: AttemptStatus.IN_PROGRESS,
    startedAt: new Date(Date.now() - 60000).toISOString(),
    deadlineAt: new Date(Date.now() + 3600000).toISOString(),
    proctoringPassed: false,
    enableProctoring: true,
    monitoringConfig: {
      requireWebcam: true,
      requireMic: false,
      maxWarnings: 3,
    },
    questions: [
      {
        id: 'q-bio-1',
        sectionId: 'sec-1',
        orderIndex: 1,
        questionText: 'What is the basic unit of life?',
        options: ['Atom', 'Cell', 'Tissue'],
        marks: 1,
        hasImage: false,
        imageUrl: null,
      },
    ],
    answers: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_ENABLE_EXAM_PROCTORING', 'true');
    vi.stubEnv('VITE_ENABLE_EXAM_WEBCAM', 'true');
    vi.stubEnv('VITE_ENABLE_EXAM_MIC', 'false');
    vi.stubEnv('VITE_ENABLE_EXAM_LIVENESS', 'true');

    (mockExaminationApi.listStudentAssessments as any).mockResolvedValue([mockAssessment]);
    (mockExaminationApi.getAttempt as any).mockResolvedValue(mockAttempt);
    (mockExaminationApi.completePreflight as any).mockResolvedValue({ success: true, proctoringPassed: true });
    (faceDetectionService.requestCameraStream as any).mockResolvedValue(mockCameraStream);
    (faceDetectionService.getDetector as any).mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders liveness check card when flag is on, but requests camera stream ONLY on explicit click', async () => {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Biology Integrity Pilot Exam')).toBeInTheDocument();
    });

    const startBtn = screen.getByRole('button', { name: /resume in-progress attempt/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText('Exam Security & Readiness Pre-Flight')).toBeInTheDocument();
    });

    // Camera is NOT requested automatically upon entering preflight
    expect(faceDetectionService.requestCameraStream).not.toHaveBeenCalled();

    // Explicitly click Test Camera
    const testCameraBtn = screen.getByRole('button', { name: /test camera & preview/i });
    fireEvent.click(testCameraBtn);

    await waitFor(() => {
      expect(faceDetectionService.requestCameraStream).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Camera Active & Verified/i)).toBeInTheDocument();
      // Liveness section is now rendered
      expect(screen.getByText('Active Liveness Verification (Pilot)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /begin liveness check/i })).toBeInTheDocument();
    });
  });

  it('displays randomized challenge, succeeds on detected head turn, and completes preflight with minimal privacy payload', async () => {
    // Mock session creation to simulate a successful session
    vi.spyOn(livenessDetectionService, 'createSession').mockImplementation((_video, callbacks, challenge) => {
      return {
        getChallengeType: () => challenge || 'TURN_LEFT',
        getStatus: () => 'PASSED',
        start: vi.fn(() => {
          callbacks.onStatusChange?.('CHALLENGE_ACTIVE');
          callbacks.onInstruction?.('Turn your head slightly to your left');
          callbacks.onProgress?.(50, 3500);
          // Simulate instant success
          callbacks.onStatusChange?.('PASSED');
          callbacks.onInstruction?.('Liveness confirmed!');
          callbacks.onComplete?.({
            passed: true,
            challengeType: challenge || 'TURN_LEFT',
            durationMs: 1200,
            timestamp: '2026-11-13T00:00:00.000Z',
          });
        }),
        stop: vi.fn(),
        destroy: vi.fn(),
      } as any;
    });

    render(<StudentExaminationPortal />);
    await waitFor(() => screen.getByRole('button', { name: /resume in-progress attempt/i }));
    fireEvent.click(screen.getByRole('button', { name: /resume in-progress attempt/i }));

    await waitFor(() => screen.getByRole('button', { name: /test camera & preview/i }));
    fireEvent.click(screen.getByRole('button', { name: /test camera & preview/i }));

    await waitFor(() => screen.getByRole('button', { name: /begin liveness check/i }));
    fireEvent.click(screen.getByRole('button', { name: /begin liveness check/i }));

    await waitFor(() => {
      expect(screen.getByText('Liveness Confirmed')).toBeInTheDocument();
    });

    // Check consent checkbox
    const consentCheckbox = screen.getByRole('checkbox', {
      name: /i acknowledge that this examination is monitored for fullscreen integrity/i,
    });
    fireEvent.click(consentCheckbox);

    // Enter exam button should now be enabled
    const enterBtn = screen.getByRole('button', {
      name: /reconnect & resume examination|consent & enter fullscreen exam/i,
    });
    expect(enterBtn).not.toBeDisabled();
    fireEvent.click(enterBtn);

    // Verify completePreflight called with minimal privacy payload (NO images, NO landmarks)
    await waitFor(() => {
      expect(mockExaminationApi.completePreflight).toHaveBeenCalledTimes(1);
    });

    const preflightCallArg = (mockExaminationApi.completePreflight as any).mock.calls[0][1];
    expect(preflightCallArg.cameraTested).toBe(true);
    expect(preflightCallArg.livenessPassed).toBe(true);
    expect(preflightCallArg.livenessChallenge).toBeDefined();
    expect(preflightCallArg.livenessTimestamp).toBe('2026-11-13T00:00:00.000Z');

    // Strict privacy verification: Ensure zero biometric / image keys
    expect(preflightCallArg.images).toBeUndefined();
    expect(preflightCallArg.landmarks).toBeUndefined();
    expect(preflightCallArg.frames).toBeUndefined();
    expect(preflightCallArg.embeddings).toBeUndefined();
    expect(preflightCallArg.photo).toBeUndefined();

    // Exam runner renders
    await waitFor(() => {
      expect(screen.getByText('What is the basic unit of life?')).toBeInTheDocument();
    });
  });

  it('handles liveness timeout and provides both Retry and approved Accommodation options without terminating exam', async () => {
    vi.spyOn(livenessDetectionService, 'createSession').mockImplementation((_video, callbacks, challenge) => {
      return {
        getChallengeType: () => challenge || 'TURN_RIGHT',
        getStatus: () => 'FAILED_TIMEOUT',
        start: vi.fn(() => {
          callbacks.onStatusChange?.('FAILED_TIMEOUT');
          callbacks.onInstruction?.('Liveness check timed out. Movement was not detected.');
          callbacks.onComplete?.({
            passed: false,
            challengeType: challenge || 'TURN_RIGHT',
            durationMs: 7000,
            timestamp: '2026-11-13T00:00:00.000Z',
            reason: 'Timeout: head turn was not detected within time limit',
          });
        }),
        stop: vi.fn(),
        destroy: vi.fn(),
      } as any;
    });

    render(<StudentExaminationPortal />);
    await waitFor(() => screen.getByRole('button', { name: /resume in-progress attempt/i }));
    fireEvent.click(screen.getByRole('button', { name: /resume in-progress attempt/i }));

    await waitFor(() => screen.getByRole('button', { name: /test camera & preview/i }));
    fireEvent.click(screen.getByRole('button', { name: /test camera & preview/i }));

    await waitFor(() => screen.getByRole('button', { name: /begin liveness check/i }));
    fireEvent.click(screen.getByRole('button', { name: /begin liveness check/i }));

    // Verify error and retry options appear
    await waitFor(() => {
      expect(screen.getByText(/Liveness check timed out/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry liveness check/i })).toBeInTheDocument();
      expect(
        screen.getByRole('checkbox', {
          name: /approved accommodation to proceed without liveness verification/i,
        }),
      ).toBeInTheDocument();
    });

    // Enter exam button is initially disabled because liveness was neither passed nor exempted
    const enterBtn = screen.getByRole('button', {
      name: /reconnect & resume examination|consent & enter fullscreen exam/i,
    });
    expect(enterBtn).toBeDisabled();

    // Student checks approved accommodation
    const exemptionCheckbox = screen.getByRole('checkbox', {
      name: /approved accommodation to proceed without liveness verification/i,
    });
    fireEvent.click(exemptionCheckbox);

    // Now button becomes enabled
    await waitFor(() => {
      expect(enterBtn).not.toBeDisabled();
    });
    fireEvent.click(enterBtn);

    await waitFor(() => {
      expect(mockExaminationApi.completePreflight).toHaveBeenCalledTimes(1);
    });

    const payload = (mockExaminationApi.completePreflight as any).mock.calls[0][1];
    expect(payload.livenessPassed).toBe(false);
    expect(payload.livenessExemptionAcknowledged).toBe(true);

    // Exam runner opens safely
    await waitFor(() => {
      expect(screen.getByText('What is the basic unit of life?')).toBeInTheDocument();
    });
  });

  it('stops camera stream tracks and cleans up liveness session on Cancel & Exit', async () => {
    const destroySpy = vi.fn();
    vi.spyOn(livenessDetectionService, 'createSession').mockReturnValue({
      getChallengeType: () => 'TURN_LEFT',
      getStatus: () => 'IDLE',
      start: vi.fn(),
      stop: vi.fn(),
      destroy: destroySpy,
    } as any);

    render(<StudentExaminationPortal />);
    await waitFor(() => screen.getByRole('button', { name: /resume in-progress attempt/i }));
    fireEvent.click(screen.getByRole('button', { name: /resume in-progress attempt/i }));

    await waitFor(() => screen.getByRole('button', { name: /test camera & preview/i }));
    fireEvent.click(screen.getByRole('button', { name: /test camera & preview/i }));

    await waitFor(() => screen.getByRole('button', { name: /begin liveness check/i }));
    fireEvent.click(screen.getByRole('button', { name: /begin liveness check/i }));

    // Click Cancel & Exit
    const cancelBtn = screen.getByRole('button', { name: /cancel & exit/i });
    fireEvent.click(cancelBtn);

    // Returns to dashboard and stops tracks
    await waitFor(() => {
      expect(faceDetectionService.stopCameraStream).toHaveBeenCalledWith(mockCameraStream);
      expect(destroySpy).toHaveBeenCalled();
      expect(screen.getByText('Biology Integrity Pilot Exam')).toBeInTheDocument();
    });
  });
});
