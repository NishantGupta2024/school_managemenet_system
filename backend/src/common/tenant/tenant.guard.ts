import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly tenantContextService: TenantContextService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const schoolId = this.tenantContextService.getSchoolId();

    if (!schoolId) {
      throw new UnauthorizedException(
        'Tenant context missing: Request must specify target school identity via x-school-id header or authenticated session',
      );
    }

    // Basic UUID validation pattern
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(schoolId)) {
      throw new BadRequestException('Malformed tenant ID: Must be a valid UUID');
    }

    // Verify tenant exists and is ACTIVE in database
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new ForbiddenException('Target school tenant does not exist');
    }

    if (school.status !== 'ACTIVE') {
      throw new ForbiddenException(`School tenant is currently ${school.status}`);
    }

    // Authenticated membership enforcement:
    // If request has authenticated user, ensure they belong to this school (or are PLATFORM_SUPER_ADMIN)
    const user = request.user;
    if (user) {
      if (user.role !== 'PLATFORM_SUPER_ADMIN' && user.schoolId !== schoolId) {
        throw new ForbiddenException(
          'Cross-tenant access forbidden: User membership does not match target school',
        );
      }
    }

    // Attach validated school entity to request object
    request.school = school;
    return true;
  }
}
