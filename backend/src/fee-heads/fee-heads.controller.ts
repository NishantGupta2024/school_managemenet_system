import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { FeeHeadsService } from './fee-heads.service';
import { CreateFeeHeadDto } from './dto/create-fee-head.dto';
import { UpdateFeeHeadDto } from './dto/update-fee-head.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { FeeHeadCategory, FeeHeadStatus, UserRole } from '@prisma/client';

@Controller('fee-heads')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class FeeHeadsController {
  constructor(private readonly feeHeadsService: FeeHeadsService) {}

  @Post()
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async create(@Request() req: any, @Body() createDto: CreateFeeHeadDto) {
    const schoolId = req.school.id;
    return this.feeHeadsService.create(schoolId, createDto);
  }

  @Get()
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async findAll(
    @Request() req: any,
    @Query('category') category?: FeeHeadCategory,
    @Query('status') status?: FeeHeadStatus,
    @Query('isOptional') isOptional?: string,
  ) {
    const schoolId = req.school.id;
    const parsedIsOptional =
      isOptional === undefined ? undefined : isOptional === 'true' || isOptional === '1';

    return this.feeHeadsService.findAll(schoolId, {
      category,
      status,
      isOptional: parsedIsOptional,
    });
  }

  @Get(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async findOne(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.feeHeadsService.findOne(schoolId, id);
  }

  @Patch(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateFeeHeadDto,
  ) {
    const schoolId = req.school.id;
    return this.feeHeadsService.update(schoolId, id, updateDto);
  }

  @Delete(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async remove(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.feeHeadsService.remove(schoolId, id);
  }
}
