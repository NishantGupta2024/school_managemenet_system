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
import { FeeStructuresService } from './fee-structures.service';
import { CreateFeeStructureDto } from './dto/create-fee-structure.dto';
import { UpdateFeeStructureDto } from './dto/update-fee-structure.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { FeeStructureStatus, UserRole } from '@prisma/client';

@Controller('fee-structures')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class FeeStructuresController {
  constructor(private readonly feeStructuresService: FeeStructuresService) {}

  @Post()
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async create(@Request() req: any, @Body() createDto: CreateFeeStructureDto) {
    const schoolId = req.school.id;
    return this.feeStructuresService.create(schoolId, createDto);
  }

  @Get()
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async findAll(
    @Request() req: any,
    @Query('academicYearId') academicYearId?: string,
    @Query('gradeId') gradeId?: string,
    @Query('status') status?: FeeStructureStatus,
  ) {
    const schoolId = req.school.id;
    return this.feeStructuresService.findAll(schoolId, {
      academicYearId,
      gradeId,
      status,
    });
  }

  @Get(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async findOne(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.feeStructuresService.findOne(schoolId, id);
  }

  @Patch(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateFeeStructureDto,
  ) {
    const schoolId = req.school.id;
    return this.feeStructuresService.update(schoolId, id, updateDto);
  }

  @Delete(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async remove(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.feeStructuresService.remove(schoolId, id);
  }
}
