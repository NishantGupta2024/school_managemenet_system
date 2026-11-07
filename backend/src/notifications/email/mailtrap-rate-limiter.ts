import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { EmailErrorCategory } from './email.types';
import { EmailProviderException } from './memory-email.provider';
import { RedisRateLimiterClient } from './redis-rate-limiter.client';

export class RateLimiterUnavailableException extends EmailProviderException {
  constructor(message: string, originalError?: any) {
    super({
      category: EmailErrorCategory.TRANSIENT,
      code: 'RATE_LIMITER_UNAVAILABLE',
      message: `Distributed rate limiter is unavailable: ${message}. Pausing dispatch to prevent provider rate limit violations.`,
      isRetryable: true,
      originalErrorName: originalError?.name || 'RateLimiterUnavailableException',
    });
    this.name = 'RateLimiterUnavailableException';
  }
}

export interface EmailRateLimiter {
  /**
   * Acquires a transmission slot, waiting if necessary to honor the rate limit.
   * Returns the elapsed wait time in milliseconds.
   * Throws RateLimiterUnavailableException if distributed coordination fails.
   */
  acquireSlot(): Promise<number>;
  
  /**
   * Resets or releases limiter state (primarily for test cleanup).
   */
  reset(): Promise<void>;

  /**
   * Current configured rate limit (max dispatches per window).
   */
  readonly maxPerSecond: number;

  /**
   * Whether the limiter is explicitly running in distributed mode (Redis-backed).
   */
  readonly isDistributed: boolean;
}

export interface RateLimiterOptions {
  maxPerSecond?: number;
  minIntervalMs?: number;
  redisClient?: any;
  redisKeyPrefix?: string;
  clock?: () => number;
  /**
   * Explicit mode:
   * 'distributed': Requires Redis. If Redis is unavailable, FAILS CLOSED (never silently falls back to in-memory).
   * 'in-memory': Explicit single-process mode. Does not require Redis.
   * 'auto': If redisClient is supplied or configured, acts as 'distributed'; else 'in-memory'.
   */
  mode?: 'distributed' | 'in-memory' | 'auto';
}

/**
 * Mailtrap Free Plan Email Rate Limiter
 *
 * Implements strict, fail-safe rate limiting:
 * 1. Distributed Mode (Redis-backed):
 *    - Uses atomic Redis Lua script to schedule transmission slots across cluster workers.
 *    - FAIL-CLOSED INVARIANT: If Redis is configured and becomes unavailable, it NEVER silently
 *      downgrades to in-memory pacing. Doing so would cause multiple concurrent workers to burst
 *      and trigger Mailtrap 550 rate limit blocks. Instead, it throws RateLimiterUnavailableException,
 *      allowing the outbox worker to delay the batch or reschedule via standard retry.
 * 2. In-Memory Mode (Single-Worker Explicit Deployment):
 *    - Chains an asynchronous promise queue for strictly serialized single-node deployments.
 * 3. Non-Blocking Execution:
 *    - All pacing occurs strictly OUTSIDE database transactions.
 *    - Zero PostgreSQL connection locks or row locks are held during sleep delays.
 */
@Injectable()
export class MailtrapRateLimiter implements EmailRateLimiter, OnModuleDestroy {
  private readonly logger = new Logger(MailtrapRateLimiter.name);
  public readonly maxPerSecond: number;
  public readonly minIntervalMs: number;
  public readonly isDistributed: boolean;
  private readonly redisClient: any | null;
  private readonly ownsRedisClient: boolean = false;
  private readonly redisKey: string;
  private readonly clock: () => number;

  // In-Memory state for local queueing (used ONLY in explicit in-memory mode)
  private lastSlotTimestamp = 0;
  private localMutexChain: Promise<number> = Promise.resolve(0);

  constructor(@Optional() options?: RateLimiterOptions) {
    const envMax = parseInt(process.env.EMAIL_RATE_LIMIT_PER_SECOND || '1', 10);
    this.maxPerSecond = options?.maxPerSecond ?? (isNaN(envMax) || envMax <= 0 ? 1 : envMax);
    this.minIntervalMs = options?.minIntervalMs ?? Math.ceil(1000 / this.maxPerSecond);

    const hasExplicitRedisOption = Boolean(
      options && Object.prototype.hasOwnProperty.call(options, 'redisClient'),
    );

    // Determine distributed vs in-memory mode
    if (options?.mode === 'distributed') {
      this.isDistributed = true;
    } else if (options?.mode === 'in-memory') {
      this.isDistributed = false;
    } else {
      // 'auto'
      this.isDistributed = Boolean(options?.redisClient || process.env.REDIS_URL);
    }

    if (hasExplicitRedisOption) {
      this.redisClient = options?.redisClient ?? null;
    } else if (this.isDistributed && process.env.REDIS_URL) {
      this.redisClient = new RedisRateLimiterClient(process.env.REDIS_URL);
      this.ownsRedisClient = true;
    } else {
      this.redisClient = null;
    }

    this.redisKey = `${options?.redisKeyPrefix || 'schoolfee:ratelimit:email'}`;
    this.clock = options?.clock || (() => Date.now());

    if (this.isDistributed) {
      this.logger.log(`MailtrapRateLimiter initialized in DISTRIBUTED mode (Max: ${this.maxPerSecond}/sec, Interval: ${this.minIntervalMs}ms)`);
    } else {
      this.logger.log(`MailtrapRateLimiter initialized in IN-MEMORY mode (Single-worker deployment only. Max: ${this.maxPerSecond}/sec)`);
    }
  }

  /**
   * Verifies connectivity of the backing rate limiter store.
   */
  async checkHealth(): Promise<{ status: 'ok' | 'error'; mode: 'distributed' | 'in-memory'; error?: string }> {
    if (!this.isDistributed) {
      return { status: 'ok', mode: 'in-memory' };
    }
    if (!this.redisClient || typeof this.redisClient.ping !== 'function') {
      return {
        status: 'error',
        mode: 'distributed',
        error: 'Redis client is not configured or missing ping capability.',
      };
    }
    try {
      const pong = await this.redisClient.ping();
      return pong === 'PONG'
        ? { status: 'ok', mode: 'distributed' }
        : { status: 'error', mode: 'distributed', error: `Unexpected Redis PING response: ${pong}` };
    } catch (err: any) {
      return {
        status: 'error',
        mode: 'distributed',
        error: err?.message || 'Redis PING failed',
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.ownsRedisClient && this.redisClient && typeof this.redisClient.quit === 'function') {
      await this.redisClient.quit();
    }
  }

  /**
   * Acquires a dispatch slot.
   * In distributed mode, verifies Redis availability and reserves atomic slot.
   * If Redis fails, throws RateLimiterUnavailableException (fail-closed).
   */
  async acquireSlot(): Promise<number> {
    if (this.isDistributed) {
      if (!this.redisClient || typeof this.redisClient.eval !== 'function') {
        const errorMsg = 'Redis client is not configured or connected in distributed rate limiting mode.';
        this.logger.error(`[FAIL-CLOSED] ${errorMsg}`);
        throw new RateLimiterUnavailableException(errorMsg);
      }

      try {
        return await this.acquireSlotViaRedis();
      } catch (err: any) {
        if (err instanceof RateLimiterUnavailableException) {
          throw err;
        }
        const errorMsg = `Redis cluster communication failed: ${err.message}`;
        this.logger.error(`[FAIL-CLOSED] ${errorMsg}. Halting dispatch slot to protect provider rate limits.`);
        throw new RateLimiterUnavailableException(errorMsg, err);
      }
    }

    // In-memory mode (explicit single-worker only)
    return await this.acquireSlotViaMemory();
  }

  /**
   * Redis-backed distributed atomic slot reservation.
   * Atomically computes the next available timestamp across all cluster workers.
   */
  private async acquireSlotViaRedis(): Promise<number> {
    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local interval = tonumber(ARGV[2])
      
      local last = redis.call('GET', key)
      local scheduled = now
      
      if last then
        last = tonumber(last)
        if last > now then
          scheduled = last + interval
        else
          scheduled = now + interval
        end
      else
        scheduled = now + interval
      end
      
      redis.call('SET', key, scheduled, 'PX', 60000)
      return scheduled
    `;

    const now = this.clock();
    const scheduledTime = await this.redisClient.eval(
      luaScript,
      1,
      this.redisKey,
      now.toString(),
      this.minIntervalMs.toString(),
    );

    const waitMs = Math.max(0, Number(scheduledTime) - now - this.minIntervalMs);
    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
    return waitMs;
  }

  /**
   * In-memory serial queue pacing fallback.
   * Chains a promise queue so that calls wait sequentially with at least minIntervalMs separation.
   */
  private acquireSlotViaMemory(): Promise<number> {
    this.localMutexChain = this.localMutexChain.then(async () => {
      const now = this.clock();
      const targetTime = Math.max(now, this.lastSlotTimestamp + this.minIntervalMs);
      const waitMs = Math.max(0, targetTime - now);
      
      this.lastSlotTimestamp = targetTime;

      if (waitMs > 0) {
        await this.sleep(waitMs);
      }
      return waitMs;
    });

    return this.localMutexChain;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async reset(): Promise<void> {
    this.lastSlotTimestamp = 0;
    this.localMutexChain = Promise.resolve(0);
    if (this.redisClient && typeof this.redisClient.del === 'function') {
      try {
        await this.redisClient.del(this.redisKey);
      } catch {
        // Ignored in reset
      }
    }
  }
}
