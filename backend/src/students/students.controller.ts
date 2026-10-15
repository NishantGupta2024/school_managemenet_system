import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('students')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async findAll(@Request() req: any) {
    // School ID is safely derived from validated tenant context
    const schoolId = req.school.id;
    return this.studentsService.findAllForSchool(schoolId);
  }

  @Get('meta/grades')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async findGrades(@Request() req: any) {
    const schoolId = req.school.id;
    return this.studentsService.findGradesForSchool(schoolId);
  }

  @Get('meta/academic-years')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async findAcademicYears(@Request() req: any) {
    const schoolId = req.school.id;
    return this.studentsService.findAcademicYearsForSchool(schoolId);
  }

  @Get(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async findOne(@Param('id') id: string, @Request() req: any) {
    const schoolId = req.school.id;
    return this.studentsService.findOneForSchool(schoolId, id);
  }
}
