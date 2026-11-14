import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Request,
  Res,
  StreamableFile,
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
import { RecordViolationEventDto } from '../dto/record-violation-event.dto';
import {
  PreflightCompleteDto,
  StudentExplanationDto,
  UploadSampleDto,
} from '../dto/preflight-check.dto';

@Controller('examination/student')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ExaminationStudentAttemptsController {
  constructor(
    private readonly studentAttemptsService: ExaminationStudentAttemptsService,
    private readonly progressionService: ExaminationProgressionService,
  ) {}

  @Get('chapters')
  @Roles(UserRole.STUDENT)
  listChapters(@Request() req: any) {
    return this.progressionService.listChaptersForStudent(
      req.user.schoolId,
      req.user,
    );
  }

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

  /**
   * POST /api/v1/examination/student/preflight/network-check
   * Lightweight latency & throughput round-trip diagnostic check.
   */
  @Post('preflight/network-check')
  @Roles(UserRole.STUDENT)
  networkCheck(@Body() body: any) {
    return {
      receivedAt: new Date().toISOString(),
      payloadSize: typeof body?.data === 'string' ? body.data.length : 0,
    };
  }

  /**
   * GET /api/v1/examination/student/preflight/ping
   * Lightweight ping probe for round-trip latency measurement.
   */
  @Get('preflight/ping')
  @Roles(UserRole.STUDENT)
  ping() {
    return {
      receivedAt: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/examination/student/preflight/download-sample
   * 250 KB binary payload for measuring client download throughput.
   */
  @Get('preflight/download-sample')
  @Roles(UserRole.STUDENT)
  downloadSample(@Res({ passthrough: true }) res: any) {
    const buffer = this.studentAttemptsService.getDownloadSampleBuffer();
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    return new StreamableFile(buffer);
  }

  /**
   * POST /api/v1/examination/student/preflight/upload-sample
   * 64 KB probe for measuring client upload throughput.
   */
  @Post('preflight/upload-sample')
  @Roles(UserRole.STUDENT)
  uploadSample(@Body() dto: UploadSampleDto) {
    const bytesReceived = Buffer.byteLength(dto.data, 'utf8');
    return {
      receivedBytes: bytesReceived,
      receivedAt: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/examination/student/attempts/:attemptId/preflight-complete
   * Mark preflight checks complete and persist hardware/network diagnostic info.
   */
  @Post('attempts/:attemptId/preflight-complete')
  @Roles(UserRole.STUDENT)
  completePreflight(
    @Request() req: any,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() dto: PreflightCompleteDto,
  ) {
    return this.studentAttemptsService.completePreflightCheck(
      req.user.schoolId,
      attemptId,
      dto,
      req.user,
    );
  }

  /**
   * POST /api/v1/examination/student/attempts/:attemptId/events
   * Ingest a proctoring violation event (fullscreen exit, tab blur, etc.).
   */
  @Post('attempts/:attemptId/events')
  @Roles(UserRole.STUDENT)
  recordViolation(
    @Request() req: any,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() dto: RecordViolationEventDto,
  ) {
    return this.studentAttemptsService.recordViolationEvent(
      req.user.schoolId,
      attemptId,
      dto,
      req.user,
    );
  }

  /**
   * POST /api/v1/examination/student/attempts/:attemptId/explanation
   * Record student explanation if flagged for potential violations.
   */
  @Post('attempts/:attemptId/explanation')
  @Roles(UserRole.STUDENT)
  recordExplanation(
    @Request() req: any,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() dto: StudentExplanationDto,
  ) {
    return this.studentAttemptsService.recordStudentExplanation(
      req.user.schoolId,
      attemptId,
      dto,
      req.user,
    );
  }
}
