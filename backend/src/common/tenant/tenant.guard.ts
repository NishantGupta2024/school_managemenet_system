import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Server-validated authentication is required on tenant-protected resources
    if (!user) {
      throw new UnauthorizedException(
        'Authentication required: Valid credentials must be established before tenant access',
      );
    }

    // Read client-supplied x-school-id header (hint/selector only)
    const rawHeaderSchoolId = request.headers['x-school-id'] as string;
    const headerSchoolId = rawHeaderSchoolId?.trim() || undefined;

    let targetSchoolId: string;

    if (user.role === UserRole.PLATFORM_SUPER_ADMIN) {
      // Platform Super Admin must supply x-school-id to specify target school
      if (!headerSchoolId) {
        throw new BadRequestException(
          'Tenant specification required: Platform admin must provide x-school-id header to target a specific school',
        );
      }
      targetSchoolId = headerSchoolId;
    } else {
      // Normal School Staff / Student / Parent:
      // School identity is strictly derived from user's trusted server-validated membership
      if (!user.schoolId) {
        throw new ForbiddenException('User is not associated with any active school');
      }

      // If client supplied a header, it must strictly match their membership
      if (headerSchoolId && headerSchoolId !== user.schoolId) {
        throw new ForbiddenException(
          'Cross-tenant access forbidden: User membership does not match requested school',
        );
      }

      targetSchoolId = user.schoolId;
    }

    // Basic UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetSchoolId)) {
      throw new BadRequestException('Malformed tenant ID: Must be a valid UUID');
    }

    // Verify tenant exists and is ACTIVE in database
    const school = await this.prisma.school.findUnique({
      where: { id: targetSchoolId },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
      },
    });

    if (!school) {
      throw new ForbiddenException('Target school tenant does not exist');
    }

    if (school.status !== 'ACTIVE') {
      throw new ForbiddenException(`School tenant is currently ${school.status}`);
    }

    // Attach validated school entity to request object
    request.school = school;

    return true;
  }
}
