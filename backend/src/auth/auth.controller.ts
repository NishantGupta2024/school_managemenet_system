import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Ip,
  Headers,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } }) // Stricter brute-force limit: max 10 login attempts per min
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.login(loginDto, { ipAddress: ip, userAgent });
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.refresh(dto, { ipAddress: ip, userAgent });
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Request() req: any,
    @Body() body?: RefreshTokenDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.logout(req.user, body, { ipAddress: ip, userAgent });
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Request() req: any,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.logoutAll(req.user, { ipAddress: ip, userAgent });
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Limit password reset requests to 5 per min
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.forgotPassword(dto, { ipAddress: ip, userAgent });
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Limit password reset attempts to 5 per min
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.resetPassword(dto, { ipAddress: ip, userAgent });
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Request() req: any,
    @Body() dto: ChangePasswordDto,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.changePassword(
      req.user,
      dto,
      { ipAddress: ip, userAgent },
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req: any) {
    return req.user;
  }
}
