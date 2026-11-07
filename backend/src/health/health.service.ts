import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  checkLiveness(): HealthCheckResult {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }

  async checkHealth(): Promise<HealthCheckResult> {
    let isHealthy = false;

    try {
      await this.prisma.ping();
      isHealthy = true;
    } catch (err: unknown) {
      const dbError = err instanceof Error ? err.message : String(err);
      this.logger.error('Database health check failed:', dbError);
    }

    return {
      status: isHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }
}
