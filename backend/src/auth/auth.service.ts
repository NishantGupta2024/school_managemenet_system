import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password, schoolId } = loginDto;

    // Find user by email and optional schoolId
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        ...(schoolId ? { schoolId } : {}),
      },
      include: {
        school: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is inactive or disabled');
    }

    // Verify bcrypt password hash
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password credentials');
    }

    // Check school status if user is tied to a school
    if (user.schoolId && user.school && user.school.status !== 'ACTIVE') {
      throw new UnauthorizedException(`School tenant is currently ${user.school.status}`);
    }

    // Sign JWT Payload
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        schoolId: user.schoolId,
        schoolName: user.school?.name || 'Platform Admin',
      },
    };
  }

  // Helper method for generating test tokens (including expired or custom)
  generateCustomToken(
    user: { id: string; email: string; role: UserRole; schoolId: string | null },
    expiresIn: string = '1h',
  ) {
    return this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
      },
      { expiresIn: expiresIn as any },
    );
  }
}
