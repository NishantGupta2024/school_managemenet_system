import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantContextService: TenantContextService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const rawSchoolId = req.headers['x-school-id'];
    let schoolId: string | undefined;

    // Strict validation: Reject arrays, require clean non-empty string
    if (typeof rawSchoolId === 'string' && rawSchoolId.trim().length > 0) {
      schoolId = rawSchoolId.trim();
    }

    // Notice: NO default tenant fallback.
    // Unauthenticated/unspecified requests run with undefined tenant context.
    if (schoolId) {
      res.setHeader('x-school-id', schoolId);
      this.tenantContextService.run({ schoolId }, () => next());
    } else {
      this.tenantContextService.run({ schoolId: undefined as any }, () => next());
    }
  }
}
