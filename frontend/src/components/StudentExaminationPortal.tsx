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
} from 'lucide-react';
import { ExaminationLeaderboardModal } from './ExaminationLeaderboardModal';
import {
  examinationApi,
  StudentAssessmentOverview,
  StudentAttemptDetail,
  StudentSanitizedQuestion,
  StudentResultView,
  ChapterProgressionSummary,
  AssessmentMode,
  AssessmentStatus,
  AttemptStatus,
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

type PortalView = 'DASHBOARD' | 'INSTRUCTIONS' | 'RUNNER' | 'COMPLETED';

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
  const [chapterProgressionId, setChapterProgressionId] = useState<string>('');
  const [chapterProgression, setChapterProgression] = useState<ChapterProgressionSummary | null>(null);
  const [loadingProgression, setLoadingProgression] = useState<boolean>(false);
  const [progressionError, setProgressionError] = useState<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
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
      if (isTerminalRef.current) {
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
  // 1. Online / Offline Event Listeners & Reconnection Recovery (FIX E)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      const attempt = activeAttemptRef.current;
      if (!attempt || isTerminalRef.current) return;

      // Re-validate attempt status and re-anchor timer from backend
      const refreshed = await synchronizeAttemptWithBackend(attempt.id, { isReconnect: true });
      if (
        !refreshed ||
        isTerminalRef.current ||
        refreshed.status !== AttemptStatus.IN_PROGRESS
      ) {
        return;
      }

      // Reconcile and retry any failed or dirty local answers
      await retryAllUnresolvedSaves();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [retryAllUnresolvedSaves, synchronizeAttemptWithBackend]);

  // ---------------------------------------------------------------------------
  // 2. Fetch Student Assessments
  // ---------------------------------------------------------------------------
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
  }, [fetchAssessments]);

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
      setCurrentQuestionIndex(0);
      setIsVerifyingExpiry(false);
      anchorMonotonicTimer(attempt);
      setCurrentView('RUNNER');
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

      // Step 4: All selected answers are server-confirmed; invoke idempotent submitAttempt
      const submitRes = await examinationApi.submitAttempt(attempt.id);

      const finalizedAttempt: StudentAttemptDetail = {
        ...attempt,
        answers: { ...confirmedAnswersRef.current },
        status: submitRes.status,
        submittedAt: submitRes.submittedAt,
      };

      transitionToTerminalAttempt(finalizedAttempt);
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
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCurrentView('DASHBOARD')}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancel & Return
            </button>
            <button
              type="button"
              disabled={!instructionAcknowledged || startingAssessment}
              onClick={() => handleStartOrResumeExam(selectedAssessment)}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2"
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
  // VIEW 2: DISTRACTION-FREE EXAMINATION RUNNER
  // ===========================================================================
  if (currentView === 'RUNNER' && activeAttempt) {
    const isWarningTime = remainingSeconds < 300 && remainingSeconds > 60;
    const isCriticalTime = remainingSeconds <= 60;
    const inputsDisabled = submittingAttempt || isVerifyingExpiry;

    return (
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Top Distraction-Free Runner Navigation Bar */}
        <div className="bg-white px-5 py-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                  {selectedAssessment?.title || 'Examination Assessment'}
                </h3>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                  {selectedAssessment?.subject || 'Subject'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Question {currentQuestionIndex + 1} of {totalQuestionsCount}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
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
            <button
              type="button"
              onClick={() => {
                setSubmitModalError(null);
                setShowSubmitModal(true);
              }}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit</span>
            </button>
          </div>
        </div>

        {/* Offline Warning Banner */}
        {!isOnline && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Internet connection lost.</strong> Your selections are held in memory; please do not close or refresh
              this window until your connection is restored and answers are confirmed as Saved.
            </span>
          </div>
        )}

        {/* Failed Save Alert Banner */}
        {failedSaveCount > 0 && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex items-center justify-between gap-2">
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
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shrink-0"
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

        {/* Main Examination Grid (Question Card + Question Palette) */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Question Card (Span 3 on desktop) */}
          <div className="lg:col-span-3 space-y-4">
            {currentQuestion ? (
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
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
                <div className="flex items-center justify-between border-t pt-4">
                  <button
                    type="button"
                    disabled={currentQuestionIndex === 0}
                    onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>

                  <div className="text-xs font-medium">
                    {questionSaveStates[currentQuestion.id] === 'SAVING' ? (
                      <span className="text-amber-600 flex items-center gap-1">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving selection...</span>
                      </span>
                    ) : questionSaveStates[currentQuestion.id] === 'FAILED' ? (
                      <span className="text-rose-600 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Save failed — retry required</span>
                      </span>
                    ) : confirmedAnswers[currentQuestion.id] !== undefined &&
                      confirmedAnswers[currentQuestion.id] !== null &&
                      localAnswers[currentQuestion.id] === confirmedAnswers[currentQuestion.id] ? (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Answer confirmed saved</span>
                      </span>
                    ) : localAnswers[currentQuestion.id] !== undefined &&
                      localAnswers[currentQuestion.id] !== null ? (
                      <span className="text-amber-600 flex items-center gap-1">
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
                      onClick={() => setCurrentQuestionIndex((prev) => Math.min(totalQuestionsCount - 1, prev + 1))}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <span>Next</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSubmitModalError(null);
                        setShowSubmitModal(true);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
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
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h4 className="text-xs font-bold text-slate-800">Question Palette</h4>
                <span className="text-[11px] font-semibold text-slate-500">
                  {confirmedAnsweredCount} / {totalQuestionsCount} Answered
                </span>
              </div>

              {/* Palette Grid Distinguishing Confirmed, Pending, Failed, Unanswered */}
              <div className="grid grid-cols-5 gap-2">
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
                      data-status={paletteStatus}
                      onClick={() => setCurrentQuestionIndex(idx)}
                      className={`h-9 rounded-xl text-xs font-bold transition-all flex items-center justify-center relative ${
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

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={submittingAttempt}
                  onClick={() => setShowSubmitModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Review Answers
                </button>
                <button
                  type="button"
                  disabled={submittingAttempt}
                  onClick={handleConfirmSubmit}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
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
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs text-center space-y-5">
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
                setCurrentView('DASHBOARD');
              }}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
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
          onClick={fetchAssessments}
          disabled={loadingAssessments}
          className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 text-xs flex items-center gap-1.5 transition-colors"
          title="Refresh assessments list"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingAssessments ? 'animate-spin' : ''}`} />
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

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={chapterProgressionId}
              onChange={(e) => setChapterProgressionId(e.target.value)}
              placeholder="Enter Chapter ID..."
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden w-48"
            />
            <button
              type="button"
              disabled={!chapterProgressionId.trim() || loadingProgression}
              onClick={() => handleLookupProgression(chapterProgressionId)}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors"
            >
              {loadingProgression ? 'Checking...' : 'Check Status'}
            </button>
          </div>
        </div>

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
                  Chapter: <span className="font-mono text-[11px]">{chapterProgression.chapterId}</span>
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
