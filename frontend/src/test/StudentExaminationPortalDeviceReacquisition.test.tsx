import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudentExaminationPortal } from '../components/StudentExaminationPortal';
import {
  AssessmentMode,
  AttemptStatus,
} from '../services/examination.api';
import faceDetectionService from '../services/faceDetection.service';
import audioMonitoringService from '../services/audioMonitoring.service';

const mockExaminationApi = vi.hoisted(() => ({
  listStudentAssessments: vi.fn(),
  startAssessment: vi.fn(),
  getAttempt: vi.fn(),
  saveAnswer: vi.fn(),
  submitAttempt: vi.fn(),
  completePreflight: vi.fn(),
  testBandwidthSpeed: vi.fn(),
  recordViolationEvent: vi.fn(),
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
    startNoiseMonitor: vi.fn(),
    stopNoiseMonitor: vi.fn(),
    stopMicrophoneStream: vi.fn(),
    processSample: vi.fn(),
  },
  audioMonitoringService: {
    requestMicrophoneStream: vi.fn(),
    getStreamDeviceLabel: vi.fn().mockReturnValue('Default Microphone'),
    calibrateAmbientBaseline: vi.fn(),
    startNoiseMonitor: vi.fn(),
    stopNoiseMonitor: vi.fn(),
    stopMicrophoneStream: vi.fn(),
    processSample: vi.fn(),
  },
}));

describe('Resumed Attempt Monitoring Device Reacquisition', () => {
  const mockCameraTrack = { stop: vi.fn() };
  const mockCameraStream = {
    getVideoTracks: vi.fn().mockReturnValue([mockCameraTrack]),
    getTracks: vi.fn().mockReturnValue([mockCameraTrack]),
  } as unknown as MediaStream;

  const mockMicTrack = { stop: vi.fn() };
  const mockMicStream = {
    getAudioTracks: vi.fn().mockReturnValue([mockMicTrack]),
    getTracks: vi.fn().mockReturnValue([mockMicTrack]),
  } as unknown as MediaStream;

  const mockAssessment = {
    id: 'as-proctor-resume',
    title: 'Advanced Chemistry Midterm',
    subject: 'Chemistry',
    mode: AssessmentMode.NORMAL_QUIZ,
    totalMarks: 50,
    passingMarks: 20,
    durationMinutes: 45,
    hasAttempt: true,
    attemptId: 'att-chem-1',
    attemptStatus: AttemptStatus.IN_PROGRESS,
    enableProctoring: true,
    monitoringConfig: {
      requireFullscreen: true,
      detectTabSwitch: true,
      requireWebcam: true,
      requireMic: true,
      maxWarnings: 3,
    },
  };

  const mockAttempt = {
    id: 'att-chem-1',
    assessmentId: 'as-proctor-resume',
    assessmentTitle: 'Advanced Chemistry Midterm',
    status: AttemptStatus.IN_PROGRESS,
    startedAt: new Date(Date.now() - 600000).toISOString(),
    deadlineAt: new Date(Date.now() + 2100000).toISOString(),
    proctoringPassed: true, // Passed initial preflight in earlier session
    preflightData: {
      cameraTested: true,
      micTested: true,
      ambientBaselineDb: -42,
    },
    enableProctoring: true,
    monitoringConfig: {
      requireWebcam: true,
      requireMic: true,
      maxWarnings: 3,
    },
    questions: [
      {
        id: 'q-chem-1',
        sectionId: 'sec-1',
        orderIndex: 1,
        questionText: 'What is the pH of pure water at 25°C?',
        options: ['5', '7', '9'],
        marks: 2,
        hasImage: false,
        imageUrl: null,
      },
    ],
    answers: { 'q-chem-1': 1 }, // Student already selected Option B (7)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_ENABLE_EXAM_PROCTORING', 'true');
    vi.stubEnv('VITE_ENABLE_EXAM_WEBCAM', 'true');
    vi.stubEnv('VITE_ENABLE_EXAM_MIC', 'true');
    vi.stubEnv('VITE_ENABLE_EXAM_LIVENESS', 'false');

    (mockExaminationApi.listStudentAssessments as any).mockResolvedValue([mockAssessment]);
    (mockExaminationApi.getAttempt as any).mockResolvedValue(mockAttempt);
    (mockExaminationApi.completePreflight as any).mockResolvedValue({ success: true });
    (faceDetectionService.requestCameraStream as any).mockResolvedValue(mockCameraStream);
    (audioMonitoringService.requestMicrophoneStream as any).mockResolvedValue(mockMicStream);
    (audioMonitoringService.calibrateAmbientBaseline as any).mockResolvedValue({
      baselineDb: -42,
      noiseFloorRms: 0.01,
      durationMs: 3000,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('routes resumed attempt with missing streams to device reconnect screen instead of entering runner directly', async () => {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByText('Advanced Chemistry Midterm')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /resume in-progress attempt/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /resume in-progress attempt/i }));

    // Does NOT jump directly into runner without active streams
    await waitFor(() => {
      expect(screen.getByText('Reconnect Required Monitoring Devices')).toBeInTheDocument();
      expect(screen.getByText(/Resuming In-Progress Examination/i)).toBeInTheDocument();
      expect(screen.getByText(/previously saved answers and remaining timer are preserved/i)).toBeInTheDocument();
    });

    // The runner question is NOT yet visible
    expect(screen.queryByText('What is the pH of pure water at 25°C?')).not.toBeInTheDocument();

    // Verify permission was NOT requested yet (waiting for explicit student click)
    expect(faceDetectionService.requestCameraStream).not.toHaveBeenCalled();
    expect(audioMonitoringService.requestMicrophoneStream).not.toHaveBeenCalled();
  });

  it('requests device streams only when student explicitly clicks device-specific buttons', async () => {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resume in-progress attempt/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /resume in-progress attempt/i }));

    await waitFor(() => {
      expect(screen.getByText('Reconnect Required Monitoring Devices')).toBeInTheDocument();
    });

    // 1. Explicitly test camera
    const testCameraBtn = screen.getByRole('button', { name: /test camera & preview/i });
    fireEvent.click(testCameraBtn);

    await waitFor(() => {
      expect(faceDetectionService.requestCameraStream).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Camera Active & Verified/i)).toBeInTheDocument();
    });
    expect(audioMonitoringService.requestMicrophoneStream).not.toHaveBeenCalled();

    // 2. Explicitly test and calibrate microphone
    const testMicBtn = screen.getByRole('button', { name: /test microphone & calibrate/i });
    fireEvent.click(testMicBtn);

    await waitFor(() => {
      expect(audioMonitoringService.requestMicrophoneStream).toHaveBeenCalledTimes(1);
      expect(audioMonitoringService.calibrateAmbientBaseline).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Room Noise Floor Calibrated/i)).toBeInTheDocument();
    });
  });

  it('allows proceeding with approved exemption if a device fails or has accommodation', async () => {
    // Simulate camera and mic permission failures
    (faceDetectionService.requestCameraStream as any).mockRejectedValueOnce(
      new Error('Camera hardware disconnected'),
    );
    (audioMonitoringService.requestMicrophoneStream as any).mockRejectedValueOnce(
      new Error('Microphone permission denied'),
    );

    render(<StudentExaminationPortal />);
    await waitFor(() => screen.getByRole('button', { name: /resume in-progress attempt/i }));
    fireEvent.click(screen.getByRole('button', { name: /resume in-progress attempt/i }));

    await waitFor(() => screen.getByText('Reconnect Required Monitoring Devices'));

    // Click test camera -> fails with error message
    fireEvent.click(screen.getByRole('button', { name: /test camera & preview/i }));

    await waitFor(() => {
      expect(screen.getByText(/Camera hardware disconnected/i)).toBeInTheDocument();
    });

    // Check camera exemption checkbox
    const cameraExemptionCheckbox = screen.getByRole('checkbox', {
      name: /approved accommodation to proceed without webcam monitoring/i,
    });
    fireEvent.click(cameraExemptionCheckbox);

    // Click test microphone -> fails with error message
    fireEvent.click(screen.getByRole('button', { name: /test microphone & calibrate/i }));

    await waitFor(() => {
      expect(screen.getByText(/Microphone permission denied/i)).toBeInTheDocument();
    });

    // Also check mic exemption
    const micExemptionCheckbox = screen.getByRole('checkbox', {
      name: /approved accommodation to proceed without microphone monitoring/i,
    });
    fireEvent.click(micExemptionCheckbox);

    // Now resume button is enabled
    const resumeBtn = screen.getByRole('button', { name: /reconnect & resume examination/i });
    expect(resumeBtn).not.toBeDisabled();
    fireEvent.click(resumeBtn);

    // Enters runner with saved answer intact
    await waitFor(() => {
      expect(screen.getByText('What is the pH of pure water at 25°C?')).toBeInTheDocument();
    });
    const optionB = screen.getByRole('radio', { name: /7/i });
    expect(optionB).toBeChecked();
  });

  it('enters runner with active streams and preserves existing answers and time', async () => {
    render(<StudentExaminationPortal />);
    await waitFor(() => screen.getByRole('button', { name: /resume in-progress attempt/i }));
    fireEvent.click(screen.getByRole('button', { name: /resume in-progress attempt/i }));

    await waitFor(() => screen.getByText('Reconnect Required Monitoring Devices'));

    // Reconnect camera & mic
    fireEvent.click(screen.getByRole('button', { name: /test camera & preview/i }));
    await waitFor(() => screen.getByText(/Camera Active & Verified/i));

    fireEvent.click(screen.getByRole('button', { name: /test microphone & calibrate/i }));
    await waitFor(() => screen.getByText(/Room Noise Floor Calibrated/i));

    const resumeBtn = screen.getByRole('button', { name: /reconnect & resume examination/i });
    expect(resumeBtn).not.toBeDisabled();
    fireEvent.click(resumeBtn);

    // Verifies examination runner is active
    await waitFor(() => {
      expect(screen.getByText('What is the pH of pure water at 25°C?')).toBeInTheDocument();
    });

    // Verifies previously saved answer is preserved
    const optionB = screen.getByRole('radio', { name: /7/i });
    expect(optionB).toBeChecked();

    // Verifies audio monitor was started with re-attached stream
    expect(audioMonitoringService.startNoiseMonitor).toHaveBeenCalled();
  });

  it('stops media tracks on Cancel & Exit and safely returns to dashboard', async () => {
    render(<StudentExaminationPortal />);
    await waitFor(() => screen.getByRole('button', { name: /resume in-progress attempt/i }));
    fireEvent.click(screen.getByRole('button', { name: /resume in-progress attempt/i }));

    await waitFor(() => screen.getByText('Reconnect Required Monitoring Devices'));

    // Connect camera
    fireEvent.click(screen.getByRole('button', { name: /test camera & preview/i }));
    await waitFor(() => screen.getByText(/Camera Active & Verified/i));

    // Student cancels and exits
    const cancelBtn = screen.getByRole('button', { name: /cancel & exit/i });
    fireEvent.click(cancelBtn);

    // Verify stream tracks were stopped
    await waitFor(() => {
      expect(faceDetectionService.stopCameraStream).toHaveBeenCalled();
      expect(screen.getByText('Advanced Chemistry Midterm')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /resume in-progress attempt/i })).toBeInTheDocument();
    });
  });
});
