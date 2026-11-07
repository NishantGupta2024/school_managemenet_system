import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { ExaminationStudentAttemptsService } from '../services/examination-student-attempts.service';

@Controller('examination/parent')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ExaminationParentController {
  constructor(
    private readonly studentAttemptsService: ExaminationStudentAttemptsService,
  ) {}

  @Get('students/:studentId/assessments')
  @Roles(UserRole.PARENT)
  getParentStudentAssessments(
    @Request() req: any,
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ) {
    const schoolId = req.school?.id ?? req.user?.schoolId;
    return this.studentAttemptsService.getParentStudentAssessments(
      schoolId,
      studentId,
      req.user,
    );
  }

  @Get('students/:studentId/assessments/:assessmentId/result')
  @Roles(UserRole.PARENT)
  getParentAssessmentResult(
    @Request() req: any,
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ) {
    const schoolId = req.school?.id ?? req.user?.schoolId;
    return this.studentAttemptsService.getParentAssessmentResult(
      schoolId,
      studentId,
      assessmentId,
      req.user,
    );
  }
}
