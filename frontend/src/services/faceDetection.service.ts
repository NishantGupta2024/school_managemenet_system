import { FilesetResolver, FaceDetector } from '@mediapipe/tasks-vision';
import type { Detection } from '@mediapipe/tasks-vision';

let detectorInstance: FaceDetector | null = null;
let initPromise: Promise<FaceDetector | null> | null = null;
let lastVideoTimestampMs: number = 0;

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
}

export interface FaceDetectionResult {
  faceCount: number;
  confidences: number[];
  timestampMs: number;
  keypoints?: Array<{ x: number; y: number; label?: string }>;
}

export const faceDetectionService = {
  /**
   * Initialize MediaPipe FaceDetector using 100% locally hosted assets in /wasm and /models.
   * Never calls external CDNs or remote APIs.
   */
  async getDetector(): Promise<FaceDetector | null> {
    if (detectorInstance) {
      return detectorInstance;
    }
    if (initPromise) {
      return initPromise;
    }

    initPromise = (async () => {
      try {
        const wasmPath = `${window.location.origin}/wasm`;
        const vision = await FilesetResolver.forVisionTasks(wasmPath);

        const modelPath = `${window.location.origin}/models/face_detector/blaze_face_short_range.tflite`;
        detectorInstance = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        });
        return detectorInstance;
      } catch (err) {
        console.warn('[FaceDetectionService] Failed to load local face detector assets:', err);
        detectorInstance = null;
        initPromise = null;
        return null;
      }
    })();

    return initPromise;
  },

  /**
   * Request webcam stream only on explicit user gesture.
   * audio: false is strictly enforced.
   */
  async requestCameraStream(constraints?: MediaTrackConstraints): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Webcam media devices API is not supported in this browser environment.');
    }

    const hasExplicitDeviceId = Boolean(constraints?.deviceId);
    const defaultConstraints: MediaStreamConstraints = {
      video: {
        width: { ideal: 320, max: 640 },
        height: { ideal: 240, max: 480 },
        frameRate: { ideal: 15, max: 30 },
        ...(hasExplicitDeviceId ? {} : { facingMode: 'user' }),
        ...constraints,
      },
      audio: false, // Strict exclusion: microphone is completely out of scope
    };

    return await navigator.mediaDevices.getUserMedia(defaultConstraints);
  },

  /**
   * Enumerate available video input devices after permission has been granted.
   */
  async listVideoDevices(): Promise<CameraDeviceInfo[]> {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label?.trim() || `Camera ${idx + 1}`,
        }));
    } catch (err) {
      console.warn('[FaceDetectionService] Failed to enumerate video devices:', err);
      return [];
    }
  },

  /**
   * Extract the active camera track's human-readable label (or fallback).
   */
  getStreamDeviceLabel(stream: MediaStream | null | undefined): string {
    if (!stream || typeof stream.getVideoTracks !== 'function') {
      return 'Default Camera';
    }
    const track = stream.getVideoTracks()[0];
    return track?.label?.trim() || 'Default Camera';
  },

  /**
   * Analyze one video frame in volatile memory for face count.
   * Frame data is NEVER converted to image, base64, canvas, or sent over network.
   */
  detectFaces(videoElement: HTMLVideoElement, timestampMs: number): FaceDetectionResult {
    if (!detectorInstance || videoElement.readyState < 2) {
      return { faceCount: 0, confidences: [], timestampMs };
    }

    try {
      const safeTimestampMs = Math.max(lastVideoTimestampMs + 1, Math.floor(timestampMs));
      lastVideoTimestampMs = safeTimestampMs;
      const detections: Detection[] = detectorInstance.detectForVideo(videoElement, safeTimestampMs).detections;
      const confidences = detections.map((d) => d.categories?.[0]?.score || 0);
      const primaryKeypoints = detections[0]?.keypoints
        ? detections[0].keypoints.map((kp) => ({ x: kp.x, y: kp.y, label: kp.label }))
        : undefined;

      return {
        faceCount: detections.length,
        confidences,
        timestampMs,
        keypoints: primaryKeypoints,
      };
    } catch (err) {
      console.warn('[FaceDetectionService] Frame detection error:', err);
      return { faceCount: 0, confidences: [], timestampMs };
    }
  },

  /**
   * Deterministically stop all tracks on a MediaStream to turn off the hardware camera LED.
   */
  stopCameraStream(stream: MediaStream | null | undefined): void {
    if (!stream) return;
    try {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
    } catch (e) {
      console.warn('[FaceDetectionService] Error stopping camera stream tracks:', e);
    }
  },
};

export default faceDetectionService;
