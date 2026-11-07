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
import { StudentAllocationsService } from './student-allocations.service';
import { CreateStudentAllocationDto } from './dto/create-student-allocation.dto';
import { UpdateStudentAllocationDto } from './dto/update-student-allocation.dto';
import { BulkStudentAllocationDto } from './dto/bulk-student-allocation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { AllocationStatus, UserRole } from '@prisma/client';

@Controller('student-allocations')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class StudentAllocationsController {
  constructor(private readonly studentAllocationsService: StudentAllocationsService) {}

  @Post()
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async create(@Request() req: any, @Body() createDto: CreateStudentAllocationDto) {
    const schoolId = req.school.id;
    const currentUserId = req.user.id;
    return this.studentAllocationsService.create(schoolId, currentUserId, createDto);
  }

  @Post('bulk')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async bulkCreate(@Request() req: any, @Body() bulkDto: BulkStudentAllocationDto) {
    const schoolId = req.school.id;
    const currentUserId = req.user.id;
    return this.studentAllocationsService.bulkCreate(schoolId, currentUserId, bulkDto);
  }

  @Get()
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async findAll(
    @Request() req: any,
    @Query('academicYearId') academicYearId?: string,
    @Query('gradeId') gradeId?: string,
    @Query('studentId') studentId?: string,
    @Query('status') status?: AllocationStatus,
  ) {
    const schoolId = req.school.id;
    return this.studentAllocationsService.findAll(schoolId, {
      academicYearId,
      gradeId,
      studentId,
      status,
    });
  }

  @Get(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async findOne(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.studentAllocationsService.findOne(schoolId, id);
  }

  @Patch(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateStudentAllocationDto,
  ) {
    const schoolId = req.school.id;
    const currentUserId = req.user.id;
    return this.studentAllocationsService.update(schoolId, currentUserId, id, updateDto);
  }

  @Delete(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async remove(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.studentAllocationsService.remove(schoolId, id);
  }
}
