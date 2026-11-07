import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { FeeGenerationService } from '../fee-generation/fee-generation.service';
import { UsersService } from '../users/users.service';
import { ProvisionStudentAccountDto } from '../users/dto/provision-student-account.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { QueryStudentsDto } from './dto/query-students.dto';
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
    private readonly usersService: UsersService,
  ) {}

  @Get('unlinked')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async getUnlinkedStudents(@Request() req: any) {
    const schoolId = req.school.id;
    return this.usersService.getUnlinkedStudents(schoolId);
  }

  @Post(':studentId/account')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async provisionStudentAccount(
    @Request() req: any,
    @Param('studentId') studentId: string,
    @Body() dto: ProvisionStudentAccountDto,
  ) {
    const schoolId = req.school.id;
    return this.usersService.provisionStudentAccount(schoolId, studentId, dto);
  }

  @Get()
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async findAll(@Request() req: any, @Query() query: QueryStudentsDto) {
    const schoolId = req.school.id;
    return this.studentsService.findStudents(schoolId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async createStudent(@Request() req: any, @Body() dto: CreateStudentDto) {
    const schoolId = req.school.id;
    return this.studentsService.createStudent(schoolId, dto);
  }

  @Get('meta/grades')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async findGrades(@Request() req: any) {
    const schoolId = req.school.id;
    return this.studentsService.findGradesForSchool(schoolId);
  }

  @Get('meta/academic-years')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
    UserRole.STUDENT,
    UserRole.PARENT,
  )
  async findAcademicYears(@Request() req: any) {
    const schoolId = req.school.id;
    return this.studentsService.findAcademicYearsForSchool(schoolId);
  }

  @Get('accessible')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
    UserRole.STUDENT,
    UserRole.PARENT,
  )
  async findAccessible(@Request() req: any) {
    const schoolId = req.school.id;
    const user = req.user;
    return this.studentsService.findAccessibleStudents(schoolId, user);
  }

  @Get('me/fee-statement')
  @Roles(UserRole.STUDENT, UserRole.PARENT)
  async getMyFeeStatement(
    @Request() req: any,
    @Query('academicYearId') academicYearId?: string,
  ) {
    const schoolId = req.school.id;
    const user = req.user;
    const students = await this.studentsService.findAccessibleStudents(schoolId, user);
    if (students.length === 0) {
      throw new NotFoundException(
        user.role === UserRole.STUDENT
          ? 'No student profile linked to your user account'
          : 'No verified student profiles linked to your parent account',
      );
    }

    return this.feeGenerationService.getStudentFeeStatement(
      schoolId,
      user,
      students[0].id,
      academicYearId,
    );
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

  @Get(':id/profile')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async getProfile(@Param('id') id: string, @Request() req: any) {
    const schoolId = req.school.id;
    return this.studentsService.getStudentProfile(schoolId, id);
  }

  @Patch(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async updateStudent(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateStudentDto,
  ) {
    const schoolId = req.school.id;
    return this.studentsService.updateStudent(schoolId, id, dto);
  }

  @Get(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async findOne(@Param('id') id: string, @Request() req: any) {
    const schoolId = req.school.id;
    return this.studentsService.findOneForSchool(schoolId, id);
  }
}
