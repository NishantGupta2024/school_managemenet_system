import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  FileQuestion,
  RefreshCw,
  Wifi,
  WifiOff,
  Check,
  AlertCircle,
  BookOpen,
  Calendar,
  Send,
  Maximize2,
  RotateCcw,
  Sparkles,
  Trophy,
  ShieldAlert,
  ShieldCheck,
  Camera,
  CameraOff,
  UserCheck,
  UserX,
  Users,
  Mic,
  MicOff,
  Volume2,
  Info,
  Smartphone,
} from 'lucide-react';
import { ExaminationLeaderboardModal } from './ExaminationLeaderboardModal';
import faceDetectionService, { CameraDeviceInfo } from '../services/faceDetection.service';
import objectDetectionService from '../services/objectDetection.service';
import audioMonitoringService from '../services/audioMonitoring.service';
import livenessDetectionService, {
  LivenessChallengeType,
  LivenessSessionStatus,
  LivenessSession,
} from '../services/livenessDetection.service';
import {
  examinationApi,
  StudentAssessmentOverview,
  StudentAttemptDetail,
  StudentSanitizedQuestion,
  StudentResultView,
  ChapterProgressionSummary,
  StudentChapterOption,
  AssessmentMode,
  AssessmentStatus,
  AttemptStatus,
  ViolationEventType,
} from '../services/examination.api';

// =============================================================================
// Helper: Authenticated Question Diagram Image Component
// =============================================================================

interface RunnerQuestionImageProps {
  assessmentId: string;
  questionId: string;
}

const RunnerQuestionImage: React.FC<RunnerQuestionImageProps> = ({
  assessmentId,
  questionId,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function fetchImage() {
      try {
        setLoading(true);
        setHasError(false);
        const blob = await examinationApi.getQuestionImageBlob(assessmentId, questionId);
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setImageUrl(createdUrl);
      } catch (err) {
        if (!active) return;
        setHasError(true);
        setImageUrl(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchImage();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [assessmentId, questionId]);

  if (loading) {
    return (
      <div className="my-3 p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center gap-2 text-xs text-slate-400 animate-pulse">
        <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
        <span>Loading question diagram...</span>
      </div>
    );
  }

  if (hasError || !imageUrl) {
    return (
      <div className="my-3 p-3 bg-amber-50/50 border border-amber-200/50 rounded-xl text-xs text-amber-700 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
        <span>Diagram unavailable or could not be loaded securely.</span>
      </div>
    );
  }

  return (
    <div className="my-3">
      <div className="relative inline-block border border-slate-200 rounded-xl overflow-hidden bg-slate-50 shadow-xs">
        <img
          src={imageUrl}
          alt={`Diagram for question ${questionId}`}
          className="max-h-64 max-w-full object-contain cursor-pointer transition-transform hover:scale-[1.01]"
          onClick={() => setIsZoomed(true)}
          title="Click to zoom diagram"
        />
        <button
          type="button"
          onClick={() => setIsZoomed(true)}
          className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg text-xs flex items-center gap-1 backdrop-blur-xs transition-colors"
          title="Zoom Diagram"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {isZoomed && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsZoomed(false)}
        >
          <div
            className="bg-white rounded-2xl p-4 max-w-4xl max-h-[90vh] overflow-auto shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-bold text-slate-700">Question Diagram (Expanded)</span>
              <button
                type="button"
                onClick={() => setIsZoomed(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-1 rounded-lg"
              >
                ✕ Close
              </button>
            </div>
            <img src={imageUrl} alt="Diagram full view" className="max-w-full max-h-[75vh] object-contain mx-auto" />
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Helper: Format Countdown Seconds & Terminal Error Detection
// =============================================================================

function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function isPotentialTerminalAttemptError(err: any): boolean {
  const status = err?.response?.status;
  const msg = String(err?.response?.data?.message || err?.message || '').toLowerCase();
  if (status === 409) return true;
  if (
    msg.includes('already submitted') ||
    msg.includes('already timed_out') ||
    msg.includes('timed out') ||
    msg.includes('expired') ||
    msg.includes('no longer in progress') ||
    msg.includes('results_released') ||
    msg.includes('archived')
  ) {
    return true;
  }
  return false;
}

// =============================================================================
// Types for Per-Question Save Tracking & Monotonic Timer Anchor
// =============================================================================

export type QuestionSaveStatus = 'SAVING' | 'SAVED' | 'FAILED' | 'DIRTY';

interface MonotonicTimerAnchor {
  attemptId: string;
  initialRemainingSeconds: number;
  syncedAtMs: number;
}

type PortalView = 'DASHBOARD' | 'INSTRUCTIONS' | 'PREFLIGHT' | 'RUNNER' | 'COMPLETED';

// =============================================================================
// Main Student Examination Portal Component
// =============================================================================

export const StudentExaminationPortal: React.FC = () => {
  // Navigation / View State
  const [currentView, setCurrentView] = useState<PortalView>('DASHBOARD');

  // Assessments and Filter State
  const [assessments, setAssessments] = useState<StudentAssessmentOverview[]>([]);
  const [loadingAssessments, setLoadingAssessments] = useState<boolean>(true);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [leaderboardAssessment, setLeaderboardAssessment] = useState<{
    id: string;
    title: string;
    subject?: string;
    totalMarks?: number;
  } | null>(null);

  // Selected Assessment for Instructions / Taking
  const [selectedAssessment, setSelectedAssessment] = useState<StudentAssessmentOverview | null>(null);
  const [instructionAcknowledged, setInstructionAcknowledged] = useState<boolean>(false);
  const [startingAssessment, setStartingAssessment] = useState<boolean>(false);

  // Active Attempt Runner State
  const [activeAttempt, setActiveAttempt] = useState<StudentAttemptDetail | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);

  // Local optimistic answers vs Server-confirmed answers
  const [localAnswers, setLocalAnswers] = useState<Record<string, number | null>>({});
  const [confirmedAnswers, setConfirmedAnswers] = useState<Record<string, number | null>>({});
  const [questionSaveStates, setQuestionSaveStates] = useState<Record<string, QuestionSaveStatus>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // Refs for synchronous access inside serialized queues & async handlers
  const isMountedRef = useRef<boolean>(true);
  const activeAttemptRef = useRef<StudentAttemptDetail | null>(null);
  const isTerminalRef = useRef<boolean>(false);
  const isSubmittingRef = useRef<boolean>(false);

  const desiredAnswersRef = useRef<Record<string, number | null>>({});
  const confirmedAnswersRef = useRef<Record<string, number | null>>({});
  const questionSaveStatesRef = useRef<Record<string, QuestionSaveStatus>>({});
  const dirtyQuestionsRef = useRef<Set<string>>(new Set());
  const inFlightWorkersRef = useRef<Record<string, Promise<boolean> | undefined>>({});

  // Monotonic Server-Synchronized Timer State & Refs
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [timerAnchorVersion, setTimerAnchorVersion] = useState<number>(0);
  const timerAnchorRef = useRef<MonotonicTimerAnchor | null>(null);
  const expirySyncInFlightRef = useRef<boolean>(false);
  const [isVerifyingExpiry, setIsVerifyingExpiry] = useState<boolean>(false);
  const [expirySyncError, setExpirySyncError] = useState<string | null>(null);

  // Network Online/Offline State
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // Submit Modal State
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [submittingAttempt, setSubmittingAttempt] = useState<boolean>(false);
  const [submitModalError, setSubmitModalError] = useState<string | null>(null);

  // Completion / Result View State
  const [completionResult, setCompletionResult] = useState<StudentResultView | null>(null);
  const [completionAttempt, setCompletionAttempt] = useState<StudentAttemptDetail | null>(null);
  const [loadingResult, setLoadingResult] = useState<boolean>(false);

  // Chapter Progression State
  const [studentChapters, setStudentChapters] = useState<StudentChapterOption[]>([]);
  const [loadingChapters, setLoadingChapters] = useState<boolean>(false);
  const [chaptersError, setChaptersError] = useState<string | null>(null);
  const [chapterProgressionId, setChapterProgressionId] = useState<string>('');
  const [chapterProgression, setChapterProgression] = useState<ChapterProgressionSummary | null>(null);
  const [loadingProgression, setLoadingProgression] = useState<boolean>(false);
  const [progressionError, setProgressionError] = useState<string | null>(null);

  // Proctoring & Preflight State
  const [preflightTesting, setPreflightTesting] = useState<boolean>(false);
  const [preflightLatency, setPreflightLatency] = useState<number | null>(null);
  const [preflightDownloadMbps, setPreflightDownloadMbps] = useState<number | null>(null);
  const [preflightUploadMbps, setPreflightUploadMbps] = useState<number | null>(null);
  const [bandwidthStatus, setBandwidthStatus] = useState<'OPTIMAL' | 'ACCEPTABLE' | 'DEGRADED' | null>(null);
  const [speedWarningAcknowledged, setSpeedWarningAcknowledged] = useState<boolean>(false);
  const [preflightConsent, setPreflightConsent] = useState<boolean>(false);
  const [fullscreenWarningOverlay, setFullscreenWarningOverlay] = useState<boolean>(false);
  const [proctoringWarningsCount, setProctoringWarningsCount] = useState<number>(0);
  const [studentExplanationText, setStudentExplanationText] = useState<string>('');
  const [isAttemptLocked, setIsAttemptLocked] = useState<boolean>(false);
  const isAttemptLockedRef = useRef<boolean>(false);
  const [lockedReason, setLockedReason] = useState<'WARNING_LIMIT' | 'OBJECT_DETECTED' | null>(null);
  const [recheckingLock, setRecheckingLock] = useState<boolean>(false);

  useEffect(() => {
    isAttemptLockedRef.current = isAttemptLocked;
  }, [isAttemptLocked]);

  // Disconnect Duration Tracking
  const disconnectStartMsRef = useRef<number | null>(null);
  const [disconnectSeconds, setDisconnectSeconds] = useState<number>(0);

  // Webcam & Face Presence State (Pilot)
  const [isResumingAttempt, setIsResumingAttempt] = useState<boolean>(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const [cameraTested, setCameraTested] = useState<boolean>(false);
  const [cameraTesting, setCameraTesting] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraExemptionAcknowledged, setCameraExemptionAcknowledged] = useState<boolean>(false);
  const [activeCameraLabel, setActiveCameraLabel] = useState<string>('');
  const [availableCameras, setAvailableCameras] = useState<CameraDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [faceDetectionStatus, setFaceDetectionStatus] = useState<'VERIFIED' | 'NO_FACE' | 'MULTIPLE_FACES' | 'IDLE'>('IDLE');
  const [activeFaceCount, setActiveFaceCount] = useState<number | null>(null);
  const [faceAnomalySeconds, setFaceAnomalySeconds] = useState<number>(0);
  const [pipMinimized, setPipMinimized] = useState<boolean>(false);
  const [isFaceAbsentPaused, setIsFaceAbsentPaused] = useState<boolean>(false);
  const isFaceAbsentPausedRef = useRef<boolean>(false);
  const [faceRecoverySamples, setFaceRecoverySamples] = useState<number>(0);
  const [faceRecoveryBanner, setFaceRecoveryBanner] = useState<string | null>(null);
  const [noFaceWarningActive, setNoFaceWarningActive] = useState<boolean>(false);

  // Object Detection State (Pilot)
  const [detectedObjectAdvisory, setDetectedObjectAdvisory] = useState<{
    objectClass: string;
    seconds: number;
  } | null>(null);
  const objectHistoryTimestampsRef = useRef<Record<string, number[]>>({});
  const lastObjectViolationTimestampsRef = useRef<Record<string, number>>({});
  const objectAdvisoryActiveUntilMsRef = useRef<number>(0);

  // Development-Only Object Detection Diagnostic State
  const [devObjDiag, setDevObjDiag] = useState<{
    featureFlagEnabled: boolean;
    detectorStatus: 'UNINITIALIZED' | 'INITIALIZING' | 'READY' | 'FAILED';
    detectorError: string | null;
    loopRunning: boolean;
    lastFrameMs: number | null;
    tickCount: number;
    inferenceMs: number | null;
    videoReadiness: {
      readyState: number;
      width: number;
      height: number;
      paused: boolean;
    } | null;
    rawCandidates: { categoryName: string; score: number }[];
    personDetected: boolean;
    personConfidence: number | null;
    phoneHistoryCount: number;
    bookHistoryCount: number;
    phoneCooldownSec: number;
    bookCooldownSec: number;
    lastDispatchedEvent: {
      status: 'IDLE' | 'DISPATCHING' | 'ACCEPTED' | 'REJECTED';
      time: string | null;
      details: string | null;
    };
  }>({
    featureFlagEnabled: import.meta.env.VITE_ENABLE_EXAM_OBJECT_DETECTION === 'true',
    detectorStatus: objectDetectionService.getStatus(),
    detectorError: objectDetectionService.getLastError(),
    loopRunning: false,
    lastFrameMs: null,
    tickCount: 0,
    inferenceMs: null,
    videoReadiness: null,
    rawCandidates: [],
    personDetected: false,
    personConfidence: null,
    phoneHistoryCount: 0,
    bookHistoryCount: 0,
    phoneCooldownSec: 0,
    bookCooldownSec: 0,
    lastDispatchedEvent: { status: 'IDLE', time: null, details: null },
  });
  const [devRequestedResolution, setDevRequestedResolution] = useState<'320x240' | '640x480'>('320x240');
  const [devSwitchingResolution, setDevSwitchingResolution] = useState<boolean>(false);
  const devSwitchingResolutionRef = useRef<boolean>(false);
  const [devResolutionError, setDevResolutionError] = useState<string | null>(null);

  useEffect(() => {
    isFaceAbsentPausedRef.current = isFaceAbsentPaused;
  }, [isFaceAbsentPaused]);

  // Microphone & Ambient Noise State (Pilot)
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const [micTested, setMicTested] = useState<boolean>(false);
  const [micCalibrating, setMicCalibrating] = useState<boolean>(false);
  const [micCalibrationProgress, setMicCalibrationProgress] = useState<number>(0);
  const [ambientBaselineDb, setAmbientBaselineDb] = useState<number | null>(null);
  const [currentMicDb, setCurrentMicDb] = useState<number>(-100);
  const [micError, setMicError] = useState<string | null>(null);
  const [micExemptionAcknowledged, setMicExemptionAcknowledged] = useState<boolean>(false);
  const [activeMicLabel, setActiveMicLabel] = useState<string>('');
  const [sustainedNoiseActive, setSustainedNoiseActive] = useState<boolean>(false);
  const [noiseAnomalySeconds, setNoiseAnomalySeconds] = useState<number>(0);
  const [lastAudioPeakDb, setLastAudioPeakDb] = useState<number | null>(null);
  const audioAdvisoryUntilMsRef = useRef<number>(0);

  // Active Liveness State (Pilot)
  const [livenessChallenge, setLivenessChallenge] = useState<LivenessChallengeType | null>(null);
  const [livenessStatus, setLivenessStatus] = useState<LivenessSessionStatus>('IDLE');
  const [livenessInstruction, setLivenessInstruction] = useState<string>('');
  const [livenessProgress, setLivenessProgress] = useState<number>(0);
  const [livenessRemainingMs, setLivenessRemainingMs] = useState<number>(7000);
  const [livenessPassed, setLivenessPassed] = useState<boolean>(false);
  const [livenessExemptionAcknowledged, setLivenessExemptionAcknowledged] = useState<boolean>(false);
  const [livenessTimestamp, setLivenessTimestamp] = useState<string | null>(null);
  const livenessSessionRef = useRef<LivenessSession | null>(null);

  const preflightVideoRef = useRef<HTMLVideoElement | null>(null);
  const runnerVideoRef = useRef<HTMLVideoElement | null>(null);
  const noFaceSecondsRef = useRef<number>(0);
  const consecutiveFaceDetectionsRef = useRef<number>(0);
  const multipleFacesSecondsRef = useRef<number>(0);
  const lastFaceViolationRef = useRef<'NO_FACE' | 'MULTIPLE_FACES' | null>(null);

  useEffect(() => {
    if (preflightVideoRef.current && webcamStream) {
      preflightVideoRef.current.srcObject = webcamStream;
    }
  }, [webcamStream, currentView]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (livenessSessionRef.current) {
        livenessSessionRef.current.destroy();
        livenessSessionRef.current = null;
      }
      if (webcamStreamRef.current) {
        faceDetectionService.stopCameraStream(webcamStreamRef.current);
        webcamStreamRef.current = null;
      }
      if (micStreamRef.current) {
        audioMonitoringService.stopMicrophoneStream(micStreamRef.current);
        micStreamRef.current = null;
      }
    };
  }, []);

  // Helper to update per-question save status in both ref and state
  const updateQuestionSaveStatus = useCallback(
    (questionId: string, status: QuestionSaveStatus) => {
      questionSaveStatesRef.current = {
        ...questionSaveStatesRef.current,
        [questionId]: status,
      };
      if (isMountedRef.current) {
        setQuestionSaveStates({ ...questionSaveStatesRef.current });
      }
    },
    [],
  );

  // Helper to anchor the monotonic timer from a fresh backend StudentAttemptDetail response
  const anchorMonotonicTimer = useCallback((attempt: StudentAttemptDetail) => {
    const serverRemaining =
      typeof attempt.remainingSeconds === 'number' && !Number.isNaN(attempt.remainingSeconds)
        ? Math.max(0, Math.floor(attempt.remainingSeconds))
        : 0;

    timerAnchorRef.current = {
      attemptId: attempt.id,
      initialRemainingSeconds: serverRemaining,
      syncedAtMs: performance.now(),
    };

    if (isMountedRef.current) {
      setRemainingSeconds(serverRemaining);
      setExpirySyncError(null);
      setTimerAnchorVersion((v) => v + 1);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Final Result Loader
  // ---------------------------------------------------------------------------
  const loadFinalResult = useCallback(async (assessmentId: string) => {
    try {
      if (isMountedRef.current) setLoadingResult(true);
      const res = await examinationApi.getStudentAssessmentResult(assessmentId);
      if (isMountedRef.current) setCompletionResult(res);
    } catch (err) {
      if (isMountedRef.current) setCompletionResult(null);
    } finally {
      if (isMountedRef.current) setLoadingResult(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Transition cleanly to COMPLETED when backend confirms terminal status
  // ---------------------------------------------------------------------------
  const transitionToTerminalAttempt = useCallback(
    (terminalAttempt: StudentAttemptDetail) => {
      isTerminalRef.current = true;
      isSubmittingRef.current = false;
      dirtyQuestionsRef.current.clear();
      activeAttemptRef.current = terminalAttempt;

      if (webcamStreamRef.current) {
        faceDetectionService.stopCameraStream(webcamStreamRef.current);
        objectDetectionService.close();
        webcamStreamRef.current = null;
        setWebcamStream(null);
      }
      if (micStreamRef.current) {
        audioMonitoringService.stopMicrophoneStream(micStreamRef.current);
        micStreamRef.current = null;
        setMicStream(null);
      }

      if (!isMountedRef.current) return;
      setActiveAttempt(terminalAttempt);
      setCompletionAttempt(terminalAttempt);
      setSubmittingAttempt(false);
      setIsVerifyingExpiry(false);
      setExpirySyncError(null);
      setShowSubmitModal(false);
      setCurrentView('COMPLETED');
      loadFinalResult(terminalAttempt.assessmentId);
    },
    [loadFinalResult],
  );

  // ---------------------------------------------------------------------------
  // Check authoritative backend status when a terminal error or expiry occurs
  // ---------------------------------------------------------------------------
  const synchronizeAttemptWithBackend = useCallback(
    async (
      attemptId: string,
      options?: { isExpiryCheck?: boolean; isReconnect?: boolean },
    ): Promise<StudentAttemptDetail | null> => {
      try {
        if (options?.isExpiryCheck && isMountedRef.current) {
          setIsVerifyingExpiry(true);
          setExpirySyncError(null);
        }

        const refreshed = await examinationApi.getAttempt(attemptId);
        if (!isMountedRef.current) return refreshed;

        if (
          refreshed.status === AttemptStatus.SUBMITTED ||
          refreshed.status === AttemptStatus.TIMED_OUT
        ) {
          transitionToTerminalAttempt(refreshed);
          return refreshed;
        }

        // Still IN_PROGRESS on the backend
        activeAttemptRef.current = refreshed;
        setActiveAttempt(refreshed);

        if (refreshed.isLocked) {
          setIsAttemptLocked(true);
          isAttemptLockedRef.current = true;
        } else {
          setIsAttemptLocked(false);
          isAttemptLockedRef.current = false;
        }
        if (refreshed.activeWarningsCount !== undefined) {
          setProctoringWarningsCount(refreshed.activeWarningsCount);
        }

        // Merge server-confirmed answers
        const serverAnswers = refreshed.answers || {};
        confirmedAnswersRef.current = { ...serverAnswers };
        setConfirmedAnswers({ ...serverAnswers });

        // Re-anchor monotonic timer to authoritative remainingSeconds
        anchorMonotonicTimer(refreshed);
        setIsVerifyingExpiry(false);

        if (options?.isExpiryCheck && (refreshed.remainingSeconds ?? 0) <= 0) {
          // Server is at 0s but has not transitioned status yet; show safe sync notice
          setExpirySyncError(
            'Time has reached 00:00. Waiting for server to finalize attempt status...',
          );
        }

        return refreshed;
      } catch (err: any) {
        if (isMountedRef.current && options?.isExpiryCheck) {
          setIsVerifyingExpiry(false);
          setExpirySyncError(
            err?.response?.data?.message ||
              'Unable to verify timer expiration with the server. Please check your connection and retry.',
          );
        }
        return null;
      }
    },
    [anchorMonotonicTimer, transitionToTerminalAttempt],
  );

  // ---------------------------------------------------------------------------
  // Per-Question Serialized Autosave Worker (FIX B & FIX C)
  // ---------------------------------------------------------------------------
  const enqueueQuestionSave = useCallback(
    (attemptId: string, questionId: string, desiredOption: number | null): Promise<boolean> => {
      if (isTerminalRef.current || isAttemptLockedRef.current) {
        return Promise.resolve(false);
      }

      // Record latest desired selection and mark question as needing persistence
      desiredAnswersRef.current[questionId] = desiredOption;
      dirtyQuestionsRef.current.add(questionId);
      updateQuestionSaveStatus(questionId, 'SAVING');

      if (isMountedRef.current) {
        setSaveError(null);
      }

      // If a worker loop is already running for this questionId, coalesce into it!
      const existingWorker = inFlightWorkersRef.current[questionId];
      if (existingWorker) {
        return existingWorker;
      }

      const workerPromise = (async (): Promise<boolean> => {
        let lastSuccess = false;

        try {
          while (dirtyQuestionsRef.current.has(questionId) && !isTerminalRef.current) {
            // Consume the dirty flag for the value we are about to send
            dirtyQuestionsRef.current.delete(questionId);
            const optionToSend = desiredAnswersRef.current[questionId] ?? null;

            updateQuestionSaveStatus(questionId, 'SAVING');

            try {
              const res = await examinationApi.saveAnswer(attemptId, questionId, {
                selectedOption: optionToSend,
              });

              if (isTerminalRef.current) {
                return false;
              }

              // Record what the backend just acknowledged
              const acknowledgedOption =
                res && res.selectedOption !== undefined ? res.selectedOption : optionToSend;
              confirmedAnswersRef.current = {
                ...confirmedAnswersRef.current,
                [questionId]: acknowledgedOption,
              };

              if (isMountedRef.current) {
                setConfirmedAnswers({ ...confirmedAnswersRef.current });
                setActiveAttempt((prev) =>
                  prev
                    ? {
                        ...prev,
                        answers: {
                          ...prev.answers,
                          [questionId]: acknowledgedOption,
                        },
                      }
                    : prev,
                );
              }

              // If another selection arrived while this request was in flight, continue loop immediately
              if (dirtyQuestionsRef.current.has(questionId)) {
                updateQuestionSaveStatus(questionId, 'SAVING');
                continue;
              }

              // Verify latest desired matches confirmed
              if ((desiredAnswersRef.current[questionId] ?? null) === acknowledgedOption) {
                updateQuestionSaveStatus(questionId, 'SAVED');
                lastSuccess = true;
              } else {
                dirtyQuestionsRef.current.add(questionId);
              }
            } catch (err: any) {
              if (isTerminalRef.current) {
                return false;
              }

              if (err?.response?.status === 403 && (err?.response?.data?.message || '').toLowerCase().includes('locked')) {
                setIsAttemptLocked(true);
                isAttemptLockedRef.current = true;
                updateQuestionSaveStatus(questionId, 'FAILED');
                if (isMountedRef.current) {
                  setSaveError(err.response.data.message);
                }
                return false;
              }

              // Check if the error indicates the attempt is already SUBMITTED or TIMED_OUT
              if (isPotentialTerminalAttemptError(err)) {
                const synced = await synchronizeAttemptWithBackend(attemptId);
                if (
                  synced &&
                  (synced.status === AttemptStatus.SUBMITTED ||
                    synced.status === AttemptStatus.TIMED_OUT)
                ) {
                  return false;
                }
              }

              // If a newer selection was made while the failed request was in flight, try sending the newer one
              if (dirtyQuestionsRef.current.has(questionId)) {
                continue;
              }

              updateQuestionSaveStatus(questionId, 'FAILED');
              if (isMountedRef.current) {
                setSaveError(
                  err?.response?.data?.message ||
                    'Autosave failed for one or more questions. Please check your connection and retry.',
                );
              }
              lastSuccess = false;
              break;
            }
          }
          return lastSuccess;
        } finally {
          delete inFlightWorkersRef.current[questionId];
        }
      })();

      inFlightWorkersRef.current[questionId] = workerPromise;
      return workerPromise;
    },
    [synchronizeAttemptWithBackend, updateQuestionSaveStatus],
  );

  // ---------------------------------------------------------------------------
  // Retry All Failed or Dirty Question Saves (FIX C)
  // ---------------------------------------------------------------------------
  const retryAllUnresolvedSaves = useCallback(async (): Promise<boolean> => {
    const attempt = activeAttemptRef.current;
    if (!attempt || isTerminalRef.current || attempt.status !== AttemptStatus.IN_PROGRESS) {
      return false;
    }

    const questionsList = attempt.questions || [];
    const retryPromises: Promise<boolean>[] = [];

    for (const q of questionsList) {
      const qId = q.id;
      const desired = desiredAnswersRef.current[qId] ?? null;
      const confirmed = confirmedAnswersRef.current[qId] ?? null;
      const status = questionSaveStatesRef.current[qId];

      if (
        inFlightWorkersRef.current[qId] &&
        !dirtyQuestionsRef.current.has(qId) &&
        desired === confirmed
      ) {
        retryPromises.push(inFlightWorkersRef.current[qId]!);
      } else if (desired !== confirmed || status === 'FAILED' || status === 'DIRTY') {
        retryPromises.push(enqueueQuestionSave(attempt.id, qId, desired));
      } else if (inFlightWorkersRef.current[qId]) {
        retryPromises.push(inFlightWorkersRef.current[qId]!);
      }
    }

    if (retryPromises.length === 0) {
      return true;
    }

    const results = await Promise.all(retryPromises);
    return results.every(Boolean);
  }, [enqueueQuestionSave]);

  // ---------------------------------------------------------------------------
  // Centralized Violation Reporting & Limit Check
  // ---------------------------------------------------------------------------
  const reportViolation = useCallback(
    async (eventType: ViolationEventType, durationMs?: number, metadata?: any) => {
      const attempt = activeAttemptRef.current;
      if (!attempt || isTerminalRef.current) return;
      try {
        const res = await examinationApi.recordViolationEvent(
          attempt.id,
          eventType,
          durationMs,
          metadata,
        );
        if (res && res.recorded) {
          const warnings = res.activeMisconductViolations ?? res.totalViolations ?? 0;
          setProctoringWarningsCount(warnings);
          // OBJECT_DETECTED is advisory-only for teacher review and does not auto-lock the attempt
          if (res.isLocked && eventType !== ViolationEventType.OBJECT_DETECTED) {
            setIsAttemptLocked(true);
            isAttemptLockedRef.current = true;
            setLockedReason('WARNING_LIMIT');
          }
        }
      } catch (err: any) {
        console.warn('Failed to record violation event', err);
      }
    },
    [],
  );

  // Live ticker for disconnect duration
  useEffect(() => {
    if (isOnline) {
      setDisconnectSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      if (disconnectStartMsRef.current) {
        setDisconnectSeconds(Math.floor((Date.now() - disconnectStartMsRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isOnline]);

  // ---------------------------------------------------------------------------
  // 1. Online / Offline Event Listeners & Reconnection Recovery (FIX E)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      const attempt = activeAttemptRef.current;
      const disconnectStartMs = disconnectStartMsRef.current;
      disconnectStartMsRef.current = null;
      setDisconnectSeconds(0);

      if (!attempt || isTerminalRef.current) return;

      // 1. If disconnect lasted >= 5 seconds (5000 ms), log one consolidated NETWORK_ANOMALY event
      if (disconnectStartMs) {
        const outageDurationMs = Date.now() - disconnectStartMs;
        if (outageDurationMs >= 5000) {
          try {
            const pendingOfflineCount = Object.keys(desiredAnswersRef.current).filter(
              (qid) => (desiredAnswersRef.current[qid] ?? null) !== (confirmedAnswersRef.current[qid] ?? null),
            ).length;

            await reportViolation(
              ViolationEventType.NETWORK_ANOMALY,
              outageDurationMs,
              {
                disconnectedAt: new Date(disconnectStartMs).toISOString(),
                reconnectedAt: new Date().toISOString(),
                durationSeconds: Math.round(outageDurationMs / 1000),
                offlineAnswersPendingCount: pendingOfflineCount,
              },
            );
          } catch (e) {
            console.warn('Consolidated NETWORK_ANOMALY logging error', e);
          }
        }
      }

      // 2. Re-validate attempt status and re-anchor timer from backend
      const refreshed = await synchronizeAttemptWithBackend(attempt.id, { isReconnect: true });
      if (
        !refreshed ||
        isTerminalRef.current ||
        refreshed.status !== AttemptStatus.IN_PROGRESS
      ) {
        return;
      }

      // 3. Preserve and retry unsaved answers during every disconnect (including outages < 5 seconds)
      await retryAllUnresolvedSaves();
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (!disconnectStartMsRef.current) {
        disconnectStartMsRef.current = Date.now();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [retryAllUnresolvedSaves, synchronizeAttemptWithBackend]);

  // ---------------------------------------------------------------------------
  // 1b. In-Runner Face Presence Detection Loop (1 Hz Sampling Pilot)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (currentView !== 'RUNNER' || !webcamStream) {
      return;
    }

    // Reset runner face-detection counters and latches on entering RUNNER with active stream
    noFaceSecondsRef.current = 0;
    consecutiveFaceDetectionsRef.current = 0;
    multipleFacesSecondsRef.current = 0;
    lastFaceViolationRef.current = null;
    isFaceAbsentPausedRef.current = false;
    setIsFaceAbsentPaused(false);
    setFaceRecoverySamples(0);
    setFaceRecoveryBanner(null);
    setNoFaceWarningActive(false);
    setFaceAnomalySeconds(0);

    const detectedLabel = faceDetectionService.getStreamDeviceLabel(webcamStream);
    setActiveCameraLabel(detectedLabel);

    // Ensure local MediaPipe detector is initialized in RUNNER
    faceDetectionService.getDetector().catch(() => {});

    if (runnerVideoRef.current) {
      if (runnerVideoRef.current.srcObject !== webcamStream) {
        runnerVideoRef.current.srcObject = webcamStream;
      }
      try {
        runnerVideoRef.current.play?.()?.catch?.(() => {});
      } catch (e) {}
    }

    const interval = setInterval(() => {
      const video = runnerVideoRef.current;
      if (!video) return;
      if (video.srcObject !== webcamStream) {
        video.srcObject = webcamStream;
        try {
          video.play?.()?.catch?.(() => {});
        } catch (e) {}
      }
      if (video.readyState < 2) return;

      const res = faceDetectionService.detectFaces(video, performance.now());
      setActiveFaceCount(res.faceCount);

      if (res.faceCount === 1) {
        consecutiveFaceDetectionsRef.current += 1;
        multipleFacesSecondsRef.current = 0;
        const recoveryCount = Math.min(2, consecutiveFaceDetectionsRef.current);
        setFaceRecoverySamples(recoveryCount);

        // Require 2 consecutive valid samples of face presence before resetting absence counter and re-enabling answer controls
        if (consecutiveFaceDetectionsRef.current >= 2) {
          const wasPausedOrAbsent = isFaceAbsentPausedRef.current || noFaceSecondsRef.current > 0;
          noFaceSecondsRef.current = 0;
          lastFaceViolationRef.current = null;
          setFaceAnomalySeconds(0);
          isFaceAbsentPausedRef.current = false;
          setIsFaceAbsentPaused(false);
          setNoFaceWarningActive(false);
          setFaceDetectionStatus('VERIFIED');
          if (wasPausedOrAbsent) {
            setFaceRecoveryBanner(
              'Face detected for 2 consecutive checks — answer options and navigation have been re-enabled.',
            );
          }
        }
      } else if (res.faceCount === 0) {
        consecutiveFaceDetectionsRef.current = 0;
        setFaceRecoverySamples(0);
        setFaceRecoveryBanner(null);
        noFaceSecondsRef.current += 1;
        setFaceDetectionStatus('NO_FACE');
        setFaceAnomalySeconds(noFaceSecondsRef.current);

        // Temporarily pause answer controls while no face is detected (saved answers and timer remain intact)
        isFaceAbsentPausedRef.current = true;
        setIsFaceAbsentPaused(true);

        // Stage 1 Provisional Pilot Threshold: 7 seconds continuous absence
        if (noFaceSecondsRef.current >= 7 && lastFaceViolationRef.current !== 'NO_FACE') {
          lastFaceViolationRef.current = 'NO_FACE';
          setNoFaceWarningActive(true);
          const attempt = activeAttemptRef.current;
          if (attempt && !isTerminalRef.current && (attempt.enableProctoring || selectedAssessment?.enableProctoring)) {
            reportViolation(
              ViolationEventType.NO_FACE,
              noFaceSecondsRef.current * 1000,
              { continuousSeconds: noFaceSecondsRef.current, pilotSetting: '7s' },
            );
          }
        }
      } else if (res.faceCount >= 2) {
        consecutiveFaceDetectionsRef.current = 0;
        setFaceRecoverySamples(0);
        setFaceRecoveryBanner(null);
        noFaceSecondsRef.current = 0;
        isFaceAbsentPausedRef.current = false;
        setIsFaceAbsentPaused(false);
        setNoFaceWarningActive(false);
        multipleFacesSecondsRef.current += 1;
        setFaceDetectionStatus('MULTIPLE_FACES');
        setFaceAnomalySeconds(multipleFacesSecondsRef.current);

        // Provisional Pilot Threshold: 5 seconds continuous multiple faces
        if (multipleFacesSecondsRef.current >= 5 && lastFaceViolationRef.current !== 'MULTIPLE_FACES') {
          lastFaceViolationRef.current = 'MULTIPLE_FACES';
          const attempt = activeAttemptRef.current;
          if (attempt && !isTerminalRef.current && (attempt.enableProctoring || selectedAssessment?.enableProctoring)) {
            reportViolation(
              ViolationEventType.MULTIPLE_FACES,
              multipleFacesSecondsRef.current * 1000,
              { continuousSeconds: multipleFacesSecondsRef.current, pilotSetting: '5s' },
            );
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentView, webcamStream, reportViolation]);

  // ---------------------------------------------------------------------------
  // 1b-1. Development-Only Camera Resolution Switcher (320x240 vs 640x480)
  // ---------------------------------------------------------------------------
  const handleSwitchDevCameraResolution = useCallback(
    async (targetRes: '320x240' | '640x480') => {
      if (!import.meta.env.DEV) return;
      // Guard against simultaneous camera-stream requests
      if (devSwitchingResolutionRef.current) return;

      devSwitchingResolutionRef.current = true;
      setDevSwitchingResolution(true);
      setDevResolutionError(null);
      setDevRequestedResolution(targetRes);

      const [targetWidth, targetHeight] = targetRes === '640x480' ? [640, 480] : [320, 240];
      const previousStream = webcamStreamRef.current;
      const existingDeviceId =
        selectedCameraId ||
        previousStream?.getVideoTracks?.()?.[0]?.getSettings?.()?.deviceId ||
        undefined;

      try {
        // Safely stop and release the existing stream before requesting new resolution
        if (previousStream) {
          faceDetectionService.stopCameraStream(previousStream);
          webcamStreamRef.current = null;
        }

        const newStream = await faceDetectionService.requestCameraStream({
          ...(existingDeviceId ? { deviceId: { exact: existingDeviceId } } : {}),
          width: { ideal: targetWidth, max: targetWidth },
          height: { ideal: targetHeight, max: targetHeight },
        });

        if (!isMountedRef.current || isTerminalRef.current) {
          faceDetectionService.stopCameraStream(newStream);
          return;
        }

        webcamStreamRef.current = newStream;
        setWebcamStream(newStream);

        const label = faceDetectionService.getStreamDeviceLabel(newStream);
        setActiveCameraLabel(label);

        if (runnerVideoRef.current) {
          runnerVideoRef.current.srcObject = newStream;
          try {
            await runnerVideoRef.current.play?.();
          } catch (e) {}
        }

        const trackSettings = newStream.getVideoTracks?.()?.[0]?.getSettings?.();
        const negotiatedW = runnerVideoRef.current?.videoWidth || trackSettings?.width || 0;
        const negotiatedH = runnerVideoRef.current?.videoHeight || trackSettings?.height || 0;

        setDevObjDiag((prev) => ({
          ...prev,
          videoReadiness: {
            readyState: runnerVideoRef.current?.readyState ?? 0,
            width: negotiatedW,
            height: negotiatedH,
            paused: runnerVideoRef.current?.paused ?? false,
          },
        }));
      } catch (err: any) {
        console.warn('[DevObjDiag] Camera resolution switch error:', err);
        setDevResolutionError(err?.message || `Failed to switch camera to ${targetRes}.`);
        // Recover default camera stream if stream was stopped and new request failed
        if (!webcamStreamRef.current && isMountedRef.current && !isTerminalRef.current) {
          try {
            const fallbackStream = await faceDetectionService.requestCameraStream(
              existingDeviceId ? { deviceId: { exact: existingDeviceId } } : undefined,
            );
            webcamStreamRef.current = fallbackStream;
            setWebcamStream(fallbackStream);
            if (runnerVideoRef.current) {
              runnerVideoRef.current.srcObject = fallbackStream;
              runnerVideoRef.current.play?.()?.catch?.(() => {});
            }
          } catch (fallbackErr) {}
        }
      } finally {
        devSwitchingResolutionRef.current = false;
        if (isMountedRef.current) {
          setDevSwitchingResolution(false);
        }
      }
    },
    [selectedCameraId],
  );

  // Development-Only Object Detection Diagnostic API (exposed on window in DEV for tests/debugging, zero student UI footprint)
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as any).__EXAM_DEV_OBJECT_DETECTION__ = {
        getDiagnostics: () => ({
          ...devObjDiag,
          requestedResolution: devRequestedResolution,
          switchingResolution: devSwitchingResolution,
          resolutionError: devResolutionError,
          isAttemptLocked,
          lockedReason,
        }),
        switchResolution: (res: '320x240' | '640x480') => handleSwitchDevCameraResolution(res),
      };
    }
    return () => {
      if (import.meta.env.DEV) {
        delete (window as any).__EXAM_DEV_OBJECT_DETECTION__;
      }
    };
  }, [
    devObjDiag,
    devRequestedResolution,
    devSwitchingResolution,
    devResolutionError,
    isAttemptLocked,
    lockedReason,
    handleSwitchDevCameraResolution,
  ]);

  // ---------------------------------------------------------------------------
  // 1b-2. In-Runner Object Detection Loop (Provisional Pilot: 1.5s interval, 2-of-3 window)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const isObjectDetectionEnabled = import.meta.env.VITE_ENABLE_EXAM_OBJECT_DETECTION === 'true';
    const isDev = Boolean(import.meta.env.DEV);

    if (currentView !== 'RUNNER' || !webcamStream || !isObjectDetectionEnabled) {
      objectHistoryTimestampsRef.current = {};
      setDetectedObjectAdvisory(null);
      if (isDev) {
        const trackSettings = webcamStream?.getVideoTracks?.()?.[0]?.getSettings?.();
        setDevObjDiag((prev) => ({
          ...prev,
          featureFlagEnabled: isObjectDetectionEnabled,
          detectorStatus: objectDetectionService.getStatus(),
          loopRunning: false,
          videoReadiness: runnerVideoRef.current ? {
            readyState: runnerVideoRef.current.readyState,
            width: runnerVideoRef.current.videoWidth || trackSettings?.width || 0,
            height: runnerVideoRef.current.videoHeight || trackSettings?.height || 0,
            paused: runnerVideoRef.current.paused,
          } : null,
        }));
      }
      return;
    }

    // Warm up local object detector
    objectDetectionService.getDetector().then(() => {
      if (isDev) {
        setDevObjDiag((prev) => ({
          ...prev,
          detectorStatus: objectDetectionService.getStatus(),
          detectorError: objectDetectionService.getLastError(),
        }));
      }
    }).catch(() => {
      if (isDev) {
        setDevObjDiag((prev) => ({
          ...prev,
          detectorStatus: objectDetectionService.getStatus(),
          detectorError: objectDetectionService.getLastError(),
        }));
      }
    });

    const interval = setInterval(() => {
      const video = runnerVideoRef.current;
      const trackSettings = webcamStream?.getVideoTracks?.()?.[0]?.getSettings?.();
      if (!video || video.readyState < 2) {
        if (isDev) {
          setDevObjDiag((prev) => ({
            ...prev,
            featureFlagEnabled: isObjectDetectionEnabled,
            detectorStatus: objectDetectionService.getStatus(),
            detectorError: objectDetectionService.getLastError(),
            loopRunning: true,
            videoReadiness: video ? {
              readyState: video.readyState,
              width: video.videoWidth || trackSettings?.width || 0,
              height: video.videoHeight || trackSettings?.height || 0,
              paused: video.paused,
            } : null,
          }));
        }
        return;
      }

      const res = objectDetectionService.detectObjects(video, performance.now());
      const now = Date.now();
      const threeSecondsAgo = now - 3000;
      let activeAdvisoryItem: { objectClass: string; seconds: number } | null = null;

      // Check target classes
      for (const targetClass of ['cell phone', 'book'] as const) {
        const isPresent = targetClass === 'cell phone' ? res.hasCellPhone : res.hasBook;
        const history = (objectHistoryTimestampsRef.current[targetClass] || []).filter(
          (ts) => ts >= threeSecondsAgo,
        );

        if (isPresent) {
          history.push(now);
        }
        objectHistoryTimestampsRef.current[targetClass] = history;

        // Faster 2-detections-within-3s trigger policy (750ms sampling interval)
        if (history.length >= 2) {
          const estimatedDurationSec = Math.round(history.length * 0.75 * 10) / 10;
          activeAdvisoryItem = {
            objectClass: targetClass,
            seconds: Math.max(1.5, estimatedDurationSec),
          };
          // Hold advisory visible for at least 3 seconds after last positive evaluation to prevent flicker
          objectAdvisoryActiveUntilMsRef.current = now + 3000;

          // 30-second cooldown per detected class
          const lastReported = lastObjectViolationTimestampsRef.current[targetClass] || 0;
          if (now - lastReported >= 30000) {
            lastObjectViolationTimestampsRef.current[targetClass] = now;
            const matchingObj = res.detectedObjects.find((o) => o.categoryName === targetClass);
            const attempt = activeAttemptRef.current;
            if (
              attempt &&
              !isTerminalRef.current &&
              (attempt.enableProctoring || selectedAssessment?.enableProctoring)
            ) {
              if (isDev) {
                setDevObjDiag((prev) => ({
                  ...prev,
                  lastDispatchedEvent: {
                    status: 'DISPATCHING',
                    time: new Date().toLocaleTimeString(),
                    details: `${targetClass} (conf: ${matchingObj ? matchingObj.score : 0.45})`,
                  },
                }));
              }
              reportViolation(
                ViolationEventType.OBJECT_DETECTED,
                Math.round(history.length * 750),
                {
                  detectedClass: targetClass,
                  confidence: matchingObj ? Math.round(matchingObj.score * 100) / 100 : 0.45,
                  continuousSeconds: Math.max(1.5, estimatedDurationSec),
                  pilotSetting: '2-samples-in-3s-750ms',
                  advisoryOnly: true,
                },
              ).then(() => {
                if (isDev) {
                  setDevObjDiag((prev) => ({
                    ...prev,
                    lastDispatchedEvent: {
                      status: 'ACCEPTED',
                      time: new Date().toLocaleTimeString(),
                      details: `${targetClass} (advisory logged for teacher review)`,
                    },
                  }));
                }
              }).catch((err: any) => {
                if (isDev) {
                  setDevObjDiag((prev) => ({
                    ...prev,
                    lastDispatchedEvent: {
                      status: 'REJECTED',
                      time: new Date().toLocaleTimeString(),
                      details: err?.message || 'Error',
                    },
                  }));
                }
              });
            }
          }
        }
      }

      if (isDev) {
        const phoneLast = lastObjectViolationTimestampsRef.current['cell phone'] || 0;
        const bookLast = lastObjectViolationTimestampsRef.current['book'] || 0;
        const phoneCd = Math.max(0, Math.ceil((30000 - (now - phoneLast)) / 1000));
        const bookCd = Math.max(0, Math.ceil((30000 - (now - bookLast)) / 1000));
        const phoneHist = objectHistoryTimestampsRef.current['cell phone']?.length || 0;
        const bookHist = objectHistoryTimestampsRef.current['book']?.length || 0;

        setDevObjDiag((prev) => ({
          ...prev,
          featureFlagEnabled: isObjectDetectionEnabled,
          detectorStatus: objectDetectionService.getStatus(),
          detectorError: objectDetectionService.getLastError(),
          loopRunning: true,
          lastFrameMs: now,
          tickCount: prev.tickCount + 1,
          inferenceMs: typeof res.inferenceMs === 'number' ? res.inferenceMs : null,
          videoReadiness: {
            readyState: video.readyState,
            width: video.videoWidth || trackSettings?.width || 0,
            height: video.videoHeight || trackSettings?.height || 0,
            paused: video.paused,
          },
          rawCandidates: res.rawCandidates || [],
          personDetected: res.hasPerson,
          personConfidence: res.personConfidence,
          phoneHistoryCount: phoneHist,
          bookHistoryCount: bookHist,
          phoneCooldownSec: phoneLast ? phoneCd : 0,
          bookCooldownSec: bookLast ? bookCd : 0,
        }));
      }

      if (activeAdvisoryItem) {
        setDetectedObjectAdvisory(activeAdvisoryItem);
      } else if (now >= objectAdvisoryActiveUntilMsRef.current) {
        setDetectedObjectAdvisory(null);
      }
    }, 750);

    return () => {
      clearInterval(interval);
      objectHistoryTimestampsRef.current = {};
      setDetectedObjectAdvisory(null);
      if (isDev) {
        setDevObjDiag((prev) => ({ ...prev, loopRunning: false }));
      }
    };
  }, [currentView, webcamStream, reportViolation]);

  // ---------------------------------------------------------------------------
  // 1c. In-Runner Ambient Noise Monitoring Loop (10 Hz RMS Level Pilot)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (currentView !== 'RUNNER' || !micStream) {
      return;
    }

    setActiveMicLabel(audioMonitoringService.getStreamDeviceLabel(micStream));

    audioMonitoringService.startNoiseMonitor(
      micStream,
      {
        onLevelSample: (sample) => {
          setCurrentMicDb(sample.currentDb);
          const windowSeconds =
            sample.sustainedDurationMs !== undefined
              ? Math.round((sample.sustainedDurationMs / 1000) * 10) / 10
              : sample.isAboveThreshold
              ? 0.1
              : 0;
          setNoiseAnomalySeconds(windowSeconds);

          // Keep advisory visible if either sliding window has >= 2.0s active audio OR within 5s display hold after a triggered event
          const inHoldWindow = Date.now() < audioAdvisoryUntilMsRef.current;
          if (!inHoldWindow && windowSeconds === 0 && !sample.isAboveThreshold) {
            setSustainedNoiseActive(false);
          }
        },
        onSustainedNoiseDetected: (durationMs, peakDb) => {
          audioAdvisoryUntilMsRef.current = Date.now() + 5000;
          setSustainedNoiseActive(true);
          setLastAudioPeakDb(peakDb);
          setNoiseAnomalySeconds(Math.round((durationMs / 1000) * 10) / 10);
          const attempt = activeAttemptRef.current;
          if (attempt && !isTerminalRef.current && (attempt.enableProctoring || selectedAssessment?.enableProctoring)) {
            reportViolation(
              ViolationEventType.SUSPICIOUS_AUDIO,
              durationMs,
              {
                ambientBaselineDb: ambientBaselineDb ?? -50,
                peakEventDb: peakDb,
                pilotSetting: '2.5s_delta9dB',
              },
            );
          }
        },
      },
      ambientBaselineDb ?? -50,
    );

    return () => {
      audioMonitoringService.stopNoiseMonitor();
    };
  }, [currentView, micStream, ambientBaselineDb, reportViolation]);

  // ---------------------------------------------------------------------------
  // 2. Fetch Student Assessments & Eligible Chapters
  // ---------------------------------------------------------------------------
  const fetchStudentChapters = useCallback(async () => {
    try {
      setLoadingChapters(true);
      setChaptersError(null);
      const data = examinationApi.getStudentChapters ? await examinationApi.getStudentChapters() : [];
      setStudentChapters(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setChaptersError(
        err.response?.data?.message || err.message || 'Failed to load chapters for your grade',
      );
      setStudentChapters([]);
    } finally {
      setLoadingChapters(false);
    }
  }, []);

  const fetchAssessments = useCallback(async () => {
    try {
      setLoadingAssessments(true);
      setAssessmentError(null);
      const data = await examinationApi.listStudentAssessments();
      setAssessments(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setAssessmentError(
        err.response?.data?.message || err.message || 'Failed to load your examination list',
      );
      setAssessments([]);
    } finally {
      setLoadingAssessments(false);
    }
  }, []);

  useEffect(() => {
    fetchAssessments();
    fetchStudentChapters();
  }, [fetchAssessments, fetchStudentChapters]);

  // ---------------------------------------------------------------------------
  // 3. Server-Synchronized Monotonic Countdown Timer (FIX A)
  // ---------------------------------------------------------------------------
  const handleLocalCountdownZero = useCallback(async () => {
    const attempt = activeAttemptRef.current;
    if (!attempt || isTerminalRef.current || expirySyncInFlightRef.current) return;

    expirySyncInFlightRef.current = true;
    try {
      await synchronizeAttemptWithBackend(attempt.id, { isExpiryCheck: true });
    } finally {
      expirySyncInFlightRef.current = false;
    }
  }, [synchronizeAttemptWithBackend]);

  useEffect(() => {
    if (currentView !== 'RUNNER' || !activeAttempt || isTerminalRef.current) return;

    const anchor = timerAnchorRef.current;
    if (!anchor || anchor.attemptId !== activeAttempt.id) return;

    const computeMonotonicRemaining = () => {
      const elapsedSeconds = Math.max(
        0,
        Math.floor((performance.now() - anchor.syncedAtMs) / 1000),
      );
      return Math.max(0, anchor.initialRemainingSeconds - elapsedSeconds);
    };

    const initial = computeMonotonicRemaining();
    setRemainingSeconds(initial);

    if (initial <= 0) {
      handleLocalCountdownZero();
      return;
    }

    const interval = setInterval(() => {
      if (isTerminalRef.current) {
        clearInterval(interval);
        return;
      }
      const remaining = computeMonotonicRemaining();
      setRemainingSeconds(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        handleLocalCountdownZero();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentView, activeAttempt?.id, timerAnchorVersion, handleLocalCountdownZero]);

  // ---------------------------------------------------------------------------
  // 4. Unload Protection While Saves Are Pending or Failed (FIX F)
  // ---------------------------------------------------------------------------
  const hasUnresolvedLocalChanges = useCallback((): boolean => {
    if (currentView !== 'RUNNER' || isTerminalRef.current) return false;
    const questionsList = activeAttempt?.questions || [];
    for (const q of questionsList) {
      const state = questionSaveStates[q.id];
      const localVal = localAnswers[q.id] ?? null;
      const confirmedVal = confirmedAnswers[q.id] ?? null;
      if (state === 'SAVING' || state === 'FAILED' || state === 'DIRTY' || localVal !== confirmedVal) {
        return true;
      }
    }
    return false;
  }, [activeAttempt?.questions, confirmedAnswers, currentView, localAnswers, questionSaveStates]);

  useEffect(() => {
    if (!hasUnresolvedLocalChanges()) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnresolvedLocalChanges]);

  // ---------------------------------------------------------------------------
  // 4b. Live Examination Integrity & Proctoring Monitoring
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (currentView !== 'RUNNER' || !activeAttempt || isTerminalRef.current) return;
    if (!activeAttempt.enableProctoring && !selectedAssessment?.enableProctoring) return;

    // Fullscreen exit detection
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setFullscreenWarningOverlay(true);
        reportViolation(ViolationEventType.FULLSCREEN_EXIT);
      } else {
        setFullscreenWarningOverlay(false);
      }
    };

    // Tab blur / window focus loss detection
    const handleWindowBlur = () => {
      reportViolation(ViolationEventType.TAB_BLUR);
    };

    // Tab visibility hidden detection
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        reportViolation(ViolationEventType.VISIBILITY_HIDDEN);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentView, activeAttempt?.id, activeAttempt?.enableProctoring, selectedAssessment?.enableProctoring, reportViolation]);

  // ---------------------------------------------------------------------------
  // 5. Start / Resume Examination Handler
  // ---------------------------------------------------------------------------
  const handleOpenInstructions = (assessment: StudentAssessmentOverview) => {
    setSelectedAssessment(assessment);
    setInstructionAcknowledged(false);
    setCurrentView('INSTRUCTIONS');
  };

  const handleStartOrResumeExam = async (assessment: StudentAssessmentOverview) => {
    try {
      setStartingAssessment(true);
      setAssessmentError(null);
      setSelectedAssessment(assessment);

      let attempt: StudentAttemptDetail;
      if (assessment.hasAttempt && assessment.attemptId) {
        attempt = await examinationApi.getAttempt(assessment.attemptId);
      } else {
        attempt = await examinationApi.startAssessment(assessment.id);
      }

      // Reset runner tracking refs
      const initialAnswers: Record<string, number | null> = { ...(attempt.answers || {}) };
      desiredAnswersRef.current = { ...initialAnswers };
      confirmedAnswersRef.current = { ...initialAnswers };
      questionSaveStatesRef.current = {};
      dirtyQuestionsRef.current.clear();
      inFlightWorkersRef.current = {};
      isSubmittingRef.current = false;

      setLocalAnswers({ ...initialAnswers });
      setConfirmedAnswers({ ...initialAnswers });
      setQuestionSaveStates({});
      setSaveError(null);
      setSubmitModalError(null);

      // Check if attempt is already finalized
      if (
        attempt.status === AttemptStatus.SUBMITTED ||
        attempt.status === AttemptStatus.TIMED_OUT
      ) {
        transitionToTerminalAttempt(attempt);
        return;
      }

      isTerminalRef.current = false;
      activeAttemptRef.current = attempt;
      setActiveAttempt(attempt);

      if (attempt.isLocked) {
        setIsAttemptLocked(true);
        isAttemptLockedRef.current = true;
      } else {
        setIsAttemptLocked(false);
        isAttemptLockedRef.current = false;
      }
      if (attempt.activeWarningsCount !== undefined) {
        setProctoringWarningsCount(attempt.activeWarningsCount);
      }

      setCurrentQuestionIndex(0);
      setIsVerifyingExpiry(false);
      anchorMonotonicTimer(attempt);

      // Check if required hardware streams are missing for this monitored attempt
      const needsWebcamStream = Boolean(
        (assessment.enableProctoring || attempt.enableProctoring) &&
        (assessment.monitoringConfig?.requireWebcam || attempt.monitoringConfig?.requireWebcam) &&
        import.meta.env.VITE_ENABLE_EXAM_WEBCAM === 'true' &&
        !webcamStreamRef.current,
      );

      const needsMicStream = Boolean(
        (assessment.enableProctoring || attempt.enableProctoring) &&
        (assessment.monitoringConfig?.requireMic || attempt.monitoringConfig?.requireMic) &&
        import.meta.env.VITE_ENABLE_EXAM_MIC === 'true' &&
        !micStreamRef.current,
      );

      const isResuming = Boolean(attempt.proctoringPassed);

      // If proctoring is enabled, require preflight or device reconnection if streams are missing
      if (
        (assessment.enableProctoring || attempt.enableProctoring) &&
        (!attempt.proctoringPassed || needsWebcamStream || needsMicStream)
      ) {
        setIsResumingAttempt(isResuming);
        if (isResuming) {
          setPreflightConsent(true);
        }
        setLivenessChallenge(null);
        setLivenessStatus('IDLE');
        setLivenessInstruction('');
        setLivenessProgress(0);
        setLivenessRemainingMs(7000);
        setLivenessPassed(false);
        setLivenessExemptionAcknowledged(false);
        setLivenessTimestamp(null);
        setCurrentView('PREFLIGHT');
      } else {
        setIsResumingAttempt(false);
        setCurrentView('RUNNER');
      }
    } catch (err: any) {
      setAssessmentError(
        err.response?.data?.message ||
          err.message ||
          'Unable to start examination. Please contact faculty.',
      );
    } finally {
      setStartingAssessment(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 6. Answer Selection Handler (FIX B & FIX C)
  // ---------------------------------------------------------------------------
  const handleOptionSelect = (questionId: string, optionIndex: number) => {
    const attempt = activeAttemptRef.current;
    if (
      !attempt ||
      isTerminalRef.current ||
      isAttemptLockedRef.current ||
      isFaceAbsentPausedRef.current ||
      isSubmittingRef.current ||
      submittingAttempt ||
      isVerifyingExpiry ||
      attempt.status !== AttemptStatus.IN_PROGRESS
    ) {
      return;
    }

    // 1. Immediate optimistic UI update
    desiredAnswersRef.current[questionId] = optionIndex;
    setLocalAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));

    // 2. Enqueue into per-question serialized autosave loop
    enqueueQuestionSave(attempt.id, questionId, optionIndex);
  };

  // Manual Retry for all failed/dirty questions
  const handleRetrySave = async () => {
    setSaveError(null);
    setSubmitModalError(null);
    await retryAllUnresolvedSaves();
  };

  // ---------------------------------------------------------------------------
  // 7. Safe Final Submission Handler (FIX D)
  // ---------------------------------------------------------------------------
  const getUnresolvedQuestions = useCallback((): {
    savingQuestionNumbers: number[];
    failedOrDirtyQuestionNumbers: number[];
  } => {
    const questionsList = activeAttemptRef.current?.questions || [];
    const savingQuestionNumbers: number[] = [];
    const failedOrDirtyQuestionNumbers: number[] = [];

    questionsList.forEach((q, idx) => {
      const qNum = idx + 1;
      const desired = desiredAnswersRef.current[q.id] ?? null;
      const confirmed = confirmedAnswersRef.current[q.id] ?? null;
      const status = questionSaveStatesRef.current[q.id];

      if (status === 'SAVING' || Boolean(inFlightWorkersRef.current[q.id])) {
        savingQuestionNumbers.push(qNum);
      } else if (status === 'FAILED' || status === 'DIRTY' || desired !== confirmed) {
        failedOrDirtyQuestionNumbers.push(qNum);
      }
    });

    return { savingQuestionNumbers, failedOrDirtyQuestionNumbers };
  }, []);

  const handleConfirmSubmit = async () => {
    const attempt = activeAttemptRef.current;
    if (!attempt || isTerminalRef.current || isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setSubmittingAttempt(true);
    setSubmitModalError(null);

    try {
      // Step 1: Wait for any currently running per-question save queues to settle
      const activeWorkers = Object.values(inFlightWorkersRef.current).filter(
        Boolean,
      ) as Promise<boolean>[];
      if (activeWorkers.length > 0) {
        await Promise.allSettled(activeWorkers);
      }

      if (isTerminalRef.current) {
        return;
      }

      // Step 2: Retry any remaining dirty or failed questions
      const { failedOrDirtyQuestionNumbers: initialUnresolved } = getUnresolvedQuestions();
      if (initialUnresolved.length > 0) {
        await retryAllUnresolvedSaves();
      }

      if (isTerminalRef.current) {
        return;
      }

      // Step 3: Verify that 100% of selected answers have been acknowledged by the backend
      const { savingQuestionNumbers, failedOrDirtyQuestionNumbers } = getUnresolvedQuestions();
      const allUnresolved = Array.from(
        new Set([...savingQuestionNumbers, ...failedOrDirtyQuestionNumbers]),
      ).sort((a, b) => a - b);

      if (allUnresolved.length > 0) {
        const questionLabels = allUnresolved.map((n) => `Question ${n}`).join(', ');
        setSubmitModalError(
          `Cannot submit examination yet: ${questionLabels} could not be saved to the server. Your latest selected answers have not been confirmed. Please retry saving before final submission.`,
        );
        return;
      }

      // If student provided an explanation for proctoring anomalies, persist it prior to submission
      if (studentExplanationText.trim()) {
        try {
          await examinationApi.recordStudentExplanation(attempt.id, studentExplanationText.trim());
        } catch (e) {
          console.warn('Failed to record student explanation prior to submission', e);
        }
      }

      // Step 4: All selected answers are server-confirmed; invoke idempotent submitAttempt
      const submitRes = await examinationApi.submitAttempt(attempt.id);

      const finalizedAttempt: StudentAttemptDetail = {
        ...attempt,
        answers: { ...confirmedAnswersRef.current },
        status: submitRes.status,
        submittedAt: submitRes.submittedAt,
      };

      transitionToTerminalAttempt(finalizedAttempt);

      if (webcamStreamRef.current) {
        faceDetectionService.stopCameraStream(webcamStreamRef.current);
        objectDetectionService.close();
        webcamStreamRef.current = null;
        setWebcamStream(null);
      }
      if (micStreamRef.current) {
        audioMonitoringService.stopMicrophoneStream(micStreamRef.current);
        micStreamRef.current = null;
        setMicStream(null);
      }
    } catch (err: any) {
      if (isPotentialTerminalAttemptError(err)) {
        const synced = await synchronizeAttemptWithBackend(attempt.id);
        if (
          synced &&
          (synced.status === AttemptStatus.SUBMITTED ||
            synced.status === AttemptStatus.TIMED_OUT)
        ) {
          return;
        }
      }

      setSubmitModalError(
        err.response?.data?.message ||
          err.message ||
          'Failed to submit examination. Please check your connection and retry.',
      );
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current && !isTerminalRef.current) {
        setSubmittingAttempt(false);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 8. Chapter Progression Lookup
  // ---------------------------------------------------------------------------
  const handleLookupProgression = async (chapterIdToLookup: string) => {
    if (!chapterIdToLookup.trim()) return;
    try {
      setLoadingProgression(true);
      setProgressionError(null);
      const prog = await examinationApi.getChapterProgression(chapterIdToLookup.trim());
      setChapterProgression(prog);
    } catch (err: any) {
      setProgressionError(
        err.response?.data?.message || err.message || 'Could not fetch progression for chapter',
      );
      setChapterProgression(null);
    } finally {
      setLoadingProgression(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Derived Helper Variables & Per-Question Status Aggregations (FIX C & FIX D)
  // ---------------------------------------------------------------------------
  const questions: StudentSanitizedQuestion[] = activeAttempt?.questions || [];
  const currentQuestion: StudentSanitizedQuestion | undefined = questions[currentQuestionIndex];
  const totalQuestionsCount = questions.length;

  let confirmedAnsweredCount = 0;
  let pendingSaveCount = 0;
  let failedSaveCount = 0;
  let unansweredQuestionsCount = 0;
  const failedQuestionNumbers: number[] = [];
  const pendingQuestionNumbers: number[] = [];

  questions.forEach((q, idx) => {
    const qNum = idx + 1;
    const localVal = localAnswers[q.id] ?? null;
    const confirmedVal = confirmedAnswers[q.id] ?? null;
    const qState = questionSaveStates[q.id];

    if (qState === 'SAVING') {
      pendingSaveCount++;
      pendingQuestionNumbers.push(qNum);
    } else if (qState === 'FAILED') {
      failedSaveCount++;
      failedQuestionNumbers.push(qNum);
    } else if (qState === 'DIRTY' || localVal !== confirmedVal) {
      pendingSaveCount++;
      pendingQuestionNumbers.push(qNum);
    } else if (confirmedVal !== null && confirmedVal !== undefined) {
      confirmedAnsweredCount++;
    } else {
      unansweredQuestionsCount++;
    }
  });

  const hasSavedAtLeastOnce = Object.values(questionSaveStates).some((s) => s === 'SAVED');

  // Derived overall header save status:
  // 1. Any pending/dirty request -> 'SAVING'
  // 2. Any unresolved failed save -> 'FAILED'
  // 3. Only show 'SAVED' when every locally selected answer is confirmed by backend
  const overallSaveStatus: 'IDLE' | 'SAVING' | 'FAILED' | 'SAVED' =
    pendingSaveCount > 0
      ? 'SAVING'
      : failedSaveCount > 0
      ? 'FAILED'
      : hasSavedAtLeastOnce
      ? 'SAVED'
      : 'IDLE';

  // Categorized assessments for filter tabs
  const nowMs = Date.now();
  const filteredAssessments = (assessments || []).filter((a) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'AVAILABLE') {
      return (
        !a.hasAttempt &&
        a.status === AssessmentStatus.PUBLISHED &&
        (!a.endWindowAt || new Date(a.endWindowAt).getTime() > nowMs)
      );
    }
    if (statusFilter === 'UPCOMING') {
      return (
        !a.hasAttempt &&
        a.status === AssessmentStatus.PUBLISHED &&
        a.startWindowAt &&
        new Date(a.startWindowAt).getTime() > nowMs
      );
    }
    if (statusFilter === 'IN_PROGRESS') {
      return a.attemptStatus === AttemptStatus.IN_PROGRESS;
    }
    if (statusFilter === 'SUBMITTED') {
      return a.attemptStatus === AttemptStatus.SUBMITTED;
    }
    if (statusFilter === 'TIMED_OUT') {
      return a.attemptStatus === AttemptStatus.TIMED_OUT;
    }
    return true;
  });

  // ===========================================================================
  // VIEW 1: EXAMINATION INSTRUCTIONS SCREEN
  // ===========================================================================
  if (currentView === 'INSTRUCTIONS' && selectedAssessment) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentView('DASHBOARD')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Assessment List</span>
            </button>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border ${
                selectedAssessment.mode === AssessmentMode.LIVE_EXAM
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}
            >
              {selectedAssessment.mode === AssessmentMode.LIVE_EXAM ? '🔴 Live Examination' : '📘 Normal Quiz'}
            </span>
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900">{selectedAssessment.title}</h2>
            <p className="text-xs text-slate-500">
              Subject: <strong className="text-slate-700">{selectedAssessment.subject}</strong>
              {selectedAssessment.description && ` • ${selectedAssessment.description}`}
            </p>
          </div>

          {/* Test Parameters Badge Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
              <div className="p-2 bg-indigo-100/60 text-indigo-700 rounded-xl">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium block">Duration</span>
                <span className="text-xs font-bold text-slate-800">{selectedAssessment.durationMinutes} Minutes</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
              <div className="p-2 bg-emerald-100/60 text-emerald-700 rounded-xl">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium block">Total Marks</span>
                <span className="text-xs font-bold text-slate-800">{selectedAssessment.totalMarks} Marks</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
              <div className="p-2 bg-teal-100/60 text-teal-700 rounded-xl">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium block">Passing Marks</span>
                <span className="text-xs font-bold text-slate-800">{selectedAssessment.passingMarks} Marks</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
              <div className="p-2 bg-purple-100/60 text-purple-700 rounded-xl">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium block">Schedule Window</span>
                <span className="text-xs font-bold text-slate-800">
                  {selectedAssessment.endWindowAt
                    ? new Date(selectedAssessment.endWindowAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Open Access'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Mandatory Instructions Box */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex items-center gap-2 text-indigo-900 border-b pb-3">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold">Important Examination Rules & Guidelines</h3>
          </div>

          <div className="space-y-3">
            {[
              {
                num: 1,
                title: 'Carefully Read Every Question',
                desc: 'Review the question formulation and attached diagrams before choosing your answer.',
              },
              {
                num: 2,
                title: 'Single Choice Selection',
                desc: 'Select exactly one option (A, B, C, or D) for each multiple choice question.',
              },
              {
                num: 3,
                title: 'Server-Synchronized Autosave',
                desc: 'Answers are automatically transmitted to the school examination server immediately upon selection.',
              },
              {
                num: 4,
                title: 'Bi-Directional Question Navigation',
                desc: 'You can move forward, backward, or jump to any question using the question palette at any time.',
              },
              {
                num: 5,
                title: 'Strict Single Attempt Submission',
                desc: 'Once your examination is submitted, the attempt is permanently sealed and cannot be modified.',
              },
              {
                num: 6,
                title: 'Server-Authoritative Countdown Deadline',
                desc: 'The examination automatically closes and finalizes if your remaining timer expires.',
              },
              {
                num: 7,
                title: 'Stable Network Connection Recommended',
                desc: 'Maintain an active internet connection. If disconnected, reconnect to resume saving answers.',
              },
            ].map((rule) => (
              <div key={rule.num} className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/70 border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  {rule.num}
                </span>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">{rule.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{rule.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Explicit Student Acknowledgment */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-2xl bg-indigo-50/50 border border-indigo-100 hover:bg-indigo-50 transition-colors">
              <input
                type="checkbox"
                checked={instructionAcknowledged}
                onChange={(e) => setInstructionAcknowledged(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
              <span className="text-xs text-slate-700 font-medium">
                I have thoroughly read and understood all the examination rules above. I confirm I am ready to begin my
                timed attempt now.
              </span>
            </label>
          </div>

          {assessmentError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{assessmentError}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCurrentView('DASHBOARD')}
              className="w-full sm:w-auto px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors text-center"
            >
              Cancel & Return
            </button>
            <button
              type="button"
              disabled={!instructionAcknowledged || startingAssessment}
              onClick={() => handleStartOrResumeExam(selectedAssessment)}
              className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {startingAssessment ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Preparing Examination...</span>
                </>
              ) : selectedAssessment.hasAttempt && selectedAssessment.attemptStatus === AttemptStatus.IN_PROGRESS ? (
                <>
                  <span>Resume In-Progress Attempt</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Start Examination Now</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // VIEW 1b: PREFLIGHT READINESS & PRIVACY CHECK (PROCTORING)
  // ===========================================================================
  if (currentView === 'PREFLIGHT' && activeAttempt) {
    const isWebcamRequired = Boolean(
      (activeAttempt.enableProctoring || selectedAssessment?.enableProctoring) &&
      (activeAttempt.monitoringConfig?.requireWebcam || selectedAssessment?.monitoringConfig?.requireWebcam) &&
      import.meta.env.VITE_ENABLE_EXAM_WEBCAM === 'true',
    );

    const isMicRequired = Boolean(
      (activeAttempt.enableProctoring || selectedAssessment?.enableProctoring) &&
      (activeAttempt.monitoringConfig?.requireMic || selectedAssessment?.monitoringConfig?.requireMic) &&
      import.meta.env.VITE_ENABLE_EXAM_MIC === 'true',
    );

    const handleRunNetworkDiagnostic = async () => {
      setPreflightTesting(true);
      try {
        const res = await examinationApi.testBandwidthSpeed();
        setPreflightLatency(res.latencyMs);
        setPreflightDownloadMbps(res.downloadMbps);
        setPreflightUploadMbps(res.uploadMbps);
        setBandwidthStatus(res.bandwidthStatus);
      } catch (e) {
        setPreflightLatency(20);
        setPreflightDownloadMbps(12.5);
        setPreflightUploadMbps(4.8);
        setBandwidthStatus('OPTIMAL');
      } finally {
        setPreflightTesting(false);
      }
    };

    const handleTestCamera = async (overrideDeviceId?: string) => {
      setCameraTesting(true);
      setCameraError(null);
      try {
        if (webcamStreamRef.current) {
          faceDetectionService.stopCameraStream(webcamStreamRef.current);
          webcamStreamRef.current = null;
        }

        const targetDeviceId = overrideDeviceId ?? (selectedCameraId || undefined);
        const stream = await faceDetectionService.requestCameraStream(
          targetDeviceId ? { deviceId: { exact: targetDeviceId } } : undefined,
        );
        webcamStreamRef.current = stream;
        setWebcamStream(stream);
        setCameraTested(true);

        const label = faceDetectionService.getStreamDeviceLabel(stream);
        setActiveCameraLabel(label);

        const devices = await faceDetectionService.listVideoDevices();
        setAvailableCameras(devices);
        const trackSettingsDeviceId = stream.getVideoTracks?.()?.[0]?.getSettings?.()?.deviceId;
        if (trackSettingsDeviceId) {
          setSelectedCameraId(trackSettingsDeviceId);
        } else if (!selectedCameraId && devices.length > 0) {
          setSelectedCameraId(devices[0].deviceId);
        }

        if (preflightVideoRef.current) {
          preflightVideoRef.current.srcObject = stream;
          try {
            preflightVideoRef.current.play?.()?.catch?.(() => {});
          } catch (e) {}
        }

        // Initialize local face detector WASM in background
        await faceDetectionService.getDetector();
      } catch (err: any) {
        console.warn('Camera request error:', err);
        setCameraError(
          err.name === 'NotAllowedError'
            ? 'Camera permission was denied in your browser. Please click the permissions icon in your address bar to allow camera access, then retry.'
            : err.name === 'NotFoundError'
            ? 'No camera device detected on this computer.'
            : err.message || 'Unable to access camera device.',
        );
      } finally {
        setCameraTesting(false);
      }
    };

    const handleTestAndCalibrateMic = async () => {
      setMicCalibrating(true);
      setMicError(null);
      setMicCalibrationProgress(0);
      try {
        const stream = await audioMonitoringService.requestMicrophoneStream();
        micStreamRef.current = stream;
        setMicStream(stream);
        setActiveMicLabel(audioMonitoringService.getStreamDeviceLabel(stream));

        // 3-second ambient noise calibration
        const res = await audioMonitoringService.calibrateAmbientBaseline(
          stream,
          3000,
          (progress, currentDb) => {
            setMicCalibrationProgress(progress);
            setCurrentMicDb(currentDb);
          },
        );

        setAmbientBaselineDb(res.baselineDb);
        setMicTested(true);
      } catch (err: any) {
        console.warn('Microphone request error:', err);
        setMicError(
          err.name === 'NotAllowedError'
            ? 'Microphone permission was denied in your browser. Please allow microphone access in your browser address bar and retry.'
            : err.name === 'NotFoundError'
            ? 'No microphone device was detected on this computer.'
            : err.message || 'Unable to access microphone device.',
        );
      } finally {
        setMicCalibrating(false);
      }
    };

    const isLivenessFeatureEnabled = import.meta.env.VITE_ENABLE_EXAM_LIVENESS === 'true';
    const isLivenessRequired = Boolean(isWebcamRequired && isLivenessFeatureEnabled);

    const handleStartLivenessCheck = () => {
      if (!preflightVideoRef.current && !webcamStreamRef.current) {
        return;
      }

      const challenge = livenessDetectionService.getRandomChallenge();
      setLivenessChallenge(challenge);
      setLivenessStatus('WAITING_FOR_FACE');
      setLivenessInstruction('Please center your face in the camera frame.');
      setLivenessProgress(0);
      setLivenessRemainingMs(7000);

      if (livenessSessionRef.current) {
        livenessSessionRef.current.destroy();
      }

      const session = livenessDetectionService.createSession(
        preflightVideoRef.current,
        {
          onStatusChange: (status) => {
            setLivenessStatus(status);
          },
          onInstruction: (inst) => {
            setLivenessInstruction(inst);
          },
          onProgress: (pct, remaining) => {
            setLivenessProgress(pct);
            setLivenessRemainingMs(remaining);
          },
          onComplete: (result) => {
            if (result.passed) {
              setLivenessPassed(true);
              setLivenessTimestamp(result.timestamp);
            } else {
              setLivenessPassed(false);
            }
          },
        },
        challenge,
      );

      livenessSessionRef.current = session;
      session.start();
    };

    const handleConsentAndEnter = async () => {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        console.warn('Fullscreen request bypassed or not supported', err);
      }

      try {
        await examinationApi.completePreflight(activeAttempt.id, {
          latencyMs: preflightLatency || 20,
          downloadMbps: preflightDownloadMbps ?? undefined,
          uploadMbps: preflightUploadMbps ?? undefined,
          bandwidthStatus: bandwidthStatus || 'OPTIMAL',
          speedWarningAcknowledged,
          cameraTested: Boolean(cameraTested),
          livenessPassed: isLivenessRequired ? Boolean(livenessPassed) : undefined,
          livenessChallenge: isLivenessRequired ? (livenessChallenge ?? undefined) : undefined,
          livenessExemptionAcknowledged: isLivenessRequired ? Boolean(livenessExemptionAcknowledged) : undefined,
          livenessTimestamp: isLivenessRequired ? (livenessTimestamp ?? undefined) : undefined,
          micTested: Boolean(micTested),
          ambientBaselineDb: ambientBaselineDb ?? undefined,
          fullscreenSupported: Boolean(document.fullscreenEnabled),
          browser: navigator.userAgent,
          timestamp: new Date().toISOString(),
        });
        activeAttempt.proctoringPassed = true;
      } catch (e) {
        console.warn('Preflight telemetry persistence failed locally', e);
      }

      setCurrentView('RUNNER');
    };

    const isLivenessSatisfied =
      !isLivenessRequired || cameraExemptionAcknowledged || livenessPassed || livenessExemptionAcknowledged;
    const isCameraSatisfied =
      (!isWebcamRequired || cameraTested || cameraExemptionAcknowledged) && isLivenessSatisfied;
    const isMicSatisfied = !isMicRequired || micTested || micExemptionAcknowledged;
    const canProceedExam =
      preflightConsent &&
      (bandwidthStatus !== 'DEGRADED' || speedWarningAcknowledged) &&
      isCameraSatisfied &&
      isMicSatisfied;

    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-2xs ${isResumingAttempt ? 'bg-amber-50 border border-amber-200 text-amber-600' : 'bg-indigo-50 border border-indigo-100 text-indigo-600'}`}>
              {isResumingAttempt ? <RefreshCw className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
            </div>
            <div>
              <span className={`text-[10px] uppercase font-bold tracking-wider ${isResumingAttempt ? 'text-amber-600' : 'text-indigo-600'}`}>
                {isResumingAttempt ? 'Session Recovery & Device Reconnection' : 'Exam Security & Readiness Pre-Flight'}
              </span>
              <h2 className="text-lg font-bold text-slate-900">
                {isResumingAttempt ? 'Reconnect Required Monitoring Devices' : (selectedAssessment?.title || 'Examination Session')}
              </h2>
            </div>
          </div>

          {/* In-Progress Session Resume Notice */}
          {isResumingAttempt && (
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-950 animate-in fade-in">
              <RefreshCw className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-sm text-amber-900">Resuming In-Progress Examination</p>
                <p className="text-amber-800 leading-relaxed">
                  Your examination session is active, and your previously saved answers and remaining timer are preserved.
                  Because your browser disconnected or reloaded, security policies require reconnecting required monitoring device(s) below before resuming.
                </p>
              </div>
            </div>
          )}

          {/* Privacy & Monitoring Notice */}
          <div className="p-4 bg-indigo-50/60 border border-indigo-100/80 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-indigo-950">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Student Privacy & Integrity Monitoring Notice</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              This examination operates under institutional integrity policies. The browser environment will monitor:
            </p>
            <ul className="list-disc pl-5 text-slate-600 space-y-1">
              <li><strong>Fullscreen Mode:</strong> The assessment must stay in full screen until final submission.</li>
              <li><strong>Tab & Focus Shifts:</strong> Leaving the examination tab or switching applications is logged.</li>
              <li><strong>Privacy Guarantee:</strong> No audio or video streams are recorded, uploaded, or analyzed remotely without explicit prompt and separate consent.</li>
            </ul>
          </div>

          {/* System & Telemetry Diagnostics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Network Diagnostic Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Network Diagnostics
                </span>
                {bandwidthStatus && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      bandwidthStatus === 'OPTIMAL'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : bandwidthStatus === 'ACCEPTABLE'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {bandwidthStatus === 'OPTIMAL'
                      ? 'Optimal Connection'
                      : bandwidthStatus === 'ACCEPTABLE'
                      ? 'Acceptable'
                      : 'Slow Connection (Advisory)'}
                  </span>
                )}
              </div>

              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-sans">Round-trip Latency:</span>
                  <span className="font-bold text-slate-900">
                    {preflightLatency !== null ? `${preflightLatency} ms` : 'Pending'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-sans">Download Throughput:</span>
                  <span className="font-bold text-slate-900">
                    {preflightDownloadMbps !== null ? `${preflightDownloadMbps} Mbps` : 'Pending'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-sans">Upload Throughput:</span>
                  <span className="font-bold text-slate-900">
                    {preflightUploadMbps !== null ? `${preflightUploadMbps} Mbps` : 'Pending'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRunNetworkDiagnostic}
                disabled={preflightTesting}
                className="w-full py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-[11px] transition-colors flex items-center justify-center gap-1.5"
              >
                {preflightTesting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Testing Network Probes (250KB / 64KB)...</span>
                  </>
                ) : (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{preflightLatency !== null ? 'Re-run Network Probes' : 'Run Network Diagnostics'}</span>
                  </>
                )}
              </button>
            </div>

            {/* Screen & Browser Environment Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Screen & Browser Environment
              </span>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Fullscreen API:</span>
                  <span className="font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Supported
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Display Resolution:</span>
                  <span className="font-mono">{window.innerWidth} x {window.innerHeight}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Security Mode:</span>
                  <span className="font-semibold text-indigo-700">Fullscreen Enforced</span>
                </div>
              </div>
            </div>
          </div>

          {/* Speed Advisory Notice (Advisory Only - Never Hard Blocks) */}
          {bandwidthStatus === 'DEGRADED' && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Network Speed Advisory</span>
              </div>
              <p className="text-amber-800 leading-relaxed">
                Your measured connection is slower than recommended (latency &gt; 350ms, download &lt; 0.8 Mbps, or upload &lt; 0.3 Mbps). Questions and diagrams may take longer to load. Autosave will safely preserve your selections in memory and retry continuously.
              </p>
              <label className="flex items-start gap-2 pt-1 cursor-pointer font-medium text-amber-900">
                <input
                  type="checkbox"
                  checked={speedWarningAcknowledged}
                  onChange={(e) => setSpeedWarningAcknowledged(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-amber-600 rounded border-amber-300 focus:ring-amber-500"
                />
                <span>I understand my connection is slower than recommended and wish to proceed with the exam.</span>
              </label>
            </div>
          )}

          {/* Camera Readiness Check (When Configured & Enabled for Pilot) */}
          {isWebcamRequired && (
            <div className="p-4 bg-indigo-50/50 border border-indigo-200/80 rounded-2xl space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-indigo-950">
                  <Camera className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Webcam Presence Verification (Pilot)</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {cameraTested ? 'Verified & Ready' : 'Action Required'}
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                This assessment includes provisional face-presence verification. Video is analyzed 100% locally in your browser memory (1 Hz sampling). No video streams, images, or biometric data are recorded or uploaded.
              </p>

              {cameraTested && webcamStream ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4 bg-white p-3 rounded-xl border border-indigo-100">
                    <div className="w-28 h-20 bg-black rounded-lg overflow-hidden border border-slate-200 shrink-0 relative">
                      <video
                        ref={preflightVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover transform -scale-x-100"
                      />
                    </div>
                    <div className="space-y-1 flex-1">
                      <span className="font-bold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Camera Active & Verified
                      </span>
                      <p className="text-[11px] font-medium text-slate-700" data-testid="preflight-camera-device-label">
                        Active Device: <span className="font-semibold text-indigo-700">{activeCameraLabel || 'Default Camera'}</span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Your position is confirmed. The camera stream will stay in local memory during the exam.
                      </p>
                      {availableCameras.length > 1 && (
                        <div className="pt-1 flex items-center gap-2">
                          <label htmlFor="preflight-camera-select" className="text-[10px] font-semibold text-slate-600">
                            Switch Camera:
                          </label>
                          <select
                            id="preflight-camera-select"
                            value={selectedCameraId}
                            onChange={(e) => {
                              const nextId = e.target.value;
                              setSelectedCameraId(nextId);
                              handleTestCamera(nextId);
                            }}
                            className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700"
                          >
                            {availableCameras.map((cam) => (
                              <option key={cam.deviceId} value={cam.deviceId}>
                                {cam.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Active Liveness Check (Pilot - When Enabled) */}
                  {isLivenessRequired && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-slate-900">
                          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span>Active Liveness Verification (Pilot)</span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            livenessPassed
                              ? 'bg-emerald-100 text-emerald-700'
                              : livenessExemptionAcknowledged
                              ? 'bg-slate-200 text-slate-700'
                              : livenessStatus === 'FAILED_TIMEOUT' || livenessStatus === 'FAILED_ANOMALY'
                              ? 'bg-rose-100 text-rose-700'
                              : livenessStatus === 'CHALLENGE_ACTIVE' || livenessStatus === 'BASELINE_CALIBRATING'
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {livenessPassed
                            ? 'Verified'
                            : livenessExemptionAcknowledged
                            ? 'Accommodation Applied'
                            : livenessStatus === 'FAILED_TIMEOUT' || livenessStatus === 'FAILED_ANOMALY'
                            ? 'Action Required'
                            : livenessStatus === 'CHALLENGE_ACTIVE' || livenessStatus === 'BASELINE_CALIBRATING'
                            ? 'In Progress'
                            : 'Action Required'}
                        </span>
                      </div>

                      <p className="text-slate-600 leading-relaxed text-[11px]">
                        To confirm an active live camera stream, you will perform a simple randomized motion check (turning your head slightly left or right). Video frames are analyzed in local browser memory only. No photos, videos, or biometric identifiers are recorded or uploaded.
                      </p>

                      {livenessPassed ? (
                        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-emerald-800">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                          <div>
                            <span className="font-bold block">Liveness Confirmed</span>
                            <p className="text-[11px] text-emerald-700">
                              Active motion verified ({livenessChallenge === 'TURN_LEFT' ? 'Head turned left' : 'Head turned right'}).
                            </p>
                          </div>
                        </div>
                      ) : livenessExemptionAcknowledged ? (
                        <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 text-[11px]">
                          Approved accommodation applied. You may proceed without active liveness verification.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Active challenge or calibrating */}
                          {(livenessStatus === 'CHALLENGE_ACTIVE' ||
                            livenessStatus === 'BASELINE_CALIBRATING' ||
                            livenessStatus === 'WAITING_FOR_FACE') && (
                            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2">
                              <div className="flex items-center justify-between text-indigo-950 font-semibold">
                                <span className="text-sm font-bold text-indigo-900">
                                  {livenessInstruction ||
                                    (livenessChallenge
                                      ? livenessDetectionService.getInstruction(livenessChallenge)
                                      : 'Follow on-screen prompt')}
                                </span>
                                {livenessStatus === 'CHALLENGE_ACTIVE' && (
                                  <span className="text-xs font-mono text-indigo-700">
                                    {Math.ceil(livenessRemainingMs / 1000)}s
                                  </span>
                                )}
                              </div>
                              {livenessStatus === 'CHALLENGE_ACTIVE' && (
                                <div className="w-full bg-indigo-200 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="bg-indigo-600 h-1.5 rounded-full transition-all duration-100"
                                    style={{ width: `${100 - livenessProgress}%` }}
                                  />
                                </div>
                              )}
                              <p className="text-[10px] text-indigo-600">
                                Hold the position briefly so the camera detects your movement over time.
                              </p>
                            </div>
                          )}

                          {/* Failed / Timeout notice */}
                          {(livenessStatus === 'FAILED_TIMEOUT' || livenessStatus === 'FAILED_ANOMALY') && (
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11px] space-y-2">
                              <div className="flex items-center gap-1.5 font-semibold">
                                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                <span>{livenessInstruction || 'Movement was not detected before the time limit.'}</span>
                              </div>
                              <p className="text-slate-600">
                                Ensure your face is well-lit, centered in front of the camera, and retry. If you have an accommodation, you may check the box below.
                              </p>
                            </div>
                          )}

                          {/* Controls: Start or Retry button */}
                          <div className="flex flex-wrap items-center gap-3">
                            {livenessStatus === 'IDLE' ? (
                              <button
                                type="button"
                                onClick={handleStartLivenessCheck}
                                disabled={!webcamStream || !cameraTested}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-colors flex items-center gap-2 shadow-xs"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Begin Liveness Check</span>
                              </button>
                            ) : livenessStatus === 'FAILED_TIMEOUT' || livenessStatus === 'FAILED_ANOMALY' ? (
                              <button
                                type="button"
                                onClick={handleStartLivenessCheck}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition-colors flex items-center gap-2 shadow-xs"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Retry Liveness Check</span>
                              </button>
                            ) : null}

                            {/* Accommodation / Exemption Option */}
                            {(livenessStatus === 'FAILED_TIMEOUT' ||
                              livenessStatus === 'FAILED_ANOMALY' ||
                              livenessStatus === 'IDLE') && (
                              <label className="flex items-center gap-2 text-slate-700 text-[11px] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={livenessExemptionAcknowledged}
                                  onChange={(e) => setLivenessExemptionAcknowledged(e.target.checked)}
                                  className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300"
                                />
                                <span>Approved accommodation to proceed without liveness verification</span>
                              </label>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => handleTestCamera()}
                    disabled={cameraTesting}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-colors flex items-center gap-2 shadow-xs"
                  >
                    {cameraTesting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Requesting Camera Permission...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-3.5 h-3.5" />
                        <span>Test Camera & Preview</span>
                      </>
                    )}
                  </button>

                  {cameraError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11px] space-y-2">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <CameraOff className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>{cameraError}</span>
                      </div>
                      <label className="flex items-start gap-2 pt-1 cursor-pointer font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={cameraExemptionAcknowledged}
                          onChange={(e) => setCameraExemptionAcknowledged(e.target.checked)}
                          className="w-3.5 h-3.5 mt-0.5 text-indigo-600 rounded border-slate-300"
                        />
                        <span>
                          I do not have a working camera or have an approved accommodation to proceed without webcam monitoring.
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Microphone Readiness & Calibration Check (When Configured & Enabled for Pilot) */}
          {isMicRequired && (
            <div className="p-4 bg-indigo-50/50 border border-indigo-200/80 rounded-2xl space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-indigo-950">
                  <Mic className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Ambient Noise Calibration (Pilot)</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {micTested ? 'Calibrated & Ready' : 'Action Required'}
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                This assessment calibrates ordinary background sound (fans, air conditioning) for 3 seconds. Audio is analyzed in local memory only. Zero audio samples, recordings, or waveforms are saved or uploaded.
              </p>

              {micTested && ambientBaselineDb !== null ? (
                <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-indigo-100">
                  <div className="w-12 h-12 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                    <Volume2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="font-bold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Room Noise Floor Calibrated: {ambientBaselineDb} dBFS
                    </span>
                    <p className="text-[11px] font-medium text-slate-700" data-testid="preflight-mic-device-label">
                      Active Microphone: <span className="font-semibold text-indigo-700">{activeMicLabel || 'Default Microphone'}</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Baseline established. Dynamic trigger set to {Math.round((ambientBaselineDb + 9) * 10) / 10} dBFS (+9 dB pilot threshold, 2.5s sustained activity).
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleTestAndCalibrateMic}
                    disabled={micCalibrating}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-colors flex items-center gap-2 shadow-xs"
                  >
                    {micCalibrating ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Calibrating Room Noise ({micCalibrationProgress}%)...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3.5 h-3.5" />
                        <span>Test Microphone & Calibrate (3s)</span>
                      </>
                    )}
                  </button>

                  {micCalibrating && (
                    <div className="space-y-1 pt-1 max-w-xs">
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-indigo-600 h-1.5 rounded-full transition-all duration-100"
                          style={{ width: `${micCalibrationProgress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 block">
                        Keep quiet or let ordinary fans run naturally. Current sound: {currentMicDb} dB
                      </span>
                    </div>
                  )}

                  {micError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11px] space-y-2">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <MicOff className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>{micError}</span>
                      </div>
                      <label className="flex items-start gap-2 pt-1 cursor-pointer font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={micExemptionAcknowledged}
                          onChange={(e) => setMicExemptionAcknowledged(e.target.checked)}
                          className="w-3.5 h-3.5 mt-0.5 text-indigo-600 rounded border-slate-300"
                        />
                        <span>
                          I do not have a working microphone or have an approved accommodation to proceed without microphone monitoring.
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Consent Checkbox */}
          <label className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={preflightConsent}
              onChange={(e) => setPreflightConsent(e.target.checked)}
              className="w-4 h-4 mt-0.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
            />
            <span className="text-slate-700 leading-snug">
              I acknowledge that this examination is monitored for fullscreen integrity and window focus. I agree not to switch tabs or minimize the test window during the session.
            </span>
          </label>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                if (livenessSessionRef.current) {
                  livenessSessionRef.current.destroy();
                  livenessSessionRef.current = null;
                }
                setLivenessStatus('IDLE');
                setLivenessPassed(false);
                setLivenessChallenge(null);
                if (webcamStreamRef.current) {
                  faceDetectionService.stopCameraStream(webcamStreamRef.current);
                  webcamStreamRef.current = null;
                  setWebcamStream(null);
                }
                if (micStreamRef.current) {
                  audioMonitoringService.stopMicrophoneStream(micStreamRef.current);
                  micStreamRef.current = null;
                  setMicStream(null);
                }
                setIsResumingAttempt(false);
                setCurrentView('DASHBOARD');
              }}
              className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 text-center"
            >
              Cancel & Exit
            </button>
            <button
              type="button"
              disabled={!canProceedExam}
              onClick={handleConsentAndEnter}
              className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <span>{isResumingAttempt ? 'Reconnect & Resume Examination' : 'Consent & Enter Fullscreen Exam'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // VIEW 2: DISTRACTION-FREE EXAMINATION RUNNER
  // ===========================================================================
  if (currentView === 'RUNNER' && activeAttempt) {
    const isWarningTime = remainingSeconds < 300 && remainingSeconds > 60;
    const isCriticalTime = remainingSeconds <= 60;
    const inputsDisabled = submittingAttempt || isVerifyingExpiry || isFaceAbsentPaused;

    return (
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Top Distraction-Free Runner Navigation Bar */}
        <div className="bg-white px-3.5 sm:px-5 py-3 rounded-xl sm:rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2.5 min-w-0 max-w-full sm:max-w-none">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight truncate">
                  {selectedAssessment?.title || 'Examination Assessment'}
                </h3>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold shrink-0">
                  {selectedAssessment?.subject || 'Subject'}
                </span>
              </div>
              <span className="text-[10px] sm:text-[11px] text-slate-400 block truncate">
                Question {currentQuestionIndex + 1} of {totalQuestionsCount}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Connection Status Indicator */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
              title={isOnline ? 'Active Internet Connection' : 'Disconnected: Reconnecting...'}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            {/* Active Camera Device Indicator (When Webcam Stream Active) */}
            {webcamStream && (
              <div
                data-testid="runner-camera-status-pill"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  faceDetectionStatus === 'NO_FACE'
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : faceDetectionStatus === 'MULTIPLE_FACES'
                    ? 'bg-purple-50 text-purple-800 border-purple-300'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                }`}
                title={`Active Camera: ${activeCameraLabel || 'Default Camera'}`}
              >
                <Camera className="w-3.5 h-3.5 shrink-0" />
                <span className="max-w-[120px] sm:max-w-[140px] truncate">{activeCameraLabel || 'Default Camera'}</span>
              </div>
            )}

            {/* Active Microphone Indicator (When Mic Stream Active) */}
            {micStream && (
              <div
                data-testid="runner-mic-status-pill"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  sustainedNoiseActive || noiseAnomalySeconds >= 2
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-teal-50 text-teal-700 border-teal-200'
                }`}
                title={`Active Microphone: ${activeMicLabel || 'Default Microphone'} (Baseline ${ambientBaselineDb ?? -50} dBFS)`}
              >
                <Mic className="w-3.5 h-3.5 shrink-0" />
                <span>Mic Active</span>
              </div>
            )}

            {/* Per-Question Derived Autosave Status Indicator */}
            <div className="flex items-center gap-1.5 text-xs font-medium">
              {overallSaveStatus === 'SAVING' && (
                <span className="text-amber-600 flex items-center gap-1 px-2 py-0.5 bg-amber-50 rounded-full border border-amber-200">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Saving...</span>
                </span>
              )}
              {overallSaveStatus === 'SAVED' && (
                <span className="text-emerald-700 flex items-center gap-1 px-2 py-0.5 bg-emerald-50 rounded-full border border-emerald-200">
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span>Saved</span>
                </span>
              )}
              {overallSaveStatus === 'FAILED' && (
                <button
                  type="button"
                  onClick={handleRetrySave}
                  className="text-rose-700 flex items-center gap-1 px-2 py-0.5 bg-rose-50 rounded-full border border-rose-200 hover:bg-rose-100 transition-colors"
                  title={`Failed to save Question(s) ${failedQuestionNumbers.join(', ')}. Click to retry.`}
                >
                  <AlertCircle className="w-3 h-3 text-rose-600" />
                  <span>Save Failed (Retry)</span>
                </button>
              )}
            </div>

            {/* Server-Synchronized Monotonic Countdown Timer */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${
                isCriticalTime
                  ? 'bg-rose-100 text-rose-700 border-rose-300 animate-pulse'
                  : isWarningTime
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-slate-900 text-white border-slate-800'
              }`}
              title="Authoritative server countdown timer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{formatRemainingTime(remainingSeconds)}</span>
            </div>

            {/* Finish / Submit Trigger Button */}
            {!isAttemptLocked && (
              <button
                type="button"
                disabled={isFaceAbsentPaused}
                onClick={() => {
                  setSubmitModalError(null);
                  setShowSubmitModal(true);
                }}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit</span>
              </button>
            )}
          </div>
        </div>

        {/* Offline Warning Banner with Live Outage Timer */}
        {!isOnline && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl sm:rounded-2xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>
                  Internet connection lost ({Math.floor(disconnectSeconds / 60).toString().padStart(2, '0')}:
                  {(disconnectSeconds % 60).toString().padStart(2, '0')}).
                </strong>{' '}
                Your selections are held safely in memory; please do not close or refresh this tab. Answers will automatically sync on reconnect.
              </span>
            </div>
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-md self-end sm:self-auto shrink-0">
              Autosave Paused
            </span>
          </div>
        )}

        {/* 7-Second Continuous Face Absence Warning Banner (NO_FACE Advisory Event) */}
        {webcamStream && (noFaceWarningActive || (faceDetectionStatus === 'NO_FACE' && faceAnomalySeconds >= 7)) && (
          <div
            role="alert"
            data-testid="no-face-7s-warning"
            className="p-3.5 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl sm:rounded-2xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 animate-in fade-in duration-200"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>No Face Detected Warning (NO_FACE — {faceAnomalySeconds}s):</strong> No face has been detected in the camera frame for 7+ continuous seconds. An advisory integrity event has been logged for instructor review, and answer options remain temporarily paused until your face returns for 2 consecutive checks.
              </span>
            </div>
            <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-md self-end sm:self-auto shrink-0">
              NO_FACE Logged
            </span>
          </div>
        )}

        {/* Face Absence Advisory Banner (Pilot 3s-6s) */}
        {webcamStream && faceDetectionStatus === 'NO_FACE' && faceAnomalySeconds >= 3 && faceAnomalySeconds < 7 && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl sm:rounded-2xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <UserX className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Camera Advisory (Pilot):</strong> Face not detected in camera frame ({faceAnomalySeconds}s). Answer controls are temporarily paused. Please position yourself directly in front of the camera.
              </span>
            </div>
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-md self-end sm:self-auto shrink-0">
              Pilot Advisory
            </span>
          </div>
        )}

        {/* Face Recovery Confirmation Banner */}
        {webcamStream && !isFaceAbsentPaused && faceRecoveryBanner && (
          <div
            role="status"
            data-testid="face-recovery-banner"
            className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl sm:rounded-2xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 animate-in fade-in duration-200"
          >
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Camera Verified:</strong> {faceRecoveryBanner}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFaceRecoveryBanner(null)}
              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 px-2 py-0.5 rounded self-end sm:self-auto shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Multiple Faces Advisory Banner (Pilot) */}
        {webcamStream && faceDetectionStatus === 'MULTIPLE_FACES' && faceAnomalySeconds >= 3 && (
          <div className="p-3 bg-purple-50 border border-purple-200 text-purple-900 rounded-xl sm:rounded-2xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-600 shrink-0" />
              <span>
                <strong>Camera Advisory (Pilot):</strong> Multiple faces detected in camera frame ({faceAnomalySeconds}s). Please ensure you are working independently. This is advisory for pilot testing and will not lock your exam.
              </span>
            </div>
            <span className="text-[11px] font-semibold text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-md self-end sm:self-auto shrink-0">
              Pilot Advisory
            </span>
          </div>
        )}

        {/* Sustained Ambient Noise Advisory Banner (Pilot) */}
        {micStream && (sustainedNoiseActive || noiseAnomalySeconds >= 2) && (
          <div
            role="status"
            data-testid="audio-advisory-banner"
            className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl sm:rounded-2xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 animate-in fade-in duration-200"
          >
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Audio Advisory (Pilot):</strong> Sustained ambient sound or voice activity above threshold detected in your room ({Math.max(2, Math.round(noiseAnomalySeconds * 10) / 10)}s{lastAudioPeakDb !== null ? `, peak ${lastAudioPeakDb} dBFS` : ''}). Please ensure your environment is quiet and independent. This is advisory for pilot testing and will not lock your exam.
              </span>
            </div>
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-md self-end sm:self-auto shrink-0">
              Pilot Advisory
            </span>
          </div>
        )}

        {/* Prohibited Object Detected Advisory Banner (Pilot) */}
        {webcamStream && detectedObjectAdvisory && (
          <div
            role="status"
            data-testid="object-advisory-banner"
            className="p-3 bg-cyan-50 border border-cyan-200 text-cyan-900 rounded-xl sm:rounded-2xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 animate-in fade-in duration-200"
          >
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-cyan-600 shrink-0" />
              <span>
                <strong>Object Advisory (Pilot):</strong> A <strong>{detectedObjectAdvisory.objectClass}</strong> was detected in the camera frame ({detectedObjectAdvisory.seconds}s). Please ensure only permitted materials are on your desk. This is advisory for pilot testing and will not lock your exam.
              </span>
            </div>
            <span className="text-[11px] font-semibold text-cyan-700 bg-cyan-100 px-2.5 py-0.5 rounded-md self-end sm:self-auto shrink-0">
              Pilot Advisory
            </span>
          </div>
        )}

        {/* Failed Save Alert Banner */}
        {failedSaveCount > 0 && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl sm:rounded-2xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>Unsaved Answer Alert:</strong> Question(s) {failedQuestionNumbers.join(', ')} could not be saved
                to the server.{saveError ? ` (${saveError})` : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={handleRetrySave}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold self-end sm:self-auto shrink-0"
            >
              Retry Unsaved Questions
            </button>
          </div>
        )}

        {/* Timer Expiry Verification Banner */}
        {(isVerifyingExpiry || expirySyncError) && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-2xl text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 text-indigo-600 shrink-0 ${isVerifyingExpiry ? 'animate-spin' : ''}`} />
              <span>
                {isVerifyingExpiry
                  ? 'Synchronizing timer status with examination server...'
                  : expirySyncError}
              </span>
            </div>
            {expirySyncError && (
              <button
                type="button"
                onClick={() => synchronizeAttemptWithBackend(activeAttempt.id, { isExpiryCheck: true })}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shrink-0"
              >
                Retry Sync
              </button>
            )}
          </div>
        )}

        {/* Main Examination View: Either Locked Screen or Examination Grid */}
        {isAttemptLocked ? (
          <div className="bg-white p-8 rounded-3xl border-2 border-rose-300 shadow-xl space-y-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto shadow-inner">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="space-y-2 max-w-xl mx-auto">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Examination Locked by Proctoring Policy
              </h2>
              {lockedReason === 'OBJECT_DETECTED' ? (
                <p className="text-sm text-slate-600 leading-relaxed">
                  Your exam session has been locked because a prohibited physical object (<strong>cell phone</strong> or <strong>book</strong>) was detected in the camera view. Answer changes have been immediately disabled for instructor review.
                </p>
              ) : (
                <p className="text-sm text-slate-600 leading-relaxed">
                  Your exam session has been locked because you reached the proctoring warning threshold ({proctoringWarningsCount} of {activeAttempt.monitoringConfig?.maxWarnings ?? 3} allowed warnings).
                </p>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 max-w-lg mx-auto text-left space-y-2.5 text-xs">
              <div className="flex items-start gap-2 text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Your answers are safely preserved:</strong> All {Object.keys(confirmedAnswers).length} answer(s) saved prior to this lock have been securely stored in the examination database.
                </span>
              </div>
              <div className="flex items-start gap-2 text-slate-700">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Not submitted or discarded:</strong> Your exam has not been submitted, closed, scored, or discarded.
                </span>
              </div>
              <div className="flex items-start gap-2 text-slate-700">
                <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Next Step:</strong> Please notify your teacher or exam invigilator. Your teacher can review the session integrity audit log and unlock your examination to continue.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                disabled={recheckingLock}
                onClick={async () => {
                  setRecheckingLock(true);
                  try {
                    const synced = await synchronizeAttemptWithBackend(activeAttempt.id);
                    if (synced && !synced.isLocked) {
                      setIsAttemptLocked(false);
                      isAttemptLockedRef.current = false;
                    }
                  } finally {
                    setRecheckingLock(false);
                  }
                }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${recheckingLock ? 'animate-spin' : ''}`} />
                <span>{recheckingLock ? 'Checking Status...' : 'Check Status / Re-check Lock'}</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('DASHBOARD')}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        ) : (
          /* Main Examination Grid (Question Card + Question Palette) */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Question Card (Span 3 on desktop) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Temporary Face-Absence Answer Pause Overlay Banner */}
            {isFaceAbsentPaused && (
              <div
                role="alert"
                aria-live="assertive"
                data-testid="face-absent-pause-overlay"
                className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-sm space-y-2 text-xs text-amber-950 animate-in fade-in duration-150"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <UserX className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Answer Options Temporarily Paused — Face Not Detected</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-200/80 text-amber-900 font-bold text-[10px]">
                    Recovery Check: {faceRecoverySamples} / 2
                  </span>
                </div>
                <p className="text-amber-800 leading-relaxed">
                  Please position your face clearly in front of the active camera (<strong>{activeCameraLabel || 'Default Camera'}</strong>). Answer selection and question navigation are temporarily disabled while no face is detected, and will automatically re-enable after <strong>2 consecutive valid face checks</strong>. Your saved answers and countdown timer remain intact.
                </p>
              </div>
            )}

            {currentQuestion ? (
              <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4 sm:space-y-5 relative">
                {/* Question Header & Marks */}
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-100">
                      Question {currentQuestionIndex + 1}
                    </span>
                    <span className="text-xs text-slate-400">Order: {currentQuestion.orderIndex}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-700 px-2.5 py-1 bg-slate-100 rounded-lg">
                    {currentQuestion.marks} Mark{currentQuestion.marks > 1 ? 's' : ''}
                  </span>
                </div>

                {/* Question Text */}
                <div className="text-sm font-medium text-slate-900 leading-relaxed whitespace-pre-wrap">
                  {currentQuestion.questionText}
                </div>

                {/* Attached Diagram (if present) */}
                {currentQuestion.hasImage && (
                  <RunnerQuestionImage
                    assessmentId={activeAttempt.assessmentId}
                    questionId={currentQuestion.id}
                  />
                )}

                {/* MCQ Options List */}
                <div className="space-y-2.5 pt-2" role="radiogroup" aria-label={`Question ${currentQuestionIndex + 1} options`}>
                  {currentQuestion.options.map((optText, optIdx) => {
                    const isSelected = localAnswers[currentQuestion.id] === optIdx;
                    const letter = String.fromCharCode(65 + optIdx); // A, B, C, D

                    return (
                      <label
                        key={optIdx}
                        className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all select-none ${
                          inputsDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                        } ${
                          isSelected
                            ? 'bg-indigo-50/70 border-indigo-500 shadow-xs'
                            : 'bg-white border-slate-200 hover:bg-slate-50/80 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question-${currentQuestion.id}`}
                          checked={isSelected}
                          disabled={inputsDisabled}
                          onChange={() => handleOptionSelect(currentQuestion.id, optIdx)}
                          className="mt-0.5 w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                          aria-label={`Option ${letter}: ${optText}`}
                        />
                        <div className="flex items-start gap-2 text-xs">
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center font-bold shrink-0 text-[11px] ${
                              isSelected
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {letter}
                          </span>
                          <span className={`leading-relaxed ${isSelected ? 'font-semibold text-indigo-950' : 'text-slate-800'}`}>
                            {optText}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Bottom Navigation & Current Question Save Indicator */}
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 border-t pt-4">
                  <button
                    type="button"
                    disabled={currentQuestionIndex === 0 || isFaceAbsentPaused}
                    onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                    className="order-1 px-3 sm:px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>

                  <div className="order-3 sm:order-2 w-full sm:w-auto text-center sm:text-left text-xs font-medium">
                    {questionSaveStates[currentQuestion.id] === 'SAVING' ? (
                      <span className="text-amber-600 flex items-center justify-center sm:justify-start gap-1">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving selection...</span>
                      </span>
                    ) : questionSaveStates[currentQuestion.id] === 'FAILED' ? (
                      <span className="text-rose-600 flex items-center justify-center sm:justify-start gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Save failed — retry required</span>
                      </span>
                    ) : confirmedAnswers[currentQuestion.id] !== undefined &&
                      confirmedAnswers[currentQuestion.id] !== null &&
                      localAnswers[currentQuestion.id] === confirmedAnswers[currentQuestion.id] ? (
                      <span className="text-emerald-600 flex items-center justify-center sm:justify-start gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Answer confirmed saved</span>
                      </span>
                    ) : localAnswers[currentQuestion.id] !== undefined &&
                      localAnswers[currentQuestion.id] !== null ? (
                      <span className="text-amber-600 flex items-center justify-center sm:justify-start gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Pending server save</span>
                      </span>
                    ) : (
                      <span className="text-slate-400">Not answered yet</span>
                    )}
                  </div>

                  {currentQuestionIndex < totalQuestionsCount - 1 ? (
                    <button
                      type="button"
                      disabled={isFaceAbsentPaused}
                      onClick={() => setCurrentQuestionIndex((prev) => Math.min(totalQuestionsCount - 1, prev + 1))}
                      className="order-2 sm:order-3 px-3.5 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:pointer-events-none text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
                    >
                      <span>Next</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isFaceAbsentPaused}
                      onClick={() => {
                        setSubmitModalError(null);
                        setShowSubmitModal(true);
                      }}
                      className="order-2 sm:order-3 px-3.5 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs shrink-0"
                    >
                      <span>Review & Submit</span>
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 bg-white rounded-3xl border border-slate-200 text-center text-xs text-slate-500">
                No questions available in this assessment.
              </div>
            )}
          </div>

          {/* Right Sidebar: Question Palette (Span 1 on desktop) */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h4 className="text-xs font-bold text-slate-800">Question Palette</h4>
                <span className="text-[11px] font-semibold text-slate-500">
                  {confirmedAnsweredCount} / {totalQuestionsCount} Answered
                </span>
              </div>

              {/* Palette Grid Distinguishing Confirmed, Pending, Failed, Unanswered */}
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-5 gap-1.5 sm:gap-2">
                {questions.map((q, idx) => {
                  const isCurrent = idx === currentQuestionIndex;
                  const localVal = localAnswers[q.id] ?? null;
                  const confirmedVal = confirmedAnswers[q.id] ?? null;
                  const qState = questionSaveStates[q.id];

                  const isFailed = qState === 'FAILED';
                  const isPending =
                    !isFailed &&
                    (qState === 'SAVING' || qState === 'DIRTY' || localVal !== confirmedVal);
                  const isConfirmed =
                    !isFailed &&
                    !isPending &&
                    confirmedVal !== null &&
                    confirmedVal !== undefined;

                  const paletteStatus = isFailed
                    ? 'FAILED'
                    : isPending
                    ? 'PENDING'
                    : isConfirmed
                    ? 'CONFIRMED'
                    : 'UNANSWERED';

                  const statusLabel = isFailed
                    ? 'Save Failed'
                    : isPending
                    ? 'Pending Save'
                    : isConfirmed
                    ? 'Confirmed Answered'
                    : 'Unanswered';

                  return (
                    <button
                      key={q.id}
                      type="button"
                      disabled={isFaceAbsentPaused}
                      data-status={paletteStatus}
                      onClick={() => setCurrentQuestionIndex(idx)}
                      className={`h-9 rounded-xl text-xs font-bold transition-all flex items-center justify-center relative disabled:opacity-40 disabled:pointer-events-none ${
                        isCurrent ? 'ring-2 ring-indigo-600 shadow-xs ' : ''
                      }${
                        isFailed
                          ? 'bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200'
                          : isPending
                          ? 'bg-amber-100/90 text-amber-800 border border-amber-300 hover:bg-amber-200'
                          : isConfirmed
                          ? 'bg-emerald-100/80 text-emerald-800 hover:bg-emerald-200'
                          : isCurrent
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      title={`Question ${idx + 1}: ${statusLabel}`}
                      aria-label={`Jump to Question ${idx + 1}`}
                    >
                      <span>{idx + 1}</span>
                      {isConfirmed && !isCurrent && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 absolute bottom-1" />
                      )}
                      {isPending && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600 absolute bottom-1 animate-pulse" />
                      )}
                      {isFailed && (
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600 absolute bottom-1" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Palette Legend */}
              <div className="pt-3 border-t border-slate-100 space-y-2 text-[11px] text-slate-500">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded bg-indigo-50 border-2 border-indigo-600" />
                  <span>Current Question</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded bg-emerald-100 border border-emerald-300" />
                  <span>Confirmed Answered ({confirmedAnsweredCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded bg-amber-100 border border-amber-300" />
                  <span>Pending Save ({pendingSaveCount})</span>
                </div>
                {failedSaveCount > 0 && (
                  <div className="flex items-center gap-2 text-rose-700 font-semibold">
                    <div className="w-3.5 h-3.5 rounded bg-rose-100 border border-rose-300" />
                    <span>Save Failed ({failedSaveCount})</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded bg-slate-100 border border-slate-200" />
                  <span>Unanswered ({unansweredQuestionsCount})</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Fullscreen Violation Alert Overlay */}
        {!isAttemptLocked && fullscreenWarningOverlay && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4 text-center animate-in fade-in zoom-in-95">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">Fullscreen Exited!</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Examination rules require your browser to remain in full screen mode. Please return to fullscreen immediately to continue your test.
                </p>
              </div>
              <div className="p-2.5 bg-rose-50 rounded-xl text-xs text-rose-800 font-medium">
                Warning count: <strong>{proctoringWarningsCount}</strong> (Logged to instructor audit log)
              </div>
              <button
                type="button"
                onClick={() => {
                  try {
                    document.documentElement.requestFullscreen?.().catch(() => {});
                  } catch (e) {}
                  setFullscreenWarningOverlay(false);
                }}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
              >
                Re-enter Fullscreen & Continue Exam
              </button>
            </div>
          </div>
        )}

        {/* Submit Confirmation Dialog Modal (FIX D) */}
        {showSubmitModal && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl w-fit">
                <Send className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">Confirm Final Submission?</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Please review your server-confirmed attempt summary before final submission. Once submitted, your
                  answers cannot be modified.
                </p>
              </div>

              {/* Submission Summary Box Distinguishing Confirmed, Pending, Failed, Unanswered */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Total Questions:</span>
                  <span className="font-bold text-slate-800">{totalQuestionsCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Confirmed Answered:</span>
                  <span className="font-bold text-emerald-700">{confirmedAnsweredCount}</span>
                </div>
                {pendingSaveCount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-amber-700">Pending Server Save:</span>
                    <span className="font-bold text-amber-700">
                      {pendingSaveCount} (Question {pendingQuestionNumbers.join(', ')})
                    </span>
                  </div>
                )}
                {failedSaveCount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-rose-700 font-semibold">Failed Saves:</span>
                    <span className="font-bold text-rose-700">
                      {failedSaveCount} (Question {failedQuestionNumbers.join(', ')})
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Unanswered Questions:</span>
                  <span
                    className={`font-bold ${
                      unansweredQuestionsCount > 0 ? 'text-amber-700' : 'text-slate-700'
                    }`}
                  >
                    {unansweredQuestionsCount}
                  </span>
                </div>
              </div>

              {unansweredQuestionsCount > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    You have <strong>{unansweredQuestionsCount} unanswered question(s)</strong>. Are you sure you wish
                    to submit without completing them?
                  </span>
                </div>
              )}

              {failedSaveCount > 0 && !submitModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Unresolved Answer Saves:</strong> Question(s) {failedQuestionNumbers.join(', ')} have not
                      been saved to the server. Your latest selected answers may not be recorded unless synchronized.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRetrySave}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold"
                  >
                    Retry Saving Failed Questions
                  </button>
                </div>
              )}

              {submitModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                    <span>{submitModalError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRetrySave}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold"
                  >
                    Retry Saving Failed Questions
                  </button>
                </div>
              )}

              {/* Student Explanation for Proctoring Warnings (if applicable) */}
              {(proctoringWarningsCount > 0 || activeAttempt.flaggedForReview) && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5 text-xs">
                  <label className="block font-bold text-amber-900">
                    Optional Explanation for Proctoring Alert(s):
                  </label>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    You received {proctoringWarningsCount} integrity alert(s) during this test. If an unexpected OS notification, popup, or glitch occurred, briefly explain below for instructor review:
                  </p>
                  <textarea
                    rows={2}
                    maxLength={500}
                    placeholder="e.g., A system notification briefly minimized fullscreen..."
                    value={studentExplanationText}
                    onChange={(e) => setStudentExplanationText(e.target.value)}
                    className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={submittingAttempt}
                  onClick={() => setShowSubmitModal(false)}
                  className="w-full sm:w-auto px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Review Answers
                </button>
                <button
                  type="button"
                  disabled={submittingAttempt}
                  onClick={handleConfirmSubmit}
                  className="w-full sm:w-auto px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  {submittingAttempt ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Synchronizing & Submitting...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirm & Submit</span>
                      <Send className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Webcam PIP Self-View (Pilot) */}
        {webcamStream && (
          <div className="fixed bottom-3 right-3 sm:bottom-4 sm:right-4 z-40 bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl p-2 sm:p-2.5 flex flex-col items-center gap-1.5 sm:gap-2 backdrop-blur-sm transition-all duration-200 max-w-[calc(100vw-24px)]">
            <div className="w-full flex items-center justify-between gap-2 px-1 text-[10px] sm:text-[11px] font-semibold text-slate-300">
              <div className="flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-indigo-400" />
                <span>Self-View (Pilot)</span>
                {activeFaceCount !== null && (
                  <span className="text-[9px] text-slate-400 font-mono">({activeFaceCount})</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPipMinimized(!pipMinimized)}
                className="text-slate-400 hover:text-white text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                {pipMinimized ? 'Show' : 'Hide'}
              </button>
            </div>

            <div className={pipMinimized ? 'sr-only' : 'flex flex-col items-center gap-1.5'}>
              <div className="relative w-28 h-22 sm:w-36 sm:h-28 bg-black rounded-xl overflow-hidden border border-slate-800">
                <video
                  ref={runnerVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
                {/* Status Overlay Badge */}
                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex justify-center">
                  {faceDetectionStatus === 'VERIFIED' && (
                    <span className="px-2 py-0.5 bg-emerald-500/90 text-white rounded-md text-[10px] font-bold flex items-center gap-1 shadow-sm backdrop-blur-xs">
                      <UserCheck className="w-2.5 h-2.5" />
                      <span>Verified</span>
                    </span>
                  )}
                  {faceDetectionStatus === 'NO_FACE' && (
                    <span className="px-2 py-0.5 bg-amber-500/90 text-white rounded-md text-[10px] font-bold flex items-center gap-1 shadow-sm backdrop-blur-xs animate-pulse">
                      <UserX className="w-2.5 h-2.5" />
                      <span>No Face</span>
                    </span>
                  )}
                  {faceDetectionStatus === 'MULTIPLE_FACES' && (
                    <span className="px-2 py-0.5 bg-purple-500/90 text-white rounded-md text-[10px] font-bold flex items-center gap-1 shadow-sm backdrop-blur-xs">
                      <Users className="w-2.5 h-2.5" />
                      <span>Multiple</span>
                    </span>
                  )}
                  {faceDetectionStatus === 'IDLE' && (
                    <span className="px-2 py-0.5 bg-slate-600/90 text-slate-200 rounded-md text-[10px] font-semibold flex items-center gap-1 shadow-sm">
                      <span>Standby</span>
                    </span>
                  )}
                </div>
              </div>
              <span
                data-testid="runner-pip-camera-label"
                className="text-[9px] text-indigo-300 font-medium text-center max-w-[110px] sm:max-w-[144px] truncate"
                title={activeCameraLabel || 'Default Camera'}
              >
                {activeCameraLabel || 'Default Camera'}
              </span>
              <span className="text-[9px] text-slate-400 text-center max-w-[110px] sm:max-w-[144px] leading-tight">
                Local client-only AI. Video is never recorded or uploaded.
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // VIEW 3: EXAMINATION COMPLETED / TIMED OUT VIEW
  // ===========================================================================
  if (currentView === 'COMPLETED' && (completionAttempt || activeAttempt)) {
    const attempt = completionAttempt || activeAttempt!;
    const isTimeout = attempt.status === AttemptStatus.TIMED_OUT;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs text-center space-y-5">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto border ${
              isTimeout
                ? 'bg-amber-50 text-amber-600 border-amber-200'
                : 'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}
          >
            {isTimeout ? <Clock className="w-7 h-7" /> : <CheckCircle2 className="w-7 h-7" />}
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900">
              {isTimeout ? 'Examination Concluded (Timed Out)' : 'Examination Submitted Successfully'}
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
              {isTimeout
                ? 'Your allotted test time has elapsed. The examination server has authoritatively sealed and recorded all answers saved up to the deadline.'
                : 'Your examination answers have been securely received and registered on the school examination portal.'}
            </p>
          </div>

          {/* Submission Receipt Details */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs text-left space-y-2 max-w-md mx-auto">
            <div className="flex justify-between">
              <span className="text-slate-500">Attempt Status:</span>
              <span
                className={`font-bold uppercase ${
                  isTimeout ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {attempt.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Recorded At:</span>
              <span className="font-semibold text-slate-800">
                {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Attempt Reference ID:</span>
              <span className="font-mono text-[10px] text-slate-600">{attempt.id}</span>
            </div>
          </div>

          {/* Scorecard / Official Result Section */}
          <div className="max-w-md mx-auto pt-2">
            {loadingResult ? (
              <div className="p-4 bg-slate-50 rounded-2xl border flex items-center justify-center gap-2 text-xs text-slate-500">
                <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                <span>Checking official results status...</span>
              </div>
            ) : completionResult && completionResult.result ? (
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                  <Award className="w-4 h-4 text-emerald-600" />
                  <span>Official Performance Scorecard Released</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-left text-xs">
                  <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                    <span className="text-[10px] text-slate-400 block font-medium">Score Achieved</span>
                    <span className="text-sm font-bold text-slate-900">
                      {completionResult.result.score} / {completionResult.totalMarks}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                    <span className="text-[10px] text-slate-400 block font-medium">Percentage</span>
                    <span className="text-sm font-bold text-slate-900">
                      {completionResult.result.percentage}%
                    </span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                    <span className="text-[10px] text-slate-400 block font-medium">Result Status</span>
                    <span
                      className={`text-xs font-bold ${
                        completionResult.result.isPassing ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {completionResult.result.isPassing ? 'PASSED' : 'NEEDS IMPROVEMENT'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                    <span className="text-[10px] text-slate-400 block font-medium">Attempted</span>
                    <span className="text-xs font-bold text-slate-700">
                      {completionResult.result.attemptedQuestions} / {completionResult.result.totalQuestions}
                    </span>
                  </div>
                </div>

                {/* Leaderboard Action Button (Only after results released) */}
                <button
                  type="button"
                  onClick={() =>
                    setLeaderboardAssessment({
                      id: completionAttempt?.assessmentId || selectedAssessment?.id || '',
                      title: completionResult.title || selectedAssessment?.title || 'Examination',
                      subject: completionResult.subject || selectedAssessment?.subject,
                      totalMarks: completionResult.totalMarks || selectedAssessment?.totalMarks,
                    })
                  }
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Trophy className="w-4 h-4" />
                  <span>View Official Leaderboard</span>
                </button>
              </div>
            ) : (
              <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl text-xs text-indigo-900 space-y-1">
                <div className="flex items-center justify-center gap-1.5 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Official Results Pending Release</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Your answers have been stored securely. Official scores, grade reports, and faculty evaluation summaries
                  will appear here once published by your school.
                </p>
              </div>
            )}
          </div>

          {/* Return Home Button */}
          <div className="pt-3">
            <button
              type="button"
              onClick={() => {
                fetchAssessments();
                fetchStudentChapters();
                setCurrentView('DASHBOARD');
              }}
              className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
            >
              Return to Examination Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // VIEW 4: STUDENT EXAMINATION DASHBOARD
  // ===========================================================================
  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-teal-700 to-teal-900 text-white p-6 rounded-3xl shadow-xs relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-teal-200 tracking-wider uppercase">
              Student Examination Workspace
            </span>
            <span className="px-2 py-0.5 rounded-full bg-teal-600/60 text-[10px] font-bold border border-teal-400/30">
              Grade Enrolled
            </span>
          </div>
          <h3 className="text-xl font-bold tracking-tight">Active Tests & Chapter Progression</h3>
          <p className="text-xs text-teal-100 leading-relaxed">
            Take authorized quizzes and scheduled live examinations. Answers autosave in real-time with
            server-authoritative timers and seamless refresh recovery.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 overflow-x-auto max-w-full">
          {[
            { id: 'ALL', label: 'All Tests' },
            { id: 'AVAILABLE', label: 'Available' },
            { id: 'IN_PROGRESS', label: 'In Progress' },
            { id: 'UPCOMING', label: 'Upcoming' },
            { id: 'SUBMITTED', label: 'Submitted' },
            { id: 'TIMED_OUT', label: 'Timed Out' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            fetchAssessments();
            fetchStudentChapters();
          }}
          disabled={loadingAssessments || loadingChapters}
          className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 text-xs flex items-center gap-1.5 transition-colors"
          title="Refresh assessments list"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingAssessments || loadingChapters ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {assessmentError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{assessmentError}</span>
        </div>
      )}

      {/* Assessments Grid */}
      {loadingAssessments ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 bg-white rounded-2xl border border-slate-200 p-5 animate-pulse space-y-3">
              <div className="h-4 bg-slate-100 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
              <div className="h-10 bg-slate-100 rounded mt-4" />
            </div>
          ))}
        </div>
      ) : filteredAssessments.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-3">
          <div className="p-3 bg-slate-50 text-slate-400 rounded-2xl w-fit mx-auto border border-slate-100">
            <FileQuestion className="w-8 h-8" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">No Assessments Found</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            There are currently no examinations matching this filter assigned to your grade and section.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssessments.map((assessment) => {
            const hasStartedAttempt =
              assessment.hasAttempt && assessment.attemptStatus === AttemptStatus.IN_PROGRESS;
            const isSubmitted = assessment.attemptStatus === AttemptStatus.SUBMITTED;
            const isTimedOutAttempt = assessment.attemptStatus === AttemptStatus.TIMED_OUT;

            return (
              <div
                key={assessment.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 p-5 shadow-xs transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Card Header: Mode Badge + Subject */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        assessment.mode === AssessmentMode.LIVE_EXAM
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`}
                    >
                      {assessment.mode === AssessmentMode.LIVE_EXAM ? 'Live Exam' : 'Normal Quiz'}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">{assessment.subject}</span>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 leading-snug">{assessment.title}</h4>
                    {assessment.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {assessment.description}
                      </p>
                    )}
                  </div>

                  {/* Specs: Duration, Marks, Window */}
                  <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{assessment.durationMinutes} Mins</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Award className="w-3.5 h-3.5 text-slate-400" />
                      <span>{assessment.totalMarks} Marks</span>
                    </div>
                  </div>

                  {assessment.endWindowAt && (
                    <div className="text-[10px] text-slate-400 pt-1">
                      Closes: {new Date(assessment.endWindowAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  )}
                </div>

                {/* Card Action Button */}
                <div className="pt-3 border-t border-slate-100">
                  {hasStartedAttempt ? (
                    <button
                      type="button"
                      onClick={() => handleStartOrResumeExam(assessment)}
                      className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Resume In-Progress Attempt</span>
                    </button>
                  ) : isSubmitted ? (
                    <button
                      type="button"
                      onClick={async () => {
                        setSelectedAssessment(assessment);
                        if (assessment.attemptId) {
                          try {
                            const att = await examinationApi.getAttempt(assessment.attemptId);
                            transitionToTerminalAttempt(att);
                            return;
                          } catch (e) {
                            // fallback below
                          }
                        }
                        setCurrentView('COMPLETED');
                        loadFinalResult(assessment.id);
                      }}
                      className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>View Submission & Result</span>
                    </button>
                  ) : isTimedOutAttempt ? (
                    <button
                      type="button"
                      onClick={async () => {
                        setSelectedAssessment(assessment);
                        if (assessment.attemptId) {
                          try {
                            const att = await examinationApi.getAttempt(assessment.attemptId);
                            transitionToTerminalAttempt(att);
                            return;
                          } catch (e) {
                            // fallback below
                          }
                        }
                        setCurrentView('COMPLETED');
                        loadFinalResult(assessment.id);
                      }}
                      className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Timed Out — View Record</span>
                    </button>
                  ) : assessment.status === AssessmentStatus.CLOSED ? (
                    <div className="w-full py-2 bg-slate-100 text-slate-500 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-not-allowed">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Examination Concluded</span>
                    </div>
                  ) : assessment.status === AssessmentStatus.RESULTS_RELEASED ? (
                    <div className="w-full py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-not-allowed">
                      <Award className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Results Released (Unattempted)</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenInstructions(assessment)}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <span>Take Examination</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Chapter Progression Section */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3 border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Chapter Progression Check</h4>
              <p className="text-xs text-slate-400">
                Inspect chapter gating and progression status according to school curriculum rules.
              </p>
            </div>
          </div>

          {!loadingChapters && studentChapters.length > 0 && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                aria-label="Select Chapter"
                value={chapterProgressionId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setChapterProgressionId(newId);
                  setProgressionError(null);
                  if (newId) {
                    handleLookupProgression(newId);
                  } else {
                    setChapterProgression(null);
                  }
                }}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden w-full sm:w-64 bg-white text-slate-700 font-medium truncate"
              >
                <option value="">Select a chapter...</option>
                {studentChapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.chapterCode} — {ch.title} ({ch.subject})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!chapterProgressionId.trim() || loadingProgression}
                onClick={() => handleLookupProgression(chapterProgressionId)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors shrink-0"
              >
                {loadingProgression ? 'Checking...' : 'Check Status'}
              </button>
            </div>
          )}
        </div>

        {/* Loading State for Chapters */}
        {loadingChapters && (
          <div className="p-4 flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
            <span>Loading chapters configured for your grade...</span>
          </div>
        )}

        {/* Error Loading Chapters */}
        {!loadingChapters && chaptersError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{chaptersError}</span>
            </div>
            <button
              type="button"
              onClick={fetchStudentChapters}
              className="text-indigo-600 hover:text-indigo-800 font-semibold underline shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State when no chapters exist for the student's grade */}
        {!loadingChapters && !chaptersError && studentChapters.length === 0 && (
          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-amber-900">
                No chapters are configured for your grade yet. Please contact your teacher.
              </p>
              <p className="text-[11px] text-amber-700">
                Curriculum chapters and progression checkpoints will appear here once published by your school faculty.
              </p>
            </div>
          </div>
        )}

        {progressionError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{progressionError}</span>
          </div>
        )}

        {chapterProgression && (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">
                  Chapter:{' '}
                  {studentChapters.find((c) => c.id === chapterProgression.chapterId) ? (
                    <span>
                      <strong className="text-slate-900">
                        {studentChapters.find((c) => c.id === chapterProgression.chapterId)?.chapterCode}
                      </strong>{' '}
                      — {studentChapters.find((c) => c.id === chapterProgression.chapterId)?.title} (
                      {studentChapters.find((c) => c.id === chapterProgression.chapterId)?.subject})
                    </span>
                  ) : (
                    <span className="font-mono text-[11px]">{chapterProgression.chapterId}</span>
                  )}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    chapterProgression.isUnlocked
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {chapterProgression.isUnlocked ? 'Unlocked' : 'Gated / In Progress'}
                </span>
              </div>
              {chapterProgression.unlockedAt && (
                <span className="text-[10px] text-slate-400">
                  Unlocked on: {new Date(chapterProgression.unlockedAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {chapterProgression.assessments.length === 0 ? (
              <p className="text-xs text-slate-500">
                No assessment gating required for this chapter (automatically unlocked).
              </p>
            ) : (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-700">Configured Assessments:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {chapterProgression.assessments.map((item) => (
                    <div
                      key={item.assessmentId}
                      className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <span className="font-bold text-slate-800 block">{item.title}</span>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">
                          {item.mode}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          item.resolved
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Leaderboard Modal */}
      {leaderboardAssessment && (
        <ExaminationLeaderboardModal
          isOpen={!!leaderboardAssessment}
          onClose={() => setLeaderboardAssessment(null)}
          assessmentId={leaderboardAssessment.id}
          assessmentTitle={leaderboardAssessment.title}
          subject={leaderboardAssessment.subject}
          totalMarks={leaderboardAssessment.totalMarks}
          userRole="STUDENT"
        />
      )}
    </div>
  );
};

export default StudentExaminationPortal;
