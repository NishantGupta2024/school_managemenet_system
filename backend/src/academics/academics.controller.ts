import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AcademicsService } from './academics.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('academics')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class AcademicsController {
  constructor(private readonly academicsService: AcademicsService) {}

  // =========================================================================
  // ACADEMIC YEARS
  // =========================================================================

  @Get('academic-years')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
    UserRole.TEACHER,
    UserRole.STUDENT,
    UserRole.PARENT,
  )
  async getAcademicYears(@Request() req: any) {
    const schoolId = req.school.id;
    return this.academicsService.findAcademicYears(schoolId);
  }

  @Get('academic-years/:id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF, UserRole.TEACHER)
  async getAcademicYearById(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.academicsService.findAcademicYearById(schoolId, id);
  }

  @Post('academic-years')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async createAcademicYear(@Request() req: any, @Body() dto: CreateAcademicYearDto) {
    const schoolId = req.school.id;
    return this.academicsService.createAcademicYear(schoolId, dto);
  }

  @Patch('academic-years/:id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async updateAcademicYear(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAcademicYearDto,
  ) {
    const schoolId = req.school.id;
    return this.academicsService.updateAcademicYear(schoolId, id, dto);
  }

  @Post('academic-years/:id/set-current')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async setCurrentAcademicYear(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.academicsService.setCurrentAcademicYear(schoolId, id);
  }

  @Delete('academic-years/:id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async deleteAcademicYear(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.academicsService.deleteAcademicYear(schoolId, id);
  }

  // =========================================================================
  // GRADES / CLASSES
  // =========================================================================

  @Get('grades')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
    UserRole.TEACHER,
    UserRole.STUDENT,
    UserRole.PARENT,
  )
  async getGrades(@Request() req: any) {
    const schoolId = req.school.id;
    return this.academicsService.findGrades(schoolId);
  }

  @Get('grades/:id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF, UserRole.TEACHER)
  async getGradeById(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.academicsService.findGradeById(schoolId, id);
  }

  @Post('grades')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async createGrade(@Request() req: any, @Body() dto: CreateGradeDto) {
    const schoolId = req.school.id;
    return this.academicsService.createGrade(schoolId, dto);
  }

  @Patch('grades/:id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async updateGrade(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateGradeDto,
  ) {
    const schoolId = req.school.id;
    return this.academicsService.updateGrade(schoolId, id, dto);
  }

  @Delete('grades/:id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async deleteGrade(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.academicsService.deleteGrade(schoolId, id);
  }

  // =========================================================================
  // SECTIONS
  // =========================================================================

  @Get('sections/:id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF, UserRole.TEACHER)
  async getSectionById(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.academicsService.findSectionById(schoolId, id);
  }

  @Post('grades/:gradeId/sections')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async createSection(
    @Request() req: any,
    @Param('gradeId') gradeId: string,
    @Body() dto: CreateSectionDto,
  ) {
    const schoolId = req.school.id;
    return this.academicsService.createSection(schoolId, gradeId, dto);
  }

  @Patch('sections/:id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async updateSection(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateSectionDto,
  ) {
    const schoolId = req.school.id;
    return this.academicsService.updateSection(schoolId, id, dto);
  }

  @Delete('sections/:id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async deleteSection(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.academicsService.deleteSection(schoolId, id);
  }
}
