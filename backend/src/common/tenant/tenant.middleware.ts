import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantContextService: TenantContextService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Extract school/tenant ID from HTTP header 'x-school-id' or query or fallback to default
    const headerSchoolId = req.headers['x-school-id'] as string;
    const defaultSchoolId = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
    const schoolId = headerSchoolId || defaultSchoolId;

    // Attach to response header for telemetry and verification
    res.setHeader('x-school-id', schoolId);

    this.tenantContextService.run(
      {
        schoolId,
      },
      () => {
        next();
      },
    );
  }
}
