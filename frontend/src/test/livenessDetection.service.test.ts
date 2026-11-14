import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import faceDetectionService from '../services/faceDetection.service';
import {
  getRandomLivenessChallenge,
  getLivenessInstruction,
  calculateYawAsymmetry,
  LivenessSession,
  LIVENESS_THRESHOLDS,
  LivenessCheckResult,
} from '../services/livenessDetection.service';

describe('Liveness Detection Service (Pilot)', () => {
  describe('Challenge Selection & Instructions', () => {
    it('selects either TURN_LEFT or TURN_RIGHT challenge', () => {
      const challenge = getRandomLivenessChallenge();
      expect(['TURN_LEFT', 'TURN_RIGHT']).toContain(challenge);
    });

    it('returns human-readable instructions for each challenge type', () => {
      expect(getLivenessInstruction('TURN_LEFT')).toContain('left');
      expect(getLivenessInstruction('TURN_RIGHT')).toContain('right');
    });
  });

  describe('calculateYawAsymmetry (Geometric Yaw Metric)', () => {
    it('returns null if keypoints are undefined or fewer than 3', () => {
      expect(calculateYawAsymmetry(undefined)).toBeNull();
      expect(calculateYawAsymmetry([])).toBeNull();
      expect(calculateYawAsymmetry([{ x: 0.5, y: 0.5 }])).toBeNull();
    });

    it('returns null if eye span is too small (face too far or undetected)', () => {
      // Keypoints where eye distance is tiny (< 0.04)
      const tinyKeypoints = [
        { x: 0.5, y: 0.5 }, // right eye
        { x: 0.51, y: 0.5 }, // left eye (span = 0.01)
        { x: 0.505, y: 0.55 }, // nose
      ];
      expect(calculateYawAsymmetry(tinyKeypoints)).toBeNull();
    });

    it('correctly identifies neutral forward-facing pose', () => {
      // Symmetrical eye-to-nose distances
      const neutralKeypoints = [
        { x: 0.4, y: 0.4 }, // right eye
        { x: 0.6, y: 0.4 }, // left eye (span = 0.20)
        { x: 0.5, y: 0.5 }, // nose (midway between 0.4 and 0.6)
      ];

      const res = calculateYawAsymmetry(neutralKeypoints);
      expect(res).not.toBeNull();
      expect(Math.abs(res!.yawMetric)).toBeLessThan(0.01);
      expect(res!.isFacingForward).toBe(true);
      expect(res!.isTurnedLeft).toBe(false);
      expect(res!.isTurnedRight).toBe(false);
    });

    it('correctly detects head turned to the left (nose closer to left eye)', () => {
      // Subject turns left: nose shifts towards subject's left eye (x=0.6)
      const turnedLeftKeypoints = [
        { x: 0.4, y: 0.4 }, // right eye
        { x: 0.6, y: 0.4 }, // left eye
        { x: 0.56, y: 0.5 }, // nose closer to 0.6: dLeft = 0.04, dRight = 0.16
      ];

      const res = calculateYawAsymmetry(turnedLeftKeypoints);
      expect(res).not.toBeNull();
      // (0.04 - 0.16) / 0.20 = -0.60
      expect(res!.yawMetric).toBeLessThanOrEqual(-LIVENESS_THRESHOLDS.TURN_THRESHOLD);
      expect(res!.isTurnedLeft).toBe(true);
      expect(res!.isTurnedRight).toBe(false);
      expect(res!.isFacingForward).toBe(false);
    });

    it('correctly detects head turned to the right (nose closer to right eye)', () => {
      // Subject turns right: nose shifts towards subject's right eye (x=0.4)
      const turnedRightKeypoints = [
        { x: 0.4, y: 0.4 }, // right eye
        { x: 0.6, y: 0.4 }, // left eye
        { x: 0.44, y: 0.5 }, // nose closer to 0.4: dLeft = 0.16, dRight = 0.04
      ];

      const res = calculateYawAsymmetry(turnedRightKeypoints);
      expect(res).not.toBeNull();
      // (0.16 - 0.04) / 0.20 = +0.60
      expect(res!.yawMetric).toBeGreaterThanOrEqual(LIVENESS_THRESHOLDS.TURN_THRESHOLD);
      expect(res!.isTurnedRight).toBe(true);
      expect(res!.isTurnedLeft).toBe(false);
      expect(res!.isFacingForward).toBe(false);
    });

    it('maintains mathematical invariance when video feed is mirrored horizontally', () => {
      // In a mirrored feed, subject's right eye is at x=0.6 and left eye is at x=0.4
      const mirroredNeutral = [
        { x: 0.6, y: 0.4 }, // right eye
        { x: 0.4, y: 0.4 }, // left eye
        { x: 0.5, y: 0.5 }, // nose
      ];
      const resNeutral = calculateYawAsymmetry(mirroredNeutral);
      expect(resNeutral!.isFacingForward).toBe(true);

      // Subject turns left: nose moves towards subject's left eye (x=0.4)
      const mirroredTurnLeft = [
        { x: 0.6, y: 0.4 }, // right eye
        { x: 0.4, y: 0.4 }, // left eye
        { x: 0.44, y: 0.5 }, // nose closer to 0.4: dLeft = 0.04, dRight = 0.16
      ];
      const resLeft = calculateYawAsymmetry(mirroredTurnLeft);
      expect(resLeft!.isTurnedLeft).toBe(true);
      expect(resLeft!.yawMetric).toBeLessThanOrEqual(-LIVENESS_THRESHOLDS.TURN_THRESHOLD);
    });
  });

  describe('LivenessSession Lifecycle & State Machine', () => {
    let mockVideoElement: HTMLVideoElement;

    beforeEach(() => {
      vi.useFakeTimers();
      mockVideoElement = document.createElement('video');
      Object.defineProperty(mockVideoElement, 'readyState', { value: 4, configurable: true });
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('successfully completes TURN_LEFT challenge when student turns left over time', () => {
      let finalResult: LivenessCheckResult | null = null;
      const statusHistory: string[] = [];

      const session = new LivenessSession(
        mockVideoElement,
        {
          onStatusChange: (status) => statusHistory.push(status),
          onComplete: (res) => {
            finalResult = res;
          },
        },
        'TURN_LEFT',
      );

      // Neutral forward face
      const neutralDetection = {
        faceCount: 1,
        confidences: [0.95],
        timestampMs: 100,
        keypoints: [
          { x: 0.4, y: 0.4 },
          { x: 0.6, y: 0.4 },
          { x: 0.5, y: 0.5 },
        ],
      };

      // Turned left face
      const turnLeftDetection = {
        faceCount: 1,
        confidences: [0.95],
        timestampMs: 200,
        keypoints: [
          { x: 0.4, y: 0.4 },
          { x: 0.6, y: 0.4 },
          { x: 0.55, y: 0.5 },
        ],
      };

      const detectSpy = vi.spyOn(faceDetectionService, 'detectFaces');
      // 1. Initial neutral calibration frames
      detectSpy.mockReturnValue(neutralDetection);

      session.start();
      expect(session.getStatus()).toBe('WAITING_FOR_FACE');

      // Tick 3 baseline frames
      vi.advanceTimersByTime(100);
      vi.advanceTimersByTime(100);
      vi.advanceTimersByTime(100);

      expect(session.getStatus()).toBe('CHALLENGE_ACTIVE');

      // 2. Student turns head left for 3 consecutive frames
      detectSpy.mockReturnValue(turnLeftDetection);
      vi.advanceTimersByTime(100);
      vi.advanceTimersByTime(100);
      vi.advanceTimersByTime(100);

      expect(session.getStatus()).toBe('PASSED');
      expect(finalResult).not.toBeNull();
      expect(finalResult!.passed).toBe(true);
      expect(finalResult!.challengeType).toBe('TURN_LEFT');
    });

    it('successfully completes TURN_RIGHT challenge when student turns right over time', () => {
      let finalResult: LivenessCheckResult | null = null;

      const session = new LivenessSession(
        mockVideoElement,
        {
          onComplete: (res) => {
            finalResult = res;
          },
        },
        'TURN_RIGHT',
      );

      const neutralDetection = {
        faceCount: 1,
        confidences: [0.95],
        timestampMs: 100,
        keypoints: [
          { x: 0.4, y: 0.4 },
          { x: 0.6, y: 0.4 },
          { x: 0.5, y: 0.5 },
        ],
      };

      const turnRightDetection = {
        faceCount: 1,
        confidences: [0.95],
        timestampMs: 200,
        keypoints: [
          { x: 0.4, y: 0.4 },
          { x: 0.6, y: 0.4 },
          { x: 0.45, y: 0.5 },
        ],
      };

      const detectSpy = vi.spyOn(faceDetectionService, 'detectFaces');
      detectSpy.mockReturnValue(neutralDetection);

      session.start();
      // Establish baseline (3 frames)
      vi.advanceTimersByTime(300);
      expect(session.getStatus()).toBe('CHALLENGE_ACTIVE');

      // Student turns head right (3 frames)
      detectSpy.mockReturnValue(turnRightDetection);
      vi.advanceTimersByTime(300);

      expect(session.getStatus()).toBe('PASSED');
      expect(finalResult!.passed).toBe(true);
      expect(finalResult!.challengeType).toBe('TURN_RIGHT');
    });

    it('triggers timeout when student does not perform the motion within time limit', () => {
      let finalResult: LivenessCheckResult | null = null;

      const session = new LivenessSession(
        mockVideoElement,
        {
          onComplete: (res) => {
            finalResult = res;
          },
        },
        'TURN_LEFT',
      );

      const neutralDetection = {
        faceCount: 1,
        confidences: [0.95],
        timestampMs: 100,
        keypoints: [
          { x: 0.4, y: 0.4 },
          { x: 0.6, y: 0.4 },
          { x: 0.5, y: 0.5 },
        ],
      };

      // Student stays facing forward indefinitely
      vi.spyOn(faceDetectionService, 'detectFaces').mockReturnValue(neutralDetection);

      session.start();
      // Establish baseline
      vi.advanceTimersByTime(300);
      expect(session.getStatus()).toBe('CHALLENGE_ACTIVE');

      // Advance past timeout (7000ms)
      vi.advanceTimersByTime(7500);

      expect(session.getStatus()).toBe('FAILED_TIMEOUT');
      expect(finalResult).not.toBeNull();
      expect(finalResult!.passed).toBe(false);
      expect(finalResult!.reason).toContain('Timeout');
    });

    it('handles poor lighting or missing face without crashing', () => {
      let currentInstruction = '';

      const session = new LivenessSession(
        mockVideoElement,
        {
          onInstruction: (inst) => {
            currentInstruction = inst;
          },
        },
        'TURN_LEFT',
      );

      // Model returns 0 faces (poor lighting / face away)
      vi.spyOn(faceDetectionService, 'detectFaces').mockReturnValue({
        faceCount: 0,
        confidences: [],
        timestampMs: 100,
      });

      session.start();
      vi.advanceTimersByTime(200);

      expect(session.getStatus()).toBe('WAITING_FOR_FACE');
      expect(currentInstruction).toContain('Face not detected');
    });

    it('handles multiple faces anomaly gracefully', () => {
      let currentInstruction = '';

      const session = new LivenessSession(
        mockVideoElement,
        {
          onInstruction: (inst) => {
            currentInstruction = inst;
          },
        },
        'TURN_RIGHT',
      );

      // Model returns 2 faces in camera frame
      vi.spyOn(faceDetectionService, 'detectFaces').mockReturnValue({
        faceCount: 2,
        confidences: [0.9, 0.85],
        timestampMs: 100,
      });

      session.start();
      vi.advanceTimersByTime(200);

      expect(session.getStatus()).toBe('FAILED_ANOMALY');
      expect(currentInstruction).toContain('Multiple faces detected');
    });

    it('cleans up interval timer when destroyed', () => {
      const session = new LivenessSession(mockVideoElement, {}, 'TURN_LEFT');
      session.start();

      session.destroy();
      const detectSpy = vi.spyOn(faceDetectionService, 'detectFaces');
      vi.advanceTimersByTime(500);

      expect(detectSpy).not.toHaveBeenCalled();
    });
  });
});
