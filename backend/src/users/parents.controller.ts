import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { UsersService } from './users.service';
import { CreateParentDto } from './dto/create-parent.dto';
import { LinkStudentParentDto } from './dto/link-student-parent.dto';

@Controller('parents')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ParentsController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
  async listParents(@Request() req: any) {
    const schoolId = req.school.id;
    return this.usersService.listParents(schoolId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async createParent(@Request() req: any, @Body() dto: CreateParentDto) {
    const schoolId = req.school.id;
    return this.usersService.createParent(schoolId, dto);
  }

  @Post(':parentId/students/:studentId')
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

  @Delete(':parentId/students/:studentId')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async unlinkParentStudent(
    @Request() req: any,
    @Param('parentId') parentId: string,
    @Param('studentId') studentId: string,
  ) {
    const schoolId = req.school.id;
    return this.usersService.unlinkParentStudent(schoolId, parentId, studentId);
  }
}
