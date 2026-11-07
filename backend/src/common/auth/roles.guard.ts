import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const user = request?.user;
    if (!user || !user.role) {
      throw new ForbiddenException('Access denied: Authentication required for this resource');
    }

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Strict explicit RBAC evaluation: every allowed role (including PLATFORM_SUPER_ADMIN)
    // must be explicitly declared in the @Roles(...) metadata on the handler or controller.
    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(`Access denied: Requires one of [${requiredRoles.join(', ')}] role`);
    }

    return true;
  }
}
