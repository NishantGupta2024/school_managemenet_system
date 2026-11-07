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
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { AttendanceService } from './attendance.service';
import { GetRegisterQueryDto } from './dto/get-register-query.dto';
import { BulkMarkAttendanceDto } from './dto/bulk-mark-attendance.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { StudentHistoryQueryDto } from './dto/student-history-query.dto';

@Controller('attendance')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /**
   * GET /api/v1/attendance/register
   * Fetch daily student roster merged with marks or virtual NOT_MARKED status.
   */
  @Get('register')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
    UserRole.TEACHER,
  )
  async getRegister(@Request() req: any, @Query() query: GetRegisterQueryDto) {
    const schoolId = req.school.id;
    return this.attendanceService.getRegister(schoolId, query, req.user);
  }

  /**
   * POST /api/v1/attendance/register/bulk-mark
   * Atomically mark attendance for a section in a transaction.
   * Excludes FEE_STAFF: only School Admin and assigned Teachers can mark.
   */
  @Post('register/bulk-mark')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  async bulkMarkAttendance(
    @Request() req: any,
    @Body() dto: BulkMarkAttendanceDto,
  ) {
    const schoolId = req.school.id;
    return this.attendanceService.bulkMarkAttendance(schoolId, dto, req.user);
  }

  /**
   * PATCH /api/v1/attendance/:id
   * Correct an existing attendance mark with mandatory reason and audit entry.
   */
  @Patch(':id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  async correctAttendance(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CorrectAttendanceDto,
  ) {
    const schoolId = req.school.id;
    return this.attendanceService.correctAttendance(schoolId, id, dto, req.user);
  }

  /**
   * GET /api/v1/attendance/students/:studentId
   * Fetch attendance history and statistics for a student.
   */
  @Get('students/:studentId')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
    UserRole.TEACHER,
  )
  async getStudentHistory(
    @Request() req: any,
    @Param('studentId') studentId: string,
    @Query() query: StudentHistoryQueryDto,
  ) {
    const schoolId = req.school.id;
    return this.attendanceService.getStudentHistory(schoolId, studentId, query, req.user);
  }
}
