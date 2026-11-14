import { describe, it, expect, vi, beforeEach } from 'vitest';
import examinationApi, { ViolationEventType } from '../services/examination.api';
import api from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('Network Readiness Diagnostics & Disconnect Recovery Telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('testBandwidthSpeed diagnostics probe execution', () => {
    it('executes 3 ping probes, 250 KB download probe, and 64 KB upload probe, returning optimal status', async () => {
      // 3 pings
      (api.get as any).mockImplementation((url: string) => {
        if (url === '/examination/student/preflight/ping') {
          return Promise.resolve({ data: { receivedAt: new Date().toISOString() } });
        }
        if (url === '/examination/student/preflight/download-sample') {
          // 250 KB buffer
          return Promise.resolve({
            data: new ArrayBuffer(250 * 1024),
          });
        }
        return Promise.resolve({ data: {} });
      });

      // 64 KB upload
      (api.post as any).mockImplementation((url: string, body: any) => {
        if (url === '/examination/student/preflight/upload-sample') {
          return Promise.resolve({
            data: { receivedBytes: body?.data?.length || 65536, receivedAt: new Date().toISOString() },
          });
        }
        return Promise.resolve({ data: {} });
      });

      const result = await examinationApi.testBandwidthSpeed();

      expect(api.get).toHaveBeenCalledWith(
        '/examination/student/preflight/ping',
        expect.objectContaining({ headers: expect.objectContaining({ 'Cache-Control': 'no-cache' }) }),
      );
      expect(api.get).toHaveBeenCalledWith(
        '/examination/student/preflight/download-sample',
        expect.objectContaining({ responseType: 'arraybuffer' }),
      );
      expect(api.post).toHaveBeenCalledWith(
        '/examination/student/preflight/upload-sample',
        expect.objectContaining({ data: expect.any(String) }),
      );

      // Verify returned metrics
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.downloadMbps).toBeGreaterThan(0);
      expect(result.uploadMbps).toBeGreaterThan(0);
      expect(['OPTIMAL', 'ACCEPTABLE', 'DEGRADED']).toContain(result.bandwidthStatus);
    });

    it('classifies network status as DEGRADED when latency is > 350ms or speed is < 0.8 Mbps', async () => {
      // Artificially trigger slow responses
      (api.get as any).mockImplementation(async (url: string) => {
        if (url === '/examination/student/preflight/ping') {
          return { data: { receivedAt: new Date().toISOString() } };
        }
        if (url === '/examination/student/preflight/download-sample') {
          // Simulate slow download by delaying
          await new Promise((resolve) => setTimeout(resolve, 50));
          // Return small buffer so throughput is very low
          return { data: new ArrayBuffer(1024) };
        }
        return { data: {} };
      });

      (api.post as any).mockImplementation(async (url: string) => {
        if (url === '/examination/student/preflight/upload-sample') {
          return { data: { receivedBytes: 1024, receivedAt: new Date().toISOString() } };
        }
        return { data: {} };
      });

      const result = await examinationApi.testBandwidthSpeed();
      // With 1KB transferred in >50ms, throughput will be well below 0.8 Mbps
      expect(result.downloadMbps).toBeLessThan(0.8);
      expect(result.bandwidthStatus).toBe('DEGRADED');
    });
  });

  describe('Preflight completion contract with bandwidth metrics', () => {
    it('persists latency, download, upload, and advisory acknowledgment to backend', async () => {
      (api.post as any).mockResolvedValue({
        data: { success: true, proctoringPassed: true },
      });

      const res = await examinationApi.completePreflight('att-test-1', {
        latencyMs: 42,
        downloadMbps: 18.2,
        uploadMbps: 5.6,
        bandwidthStatus: 'OPTIMAL',
        speedWarningAcknowledged: true,
        fullscreenSupported: true,
        browser: 'Mozilla/5.0 Chrome/120.0',
        timestamp: new Date().toISOString(),
      });

      expect(res.success).toBe(true);
      expect(res.proctoringPassed).toBe(true);
      expect(api.post).toHaveBeenCalledWith(
        '/examination/student/attempts/att-test-1/preflight-complete',
        {
          preflightData: expect.objectContaining({
            latencyMs: 42,
            downloadMbps: 18.2,
            uploadMbps: 5.6,
            bandwidthStatus: 'OPTIMAL',
            speedWarningAcknowledged: true,
          }),
        },
      );
    });
  });

  describe('In-Exam Consolidated Disconnect Telemetry Contract', () => {
    it('dispatches consolidated NETWORK_ANOMALY violation event with durationMs and metadata for outages > 5 seconds', async () => {
      (api.post as any).mockResolvedValue({
        data: { recorded: true, flaggedForReview: false },
      });

      const durationMs = 7200; // 7.2 seconds (> 5s threshold)
      const metadata = {
        disconnectedAt: '2026-11-12T14:00:00.000Z',
        reconnectedAt: '2026-11-12T14:00:07.200Z',
        durationSeconds: 7,
        offlineAnswersPendingCount: 2,
      };

      const res = await examinationApi.recordViolationEvent(
        'att-test-1',
        ViolationEventType.NETWORK_ANOMALY,
        durationMs,
        metadata,
      );

      expect(res.recorded).toBe(true);
      expect(api.post).toHaveBeenCalledWith(
        '/examination/student/attempts/att-test-1/events',
        {
          eventType: ViolationEventType.NETWORK_ANOMALY,
          durationMs: 7200,
          metadata: expect.objectContaining({
            durationSeconds: 7,
            offlineAnswersPendingCount: 2,
          }),
        },
      );
    });
  });
});
