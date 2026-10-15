import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  environment: string;
  database: {
    status: 'connected' | 'disconnected';
    latencyMs?: number;
    tenantCount?: number;
    userCount?: number;
    studentCount?: number;
    error?: string;
  };
  tenantContext: {
    activeSchoolId: string;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async checkHealth(): Promise<HealthCheckResult> {
    const activeSchoolId = this.tenantContext.getSchoolId() || 'none';
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';
    let latencyMs: number | undefined;
    let tenantCount: number | undefined;
    let userCount: number | undefined;
    let studentCount: number | undefined;
    let dbError: string | undefined;

    try {
      latencyMs = await this.prisma.ping();
      tenantCount = await this.prisma.school.count();
      userCount = await this.prisma.user.count();
      studentCount = await this.prisma.student.count();
      dbStatus = 'connected';
    } catch (err: unknown) {
      dbStatus = 'disconnected';
      dbError = err instanceof Error ? err.message : String(err);
      this.logger.error('Database health check failed:', dbError);
    }

    return {
      status: dbStatus === 'connected' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        status: dbStatus,
        latencyMs,
        tenantCount,
        userCount,
        studentCount,
        error: dbError,
      },
      tenantContext: {
        activeSchoolId,
      },
    };
  }
}
