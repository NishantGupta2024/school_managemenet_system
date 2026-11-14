import faceDetectionService from './faceDetection.service';

/**
 * Liveness Detection Service (Pilot)
 *
 * Provides a minimal, privacy-preserving active motion check (turning head slightly left/right)
 * using the locally hosted MediaPipe BlazeFace model (blaze_face_short_range.tflite).
 *
 * Safety & Privacy Guarantees:
 * - 100% in-browser volatile RAM frame processing.
 * - Zero storage or transmission of images, videos, landmarks, embeddings, or biometric identifiers.
 * - Minimal result contract: { passed: boolean, challengeType, durationMs, timestamp }.
 * - Invariant to horizontal camera mirroring (calculates relative eye-to-nose horizontal asymmetry).
 * - Not an identity verification system: simple motion signal only.
 * - Advisory only: failure or timeout never auto-terminates an exam, locks answers, or deducts marks.
 */

export type LivenessChallengeType = 'TURN_LEFT' | 'TURN_RIGHT';

export type LivenessSessionStatus =
  | 'IDLE'
  | 'WAITING_FOR_FACE'
  | 'BASELINE_CALIBRATING'
  | 'CHALLENGE_ACTIVE'
  | 'PASSED'
  | 'FAILED_TIMEOUT'
  | 'FAILED_ANOMALY';

export interface LivenessCheckResult {
  passed: boolean;
  challengeType: LivenessChallengeType;
  durationMs: number;
  timestamp: string;
  reason?: string;
}

export interface YawAnalysis {
  yawMetric: number; // Positive = turned right, Negative = turned left
  isFacingForward: boolean;
  isTurnedLeft: boolean;
  isTurnedRight: boolean;
}

export const LIVENESS_THRESHOLDS = {
  // Eye span minimum to ensure sufficient facial resolution
  MIN_EYE_SPAN: 0.04,
  // Facing forward neutral tolerance (|yawMetric| < 0.16)
  NEUTRAL_TOLERANCE: 0.16,
  // Turn threshold (|yawMetric| >= 0.22)
  TURN_THRESHOLD: 0.22,
  // Consecutive frames required to establish neutral baseline (~300ms at 10Hz)
  BASELINE_FRAMES: 3,
  // Sustained frames in correct turn direction (~300ms at 10Hz)
  SUSTAINED_TURN_FRAMES: 3,
  // Challenge timeout in milliseconds
  TIMEOUT_MS: 7000,
  // Frame interval in milliseconds (~10Hz)
  POLL_INTERVAL_MS: 100,
};

/**
 * Select a randomized active liveness challenge.
 */
export function getRandomLivenessChallenge(): LivenessChallengeType {
  return Math.random() < 0.5 ? 'TURN_LEFT' : 'TURN_RIGHT';
}

/**
 * Human-readable instructions for the student.
 */
export function getLivenessInstruction(type: LivenessChallengeType): string {
  switch (type) {
    case 'TURN_LEFT':
      return 'Turn your head slightly to your left';
    case 'TURN_RIGHT':
      return 'Turn your head slightly to your right';
  }
}

/**
 * Calculate horizontal head yaw asymmetry relative to eyes.
 *
 * MediaPipe BlazeFace provides 6 keypoints:
 * 0: Right Eye (subject's right eye)
 * 1: Left Eye (subject's left eye)
 * 2: Nose Tip
 * 3: Mouth Center
 * 4: Right Ear Tragion
 * 5: Left Ear Tragion
 *
 * Invariant to CSS or camera mirroring because dLeft and dRight are measured
 * specifically to the labeled left and right eyes.
 */
export function calculateYawAsymmetry(
  keypoints?: Array<{ x: number; y: number; label?: string }>,
): YawAnalysis | null {
  if (!keypoints || keypoints.length < 3) {
    return null;
  }

  const rightEye = keypoints[0];
  const leftEye = keypoints[1];
  const nose = keypoints[2];

  if (!rightEye || !leftEye || !nose) {
    return null;
  }

  const dx = leftEye.x - rightEye.x;
  const dy = leftEye.y - rightEye.y;
  const eyeSpan = Math.sqrt(dx * dx + dy * dy);

  if (eyeSpan < LIVENESS_THRESHOLDS.MIN_EYE_SPAN) {
    return null;
  }

  // Horizontal distance from nose to each eye in normalized space
  const dRight = Math.abs(nose.x - rightEye.x);
  const dLeft = Math.abs(nose.x - leftEye.x);

  // Normalized asymmetry metric:
  // Facing forward: dLeft ≈ dRight -> yawMetric ≈ 0
  // Turn left (towards subject's left eye): dLeft < dRight -> yawMetric is negative
  // Turn right (towards subject's right eye): dRight < dLeft -> yawMetric is positive
  const yawMetric = (dLeft - dRight) / eyeSpan;

  return {
    yawMetric,
    isFacingForward: Math.abs(yawMetric) < LIVENESS_THRESHOLDS.NEUTRAL_TOLERANCE,
    isTurnedLeft: yawMetric <= -LIVENESS_THRESHOLDS.TURN_THRESHOLD,
    isTurnedRight: yawMetric >= LIVENESS_THRESHOLDS.TURN_THRESHOLD,
  };
}

export interface LivenessSessionCallbacks {
  onStatusChange?: (status: LivenessSessionStatus) => void;
  onProgress?: (progressPercent: number, remainingMs: number) => void;
  onComplete?: (result: LivenessCheckResult) => void;
  onInstruction?: (instruction: string) => void;
}

/**
 * Manages an active liveness verification session.
 */
export class LivenessSession {
  private status: LivenessSessionStatus = 'IDLE';
  private challengeType: LivenessChallengeType;
  private intervalId: any = null;
  private startTimeMs: number = 0;
  private baselineCount: number = 0;
  private sustainedTurnCount: number = 0;
  private isDestroyed: boolean = false;

  constructor(
    private videoElement: HTMLVideoElement | null,
    private callbacks: LivenessSessionCallbacks,
    initialChallenge?: LivenessChallengeType,
  ) {
    this.challengeType = initialChallenge || getRandomLivenessChallenge();
  }

  public getChallengeType(): LivenessChallengeType {
    return this.challengeType;
  }

  public getStatus(): LivenessSessionStatus {
    return this.status;
  }

  public start(): void {
    if (this.isDestroyed) return;
    this.stop();

    this.status = 'WAITING_FOR_FACE';
    this.baselineCount = 0;
    this.sustainedTurnCount = 0;
    this.callbacks.onStatusChange?.('WAITING_FOR_FACE');
    this.callbacks.onInstruction?.('Please center your face in the camera frame.');

    this.intervalId = setInterval(() => {
      this.tick();
    }, LIVENESS_THRESHOLDS.POLL_INTERVAL_MS);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.stop();
  }

  private tick(): void {
    if (this.isDestroyed || !this.videoElement) {
      return;
    }

    const now = performance.now();
    const detection = faceDetectionService.detectFaces(this.videoElement, now);

    if (detection.faceCount === 0) {
      this.baselineCount = 0;
      this.sustainedTurnCount = 0;
      if (this.status !== 'WAITING_FOR_FACE') {
        this.status = 'WAITING_FOR_FACE';
        this.callbacks.onStatusChange?.('WAITING_FOR_FACE');
      }
      this.callbacks.onInstruction?.('Face not detected. Please ensure good lighting and face the camera.');
      return;
    }

    if (detection.faceCount > 1) {
      this.baselineCount = 0;
      this.sustainedTurnCount = 0;
      this.status = 'FAILED_ANOMALY';
      this.callbacks.onStatusChange?.('FAILED_ANOMALY');
      this.callbacks.onInstruction?.('Multiple faces detected. Only the student should be visible.');
      return;
    }

    // Exactly 1 face present
    const yaw = calculateYawAsymmetry(detection.keypoints);

    if (!yaw) {
      this.callbacks.onInstruction?.('Please move closer to the camera.');
      return;
    }

    if (this.status === 'WAITING_FOR_FACE' || this.status === 'BASELINE_CALIBRATING') {
      if (yaw.isFacingForward) {
        this.baselineCount++;
        if (this.status !== 'BASELINE_CALIBRATING') {
          this.status = 'BASELINE_CALIBRATING';
          this.callbacks.onStatusChange?.('BASELINE_CALIBRATING');
          this.callbacks.onInstruction?.('Hold still, facing directly forward...');
        }

        if (this.baselineCount >= LIVENESS_THRESHOLDS.BASELINE_FRAMES) {
          // Neutral baseline established; start the active challenge!
          this.status = 'CHALLENGE_ACTIVE';
          this.startTimeMs = Date.now();
          this.callbacks.onStatusChange?.('CHALLENGE_ACTIVE');
          this.callbacks.onInstruction?.(getLivenessInstruction(this.challengeType));
        }
      } else {
        this.baselineCount = 0;
        this.callbacks.onInstruction?.('Please look straight ahead at the camera to begin.');
      }
      return;
    }

    if (this.status === 'CHALLENGE_ACTIVE') {
      const elapsedMs = Date.now() - this.startTimeMs;
      const remainingMs = Math.max(0, LIVENESS_THRESHOLDS.TIMEOUT_MS - elapsedMs);
      const progressPercent = Math.min(100, Math.round((elapsedMs / LIVENESS_THRESHOLDS.TIMEOUT_MS) * 100));

      this.callbacks.onProgress?.(progressPercent, remainingMs);

      if (elapsedMs >= LIVENESS_THRESHOLDS.TIMEOUT_MS) {
        this.stop();
        this.status = 'FAILED_TIMEOUT';
        this.callbacks.onStatusChange?.('FAILED_TIMEOUT');
        this.callbacks.onInstruction?.('Liveness check timed out. Movement was not detected.');
        this.callbacks.onComplete?.({
          passed: false,
          challengeType: this.challengeType,
          durationMs: elapsedMs,
          timestamp: new Date().toISOString(),
          reason: 'Timeout: head turn was not detected within time limit',
        });
        return;
      }

      // Check motion matching current challenge
      const motionMatches =
        (this.challengeType === 'TURN_LEFT' && yaw.isTurnedLeft) ||
        (this.challengeType === 'TURN_RIGHT' && yaw.isTurnedRight);

      if (motionMatches) {
        this.sustainedTurnCount++;
        if (this.sustainedTurnCount >= LIVENESS_THRESHOLDS.SUSTAINED_TURN_FRAMES) {
          // Success!
          this.stop();
          this.status = 'PASSED';
          this.callbacks.onStatusChange?.('PASSED');
          this.callbacks.onInstruction?.('Liveness confirmed!');
          this.callbacks.onComplete?.({
            passed: true,
            challengeType: this.challengeType,
            durationMs: elapsedMs,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      } else {
        this.sustainedTurnCount = Math.max(0, this.sustainedTurnCount - 1);
      }
    }
  }
}

export const livenessDetectionService = {
  getRandomChallenge: getRandomLivenessChallenge,
  getInstruction: getLivenessInstruction,
  calculateYawAsymmetry,
  createSession(
    videoElement: HTMLVideoElement | null,
    callbacks: LivenessSessionCallbacks,
    initialChallenge?: LivenessChallengeType,
  ): LivenessSession {
    return new LivenessSession(videoElement, callbacks, initialChallenge);
  },
};

export default livenessDetectionService;
