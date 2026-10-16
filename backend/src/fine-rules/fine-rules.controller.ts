import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { FineRuleStatus, FineType, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { FineRulesService } from './fine-rules.service';
import { CreateFineRuleDto } from './dto/create-fine-rule.dto';
import {
  UpdateFineRuleDto,
  UpdateFineRuleStatusDto,
} from './dto/update-fine-rule.dto';
import { PreviewFineCalculationDto } from './dto/preview-fine-calculation.dto';

@Controller('fine-rules')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class FineRulesController {
  constructor(private readonly fineRulesService: FineRulesService) {}

  @Post()
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async create(@Request() req: any, @Body() dto: CreateFineRuleDto) {
    const schoolId = req.school.id;
    const userId = req.user.id;
    return this.fineRulesService.create(schoolId, userId, dto);
  }

  @Get()
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async findAll(
    @Request() req: any,
    @Query('academicYearId') academicYearId?: string,
    @Query('status') status?: FineRuleStatus,
    @Query('fineType') fineType?: FineType,
  ) {
    const schoolId = req.school.id;
    return this.fineRulesService.findAll(schoolId, {
      academicYearId,
      status,
      fineType,
    });
  }

  @Get('invoices')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async listInvoicesForPreview(
    @Request() req: any,
    @Query('academicYearId') academicYearId?: string,
  ) {
    const schoolId = req.school.id;
    return this.fineRulesService.listInvoicesForPreview(
      schoolId,
      academicYearId,
    );
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async previewFineCalculation(
    @Request() req: any,
    @Body() dto: PreviewFineCalculationDto,
  ) {
    const schoolId = req.school.id;
    return this.fineRulesService.previewForInvoice(schoolId, dto);
  }

  @Get(':id')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async findOne(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.fineRulesService.findOne(schoolId, id);
  }

  @Patch(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateFineRuleDto,
  ) {
    const schoolId = req.school.id;
    const userId = req.user.id;
    return this.fineRulesService.update(schoolId, id, userId, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async updateStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateFineRuleStatusDto,
  ) {
    const schoolId = req.school.id;
    const userId = req.user.id;
    return this.fineRulesService.updateStatus(
      schoolId,
      id,
      userId,
      dto.status,
    );
  }

  @Delete(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async remove(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.fineRulesService.remove(schoolId, id);
  }
}
