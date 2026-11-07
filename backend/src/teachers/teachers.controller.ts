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
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { TeachersService } from './teachers.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { QueryTeachersDto } from './dto/query-teachers.dto';
import { AssignTeacherDto } from './dto/assign-teacher.dto';
import { ProvisionTeacherAccountDto } from './dto/provision-teacher-account.dto';

const TEACHER_ROLE = UserRole.TEACHER;

@Controller('teachers')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get('meta/departments')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF, TEACHER_ROLE)
  async getDepartments(@Request() req: any) {
    const schoolId = req.school.id;
    return this.teachersService.getDepartments(schoolId);
  }

  @Get()
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF, TEACHER_ROLE)
  async findAll(@Request() req: any, @Query() query: QueryTeachersDto) {
    const schoolId = req.school.id;
    return this.teachersService.findAll(schoolId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async createTeacher(@Request() req: any, @Body() dto: CreateTeacherDto) {
    const schoolId = req.school.id;
    return this.teachersService.createTeacher(schoolId, dto);
  }

  @Get(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF, TEACHER_ROLE)
  async findOne(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.teachersService.findOne(schoolId, id);
  }

  @Patch(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async updateTeacher(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateTeacherDto,
  ) {
    const schoolId = req.school.id;
    return this.teachersService.updateTeacher(schoolId, id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async deactivateTeacher(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.teachersService.deactivateTeacher(schoolId, id);
  }

  @Delete(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async deleteTeacher(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.teachersService.deleteTeacher(schoolId, id);
  }

  @Post(':id/assignments')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async assignTeacher(
    @Request() req: any,
    @Param('id') teacherId: string,
    @Body() dto: AssignTeacherDto,
  ) {
    const schoolId = req.school.id;
    return this.teachersService.assignTeacher(schoolId, teacherId, dto);
  }

  @Delete(':id/assignments/:assignmentId')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async removeAssignment(
    @Request() req: any,
    @Param('id') teacherId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    const schoolId = req.school.id;
    return this.teachersService.removeAssignment(schoolId, teacherId, assignmentId);
  }

  @Post(':id/account')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async provisionAccount(
    @Request() req: any,
    @Param('id') teacherId: string,
    @Body() dto: ProvisionTeacherAccountDto,
  ) {
    const schoolId = req.school.id;
    return this.teachersService.provisionTeacherAccount(schoolId, teacherId, dto);
  }
}
