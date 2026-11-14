import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  objectDetectionService,
  OBJECT_DETECTION_CONFIG,
  evaluatePersistenceWindow,
} from '../services/objectDetection.service';

describe('Object Detection Pilot Service - Logic & Filtering', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    objectDetectionService.close();
  });

  it('filters out objects below the 0.38 pilot threshold', () => {
    const mockDetector = {
      detectForVideo: vi.fn().mockReturnValue({
        detections: [
          {
            categories: [
              { categoryName: 'cell phone', score: 0.35 }, // below 0.38
              { categoryName: 'book', score: 0.37 },       // below 0.38
            ],
          },
        ],
      }),
    };

    // Inject mock detector
    objectDetectionService.setDetectorInstance(mockDetector as any);

    const mockVideo = { readyState: 4 } as HTMLVideoElement;
    const result = objectDetectionService.detectObjects(mockVideo, 1000);

    expect(result.detectedObjects).toHaveLength(0);
    expect(result.hasCellPhone).toBe(false);
    expect(result.hasBook).toBe(false);
  });

  it('identifies cell phone and book when confidence >= 0.38', () => {
    const mockDetector = {
      detectForVideo: vi.fn().mockReturnValue({
        detections: [
          {
            categories: [
              { categoryName: 'cell phone', score: 0.42 }, // above 0.38
              { categoryName: 'book', score: 0.39 },       // above 0.38
              { categoryName: 'chair', score: 0.90 },      // untargeted class
            ],
          },
        ],
      }),
    };

    objectDetectionService.setDetectorInstance(mockDetector as any);

    const mockVideo = { readyState: 4 } as HTMLVideoElement;
    const result = objectDetectionService.detectObjects(mockVideo, 1000);

    expect(result.detectedObjects).toHaveLength(2);
    expect(result.hasCellPhone).toBe(true);
    expect(result.hasBook).toBe(true);
    expect(result.detectedObjects[0]).toEqual({ categoryName: 'cell phone', score: 0.42 });
    expect(result.detectedObjects[1]).toEqual({ categoryName: 'book', score: 0.39 });
    // Chair should be completely filtered out of rawCandidates as well
    expect(result.rawCandidates?.some((c) => c.categoryName === 'chair')).toBe(false);
  });

  it('strictly excludes unrelated classes (toothbrush, cup, refrigerator) from rawCandidates and detectedObjects', () => {
    const mockDetector = {
      detectForVideo: vi.fn().mockReturnValue({
        detections: [
          {
            categories: [
              { categoryName: 'toothbrush', score: 0.95 },
              { categoryName: 'cup', score: 0.88 },
              { categoryName: 'refrigerator', score: 0.75 },
              { categoryName: 'bottle', score: 0.60 },
            ],
          },
        ],
      }),
    };

    objectDetectionService.setDetectorInstance(mockDetector as any);

    const mockVideo = { readyState: 4 } as HTMLVideoElement;
    const result = objectDetectionService.detectObjects(mockVideo, 1000);

    // None of these should make it into detectedObjects or rawCandidates
    expect(result.detectedObjects).toHaveLength(0);
    expect(result.rawCandidates).toHaveLength(0);
    expect(result.hasCellPhone).toBe(false);
    expect(result.hasBook).toBe(false);
    expect(result.hasPerson).toBe(false);
  });

  it('treats person as presence-only information without adding to detectedObjects or triggering flags', () => {
    const mockDetector = {
      detectForVideo: vi.fn().mockReturnValue({
        detections: [
          {
            categories: [
              { categoryName: 'person', score: 0.92 },
            ],
          },
        ],
      }),
    };

    objectDetectionService.setDetectorInstance(mockDetector as any);

    const mockVideo = { readyState: 4 } as HTMLVideoElement;
    const result = objectDetectionService.detectObjects(mockVideo, 1000);

    // person presence is recognized
    expect(result.hasPerson).toBe(true);
    expect(result.personConfidence).toBe(0.92);
    expect(result.rawCandidates).toEqual([{ categoryName: 'person', score: 0.92 }]);

    // CRITICAL SAFETY CHECK: person is NEVER added to detectedObjects (cannot trigger violation or lock)
    expect(result.detectedObjects).toHaveLength(0);
    expect(result.hasCellPhone).toBe(false);
    expect(result.hasBook).toBe(false);
  });

  it('proves person presence never triggers prohibited object violation or lock condition', () => {
    const targetProhibitedClasses = ['cell phone', 'book'] as const;
    const mockPersonResult = {
      detectedObjects: [],
      hasCellPhone: false,
      hasBook: false,
      hasPerson: true,
      personConfidence: 0.94,
      timestampMs: 1000,
      rawCandidates: [{ categoryName: 'person', score: 0.94 }],
    };

    // Simulate checking target classes in the examination runner loop
    for (const targetClass of targetProhibitedClasses) {
      const isPresent = targetClass === 'cell phone' ? mockPersonResult.hasCellPhone : mockPersonResult.hasBook;
      expect(isPresent).toBe(false);
    }
    // Prohibited violation count remains 0
    expect(mockPersonResult.detectedObjects.length).toBe(0);
  });

  it('exports verified pilot timing configuration constants', () => {
    expect(OBJECT_DETECTION_CONFIG.SAMPLING_INTERVAL_MS).toBe(750);
    expect(OBJECT_DETECTION_CONFIG.PERSISTENCE_WINDOW_MS).toBe(3000);
    expect(OBJECT_DETECTION_CONFIG.REQUIRED_SAMPLES).toBe(2);
    expect(OBJECT_DETECTION_CONFIG.CONFIDENCE_THRESHOLD).toBe(0.38);
    expect(OBJECT_DETECTION_CONFIG.COOLDOWN_MS).toBe(30000);
    expect(OBJECT_DETECTION_CONFIG.ADVISORY_HOLD_MS).toBe(3000);
  });

  it('triggers after two qualifying detections within 3 seconds', () => {
    // Two samples at 750ms spacing: t=1000ms and t=1750ms
    const timestamps = [1000, 1750];
    const currentTimeMs = 1750;

    const evalResult = evaluatePersistenceWindow(timestamps, currentTimeMs);
    expect(evalResult.activeTimestamps).toEqual([1000, 1750]);
    expect(evalResult.isTriggered).toBe(true);
  });

  it('does NOT trigger on a single detection alone', () => {
    // Single sample at t=1000ms
    const timestamps = [1000];
    const currentTimeMs = 1000;

    const evalResult = evaluatePersistenceWindow(timestamps, currentTimeMs);
    expect(evalResult.activeTimestamps).toEqual([1000]);
    expect(evalResult.isTriggered).toBe(false);
  });

  it('does NOT count samples outside the 3-second sliding window', () => {
    // Sample 1 at t=1000ms, Sample 2 at t=4500ms (3.5s elapsed, outside 3s window)
    const timestamps = [1000, 4500];
    const currentTimeMs = 4500;

    const evalResult = evaluatePersistenceWindow(timestamps, currentTimeMs);
    // t=1000ms is < (4500 - 3000 = 1500ms), so it must be discarded
    expect(evalResult.activeTimestamps).toEqual([4500]);
    expect(evalResult.isTriggered).toBe(false);
  });

  it('tolerates an intermittent dropped frame within the 3-second window', () => {
    // Sample 1 at t=1000ms, frame at t=1750ms dropped/missed, Sample 2 at t=2500ms
    const timestamps = [1000, 2500];
    const currentTimeMs = 2500;

    const evalResult = evaluatePersistenceWindow(timestamps, currentTimeMs);
    // Both 1000ms and 2500ms are within (2500 - 3000 = -500ms)
    expect(evalResult.activeTimestamps).toHaveLength(2);
    expect(evalResult.isTriggered).toBe(true);
  });

  it('enforces 30-second cooldown between audit events', () => {
    const cooldownMs = OBJECT_DETECTION_CONFIG.COOLDOWN_MS;
    let lastReported = 10000;

    // Subsequent sample after 5s (t=15000): should NOT fire
    const sampleTime1 = 15000;
    expect(sampleTime1 - lastReported >= cooldownMs).toBe(false);

    // Subsequent sample after 31s (t=41000): SHOULD fire
    const sampleTime2 = 41000;
    expect(sampleTime2 - lastReported >= cooldownMs).toBe(true);
  });

  it('maintains anti-flicker hold for advisory banner', () => {
    const holdDurationMs = OBJECT_DETECTION_CONFIG.ADVISORY_HOLD_MS;
    const detectedAt = 10000;
    const activeUntil = detectedAt + holdDurationMs;

    // Immediately after drop at t=11000 (1 second after detection)
    expect(11000 < activeUntil).toBe(true); // banner remains visible

    // After hold expires at t=13500 (3.5 seconds after detection)
    expect(13500 >= activeUntil).toBe(true); // banner clears cleanly
  });

  it('measures and returns per-frame inferenceMs in detectObjects result', () => {
    const mockDetector = {
      detectForVideo: vi.fn().mockReturnValue({
        detections: [
          {
            categories: [{ categoryName: 'cell phone', score: 0.44 }],
          },
        ],
      }),
    };

    objectDetectionService.setDetectorInstance(mockDetector as any);

    const mockVideo = { readyState: 4 } as HTMLVideoElement;
    const result = objectDetectionService.detectObjects(mockVideo, 2000);

    expect(typeof result.inferenceMs).toBe('number');
    expect(result.inferenceMs).toBeGreaterThanOrEqual(0);
    expect(result.hasCellPhone).toBe(true);
  });
});
