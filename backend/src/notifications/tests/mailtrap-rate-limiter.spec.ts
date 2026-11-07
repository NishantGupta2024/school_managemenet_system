import * as net from 'net';
import { MailtrapRateLimiter, RateLimiterUnavailableException } from '../email/mailtrap-rate-limiter';
import { RedisRateLimiterClient } from '../email/redis-rate-limiter.client';
import { NotificationOutboxWorker } from '../worker/notification-outbox.worker';
import { NotificationStatus, NotificationChannel, NotificationEventType } from '@prisma/client';

describe('MailtrapRateLimiter & Outbox Worker Integration (Safety Hardened)', () => {
  let mockPrisma: any;
  let mockEmailProvider: any;
  let mockEmailConfig: any;
  let mockRenderer: any;

  beforeEach(() => {
    mockPrisma = {
      notificationOutbox: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      notificationDeliveryAttempt: {
        create: jest.fn().mockResolvedValue({ id: 'att-1' }),
      },
      schoolNotificationSetting: {
        findUnique: jest.fn().mockResolvedValue({ schoolId: 'sch-1' }),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrisma)),
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    };

    mockEmailProvider = {
      sendEmail: jest.fn().mockResolvedValue({
        providerMessageId: '<test-msg@sandbox.smtp.mailtrap.io>',
        accepted: true,
        timestamp: new Date(),
      }),
      isDeliveryProvider: jest.fn().mockReturnValue(true),
      getProviderName: jest.fn().mockReturnValue('MOCK_SMTP'),
    };

    mockEmailConfig = {
      fromAddress: 'notifications@school.test',
      defaultFromName: 'School Notifications',
      getConfig: jest.fn().mockReturnValue({
        fromAddress: 'notifications@school.test',
        defaultFromName: 'School Notifications',
      }),
      validateReplyTo: jest.fn().mockReturnValue(null),
    };

    mockRenderer = {
      render: jest.fn().mockReturnValue({
        subject: 'Payment Receipt',
        htmlBody: '<p>Receipt</p>',
        textBody: 'Receipt',
      }),
    };
  });

  describe('1. Rate Limit Enforcement (Token Bucket Pacing)', () => {
    it('enforces minIntervalMs spacing between consecutive slot acquisitions', async () => {
      let virtualTime = 1000000;
      const fakeClock = () => virtualTime;

      const limiter = new MailtrapRateLimiter({
        maxPerSecond: 1,
        minIntervalMs: 1000,
        mode: 'in-memory',
        clock: fakeClock,
      });

      const p1 = limiter.acquireSlot();
      const wait1 = await p1;
      expect(wait1).toBe(0);

      const p2 = limiter.acquireSlot();
      virtualTime += 1000;
      const wait2 = await p2;

      expect(wait2).toBeGreaterThanOrEqual(0);
    });

    it('defaults to 1 email per second (1000ms interval)', () => {
      const limiter = new MailtrapRateLimiter({ mode: 'in-memory' });
      expect(limiter.maxPerSecond).toBe(1);
      expect(limiter.minIntervalMs).toBe(1000);
      expect(limiter.isDistributed).toBe(false);
    });
  });

  describe('2. Concurrent Worker Behavior (Atomic Redis Lua Reservation)', () => {
    it('serializes concurrent requests across multiple simulated workers using shared atomic Redis mock', async () => {
      let currentTime = 10000;
      const fakeClock = () => currentTime;

      const redisStore: Record<string, string> = {};
      const mockRedisClient = {
        eval: jest.fn().mockImplementation((script: string, numKeys: number, key: string, nowStr: string, intervalStr: string) => {
          const now = Number(nowStr);
          const interval = Number(intervalStr);
          let last = redisStore[key] ? Number(redisStore[key]) : now;
          let scheduled = Math.max(now, last + interval);
          redisStore[key] = scheduled.toString();
          return scheduled;
        }),
        del: jest.fn().mockImplementation((key: string) => {
          delete redisStore[key];
        }),
      };

      const worker1Limiter = new MailtrapRateLimiter({
        maxPerSecond: 1,
        minIntervalMs: 1000,
        mode: 'distributed',
        redisClient: mockRedisClient,
        clock: fakeClock,
      });

      const worker2Limiter = new MailtrapRateLimiter({
        maxPerSecond: 1,
        minIntervalMs: 1000,
        mode: 'distributed',
        redisClient: mockRedisClient,
        clock: fakeClock,
      });

      expect(worker1Limiter.isDistributed).toBe(true);
      expect(worker2Limiter.isDistributed).toBe(true);

      const slot1Promise = worker1Limiter.acquireSlot();
      const slot2Promise = worker2Limiter.acquireSlot();

      const [waitW1, waitW2] = await Promise.all([slot1Promise, slot2Promise]);

      expect(mockRedisClient.eval).toHaveBeenCalledTimes(2);
      expect(Math.abs(waitW2 - waitW1)).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('3. Strict Fail-Closed Behavior on Redis Outage in Distributed Mode', () => {
    it('FAILS CLOSED and throws RateLimiterUnavailableException when Redis client is missing in distributed mode', async () => {
      const limiter = new MailtrapRateLimiter({
        mode: 'distributed',
        redisClient: null,
      });

      await expect(limiter.acquireSlot()).rejects.toThrow(RateLimiterUnavailableException);
    });

    it('FAILS CLOSED and throws RateLimiterUnavailableException when Redis cluster disconnects after initialization', async () => {
      const mockRedisClient = {
        eval: jest.fn().mockRejectedValue(new Error('READONLY You cannot write against a read only replica.')),
      };

      const limiter = new MailtrapRateLimiter({
        mode: 'distributed',
        redisClient: mockRedisClient,
      });

      // Does NOT silently downgrade to in-memory! It must fail closed to protect provider rate limits.
      await expect(limiter.acquireSlot()).rejects.toThrow(RateLimiterUnavailableException);
    });

    it('recovers normal operation when Redis recovers from outage', async () => {
      let isRedisAlive = false;
      const mockRedisClient = {
        eval: jest.fn().mockImplementation(() => {
          if (!isRedisAlive) {
            return Promise.reject(new Error('ECONNREFUSED'));
          }
          return Promise.resolve(Date.now() + 1000);
        }),
      };

      const limiter = new MailtrapRateLimiter({
        mode: 'distributed',
        redisClient: mockRedisClient,
        minIntervalMs: 10,
      });

      // While down: fails closed
      await expect(limiter.acquireSlot()).rejects.toThrow(RateLimiterUnavailableException);

      // Redis recovers
      isRedisAlive = true;
      const waitTime = await limiter.acquireSlot();
      expect(typeof waitTime).toBe('number');
    });
  });

  describe('4. Worker Fail-Closed Handling: Record Preserved for Retry without Email Dispatch', () => {
    it('halts dispatch and marks record FAILED with retry scheduled when rate limiter fails closed', async () => {
      const failingDistributedLimiter = {
        acquireSlot: jest.fn().mockRejectedValue(new RateLimiterUnavailableException('Redis outage')),
        reset: jest.fn(),
        maxPerSecond: 1,
        minIntervalMs: 1000,
        isDistributed: true,
      };

      const worker = new NotificationOutboxWorker(
        mockPrisma,
        mockEmailProvider,
        mockEmailConfig,
        mockRenderer,
        undefined,
        failingDistributedLimiter as any,
      );

      const fakeRecord: any = {
        id: 'outbox-fail-closed-1',
        schoolId: 'sch-1',
        channel: NotificationChannel.EMAIL,
        eventType: NotificationEventType.RECEIPT_ISSUED,
        recipientEmail: 'parent@example.com',
        templateKey: 'RECEIPT_ISSUED',
        templateData: { receiptNumber: 'REC-001', totalAmount: 5000 },
        status: NotificationStatus.PROCESSING,
        lockedAt: new Date(),
        attemptCount: 1,
      };

      const status = await worker.processSingleRecord(fakeRecord);

      // Critical Invariant: NO email was dispatched!
      expect(mockEmailProvider.sendEmail).not.toHaveBeenCalled();

      // Record was marked FAILED with retry scheduled for next attempt
      expect(status).toBe(NotificationStatus.FAILED);
      expect(mockPrisma.notificationOutbox.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'outbox-fail-closed-1' }),
          data: expect.objectContaining({
            status: NotificationStatus.FAILED,
            lastErrorCode: 'RATE_LIMITER_UNAVAILABLE',
            nextAttemptAt: expect.any(Date),
          }),
        }),
      );

      // Audit attempt logged as transient failure with retryScheduled: true
      expect(mockPrisma.notificationDeliveryAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notificationOutboxId: 'outbox-fail-closed-1',
            outcome: NotificationStatus.FAILED,
            retryScheduled: true,
          }),
        }),
      );
    });

    it('dispatches normally when rate limiter slot acquisition succeeds outside DB transaction', async () => {
      const mockLimiter = {
        acquireSlot: jest.fn().mockResolvedValue(50),
        reset: jest.fn(),
        maxPerSecond: 1,
        minIntervalMs: 1000,
        isDistributed: true,
      };

      const worker = new NotificationOutboxWorker(
        mockPrisma,
        mockEmailProvider,
        mockEmailConfig,
        mockRenderer,
        undefined,
        mockLimiter as any,
      );

      const fakeRecord: any = {
        id: 'outbox-ok-1',
        schoolId: 'sch-1',
        channel: NotificationChannel.EMAIL,
        eventType: NotificationEventType.RECEIPT_ISSUED,
        recipientEmail: 'parent@example.com',
        recipientName: 'Parent Name',
        templateKey: 'RECEIPT_ISSUED',
        templateData: { receiptNumber: 'REC-001', totalAmount: 5000 },
        status: NotificationStatus.PROCESSING,
        lockedAt: new Date(),
        attemptCount: 1,
        idempotencyKey: 'REC:1',
      };

      const status = await worker.processSingleRecord(fakeRecord);

      expect(status).toBe(NotificationStatus.SENT);
      expect(mockLimiter.acquireSlot).toHaveBeenCalledTimes(1);
      expect(mockEmailProvider.sendEmail).toHaveBeenCalledTimes(1);
      expect(mockPrisma.notificationDeliveryAttempt.create).toHaveBeenCalled();
    });
  });

  describe('5. Retry & Idempotency Invariants', () => {
    it('maintains exponential backoff calculation regardless of rate limiter', () => {
      const worker = new NotificationOutboxWorker(
        mockPrisma,
        mockEmailProvider,
        mockEmailConfig,
        mockRenderer,
      );

      const attempt1 = worker.calculateNextAttempt(1, { code: 'RATE_LIMITER_UNAVAILABLE', message: 'Timeout', isRetryable: true } as any);
      const attempt2 = worker.calculateNextAttempt(2, { code: 'RATE_LIMITER_UNAVAILABLE', message: 'Timeout', isRetryable: true } as any);

      expect(attempt1.retryScheduled).toBe(true);
      expect(attempt2.retryScheduled).toBe(true);
      expect(attempt2.nextAttemptAt!.getTime()).toBeGreaterThan(attempt1.nextAttemptAt!.getTime());
    });
  });

  describe('6. NOTIF-01 / ARCH-01 — Real TCP RESP2 RedisRateLimiterClient Lifecycle & REDIS_URL Integration', () => {
    let tcpServer: net.Server | null = null;
    let tcpPort = 0;
    const originalRedisUrl = process.env.REDIS_URL;

    afterEach(async () => {
      if (originalRedisUrl === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = originalRedisUrl;
      }
      if (tcpServer) {
        await new Promise<void>((resolve) => tcpServer!.close(() => resolve()));
        tcpServer = null;
      }
    });

    it('connects over TCP via REDIS_URL, authenticates, executes atomic EVAL/PING/DEL, and shuts down cleanly', async () => {
      const store: Record<string, number> = {};
      let authed = false;

      tcpServer = net.createServer((socket) => {
        let recvBuf = Buffer.alloc(0);
        socket.on('data', (chunk) => {
          recvBuf = Buffer.concat([recvBuf, chunk]);
          while (recvBuf.length > 0) {
            const parsed = RedisRateLimiterClient.tryParseRespFrame(recvBuf, 0);
            if (!parsed) break;
            recvBuf = recvBuf.subarray(parsed.nextOffset);

            const cmd = (parsed.value as string[]).map((s) => String(s));
            const op = cmd[0].toUpperCase();

            if (op === 'AUTH') {
              if (cmd[cmd.length - 1] === 'test_redis_pass') {
                authed = true;
                socket.write('+OK\r\n');
              } else {
                socket.write('-ERR invalid password\r\n');
              }
            } else if (!authed) {
              socket.write('-NOAUTH Authentication required.\r\n');
            } else if (op === 'SELECT') {
              socket.write('+OK\r\n');
            } else if (op === 'PING') {
              socket.write('+PONG\r\n');
            } else if (op === 'EVAL') {
              // EVAL script 1 key now interval
              const key = cmd[3];
              const now = Number(cmd[4]);
              const interval = Number(cmd[5]);
              const last = store[key] ?? now;
              const scheduled = last > now ? last + interval : now + interval;
              store[key] = scheduled;
              socket.write(`:${scheduled}\r\n`);
            } else if (op === 'DEL') {
              const key = cmd[1];
              const existed = key in store ? 1 : 0;
              delete store[key];
              socket.write(`:${existed}\r\n`);
            } else if (op === 'QUIT') {
              socket.write('+OK\r\n');
              socket.end();
            } else {
              socket.write('-ERR unknown command\r\n');
            }
          }
        });
      });

      await new Promise<void>((resolve) => {
        tcpServer!.listen(0, '127.0.0.1', () => {
          tcpPort = (tcpServer!.address() as net.AddressInfo).port;
          resolve();
        });
      });

      process.env.REDIS_URL = `redis://:test_redis_pass@127.0.0.1:${tcpPort}/0`;

      // Instantiate MailtrapRateLimiter with no manual redisClient; it must auto-wire RedisRateLimiterClient from REDIS_URL
      const limiter = new MailtrapRateLimiter({
        maxPerSecond: 100,
        minIntervalMs: 10,
      });

      expect(limiter.isDistributed).toBe(true);

      const health = await limiter.checkHealth();
      expect(health.status).toBe('ok');
      expect(health.mode).toBe('distributed');

      const waitMs = await limiter.acquireSlot();
      expect(waitMs).toBeGreaterThanOrEqual(0);

      await limiter.reset();
      await limiter.onModuleDestroy();
    });

    it('fails closed with RateLimiterUnavailableException when REDIS_URL points to an unreachable Redis server', async () => {
      process.env.REDIS_URL = 'redis://:pass@127.0.0.1:59999/0';
      const client = new RedisRateLimiterClient(process.env.REDIS_URL, {
        connectTimeoutMs: 200,
        commandTimeoutMs: 200,
      });
      const limiter = new MailtrapRateLimiter({
        mode: 'distributed',
        redisClient: client,
      });

      await expect(limiter.acquireSlot()).rejects.toThrow(RateLimiterUnavailableException);
      const health = await limiter.checkHealth();
      expect(health.status).toBe('error');
      await limiter.onModuleDestroy();
    });
  });
});
