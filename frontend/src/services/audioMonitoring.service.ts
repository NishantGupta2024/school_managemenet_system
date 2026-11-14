// =============================================================================
// Audio Monitoring Service (Local Pilot Only)
// Standard HTML5 Web Audio API: Zero external npm dependencies
// Audio is processed purely in volatile memory. Never recorded or uploaded.
// =============================================================================

export interface AudioCalibrationResult {
  baselineDb: number;
  noiseFloorRms: number;
  durationMs: number;
}

export interface AudioSampleSlot {
  isAbove: boolean;
  db: number;
  timestampMs: number;
}

export interface AudioAnalysisSample {
  currentRms: number;
  currentDb: number;
  isAboveThreshold: boolean;
  sustainedDurationMs?: number;
  peakDb?: number;
  thresholdDb?: number;
  baselineDb?: number;
}

export interface NoiseMonitorCallbacks {
  onLevelSample?: (sample: AudioAnalysisSample) => void;
  onSustainedNoiseDetected?: (durationMs: number, peakDb: number) => void;
  onStatusChange?: (status: 'CALIBRATING' | 'MONITORING' | 'MUTED' | 'IDLE') => void;
}

export class AudioMonitoringService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphoneSource: MediaStreamAudioSourceNode | null = null;
  private activeStream: MediaStream | null = null;
  private monitorInterval: ReturnType<typeof setInterval> | null = null;

  // Pilot settings approved as provisional values
  private baselineDb: number = -50;
  private readonly thresholdDeltaDb: number = 9; // +9 dB above calibrated baseline (Stage 1 sensitivity)
  private readonly sustainedDurationMs: number = 2500; // 2.5 seconds of sustained active audio
  private readonly windowDurationMs: number = 3500; // 3.5 seconds moving window to tolerate natural speech pauses
  private readonly cooldownMs: number = 15000; // 15 seconds event cooldown

  private slidingWindowSamples: AudioSampleSlot[] = [];
  private peakEventDb: number = -100;
  private lastViolationTimestampMs: number = 0;

  /**
   * Request microphone stream ONLY on explicit user gesture.
   * video: false is strictly enforced.
   */
  async requestMicrophoneStream(constraints?: MediaTrackConstraints): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone media devices API is not supported in this browser environment.');
    }

    const defaultConstraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: false, // Disabled so voice played in room/speakers is not subtracted by WebRTC AEC
        noiseSuppression: false, // Disabled during calibration to accurately capture room fan/AC baseline
        autoGainControl: false,  // Disabled to prevent AGC boosting background quietness
        ...constraints,
      },
      video: false, // Strict exclusion: video is handled separately
    };

    const stream = await navigator.mediaDevices.getUserMedia(defaultConstraints);
    this.activeStream = stream;
    return stream;
  }

  /**
   * Extract the active microphone track's human-readable label (or fallback).
   */
  getStreamDeviceLabel(stream?: MediaStream | null): string {
    const target = stream || this.activeStream;
    if (!target || typeof target.getAudioTracks !== 'function') {
      return 'Default Microphone';
    }
    const track = target.getAudioTracks()[0];
    return track?.label?.trim() || 'Default Microphone';
  }

  /**
   * Initialize Web Audio pipeline for stream
   */
  private setupAudioNodes(stream: MediaStream): { context: AudioContext; analyser: AnalyserNode } {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch((err) => console.warn('[AudioMonitoringService] Context resume failed', err));
    }

    if (this.microphoneSource) {
      try {
        this.microphoneSource.disconnect();
      } catch (e) {
        // Ignore if already disconnected
      }
      this.microphoneSource = null;
    }

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.3;

    this.microphoneSource = this.audioContext.createMediaStreamSource(stream);
    this.microphoneSource.connect(this.analyser);
    // Note: Do NOT connect analyser to audioContext.destination (avoids audio feedback loop)

    return { context: this.audioContext, analyser: this.analyser };
  }

  /**
   * Calculate Root Mean Square (RMS) and decibels full scale (dBFS)
   */
  calculateRmsAndDb(timeDomainData: Float32Array): { rms: number; db: number } {
    let sumSquares = 0;
    for (let i = 0; i < timeDomainData.length; i++) {
      sumSquares += timeDomainData[i] * timeDomainData[i];
    }
    const rms = Math.sqrt(sumSquares / timeDomainData.length);
    // Safe clamp to avoid -Infinity on digital silence (minimum -100 dBFS)
    const db = rms > 0.00001 ? 20 * Math.log10(rms) : -100;
    return { rms, db: Math.round(db * 10) / 10 };
  }

  /**
   * 3-Second Ambient Noise Baseline Calibration
   * Samples ordinary background noise including computer and room fans.
   */
  async calibrateAmbientBaseline(
    stream: MediaStream,
    durationMs: number = 3000,
    onProgress?: (progressPercent: number, currentDb: number) => void,
  ): Promise<AudioCalibrationResult> {
    const { analyser } = this.setupAudioNodes(stream);
    const dataArray = new Float32Array(analyser.fftSize);

    const startTime = performance.now();
    let totalRms = 0;
    let sampleCount = 0;

    return new Promise((resolve) => {
      const intervalMs = 100; // 10 Hz sampling
      const timer = setInterval(() => {
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }
        analyser.getFloatTimeDomainData(dataArray);
        const { rms, db } = this.calculateRmsAndDb(dataArray);

        totalRms += rms;
        sampleCount += 1;

        const elapsed = performance.now() - startTime;
        const progress = Math.min(100, Math.round((elapsed / durationMs) * 100));

        if (onProgress) {
          onProgress(progress, db);
        }

        if (elapsed >= durationMs) {
          clearInterval(timer);
          const avgRms = sampleCount > 0 ? totalRms / sampleCount : 0.01;
          const rawBaselineDb = Math.round((avgRms > 0.00001 ? 20 * Math.log10(avgRms) : -50) * 10) / 10;
          // Clamp baseline between -65 dBFS and -35 dBFS so transient sounds during calibration don't push threshold out of speech range
          const baselineDb = Math.max(-65, Math.min(-35, rawBaselineDb));
          this.baselineDb = baselineDb;

          resolve({
            baselineDb,
            noiseFloorRms: Math.round(avgRms * 1000) / 1000,
            durationMs,
          });
        }
      }, intervalMs);
    });
  }

  /**
   * Get currently set baseline dB
   */
  getBaselineDb(): number {
    return this.baselineDb;
  }

  /**
   * Set custom baseline dB (e.g. from preflight calibration result)
   */
  setBaselineDb(baselineDb: number): void {
    this.baselineDb = baselineDb;
  }

  /**
   * Process a single 100ms audio sample with a moving-window detector.
   * Tolerates natural conversational speech pauses (up to 1.0s cumulative pause within a 3.5s window).
   * Audio data is volatile and never persisted or uploaded.
   */
  processSample(
    isAbove: boolean,
    db: number,
    nowMs: number = performance.now(),
  ): {
    sustainedDurationMs: number;
    peakDb: number;
    triggered: boolean;
  } {
    // 1. Append current sample
    this.slidingWindowSamples.push({ isAbove, db, timestampMs: nowMs });

    // 2. Prune samples older than moving window (3500ms)
    const windowStartMs = nowMs - this.windowDurationMs;
    while (
      this.slidingWindowSamples.length > 0 &&
      this.slidingWindowSamples[0].timestampMs <= windowStartMs
    ) {
      this.slidingWindowSamples.shift();
    }

    // 3. Count active samples in current window (each sample is 100ms)
    const activeSampleCount = this.slidingWindowSamples.filter((s) => s.isAbove).length;
    const sustainedDurationMs = activeSampleCount * 100;

    // 4. Track peak dB over active samples in current window
    let currentPeakDb = -100;
    for (const s of this.slidingWindowSamples) {
      if (s.isAbove && s.db > currentPeakDb) {
        currentPeakDb = s.db;
      }
    }
    this.peakEventDb = currentPeakDb;

    // 5. Evaluate sustained activity threshold and 15s cooldown
    let triggered = false;
    if (sustainedDurationMs >= this.sustainedDurationMs) {
      if (
        this.lastViolationTimestampMs === 0 ||
        nowMs - this.lastViolationTimestampMs >= this.cooldownMs
      ) {
        this.lastViolationTimestampMs = nowMs;
        triggered = true;
      }
    }

    return {
      sustainedDurationMs,
      peakDb: this.peakEventDb,
      triggered,
    };
  }

  /**
   * Start 10 Hz Real-Time Audio Level & Sustained Noise Monitor in Runner
   */
  startNoiseMonitor(
    stream: MediaStream,
    callbacks: NoiseMonitorCallbacks,
    customBaselineDb?: number,
  ): void {
    this.stopNoiseMonitor();

    if (customBaselineDb !== undefined) {
      this.baselineDb = customBaselineDb;
    }

    const { analyser } = this.setupAudioNodes(stream);
    const dataArray = new Float32Array(analyser.fftSize);

    this.slidingWindowSamples = [];
    this.peakEventDb = -100;
    const intervalMs = 100; // 10 Hz sampling

    if (callbacks.onStatusChange) {
      callbacks.onStatusChange('MONITORING');
    }

    this.monitorInterval = setInterval(() => {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      analyser.getFloatTimeDomainData(dataArray);
      const { rms, db } = this.calculateRmsAndDb(dataArray);

      const thresholdDb = Math.round((this.baselineDb + this.thresholdDeltaDb) * 10) / 10;
      const isAbove = db >= thresholdDb;
      const nowMs = performance.now();

      const result = this.processSample(isAbove, db, nowMs);

      if (result.triggered && callbacks.onSustainedNoiseDetected) {
        callbacks.onSustainedNoiseDetected(result.sustainedDurationMs, result.peakDb);
      }

      if (callbacks.onLevelSample) {
        callbacks.onLevelSample({
          currentRms: rms,
          currentDb: db,
          isAboveThreshold: isAbove,
          sustainedDurationMs: result.sustainedDurationMs,
          peakDb: result.peakDb,
          thresholdDb,
          baselineDb: this.baselineDb,
        });
      }
    }, intervalMs);
  }

  /**
   * Stop active timer monitoring
   */
  stopNoiseMonitor(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.slidingWindowSamples = [];
    this.peakEventDb = -100;
  }

  /**
   * Reset monitoring history and cooldown for test isolation
   */
  resetState(): void {
    this.stopNoiseMonitor();
    this.lastViolationTimestampMs = 0;
  }

  /**
   * Deterministically stop all tracks on a MediaStream and close Web Audio nodes
   */
  stopMicrophoneStream(stream?: MediaStream | null): void {
    this.stopNoiseMonitor();

    const targetStream = stream || this.activeStream;
    if (targetStream) {
      try {
        targetStream.getAudioTracks().forEach((track) => {
          track.stop();
        });
      } catch (e) {
        console.warn('[AudioMonitoringService] Error stopping audio tracks:', e);
      }
    }

    if (this.microphoneSource) {
      try {
        this.microphoneSource.disconnect();
      } catch (e) {
        // Source already disconnected
      }
      this.microphoneSource = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close().catch(() => {});
      } catch (e) {
        // Context closing
      }
      this.audioContext = null;
    }

    this.analyser = null;
    this.activeStream = null;
  }
}

export const audioMonitoringService = new AudioMonitoringService();
export default audioMonitoringService;
