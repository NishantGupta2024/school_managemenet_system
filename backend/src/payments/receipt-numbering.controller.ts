import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { ReceiptNumberingService } from './receipt-numbering.service';
import { UpdateReceiptNumberConfigDto } from './dto/update-receipt-number-config.dto';
import { ReceiptNumberConfigResponseDto } from './dto/receipt-number-config-response.dto';
import { PreviewReceiptNumberDto } from './dto/preview-receipt-number.dto';

@Controller('receipt-numbering')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
export class ReceiptNumberingController {
  constructor(private readonly receiptNumberingService: ReceiptNumberingService) {}

  /**
   * Retrieves active receipt numbering configuration for the school.
   */
  @Get('config')
  async getConfig(
    @Request() req: any,
    @Query('schoolId') explicitSchoolId?: string,
  ): Promise<ReceiptNumberConfigResponseDto> {
    return this.receiptNumberingService.getConfig(req.user, explicitSchoolId);
  }

  /**
   * Updates or creates the custom receipt numbering configuration for the school.
   */
  @Put('config')
  @HttpCode(HttpStatus.OK)
  async updateConfig(
    @Request() req: any,
    @Body() dto: UpdateReceiptNumberConfigDto,
    @Query('schoolId') explicitSchoolId?: string,
  ): Promise<ReceiptNumberConfigResponseDto> {
    return this.receiptNumberingService.updateConfig(req.user, dto, explicitSchoolId);
  }

  /**
   * Generates a live formatted sample preview without touching database state.
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  generatePreview(@Body() dto: PreviewReceiptNumberDto): { preview: string } {
    return this.receiptNumberingService.generatePreview(dto);
  }
}
