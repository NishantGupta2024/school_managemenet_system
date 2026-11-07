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
import { UsersService } from './users.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ProvisionStudentAccountDto } from './dto/provision-student-account.dto';
import { CreateParentDto } from './dto/create-parent.dto';
import { LinkStudentParentDto } from './dto/link-student-parent.dto';
import { ListUsersDto } from './dto/list-users.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Request() req: any) {
    const schoolId = req.school.id;
    return this.usersService.findOne(schoolId, req.user.id);
  }

  @Get('students/unlinked')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async getUnlinkedStudents(@Request() req: any) {
    const schoolId = req.school.id;
    return this.usersService.getUnlinkedStudents(schoolId);
  }

  @Get('parents')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async listParents(@Request() req: any) {
    const schoolId = req.school.id;
    return this.usersService.listParents(schoolId);
  }

  @Get()
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async findAll(@Request() req: any, @Query() query: ListUsersDto) {
    const schoolId = req.school.id;
    return this.usersService.findAll(schoolId, query);
  }

  @Get(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async findOne(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.usersService.findOne(schoolId, id);
  }

  @Post('staff')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async createStaff(@Request() req: any, @Body() dto: CreateStaffDto) {
    const schoolId = req.school.id;
    return this.usersService.createStaff(schoolId, dto);
  }

  @Post('students/:studentId/account')
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

  @Post('parents')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async createParent(@Request() req: any, @Body() dto: CreateParentDto) {
    const schoolId = req.school.id;
    return this.usersService.createParent(schoolId, dto);
  }

  @Post('parents/:parentId/students/:studentId')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async linkParentStudent(
    @Request() req: any,
    @Param('parentId') parentId: string,
    @Param('studentId') studentId: string,
    @Body() dto: LinkStudentParentDto,
  ) {
    const schoolId = req.school.id;
    return this.usersService.linkParentStudent(schoolId, parentId, studentId, dto);
  }

  @Delete('parents/:parentId/students/:studentId')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async unlinkParentStudent(
    @Request() req: any,
    @Param('parentId') parentId: string,
    @Param('studentId') studentId: string,
  ) {
    const schoolId = req.school.id;
    return this.usersService.unlinkParentStudent(schoolId, parentId, studentId);
  }

  @Patch(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async updateUser(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const schoolId = req.school.id;
    return this.usersService.updateUser(schoolId, id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async updateStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    const schoolId = req.school.id;
    const currentUserId = req.user.id;
    return this.usersService.updateStatus(schoolId, id, currentUserId, dto);
  }
}
