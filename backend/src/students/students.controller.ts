import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { StudentsService } from './students.service';
import { FeeGenerationService } from '../fee-generation/fee-generation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('students')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly feeGenerationService: FeeGenerationService,
  ) {}

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

  @Get(':studentId/fee-statement')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
    UserRole.STUDENT,
    UserRole.PARENT,
  )
  async getFeeStatement(
    @Param('studentId') studentId: string,
    @Request() req: any,
    @Query('academicYearId') academicYearId?: string,
  ) {
    const schoolId = req.school.id;
    const user = req.user;
    return this.feeGenerationService.getStudentFeeStatement(
      schoolId,
      user,
      studentId,
      academicYearId,
    );
  }

  @Get(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async findOne(@Param('id') id: string, @Request() req: any) {
    const schoolId = req.school.id;
    return this.studentsService.findOneForSchool(schoolId, id);
  }
}
