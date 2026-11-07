import {
  Body,
  Controller,
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
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { SchoolsService } from './schools.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { UpdateSchoolStatusDto } from './dto/update-school-status.dto';
import { ListSchoolsDto } from './dto/list-schools.dto';
import { ProvisionSchoolAdminDto } from './dto/provision-school-admin.dto';
import { ListSchoolAdminsDto } from './dto/list-school-admins.dto';
import { SuspendSchoolAdminDto } from './dto/suspend-school-admin.dto';
import { ActivateSchoolAdminDto } from './dto/activate-school-admin.dto';
import { CreateSchoolAdminDto } from './dto/create-school-admin.dto';

@Controller('schools')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PLATFORM_SUPER_ADMIN)
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  // -------------------------------------------------------------
  // Platform Super Admin: School Administrator Account Management
  // -------------------------------------------------------------

  @Get('administrators')
  async findAllAdmins(@Query() query: ListSchoolAdminsDto) {
    return this.schoolsService.findAllAdmins(query);
  }

  @Get('administrators/:adminId')
  async findAdminProfile(@Param('adminId') adminId: string) {
    return this.schoolsService.findAdminProfile(adminId);
  }

  @Post(':id/administrators')
  @HttpCode(HttpStatus.CREATED)
  async createAdminForSchool(
    @Param('id') schoolId: string,
    @Body() dto: CreateSchoolAdminDto,
    @Request() req: any,
  ) {
    const actorId = req.user?.id || req.user?.sub;
    return this.schoolsService.createAdminForSchool(schoolId, dto, actorId);
  }

  @Patch('administrators/:adminId/suspend')
  async suspendAdmin(
    @Param('adminId') adminId: string,
    @Body() dto: SuspendSchoolAdminDto,
    @Request() req: any,
  ) {
    const actorId = req.user?.id || req.user?.sub;
    return this.schoolsService.suspendAdmin(adminId, dto, actorId);
  }

  @Patch('administrators/:adminId/activate')
  async activateAdmin(
    @Param('adminId') adminId: string,
    @Body() dto: ActivateSchoolAdminDto,
    @Request() req: any,
  ) {
    const actorId = req.user?.id || req.user?.sub;
    return this.schoolsService.activateAdmin(adminId, dto, actorId);
  }

  @Post('administrators/:adminId/reset-password')
  @HttpCode(HttpStatus.OK)
  async initiatePasswordReset(
    @Param('adminId') adminId: string,
    @Request() req: any,
  ) {
    const actorId = req.user?.id || req.user?.sub;
    return this.schoolsService.initiatePasswordReset(adminId, actorId);
  }

  // -------------------------------------------------------------
  // Core School Tenant Management
  // -------------------------------------------------------------

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createSchoolDto: CreateSchoolDto) {
    return this.schoolsService.create(createSchoolDto);
  }

  @Get()
  async findAll(@Query() query: ListSchoolsDto) {
    return this.schoolsService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.schoolsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateSchoolDto: UpdateSchoolDto,
  ) {
    return this.schoolsService.update(id, updateSchoolDto);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateSchoolStatusDto,
  ) {
    return this.schoolsService.updateStatus(id, updateStatusDto);
  }

  @Post(':id/admins')
  @HttpCode(HttpStatus.CREATED)
  async provisionAdmin(
    @Param('id') id: string,
    @Body() provisionDto: ProvisionSchoolAdminDto,
  ) {
    return this.schoolsService.provisionInitialAdmin(id, provisionDto);
  }
}
