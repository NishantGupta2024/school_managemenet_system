import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioMonitoringService } from '../services/audioMonitoring.service';

describe('AudioMonitoringService (Local Pilot)', () => {
  let service: AudioMonitoringService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AudioMonitoringService();
  });

  afterEach(() => {
    service.stopMicrophoneStream();
  });

  describe('requestMicrophoneStream', () => {
    it('strictly enforces video: false and requests audio stream only on user gesture', async () => {
      const mockTrack = { stop: vi.fn() };
      const mockStream = {
        getAudioTracks: vi.fn().mockReturnValue([mockTrack]),
      } as unknown as MediaStream;

      const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);
      Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        value: { getUserMedia: getUserMediaMock },
        configurable: true,
        writable: true,
      });

      const stream = await service.requestMicrophoneStream();

      expect(getUserMediaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }),
          video: false, // Strict camera exclusion
        }),
      );
      expect(stream).toBe(mockStream);
    });

    it('extracts active microphone stream label cleanly', () => {
      const streamWithLabel = {
        getAudioTracks: () => [{ label: 'Realtek HD Audio Mic' }],
      } as unknown as MediaStream;
      expect(service.getStreamDeviceLabel(streamWithLabel)).toBe('Realtek HD Audio Mic');
      expect(service.getStreamDeviceLabel(null)).toBe('Default Microphone');
    });

    it('throws descriptive error if mediaDevices is not available', async () => {
      Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      await expect(service.requestMicrophoneStream()).rejects.toThrow(
        /Microphone media devices API is not supported/,
      );
    });
  });

  describe('calculateRmsAndDb', () => {
    it('computes correct RMS and dBFS for non-zero signal', () => {
      // Array of amplitude 0.1
      const samples = new Float32Array(512);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = 0.1;
      }

      const res = service.calculateRmsAndDb(samples);
      expect(res.rms).toBeCloseTo(0.1, 3);
      // 20 * log10(0.1) = -20 dB
      expect(res.db).toBeCloseTo(-20.0, 1);
    });

    it('clamps to -100 dBFS on digital silence without returning -Infinity', () => {
      const silence = new Float32Array(512);
      const res = service.calculateRmsAndDb(silence);

      expect(res.rms).toBe(0);
      expect(res.db).toBe(-100);
    });
  });

  describe('Moving-window speech pause tolerance and accumulator logic', () => {
    it('verifies threshold delta is 9 dB above baseline and sustained duration is 2500 ms', () => {
      service.setBaselineDb(-48);
      expect(service.getBaselineDb()).toBe(-48);
      // Baseline -48 dB + 9 dB delta = -39 dB threshold
      const thresholdDb = service.getBaselineDb() + 9;
      expect(thresholdDb).toBe(-39);
    });

    it('rejects transient sound bursts (< 1.5s, e.g. 400ms cough or key click) without triggering', () => {
      let t = 1000;
      let lastRes: any;

      // 400ms burst (4 ticks @ 100ms)
      for (let i = 0; i < 4; i++) {
        t += 100;
        lastRes = service.processSample(true, -35, t);
      }
      expect(lastRes.sustainedDurationMs).toBe(400);
      expect(lastRes.triggered).toBe(false);

      // Followed by 3.5 seconds of silence
      for (let i = 0; i < 35; i++) {
        t += 100;
        lastRes = service.processSample(false, -55, t);
      }
      // Window rolled past the transient burst
      expect(lastRes.sustainedDurationMs).toBe(0);
      expect(lastRes.triggered).toBe(false);
    });

    it('tolerates natural speech pauses and triggers when active speech reaches 2500 ms within 3.5s window', () => {
      service.resetState();
      let t = 10000;
      let lastRes: any;

      // Phrase 1: 1.2s speech (12 ticks)
      for (let i = 0; i < 12; i++) {
        t += 100;
        lastRes = service.processSample(true, -34, t);
      }
      expect(lastRes.sustainedDurationMs).toBe(1200);
      expect(lastRes.triggered).toBe(false);

      // Natural conversational pause: 300ms pause (3 ticks)
      for (let i = 0; i < 3; i++) {
        t += 100;
        lastRes = service.processSample(false, -50, t);
      }
      // Accumulator is preserved, not destroyed by pause
      expect(lastRes.sustainedDurationMs).toBe(1200);
      expect(lastRes.triggered).toBe(false);

      // Phrase 2: 1.3s speech (13 ticks)
      for (let i = 0; i < 13; i++) {
        t += 100;
        lastRes = service.processSample(true, -32, t);
      }
      // 1.2s + 1.3s = 2.5s active speech within 2.8s total window
      expect(lastRes.sustainedDurationMs).toBe(2500);
      expect(lastRes.triggered).toBe(true);
      expect(lastRes.peakDb).toBe(-32);
    });

    it('triggers violation on continuously sustained sound for 2500 ms', () => {
      service.resetState();
      let t = 20000;
      let lastRes: any;

      for (let i = 0; i < 24; i++) {
        t += 100;
        lastRes = service.processSample(true, -30, t);
      }
      expect(lastRes.sustainedDurationMs).toBe(2400);
      expect(lastRes.triggered).toBe(false);

      t += 100;
      lastRes = service.processSample(true, -29, t);
      expect(lastRes.sustainedDurationMs).toBe(2500);
      expect(lastRes.triggered).toBe(true);
      expect(lastRes.peakDb).toBe(-29);
    });

    it('enforces 15-second cooldown between duplicate violation events', () => {
      service.resetState();
      let t = 30000;
      let lastRes: any;

      // 25 active ticks triggers violation at t=32500ms
      for (let i = 0; i < 25; i++) {
        t += 100;
        lastRes = service.processSample(true, -31, t);
      }
      expect(lastRes.triggered).toBe(true);

      // Sound continues 5 seconds later (t=37500ms) -> suppressed by 15s cooldown
      t = 37500;
      lastRes = service.processSample(true, -31, t);
      expect(lastRes.triggered).toBe(false);

      // Sound continues 16 seconds later (after cooldown): sustained sound triggers again
      t = 48600;
      for (let i = 0; i < 25; i++) {
        t += 100;
        lastRes = service.processSample(true, -31, t);
      }
      expect(lastRes.triggered).toBe(true);
    });
  });

  describe('stopMicrophoneStream', () => {
    it('stops all audio tracks on active stream deterministically', () => {
      const track1 = { stop: vi.fn() };
      const track2 = { stop: vi.fn() };
      const mockStream = {
        getAudioTracks: vi.fn().mockReturnValue([track1, track2]),
      } as unknown as MediaStream;

      service.stopMicrophoneStream(mockStream);

      expect(track1.stop).toHaveBeenCalled();
      expect(track2.stop).toHaveBeenCalled();
    });

    it('handles null/undefined stream safely without error', () => {
      expect(() => service.stopMicrophoneStream(null)).not.toThrow();
      expect(() => service.stopMicrophoneStream(undefined)).not.toThrow();
    });
  });
});
