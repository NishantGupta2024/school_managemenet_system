import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { resolveJwtSecret } from '../jwt-secret.util';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  schoolId: string | null;
  sessionId?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid token payload: missing identity claims');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is inactive or suspended');
    }

    // Verify session validity when sessionId is present in payload
    if (payload.sessionId) {
      const session = await this.prisma.userSession.findUnique({
        where: { id: payload.sessionId },
      });
      if (!session || session.isRevoked || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Session has been revoked or expired. Please sign in again.');
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      schoolId: user.schoolId,
      sessionId: payload.sessionId,
    };
  }
}
