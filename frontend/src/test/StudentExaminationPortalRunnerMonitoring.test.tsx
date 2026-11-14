import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { StudentExaminationPortal } from '../components/StudentExaminationPortal';
import {
  AssessmentMode,
  AttemptStatus,
  ViolationEventType,
} from '../services/examination.api';
import faceDetectionService from '../services/faceDetection.service';
import audioMonitoringService, { NoiseMonitorCallbacks } from '../services/audioMonitoring.service';

const mockExaminationApi = vi.hoisted(() => ({
  listStudentAssessments: vi.fn(),
  startAssessment: vi.fn(),
  getAttempt: vi.fn(),
  saveAnswer: vi.fn(),
  submitAttempt: vi.fn(),
  completePreflight: vi.fn(),
  testBandwidthSpeed: vi.fn(),
  recordViolationEvent: vi.fn(),
  getStudentAssessmentResult: vi.fn(),
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
    listVideoDevices: vi.fn().mockResolvedValue([
      { deviceId: 'cam-1', label: 'Integrated FHD Webcam' },
      { deviceId: 'cam-2', label: 'External USB Camera' },
    ]),
    getStreamDeviceLabel: vi.fn().mockReturnValue('Integrated FHD Webcam'),
    getDetector: vi.fn().mockResolvedValue({}),
    detectFaces: vi.fn().mockReturnValue({ faceCount: 1, confidences: [0.95], timestampMs: 1000 }),
    stopCameraStream: vi.fn(),
  },
  faceDetectionService: {
    requestCameraStream: vi.fn(),
    listVideoDevices: vi.fn().mockResolvedValue([
      { deviceId: 'cam-1', label: 'Integrated FHD Webcam' },
      { deviceId: 'cam-2', label: 'External USB Camera' },
    ]),
    getStreamDeviceLabel: vi.fn().mockReturnValue('Integrated FHD Webcam'),
    getDetector: vi.fn().mockResolvedValue({}),
    detectFaces: vi.fn().mockReturnValue({ faceCount: 1, confidences: [0.95], timestampMs: 1000 }),
    stopCameraStream: vi.fn(),
  },
}));

vi.mock('../services/audioMonitoring.service', () => ({
  default: {
    requestMicrophoneStream: vi.fn(),
    getStreamDeviceLabel: vi.fn().mockReturnValue('Realtek HD Audio Microphone'),
    calibrateAmbientBaseline: vi.fn(),
    startNoiseMonitor: vi.fn(),
    stopNoiseMonitor: vi.fn(),
    stopMicrophoneStream: vi.fn(),
    processSample: vi.fn(),
  },
  audioMonitoringService: {
    requestMicrophoneStream: vi.fn(),
    getStreamDeviceLabel: vi.fn().mockReturnValue('Realtek HD Audio Microphone'),
    calibrateAmbientBaseline: vi.fn(),
    startNoiseMonitor: vi.fn(),
    stopNoiseMonitor: vi.fn(),
    stopMicrophoneStream: vi.fn(),
    processSample: vi.fn(),
  },
}));

describe('StudentExaminationPortal Runner Live Monitoring (Camera, NO_FACE, Temporary Pause & Audio)', () => {
  const mockCameraTrack = {
    stop: vi.fn(),
    label: 'Integrated FHD Webcam',
    getSettings: () => ({ deviceId: 'cam-1' }),
  };
  const mockCameraStream = {
    getVideoTracks: vi.fn().mockReturnValue([mockCameraTrack]),
    getTracks: vi.fn().mockReturnValue([mockCameraTrack]),
  } as unknown as MediaStream;

  const mockMicTrack = {
    stop: vi.fn(),
    label: 'Realtek HD Audio Microphone',
  };
  const mockMicStream = {
    getAudioTracks: vi.fn().mockReturnValue([mockMicTrack]),
    getTracks: vi.fn().mockReturnValue([mockMicTrack]),
  } as unknown as MediaStream;

  const mockAssessment = {
    id: 'as-live-runner-1',
    title: 'Physics Live Pilot Exam',
    subject: 'Physics',
    mode: AssessmentMode.LIVE_EXAM,
    totalMarks: 20,
    passingMarks: 10,
    durationMinutes: 30,
    hasAttempt: true,
    attemptId: 'att-phys-1',
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
    id: 'att-phys-1',
    assessmentId: 'as-live-runner-1',
    assessmentTitle: 'Physics Live Pilot Exam',
    status: AttemptStatus.IN_PROGRESS,
    startedAt: new Date(Date.now() - 120000).toISOString(),
    deadlineAt: new Date(Date.now() + 1680000).toISOString(),
    remainingSeconds: 1680,
    proctoringPassed: false,
    enableProctoring: true,
    monitoringConfig: {
      requireWebcam: true,
      requireMic: true,
      maxWarnings: 3,
    },
    questions: [
      {
        id: 'q-phys-1',
        sectionId: 'sec-1',
        orderIndex: 1,
        questionText: 'What is the SI unit of force?',
        options: ['Joule', 'Newton', 'Watt', 'Pascal'],
        marks: 2,
        hasImage: false,
        imageUrl: null,
      },
      {
        id: 'q-phys-2',
        sectionId: 'sec-1',
        orderIndex: 2,
        questionText: 'What is the speed of light in vacuum?',
        options: ['3x10^8 m/s', '3x10^6 m/s', '3x10^5 m/s', '3x10^4 m/s'],
        marks: 2,
        hasImage: false,
        imageUrl: null,
      },
    ],
    answers: { 'q-phys-1': 1 }, // Option B ('Newton') already saved
  };

  let capturedAudioCallbacks: NoiseMonitorCallbacks | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedAudioCallbacks = null;
    mockAttempt.proctoringPassed = false;

    vi.stubEnv('VITE_ENABLE_EXAM_PROCTORING', 'true');
    vi.stubEnv('VITE_ENABLE_EXAM_WEBCAM', 'true');
    vi.stubEnv('VITE_ENABLE_EXAM_MIC', 'true');
    vi.stubEnv('VITE_ENABLE_EXAM_LIVENESS', 'false');

    // Ensure HTMLMediaElement readyState is >= 2 in JSDOM so 1 Hz detector loop executes
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      get: () => 4,
      configurable: true,
    });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

    (mockExaminationApi.listStudentAssessments as any).mockResolvedValue([mockAssessment]);
    (mockExaminationApi.getAttempt as any).mockResolvedValue(mockAttempt);
    (mockExaminationApi.completePreflight as any).mockResolvedValue({ success: true, proctoringPassed: true });
    (mockExaminationApi.saveAnswer as any).mockImplementation(async (_attId: string, _qId: string, body: any) => ({
      selectedOption: body.selectedOption,
    }));
    (mockExaminationApi.recordViolationEvent as any).mockResolvedValue({
      recorded: true,
      activeMisconductViolations: 1,
      totalViolations: 1,
      isLocked: false,
    });

    (faceDetectionService.requestCameraStream as any).mockResolvedValue(mockCameraStream);
    (faceDetectionService.getStreamDeviceLabel as any).mockReturnValue('Integrated FHD Webcam');
    (faceDetectionService.listVideoDevices as any).mockResolvedValue([
      { deviceId: 'cam-1', label: 'Integrated FHD Webcam' },
      { deviceId: 'cam-2', label: 'External USB Camera' },
    ]);
    (faceDetectionService.detectFaces as any).mockReturnValue({
      faceCount: 1,
      confidences: [0.95],
      timestampMs: 1000,
    });

    (audioMonitoringService.requestMicrophoneStream as any).mockResolvedValue(mockMicStream);
    (audioMonitoringService.getStreamDeviceLabel as any).mockReturnValue('Realtek HD Audio Microphone');
    (audioMonitoringService.calibrateAmbientBaseline as any).mockResolvedValue({
      baselineDb: -44,
      noiseFloorRms: 0.006,
      durationMs: 3000,
    });
    (audioMonitoringService.startNoiseMonitor as any).mockImplementation(
      (_stream: MediaStream, callbacks: NoiseMonitorCallbacks) => {
        capturedAudioCallbacks = callbacks;
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  async function enterRunnerWithCameraAndMic() {
    render(<StudentExaminationPortal />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resume in-progress attempt/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /resume in-progress attempt/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /test camera & preview/i })).toBeInTheDocument();
    });

    // Click camera test
    fireEvent.click(screen.getByRole('button', { name: /test camera & preview/i }));
    await waitFor(() => {
      expect(screen.getByTestId('preflight-camera-device-label')).toHaveTextContent('Integrated FHD Webcam');
    });

    // Click mic test
    fireEvent.click(screen.getByRole('button', { name: /test microphone & calibrate/i }));
    await waitFor(() => {
      expect(screen.getByTestId('preflight-mic-device-label')).toHaveTextContent('Realtek HD Audio Microphone');
      expect(screen.getByText(/-35 dBFS \(\+9 dB pilot threshold/i)).toBeInTheDocument();
    });

    // Consent & enter
    const consentBox = screen.getByRole('checkbox', {
      name: /i acknowledge that this examination is monitored for fullscreen integrity/i,
    });
    fireEvent.click(consentBox);

    const enterBtn = screen.getByRole('button', {
      name: /reconnect & resume examination|consent & enter fullscreen exam/i,
    });
    fireEvent.click(enterBtn);

    await waitFor(() => {
      expect(screen.getByText('What is the SI unit of force?')).toBeInTheDocument();
    });
  }

  it('displays active camera device label in preflight and runner, and keeps video mounted when PiP is minimized', async () => {
    await enterRunnerWithCameraAndMic();

    // Active camera device pill in top bar and PiP label
    expect(screen.getByTestId('runner-camera-status-pill')).toHaveTextContent('Integrated FHD Webcam');
    expect(screen.getByTestId('runner-pip-camera-label')).toHaveTextContent('Integrated FHD Webcam');
    expect(screen.getByTestId('runner-mic-status-pill')).toHaveTextContent('Mic Active');

    // Minimize PiP self-view
    const hideBtn = screen.getByRole('button', { name: 'Hide' });
    fireEvent.click(hideBtn);

    // Video element remains in DOM so 1 Hz face detection loop never stops
    const videos = document.querySelectorAll('video');
    expect(videos.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument();
  });

  it('temporarily pauses answer options & navigation on face absence, triggers exactly one NO_FACE event at 7s, and recovers after 2 consecutive positive samples', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await enterRunnerWithCameraAndMic();

    // Verify saved answer Option B ('Newton') is initially checked and enabled
    const optionA = screen.getByRole('radio', { name: /Option A: Joule/i });
    const optionB = screen.getByRole('radio', { name: /Option B: Newton/i });
    const nextBtn = screen.getByRole('button', { name: /Next/i });
    const paletteQ2 = screen.getByRole('button', { name: /Jump to Question 2/i });

    expect(optionB).toBeChecked();
    expect(optionA).not.toBeDisabled();
    expect(nextBtn).not.toBeDisabled();
    expect(paletteQ2).not.toBeDisabled();

    // Now simulate face absence (faceCount = 0)
    (faceDetectionService.detectFaces as any).mockReturnValue({
      faceCount: 0,
      confidences: [],
      timestampMs: 2000,
    });

    // Advance 1 second -> face absence detected on 1st sample
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Temporary pause overlay appears immediately and disables answer options + navigation
    expect(screen.getByTestId('face-absent-pause-overlay')).toBeInTheDocument();
    expect(screen.getByText(/Answer Options Temporarily Paused — Face Not Detected/i)).toBeInTheDocument();
    expect(optionA).toBeDisabled();
    expect(optionB).toBeDisabled();
    expect(nextBtn).toBeDisabled();
    expect(paletteQ2).toBeDisabled();

    // Saved answer Option B is still preserved!
    expect(optionB).toBeChecked();

    // Attempting to click Option A while paused does NOT call saveAnswer or change selection
    fireEvent.click(optionA);
    expect(mockExaminationApi.saveAnswer).not.toHaveBeenCalled();
    expect(optionB).toBeChecked();

    // Advance 5 more seconds (total 6 seconds of face absence) -> 3s advisory shown, but NO_FACE 7s event NOT yet fired
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText(/Camera Advisory \(Pilot\):/i)).toBeInTheDocument();
    expect(mockExaminationApi.recordViolationEvent).not.toHaveBeenCalledWith(
      'att-phys-1',
      ViolationEventType.NO_FACE,
      expect.anything(),
      expect.anything(),
    );

    // Advance 1 more second (total 7 seconds of face absence) -> triggers NO_FACE violation and 7s warning banner
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('no-face-7s-warning')).toBeInTheDocument();
    expect(mockExaminationApi.recordViolationEvent).toHaveBeenCalledTimes(1);
    expect(mockExaminationApi.recordViolationEvent).toHaveBeenCalledWith(
      'att-phys-1',
      ViolationEventType.NO_FACE,
      7000,
      { continuousSeconds: 7, pilotSetting: '7s' },
    );

    // Advance 3 more seconds of absence (seconds 8, 9, 10) -> latch prevents duplicate NO_FACE events
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(mockExaminationApi.recordViolationEvent).toHaveBeenCalledTimes(1);

    // Now test single positive frame (1st sample of faceCount = 1) -> does NOT yet unlock or reset latch
    (faceDetectionService.detectFaces as any).mockReturnValue({
      faceCount: 1,
      confidences: [0.92],
      timestampMs: 12000,
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('face-absent-pause-overlay')).toBeInTheDocument();
    expect(screen.getByText(/Recovery Check: 1 \/ 2/i)).toBeInTheDocument();
    expect(optionA).toBeDisabled();

    // 2nd consecutive positive frame -> immediately unlocks answer controls, clears NO_FACE warning, and resets latch!
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByTestId('face-absent-pause-overlay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('no-face-7s-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('face-recovery-banner')).toBeInTheDocument();
    expect(optionA).not.toBeDisabled();
    expect(nextBtn).not.toBeDisabled();
    expect(paletteQ2).not.toBeDisabled();
    expect(optionB).toBeChecked(); // Saved answer preserved

    // Verify latch was reset: another 7 seconds of face absence triggers a 2nd NO_FACE event
    (faceDetectionService.detectFaces as any).mockReturnValue({
      faceCount: 0,
      confidences: [],
      timestampMs: 20000,
    });
    await act(async () => {
      vi.advanceTimersByTime(7000);
    });
    expect(mockExaminationApi.recordViolationEvent).toHaveBeenCalledTimes(2);
  });

  it('displays Audio Advisory banner and logs SUSPICIOUS_AUDIO when background voice triggers noise monitor, without pausing answer controls', async () => {
    await enterRunnerWithCameraAndMic();
    expect(capturedAudioCallbacks).not.toBeNull();

    const optionA = screen.getByRole('radio', { name: /Option A: Joule/i });

    // Simulate speech samples with brief pause reaching 2500ms sustained duration
    act(() => {
      capturedAudioCallbacks?.onLevelSample?.({
        currentRms: 0.05,
        currentDb: -26,
        isAboveThreshold: true,
        sustainedDurationMs: 2500,
        peakDb: -24.5,
        thresholdDb: -35,
        baselineDb: -44,
      });
      capturedAudioCallbacks?.onSustainedNoiseDetected?.(2500, -24.5);
    });

    // Audio Advisory banner is visible
    await waitFor(() => {
      expect(screen.getByTestId('audio-advisory-banner')).toBeInTheDocument();
      expect(screen.getByText(/Sustained ambient sound or voice activity above threshold detected/i)).toBeInTheDocument();
    });

    // Verify a brief quiet sample immediately afterward does NOT hide the Audio Advisory banner (5s hold window)
    act(() => {
      capturedAudioCallbacks?.onLevelSample?.({
        currentRms: 0.004,
        currentDb: -48,
        isAboveThreshold: false,
        sustainedDurationMs: 2400,
        peakDb: -24.5,
        thresholdDb: -35,
        baselineDb: -44,
      });
    });
    expect(screen.getByTestId('audio-advisory-banner')).toBeInTheDocument();

    // Verify SUSPICIOUS_AUDIO violation was reported to backend
    expect(mockExaminationApi.recordViolationEvent).toHaveBeenCalledWith(
      'att-phys-1',
      ViolationEventType.SUSPICIOUS_AUDIO,
      2500,
      {
        ambientBaselineDb: -44,
        peakEventDb: -24.5,
        pilotSetting: '2.5s_delta9dB',
      },
    );

    // Verify microphone events and offline network state do NOT trigger face-absent answer pause
    expect(screen.queryByTestId('face-absent-pause-overlay')).not.toBeInTheDocument();
    expect(optionA).not.toBeDisabled();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.queryByTestId('face-absent-pause-overlay')).not.toBeInTheDocument();
    expect(optionA).not.toBeDisabled();
  });

  it('does not display dev HUD in student portal, while exposing dev diagnostics and safe camera resolution switching outside student UI', async () => {
    vi.stubEnv('VITE_ENABLE_EXAM_OBJECT_DETECTION', 'true');

    // Initial stream reports 320x240
    const track320 = {
      stop: vi.fn(),
      label: 'Integrated FHD Webcam',
      getSettings: () => ({ deviceId: 'cam-1', width: 320, height: 240 }),
    };
    const stream320 = {
      getVideoTracks: vi.fn().mockReturnValue([track320]),
      getTracks: vi.fn().mockReturnValue([track320]),
    } as unknown as MediaStream;

    (faceDetectionService.requestCameraStream as any).mockResolvedValue(stream320);

    await enterRunnerWithCameraAndMic();

    // Verify Dev HUD is NEVER rendered in the student portal DOM
    expect(screen.queryByTestId('dev-object-detection-hud')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dev-resolution-selector')).not.toBeInTheDocument();
    expect(screen.queryByText(/DEV DIAGNOSTIC HUD/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/RAW MODEL CANDIDATES/i)).not.toBeInTheDocument();

    // Verify developer diagnostics API is accessible outside the student UI
    const devApi = (window as any).__EXAM_DEV_OBJECT_DETECTION__;
    expect(devApi).toBeDefined();
    expect(devApi.getDiagnostics()).toBeDefined();
    expect(devApi.getDiagnostics().featureFlagEnabled).toBe(true);

    // Test 1: Switch to 640x480 with a delayed resolution to verify concurrent calls are blocked
    const track640 = {
      stop: vi.fn(),
      label: 'Integrated FHD Webcam',
      getSettings: () => ({ deviceId: 'cam-1', width: 640, height: 480 }),
    };
    const stream640 = {
      getVideoTracks: vi.fn().mockReturnValue([track640]),
      getTracks: vi.fn().mockReturnValue([track640]),
    } as unknown as MediaStream;

    let resolveStream640!: (s: MediaStream) => void;
    (faceDetectionService.requestCameraStream as any).mockImplementationOnce(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream640 = resolve;
        }),
    );

    const callsBeforeSwitch = (faceDetectionService.requestCameraStream as any).mock.calls.length;

    // Call switchResolution('640x480') twice rapidly -> second call must be ignored while first is in-flight
    act(() => {
      devApi.switchResolution('640x480');
      devApi.switchResolution('640x480');
    });

    expect((faceDetectionService.requestCameraStream as any).mock.calls.length).toBe(callsBeforeSwitch + 1);
    expect(faceDetectionService.stopCameraStream).toHaveBeenCalledWith(stream320);
    expect(faceDetectionService.requestCameraStream).toHaveBeenLastCalledWith({
      deviceId: { exact: 'cam-1' },
      width: { ideal: 640, max: 640 },
      height: { ideal: 480, max: 480 },
    });

    await act(async () => {
      resolveStream640(stream640);
    });

    await waitFor(() => {
      const diag = (window as any).__EXAM_DEV_OBJECT_DETECTION__.getDiagnostics();
      expect(diag.videoReadiness?.width).toBe(640);
      expect(diag.videoReadiness?.height).toBe(480);
    });

    // Test 2: Switch back to 320x240 (Default)
    (faceDetectionService.requestCameraStream as any).mockResolvedValueOnce(stream320);
    await act(async () => {
      await (window as any).__EXAM_DEV_OBJECT_DETECTION__.switchResolution('320x240');
    });

    await waitFor(() => {
      expect(faceDetectionService.stopCameraStream).toHaveBeenCalledWith(stream640);
      const diag = (window as any).__EXAM_DEV_OBJECT_DETECTION__.getDiagnostics();
      expect(diag.videoReadiness?.width).toBe(320);
      expect(diag.videoReadiness?.height).toBe(240);
    });

    // Test 3: If 640x480 is requested but camera only negotiates 320x240, preserve actual negotiated dimensions
    (faceDetectionService.requestCameraStream as any).mockResolvedValueOnce(stream320);
    await act(async () => {
      await (window as any).__EXAM_DEV_OBJECT_DETECTION__.switchResolution('640x480');
    });

    await waitFor(() => {
      const diag = (window as any).__EXAM_DEV_OBJECT_DETECTION__.getDiagnostics();
      expect(diag.requestedResolution).toBe('640x480');
      expect(diag.videoReadiness?.width).toBe(320);
      expect(diag.videoReadiness?.height).toBe(240);
    });
  });
});
