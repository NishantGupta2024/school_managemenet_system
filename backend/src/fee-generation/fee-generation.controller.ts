import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { FeeGenerationService } from './fee-generation.service';
import { PreviewFeeGenerationDto } from './dto/preview-fee-generation.dto';
import { ExecuteFeeGenerationDto } from './dto/execute-fee-generation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('fee-generation')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class FeeGenerationController {
  constructor(private readonly feeGenerationService: FeeGenerationService) {}

  @Post('preview')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async preview(@Request() req: any, @Body() dto: PreviewFeeGenerationDto) {
    const schoolId = req.school.id;
    return this.feeGenerationService.preview(schoolId, dto);
  }

  @Post('execute')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async execute(@Request() req: any, @Body() dto: ExecuteFeeGenerationDto) {
    const schoolId = req.school.id;
    const currentUserId = req.user.id;
    return this.feeGenerationService.execute(schoolId, currentUserId, dto);
  }

  @Get('runs')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async getRuns(@Request() req: any, @Query('academicYearId') academicYearId?: string) {
    const schoolId = req.school.id;
    return this.feeGenerationService.getGenerationRuns(schoolId, academicYearId);
  }
}
