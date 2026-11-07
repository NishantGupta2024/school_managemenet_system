import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { ExaminationStudentAttemptsService } from '../services/examination-student-attempts.service';
import { ExaminationProgressionService } from '../services/examination-progression.service';
import { SaveAnswerDto } from '../dto/save-answer.dto';

@Controller('examination/student')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ExaminationStudentAttemptsController {
  constructor(
    private readonly studentAttemptsService: ExaminationStudentAttemptsService,
    private readonly progressionService: ExaminationProgressionService,
  ) {}

  @Get('chapters/:chapterId/progression')
  @Roles(UserRole.STUDENT)
  getChapterProgression(
    @Request() req: any,
    @Param('chapterId', new ParseUUIDPipe()) chapterId: string,
  ) {
    return this.progressionService.getChapterProgression(
      req.user.schoolId,
      chapterId,
      req.user,
    );
  }

  @Get('assessments')
  @Roles(UserRole.STUDENT)
  listAssessments(@Request() req: any) {
    return this.studentAttemptsService.listAssessmentsForStudent(
      req.user.schoolId,
      req.user,
    );
  }

  @Get('assessments/:assessmentId/result')
  @Roles(UserRole.STUDENT)
  getAssessmentResult(
    @Request() req: any,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ) {
    return this.studentAttemptsService.getStudentAssessmentResult(
      req.user.schoolId,
      assessmentId,
      req.user,
    );
  }

  @Post('assessments/:assessmentId/start')
  @Roles(UserRole.STUDENT)
  startAssessment(
    @Request() req: any,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ) {
    return this.studentAttemptsService.startAssessment(
      req.user.schoolId,
      assessmentId,
      req.user,
    );
  }

  @Get('attempts/:attemptId')
  @Roles(UserRole.STUDENT)
  getAttempt(
    @Request() req: any,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.studentAttemptsService.getAttempt(
      req.user.schoolId,
      attemptId,
      req.user,
    );
  }

  @Put('attempts/:attemptId/answers/:questionId')
  @Roles(UserRole.STUDENT)
  saveAnswer(
    @Request() req: any,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: SaveAnswerDto,
  ) {
    return this.studentAttemptsService.saveAnswer(
      req.user.schoolId,
      attemptId,
      questionId,
      dto,
      req.user,
    );
  }

  @Post('attempts/:attemptId/submit')
  @Roles(UserRole.STUDENT)
  submitAttempt(
    @Request() req: any,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.studentAttemptsService.submitAttempt(
      req.user.schoolId,
      attemptId,
      req.user,
    );
  }
}
