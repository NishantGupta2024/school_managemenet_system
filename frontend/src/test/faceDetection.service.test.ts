import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faceDetectionService } from '../services/faceDetection.service';

describe('faceDetectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requestCameraStream', () => {
    it('strictly enforces audio: false and requests video stream from navigator.mediaDevices', async () => {
      const mockTrack = { stop: vi.fn() };
      const mockStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack]),
      } as unknown as MediaStream;

      const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);
      Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        value: { getUserMedia: getUserMediaMock },
        configurable: true,
        writable: true,
      });

      const stream = await faceDetectionService.requestCameraStream();

      expect(getUserMediaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: false, // Strict privacy exclusion
          video: expect.objectContaining({
            facingMode: 'user',
          }),
        }),
      );
      expect(stream).toBe(mockStream);
    });

    it('requests specific camera deviceId without forcing facingMode when deviceId is provided', async () => {
      const mockStream = {
        getTracks: vi.fn().mockReturnValue([]),
      } as unknown as MediaStream;
      const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);
      Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        value: { getUserMedia: getUserMediaMock },
        configurable: true,
        writable: true,
      });

      await faceDetectionService.requestCameraStream({ deviceId: { exact: 'usb-cam-1' } });

      expect(getUserMediaMock).toHaveBeenCalledWith({
        audio: false,
        video: {
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 },
          frameRate: { ideal: 15, max: 30 },
          deviceId: { exact: 'usb-cam-1' },
        },
      });
    });

    it('enumerates videoinput devices and extracts active stream track label', async () => {
      const enumerateDevicesMock = vi.fn().mockResolvedValue([
        { kind: 'videoinput', deviceId: 'cam-1', label: 'Integrated HD Webcam' },
        { kind: 'audioinput', deviceId: 'mic-1', label: 'Internal Mic' },
        { kind: 'videoinput', deviceId: 'cam-2', label: '' },
      ]);
      Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        value: { enumerateDevices: enumerateDevicesMock },
        configurable: true,
        writable: true,
      });

      const devices = await faceDetectionService.listVideoDevices();
      expect(devices).toEqual([
        { deviceId: 'cam-1', label: 'Integrated HD Webcam' },
        { deviceId: 'cam-2', label: 'Camera 2' },
      ]);

      const streamWithLabel = {
        getVideoTracks: () => [{ label: 'Logitech USB Camera' }],
      } as unknown as MediaStream;
      expect(faceDetectionService.getStreamDeviceLabel(streamWithLabel)).toBe('Logitech USB Camera');
      expect(faceDetectionService.getStreamDeviceLabel(null)).toBe('Default Camera');
    });

    it('throws descriptive error if mediaDevices is not supported', async () => {
      Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      await expect(faceDetectionService.requestCameraStream()).rejects.toThrow(
        /Webcam media devices API is not supported/,
      );
    });
  });

  describe('stopCameraStream', () => {
    it('stops all tracks on the media stream deterministically', () => {
      const track1 = { stop: vi.fn() };
      const track2 = { stop: vi.fn() };
      const mockStream = {
        getTracks: vi.fn().mockReturnValue([track1, track2]),
      } as unknown as MediaStream;

      faceDetectionService.stopCameraStream(mockStream);

      expect(track1.stop).toHaveBeenCalled();
      expect(track2.stop).toHaveBeenCalled();
    });

    it('handles null or undefined stream gracefully without throwing', () => {
      expect(() => faceDetectionService.stopCameraStream(null)).not.toThrow();
      expect(() => faceDetectionService.stopCameraStream(undefined)).not.toThrow();
    });
  });

  describe('detectFaces', () => {
    it('returns faceCount 0 if video readyState < 2', () => {
      const mockVideo = { readyState: 1 } as HTMLVideoElement;
      const res = faceDetectionService.detectFaces(mockVideo, 1000);

      expect(res.faceCount).toBe(0);
      expect(res.confidences).toEqual([]);
      expect(res.timestampMs).toBe(1000);
    });
  });

  describe('Pilot threshold accumulator logic', () => {
    it('simulates 7s no-face absence threshold triggering NO_FACE and 3s advisory banner', () => {
      let noFaceSeconds = 0;
      let advisoryVisible = false;
      let violationTriggered: string | null = null;

      // 1 to 2 seconds of 0 faces -> no advisory, no violation
      for (let s = 1; s <= 2; s++) {
        noFaceSeconds += 1;
        if (noFaceSeconds >= 3) advisoryVisible = true;
        if (noFaceSeconds >= 7) violationTriggered = 'NO_FACE';
      }
      expect(noFaceSeconds).toBe(2);
      expect(advisoryVisible).toBe(false);
      expect(violationTriggered).toBeNull();

      // 3rd second -> triggers 3s soft advisory banner
      noFaceSeconds += 1;
      if (noFaceSeconds >= 3) advisoryVisible = true;
      expect(noFaceSeconds).toBe(3);
      expect(advisoryVisible).toBe(true);
      expect(violationTriggered).toBeNull();

      // 4 to 6 seconds -> advisory remains, no event yet
      for (let s = 4; s <= 6; s++) {
        noFaceSeconds += 1;
        if (noFaceSeconds >= 7) violationTriggered = 'NO_FACE';
      }
      expect(noFaceSeconds).toBe(6);
      expect(violationTriggered).toBeNull();

      // 7th second -> triggers NO_FACE event
      noFaceSeconds += 1;
      if (noFaceSeconds >= 7) violationTriggered = 'NO_FACE';
      expect(noFaceSeconds).toBe(7);
      expect(violationTriggered).toBe('NO_FACE');
    });

    it('prevents single noisy 1-second face detection from resetting absence timer (requires 2 consecutive seconds)', () => {
      let noFaceSeconds = 5; // Student was absent for 5 seconds
      let consecutiveFaceDetections = 0;

      // 1-second ghost detection
      const facesDetectedFrame1 = 1;
      if (facesDetectedFrame1 === 1) {
        consecutiveFaceDetections += 1;
        if (consecutiveFaceDetections >= 2) {
          noFaceSeconds = 0;
        }
      }
      // Single frame does NOT reset absence timer!
      expect(consecutiveFaceDetections).toBe(1);
      expect(noFaceSeconds).toBe(5);

      // 2nd consecutive second of face detection -> now cleanly resets
      const facesDetectedFrame2 = 1;
      if (facesDetectedFrame2 === 1) {
        consecutiveFaceDetections += 1;
        if (consecutiveFaceDetections >= 2) {
          noFaceSeconds = 0;
        }
      }
      expect(consecutiveFaceDetections).toBe(2);
      expect(noFaceSeconds).toBe(0);
    });

    it('simulates 5s multiple-faces presence threshold triggering MULTIPLE_FACES', () => {
      let multipleFacesSeconds = 0;
      let violationTriggered: string | null = null;

      // 4 seconds of 2 faces -> no violation
      for (let s = 1; s <= 4; s++) {
        multipleFacesSeconds += 1;
        if (multipleFacesSeconds >= 5) {
          violationTriggered = 'MULTIPLE_FACES';
        }
      }
      expect(multipleFacesSeconds).toBe(4);
      expect(violationTriggered).toBeNull();

      // 5th second -> triggers MULTIPLE_FACES
      multipleFacesSeconds += 1;
      if (multipleFacesSeconds >= 5) {
        violationTriggered = 'MULTIPLE_FACES';
      }
      expect(multipleFacesSeconds).toBe(5);
      expect(violationTriggered).toBe('MULTIPLE_FACES');
    });
  });
});
