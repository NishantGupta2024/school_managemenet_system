import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { SchoolPaymentGatewayConfigService } from './school-payment-gateway-config.service';
import {
  ConfigurePaymentGatewayDto,
  PaymentGatewayConfigResponseDto,
  VerifyGatewayResultDto,
} from './dto/payment-gateway-config.dto';

@Controller('payment-gateway')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
export class SchoolPaymentGatewayConfigController {
  constructor(
    private readonly gatewayConfigService: SchoolPaymentGatewayConfigService,
  ) {}

  /**
   * Retrieves the current school's payment gateway configuration status.
   * School tenant is strictly derived from server-validated request context.
   */
  @Get('config')
  async getConfig(
    @Request() req: any,
  ): Promise<PaymentGatewayConfigResponseDto | null> {
    const schoolId = req.school.id;
    return this.gatewayConfigService.getConfig(schoolId);
  }

  /**
   * Creates or updates the school's payment gateway configuration.
   * Re-encrypts secrets using AES-256-GCM.
   */
  @Put('config')
  @HttpCode(HttpStatus.OK)
  async configure(
    @Request() req: any,
    @Body() dto: ConfigurePaymentGatewayDto,
  ): Promise<PaymentGatewayConfigResponseDto> {
    const schoolId = req.school.id;
    const user = req.user;
    return this.gatewayConfigService.configure(schoolId, user, dto);
  }

  /**
   * Safely verifies the Razorpay TEST credentials by querying provider API.
   * Promotes gateway status to ACTIVE if valid.
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Request() req: any): Promise<VerifyGatewayResultDto> {
    const schoolId = req.school.id;
    const user = req.user;
    return this.gatewayConfigService.verify(schoolId, user);
  }

  /**
   * Disables / disconnects the payment gateway for the current school.
   */
  @Delete('config')
  @HttpCode(HttpStatus.OK)
  async disconnect(
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    const schoolId = req.school.id;
    const user = req.user;
    return this.gatewayConfigService.disconnect(schoolId, user);
  }
}
