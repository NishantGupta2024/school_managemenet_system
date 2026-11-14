import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import type { Detection } from '@mediapipe/tasks-vision';

let detectorInstance: ObjectDetector | null = null;
let initPromise: Promise<ObjectDetector | null> | null = null;
let lastVideoTimestampMs: number = 0;
let detectorStatus: 'UNINITIALIZED' | 'INITIALIZING' | 'READY' | 'FAILED' = 'UNINITIALIZED';
let lastInitError: string | null = null;

export interface DetectedTargetObject {
  categoryName: string;
  score: number;
}

export interface ObjectDetectionResult {
  detectedObjects: DetectedTargetObject[];
  hasCellPhone: boolean;
  hasBook: boolean;
  hasPerson: boolean;
  personConfidence: number | null;
  timestampMs: number;
  rawCandidates?: DetectedTargetObject[];
  inferenceMs?: number;
}

export const TARGET_OBJECT_CLASSES = ['cell phone', 'book'] as const;
export const ALLOWED_DETECTION_LABELS = ['person', 'book', 'cell phone'] as const;
export const PROHIBITED_TARGET_CLASSES = ['cell phone', 'book'] as const;

export const OBJECT_DETECTION_CONFIG = {
  SAMPLING_INTERVAL_MS: 750,
  PERSISTENCE_WINDOW_MS: 3000,
  REQUIRED_SAMPLES: 2,
  CONFIDENCE_THRESHOLD: 0.38,
  COOLDOWN_MS: 30000,
  ADVISORY_HOLD_MS: 3000,
} as const;

/**
 * Pure evaluation function for persistence window policy.
 * Returns true if qualifying detection timestamps within the sliding window reach the required sample threshold.
 */
export function evaluatePersistenceWindow(
  timestamps: number[],
  currentTimeMs: number,
  windowMs: number = OBJECT_DETECTION_CONFIG.PERSISTENCE_WINDOW_MS,
  requiredSamples: number = OBJECT_DETECTION_CONFIG.REQUIRED_SAMPLES,
): { isTriggered: boolean; activeTimestamps: number[] } {
  const windowStart = currentTimeMs - windowMs;
  const activeTimestamps = timestamps.filter((ts) => ts >= windowStart);
  return {
    isTriggered: activeTimestamps.length >= requiredSamples,
    activeTimestamps,
  };
}

export const objectDetectionService = {
  /**
   * Current detector lifecycle status
   */
  getStatus(): 'UNINITIALIZED' | 'INITIALIZING' | 'READY' | 'FAILED' {
    return detectorStatus;
  },

  /**
   * Last initialization error if failed
   */
  getLastError(): string | null {
    return lastInitError;
  },

  /**
   * Set or override detector instance (useful for unit testing and mocks)
   */
  setDetectorInstance(instance: ObjectDetector | null): void {
    detectorInstance = instance;
    detectorStatus = instance ? 'READY' : 'UNINITIALIZED';
  },

  /**
   * Initialize MediaPipe ObjectDetector using locally hosted assets in /wasm and /models.
   * Model: efficientdet_lite0.tflite (Apache 2.0).
   * Runs in local memory only. Zero network calls or external data transfers.
   */
  async getDetector(): Promise<ObjectDetector | null> {
    if (detectorInstance) {
      detectorStatus = 'READY';
      return detectorInstance;
    }
    if (initPromise) {
      return initPromise;
    }

    detectorStatus = 'INITIALIZING';
    lastInitError = null;

    initPromise = (async () => {
      try {
        const wasmPath = `${window.location.origin}/wasm`;
        const vision = await FilesetResolver.forVisionTasks(wasmPath);

        const modelPath = `${window.location.origin}/models/object_detector/efficientdet_lite0.tflite`;
        const isDev = Boolean(import.meta.env?.DEV);
        detectorInstance = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          // In DEV, relax WASM-level scoreThreshold so raw candidate scores for allowed labels are observable;
          // categoryAllowlist strictly limits detection to person, book, and cell phone in all environments.
          scoreThreshold: isDev ? 0.05 : OBJECT_DETECTION_CONFIG.CONFIDENCE_THRESHOLD,
          categoryAllowlist: ['person', 'book', 'cell phone'],
          maxResults: 6,
        });
        detectorStatus = 'READY';
        return detectorInstance;
      } catch (err: any) {
        console.warn('[ObjectDetectionService] Failed to load local object detector assets:', err);
        detectorStatus = 'FAILED';
        lastInitError = err?.message || String(err);
        detectorInstance = null;
        initPromise = null;
        return null;
      }
    })();

    return initPromise;
  },

  /**
   * Analyze one video frame in volatile memory for prohibited physical materials.
   * Frame data is NEVER converted to image, canvas, or sent over network.
   */
  detectObjects(videoElement: HTMLVideoElement, timestampMs: number): ObjectDetectionResult {
    if (!detectorInstance || videoElement.readyState < 2) {
      return {
        detectedObjects: [],
        hasCellPhone: false,
        hasBook: false,
        hasPerson: false,
        personConfidence: null,
        timestampMs,
        rawCandidates: [],
        inferenceMs: 0,
      };
    }

    try {
      const safeTimestampMs = Math.max(lastVideoTimestampMs + 1, Math.floor(timestampMs));
      lastVideoTimestampMs = safeTimestampMs;
      const inferStartMs = performance.now();
      const detections: Detection[] = detectorInstance.detectForVideo(videoElement, safeTimestampMs).detections;
      const inferenceMs = Math.max(0, Math.round((performance.now() - inferStartMs) * 10) / 10);

      const detectedObjects: DetectedTargetObject[] = [];
      const rawCandidates: DetectedTargetObject[] = [];
      let hasCellPhone = false;
      let hasBook = false;
      let hasPerson = false;
      let personConfidence: number | null = null;

      for (const d of detections) {
        for (const cat of d.categories || []) {
          const name = cat.categoryName?.toLowerCase().trim();
          const score = Math.round((cat.score || 0) * 100) / 100;

          // Strictly filter out any label outside allowed set (e.g. toothbrush, cup, refrigerator)
          if (name !== 'person' && name !== 'book' && name !== 'cell phone') {
            continue;
          }

          rawCandidates.push({ categoryName: name, score });

          if (name === 'person') {
            hasPerson = true;
            personConfidence = Math.max(personConfidence ?? 0, score);
            // NOTE: 'person' is presence/face context only and is NEVER added to detectedObjects (cannot trigger violation or lock)
          } else if (score >= OBJECT_DETECTION_CONFIG.CONFIDENCE_THRESHOLD) {
            if (name === 'cell phone') {
              hasCellPhone = true;
              detectedObjects.push({ categoryName: 'cell phone', score });
            } else if (name === 'book') {
              hasBook = true;
              detectedObjects.push({ categoryName: 'book', score });
            }
          }
        }
      }

      // Sort raw candidates descending by confidence score
      rawCandidates.sort((a, b) => b.score - a.score);

      return {
        detectedObjects,
        hasCellPhone,
        hasBook,
        hasPerson,
        personConfidence,
        timestampMs,
        rawCandidates: rawCandidates.slice(0, 5),
        inferenceMs,
      };
    } catch (err) {
      console.warn('[ObjectDetectionService] Frame detection error:', err);
      return {
        detectedObjects: [],
        hasCellPhone: false,
        hasBook: false,
        hasPerson: false,
        personConfidence: null,
        timestampMs,
        rawCandidates: [],
        inferenceMs: 0,
      };
    }
  },

  /**
   * Dispose singleton instance when unmounting or completing exam.
   */
  close(): void {
    if (detectorInstance) {
      try {
        detectorInstance.close?.();
      } catch (e) {}
      detectorInstance = null;
      initPromise = null;
    }
    detectorStatus = 'UNINITIALIZED';
    lastInitError = null;
  },
};

export default objectDetectionService;
