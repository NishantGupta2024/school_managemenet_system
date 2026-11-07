import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as net from 'net';
import * as tls from 'tls';

export interface ParsedRedisConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls: boolean;
  connectTimeoutMs: number;
  commandTimeoutMs: number;
}

interface PendingCommand {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Lightweight, zero-dependency RESP2 Redis Client for atomic distributed rate limiting.
 * Supports:
 * - redis:// and rediss:// (TLS) URLs
 * - AUTH (password or ACL username + password)
 * - SELECT <db>
 * - EVAL, DEL, PING, QUIT
 * - Serialized command queue with strict timeouts
 * - Automatic reconnection on transient socket drops
 * - Graceful shutdown via NestJS OnModuleDestroy
 */
@Injectable()
export class RedisRateLimiterClient implements OnModuleDestroy {
  private readonly logger = new Logger(RedisRateLimiterClient.name);
  public readonly config: ParsedRedisConfig | null;
  private socket: net.Socket | tls.TLSSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private isReady = false;
  private isClosing = false;
  private buffer: Buffer = Buffer.alloc(0);
  private readonly pendingQueue: PendingCommand[] = [];
  private commandMutex: Promise<any> = Promise.resolve();

  constructor(
    redisUrl: string | undefined = process.env.REDIS_URL,
    options?: { connectTimeoutMs?: number; commandTimeoutMs?: number },
  ) {
    this.config = redisUrl
      ? RedisRateLimiterClient.parseRedisUrl(redisUrl, options)
      : null;
  }

  public static parseRedisUrl(
    rawUrl: string,
    options?: { connectTimeoutMs?: number; commandTimeoutMs?: number },
  ): ParsedRedisConfig {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch (err: any) {
      throw new Error(`Invalid REDIS_URL format: ${err?.message || rawUrl}`);
    }

    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
      throw new Error(
        `Unsupported REDIS_URL protocol '${parsed.protocol}'. Expected 'redis:' or 'rediss:'.`,
      );
    }

    const host = parsed.hostname || '127.0.0.1';
    const port = parsed.port ? parseInt(parsed.port, 10) : 6379;
    if (isNaN(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid Redis port in REDIS_URL: '${parsed.port}'`);
    }

    const username = parsed.username
      ? decodeURIComponent(parsed.username)
      : undefined;
    const password = parsed.password
      ? decodeURIComponent(parsed.password)
      : undefined;

    let db = 0;
    if (parsed.pathname && parsed.pathname.length > 1) {
      const dbSegment = parsed.pathname.slice(1).split('/')[0];
      if (dbSegment) {
        const parsedDb = parseInt(dbSegment, 10);
        if (!isNaN(parsedDb) && parsedDb >= 0) {
          db = parsedDb;
        }
      }
    }

    return {
      host,
      port,
      username,
      password,
      db,
      tls: parsed.protocol === 'rediss:',
      connectTimeoutMs: options?.connectTimeoutMs ?? 3000,
      commandTimeoutMs: options?.commandTimeoutMs ?? 3000,
    };
  }

  public isConfigured(): boolean {
    return this.config !== null;
  }

  public isConnected(): boolean {
    return Boolean(this.socket && !this.socket.destroyed && this.isReady);
  }

  /**
   * Executes a Redis Lua script atomically: EVAL script numkeys key [key ...] arg [arg ...]
   */
  public async eval(
    script: string,
    numKeys: number,
    ...keysAndArgs: string[]
  ): Promise<any> {
    return this.sendCommand([
      'EVAL',
      script,
      String(numKeys),
      ...keysAndArgs.map(String),
    ]);
  }

  /**
   * Deletes one or more Redis keys: DEL key [key ...]
   */
  public async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    const res = await this.sendCommand(['DEL', ...keys]);
    return Number(res) || 0;
  }

  /**
   * Health check ping: PING -> PONG
   */
  public async ping(): Promise<string> {
    const res = await this.sendCommand(['PING']);
    return String(res);
  }

  /**
   * Gracefully closes the Redis connection.
   */
  public async quit(): Promise<void> {
    this.isClosing = true;
    if (!this.socket || this.socket.destroyed) {
      this.cleanupSocket();
      return;
    }

    try {
      await this.dispatchRawCommand(['QUIT'], 1000);
    } catch {
      // Ignore errors during shutdown
    } finally {
      this.cleanupSocket();
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await this.quit();
  }

  /**
   * Serializes command execution over the connection and handles lazy connect / reconnect.
   */
  public sendCommand(args: string[]): Promise<any> {
    if (!this.config) {
      return Promise.reject(
        new Error('Redis client is not configured (REDIS_URL is missing).'),
      );
    }
    if (this.isClosing) {
      return Promise.reject(new Error('Redis client is shutting down.'));
    }

    const run = async () => {
      await this.ensureConnected();
      return this.dispatchRawCommand(args, this.config!.commandTimeoutMs);
    };

    const next = this.commandMutex.then(run, run);
    // Keep mutex chain alive regardless of individual command rejection
    this.commandMutex = next.catch(() => undefined);
    return next;
  }

  private async ensureConnected(): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.establishConnection();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async establishConnection(): Promise<void> {
    if (!this.config) {
      throw new Error('Redis configuration is missing.');
    }

    this.cleanupSocket();
    const { host, port, tls: useTls, connectTimeoutMs, username, password, db } =
      this.config;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.cleanupSocket(new Error(`Redis connection timed out after ${connectTimeoutMs}ms`));
          reject(new Error(`Redis connection timed out after ${connectTimeoutMs}ms`));
        }
      }, connectTimeoutMs);

      const onConnect = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };

      const onError = (err: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.cleanupSocket(err);
          reject(err);
        } else {
          this.cleanupSocket(err);
        }
      };

      const sock = useTls
        ? tls.connect({ host, port, servername: host }, onConnect)
        : net.createConnection({ host, port }, onConnect);

      sock.on('data', (chunk: Buffer) => this.onSocketData(chunk));
      sock.on('error', onError);
      sock.on('close', () => {
        this.isReady = false;
        this.rejectAllPending(new Error('Redis connection closed unexpectedly.'));
      });

      this.socket = sock;
    });

    // Perform AUTH if credentials are provided
    if (password) {
      const authArgs =
        username && username !== 'default'
          ? ['AUTH', username, password]
          : ['AUTH', password];
      await this.dispatchRawCommand(authArgs, connectTimeoutMs);
    }

    // Perform SELECT if non-zero DB index is configured
    if (db > 0) {
      await this.dispatchRawCommand(['SELECT', String(db)], connectTimeoutMs);
    }

    this.isReady = true;
  }

  private dispatchRawCommand(args: string[], timeoutMs: number): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        return reject(new Error('Redis socket is not connected.'));
      }

      const timer = setTimeout(() => {
        const idx = this.pendingQueue.findIndex((p) => p.timer === timer);
        if (idx !== -1) {
          this.pendingQueue.splice(idx, 1);
        }
        const timeoutErr = new Error(
          `Redis command '${args[0]}' timed out after ${timeoutMs}ms`,
        );
        this.cleanupSocket(timeoutErr);
        reject(timeoutErr);
      }, timeoutMs);

      this.pendingQueue.push({ resolve, reject, timer });

      const payload = RedisRateLimiterClient.encodeRespCommand(args);
      this.socket.write(payload, (err) => {
        if (err) {
          clearTimeout(timer);
          const idx = this.pendingQueue.findIndex((p) => p.timer === timer);
          if (idx !== -1) {
            this.pendingQueue.splice(idx, 1);
          }
          this.cleanupSocket(err);
          reject(err);
        }
      });
    });
  }

  /**
   * Encodes an array of strings into a RESP2 Bulk String Array.
   */
  public static encodeRespCommand(args: string[]): Buffer {
    const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`, 'utf8')];
    for (const arg of args) {
      const argBuf = Buffer.from(String(arg), 'utf8');
      parts.push(Buffer.from(`$${argBuf.length}\r\n`, 'utf8'));
      parts.push(argBuf);
      parts.push(Buffer.from('\r\n', 'utf8'));
    }
    return Buffer.concat(parts);
  }

  private onSocketData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length > 0 && this.pendingQueue.length > 0) {
      const parsed = RedisRateLimiterClient.tryParseRespFrame(this.buffer, 0);
      if (!parsed) {
        break; // Wait for more bytes
      }

      this.buffer = this.buffer.subarray(parsed.nextOffset);
      const current = this.pendingQueue.shift()!;
      clearTimeout(current.timer);

      if (parsed.isError) {
        current.reject(new Error(String(parsed.value)));
      } else {
        current.resolve(parsed.value);
      }
    }
  }

  /**
   * Parses a single RESP2 frame starting at `offset`.
   * Returns `null` if the buffer does not yet contain a complete frame.
   */
  public static tryParseRespFrame(
    buf: Buffer,
    offset: number,
  ): { value: any; isError: boolean; nextOffset: number } | null {
    if (offset >= buf.length) return null;

    const prefix = String.fromCharCode(buf[offset]);
    const lineEnd = buf.indexOf('\r\n', offset + 1);
    if (lineEnd === -1) return null;

    const headerPayload = buf.subarray(offset + 1, lineEnd).toString('utf8');
    const afterLine = lineEnd + 2;

    switch (prefix) {
      case '+': // Simple String
        return { value: headerPayload, isError: false, nextOffset: afterLine };

      case '-': // Error
        return { value: headerPayload, isError: true, nextOffset: afterLine };

      case ':': // Integer
        return {
          value: parseInt(headerPayload, 10),
          isError: false,
          nextOffset: afterLine,
        };

      case '$': {
        // Bulk String
        const byteLength = parseInt(headerPayload, 10);
        if (byteLength === -1) {
          return { value: null, isError: false, nextOffset: afterLine };
        }
        const totalEnd = afterLine + byteLength + 2;
        if (buf.length < totalEnd) {
          return null; // Incomplete bulk string
        }
        const strValue = buf
          .subarray(afterLine, afterLine + byteLength)
          .toString('utf8');
        return { value: strValue, isError: false, nextOffset: totalEnd };
      }

      case '*': {
        // Array
        const count = parseInt(headerPayload, 10);
        if (count === -1) {
          return { value: null, isError: false, nextOffset: afterLine };
        }
        const items: any[] = [];
        let cursor = afterLine;
        for (let i = 0; i < count; i++) {
          const elem = RedisRateLimiterClient.tryParseRespFrame(buf, cursor);
          if (!elem) return null;
          if (elem.isError) {
            return {
              value: elem.value,
              isError: true,
              nextOffset: elem.nextOffset,
            };
          }
          items.push(elem.value);
          cursor = elem.nextOffset;
        }
        return { value: items, isError: false, nextOffset: cursor };
      }

      default:
        return {
          value: `Protocol error: unexpected RESP byte '${prefix}'`,
          isError: true,
          nextOffset: afterLine,
        };
    }
  }

  private rejectAllPending(err: Error): void {
    while (this.pendingQueue.length > 0) {
      const pending = this.pendingQueue.shift()!;
      clearTimeout(pending.timer);
      pending.reject(err);
    }
  }

  private cleanupSocket(err?: Error): void {
    this.isReady = false;
    if (err) {
      this.rejectAllPending(err);
    }
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.destroy();
      } catch {
        // Ignore cleanup errors
      }
      this.socket = null;
    }
    this.buffer = Buffer.alloc(0);
  }
}
