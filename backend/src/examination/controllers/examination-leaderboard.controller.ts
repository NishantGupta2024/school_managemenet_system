import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { ExaminationLeaderboardService } from '../services/examination-leaderboard.service';
import { QueryLeaderboardDto } from '../dto/query-leaderboard.dto';
import { UpdateLeaderboardPrivacyDto } from '../dto/update-leaderboard-privacy.dto';

@Controller('examination')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExaminationLeaderboardController {
  constructor(
    private readonly leaderboardService: ExaminationLeaderboardService,
  ) {}

  /**
   * GET /api/v1/examination/student/assessments/:assessmentId/leaderboard
   * Student leaderboard endpoint.
   */
  @Get('student/assessments/:assessmentId/leaderboard')
  @UseGuards(TenantGuard)
  @Roles(UserRole.STUDENT)
  getStudentLeaderboard(
    @Request() req: any,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Query() query: QueryLeaderboardDto,
  ) {
    const schoolId = req.school?.id ?? req.user?.schoolId;
    return this.leaderboardService.getStudentLeaderboard(
      schoolId,
      assessmentId,
      query,
      req.user,
    );
  }

  /**
   * GET /api/v1/examination/parent/students/:studentId/assessments/:assessmentId/leaderboard
   * Parent leaderboard endpoint.
   */
  @Get('parent/students/:studentId/assessments/:assessmentId/leaderboard')
  @UseGuards(TenantGuard)
  @Roles(UserRole.PARENT)
  getParentLeaderboard(
    @Request() req: any,
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Query() query: QueryLeaderboardDto,
  ) {
    const schoolId = req.school?.id ?? req.user?.schoolId;
    return this.leaderboardService.getParentLeaderboard(
      schoolId,
      studentId,
      assessmentId,
      query,
      req.user,
    );
  }

  /**
   * GET /api/v1/examination/assessments/:assessmentId/leaderboard
   * Teacher & School Admin leaderboard endpoint.
   */
  @Get('assessments/:assessmentId/leaderboard')
  @UseGuards(TenantGuard)
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN)
  getStaffLeaderboard(
    @Request() req: any,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Query() query: QueryLeaderboardDto,
  ) {
    const schoolId = req.school?.id ?? req.user?.schoolId;
    return this.leaderboardService.getStaffLeaderboard(
      schoolId,
      assessmentId,
      query,
      req.user,
    );
  }

  /**
   * GET /api/v1/examination/settings/leaderboard-privacy
   * School Admin privacy settings read.
   */
  @Get('settings/leaderboard-privacy')
  @UseGuards(TenantGuard)
  @Roles(UserRole.SCHOOL_ADMIN)
  getLeaderboardPrivacySetting(@Request() req: any) {
    const schoolId = req.school?.id ?? req.user?.schoolId;
    return this.leaderboardService.getLeaderboardPrivacySetting(
      schoolId,
      req.user,
    );
  }

  /**
   * PATCH /api/v1/examination/settings/leaderboard-privacy
   * School Admin privacy settings update.
   */
  @Patch('settings/leaderboard-privacy')
  @UseGuards(TenantGuard)
  @Roles(UserRole.SCHOOL_ADMIN)
  updateLeaderboardPrivacySetting(
    @Request() req: any,
    @Body() dto: UpdateLeaderboardPrivacyDto,
  ) {
    const schoolId = req.school?.id ?? req.user?.schoolId;
    return this.leaderboardService.updateLeaderboardPrivacySetting(
      schoolId,
      dto,
      req.user,
    );
  }

  /**
   * GET /api/v1/examination/platform/leaderboard/metrics
   * Platform Super Admin aggregate monitoring.
   */
  @Get('platform/leaderboard/metrics')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN)
  getPlatformLeaderboardMetrics(@Request() req: any) {
    return this.leaderboardService.getPlatformLeaderboardMetrics(req.user);
  }
}
